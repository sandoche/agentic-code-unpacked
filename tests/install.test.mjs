import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { installSuite } from '../scripts/install.mjs';
test('suite installer bundles standalone support, preserves existing files, and detects version conflicts',async()=>{
  const dest=await mkdtemp(path.join(tmpdir(),'unpacked-install-'));
  await installSuite({destination:dest,skills:['walkthrough'],dependencies:false});
  assert.match(await readFile(path.join(dest,'walkthrough','runtime','guide.md'),'utf8'),/Code Unpacked/);
  await assert.rejects(readFile(path.join(dest,'code-unpacked-core','SKILL.md')), {code:'ENOENT'});
  const file=path.join(dest,'walkthrough','SKILL.md');await writeFile(file,'user customization');
  await assert.rejects(()=>installSuite({destination:dest,skills:['walkthrough'],dependencies:false}),/exists/i);
  assert.equal(await readFile(file,'utf8'),'user customization');
  await assert.rejects(()=>installSuite({destination:dest,skills:['../outside'],dependencies:false}),/skill/i);
});
