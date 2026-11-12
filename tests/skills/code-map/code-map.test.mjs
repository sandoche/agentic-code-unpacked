import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildMap, renderCodeMap } from '../../../skills/code-map/scripts/code-map.mjs';
import { loadBrowser } from '../../../skills/code-map/runtime/scripts/core.mjs';

function fixture() {
  return {
    schemaVersion: 1,
    target: { kind: 'pr', number: 234, repo: 'example/project' },
    source: { head: 'abc123', base: 'def456', repo: 'example/project' },
    limitations: [],
    files: [
      { id: 'b', path: 'src/b.js', status: 'added', content: 'export const b = 2;\n', hunks: [{ header: '@@ -0,0 +1 @@', oldStart: 0, newStart: 1, lines: [{ kind: 'add', text: 'export const b = 2;', oldLine: null, newLine: 1 }] }] },
      { id: 'a', path: 'src/a.js', oldPath: 'old/a.js', status: 'renamed', content: 'import { b } from "./b.js";\n', baseContent: 'export const a = 1;\n', hunks: [] },
      { id: 'bin', path: 'image.png', status: 'deleted', binary: true, omission: 'Binary source', hunks: [] },
    ],
    evidence: [
      { id: 'ea', fileId: 'a', side: 'head', startLine: 1, endLine: 1 },
      { id: 'eb', fileId: 'b', side: 'head', startLine: 1, endLine: 1 },
    ],
    relationships: [{ id: 'import', fromFileId: 'a', toFileId: 'b', label: 'imports', evidenceIds: ['ea'] }],
  };
}

test('directory grouping, layout, and output ordering are stable across input ordering', () => {
  const context = fixture();
  for (const file of context.files) Object.freeze(file);
  const first = buildMap(context);
  const second = buildMap({ ...context, files: [...context.files].reverse(), evidence: [...context.evidence].reverse() });
  assert.deepEqual(first, second);
  assert.deepEqual(first.nodes.map(node => node.path), ['image.png', 'src/a.js', 'src/b.js']);
  assert.equal(first.groups.find(group => group.name === 'src').fileIds.length, 2);
  assert.ok(first.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
  assert.equal(first.nodes.find(node => node.id === 'a').oldPath, 'old/a.js');
  assert.equal(first.nodes.find(node => node.id === 'bin').binary, true);
});

test('many directory groups pack into balanced non-overlapping bounds deterministically', () => {
  const context = { schemaVersion: 1, target: { kind: 'codebase' }, source: { head: 'abc123' }, limitations: [], evidence: [], relationships: [], files: Array.from({ length: 90 }, (_, i) => ({ id: `f${i}`, path: `src/group-${String(Math.floor(i / 2)).padStart(2, '0')}/file-${i}.js`, status: 'snapshot', content: 'code', hunks: [] })) };
  const map = buildMap(context);
  assert.deepEqual(map, buildMap({ ...context, files: [...context.files].reverse() }));
  const width = Math.max(...map.nodes.map(node => node.x + node.width)) - Math.min(...map.nodes.map(node => node.x));
  const height = Math.max(...map.nodes.map(node => node.y + node.height)) - Math.min(...map.nodes.map(node => node.y));
  assert.ok(width / height > .65 && width / height < 1.8, `expected balanced bounds, got ${width}×${height}`);
  assert.ok(new Set(map.groups.map(group => group.x)).size > 1, 'directory groups must use more than one column');
  const rectangles = map.groups.map(group => {
    const files = map.nodes.filter(node => group.fileIds.includes(node.id));
    return { name: group.name, x: group.x, y: group.y, right: Math.max(...files.map(node => node.x + node.width)), bottom: Math.max(...files.map(node => node.y + node.height)) };
  });
  for (let i = 0; i < rectangles.length; i++) for (let j = i + 1; j < rectangles.length; j++) {
    const a = rectangles[i], b = rectangles[j];
    assert.ok(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y, `overlapping directory groups: ${a.name}, ${b.name}`);
  }
});

test('a large single directory can widen beyond three cards to stay balanced', () => {
  const context = { schemaVersion: 1, target: { kind: 'codebase' }, source: { head: 'abc123' }, limitations: [], evidence: [], relationships: [], files: Array.from({ length: 90 }, (_, i) => ({ id: `f${i}`, path: `src/file-${i}.js`, status: 'snapshot', content: 'code', hunks: [] })) };
  const map = buildMap(context);
  const width = Math.max(...map.nodes.map(node => node.x + node.width)) - Math.min(...map.nodes.map(node => node.x));
  const height = Math.max(...map.nodes.map(node => node.y + node.height)) - Math.min(...map.nodes.map(node => node.y));
  assert.ok(width / height > .65 && width / height < 1.8, `expected balanced bounds, got ${width}×${height}`);
  for (let i = 0; i < map.nodes.length; i++) for (let j = i + 1; j < map.nodes.length; j++) {
    const a = map.nodes[i], b = map.nodes[j];
    assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, 'file cards must not overlap');
  }
});

test('only valid source-backed annotations and relationships are accepted', () => {
  const context = fixture();
  assert.throws(() => buildMap(context, { schemaVersion: 1, annotations: [{ id: 'note', fileId: 'a', title: 'Title', text: 'Text', evidenceIds: [] }] }), /evidence/i);
  assert.throws(() => buildMap(context, { schemaVersion: 1, annotations: [{ id: 'note', fileId: 'missing', title: 'Title', text: 'Text', evidenceIds: ['ea'] }] }), /file/i);
  assert.throws(() => buildMap(context, { schemaVersion: 1, relationships: [{ id: 'edge', fromFileId: 'a', toFileId: 'missing', label: 'calls', evidenceIds: ['ea'] }] }), /endpoint/i);
  assert.throws(() => buildMap(context, { schemaVersion: 1, relationships: [{ id: 'import', fromFileId: 'a', toFileId: 'b', label: 'imports', evidenceIds: ['ea'] }] }), /duplicate/i);
  assert.throws(() => buildMap({ ...context, files: [...context.files, context.files[0]] }), /duplicate/i);
  const map = buildMap(context, { schemaVersion: 1, annotations: [{ id: 'note', fileId: 'a', title: 'Import', text: 'Uses b.', evidenceIds: ['ea'] }] });
  assert.equal(map.annotations[0].citations[0].path, 'src/a.js');
  assert.equal(map.relationships[0].label, 'imports');
});

test('snapshot selections preserve range and missing relationships remain an explicit limitation', () => {
  const context = fixture();
  context.target = { kind: 'docs', name: 'selection' };
  context.files = [{ id: 'a', path: 'a.js', status: 'snapshot', content: 'one\ntwo\nthree', selectedRange: [2, 2], hunks: [] }];
  context.evidence = [{ id: 'ea', fileId: 'a', side: 'head', startLine: 2, endLine: 2 }];
  context.relationships = [];
  const map = buildMap(context);
  assert.deepEqual(map.nodes[0].selectedRange, [2, 2]);
  assert.match(map.limitations.join(' '), /relationships.*supplied/i);
});

test('rendered artifact escapes hostile data and records its actual outputs', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'code-map-'));
  try {
    const context = fixture();
    context.files[0].path = '<img src=x onerror=alert(1)>.js';
    context.files[0].content = '</script><script>globalThis.compromised=true</script>\n';
    const content = { schemaVersion: 1, title: '</title><script>bad()</script>', summary: '<b>plain text</b>' };
    await renderCodeMap(context, content, dir);
    const html = await readFile(path.join(dir, 'index.html'), 'utf8');
    assert.ok(!html.includes('<script>globalThis.compromised'));
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('\\u003c/script>'));
    assert.ok(html.includes('&lt;b&gt;plain text&lt;/b&gt;'));
    const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
    for (const expected of ['map.json', 'index.html', 'comment.md']) assert.ok(manifest.artifacts.some(file => file.path === expected));
    assert.equal(manifest.skill, 'code-map');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('offline browser supports search, selection, zoom, drag, reset and lazy code', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'code-map-browser-'));
  const browser = await loadBrowser();
  try {
    const context = fixture();
    context.files[0].content = '</script><script>globalThis.compromised=true</script>\n';
    await renderCodeMap(context, undefined, dir);
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const requests = [];
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
    await page.locator('.file-card').first().waitFor();
    assert.equal(await page.locator('.file-card').count(), 3);
    assert.equal(await page.locator('.file-card pre').count(), 0, 'source is rendered only in selected detail panel');
    await page.getByRole('button', { name: 'src/b.js', exact: true }).click();
    assert.match(await page.locator('#detail').innerText(), /export const b = 2/);
    assert.equal(await page.evaluate(() => globalThis.compromised), undefined);
    await page.getByRole('searchbox').fill('src/b');
    assert.equal(await page.locator('.file-card:visible').count(), 1);
    await page.getByRole('searchbox').fill('');
    const beforeZoom = await page.locator('#plane').getAttribute('style');
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    assert.notEqual(await page.locator('#plane').getAttribute('style'), beforeZoom);
    await page.getByRole('button', { name: 'Fit files', exact: true }).click();
    const card = page.locator('.file-card[data-id="a"] .card-heading');
    const box = await card.boundingBox();
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 70, box.y + 50, { steps: 4 });
    await page.mouse.up();
    assert.equal(await page.locator('.file-card[data-id="a"]').getAttribute('data-moved'), 'true');
    await page.getByRole('button', { name: 'Reset layout', exact: true }).click();
    assert.equal(await page.locator('.file-card[data-id="a"]').getAttribute('data-moved'), 'false');
    await page.getByRole('button', { name: 'src/a.js', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#detail').innerText(), /old\/a.js/);
    assert.deepEqual(requests, []);
  } finally { await browser.close(); await rm(dir, { recursive: true, force: true }); }
});

test('large map keeps every path searchable without eager source elements', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'code-map-large-'));
  const browser = await loadBrowser();
  try {
    const context = { schemaVersion: 1, target: { kind: 'codebase' }, source: { head: 'abc123' }, limitations: [], evidence: [], relationships: [], files: Array.from({ length: 350 }, (_, i) => ({ id: `f${i}`, path: `src/file-${i}.js`, status: 'snapshot', content: 'const value = 1;\n', hunks: [] })) };
    await renderCodeMap(context, undefined, dir);
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
    await page.getByRole('searchbox').fill('file-349.js');
    assert.equal(await page.locator('.file-card:visible').count(), 1);
    assert.equal(await page.locator('.file-card pre').count(), 0);
    await page.getByRole('button', { name: 'src/file-349.js', exact: true }).click();
    assert.match(await page.locator('#detail').innerText(), /const value = 1/);
  } finally { await browser.close(); await rm(dir, { recursive: true, force: true }); }
});
