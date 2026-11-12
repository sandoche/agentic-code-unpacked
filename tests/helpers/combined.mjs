import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { quizFixture } from '../skills/review-quiz/fixtures.mjs';

const exec = promisify(execFile);
const hash = data => createHash('sha256').update(data).digest('hex');

// Exercise the combined skill's documented workflow using only its installed files.
export async function verifyCombinedSkill(skill, directory) {
  const repository = path.join(directory, 'combined repository'), hooks = path.join(directory, 'empty-hooks');
  await mkdir(repository, { recursive: true }); await mkdir(hooks, { recursive: true });
  await exec('git', ['init', '-q'], { cwd: repository, windowsHide: true });
  await writeFile(path.join(repository, 'handler.js'), 'export function save(value) {\n  if (!value) throw Error("Missing value");\n  return value;\n}\n');
  await exec('git', ['add', 'handler.js'], { cwd: repository, windowsHide: true });
  await exec('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', `core.hooksPath=${hooks}`, 'commit', '-qm', 'fixture'], { cwd: repository, windowsHide: true });
  const run = (file, args) => exec(process.execPath, [path.join(skill, file), ...args], { windowsHide: true, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
  const json = (file, data) => writeFile(file, JSON.stringify(data));
  // Exactly one capture and one analysis are shared by all five renderers.
  await run('runtime/scripts/code-unpacked.mjs', ['collect', 'docs', 'sample', '--files', 'handler.js', '--root', repository]);
  const contextFile = path.join(repository, '.code-unpacked', 'docs', 'sample', 'context', 'context.json');
  let context = JSON.parse(await readFile(contextFile, 'utf8'));
  const id = context.evidence.find(item => item.side === 'head').id;
  const analysisFile = path.join(directory, 'analysis.json');
  await json(analysisFile, {
    schemaVersion: 2, title: 'Input validation', summary: 'Save rejects falsy input and returns truthy input.', evidenceIds: [id],
    topics: [{ id: 'guard', title: 'Input guard', summary: 'Falsy input throws before return.', evidenceIds: [id], reviewFocus: [{ text: 'Check which inputs are rejected.', evidenceIds: [id] }], extensionPoints: [] }],
    flows: [], fileCoverage: context.files.map(file => ({ fileId: file.id, role: 'substantive', topicIds: ['guard'], reason: 'The validation handler is the selected source.' })), limitations: [],
  });
  await run('runtime/scripts/code-unpacked.mjs', ['analyze', '--context', contextFile, '--content', analysisFile]);
  const savedContext = await readFile(contextFile);
  context = JSON.parse(savedContext);
  const contextHash = hash(JSON.stringify(context));
  const claim = markdown => ({ markdown, basis: 'observed', evidence: [id] });
  const quiz = { ...quizFixture(), schemaVersion: 3, requestedCount: 3, generatedCount: 3 };
  quiz.questions[0].diagram = { title: 'Truthy input path', description: 'A truthy input passes the guard and returns unchanged.', mermaid: 'flowchart LR\n  Input[Truthy input] --> Guard\n  Guard --> Return[Return input]' };
  for (const question of quiz.questions) question.evidence = [id];
  const contents = {
    walkthrough: { schemaVersion: 2, title: 'Save handler', chapters: [{ id: 'guard', title: 'Input validation', topicIds: ['guard'], steps: [{ id: 'reject', title: 'Reject falsy input', explanation: 'The guard throws before returning.', evidence: [id], snippets: [{ evidence: id }] }] }] },
    'reverse-design': { schemaVersion: 2, title: 'Save handler design', overview: { purpose: claim('Validate input before returning it.'), reviewFocus: [claim('Check the truthiness boundary.')], extensionContext: [{ markdown: 'Consider explicit validation when accepting falsy values.', basis: 'proposed', evidence: [id] }] }, documents: [{ id: 'behavior', family: 'requirements', title: 'Input behavior', topicIds: ['guard'], sections: [{ heading: 'Guard', markdown: 'Falsy input throws before return.', basis: 'observed', evidence: [id] }], diagrams: [{ id: 'guard-flow', title: 'Validation flow', question: 'Where can input fail?', mermaid: 'flowchart LR\nInput --> Guard\nGuard --> Return', evidence: [id] }] }], gaps: [] },
    'code-map': undefined,
    'review-quiz': quiz,
    xkcd: { schemaVersion: 2, title: 'A guard at the door', concept: 'Input validation', evidence: [id], characters: [{ id: 'guard', name: 'save', role: 'Validates input', evidence: [id] }], strips: [{ id: 'validation', topicId: 'guard', title: 'Only truthy values', limitation: 'Synthetic artwork tests rendering, not image-generation quality.', panels: [{ id: 'reject', scene: 'An empty value reaches the guard.', dialogue: [{ characterId: 'guard', text: 'Missing value.' }], evidence: [id] }, { id: 'return', scene: 'A truthy value passes the guard.', dialogue: [], caption: 'Return the input.', evidence: [id] }] }] },
  };
  const root = path.join(repository, '.code-unpacked', 'docs', 'sample');
  const preserved = new Map(), partial = {}, outputs = [];
  let comicArgs;
  for (const [name, content] of Object.entries(contents)) {
    const args = ['render', '--context', contextFile, '--root', repository];
    if (content) {
      const file = path.join(directory, `${name}.json`);
      await json(file, content); args.push('--content', file);
    }
    const script = `presentations/${name}/scripts/${name}.mjs`;
    try { await run(script, args); } catch (error) {
      if (name !== 'xkcd' || error.code !== 2) throw error;
    }
    const output = path.join(root, name);
    const manifestFile = path.join(output, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
    assert.equal(manifest.inputs.contextHash, contextHash);
    assert.equal(manifest.status, name === 'xkcd' ? 'incomplete' : 'complete');
    partial[name] = manifest.status;
    if (name === 'xkcd') {
      comicArgs = args;
      await readFile(path.join(output, 'prompts.json'));
      await readFile(path.join(output, 'storyboard.json'));
    } else preserved.set(manifestFile, await readFile(manifestFile));
    if (name === 'review-quiz') {
      assert.match(await readFile(path.join(output, 'index.html'), 'utf8'), /<svg\b/);
      assert.deepEqual(JSON.parse(await readFile(path.join(output, 'quiz.json'), 'utf8')).questions[0].diagram, quiz.questions[0].diagram);
    }
    await readFile(path.join(output, 'index.html'));
    assert.ok((await readFile(contextFile)).equals(savedContext));
    outputs.push(output);
  }
  // Resume the incomplete comic with synthetic artwork; do not regenerate the others.
  const artwork = path.join(directory, 'fixture.png');
  await writeFile(artwork, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64'));
  await run('presentations/xkcd/scripts/xkcd.mjs', [...comicArgs, '--artwork', artwork]);
  const comic = JSON.parse(await readFile(path.join(root, 'xkcd', 'manifest.json'), 'utf8'));
  assert.equal(comic.status, 'complete');
  assert.equal(comic.inputs.contextHash, contextHash);
  for (const [file, bytes] of preserved) assert.ok((await readFile(file)).equals(bytes));
  assert.ok((await readFile(contextFile)).equals(savedContext));
  return { contextHash, partial, completed: outputs, comicResumed: true };
}
