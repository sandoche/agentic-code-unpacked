import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { loadBrowser } from '../../code-unpacked-core/scripts/core.mjs';
import { renderQuiz } from '../scripts/review-quiz.mjs';
import { context, quizFixture } from './fixtures.mjs';

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
