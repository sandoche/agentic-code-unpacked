import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { safeName, parseTarget, outputDirectory, redact, parseDiff, validateContext, resolveEvidence, captureLocal, capturePr, capturePinnedPr, makeComment, writeManifest, validateUploads, escapeHtml, jsonForHtml } from '../scripts/core.mjs';

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
  assert.equal(resolveEvidence(context,context.evidence[0].id).text,'changed\nthird');
  assert.equal(git('status','--porcelain'),before);
  await assert.rejects(()=>captureLocal({kind:'docs',name:'escape',files:['../outside']},dir),/outside|escape/i);
  const pinned=await capturePinnedPr({kind:'pr',number:42,repo:'acme/app'},{base:headOfFixture(),head:headOfFixture(),title:'Fixture'},dir);
  assert.equal(pinned.target.kind,'pr');assert.equal(pinned.files.length,0);
  function headOfFixture(){return git('rev-parse','HEAD');}
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
  assert.equal(manifest.version,'0.1.0');assert.equal(manifest.delivery.status,'draft');
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
