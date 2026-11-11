import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { FAMILIES, validateDesign, renderDesign, renderMarkdown } from '../scripts/reverse-design.mjs';
import { loadBrowser } from '../../code-unpacked-core/scripts/core.mjs';

const context = () => ({
  schemaVersion: 1, target: { kind: 'pr', repo: 'example/app', number: 7 },
  source: { head: 'abc123', base: 'def456', repo: 'example/app' },
  files: [{ id: 'route', path: 'src/route.js', content: 'export function get() {\n  return { ok: true };\n}\n', hunks: [] }],
  evidence: [{ id: 'route-head', fileId: 'route', startLine: 1, endLine: 3, side: 'head', url: 'https://github.com/example/app/blob/abc123/src/route.js#L1-L3' }],
  limitations: [],
});
const content = () => ({
  schemaVersion: 1, title: 'Understand the status route', summary: 'The route returns a success object.', summaryEvidence: ['route-head'],
  coverage: FAMILIES.map(family => ({ family, status: family === 'requirements' ? 'generated' : 'not-applicable', reason: family === 'requirements' ? 'The route exposes observable behavior.' : 'This small route does not establish this design family.', evidence: family === 'requirements' ? ['route-head'] : [] })),
  documents: [{ id: 'requirements', family: 'requirements', title: 'Observed requirements', sections: [{ heading: 'Successful requests', markdown: 'The handler returns **ok** as `true`.\n\n- Its response is synchronous.\n- No persistence is shown.', basis: 'observed', evidence: ['route-head'] }], diagrams: [] }],
  gaps: [],
});

test('requires all 11 families exactly once and source-backed generated documents', () => {
  assert.equal(FAMILIES.length, 11);
  assert.equal(validateDesign(context(), content()).title, 'Understand the status route');
  const missing = content(); missing.coverage.pop();
  assert.throws(() => validateDesign(context(), missing), /coverage/i);
  const duplicate = content(); duplicate.coverage.push(duplicate.coverage[0]);
  assert.throws(() => validateDesign(context(), duplicate), /duplicate/i);
  const absent = content(); absent.documents = [];
  assert.throws(() => validateDesign(context(), absent), /generated.*document|document.*generated/i);
});

test('rejects unresolved evidence, empty claims, invalid basis, and unsafe filenames', () => {
  for (const mutate of [
    c => { c.documents[0].sections[0].evidence = ['missing']; },
    c => { c.documents[0].sections[0].evidence = []; },
    c => { c.documents[0].sections[0].basis = 'fact'; },
    c => { c.documents[0].id = '../escape'; },
  ]) {
    const c = content(); mutate(c);
    assert.throws(() => validateDesign(context(), c));
  }
});

test('always requires an observed-requirements overview and rejects executable Mermaid directives', () => {
  const empty = content();
  empty.coverage[0].status = 'not-applicable'; empty.documents = [];
  assert.throws(() => validateDesign(context(), empty), /requirements|document/i);
  for (const mermaid of ['flowchart LR\n  A --> B\n  click A "https://example.com"', '%%{init: {}}%%\nflowchart LR\n A --> B']) {
    const c = content();
    c.documents[0].diagrams = [{ id: 'unsafe', title: 'Unsafe', mermaid, evidence: ['route-head'] }];
    assert.throws(() => validateDesign(context(), c), /unsafe.*mermaid/i);
  }
});

test('requires explicit reconstructed labeling for inferred decisions', () => {
  const c = content();
  c.coverage.find(x => x.family === 'decisions').status = 'generated';
  c.coverage.find(x => x.family === 'decisions').evidence = ['route-head'];
  c.documents.push({ id: 'decision', title: 'Why this route exists', family: 'decisions', sections: [{ heading: 'Likely rationale', markdown: 'It may be intended for readiness checks.', basis: 'inferred', evidence: ['route-head'] }] });
  assert.throws(() => validateDesign(context(), c), /reconstructed/i);
  c.documents[1].title = 'Reconstructed decision note: status response';
  assert.doesNotThrow(() => validateDesign(context(), c));
});

test('renders useful Markdown while keeping hostile markup and unsafe links inert', () => {
  const html = renderMarkdown('# A heading\n\n<script>globalThis.pwned=true</script>\n\n[bad](javascript:alert(1))\n\n```js\n<img src=x onerror=alert(1)>\n```');
  assert.match(html, /<h3>A heading<\/h3>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script|<img|href="javascript:/i);
});

test('writes deterministic offline HTML, Markdown, full coverage, and inline comment documents', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reverse-design-'));
  try {
    await renderDesign(context(), content(), dir);
    const first = await readFile(path.join(dir, 'index.html'), 'utf8');
    const markdown = await readFile(path.join(dir, 'requirements.md'), 'utf8');
    const comment = await readFile(path.join(dir, 'comment.md'), 'utf8');
    const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
    assert.match(first, /insufficient|not-applicable/);
    assert.match(markdown, /Observed/);
    assert.match(markdown, /src\/route\.js/);
    assert.match(comment, /## Observed requirements/);
    assert.ok(manifest.artifacts.some(x => x.path === 'requirements.md'));
    assert.doesNotMatch(first, /<script[^>]+src=|<link[^>]+href=/);
    await renderDesign(context(), content(), dir);
    assert.equal(await readFile(path.join(dir, 'index.html'), 'utf8'), first);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('browser can navigate coverage and displays hostile source text without execution', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reverse-design-browser-'));
  let browser;
  try {
    const c = content(); c.documents[0].sections[0].markdown += '\n\n<script>globalThis.pwned=true</script>';
    await renderDesign(context(), c, dir);
    browser = await loadBrowser();
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(new URL(`file:///${path.join(dir, 'index.html').replaceAll('\\', '/')}`).href);
    await page.getByRole('link', { name: 'Observed requirements', exact: true }).click();
    assert.equal(await page.locator('#requirements').count(), 1);
    assert.equal(await page.evaluate(() => globalThis.pwned), undefined);
    assert.equal(await page.locator('tbody tr').count(), 11);
    assert.deepEqual(errors, []);
  } finally { if (browser) await browser.close(); await rm(dir, { recursive: true, force: true }); }
});

test('renders multiple diagrams with one browser, unique SVG IDs, and no HTTP requests', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reverse-design-diagram-'));
  const require = createRequire(new URL('../../code-unpacked-core/scripts/core.mjs', import.meta.url));
  const { chromium } = require('playwright');
  const originalLaunch = chromium.launch;
  const requests = [];
  let successfulLaunches = 0, browser;
  chromium.launch = async function (...args) {
    const launched = await originalLaunch.apply(this, args);
    successfulLaunches++;
    const originalNewPage = launched.newPage.bind(launched);
    launched.newPage = async (...pageArgs) => {
      const page = await originalNewPage(...pageArgs);
      page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
      return page;
    };
    return launched;
  };
  try {
    const c = content();
    c.documents[0].diagrams.push({ id: 'route-flow', title: 'Route response', mermaid: 'flowchart LR\n  Request --> Handler --> Success', evidence: ['route-head'] });
    c.documents[0].diagrams.push({ id: 'route-sequence', title: 'Route sequence', mermaid: 'sequenceDiagram\n  Client->>Handler: get()\n  Handler-->>Client: ok', evidence: ['route-head'] });
    await renderDesign(context(), c, dir);
    assert.equal(successfulLaunches, 1, 'all diagrams must share one launched browser');
    assert.match(await readFile(path.join(dir, 'index.html'), 'utf8'), /<svg/);
    assert.match(await readFile(path.join(dir, 'comment.md'), 'utf8'), /```mermaid/);
    assert.ok((await readdir(dir)).includes('route-flow.mmd'));
    assert.ok((await readdir(dir)).includes('route-sequence.svg'));
    browser = await loadBrowser();
    const page = await browser.newPage();
    await page.goto(new URL(`file:///${path.join(dir, 'index.html').replaceAll('\\', '/')}`).href);
    const svgIds = await page.locator('.diagram svg [id], .diagram svg[id]').evaluateAll(elements => elements.map(element => element.id));
    assert.equal(await page.locator('.diagram svg').count(), 2);
    assert.ok(svgIds.length > 2);
    assert.equal(new Set(svgIds).size, svgIds.length, 'SVG IDs must be unique across the final document');
    assert.deepEqual(requests, [], 'rendering and opening the artifact must remain offline');
    c.documents[0].diagrams[0].mermaid = 'not a mermaid diagram at all';
    await assert.rejects(renderDesign(context(), c, dir), /diagram|mermaid/i);
  } finally {
    chromium.launch = originalLaunch;
    if (browser) await browser.close();
    await rm(dir, { recursive: true, force: true });
  }
});
