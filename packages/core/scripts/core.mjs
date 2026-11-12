import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat, realpath } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { importDependency, resolveDependency, ensureDependencies, withFileLock, runProcess } from './dependencies.mjs';

export const VERSION='0.2.0';
const exec=promisify(execFile);
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const jsonForHtml=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
export function safeName(value){
  const raw=String(value||'selection');const base=raw.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^\.+|\.+$/g,'').toLowerCase().slice(0,70)||'selection';
  const reserved=/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base);
  return base===raw&&!reserved&&base!=='.'&&base!=='..'?base:`${base}-${hash(raw).slice(0,8)}`;
}
export function parseArgs(args){
  const positional=[],options={};
  for(let i=0;i<args.length;i++){const arg=args[i];if(arg.startsWith('--')){const [key,value]=arg.slice(2).split(/=(.*)/s);if(value!==undefined)options[key]=value;else if(['draft','publish','working-tree','no-deps'].includes(key))options[key]=true;else {if(!args[i+1]||args[i+1].startsWith('--'))throw Error(`Missing value for --${key}`);options[key]=args[++i];}}else positional.push(arg);}
  return {positional,options};
}
export function parseTarget(args){
  const {positional:[kind,value,...rest],options}=parseArgs(args);
  if(kind==='pr'){
    let repo=options.repo,number=value;
    if(/^https?:/.test(value||'')){const match=/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)\/?$/.exec(value);if(!match)throw Error('Expected a GitHub pull request URL');repo=match[1];number=match[2];}
    if(!repo||!/^[-\w.]+\/[-\w.]+$/.test(repo))throw Error('PR number requires --repo owner/repo');
    if(!/^\d+$/.test(String(number))||Number(number)<1)throw Error('Invalid PR number');return {kind,repo,number:Number(number),...(options.head?{head:options.head}:{})};
  }
  if(kind==='branch'){if(!value||value.startsWith('-'))throw Error('Branch name required');return {kind,name:value,...(options.base?{base:options.base}:{})};}
  if(kind==='codebase')return {kind,name:'codebase'};
  if(kind==='docs'){
    const files=[...(options.files?options.files.split(','):[]),...rest];
    if(!files.length&&!options.text&&!options['text-file'])throw Error('docs requires --files, --text, or --text-file');
    return {kind,name:value||`selection-${hash(JSON.stringify(files)).slice(0,8)}`,files,...(options.text?{text:options.text}:{}),...(options['text-file']?{textFile:options['text-file']}:{})};
  }
  throw Error('Target must be pr, branch, codebase, or docs');
}
export function outputDirectory(root,target,skill){
  if(!/^[a-z][a-z0-9-]*$/.test(skill))throw Error('Invalid skill name');
  const scope=target.kind==='pr'?['pr',String(target.number)]:target.kind==='branch'?['branch',safeName(target.name)]:['docs',safeName(target.name||'codebase')];
  return path.join(path.resolve(root),'.code-unpacked',...scope,skill);
}
export function redact(text){
  return String(text).replace(/(?<![\w?&/])((?:api[_-]?key|consumer[_-]?key|(?:client[_-]?)?secret|password|passwd|access[_-]?token|auth[_-]?token|private[_-]?key|stripe[_-]?key)\s*["']?\s*(?:=>|=|:)\s*["'])([^"'\r\n]+)(["'])/gi,'$1[REDACTED]$3')
    .replace(/(define\(\s*["'][^"'\r\n]*(?:secret|password|token|api[_-]?key|consumer[_-]?key)[^"'\r\n]*["']\s*,\s*["'])([^"'\r\n]+)(["'])/gi,'$1[REDACTED]$3')
    .replace(/((?:Authorization\s*:\s*)?Bearer\s+)[a-z0-9._~+\/-]{16,}/gi,'$1[REDACTED]')
    .replace(/\b(?:sk_(?:live|test)_[a-zA-Z0-9]{12,}|gh[pousr]_[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{16})\b/g,'[REDACTED]')
    .replace(/(-----BEGIN [^-\r\n]*PRIVATE KEY-----)[\s\S]*?(-----END [^-\r\n]*PRIVATE KEY-----)/g,block=>block.split('\n').map((line,i,a)=>i===0||i===a.length-1?line:'[REDACTED]').join('\n'));
}
export async function run(command,args,options={}){return (await exec(command,args,{encoding:'utf8',maxBuffer:64*1024*1024,windowsHide:true,timeout:60000,...options})).stdout;}
const git=(root,args)=>run('git',['--no-pager',...args],{cwd:root});
async function gitBatch(root,specs,check=false){
  if(!specs.length)return Buffer.alloc(0);
  return new Promise((resolve,reject)=>{const child=spawn('git',['cat-file',check?'--batch-check':'--batch'],{cwd:root,windowsHide:true});const chunks=[];let size=0,error='';const timer=setTimeout(()=>child.kill(),60000);child.stdout.on('data',chunk=>{size+=chunk.length;if(size>64*1024*1024){child.kill();reject(Error('Source batch exceeds 64 MB'));}else chunks.push(chunk);});child.stderr.on('data',chunk=>error+=chunk.toString());child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve(Buffer.concat(chunks)):reject(Error(error||'git source batch failed or timed out'));});child.stdin.on('error',()=>{});child.stdin.end(specs.join('\n')+'\n');});
}
async function hydrateGitFiles(root,files,source){
  const requests=[];
  for(const file of files){if(excluded(file.path)){file.omission='Excluded sensitive/generated path';file.hunks=[];continue;}if(metadataOnly(file.path)){file.omission='Lockfile metadata only';file.hunks=[];continue;}for(const side of ['head','base']){if(side==='head'&&file.status==='deleted'||side==='base'&&file.status==='added')continue;requests.push({file,side,spec:`${source[side]}:${side==='base'?file.oldPath:file.path}`});}}
  const info=(await gitBatch(root,requests.map(r=>r.spec),true)).toString('utf8').trimEnd().split('\n');const readable=[];
  requests.forEach((request,index)=>{const line=info[index]||'';if(line.endsWith(' missing'))return;const size=Number(line.split(' ')[2]);if(!Number.isFinite(size))return;if(size>512000){request.file.omission='Source exceeds 512 KB';return;}readable.push(request);});
  const bytes=await gitBatch(root,readable.map(r=>r.spec));let offset=0;
  for(const request of readable){const end=bytes.indexOf(10,offset);if(end<0)throw Error('Truncated git source batch header');const header=bytes.subarray(offset,end).toString();const size=Number(header.split(' ')[2]);if(!Number.isFinite(size)||end+1+size>=bytes.length)throw Error('Truncated git source batch');const content=bytes.subarray(end+1,end+1+size);offset=end+1+size+1;if(content.includes(0)){request.file.binary=true;request.file.omission='Binary source';}else request.file[request.side==='head'?'content':'baseContent']=redact(content.toString('utf8'));}
}
const excluded=p=>/(^|\/)(?:node_modules|vendor|\.git|\.code-unpacked|dist|build|coverage|\.astro)(\/|$)/.test(p)||/(^|\/)\.env(?:$|\.(?!example$|dist$))/.test(p)||/\.(?:pem|key|p12|pfx)$/i.test(p);
const metadataOnly=p=>/(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|composer\.lock)$/.test(p);
export function parseDiff(diff){
  const files=[];let file,hunk,oldLine=0,newLine=0;
  for(const line of String(diff).split('\n')){
    if(line.startsWith('diff --git ')){
      const m=/^diff --git (?:"a\/(.*?)"|a\/(.*?)) (?:"b\/(.*?)"|b\/(.*))$/.exec(line);
      if(!m)continue;file={path:m[3]??m[4],oldPath:m[1]??m[2],status:'modified',hunks:[],binary:false};files.push(file);hunk=null;
    }else if(!file)continue;
    else if(line.startsWith('new file mode'))file.status='added';
    else if(line.startsWith('deleted file mode'))file.status='deleted';
    else if(line.startsWith('rename from ')){file.oldPath=line.slice(12);file.status='renamed';}
    else if(line.startsWith('rename to '))file.path=line.slice(10);
    else if(line.startsWith('Binary files ')||line==='GIT binary patch')file.binary=true;
    else if(line.startsWith('@@ ')){
      const m=/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/.exec(line);if(!m)continue;
      oldLine=Number(m[1]);newLine=Number(m[3]);hunk={header:line,oldStart:oldLine,newStart:newLine,lines:[]};file.hunks.push(hunk);
    }else if(hunk&&/^[ +\-]/.test(line)){
      const kind=line[0]==='+'?'add':line[0]==='-'?'remove':'context';
      hunk.lines.push({kind,text:redact(line.slice(1)),oldLine:kind==='add'?null:oldLine++,newLine:kind==='remove'?null:newLine++});
    }
  }return files;
}
function makeEvidence(files,source){
  const evidence=[];for(const file of files){
    file.id=file.id||`file-${hash(file.path).slice(0,12)}`;
    for(const side of ['head','base']){const content=side==='head'?file.content:file.baseContent;if(typeof content!=='string'||!content.length)continue;
      const count=content.replace(/\n$/,'').split('\n').length;const startLine=file.selectedRange?.[0]||1,endLine=file.selectedRange?.[1]||count;
      const sourcePath=side==='base'?(file.oldPath||file.path):file.path;
      const id=`${file.id}-${side}`;evidence.push({id,fileId:file.id,startLine,endLine,side,...(source.repo&&source[side]&&!(source.kind==='working-tree'&&source.dirty)?{url:`https://github.com/${source.repo}/blob/${source[side]}/${sourcePath.split('/').map(encodeURIComponent).join('/')}#L${startLine}-L${endLine}`}:{})});
    }
  }return evidence;
}
export function validateContext(context){
  if(![1,2].includes(context?.schemaVersion)||!context.target||!context.source||!Array.isArray(context.files)||!Array.isArray(context.evidence)||!Array.isArray(context.limitations))throw Error('Invalid context schemaVersion or required fields');
  const files=new Set();for(const file of context.files){if(!file.id||files.has(file.id)||!file.path)throw Error('Invalid/duplicate file');files.add(file.id);}
  const ids=new Set();for(const e of context.evidence){if(!e.id||ids.has(e.id)||!files.has(e.fileId))throw Error('Invalid/duplicate evidence reference');ids.add(e.id);if(e.url&&!/^https:\/\/github\.com\//.test(e.url))throw Error('Evidence URL must use HTTPS GitHub');if(!Number.isInteger(e.startLine)||e.startLine<1||!Number.isInteger(e.endLine)||e.endLine<e.startLine)throw Error('Invalid evidence range');const file=context.files.find(f=>f.id===e.fileId);const content=e.side==='base'?file.baseContent:file.content;if(typeof content!=='string'||e.endLine>content.replace(/\n$/,'').split('\n').length)throw Error('Evidence range outside source');}
  const symbolIds=new Set();for(const symbol of context.symbols||[]){if(!symbol.id||symbolIds.has(symbol.id)||!files.has(symbol.fileId)||!symbol.name)throw Error('Invalid/duplicate symbol');symbolIds.add(symbol.id);assertEvidence(context,symbol.evidenceIds);if(!symbol.evidenceIds.every(id=>context.evidence.find(e=>e.id===id)?.fileId===symbol.fileId))throw Error('Symbol evidence does not match file');}
  const edges=new Set();for(const edge of context.relationships||[]){if(!edge.id||edges.has(edge.id)||!files.has(edge.fromFileId)||!files.has(edge.toFileId))throw Error('Invalid/duplicate relationship');edges.add(edge.id);assertEvidence(context,edge.evidenceIds);if(edge.fromSymbolId&&!symbolIds.has(edge.fromSymbolId)||edge.toSymbolId&&!symbolIds.has(edge.toSymbolId))throw Error('Unknown relationship symbol');if(edge.provenance==='source-ast'&&![edge.fromFileId,edge.toFileId].every(fileId=>edge.evidenceIds.some(id=>context.evidence.find(e=>e.id===id)?.fileId===fileId)))throw Error('Relationship evidence needs both endpoints');}
  return context;
}
export function resolveEvidence(context,id){
  const e=context.evidence.find(item=>item.id===id);if(!e)throw Error(`Unknown evidence: ${id}`);const file=context.files.find(item=>item.id===e.fileId);if(!file)throw Error(`Missing evidence file: ${e.fileId}`);
  const content=e.side==='base'?file.baseContent:file.content;return {...e,path:file.path,text:String(content??'').split('\n').slice(e.startLine-1,e.endLine).join('\n')};
}
export function assertEvidence(context,ids){if(!Array.isArray(ids)||!ids.length)throw Error('At least one evidence reference required');for(const id of ids)resolveEvidence(context,id);}
export function citationHtml(context,ids=[]){return ids.map(id=>{const e=resolveEvidence(context,id);const label=`${e.path}:${e.startLine}–${e.endLine}`;return e.url?`<a href="${escapeHtml(e.url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`:`<span>${escapeHtml(label)} (local snapshot)</span>`;}).join(' · ');}
async function checkedPath(root,relative){
  const absolute=path.resolve(root,relative),boundary=path.resolve(root)+path.sep;
  if(!absolute.startsWith(boundary))throw Error('Selected path escapes outside repository');
  const real=await realpath(absolute);if(!real.startsWith(await realpath(root)+path.sep))throw Error('Selected symlink escapes outside repository');return real;
}
export async function captureLocal(target,root){
  root=path.resolve(root);const head=(await git(root,['rev-parse','HEAD'])).trim();let repo;
  try{const remote=(await git(root,['remote','get-url','origin'])).trim();repo=remote.match(/github\.com[:/]([^/]+\/.*?)(?:\.git)?$/)?.[1];}catch{}
  const source={head,repo,dirty:target.kind==='branch'?false:!!(await git(root,['status','--porcelain'])).trim(),kind:target.kind==='branch'?'git':'working-tree'};let files=[],limitations=[];
  if(target.kind==='branch'){
    const tip=(await git(root,['rev-parse','--verify',`${target.name}^{commit}`])).trim();let base=target.base;
    if(!base){try{base=(await git(root,['symbolic-ref','refs/remotes/origin/HEAD'])).trim();}catch{throw Error('Cannot discover default branch; pass --base');}}
    source.head=tip;source.base=(await git(root,['merge-base',base,tip])).trim();source.dirty=false;
    files=parseDiff(await git(root,['diff','--no-ext-diff','--no-textconv','--find-renames',source.base,tip,'--']));
    await hydrateGitFiles(root,files,source);
  }else{
    const selectors=target.kind==='docs'?target.files||[]:(await git(root,['ls-files','--cached','--others','--exclude-standard','-z'])).split('\0').filter(Boolean);
    for(const selector of selectors){const match=/^(.*?)(?::(\d+)(?:-(\d+))?)?$/.exec(selector);const relative=match[1].replace(/\\/g,'/');if(excluded(relative)){limitations.push(`Excluded ${relative}`);continue;}
      let absolute;try{absolute=await checkedPath(root,relative);}catch(error){
        if(target.kind!=='codebase'||error.code!=='ENOENT')throw error;
        const file={path:relative,oldPath:relative,status:'deleted',hunks:[]};
        const prior=await git(root,['show',`${head}:${relative}`]);source.base=head;
        if(prior.includes('\0')||Buffer.byteLength(prior)>512000||metadataOnly(relative))file.omission='Deleted binary/large/generated source metadata only';else file.baseContent=redact(prior);
        files.push(file);continue;
      }
      if(!(await stat(absolute)).isFile())throw Error(`Not a file: ${relative}`);const bytes=await readFile(absolute);const file={path:relative,status:'snapshot',hunks:[],sha256:hash(bytes)};
      if(bytes.includes(0)){file.binary=true;file.omission='Binary source';}else if(bytes.length>512000||metadataOnly(relative))file.omission='Large/generated source metadata only';else{file.content=redact(bytes.toString('utf8'));if(match[2]){const start=Number(match[2]),end=Number(match[3]||match[2]);if(start<1||end<start||end>file.content.replace(/\n$/,'').split('\n').length)throw Error(`Invalid selected range: ${selector}`);file.selectedRange=[start,end];file.content="\n".repeat(start-1)+file.content.split("\n").slice(start-1,end).join("\n");}}
      files.push(file);
    }
    if(target.textFile){const text=await readFile(await checkedPath(root,target.textFile),'utf8');files.push({path:'selected-code.txt',status:'snapshot',hunks:[],content:redact(text)});}
    if(target.text)files.push({path:'selected-code.txt',status:'snapshot',hunks:[],content:redact(target.text)});
  }
  for(const file of files)if(file.omission)limitations.push(`${file.path}: ${file.omission}`);
  const evidence=makeEvidence(files,source);return validateContext({schemaVersion:1,target,source,files,evidence,relationships:[],limitations,provenance:{method:'direct-source',graph:'not-supplied'}});
}
export async function capturePinnedPr(target,metadata,root){
  if(!/^[a-f0-9]{40}$/.test(metadata.head||'')||!/^[a-f0-9]{40}$/.test(metadata.base||''))throw Error('Pinned PR metadata requires full base/head commit SHAs');
  if(target.head&&target.head!==metadata.head)throw Error('Pinned PR head mismatch');
  const context=await captureLocal({kind:'branch',name:metadata.head,base:metadata.base},root);
  context.target=target;context.source={...context.source,repo:target.repo,title:metadata.title,url:metadata.url,state:metadata.state,baseRef:metadata.base};
  context.evidence=makeEvidence(context.files,context.source);context.provenance={method:'pinned-git-with-recorded-pr-metadata',graph:'not-supplied'};
  context.limitations.push('PR metadata is a recorded snapshot; this run does not assert that it remains the latest PR revision.');
  return validateContext(context);
}
/** Add explicitly requested unchanged source at the captured revision, never checkout files. */
export async function addContextFiles(original,root,paths){
  const context=structuredClone(original),added=[];
  for(const input of [...new Set(paths)]){
    const relative=input.replace(/\\/g,'/');
    if(!relative||relative.startsWith('/')||relative.split('/').some(part=>part==='..')||/^[a-z]:/i.test(relative))throw Error('Context path escapes repository');
    if(context.files.some(f=>f.path===relative))continue;
    if(excluded(relative)||metadataOnly(relative)){context.limitations.push(`${relative}: contextual source excluded`);continue;}
    const file={path:relative,oldPath:relative,status:'context',role:'context',hunks:[]};
    if(context.source.kind==='git')await hydrateGitFiles(root,[file],{head:context.source.head});
    else{const bytes=await readFile(await checkedPath(root,relative));if(bytes.includes(0)||bytes.length>512000)file.omission='Binary or large context source';else file.content=redact(bytes.toString('utf8'));}
    if(typeof file.content!=='string'){context.limitations.push(`${relative}: contextual source unavailable`);continue;}
    file.sha256=hash(file.content);added.push(file);
  }
  context.evidence.push(...makeEvidence(added,context.source));context.files.push(...added);return validateContext(context);
}
export async function expandImports(context,root,{limit=48}={}){
  if(!['pr','branch'].includes(context.target.kind))return context;
  const inventory=(await git(root,['ls-tree','-r','--name-only',context.source.head])).split('\n');const requested=new Set();
  for(const file of context.files.filter(f=>f.role!=='context')){
    for(const match of (file.content||'').matchAll(/(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g)){
      const base=path.posix.normalize(path.posix.join(path.posix.dirname(file.path),match[1]));
      const found=[base,...['.js','.jsx','.ts','.tsx','/index.js','/index.jsx','/index.ts'].map(ext=>base+ext)].find(name=>inventory.includes(name));if(found)requested.add(found);
    }
  }
  const missing=[...requested].filter(p=>!context.files.some(f=>f.path===p)).sort();const result=await addContextFiles(context,root,missing.slice(0,limit));if(missing.length>limit)result.limitations.push(`Import context limited to ${limit} files; ${missing.length-limit} omitted`);return result;
}
export async function capturePr(target,{root,loadJson}={}){
  const api=loadJson|| (async endpoint=>{
    if(endpoint===`repos/${target.repo}/pulls/${target.number}`){const pr=JSON.parse(await run('gh',['pr','view',String(target.number),'--repo',target.repo,'--json','title,baseRefOid,headRefOid,state,url']));return {head:{sha:pr.headRefOid},base:{sha:pr.baseRefOid},title:pr.title,state:pr.state,html_url:pr.url};}
    return JSON.parse(await run('gh',['api',endpoint]));
  });
  const info=await api(`repos/${target.repo}/pulls/${target.number}`);const head=target.head||info.head.sha;
  if(target.head&&info.head.sha!==target.head)throw Error('Requested PR head differs from current PR head; refusing mixed revisions');
  if(root&&!loadJson){
    let local=false;try{await git(root,['cat-file','-e',`${head}^{commit}`]);await git(root,['cat-file','-e',`${info.base.sha}^{commit}`]);local=true;}catch{}
    if(local){const context=await capturePinnedPr(target,{head,base:info.base.sha,title:info.title,url:info.html_url,state:info.state},root);const latest=await api(`repos/${target.repo}/pulls/${target.number}`);if(latest.head.sha!==head||latest.base.sha!==info.base.sha)throw Error('PR changed during capture; retry collection');context.limitations=context.limitations.filter(item=>!item.startsWith('PR metadata is a recorded snapshot'));context.provenance.method='github-cli-and-pinned-git';return context;}
  }
  const source={repo:target.repo,head,base:info.base.sha,kind:'git',dirty:false,url:info.html_url,title:info.title,state:info.state};
  const listed=[];for(let page=1;;page++){const batch=await api(`repos/${target.repo}/pulls/${target.number}/files?per_page=100&page=${page}`);if(!Array.isArray(batch))throw Error('Invalid PR file list');listed.push(...batch);if(batch.length<100)break;if(page>=30)throw Error('PR exceeds GitHub 3000-file limit; use local pinned git objects');}
  const files=[],limitations=[];
  for(const item of listed){const file={path:item.filename,oldPath:item.previous_filename||item.filename,status:({removed:'deleted',changed:'modified'})[item.status]||item.status,additions:item.additions,deletions:item.deletions,hunks:[],binary:false};
    if(excluded(file.path))file.omission='Excluded sensitive/generated path';else if(metadataOnly(file.path))file.omission='Lockfile metadata only';else{
      if(item.patch){const parsed=parseDiff(`diff --git a/${file.oldPath} b/${file.path}\n${item.patch}`)[0];file.hunks=parsed?.hunks||[];const actual=file.hunks.flatMap(h=>h.lines);if(actual.filter(l=>l.kind==='add').length!==item.additions||actual.filter(l=>l.kind==='remove').length!==item.deletions)limitations.push(`${file.path}: GitHub patch may be truncated; source snapshots are retained`);}
      for(const side of ['head','base']){if(side==='head'&&file.status==='deleted'||side==='base'&&file.status==='added')continue;try{
        let content;if(root){try{content=await git(root,['show',`${source[side]}:${side==='base'?file.oldPath:file.path}`]);}catch{}}
        if(content===undefined){const result=await api(`repos/${target.repo}/contents/${(side==='base'?file.oldPath:file.path).split('/').map(encodeURIComponent).join('/')}?ref=${source[side]}`);if(result.encoding!=='base64')throw Error('Source content unavailable');content=Buffer.from(result.content,'base64').toString('utf8');}
        if(content.includes('\0')){file.binary=true;file.omission='Binary source';}else if(Buffer.byteLength(content)>512000)file.omission='Source exceeds 512 KB';else file[side==='head'?'content':'baseContent']=redact(content);
      }catch(error){limitations.push(`${file.path} (${side}): source unavailable (${error.message.split('\n')[0]})`);}}
      if(!item.patch&&item.additions+item.deletions>0)limitations.push(`${file.path}: no patch supplied by GitHub`);
    }
    if(file.omission)limitations.push(`${file.path}: ${file.omission}`);files.push(file);
  }
  // Recheck after collection to prevent a moving PR from mixing revisions.
  const latest=await api(`repos/${target.repo}/pulls/${target.number}`);if(latest.head.sha!==head||latest.base.sha!==source.base)throw Error('PR changed during capture; retry collection');
  return validateContext({schemaVersion:1,target,source,files,evidence:makeEvidence(files,source),relationships:[],limitations,provenance:{method:'github-api-and-pinned-git',graph:'not-supplied'}});
}
export function renderShell({title,body,css='',script='',data,lang='en'}){
  return `<!doctype html><html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title><style>:root{color-scheme:dark;--bg:#10151f;--panel:#1a2333;--ink:#e9edf5;--muted:#aab8cf;--accent:#83d4ba}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.6 system-ui,sans-serif}a{color:var(--accent)}button,input,select{font:inherit}button{cursor:pointer;background:var(--panel);color:var(--ink);border:1px solid #52627c;border-radius:8px;padding:.5rem .9rem}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid var(--accent);outline-offset:3px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0b1019;padding:1rem;border-radius:8px;font:14px/1.55 ui-monospace,monospace}.muted{color:var(--muted)}.sources{font-size:13px;overflow-wrap:anywhere}${css}</style></head><body>${body}${data===undefined?'':`<script type="application/json" id="artifact-data">${jsonForHtml(data)}</script>`}${script?`<script type="module">${script}</script>`:''}</body></html>`;
}
export async function readJson(file){return JSON.parse(await readFile(file,'utf8'));}
export async function writeJson(file,value){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(value,null,2)+'\n');}
export const deliveryArtifacts=outputs=>outputs.filter(file=>!file.includes('/')&&!file.includes('\\')&&/\.(?:html|png|mp4|zip)$/i.test(file));
export function makeComment({skill,context,summary='',attachments=[],markdown=''}){
  return `<!-- code-unpacked:${skill} -->\n## Code Unpacked · ${skill}\n\n${summary}\n\nSource revision: \`${context.source.head}\`\n\n${markdown}${markdown?'\n\n':''}${attachments.length?'Local attachments to upload before posting:\n\n'+attachments.map(file=>`- \`${file}\``).join('\n')+'\n\nDownload the HTML attachment and open it locally.\n\n':''}${context.limitations?.length?'<details><summary>Source coverage limitations</summary>\n\n'+context.limitations.map(x=>`- ${redact(x)}`).join('\n')+'\n\n</details>\n':''}`;
}
export function validateUploads(artifacts,uploads){
  for(const item of artifacts){const limit=/\.(?:png|jpe?g|gif|svg|mp4|mov|webm)$/i.test(item.path)?10*1024*1024:25*1024*1024;if(!Number.isFinite(item.bytes)||item.bytes<0||item.bytes>limit)throw Error(`Attachment exceeds conservative GitHub size limit: ${item.path}`);if(!/^https:\/\/github\.com\/user-attachments\/(?:assets|files)\//.test(uploads?.[item.path]||''))throw Error(`Missing actual GitHub attachment URL: ${item.path}`);}
  return uploads;
}
export async function writeManifest(dir,{skill,context,outputs,status='complete',limitations=[],delivery={status:'draft'}}){
  const artifacts=[];for(const file of outputs){const absolute=path.resolve(dir,file);if(!absolute.startsWith(path.resolve(dir)+path.sep))throw Error('Artifact path escapes output directory');const bytes=await readFile(absolute);artifacts.push({path:file,bytes:bytes.length,sha256:hash(bytes)});}
  const manifest={schemaVersion:1,skill,version:VERSION,source:context.source,target:context.target,inputs:{contextHash:hash(JSON.stringify(context))},artifacts,status,limitations:[...(context.limitations||[]),...limitations],delivery};await writeJson(path.join(dir,'manifest.json'),manifest);return manifest;
}
export async function finishArtifact({dir,skill,context,outputs,summary='',markdown='',status='complete',limitations=[]}){
  await mkdir(dir,{recursive:true});await writeJson(path.join(dir,'comment-content.json'),{summary,markdown});await writeFile(path.join(dir,'comment.md'),makeComment({skill,context,summary,markdown,attachments:deliveryArtifacts(outputs)}));return writeManifest(dir,{skill,context,outputs:[...outputs,'comment.md','comment-content.json'],status,limitations});
}
export async function loadBrowser(){
  const { chromium } = await importDependency('playwright');
  try { return await chromium.launch({headless:true}); } catch {}
  try { return await chromium.launch({headless:true,channel:'chrome'}); } catch {}
  const directory = await ensureDependencies();
  return withFileLock(path.join(directory, 'browser.lock'), async () => {
    try { return await chromium.launch({headless:true}); } catch {}
    console.error('Code Unpacked: installing Chromium for browser exports (first use).');
    try {
      await runProcess(process.execPath, [path.join(path.dirname(await resolveDependency('playwright')), 'cli.js'), 'install', 'chromium']);
      return await chromium.launch({headless:true});
    } catch (error) { throw Error(`Chromium setup failed. Check network access and operating-system browser dependencies, then retry. ${error.message}`); }
  });
}
export async function renderMermaid(code,{browser:sharedBrowser}={}){
  const browser=sharedBrowser||await loadBrowser();const page=await browser.newPage();try{await page.setContent('<body><div id="diagram"></div></body>');await page.addScriptTag({path:path.join(path.dirname(await resolveDependency('mermaid')),'mermaid.min.js')});let svg=await page.evaluate(async source=>{mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'dark',deterministicIds:true,deterministicIDSeed:'code-unpacked'});return (await mermaid.render('diagram-source',source)).svg;},code);const prefix=`d${hash(code).slice(0,12)}`;const ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]).sort((a,b)=>b.length-a.length);svg=svg.replace(/\bid="([^"]+)"/g,(_,id)=>`id="${prefix}-${id}"`);for(const id of ids)svg=svg.replaceAll(`#${id}`,`#${prefix}-${id}`);return svg;}finally{await page.close();if(!sharedBrowser)await browser.close();}}
