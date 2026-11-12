import path from 'node:path';
import { importDependency } from './dependencies.mjs';
const [{ default: ts }, { default: PhpParser }] = await Promise.all([importDependency('typescript'), importDependency('php-parser')]);
import { hash, assertEvidence, validateContext } from './core.mjs';

const stable=(kind,...parts)=>`${kind}-${hash(parts.join(':')).slice(0,16)}`;
const walk=(node,fn)=>{if(!node||typeof node!=='object')return;fn(node);for(const [key,value] of Object.entries(node)){if(['loc','parent','symbol','locals'].includes(key))continue;if(Array.isArray(value))value.forEach(x=>walk(x,fn));else if(value&&typeof value==='object')walk(value,fn);}};
const phpName=node=>typeof node==='string'?node:node?.name||node?.value||'';
const jsExtensions=/\.[cm]?[jt]sx?$/i;
function importTarget(files,from,spec){
  if(!spec.startsWith('.'))return undefined;
  const base=path.posix.normalize(path.posix.join(path.posix.dirname(from),spec));
  return files.find(f=>[base,...['.js','.jsx','.ts','.tsx','.mjs','.cjs','/index.js','/index.ts','/index.jsx','/index.tsx'].map(ext=>base+ext)].includes(f.path));
}

/** Deterministic, conservative structure from captured source. Dynamic calls stay unresolved. */
export async function analyzeStructure(original){
  validateContext(original);const context=structuredClone(original),symbols=[],relationships=[],unresolved=[],units=[];
  // Recompute extractor evidence/edges on reruns; preserve authored or verified graph evidence.
  context.evidence=context.evidence.filter(e=>!e.id.startsWith('symbol-'));
  const addSymbol=(file,name,kind,startLine,endLine,extra={})=>{
    const id=stable('symbol',file.path,name,startLine,kind),evidenceId=id+'-source';
    const parent=context.evidence.find(e=>e.fileId===file.id&&e.side==='head');
    context.evidence.push({id:evidenceId,fileId:file.id,side:'head',startLine,endLine,...(parent?.url?{url:parent.url.replace(/#.*$/,'')+`#L${startLine}-L${endLine}`}:{})});
    const symbol={id,fileId:file.id,name,kind,startLine,endLine,evidenceIds:[evidenceId],...extra};symbols.push(symbol);return symbol;
  };
  for(const file of context.files){
    if(typeof file.content!=='string')continue;if(file.selectedRange){context.limitations.push(file.path+': structural extraction omitted for selected line range; only selected source is retained');continue;}
    if(jsExtensions.test(file.path)){
      const ast=ts.createSourceFile(file.path,file.content,ts.ScriptTarget.Latest,true,/x$/.test(file.path)?ts.ScriptKind.TSX:ts.ScriptKind.JS);
      if(ast.parseDiagnostics.length){context.limitations.push(`${file.path}: parser diagnostics; structure omitted`);continue;}
      const imports=[],declarations=new Map(),owners=new Map(),classes=new Map(),declarationNodes=new Map();
      const loc=n=>[ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1,ast.getLineAndCharacterOfPosition(n.end).line+1];
      const visit=(node,owner,cls)=>{
        let current=owner,className=cls;
        if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)){
          const spec=node.moduleSpecifier.text,clause=node.importClause;
          if(clause?.name)imports.push({local:clause.name.text,exported:'default',spec});
          if(clause?.namedBindings){if(ts.isNamespaceImport(clause.namedBindings))imports.push({local:clause.namedBindings.name.text,exported:'*',spec});else for(const e of clause.namedBindings.elements)imports.push({local:e.name.text,exported:e.propertyName?.text||e.name.text,spec});}
          if(!clause)imports.push({spec});
        }
        if(ts.isClassDeclaration(node)&&node.name){className=node.name.text;current=addSymbol(file,className,'class',...loc(node),{exportedName:node.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword)?'default':className});classes.set(className,current);declarations.set(className,current);declarationNodes.set(node,current);}
        else if((ts.isFunctionDeclaration(node)||ts.isMethodDeclaration(node)||ts.isConstructorDeclaration(node))&&(node.name||ts.isConstructorDeclaration(node))){
          const simple=ts.isConstructorDeclaration(node)?'constructor':node.name.getText(ast);const name=ts.isMethodDeclaration(node)||ts.isConstructorDeclaration(node)?`${cls||'object'}.${simple}`:simple;
          current=addSymbol(file,name,ts.isFunctionDeclaration(node)?'function':'method',...loc(node),{...(cls?{className:cls}:{}),exportedName:node.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword)?'default':simple});declarations.set(name,current);declarationNodes.set(node,current);
        }else if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer&&(ts.isArrowFunction(node.initializer)||ts.isFunctionExpression(node.initializer))){current=addSymbol(file,node.name.text,'function',...loc(node));declarations.set(node.name.text,current);declarationNodes.set(node,current);}
        owners.set(node,{symbol:current,cls:className});ts.forEachChild(node,child=>visit(child,current,className));
      };visit(ast);
      const host=ts.createCompilerHost({allowJs:true,noResolve:true,noLib:true});host.getSourceFile=name=>name===file.path?ast:undefined;host.fileExists=name=>name===file.path;host.readFile=name=>name===file.path?file.content:undefined;
      const checker=ts.createProgram([file.path],{allowJs:true,noResolve:true,noLib:true},host).getTypeChecker();
      units.push({file,ast,imports,declarations,owners,classes,declarationNodes,checker,language:'javascript'});
    }else if(/\.php$/i.test(file.path)){
      try{
        const parser=new PhpParser({parser:{extractDoc:true,suppressErrors:false},ast:{withPositions:true}}),ast=parser.parseCode(file.content,file.path),imports=[],declarations=new Map(),owners=new Map();let namespace='';
        const visit=(node,owner,cls)=>{
          if(!node||typeof node!=='object')return;let current=owner,className=cls;
          if(node.kind==='namespace')namespace=phpName(node.name);
          if(node.kind==='usegroup')for(const item of node.items||[]){const full=[node.name,phpName(item.name)].filter(Boolean).join('\\');imports.push({local:phpName(item.alias)||full.split('\\').pop(),full:full.replace(/^\\/, '')});}
          if(['class','interface','trait','enum'].includes(node.kind)&&node.name){className=phpName(node.name);current=addSymbol(file,className,'class',node.loc.start.line,node.loc.end.line,{qualifiedName:[namespace,className].filter(Boolean).join('\\')});declarations.set(className,current);}
          else if(['method','function'].includes(node.kind)&&node.name){const simple=phpName(node.name),name=node.kind==='method'?`${cls}.${simple}`:simple;current=addSymbol(file,name,node.kind==='method'?'method':'function',node.loc.start.line,node.loc.end.line,{...(cls?{className:cls}:{}),qualifiedName:[namespace,name].filter(Boolean).join('\\')});declarations.set(name,current);}
          owners.set(node,{symbol:current,cls:className});for(const [key,value] of Object.entries(node)){if(key==='loc')continue;if(Array.isArray(value))value.forEach(x=>visit(x,current,className));else if(value&&typeof value==='object')visit(value,current,className);}
        };visit(ast);units.push({file,ast,imports,declarations,owners,namespace,language:'php'});
      }catch(error){context.limitations.push(`${file.path}: PHP structure unavailable (${error.message.split('\n')[0]})`);}
    }
  }
  const edge=(unit,target,kind,fromSymbol,label,sourceEvidence)=>{
    if(!target)return false;const fromEvidence=sourceEvidence||fromSymbol?.evidenceIds||context.evidence.filter(e=>e.fileId===unit.file.id&&e.side==='head').slice(0,1).map(e=>e.id),toEvidence=target.evidenceIds||context.evidence.filter(e=>e.fileId===target.id&&e.side==='head').slice(0,1).map(e=>e.id);
    if(!fromEvidence.length||!toEvidence.length)return false;
    const value={id:stable('edge',unit.file.id,target.fileId||target.id,kind,fromSymbol?.id||'',target.id),fromFileId:unit.file.id,toFileId:target.fileId||target.id,kind,label,evidenceIds:[...new Set([...fromEvidence,...toEvidence])],provenance:'source-ast',...(fromSymbol?{fromSymbolId:fromSymbol.id}:{}),...(target.fileId?{toSymbolId:target.id}:{})};
    if(!relationships.some(e=>e.id===value.id))relationships.push(value);return true;
  };
  const importedJs=(unit,local,member)=>{const imp=unit.imports.find(i=>i.local===local),target=imp&&importTarget(context.files,unit.file.path,imp.spec);if(!target)return;const name=member||imp.exported;return symbols.find(s=>s.fileId===target.id&&(s.name===name||s.exportedName===name));};
  const jsBinding=(unit,expr,member)=>{const bound=unit.checker.getSymbolAtLocation(expr),decls=bound?.declarations||[];for(const declaration of decls){const local=unit.declarationNodes.get(declaration);if(local&&!member)return local;if(ts.isImportSpecifier(declaration)||ts.isImportClause(declaration)||ts.isNamespaceImport(declaration))return importedJs(unit,expr.text,member);}return undefined;};
  const importedPhp=(unit,name)=>{const first=name.replace(/^\\/,'').split('\\')[0],imp=unit.imports.find(i=>i.local.toLowerCase()===first.toLowerCase());const full=name.startsWith('\\')?name.slice(1):imp?name.replace(first,imp.full):[unit.namespace,name].filter(Boolean).join('\\');return symbols.find(s=>s.kind==='class'&&s.qualifiedName?.toLowerCase()===full.toLowerCase());};
  for(const unit of units){
    for(const imp of unit.imports){const target=unit.language==='javascript'?importTarget(context.files,unit.file.path,imp.spec):importedPhp(unit,imp.local);if(target)edge(unit,target,'imports',undefined,`imports ${imp.spec||imp.full}`);}
    if(unit.language==='javascript'){
      const visit=node=>{
        if(ts.isCallExpression(node)||ts.isNewExpression(node)){
          const {symbol,cls}=unit.owners.get(node)||{},expr=node.expression;let target;
          if(ts.isIdentifier(expr))target=jsBinding(unit,expr);
          else if(ts.isPropertyAccessExpression(expr)){
            if(expr.expression.kind===ts.SyntaxKind.ThisKeyword&&cls)target=unit.declarations.get(`${cls}.${expr.name.text}`);
            else if(ts.isIdentifier(expr.expression))target=jsBinding(unit,expr.expression,expr.name.text);
          }
          const kind=ts.isNewExpression(node)?'constructs':'calls';
          if(!edge(unit,target,kind,symbol,`${kind} ${expr.getText(unit.ast)}`)&&symbol)unresolved.push({fileId:unit.file.id,fromSymbolId:symbol.id,expression:expr.getText(unit.ast),line:unit.ast.getLineAndCharacterOfPosition(node.getStart(unit.ast)).line+1,reason:'Dynamic, external, or unavailable target',evidenceIds:symbol.evidenceIds});
        }ts.forEachChild(node,visit);
      };visit(unit.ast);
    }else{
      walk(unit.ast,node=>{
        if(!['call','new'].includes(node.kind))return;const {symbol,cls}=unit.owners.get(node)||{};let target,expression='';const what=node.what;
        if(node.kind==='new'){expression=phpName(what);target=importedPhp(unit,expression);}
        else if(what?.kind==='name'||what?.kind==='identifier'){expression=phpName(what);target=unit.declarations.get(expression);}
        else if(['propertylookup','staticlookup'].includes(what?.kind)){const method=phpName(what.offset),base=phpName(what.what);expression=`${base}->${method}`;if(base==='this'||base==='self'||base==='static')target=unit.declarations.get(`${cls}.${method}`);else if(what.kind==='staticlookup'){const klass=importedPhp(unit,base);target=klass&&symbols.find(s=>s.fileId===klass.fileId&&s.name===`${klass.name}.${method}`);}}
        if(!edge(unit,target,node.kind==='new'?'constructs':'calls',symbol,`${node.kind==='new'?'constructs':'calls'} ${expression}`)&&symbol)unresolved.push({fileId:unit.file.id,fromSymbolId:symbol.id,expression:expression||'dynamic PHP call',line:node.loc?.start.line,reason:'Dynamic, external, or unavailable target',evidenceIds:symbol.evidenceIds});
      });
    }
  }
  context.schemaVersion=2;context.symbols=symbols.sort((a,b)=>a.id.localeCompare(b.id));context.relationships=[...(context.relationships||[]).filter(e=>e.provenance!=='source-ast'),...relationships].sort((a,b)=>a.id.localeCompare(b.id));context.unresolved=unresolved;context.limitations=[...new Set(context.limitations)];context.provenance={...context.provenance,structure:'source-ast: JavaScript/TypeScript/JSX and PHP; dynamic calls unresolved'};
  return validateContext(context);
}

export function validateAnalysis(context,analysis){
  validateContext(context);
  if(analysis?.schemaVersion!==2||!analysis.title||!analysis.summary||!Array.isArray(analysis.topics)||!analysis.topics.length||!Array.isArray(analysis.flows)||!Array.isArray(analysis.fileCoverage)||!Array.isArray(analysis.limitations))throw Error('Analysis requires schemaVersion 2, topics, flows, file coverage and limitations');
  assertEvidence(context,analysis.evidenceIds);const topicIds=new Set(),flowIds=new Set();
  for(const topic of analysis.topics){if(!topic.id||topicIds.has(topic.id)||!topic.title||!topic.summary)throw Error('Invalid/duplicate analysis topic');topicIds.add(topic.id);assertEvidence(context,topic.evidenceIds);for(const key of ['reviewFocus','extensionPoints']){if(!Array.isArray(topic[key]))throw Error(`Topic requires ${key}`);for(const claim of topic[key]){if(!claim.text)throw Error('Analysis claim requires text');assertEvidence(context,claim.evidenceIds);}}}
  for(const flow of analysis.flows){if(!flow.id||flowIds.has(flow.id)||!flow.title||!Array.isArray(flow.steps)||!flow.steps.length)throw Error('Invalid/duplicate flow');flowIds.add(flow.id);assertEvidence(context,flow.evidenceIds);for(const step of flow.steps){if(!step.text)throw Error('Flow step requires text');assertEvidence(context,step.evidenceIds);if(step.symbolIds?.some(id=>!context.symbols?.some(s=>s.id===id)))throw Error('Unknown flow symbol');}}
  const covered=new Set();for(const item of analysis.fileCoverage){if(covered.has(item.fileId)||!context.files.some(f=>f.id===item.fileId)||!['substantive','supporting','omitted'].includes(item.role)||!item.reason||!Array.isArray(item.topicIds)||item.topicIds.some(id=>!topicIds.has(id)))throw Error('Invalid file coverage');if(item.role==='substantive'&&!item.topicIds.length)throw Error('Substantive file coverage requires topics');covered.add(item.fileId);}
  for(const file of context.files.filter(f=>f.role!=='context'&&f.status!=='context'))if(!covered.has(file.id))throw Error(`Missing file coverage: ${file.path}`);
  return analysis;
}
