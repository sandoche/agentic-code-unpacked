import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { ROOT, SKILLS, PRESENTATION_SKILLS, skillFiles } from '../scripts/build-skills.mjs';
import { publishSkills } from '../scripts/publish-skills.mjs';
import { VERSION } from '../packages/core/scripts/core.mjs';

test('all released skills, runtimes, lockfiles, and plugin metadata share one version', async () => {
  const json = async file => JSON.parse(await readFile(path.join(ROOT, file), 'utf8'));
  const version = (await json('package.json')).version;
  assert.equal(VERSION, version, 'canonical runtime');
  assert.equal((await json('packages/core/package.json')).version, version, 'core package');
  assert.equal((await json('.claude-plugin/plugin.json')).version, version, 'Claude plugin');
  const coreLock = await json('packages/core/package-lock.json');
  assert.equal(coreLock.version, version, 'canonical lockfile');
  assert.equal(coreLock.packages[''].version, version, 'canonical lockfile root package');
  for (const name of SKILLS) {
    const base = `skills/${name}`;
    const instructions = await readFile(path.join(ROOT, base, 'SKILL.md'), 'utf8');
    assert.equal(instructions.match(/^  version: "([^"]+)"/m)?.[1], version, `${name} skill metadata`);
    const ui = await readFile(path.join(ROOT, base, 'agents/openai.yaml'), 'utf8');
    const uiVersion = ui.match(/^  version: "([^"]+)"/m)?.[1];
    if (uiVersion !== undefined) assert.equal(uiVersion, version, `${name} UI metadata`);
    assert.equal((await json(`${base}/runtime/package.json`)).version, version, `${name} runtime package`);
    const lock = await json(`${base}/runtime/package-lock.json`);
    assert.equal(lock.version, version, `${name} lockfile`);
    assert.equal(lock.packages[''].version, version, `${name} lockfile root package`);
    const runtime = await import(pathToFileURL(path.join(ROOT, base, 'runtime/scripts/core.mjs')).href);
    assert.equal(runtime.VERSION, version, `${name} artifact version`);
  }
  for (const file of ['skills/code-map/VERSION', 'skills/code-unpacked/presentations/code-map/VERSION']) {
    assert.equal((await readFile(path.join(ROOT, file), 'utf8')).trim(), version, file);
  }
});

test('website discovery publishes all six complete portable skills', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'unpacked-publish-'));
  try {
    await publishSkills(directory);
    const base = path.join(directory, '.well-known', 'agent-skills');
    const { skills } = JSON.parse(await readFile(path.join(base, 'index.json'), 'utf8'));
    assert.deepEqual(skills.map(item => item.name), SKILLS);
    assert.equal(skills.length, 6);
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
    const combined = skills.find(item => item.name === 'code-unpacked');
    assert.deepEqual(combined.files.filter(file => path.posix.basename(file) === 'SKILL.md'), ['SKILL.md']);
    assert.deepEqual(combined.files.filter(file => file.endsWith('scripts/dependencies.mjs')), ['runtime/scripts/dependencies.mjs']);
    for (const name of PRESENTATION_SKILLS) {
      assert.ok(combined.files.includes(`presentations/${name}/scripts/${name}.mjs`));
      assert.ok(combined.files.some(file => file.startsWith(`presentations/${name}/assets/`)));
    }
    for (const file of combined.files.filter(file => file.endsWith('.md'))) {
      const contents = await readFile(path.join(base, combined.name, file), 'utf8');
      for (const [, reference] of contents.matchAll(/\]\(([^)]+)\)/g)) {
        if (/^(?:https?:|#)/.test(reference)) continue;
        const target = path.resolve(base, combined.name, path.dirname(file), reference);
        assert.ok(target.startsWith(path.join(base, combined.name) + path.sep));
        await readFile(target);
      }
    }
    const folders = await readdir(path.join(ROOT, 'skills'));
    assert.deepEqual(folders.sort(), [...SKILLS].sort());
    const manifest = JSON.parse(await readFile(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
    const marketplace = JSON.parse(await readFile(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
    assert.equal(marketplace.plugins[0].name, manifest.name);
    assert.equal(marketplace.plugins[0].source, './');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
