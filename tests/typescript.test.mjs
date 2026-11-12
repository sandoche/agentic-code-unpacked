import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, symlink, readdir, stat, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../scripts/build-skills.mjs';
import { lintTypeScript } from '../scripts/lint-typescript.mjs';

const exec = promisify(execFile);
const compiler = path.join(ROOT, 'node_modules/typescript/bin/tsc');
const linter = path.join(ROOT, 'node_modules/oxlint/bin/oxlint');

async function temporary(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'unpacked-typescript-test-'));
  t.after(async () => {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('unpacked-typescript-test-'));
    await rm(resolved, { recursive: true, force: true });
  });
  return directory;
}

async function snapshot(directory, relative = '') {
  const files = {};
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) Object.assign(files, await snapshot(directory, name));
    else {
      const file = path.join(directory, name);
      files[name] = { contents: (await readFile(file)).toString('hex'), modified: (await stat(file)).mtimeMs };
    }
  }
  return files;
}

test('compiled-file checks reject stale, missing, extra, and invalid output without rewriting the fixture', async t => {
  const directory = await temporary(t);
  await mkdir(path.join(directory, 'scripts'));
  await mkdir(path.join(directory, 'packages/core/src/scripts'), { recursive: true });
  await mkdir(path.join(directory, 'packages/presentations/walkthrough/src/scripts'), { recursive: true });
  await symlink(path.join(ROOT, 'node_modules'), path.join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  await copyFile(path.join(ROOT, 'scripts/compile-runtime.mjs'), path.join(directory, 'scripts/compile-runtime.mjs'));
  await writeFile(path.join(directory, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, target: 'ES2023', module: 'NodeNext', types: [], noEmitOnError: true, rootDir: '.' }, include: ['packages/core/src/**/*.mts', 'packages/presentations/*/src/**/*.mts'] }));
  const source = path.join(directory, 'packages/core/src/scripts/value.mts');
  await writeFile(source, "export function value(): string { return 'baseline'; }\n");
  await writeFile(path.join(directory, 'packages/presentations/walkthrough/src/scripts/walkthrough.mts'), "import { value } from '../../../../core/src/scripts/value.mjs';\nexport function render(): string { return value(); }\n");
  const { syncCompiledRuntime } = await import(pathToFileURL(path.join(directory, 'scripts/compile-runtime.mjs')).href);
  await syncCompiledRuntime(['walkthrough']);
  assert.match(await readFile(path.join(directory, 'skills/walkthrough/scripts/walkthrough.mjs'), 'utf8'), /\.\.\/runtime\/scripts\/value\.mjs/);
  let before = await snapshot(directory);
  await syncCompiledRuntime(['walkthrough'], { check: true });
  assert.deepEqual(await snapshot(directory), before);

  await writeFile(source, "export function value(): string { return 'changed'; }\n");
  before = await snapshot(directory);
  await assert.rejects(syncCompiledRuntime(['walkthrough'], { check: true }), /Stale compiled file/);
  assert.deepEqual(await snapshot(directory), before);
  await syncCompiledRuntime(['walkthrough']);

  const generated = path.join(directory, 'packages/core/scripts/value.mjs');
  await rm(generated);
  before = await snapshot(directory);
  await assert.rejects(syncCompiledRuntime(['walkthrough'], { check: true }), /Stale compiled file/);
  assert.deepEqual(await snapshot(directory), before);
  await syncCompiledRuntime(['walkthrough']);

  const extra = path.join(directory, 'packages/core/scripts/obsolete.mjs');
  await writeFile(extra, 'export {};\n');
  before = await snapshot(directory);
  await assert.rejects(syncCompiledRuntime(['walkthrough'], { check: true }), /Unexpected compiled file/);
  assert.deepEqual(await snapshot(directory), before);
  await rm(extra);

  const rendererSource = path.join(directory, 'packages/presentations/walkthrough/src/scripts/walkthrough.mts');
  const renderer = await readFile(rendererSource);
  await rm(rendererSource);
  before = await snapshot(directory);
  await assert.rejects(syncCompiledRuntime(['walkthrough'], { check: true }), /Unexpected compiled file/);
  assert.deepEqual(await snapshot(directory), before);
  await writeFile(rendererSource, renderer);

  await writeFile(source, 'export function value(): string { return 123; }\n');
  before = await snapshot(directory);
  await assert.rejects(syncCompiledRuntime(['walkthrough']), /TypeScript compilation failed/);
  assert.deepEqual(await snapshot(directory), before);
});

test('strict compiler and lint gates reject implicit any, explicit any, unsafe JSON, and suppressions', async t => {
  const directory = await temporary(t), fixture = path.join(directory, 'fixture.mts');
  await symlink(path.join(ROOT, 'node_modules'), path.join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  await copyFile(path.join(ROOT, '.oxlintrc.json'), path.join(directory, '.oxlintrc.json'));
  await writeFile(path.join(directory, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, target: 'ES2023', module: 'NodeNext', types: [] }, include: ['fixture.mts'] }));
  const typecheck = () => exec(process.execPath, [compiler, '--project', directory, '--pretty', 'false'], { windowsHide: true });
  const lint = () => exec(process.execPath, [linter, '--type-aware', '--deny-warnings', fixture], { cwd: directory, windowsHide: true });
  await writeFile(fixture, "export function valid(value: unknown): string { if(typeof value !== 'string') throw Error('Expected string'); return value; }\n");
  await typecheck(); await lint();
  await writeFile(fixture, 'export function invalid(value) { return value; }\n');
  await assert.rejects(typecheck(), error => /TS7006/.test(error.stdout));
  await writeFile(fixture, 'export function invalid(value: any): unknown { return value; }\n');
  await assert.rejects(lint(), error => /no-explicit-any/.test(error.stdout));
  await writeFile(fixture, "export const unsafe: string = JSON.parse('null');\n");
  await assert.rejects(lint(), error => /no-unsafe-assignment/.test(error.stdout));
  await writeFile(fixture, '// @ts-ignore\nexport const ignored: string = 42;\n');
  await assert.rejects(lint(), error => /ban-ts-comment/.test(error.stdout));
  await writeFile(fixture, '// oxlint-disable typescript/no-explicit-any\nexport const suppressed: any = 42;\n');
  await assert.rejects(lintTypeScript([fixture]), /suppression directives are forbidden/);
});
