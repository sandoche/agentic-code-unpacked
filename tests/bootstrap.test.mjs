import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { ensureDependencies, withFileLock } from '../packages/core/scripts/dependencies.mjs';

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'unpacked bootstrap spaces '));
  const source = path.join(directory, 'source'), cacheRoot = path.join(directory, 'cache');
  await mkdir(source);
  await writeFile(path.join(source, 'package.json'), JSON.stringify({ dependencies: { fixture: '1.0.0' } }));
  await writeFile(path.join(source, 'package-lock.json'), '{}');
  let installs = 0;
  const install = async target => {
    installs++;
    await mkdir(path.join(target, 'node_modules', 'fixture'), { recursive: true });
    await writeFile(path.join(target, 'node_modules', 'fixture', 'package.json'), JSON.stringify({ version: '1.0.0' }));
  };
  return { directory, source, cacheRoot, install, installs: () => installs };
}

test('first use, concurrent skills, reuse, missing-package recovery, and lock changes', async () => {
  const f = await fixture();
  try {
    const [first, second] = await Promise.all([ensureDependencies(f), ensureDependencies(f)]);
    assert.equal(first, second);
    assert.equal(f.installs(), 1);
    assert.equal(await ensureDependencies(f), first);
    assert.equal(f.installs(), 1);
    await rm(path.join(first, 'node_modules', 'fixture', 'package.json'));
    assert.equal(await ensureDependencies(f), first);
    assert.equal(f.installs(), 2);
    await writeFile(path.join(f.source, 'package-lock.json'), '{"revision":2}');
    assert.notEqual(await ensureDependencies(f), first);
    assert.equal(f.installs(), 3);
    assert.match(await readFile(path.join(first, '.ready'), 'utf8'), /^[a-f0-9]{64}$/);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test('a failed download is not marked complete and a later invocation retries', async () => {
  const f = await fixture();
  try {
    await assert.rejects(ensureDependencies({ ...f, install: async () => { throw Error('Network unavailable'); } }), /Network unavailable/);
    const target = await ensureDependencies(f);
    assert.equal(f.installs(), 1);
    assert.match(await readFile(path.join(target, '.ready'), 'utf8'), /^[a-f0-9]{64}$/);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test('filesystem setup locks serialize independent callers and release after failure', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'unpacked-lock-'));
  try {
    const lock = path.join(directory, 'setup.lock');
    let active = 0, peak = 0;
    const action = () => withFileLock(lock, async () => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 30));
      active--;
    });
    await Promise.all([action(), action()]);
    assert.equal(peak, 1);
    await assert.rejects(withFileLock(lock, async () => { throw Error('failed'); }), /failed/);
    await action();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
