import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { buildMap, renderCodeMap } from '../scripts/code-map.mjs';
import { analyzeStructure } from '../../code-unpacked-core/scripts/analysis.mjs';
import { loadBrowser } from '../../code-unpacked-core/scripts/core.mjs';

async function fixture() {
  const files = [
    { id: 'app', path: 'src/app.js', status: 'modified', content: "import { worker, Worker } from './lib.js';\nexport function start() {\n const job = new Worker();\n return worker(job);\n}\n", hunks: [] },
    { id: 'lib', path: 'src/lib.js', status: 'context', role: 'context', content: 'export class Worker {}\nexport function worker(job) {\n return dynamicThing(job);\n}\n', hunks: [] },
    { id: 'test', path: 'test/app.test.js', status: 'modified', role: 'context', content: "test('start', start);\n", hunks: [] },
    { id: 'routes', path: 'routes.js', status: 'context', role: 'context', content: "app.get('/start', start);\n", hunks: [] },
  ];
  const context = await analyzeStructure({ schemaVersion: 2, target: { kind: 'pr', number: 234, repo: 'example/project' }, source: { head: 'abc123', base: 'def456' }, limitations: ['Conservative source extraction; external targets are not inferred.'], files, evidence: files.map(file => ({ id: `e-${file.id}`, fileId: file.id, side: 'head', startLine: 1, endLine: file.content.trimEnd().split('\n').length })), relationships: [] });
  const start = context.symbols.find(symbol => symbol.name === 'start');
  context.relationships.push(
    { id: 'route', fromFileId: 'routes', toFileId: 'app', toSymbolId: start.id, kind: 'routes', label: 'GET /start → start', evidenceIds: ['e-routes', 'e-app'], provenance: 'source-verified' },
    { id: 'test-edge', fromFileId: 'test', toFileId: 'app', toSymbolId: start.id, kind: 'tests', label: 'tests start', evidenceIds: ['e-test', 'e-app'], provenance: 'source-verified' },
  );
  context.analysis = {
    schemaVersion: 2, title: 'Start a job', summary: 'A request creates a worker and executes a job.', evidenceIds: ['e-app'],
    topics: [
      { id: 'runtime', title: 'Job runtime', summary: 'Start delegates execution to the worker.', evidenceIds: ['e-app', 'e-lib'], reviewFocus: [{ text: 'Inspect the dynamic target.', evidenceIds: ['e-lib'] }], extensionPoints: [{ text: 'Consider handling a new job type here.', evidenceIds: ['e-lib'], basis: 'proposed' }] },
      { id: 'testing', title: 'Test coverage', summary: 'The test references the request entry point.', evidenceIds: ['e-test'], reviewFocus: [], extensionPoints: [] },
    ],
    flows: [
      { id: 'execution', title: 'Execute a job', evidenceIds: ['e-app', 'e-lib'], steps: [{ text: 'Create a worker.', evidenceIds: ['e-app'], symbolIds: [start.id] }, { text: 'Execute the job.', evidenceIds: ['e-lib'], symbolIds: [context.symbols.find(symbol => symbol.name === 'worker').id] }] },
      { id: 'evidence-only', title: 'Verify the entry point', evidenceIds: ['e-app'], steps: [{ text: 'Read the contextual test.', evidenceIds: ['e-test'] }] },
    ],
    fileCoverage: [{ fileId: 'app', role: 'substantive', topicIds: ['runtime'], reason: 'Changes job execution.' }, { fileId: 'test', role: 'supporting', topicIds: ['testing'], reason: 'Contextual test reference.' }], limitations: ['The external dynamic target is not captured.'],
  };
  return context;
}

test('v2 structure, teaching filters, context roles, and graph provenance are consumed without content', async () => {
  const context = await fixture();
  const map = buildMap(context);
  assert.equal(map.schemaVersion, 2);
  assert.equal(map.title, 'Start a job');
  assert.ok(map.symbols.some(symbol => symbol.name === 'start' && symbol.anchor));
  assert.deepEqual(new Set(map.relationships.map(edge => edge.kind)), new Set(['calls', 'constructs', 'imports', 'routes', 'tests']));
  assert.ok(map.relationships.every(edge => edge.provenance && edge.citations.length));
  assert.equal(map.nodes.find(node => node.id === 'lib').contextual, true);
  assert.equal(map.nodes.find(node => node.id === 'test').contextual, true, 'role context wins over a modified status');
  assert.deepEqual(map.topics.find(topic => topic.id === 'runtime').fileIds, ['app', 'lib']);
  assert.deepEqual(map.flows[0].fileIds, ['app', 'lib']);
  assert.ok(map.flows[0].symbolIds.length === 2);
  assert.deepEqual(map.flows.find(flow => flow.id === 'evidence-only').fileIds, ['app', 'test'], 'step evidence participates even without symbol IDs');
  assert.ok(map.unresolved.some(item => item.expression === 'dynamicThing'));
  assert.match(map.limitations.join(' '), /external dynamic target/);
  assert.deepEqual(map, buildMap({ ...context, files: [...context.files].reverse(), symbols: [...context.symbols].reverse(), relationships: [...context.relationships].reverse() }));
});

test('v2 rejects dangling symbol endpoints, incorrect ownership and unsupported source ranges', async () => {
  const context = await fixture();
  assert.throws(() => buildMap({ ...context, relationships: [...context.relationships, { id: 'bad', fromFileId: 'app', toFileId: 'lib', fromSymbolId: 'missing', kind: 'calls', label: 'calls missing', provenance: 'source-verified', evidenceIds: ['e-app'] }] }), /symbol/i);
  assert.throws(() => buildMap({ ...context, symbols: context.symbols.map((symbol, index) => index ? symbol : { ...symbol, fileId: 'test' }) }), /symbol.*(?:file|evidence|range)|ownership/i);
  assert.throws(() => buildMap({ ...context, symbols: context.symbols.map((symbol, index) => index ? symbol : { ...symbol, endLine: 1000 }) }), /range/i);
  assert.throws(() => buildMap({ ...context, unresolved: [{ fileId: 'missing', expression: 'unknown', reason: 'dynamic' }] }), /unresolved.*file/i);
  assert.throws(() => buildMap({ ...context, relationships: context.relationships.map((edge, index) => index ? edge : { ...edge, kind: {} }) }), /kind/i);
  assert.throws(() => buildMap({ ...context, relationships: context.relationships.map((edge, index) => index ? edge : { ...edge, provenance: [] }) }), /provenance/i);
});

test('legacy context and authored notes remain valid while v2 authored graph keeps typed provenance', () => {
  const legacy = { schemaVersion: 1, target: { kind: 'docs', name: 'selected' }, source: { head: 'abc' }, limitations: [], files: [{ id: 'one', path: 'one.js', status: 'snapshot', content: 'const one = 1;', hunks: [] }], evidence: [{ id: 'e', fileId: 'one', side: 'head', startLine: 1, endLine: 1 }] };
  const map = buildMap(legacy, { schemaVersion: 1, annotations: [{ id: 'n', fileId: 'one', title: 'One', text: 'A constant.', evidenceIds: ['e'] }] });
  assert.equal(map.schemaVersion, 2);
  assert.deepEqual(map.symbols, []);
  assert.equal(map.annotations[0].title, 'One');
  assert.doesNotThrow(() => buildMap(legacy, { schemaVersion: 2 }));
});

test('offline symbol navigation, typed edge and teaching filters, and highlighting work lazily', async () => {
  const context = await fixture();
  const dir = await mkdtemp(path.join(os.tmpdir(), 'code-map-v2-'));
  const browser = await loadBrowser();
  try {
    await renderCodeMap(context, undefined, dir);
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const requests = [];
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
    assert.equal(await page.locator('.source-code').count(), 0);
    assert.equal(await page.getByRole('checkbox', { name: 'Changed only' }).isChecked(), true);
    assert.equal(await page.locator('.file-card:visible').count(), 1, 'context nodes are hidden in the default PR overview');
    await page.getByRole('checkbox', { name: 'Changed only' }).check();
    assert.equal(await page.locator('.file-card:visible').count(), 1);
    await page.getByRole('checkbox', { name: 'Changed only' }).uncheck();
    await page.getByLabel('Topic', { exact: true }).selectOption('testing');
    assert.equal(await page.locator('.file-card:visible').count(), 1);
    await page.getByLabel('Topic', { exact: true }).selectOption('');
    await page.getByLabel('Flow', { exact: true }).selectOption('execution');
    assert.equal(await page.locator('.file-card:visible').count(), 2);
    await page.getByLabel('Relationship type', { exact: true }).selectOption('calls');
    assert.equal(await page.locator('path.edge').count(), 1);
    assert.equal(await page.locator('path.edge').getAttribute('data-kind'), 'calls');
    await page.getByLabel('Relationship type', { exact: true }).selectOption('');
    await page.getByRole('button', { name: 'src/app.js', exact: true }).click();
    await page.getByRole('button', { name: 'Open symbol start', exact: true }).click();
    assert.equal(await page.locator('#detail h2').innerText(), 'start');
    assert.match(page.url(), /#symbol=/);
    assert.match(await page.locator('#callees').innerText(), /worker/);
    assert.doesNotMatch(await page.locator('#callees').innerText(), /imports/);
    assert.match(await page.locator('#constructs').innerText(), /Worker/);
    assert.match(await page.locator('#routes').innerText(), /GET \/start/);
    assert.match(await page.locator('#tests').innerText(), /tests start/);
    assert.ok(await page.locator('#detail .source-code span[style]').count() > 0, 'generated highlighting is present only after selection');
    await page.locator('#callees').getByRole('button', { name: 'Open symbol worker', exact: true }).click();
    assert.equal(await page.locator('#detail h2').innerText(), 'worker');
    assert.match(await page.locator('#callers').innerText(), /start/);
    assert.match(await page.locator('#unresolved').innerText(), /dynamicThing/);
    assert.match(await page.locator('#detail').innerText(), /source-ast/);
    const anchor = page.url();
    await page.reload();
    assert.equal(page.url(), anchor);
    assert.equal(await page.locator('#detail h2').innerText(), 'worker');
    assert.deepEqual(requests, []);
  } finally { await browser.close(); await rm(dir, { recursive: true, force: true }); }
});

test('many source citations remain accessible without burying first-viewport function navigation', async () => {
  const context = await fixture();
  const app = context.files.find(file => file.id === 'app');
  app.path = 'frontend/src/app/components/editlist/CreatablePicker.js';
  const source = context.evidence.find(item => item.id === 'e-app');
  for (let index = 0; index < 50; index++) context.evidence.push({ ...source, id: `extra-source-${index}` });
  for (const evidence of context.evidence) evidence.url = `https://github.com/example/project/blob/abc123/${context.files.find(file => file.id === evidence.fileId).path}#L${evidence.startLine}-L${evidence.endLine}`;
  const count = context.evidence.filter(item => item.fileId === app.id).length;
  const dir = await mkdtemp(path.join(os.tmpdir(), 'code-map-progressive-'));
  const browser = await loadBrowser();
  try {
    await renderCodeMap(context, undefined, dir);
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
    await page.getByRole('button', { name: app.path, exact: true }).click();
    assert.equal(await page.locator('#detail > .primary-source .sources a').count(), 1, 'only the primary source link appears above navigation');
    const evidence = page.locator('#detail > details.source-evidence');
    assert.equal(await evidence.count(), 1);
    assert.equal(await evidence.getAttribute('open'), null, 'additional evidence starts collapsed');
    assert.equal(await evidence.locator('a').count(), count - 1, 'all remaining citations are retained');
    const panel = await page.locator('#detail').boundingBox();
    const functions = await page.locator('.symbol-list').boundingBox();
    const controls = await page.locator('#relationship-controls').boundingBox();
    assert.ok(functions.y >= panel.y && functions.y + functions.height <= panel.y + panel.height, 'function drilldown must be visible in the first sidebar viewport');
    assert.ok(controls.y >= panel.y && controls.y + controls.height <= panel.y + panel.height, 'relationship navigation must be visible before dense details');
    assert.equal(await page.evaluate(() => !!(document.getElementById('relationship-controls').compareDocumentPosition(document.querySelector('#detail pre')) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
    await page.getByRole('button', { name: 'Show callees', exact: true }).click();
    const callees = await page.locator('#callees').boundingBox();
    assert.ok(callees.y >= panel.y - 1 && callees.y < panel.y + panel.height, 'the compact control jumps directly to caller/callee details');
    await evidence.locator('summary').click();
    assert.notEqual(await evidence.getAttribute('open'), null);
    await page.getByRole('button', { name: app.path, exact: true }).click();
    assert.equal(await page.locator('#detail').evaluate(node => node.scrollTop), 0, 'a new selection restores navigation to the top');
  } finally { await browser.close(); await rm(dir, { recursive: true, force: true }); }
});
