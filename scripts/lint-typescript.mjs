import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function sourceRoots() {
  const roots = [path.join(ROOT, 'packages/core/src')];
  for (const entry of await readdir(path.join(ROOT, 'packages/presentations'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const source = path.join(ROOT, 'packages/presentations', entry.name, 'src');
    try { await readdir(source); roots.push(source); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return roots;
}

async function checkDirectives(target) {
  let content;
  try { content = await readFile(target, 'utf8'); }
  catch (error) {
    if (error.code !== 'EISDIR' && error.code !== 'EPERM') throw error;
    for (const entry of await readdir(target, { withFileTypes: true })) {
      if (entry.isDirectory() || /\.[cm]?tsx?$/.test(entry.name)) await checkDirectives(path.join(target, entry.name));
    }
    return;
  }
  if (/(?:\/\/|\/\*)\s*(?:oxlint|eslint)-disable\b/.test(content)) throw Error(`Lint suppression directives are forbidden: ${target}`);
}

export async function lintTypeScript(roots = undefined) {
  const paths = roots || await sourceRoots();
  for (const target of paths) await checkDirectives(target);
  const binary = path.join(ROOT, 'node_modules', 'oxlint', 'bin', 'oxlint');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binary, '--type-aware', '--deny-warnings', ...paths], { cwd: ROOT, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(Error(`Strict TypeScript lint failed (exit ${code})`)));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  lintTypeScript(process.argv.length > 2 ? process.argv.slice(2) : undefined).catch(error => { console.error(error.message); process.exitCode = 1; });
}
