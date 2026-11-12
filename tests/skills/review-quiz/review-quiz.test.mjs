import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { validateQuiz, gradeQuiz, renderQuiz, parseQuestionCount } from '../../../skills/review-quiz/scripts/review-quiz.mjs';
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
    quiz => { quiz.schemaVersion = 3; },
  ]) {
    const quiz = quizFixture();
    mutate(quiz);
    assert.throws(() => validateQuiz(context, quiz));
  }
});

test('question count accepts positive integers and rejects ambiguous or invalid input', () => {
  assert.equal(parseQuestionCount(undefined), 8);
  assert.equal(parseQuestionCount('12'), 12);
  assert.equal(parseQuestionCount(1), 1);
  for (const value of ['0', 0, -1, '1.5', 1.5, 'abc', '1e2', 'Infinity', true, null, '9007199254740992']) {
    assert.throws(() => parseQuestionCount(value), /positive integer/i);
  }
});

test('v2 count validation honors the request and requires an evidence shortfall reason', () => {
  const quiz = { ...quizFixture(), schemaVersion: 2, requestedCount: 3 };
  quiz.questions[0].topic = 'extension';
  assert.equal(validateQuiz(context, quiz), quiz);
  assert.throws(() => validateQuiz(context, { ...quiz, requestedCount: 2 }), /more|exceed/i);
  assert.throws(() => validateQuiz(context, { ...quiz, requestedCount: 4 }), /insufficientEvidence/i);
  assert.equal(validateQuiz(context, { ...quiz, requestedCount: 4, insufficientEvidence: 'Only one small handler was captured.' }).questions.length, 3);
  assert.throws(() => validateQuiz(context, { ...quiz, generatedCount: 2 }), /generatedCount/i);
  assert.throws(() => validateQuiz(context, { ...quiz, requestedCount: 0 }), /positive integer/i);
  assert.throws(() => validateQuiz(context, { ...quiz, requestedCount: '3' }), /positive integer/i);
  assert.throws(() => validateQuiz(context, { ...quiz, requestedCount: null }), /positive integer/i);
  assert.throws(() => validateQuiz(context, quizFixture(), { questions: 2 }), /more|exceed/i);
  assert.throws(() => validateQuiz(context, quiz, { questions: 4 }), /request|questions/i);
  const defaultQuiz = { ...quiz, requestedCount: undefined, insufficientEvidence: 'Only three distinct checks are supported.' };
  assert.equal(validateQuiz(context, defaultQuiz), defaultQuiz);
});

test('rendered v2 metadata records requested and generated counts without padding', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'review-quiz-length-'));
  try {
    const quiz = { ...quizFixture(), schemaVersion: 2, requestedCount: 12, insufficientEvidence: 'The selection supports only three distinct source-backed checks.' };
    await renderQuiz(context, quiz, dir, { questions: 12 });
    const saved = JSON.parse(await readFile(path.join(dir, 'quiz.json'), 'utf8'));
    assert.equal(saved.requestedCount, 12);
    assert.equal(saved.generatedCount, 3);
    assert.equal(saved.questions.length, 3);
    const html = await readFile(path.join(dir, 'index.html'), 'utf8');
    assert.match(html, /3 of 12 requested questions/);
    assert.match(html, /selection supports only three distinct/);
    assert.equal(gradeQuiz(saved, {}).unanswered, 3);
    assert.equal(gradeQuiz(saved, { behavior: 'value', failure: 'throw', 'failure-again': 'throw' }).score, 100);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('CLI forwards --questions and preserves output on invalid count requests', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'review-quiz-cli-'));
  try {
    const contextFile = path.join(dir, 'context.json'), quizFile = path.join(dir, 'content.json');
    const quiz = { ...quizFixture(), schemaVersion: 2, requestedCount: 12, insufficientEvidence: 'Only three checks are supported by the selected handler.' };
    await writeFile(contextFile, JSON.stringify(context));
    await writeFile(quizFile, JSON.stringify(quiz));
    const script = fileURLToPath(new URL('../../../skills/review-quiz/scripts/review-quiz.mjs', import.meta.url));
    const args = [script, 'render', '--context', contextFile, '--content', quizFile, '--root', dir];
    execFileSync(process.execPath, [...args, '--questions', '12'], { windowsHide: true, stdio: 'pipe' });
    const savedPath = path.join(dir, '.code-unpacked', 'docs', 'fixture', 'review-quiz', 'quiz.json');
    const before = await readFile(savedPath, 'utf8');
    assert.equal(JSON.parse(before).requestedCount, 12);
    assert.throws(() => execFileSync(process.execPath, [...args, '--questions', '2.5'], { windowsHide: true, stdio: 'pipe' }), /positive integer/);
    assert.equal(await readFile(savedPath, 'utf8'), before);
  } finally { await rm(dir, { recursive: true, force: true }); }
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
