import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { ROOT, SKILLS, skillFiles } from '../scripts/build-skills.mjs';
import { publishSkills } from '../scripts/publish-skills.mjs';

test('website discovery publishes exactly five complete portable skills', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'unpacked-publish-'));
  try {
    await publishSkills(directory);
    const base = path.join(directory, '.well-known', 'agent-skills');
    const { skills } = JSON.parse(await readFile(path.join(base, 'index.json'), 'utf8'));
    assert.deepEqual(skills.map(item => item.name), SKILLS);
    for (const skill of skills) {
      assert.ok(skill.description.length > 0);
      assert.ok(skill.files.includes('SKILL.md'));
      assert.ok(skill.files.includes('runtime/scripts/dependencies.mjs'));
      assert.ok(skill.files.includes('runtime/package-lock.json'));
      assert.deepEqual(skill.files, await skillFiles(path.join(ROOT, 'skills', skill.name)));
      for (const file of skill.files) {
        assert.doesNotMatch(file, /(?:^|\/)(?:node_modules|tests|\.git|\.code-unpacked)(?:\/|$)/);
        assert.ok((await readFile(path.join(base, skill.name, file))).equals(await readFile(path.join(ROOT, 'skills', skill.name, file))));
      }
      const instructions = await readFile(path.join(base, skill.name, 'SKILL.md'), 'utf8');
      for (const [, reference] of instructions.matchAll(/\]\(([^)]+)\)/g)) await readFile(path.join(base, skill.name, reference));
    }
    const folders = await readdir(path.join(ROOT, 'skills'));
    assert.deepEqual(folders.sort(), [...SKILLS].sort());
    const manifest = JSON.parse(await readFile(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
    const marketplace = JSON.parse(await readFile(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
    assert.equal(marketplace.plugins[0].name, manifest.name);
    assert.equal(marketplace.plugins[0].source, './');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
