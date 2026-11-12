import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { isolatedTestEnvironment } from '../scripts/test.mjs';

test('Git hook settings cannot redirect fixture commands into the committing repository', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'unpacked-git-environment-'));
  try {
    const committing = path.join(directory, 'committing'), fixture = path.join(directory, 'fixture'), hooks = path.join(directory, 'empty-hooks');
    await Promise.all([committing, fixture, hooks].map(dir => mkdir(dir)));
    const baseline = isolatedTestEnvironment();
    const git = (cwd, args, env = baseline) => execFileSync('git', ['-c', `core.hooksPath=${hooks}`, ...args], { cwd, env, encoding: 'utf8', windowsHide: true }).trim();
    const commit = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'];
    git(committing, ['init', '-q']);
    await writeFile(path.join(committing, 'protected.txt'), 'Preserve the committing repository.\n');
    git(committing, ['add', '.']);
    git(committing, commit);
    const head = git(committing, ['rev-parse', 'HEAD']);
    const config = await readFile(path.join(committing, '.git/config'));
    const index = await readFile(path.join(committing, '.git/index'));
    const environment = isolatedTestEnvironment({
      ...baseline,
      GIT_DIR: path.join(committing, '.git'),
      GIT_COMMON_DIR: path.join(committing, '.git'),
      GIT_WORK_TREE: committing,
      GIT_INDEX_FILE: path.join(committing, '.git/index'),
      GIT_PREFIX: '',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.bare',
      GIT_CONFIG_VALUE_0: 'true',
    });
    git(fixture, ['init', '-q'], environment);
    await writeFile(path.join(fixture, 'fixture.txt'), 'This belongs to the fixture.\n');
    git(fixture, ['add', '.'], environment);
    git(fixture, commit, environment);
    assert.equal(path.resolve(git(fixture, ['rev-parse', '--show-toplevel'], environment)), fixture);
    assert.notEqual(git(fixture, ['rev-parse', 'HEAD'], environment), head);
    assert.equal(git(committing, ['rev-parse', 'HEAD']), head);
    assert.deepEqual(await readFile(path.join(committing, '.git/config')), config);
    assert.deepEqual(await readFile(path.join(committing, '.git/index')), index);
    assert.equal(await readFile(path.join(committing, 'protected.txt'), 'utf8'), 'Preserve the committing repository.\n');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
