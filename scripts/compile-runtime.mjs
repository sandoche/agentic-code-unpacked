import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exec = promisify(execFile);
const browserNames = new Map([['walkthrough/walkthrough.mjs', 'walkthrough.js'], ['code-map/map.mjs', 'map.js']]);

/** Compile once into an isolated directory; never emit into maintained source. */
export async function compileRuntime(skills) {
  const staging = await mkdtemp(path.join(os.tmpdir(), 'code-unpacked-typescript-'));
  try {
    const compiler = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
    try {
      await exec(process.execPath, [compiler, '--project', path.join(ROOT, 'tsconfig.json'), '--outDir', staging], { cwd: ROOT, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    } catch (error) {
      throw Error(`TypeScript compilation failed:\n${error.stdout || error.stderr || error.message}`);
    }
    const files = new Map();
    const roots = [{ source: 'packages/core', target: 'packages/core' }, ...skills.map(skill => ({ source: `packages/presentations/${skill}`, target: `skills/${skill}` }))];
    for (const root of roots) {
      for (const folder of ['scripts', 'assets']) {
        const sourceFolder = path.join(ROOT, root.source, 'src', folder);
        const names = await readdir(sourceFolder).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
        for (const name of names.filter(name => name.endsWith('.mts'))) {
          const emitted = name.replace(/\.mts$/, '.mjs');
          const skill = root.target.split('/')[1];
          const output = folder === 'assets' ? browserNames.get(`${skill}/${emitted}`) || emitted : emitted;
          const source = `${root.source}/src/${folder}/${name}`;
          let code = await readFile(path.join(staging, root.source, 'src', folder, emitted), 'utf8');
          code = code.replaceAll('../../../../core/src/scripts/', '../runtime/scripts/');
          if (folder === 'assets' && /^\s*import\s/m.test(code)) throw Error(`Browser asset must be self-contained: ${source}`);
          if (code.includes('/src/scripts/')) throw Error(`Unresolved source import in ${source}`);
          const banner = `// Generated from ${source}. Edit that source, then run pnpm skills:build.\n`;
          const shebang = code.startsWith('#!') ? code.indexOf('\n') + 1 : 0;
          code = code.slice(0, shebang) + banner + code.slice(shebang);
          files.set(`${root.target}/${folder}/${output}`, Buffer.from(code));
        }
      }
    }
    return files;
  } finally {
    const resolved = path.resolve(staging);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('code-unpacked-typescript-')) throw Error('Unexpected compiler staging directory');
    await rm(resolved, { recursive: true, force: true });
  }
}

export async function syncCompiledRuntime(skills, { check = false } = {}) {
  const files = await compileRuntime(skills);
  for (const [relative, content] of files) {
    const target = path.resolve(ROOT, relative);
    if (!target.startsWith(ROOT + path.sep)) throw Error('Compiled output escapes repository');
    const previous = await readFile(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (previous?.equals(content)) continue;
    if (check) throw Error(`Stale compiled file: ${relative}. Run pnpm skills:build.`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  const directories = new Set(['packages/core/scripts', ...skills.flatMap(skill => [`skills/${skill}/scripts`, `skills/${skill}/assets`])]);
  for (const directory of directories) {
    const names = await readdir(path.join(ROOT, directory)).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const name of names) {
      if (!/\.(?:mjs|js)$/.test(name)) continue;
      const relative = `${directory}/${name}`;
      if (files.has(relative)) continue;
      const target = path.resolve(ROOT, relative);
      if (!target.startsWith(ROOT + path.sep)) throw Error('Unexpected compiled output path');
      if (check) throw Error(`Unexpected compiled file: ${relative}`);
      await rm(target);
    }
  }
  return files;
}
