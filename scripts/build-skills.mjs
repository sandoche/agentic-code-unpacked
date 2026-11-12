import path from 'node:path';
import { readdir, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SKILLS = ['walkthrough', 'reverse-design', 'code-map', 'review-quiz', 'xkcd'];

export async function skillFiles(directory) {
  const output = [];
  async function visit(relative = '') {
    for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
      if (['node_modules', 'tests', '.git', '.code-unpacked', '.gitkeep'].includes(entry.name)) continue;
      if (entry.isSymbolicLink()) throw Error(`Skill bundle contains a symlink: ${entry.name}`);
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile()) output.push(name);
    }
  }
  await visit();
  return output.sort();
}

export async function buildSkills({ check = false } = {}) {
  const source = path.join(ROOT, 'packages', 'core');
  const names = await skillFiles(source);
  for (const skill of SKILLS) {
    const target = path.join(ROOT, 'skills', skill, 'runtime');
    const actual = await skillFiles(target).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const name of names) {
      const content = await readFile(path.join(source, name));
      const installed = await readFile(path.join(target, name)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (installed?.equals(content)) continue;
      if (check) throw Error(`Stale skill bundle: ${skill}/runtime/${name}. Run pnpm skills:build.`);
      await mkdir(path.dirname(path.join(target, name)), { recursive: true });
      await writeFile(path.join(target, name), content);
    }
    for (const name of actual.filter(name => !names.includes(name))) {
      if (check) throw Error(`Unexpected bundled file: ${skill}/runtime/${name}`);
      const file = path.resolve(target, name);
      if (!file.startsWith(path.resolve(target) + path.sep)) throw Error('Bundle path escapes runtime directory');
      await rm(file);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildSkills({ check: process.argv.includes('--check') }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
