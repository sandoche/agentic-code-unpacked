import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { loadBrowser } from '../../../skills/review-quiz/runtime/scripts/core.mjs';
import { renderQuiz } from '../../../skills/review-quiz/scripts/review-quiz.mjs';
import { context, quizFixture, architectureContext, architectureQuizFixture } from './fixtures.mjs';

test('mobile quiz wraps complete long source coverage paths', async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-quiz-mobile-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const limitation='compiler/packages/babel-plugin-react-compiler/src/__tests__/fixtures/compiler/error.component-syntax-ref-gating.flow.js: parser diagnostics; structure omitted';
  await renderQuiz({...context,limitations:[limitation]},quizFixture(),dir);
  const browser=await loadBrowser();t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(pathToFileURL(path.join(dir,'index.html')).href);
  assert.ok((await page.locator('.coverage').textContent()).includes(limitation),'the entire source omission must remain visible');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390,'source paths must not widen the mobile document');
  await page.getByRole('button',{name:'Check understanding'}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390,'revealed feedback must retain the mobile width');
});

test('offline quiz supports keyboard answers, score, recommendations, resubmit, and reset', { timeout: 120000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'review-quiz-browser-'));
  let browser;
  try {
    const quiz = quizFixture();
    quiz.schemaVersion = 2;
    quiz.requestedCount = 12;
    quiz.insufficientEvidence = 'The selected handler supports only three distinct checks.';
    quiz.title = '</script><script>globalThis.injected=true</script>';
    quiz.questions[0].prompt = '<img src=x onerror="globalThis.injected=true">';
    await renderQuiz(context, quiz, dir);
    browser = await loadBrowser();
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
    assert.match(await page.locator('.question-count').textContent(), /3 of 12 requested questions/);
    assert.match(await page.locator('.question-count').textContent(), /only three distinct checks/);
    await page.waitForFunction(() => document.getElementById('answer-progress').textContent === '0 of 3 answered');
    assert.equal(await page.locator('.feedback:visible').count(), 0);
    assert.equal(await page.locator('#results').isVisible(), false);
    assert.equal(await page.evaluate(() => globalThis.injected), undefined);
    assert.match(await page.locator('legend').first().textContent(), /<img src=x/);

    const first = page.getByLabel('The input value', { exact: true });
    await first.focus();
    await page.keyboard.press('Space');
    await page.getByLabel('The value is saved', { exact: true }).check();
    assert.equal(await page.locator('#answer-progress').textContent(), '2 of 3 answered');
    await page.getByRole('button', { name: 'Check understanding' }).click();
    assert.equal(await page.locator('#score').textContent(), '33%');
    assert.match(await page.locator('#score-detail').textContent(), /1 correct · 1 incorrect · 1 unanswered/);
    assert.equal(await page.locator('.feedback:visible').count(), 3);
    assert.match(await page.locator('#recommendations').textContent(), /Trace falsy values through the guard/);
    assert.match(await page.locator('#recommendations').textContent(), /handler\.js:1/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'results');

    await page.getByLabel('A missing-value error is thrown', { exact: true }).check();
    assert.equal(await page.locator('#results').isVisible(), false);
    await page.getByLabel('The guard throws', { exact: true }).check();
    await page.getByRole('button', { name: 'Check understanding' }).click();
    assert.equal(await page.locator('#score').textContent(), '100%');
    assert.match(await page.locator('#recommendations').textContent(), /All answers are correct/);

    await page.getByRole('button', { name: 'Reset quiz' }).click();
    assert.equal(await page.locator('input:checked').count(), 0);
    assert.equal(await page.locator('#answer-progress').textContent(), '0 of 3 answered');
    assert.equal(await page.locator('#results').isVisible(), false);
    assert.equal(await page.locator('.feedback:visible').count(), 0);
    await first.check();
    await page.reload();
    assert.equal(await page.locator('input:checked').count(), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
  } finally {
    await browser?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('architecture quiz renders offline charts, accessible choices, unique SVG IDs, and hidden corrections', { timeout: 120000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'review-quiz-diagrams-'));
  let browser;
  try {
    const quiz = architectureQuizFixture();
    // Authored metadata is escaped independently of the Mermaid source.
    quiz.questions[0].diagram.title = '<img src=x onerror="globalThis.injected=true">';
    quiz.questions[0].diagram.description += ' <script>globalThis.injected=true</script>';
    await renderQuiz(architectureContext, quiz, dir);
    assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'quiz.json'), 'utf8')).questions, quiz.questions);
    browser = await loadBrowser();
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
    await page.waitForFunction(() => document.getElementById('answer-progress').textContent === '0 of 3 answered');
    assert.equal(await page.locator('.quiz-diagram svg').count(), 7);
    assert.equal(await page.locator('.quiz-diagram:visible').count(), 5);
    assert.equal(await page.locator('.feedback .quiz-diagram:visible').count(), 0);
    assert.equal(await page.getByRole('img', { name: /unknown component before storage/ }).count(), 1);
    assert.equal(await page.evaluate(() => globalThis.injected), undefined);
    assert.match(await page.locator('.diagram-title').first().textContent(), /<img/);
    assert.equal(await page.locator('.quiz-diagram img, .quiz-diagram script').count(), 0);
    const svgReferences = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
      // Mermaid includes unused theme rules with optional gradient references.
      // Check references on drawn elements, scoped to their own diagram.
      const references = [];
      for (const svg of document.querySelectorAll('.quiz-diagram svg')) {
        for (const node of svg.querySelectorAll('*')) {
          for (const attribute of node.getAttributeNames()) {
            for (const match of node.getAttribute(attribute).matchAll(/url\(["']?#([^\s"')]+)["']?\)/g)) {
              references.push(svg.contains(document.getElementById(match[1])));
            }
          }
        }
      }
      return { unique: new Set(ids).size === ids.length, references: references.length, resolved: references.every(Boolean) };
    });
    assert.equal(svgReferences.unique, true);
    assert.ok(svgReferences.references > 0);
    assert.equal(svgReferences.resolved, true);

    await page.getByLabel('The repository', { exact: true }).focus();
    await page.keyboard.press('Space');
    const sequence = page.getByLabel('Sequence A', { exact: true });
    const descriptionId = await sequence.getAttribute('aria-describedby');
    assert.match(await page.locator(`[id="${descriptionId}"]`).textContent(), /handler calls the repository/i);
    await sequence.focus();
    await page.keyboard.press('Space');
    await page.getByRole('button', { name: 'Check understanding' }).click();
    assert.equal(await page.locator('#score').textContent(), '67%');
    assert.equal(await page.locator('.feedback .quiz-diagram:visible').count(), 2);
    assert.match(await page.locator('#recommendations').textContent(), /architecture/);
    assert.match(await page.locator('#recommendations').textContent(), /repository\.js:1/);

    await page.getByLabel('Insert a repository call before writing', { exact: true }).check();
    assert.equal(await page.locator('.feedback .quiz-diagram:visible').count(), 0);
    await page.getByRole('button', { name: 'Check understanding' }).click();
    assert.equal(await page.locator('#score').textContent(), '100%');
    await page.getByRole('button', { name: 'Reset quiz' }).click();
    assert.equal(await page.locator('.feedback .quiz-diagram:visible').count(), 0);
    assert.equal(await page.locator('input:checked').count(), 0);

    await page.setViewportSize({ width: 375, height: 812 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.ok(await page.locator('.diagram-scroll').first().evaluate(node => node.scrollWidth > node.clientWidth));
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
  } finally {
    await browser?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('invalid Mermaid preserves every previous quiz artifact', { timeout: 120000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'review-quiz-invalid-diagram-'));
  try {
    await renderQuiz(context, quizFixture(), dir);
    const files = await readdir(dir);
    const previous = await Promise.all(files.map(file => readFile(path.join(dir, file))));
    for (const location of [
      question => [question, 'diagram'],
      question => [question.options[0], 'diagram'],
      question => [question, 'explanationDiagram'],
    ]) {
      const quiz = architectureQuizFixture();
      const [owner, key] = location(quiz.questions[0]);
      owner[key] = { title: 'Malformed candidate', description: 'An invalid Mermaid chart.', mermaid: 'flowchart LR\n  A --> B[' };
      await assert.rejects(renderQuiz(architectureContext, quiz, dir), /Cannot render Mermaid diagram q-0/);
      assert.deepEqual(await readdir(dir), files);
      for (const [index, file] of files.entries()) assert.deepEqual(await readFile(path.join(dir, file)), previous[index]);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
