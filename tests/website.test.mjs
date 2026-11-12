import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { ROOT } from '../scripts/build-skills.mjs';
import { loadBrowser } from '../packages/core/scripts/core.mjs';
import { demoSchema } from '../website/src/lib/homepage-schema.ts';
import { checkHomepage } from './helpers/homepage.mjs';

const run = promisify(execFile);
const base = { id: 'example', label: 'Example', command: '/example', title: 'Example', description: 'Illustrative change' };
const source = { file: 'example.ts', code: 'return true;' };

test('preview content rejects broken answer and graph references', () => {
  const question = { id: 'q', prompt: 'What happens?', options: ['a', 'b', 'c'].map(id => ({ id, text: id, feedback: id })), correctOptionId: 'b', explanation: 'The answer is b.', source };
  const quiz = { ...base, kind: 'review-quiz', questions: [question] };
  assert.equal(demoSchema.safeParse(quiz).success, true);
  assert.equal(demoSchema.safeParse({ ...quiz, questions: [{ ...question, correctOptionId: 'missing' }] }).success, false);
  assert.equal(demoSchema.safeParse({ ...quiz, questions: [question, question] }).success, false);
  const graph = { ...base, kind: 'code-map', nodes: [{ id: 'one', name: 'one', role: 'Entry', source }, { id: 'two', name: 'two', role: 'Save', source }], edges: [{ from: 'one', to: 'two', label: 'calls' }] };
  assert.equal(demoSchema.safeParse(graph).success, true);
  assert.equal(demoSchema.safeParse({ ...graph, edges: [{ from: 'one', to: 'missing', label: 'calls' }] }).success, false);
});

test('production homepage supports previews, keyboard, copy fallback, mobile, and no-script reading', { timeout: 300000 }, async () => {
  // Astro moves assets with rename(), so the build output must share its drive.
  const cache = path.join(ROOT, 'website/node_modules/.cache');
  await mkdir(cache, { recursive: true });
  const directory = await mkdtemp(path.join(cache, 'code-unpacked-homepage-'));
  const output = path.join(directory, 'site');
  let browser;
  let server;
  try {
    await run(process.execPath, [path.join(ROOT, 'website/node_modules/astro/bin/astro.mjs'), 'build', '--outDir', output], { cwd: path.join(ROOT, 'website'), windowsHide: true, timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
    server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const file = path.resolve(output, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
        const relative = path.relative(output, file);
        if (relative.startsWith('..') || path.isAbsolute(relative)) { response.writeHead(403).end(); return; }
        const body = await readFile(file);
        response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
        response.end(body);
      } catch { response.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    browser = await loadBrowser();
    await checkHomepage(browser, `http://127.0.0.1:${address.port}`);
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    assert.ok(path.resolve(directory).startsWith(path.resolve(cache) + path.sep));
    assert.ok(path.basename(directory).startsWith('code-unpacked-homepage-'));
    await rm(directory, { recursive: true, force: true });
  }
});
