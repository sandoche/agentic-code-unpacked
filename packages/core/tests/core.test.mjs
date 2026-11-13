import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, unlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { crc32, inflateRawSync } from 'node:zlib';
import { deliveryArtifacts, VERSION, safeName, parseTarget, outputDirectory, redact, parseDiff, validateContext, resolveEvidence, captureLocal, capturePr, capturePinnedPr, addContextFiles, makeComment, writeManifest, finishArtifact, validateUploads, escapeHtml, jsonForHtml } from '../scripts/core.mjs';

test('scope parsing and collision-safe output paths', () => {
  assert.equal(parseTarget(['pr','https://github.com/acme/app/pull/42']).repo, 'acme/app');
  assert.equal(parseTarget(['pr','42','--repo','acme/app']).number, 42);
  assert.throws(() => parseTarget(['pr','42']), /repo/i);
  assert.throws(() => parseTarget(['pr','https://evil.test/acme/app/pull/42']), /GitHub/i);
  assert.notEqual(safeName('feature/a'), safeName('feature-a'));
  assert.notEqual(safeName('Feature').toLowerCase(),safeName('feature').toLowerCase());
  assert.notEqual(safeName('CON'),'CON');
  assert.equal(outputDirectory('/tmp/project',{kind:'pr',number:42},'walkthrough'),path.resolve('/tmp/project/.code-unpacked/pr/42/walkthrough'));
  assert.throws(() => outputDirectory('/tmp/project',{kind:'docs',name:'hello'},'../escape'), /skill/i);
});

test('credentials redact without removing source line structure', () => {
  const source='const api_key = "a-secret-value";\nconst port = 8080;\nAuthorization: Bearer abcdefghijklmnop';
  const result=redact(source);
  assert.ok(!result.includes('a-secret-value'));
  assert.ok(!result.includes('abcdefghijklmnop'));
  assert.equal(result.split('\n').length,3);
  assert.match(result,/8080/);
  assert.ok(!redact("define('EVERNOTE_CONSUMER_SECRET', 'private-app-value');").includes('private-app-value'));
  const query="redirect('OAuth.action?oauth_token='.$credentials['oauth_token']);";
  assert.equal(redact(query),query);
  assert.equal(redact('Uses bearer authentication and session guards.'),'Uses bearer authentication and session guards.');
});

test('diff parser retains paths, statuses and both source line numbers', () => {
  const diff='diff --git a/a.js b/a.js\n--- a/a.js\n+++ b/a.js\n@@ -2,2 +2,2 @@\n old\n-gone\n+new\ndiff --git a/old.js b/new.js\nsimilarity index 100%\nrename from old.js\nrename to new.js\ndiff --git a/image.png b/image.png\nnew file mode 100644\nBinary files /dev/null and b/image.png differ\n';
  const files=parseDiff(diff);
  assert.equal(files.length,3);
  assert.equal(files[0].hunks[0].lines[2].newLine,3);
  assert.equal(files[0].hunks[0].lines[1].oldLine,3);
  assert.equal(files[1].status,'renamed');
  assert.equal(files[2].binary,true);
});

test('diff parser decodes Git quoted UTF-8 and escaped rename paths', () => {
  const files=parseDiff('diff --git "a/functionexpr\\342\\200\\223conditional-access.js" "b/functionexpr\\342\\200\\223conditional-access.js"\n@@ -1 +1 @@\n-old\n+new\ndiff --git "a/old\\tname.js" "b/new\\tname.js"\nsimilarity index 100%\nrename from "old\\tname.js"\nrename to "new\\tname.js"\n');
  assert.equal(files[0].path,'functionexpr–conditional-access.js');
  assert.equal(files[0].oldPath,files[0].path);
  assert.equal(files[1].oldPath,'old\tname.js');assert.equal(files[1].path,'new\tname.js');
  assert.equal(files[1].status,'renamed');
});

test('pinned capture hydrates real Unicode paths rather than silently missing quoted objects', async t => {
  const dir=await mkdtemp(path.join(tmpdir(),'unpacked-unicode-pr-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',windowsHide:true}).trim();
  git('init');git('config','user.email','test@example.test');git('config','user.name','Test');git('config','core.quotePath','true');
  const name='functionexpr–conditional-access.js';
  await writeFile(path.join(dir,name),'before\n');await writeFile(path.join(dir,'context.js'),'unchanged\n');git('add','.');git('commit','-m','base');const base=git('rev-parse','HEAD');
  await writeFile(path.join(dir,name),'after\n');git('add','.');git('commit','-m','head');const head=git('rev-parse','HEAD');
  const context=await capturePinnedPr({kind:'pr',number:42,repo:'acme/app'},{base,head,title:'Unicode recorded fixture'},dir);
  assert.deepEqual(context.files.map(file=>file.path),[name]);
  assert.equal(context.files[0].content,'after\n');assert.equal(context.files[0].baseContent,'before\n');
  assert.equal(context.evidence.length,2);assert.ok(context.evidence.every(item=>item.url.includes('functionexpr%E2%80%93conditional-access.js')));
  const expanded=await addContextFiles(context,dir,['context.js']);
  const unchanged=expanded.files.find(file=>file.path==='context.js');
  assert.equal(unchanged.content,'unchanged\n');assert.equal(unchanged.omission,undefined,'head-only context does not require a base snapshot');
});

test('evidence references resolve and malformed ranges fail', () => {
  const context={schemaVersion:1,target:{kind:'docs',name:'test'},source:{head:'abc'},files:[{id:'f1',path:'a.js',status:'snapshot',content:'a\nb',hunks:[]}],evidence:[{id:'e1',fileId:'f1',startLine:1,endLine:2,side:'head'}],limitations:[]};
  assert.equal(validateContext(context),context);
  assert.equal(resolveEvidence(context,'e1').text,'a\nb');
  assert.throws(()=>resolveEvidence(context,'missing'),/evidence/i);
  assert.throws(()=>validateContext({...context,evidence:[{id:'e1',fileId:'f1',startLine:0,endLine:2}]}),/range/i);
  assert.throws(()=>validateContext({...context,evidence:[{...context.evidence[0],url:'javascript:alert(1)'}]}),/URL/i);
});

test('codebase records dirty state and selected ranges without changing checkout', async () => {
  const dir=await mkdtemp(path.join(tmpdir(),'unpacked-core-'));
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim();
  git('init'); git('config','user.email','test@example.test'); git('config','user.name','Test');
  await writeFile(path.join(dir,'a.js'),'first\nsecond\nthird\n');git('add','.');git('commit','-m','fixture');
  await writeFile(path.join(dir,'a.js'),'first\nchanged\nthird\n');
  await mkdir(path.join(dir,'.code-unpacked')); await writeFile(path.join(dir,'.code-unpacked','ignored.js'),'ignored');
  const before=git('status','--porcelain');
  const context=await captureLocal({kind:'docs',name:'selection',files:['a.js:2-3']},dir);
  assert.equal(context.source.dirty,true);
  assert.equal(context.files.length,1);
  assert.ok(!context.files[0].content.includes('first'),'selected context must not retain unselected source');
  assert.equal(resolveEvidence(context,context.evidence[0].id).text,'changed\nthird');
  assert.equal(git('status','--porcelain'),before);
  await writeFile(path.join(dir,'new.js'),'export const newValue=1;');
  const whole=await captureLocal({kind:'codebase',name:'codebase'},dir);
  assert.ok(whole.files.some(file=>file.path==='new.js'),'working snapshot includes untracked source');
  assert.ok(!whole.files.some(file=>file.path.startsWith('.code-unpacked/')));
  await unlink(path.join(dir,'a.js'));
  const deleted=await captureLocal({kind:'codebase',name:'codebase'},dir);
  assert.equal(deleted.files.find(file=>file.path==='a.js').status,'deleted');
  assert.ok(deleted.files.find(file=>file.path==='a.js').baseContent.includes('first'));
  await assert.rejects(()=>captureLocal({kind:'docs',name:'escape',files:['../outside']},dir),/outside|escape/i);
  const pinned=await capturePinnedPr({kind:'pr',number:42,repo:'acme/app'},{base:headOfFixture(),head:headOfFixture(),title:'Fixture'},dir);
  assert.equal(pinned.target.kind,'pr');assert.equal(pinned.files.length,0);
  function headOfFixture(){return git('rev-parse','HEAD');}
});

test('pinned capture retains all source when valid blobs exceed one aggregate batch', async t => {
  const dir=await mkdtemp(path.join(tmpdir(),'unpacked-large-pr-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',windowsHide:true}).trim();
  git('init');git('config','user.email','test@example.test');git('config','user.name','Test');
  const body=('x'.repeat(79)+'\n').repeat(6000);
  const names=Array.from({length:72},(_,i)=>`source-${i}.txt`);
  const before='before\n'+body,after='after\n'+body;
  assert.ok(Buffer.byteLength(before)<512000);
  assert.ok(names.length*(Buffer.byteLength(before)+Buffer.byteLength(after))>64*1024*1024);
  await Promise.all(names.map(name=>writeFile(path.join(dir,name),before)));
  git('add','.');git('commit','-m','base');const base=git('rev-parse','HEAD');
  await Promise.all(names.map(name=>writeFile(path.join(dir,name),after)));
  git('add','.');git('commit','-m','head');const head=git('rev-parse','HEAD');
  const context=await capturePinnedPr({kind:'pr',number:42,repo:'acme/app'},{base,head,title:'Large recorded fixture'},dir);
  assert.equal(context.files.length,names.length);
  assert.equal(context.evidence.length,names.length*2);
  assert.equal(context.source.head,head);assert.equal(context.source.base,base);
  for(const file of context.files){
    assert.equal(file.content,after);assert.equal(file.baseContent,before);
    assert.equal(file.omission,undefined);
  }
});

test('HTML boundaries and draft delivery never invent uploaded URLs', async () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  assert.ok(!jsonForHtml({x:'</script>'}).includes('</script>'));
  const context={target:{kind:'pr',number:42,repo:'acme/app'},source:{head:'abc'},limitations:[]};
  const comment=makeComment({skill:'walkthrough',context,summary:'A useful tour',attachments:['index.html']});
  assert.match(comment,/code-unpacked:walkthrough/);
  assert.match(comment,/index.html/);
  assert.ok(!comment.includes('https://github.com/user-attachments/'));
  const dir=await mkdtemp(path.join(tmpdir(),'unpacked-manifest-'));
  await writeFile(path.join(dir,'index.html'),'hello');
  await writeManifest(dir,{skill:'walkthrough',context,outputs:['index.html'],status:'complete'});
  const manifest=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8'));
  assert.equal(manifest.version,VERSION);assert.equal(manifest.delivery.status,'draft');
});

test('PR capture pins revisions, preserves unavailable patches and rejects moving heads',async()=>{
  let changed=false;
  const info={head:{sha:'aaa'},base:{sha:'bbb'},title:'Change',state:'closed',html_url:'https://github.com/acme/app/pull/42'};
  const api=async endpoint=>{
    if(endpoint.endsWith('/pulls/42'))return {...info,head:{sha:changed?'ccc':'aaa'}};
    if(endpoint.includes('/files?'))return [{filename:'a.js',status:'modified',additions:1,deletions:1}];
    return {encoding:'base64',content:Buffer.from(endpoint.includes('ref=aaa')?'new\n':'old\n').toString('base64')};
  };
  const context=await capturePr({kind:'pr',repo:'acme/app',number:42},{loadJson:api});
  assert.equal(context.source.head,'aaa');assert.equal(context.source.base,'bbb');
  assert.match(context.evidence[0].url,/\/aaa\//);assert.ok(context.limitations.some(x=>x.includes('no patch')));
  await assert.rejects(()=>capturePr({kind:'pr',repo:'acme/app',number:42,head:'wrong'},{loadJson:api}),/head/i);
  let calls=0;
  await assert.rejects(()=>capturePr({kind:'pr',repo:'acme/app',number:42},{loadJson:async endpoint=>{if(endpoint.endsWith('/pulls/42')&&++calls===2)changed=true;return api(endpoint);}}),/changed during capture/);
});

test('publication rejects missing or oversized attachments before any remote action',()=>{
  const files=[{path:'index.html',bytes:1024}];
  const urls={'index.html':'https://github.com/user-attachments/files/123/index.html'};
  assert.deepEqual(validateUploads(files,urls),urls);
  assert.throws(()=>validateUploads(files,{}),/attachment URL/i);
  assert.throws(()=>validateUploads(files,{'index.html':'https://example.test/not-uploaded.html'}),/attachment URL/i);
  assert.throws(()=>validateUploads([{path:'index.html',bytes:26*1024*1024}],urls),/size limit/i);
  assert.throws(()=>validateUploads([{path:'comic.png',bytes:11*1024*1024}],{}),/size limit/i);
});

test('delivery includes final media without duplicated source artwork',()=>{assert.deepEqual(deliveryArtifacts(['index.html','comic-01.png','artwork/source.png','storyboard.json','walkthrough.mp4']),['index.html','comic-01.png','walkthrough.mp4']);});

test('large offline HTML is losslessly packaged for delivery with truthful attachment names', async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'unpacked-large-html-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const source=Buffer.from('<!doctype html><title>Large map</title>'+ 'source snapshot\n'.repeat(1800000));
  await writeFile(path.join(dir,'index.html'),source);
  const context={target:{kind:'pr',number:42,repo:'acme/app'},source:{head:'a'.repeat(40)},limitations:[]};
  const manifest=await finishArtifact({dir,skill:'code-map',context,outputs:['index.html'],summary:'Complete map'});
  const selected=deliveryArtifacts(manifest.artifacts.map(item=>item.path));
  assert.deepEqual(selected,['index.html.zip']);
  assert.deepEqual(await readFile(path.join(dir,'index.html')),source,'the original offline HTML must remain intact');
  const archive=await readFile(path.join(dir,'index.html.zip'));
  assert.equal(archive.readUInt32LE(0),0x04034b50);
  assert.equal(archive.readUInt16LE(8),8,'ZIP uses standard DEFLATE');
  const filenameLength=archive.readUInt16LE(26),compressedSize=archive.readUInt32LE(18),start=30+filenameLength;
  assert.equal(archive.subarray(30,start).toString(),'index.html');
  const extracted=inflateRawSync(archive.subarray(start,start+compressedSize));
  assert.deepEqual(extracted,source);assert.equal(crc32(extracted),archive.readUInt32LE(14));
  const end=archive.length-22,central=archive.readUInt32LE(end+16);
  assert.equal(archive.readUInt32LE(end),0x06054b50);assert.equal(archive.readUInt32LE(central),0x02014b50);
  assert.equal(archive.readUInt32LE(central+24),source.length);
  const attachments=manifest.artifacts.filter(item=>selected.includes(item.path));
  validateUploads(attachments,{'index.html.zip':'https://github.com/user-attachments/files/123/index.html.zip'});
  const comment=await readFile(path.join(dir,'comment.md'),'utf8');
  assert.match(comment,/extract it/);assert.match(comment,/`index\.html\.zip`/);
  const small=await mkdtemp(path.join(tmpdir(),'unpacked-small-html-'));t.after(()=>rm(small,{recursive:true,force:true}));
  await writeFile(path.join(small,'index.html'),'small');
  const normal=await finishArtifact({dir:small,skill:'code-map',context,outputs:['index.html']});
  assert.deepEqual(deliveryArtifacts(normal.artifacts.map(item=>item.path)),['index.html']);
});

test('large PR comments preserve full Markdown locally and bound published summaries including URLs',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'unpacked-large-comment-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const context={target:{kind:'pr',number:42,repo:'acme/app'},source:{head:'a'.repeat(40)},limitations:Array.from({length:1000},(_,i)=>`source-${i}: ${'coverage gap '.repeat(20)}`)};
  const markdown='## Complete design\n\n'+('```mermaid\ngraph LR\n A-->B\n```\n\n').repeat(2500);
  await writeFile(path.join(dir,'index.html'),'<!doctype html><title>Complete design</title>');
  await finishArtifact({dir,skill:'reverse-design',context,outputs:['index.html'],summary:'Design overview',markdown});
  assert.equal(JSON.parse(await readFile(path.join(dir,'comment-content.json'),'utf8')).markdown,markdown,'full content must remain available for regeneration');
  const draft=await readFile(path.join(dir,'comment.md'),'utf8');
  assert.ok(draft.length<=60000);assert.match(draft,/Complete documents, diagrams/);assert.match(draft,/of 1000 source limitations shown/);
  assert.equal((draft.match(/```/g)||[]).length,0,'compact comments cannot contain truncated diagram fences');
  const links='[Download index.html](https://github.com/user-attachments/files/123/'+ 'a'.repeat(2000)+')';
  const published=makeComment({skill:'reverse-design',context,summary:'Design overview',markdown,maxLength:60000-links.length-2})+'\n'+links+'\n';
  assert.ok(published.length<=60000);assert.ok(published.endsWith(links+'\n'));
});
