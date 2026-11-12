import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { installSuite } from '../scripts/install.mjs';
import { verifyCombinedSkill } from './helpers/combined.mjs';

test('combined skill installs alone, shares one capture/analysis, preserves partial outputs, and resumes comics', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'unpacked combined spaces '));
  try {
    const destination = path.join(directory, 'installed');
    await installSuite({ destination, skills: ['code-unpacked'], dependencies: false });
    assert.deepEqual(await readdir(destination), ['code-unpacked']);
    const report = await verifyCombinedSkill(path.join(destination, 'code-unpacked'), directory);
    assert.equal(Object.values(report.partial).filter(status => status === 'complete').length, 4);
    assert.equal(report.partial.xkcd, 'incomplete');
    assert.equal(report.completed.length, 5);
    assert.equal(report.comicResumed, true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
