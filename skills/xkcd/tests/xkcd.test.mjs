import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateStoryboard, makePrompts, renderComic } from '../scripts/xkcd.mjs';

const context = {
  schemaVersion: 1,
  target: { kind: 'docs', name: 'billing', files: ['Billing.php'] },
  source: { head: 'abc123', kind: 'working-tree', dirty: true },
  files: [{ id: 'billing', path: 'Billing.php', content: 'lock();\nlookup();\ncharge();' }],
  evidence: [{ id: 'billing-head', fileId: 'billing', side: 'head', startLine: 1, endLine: 3 }],
  limitations: [],
};
const storyboard = () => ({
  schemaVersion: 1, title: 'One charge, please', concept: 'A guard serializes duplicate work.',
  evidence: ['billing-head'],
  characters: [{ id: 'guard', name: 'Billing', role: 'Serializes the request', evidence: ['billing-head'] }],
  strips: [{ id: 'billing-lock', title: 'At the billing door', limitation: 'A local guard does not prove external payment success.', panels: [
    { id: 'arrival', scene: 'Two identical stick figures approach one door.', dialogue: [{ characterId: 'guard', text: 'One at a time.' }], caption: 'The request acquires a lock.', evidence: ['billing-head'] },
    { id: 'lookup', scene: 'One stick figure checks a ledger.', dialogue: [], caption: 'Check whether work already completed.', evidence: ['billing-head'] },
    { id: 'exit', scene: 'The second figure leaves without paying twice.', dialogue: [{ characterId: 'guard', text: 'Already handled.' }], caption: 'Return the stored result.', evidence: ['billing-head'] },
  ] }],
});
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

test('validates evidence, characters, panel bounds, and unique identifiers', () => {
  assert.equal(validateStoryboard(context, storyboard()).strips.length, 1);
  const badEvidence = storyboard(); badEvidence.strips[0].panels[0].evidence = ['missing'];
  assert.throws(() => validateStoryboard(context, badEvidence), /Unknown evidence/);
  const badCharacter = storyboard(); badCharacter.strips[0].panels[0].dialogue[0].characterId = 'ghost';
  assert.throws(() => validateStoryboard(context, badCharacter), /Unknown character/);
  const onePanel = storyboard(); onePanel.strips[0].panels.length = 1;
  assert.throws(() => validateStoryboard(context, onePanel), /2.*6/);
  const tooManyPanels = storyboard(); tooManyPanels.strips[0].panels = Array.from({ length: 7 }, (_, i) => ({ ...tooManyPanels.strips[0].panels[0], id: `panel-${i}` }));
  assert.throws(() => validateStoryboard(context, tooManyPanels), /2.*6/);
  const tooManyStrips = storyboard(); tooManyStrips.strips = Array.from({ length: 13 }, (_, i) => ({ ...tooManyStrips.strips[0], id: `strip-${i}` }));
  assert.throws(() => validateStoryboard(context, tooManyStrips), /1.*12/);
  const duplicated = storyboard(); duplicated.strips[0].panels[1].id = 'arrival';
  assert.throws(() => validateStoryboard(context, duplicated), /duplicate/i);
});

test('prompts are stable, require actual generative artwork, and change when the scene changes', () => {
  const first = makePrompts(storyboard());
  assert.deepEqual(first, makePrompts(storyboard()));
  assert.match(first.entries[0].prompt, /no lettering/i);
  assert.match(first.entries[0].prompt, /3 panels/);
  const changed = storyboard(); changed.strips[0].panels[0].scene = 'A guard closes the door.';
  assert.notEqual(first.entries[0].promptHash, makePrompts(changed).entries[0].promptHash);
});

test('missing artwork produces an explicit incomplete artifact rather than an imitation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'xkcd-missing-'));
  try {
    const manifest = await renderComic(context, storyboard(), dir);
    assert.equal(manifest.status, 'incomplete');
    assert.equal(manifest.artifacts.some(item => item.path.endsWith('.png')), false);
    assert.match(await readFile(path.join(dir, 'index.html'), 'utf8'), /Generative artwork required/);
    assert.match(await readFile(path.join(dir, 'transcript.md'), 'utf8'), /local guard does not prove/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('rejects non-image artwork instead of embedding executable or corrupt content', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'xkcd-image-'));
  try {
    const image = path.join(dir, 'fake.png'); await writeFile(image, '<svg onload="alert(1)"></svg>');
    await assert.rejects(renderComic(context, storyboard(), dir, { artwork: image }), /PNG, JPEG, or WebP/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('requires a complete and unambiguous panel-artwork mapping', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'xkcd-mapping-'));
  try {
    await assert.rejects(renderComic(context, storyboard(), dir, { artwork: { 'billing-lock': { panels: ['only-one.png'] } } }), /Expected 3 panel images/);
    const board = storyboard(); board.strips.push({ ...structuredClone(board.strips[0]), id: 'another-strip' });
    await assert.rejects(renderComic(context, board, dir, { artwork: 'one-strip.png' }), /exactly one strip/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('composition is offline, escapes dialogue, exports a PNG, and reuses matching artwork', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'xkcd-browser-'));
  try {
    const image = path.join(dir, 'model.png'); await writeFile(image, png);
    const board = storyboard(); board.strips[0].panels[0].dialogue[0].text = '</p><script>globalThis.pwned=1</script>';
    const manifest = await renderComic(context, board, dir, { artwork: image });
    assert.equal(manifest.status, 'complete');
    const html = await readFile(path.join(dir, 'index.html'), 'utf8');
    assert.match(html, /data:image\/png;base64,/);
    assert.doesNotMatch(html, /<script>globalThis/);
    assert.match(html, /&lt;script&gt;/);
    const output = await readFile(path.join(dir, 'comic-01.png'));
    assert.deepEqual(output.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(output.readUInt32BE(16), 1440);
    const resumed = await renderComic(context, board, dir);
    assert.equal(resumed.status, 'complete');
    const changed = structuredClone(board); changed.strips[0].panels[0].scene += ' A new character arrives.';
    const stale = await renderComic(context, changed, dir);
    assert.equal(stale.status, 'incomplete');
    assert.equal(stale.artifacts.some(item => item.path === 'comic-01.png'), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
