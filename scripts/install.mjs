#!/usr/bin/env node
// Local-checkout fallback. Public installs use the standard skills CLI.
import path from 'node:path';
import os from 'node:os';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ROOT, SKILLS, skillFiles, buildSkills } from './build-skills.mjs';
export { SKILLS };

export async function installSuite({ destination = path.join(os.homedir(), '.claude', 'skills'), skills = SKILLS, dependencies = true } = {}) {
  if (!skills.length || skills.some(skill => !SKILLS.includes(skill))) throw Error('Unknown skill selection');
  await buildSkills({ check: true });
  const selected = [...new Set(skills)];
  for (const skill of selected) {
    try { await access(path.join(destination, skill)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw Error(`Destination already exists: ${path.join(destination, skill)}. Back up/remove it explicitly before reinstalling.`);
  }
  for (const skill of selected) {
    const source = path.join(ROOT, 'skills', skill);
    for (const file of await skillFiles(source)) {
      const target = path.join(destination, skill, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, await readFile(path.join(source, file)));
    }
  }
  if (dependencies) {
    const { ensureDependencies } = await import('../packages/core/scripts/dependencies.mjs');
    await ensureDependencies();
  }
  return selected.map(skill => path.join(destination, skill));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = flag => { const index = args.indexOf(flag); if (index < 0) return undefined; if (!args[index + 1] || args[index + 1].startsWith('--')) throw Error(`Missing value for ${flag}`); return args[index + 1]; };
  try {
    installSuite({ destination: value('--dest'), skills: value('--skill')?.split(','), dependencies: !args.includes('--no-deps') })
      .then(paths => console.log(paths.join('\n'))).catch(error => { console.error(error.message); process.exitCode = 1; });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
