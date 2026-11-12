import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ROOT, SKILLS, skillFiles, buildSkills } from './build-skills.mjs';

// The stable files[] discovery format also works with older skills CLI versions.
export async function publishSkills(destination = path.join(ROOT, 'website', 'dist')) {
  await buildSkills({ check: true });
  const base = path.join(destination, '.well-known', 'agent-skills');
  const skills = [];
  for (const name of SKILLS) {
    const source = path.join(ROOT, 'skills', name);
    const files = await skillFiles(source);
    const instructions = await readFile(path.join(source, 'SKILL.md'), 'utf8');
    const description = /^description: (.+)$/m.exec(instructions)?.[1];
    if (!description) throw Error(`Missing description for ${name}`);
    skills.push({ name, description, files });
    for (const file of files) {
      const target = path.join(base, name, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, await readFile(path.join(source, file)));
    }
  }
  await mkdir(base, { recursive: true });
  await writeFile(path.join(base, 'index.json'), JSON.stringify({ skills }, null, 2) + '\n');
  return skills;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  publishSkills().catch(error => { console.error(error.message); process.exitCode = 1; });
}
