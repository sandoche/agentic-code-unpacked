import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { validateQuiz, gradeQuiz, renderQuiz } from '../scripts/review-quiz.mjs';
import { context, quizFixture } from './fixtures.mjs';

test('validates content, answer IDs, unique IDs, and evidence', () => {
  assert.equal(validateQuiz(context, quizFixture()).questions.length, 3);
  for (const mutate of [
    quiz => { quiz.questions[0].correctOptionId = 'missing'; },
    quiz => { quiz.questions[0].options[1].id = 'value'; },
    quiz => { quiz.questions[1].id = 'behavior'; },
    quiz => { quiz.questions[0].options.pop(); },
    quiz => { quiz.questions[0].evidence = ['unknown']; },
    quiz => { quiz.questions[0].evidence = []; },
    quiz => { quiz.questions[0].topic = 'approval'; },
    quiz => { quiz.questions = []; },
    quiz => { quiz.questions[0].recommendation = ''; },
    quiz => { quiz.questions[0].id = 123; },
    quiz => { quiz.questions[0].options[0].id = 123; quiz.questions[0].correctOptionId = 123; },
    quiz => { quiz.questions[0].options[1].text = ' The input value '; },
    quiz => { quiz.schemaVersion = 2; },
  ]) {
    const quiz = quizFixture();
    mutate(quiz);
    assert.throws(() => validateQuiz(context, quiz));
  }
});

test('grades all correct without recommendations', () => {
  const grade = gradeQuiz(quizFixture(), { behavior: 'value', failure: 'throw', 'failure-again': 'throw' });
  assert.equal(grade.score, 100);
  assert.equal(grade.correct, 3);
  assert.equal(grade.incorrect, 0);
  assert.equal(grade.unanswered, 0);
  assert.deepEqual(grade.recommendations, []);
});

test('grades mixed and unanswered answers, deduplicates and orders missed checks', () => {
  const grade = gradeQuiz(quizFixture(), { behavior: 'null', failure: 'saved' });
  assert.equal(grade.score, 0);
  assert.equal(grade.incorrect, 2);
  assert.equal(grade.unanswered, 1);
  assert.equal(grade.recommendations.length, 2);
  assert.equal(grade.recommendations[0].topic, 'failures');
  assert.equal(grade.recommendations[0].missed, 2);
  assert.deepEqual(grade.recommendations[0].checks, ['Trace falsy values through the guard.']);
  assert.equal(gradeQuiz(quizFixture(), { behavior: 'value' }).score, 33);
  assert.equal(gradeQuiz(quizFixture(), {}).unanswered, 3);
});

test('renders escaped, offline HTML and manifests while hiding feedback', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'review-quiz-'));
  try {
    const quiz = quizFixture();
    quiz.title = '</script><script>globalThis.injected=true</script>';
    quiz.questions[0].prompt = '<img src=x onerror="globalThis.injected=true">';
    const manifest = await renderQuiz(context, quiz, dir);
    const html = await readFile(path.join(dir, 'index.html'), 'utf8');
    assert.match(html, /&lt;img/);
    assert.doesNotMatch(html, /<img src=x/);
    assert.doesNotMatch(html, /<script>globalThis\.injected/);
    assert.match(html, /class="feedback" hidden/);
    assert.match(html, /type="application\/json"/);
    assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=/);
    assert.equal(manifest.skill, 'review-quiz');
    assert.ok(manifest.artifacts.some(artifact => artifact.path === 'index.html'));
    const saved = JSON.parse(await readFile(path.join(dir, 'quiz.json'), 'utf8'));
    assert.equal(saved.title, quiz.title);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
