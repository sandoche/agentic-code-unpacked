import path from 'node:path';
import { readdir, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PRESENTATION_SKILLS = ['walkthrough', 'reverse-design', 'code-map', 'review-quiz', 'xkcd'];
export const SKILLS = [...PRESENTATION_SKILLS, 'code-unpacked'];

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

async function syncGenerated(target, files, check) {
  const actual = await skillFiles(target).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  for (const [name, content] of files) {
    const installed = await readFile(path.join(target, name)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (installed?.equals(content)) continue;
    if (check) throw Error(`Stale skill bundle: ${path.relative(ROOT, path.join(target, name))}. Run pnpm skills:build.`);
    await mkdir(path.dirname(path.join(target, name)), { recursive: true });
    await writeFile(path.join(target, name), content);
  }
  for (const name of actual.filter(name => !files.has(name))) {
    if (check) throw Error(`Unexpected bundled file: ${path.relative(ROOT, path.join(target, name))}`);
    const file = path.resolve(target, name);
    if (!file.startsWith(path.resolve(target) + path.sep)) throw Error('Bundle path escapes generated directory');
    await rm(file);
  }
}

export async function buildSkills({ check = false } = {}) {
  const source = path.join(ROOT, 'packages', 'core');
  const runtime = new Map(await Promise.all((await skillFiles(source)).map(async name => [name, await readFile(path.join(source, name))])));
  for (const skill of SKILLS) await syncGenerated(path.join(ROOT, 'skills', skill, 'runtime'), runtime, check);

  const presentations = new Map();
  for (const skill of PRESENTATION_SKILLS) {
    const directory = path.join(ROOT, 'skills', skill);
    for (const name of await skillFiles(directory)) {
      if (!/^(?:scripts|assets|references)\//.test(name) && name !== 'VERSION') continue;
      let content = await readFile(path.join(directory, name));
      if (/\.(?:mjs|md)$/.test(name)) {
        content = Buffer.from(content.toString('utf8')
          .replaceAll('../runtime/', '../../../runtime/')
          .replaceAll(`<skills>/${skill}`, '<skill-dir>')
          .replaceAll(`<skills-dir>/${skill}`, '<skill-dir>')
          .replaceAll(`<${skill}>`, '<skill-dir>'));
      }
      presentations.set(`${skill}/${name}`, content);
    }
  }
  await syncGenerated(path.join(ROOT, 'skills', 'code-unpacked', 'presentations'), presentations, check);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildSkills({ check: process.argv.includes('--check') }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
