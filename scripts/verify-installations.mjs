// On-demand integration check against a real skills CLI, isolated from user skills.
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { ROOT, SKILLS } from './build-skills.mjs';
import { publishSkills } from './publish-skills.mjs';
import { quizFixture } from '../tests/skills/review-quiz/fixtures.mjs';

const exec = promisify(execFile);
const cli = process.argv[2];
if (!cli) throw Error('Usage: node scripts/verify-installations.mjs /absolute/path/to/skills/bin/cli.mjs');
const directory = await mkdtemp(path.join(os.tmpdir(), 'unpacked real installs '));
const site = path.join(directory, 'site');
await publishSkills(site);
const server = createServer(async (request, response) => {
  try {
    const file = path.resolve(site, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (!file.startsWith(site + path.sep)) { response.writeHead(403).end(); return; }
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': file.endsWith('.json') ? 'application/json' : 'text/plain' }).end(content);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const json = async (file, value) => writeFile(file, JSON.stringify(value));
let installed;
try {
  const agents = ['claude-code', 'codex', 'cursor', 'github-copilot', 'gemini-cli', 'opencode'];
  async function install(label, source, agent, skills = ['*'], globalInstall = false) {
    const project = path.join(directory, label), user = path.join(directory, label + '-user');
    await mkdir(project); await mkdir(user);
    const env = { ...process.env, HOME: user, USERPROFILE: user, XDG_CONFIG_HOME: path.join(user, '.config'), DISABLE_TELEMETRY: '1' };
    try {
      await exec(process.execPath, [cli, 'add', source, '--skill', ...skills, '--agent', agent, '--copy', '-y', ...(globalInstall ? ['-g'] : [])], { cwd: project, env, windowsHide: true, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
    } catch (error) { throw Error(`${label}: ${error.stdout || ''}\n${error.stderr || error.message}`); }
    const api = pathToFileURL(path.resolve(path.dirname(cli), '../dist/index.mjs')).href;
    const { stdout } = await exec(process.execPath, ['--input-type=module', '-e', 'const api = await import(process.argv[1]); console.log(JSON.stringify(api.getSupportedAgents().find(item => item.id === process.argv[2])))', api, agent], { cwd: project, env, windowsHide: true });
    const info = JSON.parse(stdout);
    const target = globalInstall ? info.universal ? path.join(user, '.agents', 'skills') : info.globalSkillsDir : path.resolve(project, info.projectSkillsDir);
    for (const skill of skills[0] === '*' ? SKILLS : skills) {
      await readFile(path.join(target, skill, 'SKILL.md'));
      await readFile(path.join(target, skill, 'runtime', 'scripts', 'core.mjs'));
    }
    console.log(`Installed ${label}`);
    return target;
  }
  for (const agent of agents) {
    const result = await install(agent, ROOT, agent);
    if (agent === 'claude-code') installed = result;
  }
  for (const agent of agents) await install('global-' + agent, ROOT, agent, ['*'], true);
  for (const skill of SKILLS) {
    const target = await install('single-' + skill, ROOT, 'claude-code', [skill]);
    assert.deepEqual((await readdir(target)).filter(name => !name.startsWith('.')), [skill]);
  }
  await install('hosted', `http://127.0.0.1:${server.address().port}`, 'claude-code');

  const repository = path.join(directory, 'synthetic repository');
  await mkdir(repository);
  await exec('git', ['init', '-q'], { cwd: repository, windowsHide: true });
  await writeFile(path.join(repository, 'handler.js'), 'export function save(value) {\n  if (!value) throw Error("Missing value");\n  return value;\n}\n');
  await exec('git', ['add', 'handler.js'], { cwd: repository, windowsHide: true });
  const hooks = path.join(directory, 'empty-hooks');
  await mkdir(hooks);
  await exec('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', `core.hooksPath=${hooks}`, 'commit', '-qm', 'fixture'], { cwd: repository, windowsHide: true });
  const outputs = [];
  for (const skill of SKILLS) {
    const folder = path.join(installed, skill);
    await exec(process.execPath, [path.join(folder, 'runtime', 'scripts', 'code-unpacked.mjs'), 'collect', 'docs', 'sample', '--files', 'handler.js', '--root', repository], { windowsHide: true, timeout: 120_000 });
    const contextFile = path.join(repository, '.code-unpacked', 'docs', 'sample', 'context', 'context.json');
    const context = JSON.parse(await readFile(contextFile, 'utf8'));
    const id = context.evidence.find(item => item.side === 'head').id;
    const options = ['render', '--context', contextFile, '--root', repository];
    const contentFile = path.join(directory, skill + '.json');
    if (skill === 'walkthrough') await json(contentFile, { schemaVersion: 1, title: 'Save handler', steps: [{ id: 'guard', title: 'Validate input', explanation: 'The guard rejects falsy values.', evidence: [id], codeEvidence: id }] });
    if (skill === 'reverse-design') await json(contentFile, { schemaVersion: 1, title: 'Save handler design', summary: 'The handler rejects falsy values.', summaryEvidence: [id], documents: [{ id: 'behavior', family: 'requirements', title: 'Observed behavior', sections: [{ heading: 'Guard', markdown: 'Falsy input throws before return.', basis: 'observed', evidence: [id] }], diagrams: [{ id: 'guard-flow', title: 'Guard and return', mermaid: 'flowchart LR\nInput --> Guard\nGuard --> Return', evidence: [id] }] }], gaps: [] });
    if (skill === 'review-quiz') {
      const content = quizFixture();
      for (const question of content.questions) question.evidence = [id];
      await json(contentFile, content);
    }
    if (skill === 'xkcd') {
      await json(contentFile, { schemaVersion: 1, title: 'A guard at the door', concept: 'Input validation', evidence: [id], characters: [{ id: 'guard', name: 'save', role: 'Validates input', evidence: [id] }], strips: [{ id: 'validation', title: 'Only truthy values', limitation: 'This fixture verifies rendering, not generated artwork quality.', panels: [{ id: 'input', scene: 'A figure presents an empty value.', dialogue: [{ characterId: 'guard', text: 'Missing value.' }], evidence: [id] }, { id: 'return', scene: 'A truthy value passes the guard.', dialogue: [], caption: 'Return the input.', evidence: [id] }] }] });
      const image = path.join(directory, 'fixture.png');
      await writeFile(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64'));
      options.push('--artwork', image);
    }
    if (skill !== 'code-map') options.push('--content', contentFile);
    await exec(process.execPath, [path.join(folder, 'scripts', skill + '.mjs'), ...options], { windowsHide: true, timeout: 120_000 });
    const output = path.join(repository, '.code-unpacked', 'docs', 'sample', skill);
    assert.equal(JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8')).status, 'complete');
    await readFile(path.join(output, 'index.html'));
    outputs.push(output);
    console.log(`Rendered installed ${skill}`);
  }
  await json(path.join(directory, 'report.json'), { agents, individuallyInstalled: SKILLS, hosted: true, outputs });
  console.log(`Integration report: ${path.join(directory, 'report.json')}`);
} finally { await new Promise(resolve => server.close(resolve)); }
