import path from 'node:path';
import type * as TS from 'typescript';
import type { Context, ContextFile, Symbol, Relationship, Unresolved, Analysis } from '../contracts.mjs';
import { decodeAnalysis } from './decode.mjs';
import { isRecord, present, message } from './values.mjs';
import { importDependency } from './dependencies.mjs';
const [{ default: ts }, { default: PhpParser }] = await Promise.all([importDependency('typescript'), importDependency('php-parser')]);
import { hash, assertEvidence, validateContext } from './core.mjs';

interface Owner { symbol?: Symbol | undefined; cls?: string | undefined }
interface JsImport { local?: string; exported?: string; spec: string }
interface PhpImport { local: string; full: string }
interface BaseUnit { file: ContextFile; declarations: Map<string, Symbol>; owners: Map<object, Owner> }
interface JsUnit extends BaseUnit {
  language: 'javascript'; ast: TS.SourceFile; imports: JsImport[]; classes: Map<string, Symbol>;
  declarationNodes: Map<TS.Node, Symbol>; checker: TS.TypeChecker;
}
interface PhpUnit extends BaseUnit { language: 'php'; ast: unknown; imports: PhpImport[]; namespace: string }
type Unit = JsUnit | PhpUnit;
const stable=(kind: string,...parts: (string | number)[]): string=>`${kind}-${hash(parts.join(':')).slice(0,16)}`;
const walk=(node: unknown,fn: (node: Record<string,unknown>) => void): void=>{if(!isRecord(node))return;fn(node);for(const [key,value] of Object.entries(node)){if(['loc','parent','symbol','locals'].includes(key))continue;if(Array.isArray(value)){const items: unknown[]=value;items.forEach(x=>walk(x,fn));}else if(value&&typeof value==='object')walk(value,fn);}};
const phpName=(node: unknown): string=>typeof node==='string'?node:isRecord(node)?typeof node.name==='string'?node.name:typeof node.value==='string'?node.value:'':'';
function phpLine(node: Record<string, unknown>, side: string): number | undefined {
  const location=isRecord(node.loc)?node.loc[side]:undefined;
  return isRecord(location)&&typeof location.line==='number'?location.line:undefined;
}
const jsExtensions=/\.[cm]?[jt]sx?$/i;
function importTarget(files: ContextFile[],from: string,spec: string): ContextFile | undefined{
  if(!spec.startsWith('.'))return undefined;
  const base=path.posix.normalize(path.posix.join(path.posix.dirname(from),spec));
  return files.find(f=>[base,...['.js','.jsx','.ts','.tsx','.mjs','.cjs','/index.js','/index.ts','/index.jsx','/index.tsx'].map(ext=>base+ext)].includes(f.path));
}

/** Deterministic, conservative structure from captured source. Dynamic calls stay unresolved. */
export async function analyzeStructure(original: Context): Promise<Context>{
  validateContext(original);const context=structuredClone(original),symbols: Symbol[]=[],relationships: Relationship[]=[],unresolved: Unresolved[]=[],units: Unit[]=[];
  // Recompute extractor evidence/edges on reruns; preserve authored or verified graph evidence.
  context.evidence=context.evidence.filter(e=>!e.id.startsWith('symbol-'));
  const addSymbol=(file: ContextFile,name: string,kind: string,startLine: number,endLine: number,extra: Partial<Pick<Symbol,'className' | 'qualifiedName' | 'exportedName'>>={}): Symbol=>{
    const id=stable('symbol',file.path,name,startLine,kind),evidenceId=id+'-source';
    const parent=context.evidence.find(e=>e.fileId===file.id&&e.side==='head');
    context.evidence.push({id:evidenceId,fileId:file.id,side:'head',startLine,endLine,...(parent?.url?{url:parent.url.replace(/#.*$/,'')+`#L${startLine}-L${endLine}`}:{})});
    const symbol={id,fileId:file.id,name,kind,startLine,endLine,evidenceIds:[evidenceId],...extra};symbols.push(symbol);return symbol;
  };
  for(const file of context.files){
    if(typeof file.content!=='string')continue;if(file.selectedRange){context.limitations.push(file.path+': structural extraction omitted for selected line range; only selected source is retained');continue;}
    if(jsExtensions.test(file.path)){
      const extension=path.posix.extname(file.path).toLowerCase();
      const scriptKind=extension==='.tsx'?ts.ScriptKind.TSX:extension==='.jsx'?ts.ScriptKind.JSX:/^\.[cm]?ts$/.test(extension)?ts.ScriptKind.TS:ts.ScriptKind.JS;
      const ast=ts.createSourceFile(file.path,file.content,ts.ScriptTarget.Latest,true,scriptKind);
      const diagnostics: unknown=Reflect.get(ast,'parseDiagnostics');
      if(Array.isArray(diagnostics)&&diagnostics.length){context.limitations.push(`${file.path}: parser diagnostics; structure omitted`);continue;}
      context.limitations=context.limitations.filter(item=>item!==`${file.path}: parser diagnostics; structure omitted`);
      const imports: JsImport[]=[],declarations=new Map<string,Symbol>(),owners=new Map<object,Owner>(),classes=new Map<string,Symbol>(),declarationNodes=new Map<TS.Node,Symbol>();
      const loc=(n: TS.Node): [number,number]=>[ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1,ast.getLineAndCharacterOfPosition(n.end).line+1];
      const visit=(node: TS.Node,owner?: Symbol,cls?: string): void=>{
        let current=owner,className=cls;
        if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)){
          const spec=node.moduleSpecifier.text,clause=node.importClause;
          if(clause?.name)imports.push({local:clause.name.text,exported:'default',spec});
          if(clause?.namedBindings){if(ts.isNamespaceImport(clause.namedBindings))imports.push({local:clause.namedBindings.name.text,exported:'*',spec});else for(const e of clause.namedBindings.elements)imports.push({local:e.name.text,exported:e.propertyName?.text||e.name.text,spec});}
          if(!clause)imports.push({spec});
        }
        if(ts.isClassDeclaration(node)&&node.name){className=node.name.text;current=addSymbol(file,className,'class',...loc(node),{exportedName:node.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword)?'default':className});classes.set(className,current);declarations.set(className,current);declarationNodes.set(node,current);}
        else if((ts.isFunctionDeclaration(node)||ts.isMethodDeclaration(node)||ts.isConstructorDeclaration(node))&&(node.name||ts.isConstructorDeclaration(node))){
          const simple=ts.isConstructorDeclaration(node)?'constructor':present(node.name).getText(ast);const name=ts.isMethodDeclaration(node)||ts.isConstructorDeclaration(node)?`${cls||'object'}.${simple}`:simple;
          current=addSymbol(file,name,ts.isFunctionDeclaration(node)?'function':'method',...loc(node),{...(cls?{className:cls}:{}),exportedName:node.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword)?'default':simple});declarations.set(name,current);declarationNodes.set(node,current);
        }else if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer&&(ts.isArrowFunction(node.initializer)||ts.isFunctionExpression(node.initializer))){current=addSymbol(file,node.name.text,'function',...loc(node));declarations.set(node.name.text,current);declarationNodes.set(node,current);}
        owners.set(node,{symbol:current,cls:className});ts.forEachChild(node,child=>visit(child,current,className));
      };visit(ast);
      const host=ts.createCompilerHost({allowJs:true,noResolve:true,noLib:true});host.getSourceFile=name=>name===file.path?ast:undefined;host.fileExists=name=>name===file.path;host.readFile=name=>name===file.path?file.content:undefined;
      const checker=ts.createProgram([file.path],{allowJs:true,noResolve:true,noLib:true},host).getTypeChecker();
      units.push({file,ast,imports,declarations,owners,classes,declarationNodes,checker,language:'javascript'});
    }else if(/\.php$/i.test(file.path)){
      try{
        const parser=new PhpParser({parser:{extractDoc:true,suppressErrors:false},ast:{withPositions:true}}),ast: unknown=parser.parseCode(file.content,file.path),imports: PhpImport[]=[],declarations=new Map<string,Symbol>(),owners=new Map<object,Owner>();let namespace='';
        const visit=(node: unknown,owner?: Symbol,cls?: string): void=>{
          if(!isRecord(node))return;let current=owner,className=cls;
          const kind=typeof node.kind==='string'?node.kind:'';
          if(kind==='namespace')namespace=phpName(node.name);
          if(kind==='usegroup'&&Array.isArray(node.items)){
            const items: unknown[]=node.items;
            for(const item of items){if(!isRecord(item))continue;const full=[phpName(node.name),phpName(item.name)].filter(Boolean).join('\\');imports.push({local:phpName(item.alias)||full.split('\\').pop()||'',full:full.replace(/^\\/, '')});}
          }
          if(['class','interface','trait','enum'].includes(kind)&&node.name){className=phpName(node.name);current=addSymbol(file,className,'class',present(phpLine(node,'start')),present(phpLine(node,'end')),{qualifiedName:[namespace,className].filter(Boolean).join('\\')});declarations.set(className,current);}
          else if(['method','function'].includes(kind)&&node.name){const simple=phpName(node.name),name=kind==='method'?`${cls}.${simple}`:simple;current=addSymbol(file,name,kind==='method'?'method':'function',present(phpLine(node,'start')),present(phpLine(node,'end')),{...(cls?{className:cls}:{}),qualifiedName:[namespace,name].filter(Boolean).join('\\')});declarations.set(name,current);}
          owners.set(node,{symbol:current,cls:className});for(const [key,value] of Object.entries(node)){if(key==='loc')continue;if(Array.isArray(value)){const items: unknown[]=value;items.forEach(x=>visit(x,current,className));}else if(value&&typeof value==='object')visit(value,current,className);}
        };visit(ast);units.push({file,ast,imports,declarations,owners,namespace,language:'php'});
      }catch(error){context.limitations.push(`${file.path}: PHP structure unavailable (${message(error).split('\n')[0]})`);}
    }
  }
  const edge=(unit: Unit,target: Symbol | ContextFile | undefined,kind: string,fromSymbol: Symbol | undefined,label: string,sourceEvidence?: string[]): boolean=>{
    if(!target)return false;const fromEvidence=sourceEvidence||fromSymbol?.evidenceIds||context.evidence.filter(e=>e.fileId===unit.file.id&&e.side==='head').slice(0,1).map(e=>e.id),toEvidence='evidenceIds' in target?target.evidenceIds:context.evidence.filter(e=>e.fileId===target.id&&e.side==='head').slice(0,1).map(e=>e.id);
    if(!fromEvidence.length||!toEvidence.length)return false;
    const fileId='fileId' in target?target.fileId:target.id;
    const value={id:stable('edge',unit.file.id,fileId,kind,fromSymbol?.id||'',target.id),fromFileId:unit.file.id,toFileId:fileId,kind,label,evidenceIds:[...new Set([...fromEvidence,...toEvidence])],provenance:'source-ast',...(fromSymbol?{fromSymbolId:fromSymbol.id}:{}),...('fileId' in target?{toSymbolId:target.id}:{})};
    if(!relationships.some(e=>e.id===value.id))relationships.push(value);return true;
  };
  const importedJs=(unit: JsUnit,local: string,member?: string): Symbol | undefined=>{const imp=unit.imports.find(i=>i.local===local),target=imp&&importTarget(context.files,unit.file.path,imp.spec);if(!target||!imp)return undefined;const name=member||imp.exported;return symbols.find(s=>s.fileId===target.id&&(s.name===name||s.exportedName===name));};
  const jsBinding=(unit: JsUnit,expr: TS.Identifier,member?: string): Symbol | undefined=>{const bound=unit.checker.getSymbolAtLocation(expr),decls=bound?.declarations||[];for(const declaration of decls){const local=unit.declarationNodes.get(declaration);if(local&&!member)return local;if(ts.isImportSpecifier(declaration)||ts.isImportClause(declaration)||ts.isNamespaceImport(declaration))return importedJs(unit,expr.text,member);}return undefined;};
  const importedPhp=(unit: PhpUnit,name: string): Symbol | undefined=>{const first=name.replace(/^\\/,'').split('\\')[0]||'',imp=unit.imports.find(i=>i.local.toLowerCase()===first.toLowerCase());const full=name.startsWith('\\')?name.slice(1):imp?name.replace(first,imp.full):[unit.namespace,name].filter(Boolean).join('\\');return symbols.find(s=>s.kind==='class'&&s.qualifiedName?.toLowerCase()===full.toLowerCase());};
  for(const unit of units){
    if(unit.language==='javascript'){
      for(const imp of unit.imports){const target=importTarget(context.files,unit.file.path,imp.spec);if(target)edge(unit,target,'imports',undefined,`imports ${imp.spec}`);}
      const visit=(node: TS.Node): void=>{
        if(ts.isCallExpression(node)||ts.isNewExpression(node)){
          const {symbol,cls}=unit.owners.get(node)||{},expr=node.expression;let target: Symbol | undefined;
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
      for(const imp of unit.imports){const target=importedPhp(unit,imp.local);if(target)edge(unit,target,'imports',undefined,`imports ${imp.full}`);}
      walk(unit.ast,node=>{
        if(node.kind!=='call'&&node.kind!=='new')return;const {symbol,cls}=unit.owners.get(node)||{};let target: Symbol | undefined,expression='';const what=isRecord(node.what)?node.what:undefined;
        if(node.kind==='new'){expression=phpName(what);target=importedPhp(unit,expression);}
        else if(what?.kind==='name'||what?.kind==='identifier'){expression=phpName(what);target=unit.declarations.get(expression);}
        else if(what&&(what.kind==='propertylookup'||what.kind==='staticlookup')){const method=phpName(what.offset),base=phpName(what.what);expression=`${base}->${method}`;if(base==='this'||base==='self'||base==='static')target=unit.declarations.get(`${cls}.${method}`);else if(what.kind==='staticlookup'){const klass=importedPhp(unit,base);target=klass&&symbols.find(s=>s.fileId===klass.fileId&&s.name===`${klass.name}.${method}`);}}
        if(!edge(unit,target,node.kind==='new'?'constructs':'calls',symbol,`${node.kind==='new'?'constructs':'calls'} ${expression}`)&&symbol)unresolved.push({fileId:unit.file.id,fromSymbolId:symbol.id,expression:expression||'dynamic PHP call',line:phpLine(node,'start'),reason:'Dynamic, external, or unavailable target',evidenceIds:symbol.evidenceIds});
      });
    }
  }
  context.schemaVersion=2;context.symbols=symbols.sort((a,b)=>a.id.localeCompare(b.id));context.relationships=[...(context.relationships||[]).filter(e=>e.provenance!=='source-ast'),...relationships].sort((a,b)=>a.id.localeCompare(b.id));context.unresolved=unresolved;context.limitations=[...new Set(context.limitations)];context.provenance={...context.provenance,structure:'source-ast: JavaScript/TypeScript/JSX and PHP; dynamic calls unresolved'};
  return validateContext(context);
}

export function validateAnalysis(context: Context,value: unknown): Analysis{
  validateContext(context);
  const analysis=decodeAnalysis(value);
  validateContext(context);
  if(analysis?.schemaVersion!==2||!analysis.title||!analysis.summary||!Array.isArray(analysis.topics)||!analysis.topics.length||!Array.isArray(analysis.flows)||!Array.isArray(analysis.fileCoverage)||!Array.isArray(analysis.limitations))throw Error('Analysis requires schemaVersion 2, topics, flows, file coverage and limitations');
  assertEvidence(context,analysis.evidenceIds);const topicIds=new Set(),flowIds=new Set();
  for(const topic of analysis.topics){if(!topic.id||topicIds.has(topic.id)||!topic.title||!topic.summary)throw Error('Invalid/duplicate analysis topic');topicIds.add(topic.id);assertEvidence(context,topic.evidenceIds);for(const key of ['reviewFocus','extensionPoints'] as const){if(!Array.isArray(topic[key]))throw Error(`Topic requires ${key}`);for(const claim of topic[key]){if(!claim.text)throw Error('Analysis claim requires text');assertEvidence(context,claim.evidenceIds);}}}
  for(const flow of analysis.flows){if(!flow.id||flowIds.has(flow.id)||!flow.title||!Array.isArray(flow.steps)||!flow.steps.length)throw Error('Invalid/duplicate flow');flowIds.add(flow.id);assertEvidence(context,flow.evidenceIds);for(const step of flow.steps){if(!step.text)throw Error('Flow step requires text');assertEvidence(context,step.evidenceIds);if(step.symbolIds?.some(id=>!context.symbols?.some(s=>s.id===id)))throw Error('Unknown flow symbol');}}
  const covered=new Set();for(const item of analysis.fileCoverage){if(covered.has(item.fileId)||!context.files.some(f=>f.id===item.fileId)||!['substantive','supporting','omitted'].includes(item.role)||!item.reason||!Array.isArray(item.topicIds)||item.topicIds.some(id=>!topicIds.has(id)))throw Error('Invalid file coverage');if(item.role==='substantive'&&!item.topicIds.length)throw Error('Substantive file coverage requires topics');covered.add(item.fileId);}
  for(const file of context.files.filter(f=>f.role!=='context'&&f.status!=='context'))if(!covered.has(file.id))throw Error(`Missing file coverage: ${file.path}`);
  return analysis;
}
