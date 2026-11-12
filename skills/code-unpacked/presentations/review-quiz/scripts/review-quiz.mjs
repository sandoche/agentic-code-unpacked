#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {
  escapeHtml, parseArgs, outputDirectory, validateContext, assertEvidence,
  resolveEvidence, citationHtml, readJson, writeJson, renderShell, finishArtifact,
} from '../../../runtime/scripts/core.mjs';
export { gradeQuiz } from '../assets/quiz-runtime.mjs';

const TOPICS = new Set(['behavior', 'flow', 'interfaces', 'failures', 'tests', 'limitations', 'security', 'extension']);
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

export function parseQuestionCount(value = 8) {
  if ((typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)) throw Error('--questions must be a positive integer');
  const count = Number(value);
  if (!Number.isSafeInteger(count)) throw Error('--questions must be a positive integer');
  return count;
}

function quizCounts(quiz, { questions } = {}) {
  const explicit = questions !== undefined;
  if (quiz.requestedCount !== undefined && (typeof quiz.requestedCount !== 'number' || !Number.isSafeInteger(quiz.requestedCount) || quiz.requestedCount < 1)) throw Error('requestedCount must be a positive integer');
  const requestedCount = parseQuestionCount(explicit ? questions : quiz.requestedCount ?? (quiz.schemaVersion === 1 ? quiz.questions.length : 8));
  if (explicit && quiz.requestedCount !== undefined && requestedCount !== parseQuestionCount(quiz.requestedCount)) throw Error('Authored requestedCount differs from --questions; regenerate content for the requested length');
  const generatedCount = quiz.questions.length;
  if (generatedCount > requestedCount) throw Error('Quiz has more questions than requested; regenerate content for the requested length');
  if (generatedCount < requestedCount && !nonempty(quiz.insufficientEvidence)) throw Error('Fewer questions require an explicit insufficientEvidence reason; do not pad the quiz');
  if (quiz.generatedCount !== undefined && quiz.generatedCount !== generatedCount) throw Error('generatedCount must match the actual question count');
  if (quiz.insufficientEvidence !== undefined && !nonempty(quiz.insufficientEvidence)) throw Error('insufficientEvidence must be nonempty text');
  return { requestedCount, generatedCount };
}

export function validateQuiz(context, quiz, options = {}) {
  validateContext(context);
  if (![1, 2].includes(quiz?.schemaVersion) || !nonempty(quiz.title) || !Array.isArray(quiz.questions) || !quiz.questions.length) throw Error('Quiz requires schemaVersion 1 or 2, a title, and at least one question');
  quizCounts(quiz, options);
  if (quiz.summary !== undefined && typeof quiz.summary !== 'string') throw Error('Quiz summary must be text');
  if (quiz.limitations !== undefined && (!Array.isArray(quiz.limitations) || !quiz.limitations.every(nonempty))) throw Error('Quiz limitations must be nonempty strings');
  const ids = new Set();
  for (const question of quiz.questions) {
    if (!question || typeof question.id !== 'string' || !identifier.test(question.id) || ids.has(question.id)) throw Error('Invalid or duplicate question ID');
    ids.add(question.id);
    if (![question.prompt, question.explanation, question.recommendation].every(nonempty) || !TOPICS.has(question.topic)) throw Error(`Invalid question content: ${question.id}`);
    if (!Array.isArray(question.options) || question.options.length < 3 || question.options.length > 4) throw Error(`Question ${question.id} needs three or four options`);
    const options = new Set(), labels = new Set();
    for (const option of question.options) {
      if (!option || typeof option.id !== 'string' || !identifier.test(option.id) || options.has(option.id) || !nonempty(option.text)) throw Error(`Invalid or duplicate option: ${question.id}`);
      const label = option.text.trim().replace(/\s+/g, ' ').toLowerCase();
      if (labels.has(label)) throw Error(`Duplicate option text: ${question.id}`);
      labels.add(label);
      options.add(option.id);
    }
    if (!options.has(question.correctOptionId)) throw Error(`Unknown correct option: ${question.id}`);
    assertEvidence(context, question.evidence);
    if (!question.evidence.every(id => typeof id === 'string')) throw Error(`Invalid evidence ID: ${question.id}`);
  }
  return quiz;
}

export async function renderQuiz(context, original, dir, options = {}) {
  validateQuiz(context, original, options);
  const quiz = { ...original, ...quizCounts(original, options) };
  await mkdir(dir, { recursive: true });
  const questions = quiz.questions.map((question, questionIndex) => {
    const correct = question.options.find(option => option.id === question.correctOptionId);
    const choices = question.options.map((option, optionIndex) => `<label class="choice" for="choice-${questionIndex}-${optionIndex}"><input type="radio" id="choice-${questionIndex}-${optionIndex}" name="question-${questionIndex}" value="${escapeHtml(option.id)}"><span>${escapeHtml(option.text)}</span></label>`).join('');
    return `<fieldset><legend>${questionIndex + 1}. ${escapeHtml(question.prompt)}</legend>${choices}<div class="feedback" hidden><p class="answer-status"></p><p><strong>Correct answer:</strong> ${escapeHtml(correct.text)}</p><p>${escapeHtml(question.explanation)}</p><p class="sources">${citationHtml(context, question.evidence)}</p></div></fieldset>`;
  }).join('');
  const limitations = [...new Set([...(context.limitations || []), ...(quiz.limitations || []), ...(quiz.insufficientEvidence ? [quiz.insufficientEvidence] : [])])];
  const body = `<main><header><p class="eyebrow">Code Unpacked / Review quiz</p><h1>${escapeHtml(quiz.title)}</h1>${quiz.summary ? `<p>${escapeHtml(quiz.summary)}</p>` : ''}<p class="question-count">${quiz.generatedCount} of ${quiz.requestedCount} requested questions${quiz.insufficientEvidence ? ` · ${escapeHtml(quiz.insufficientEvidence)}` : ''}</p><p class="muted">Choose one answer per question, then check your understanding. Unanswered questions earn no points. Change an answer and resubmit to try again.</p><p class="revision muted">Source revision: ${escapeHtml(context.source.head || 'local snapshot')}</p></header><form id="quiz-form" autocomplete="off"><p id="answer-progress" aria-live="polite"></p>${questions}<div class="actions"><button type="submit">Check understanding</button><button type="reset">Reset quiz</button></div></form><section id="results" tabindex="-1" aria-labelledby="results-title" hidden><h2 id="results-title">Your understanding</h2><p id="score"></p><p id="score-detail"></p><h3>What to inspect next</h3><ul id="recommendations"></ul></section><section class="coverage" aria-labelledby="coverage-title"><h2 id="coverage-title">Coverage and limitations</h2><p>This learning exercise checks ${quiz.questions.length} question${quiz.questions.length === 1 ? '' : 's'} against the captured source. A score does not establish code correctness, complete review coverage, or readiness to approve. Correct answers are stored in this self-contained page.</p>${limitations.length ? `<ul>${limitations.map(text => `<li>${escapeHtml(text)}</li>`).join('')}</ul>` : '<p class="muted">No additional source limitations were recorded.</p>'}<p class="muted">Answers stay in memory; refreshing the page resets your progress. This page makes no network requests.</p></section></main>`;
  const [css, runtime] = await Promise.all([
    readFile(new URL('../assets/quiz.css', import.meta.url), 'utf8'),
    readFile(new URL('../assets/quiz-runtime.mjs', import.meta.url), 'utf8'),
  ]);
  const evidence = Object.fromEntries([...new Set(quiz.questions.flatMap(question => question.evidence))].map(id => {
    const { path: filePath, startLine, endLine, url } = resolveEvidence(context, id);
    return [id, { path: filePath, startLine, endLine, ...(url ? { url } : {}) }];
  }));
  const html = renderShell({ title: quiz.title, body, css, data: { quiz, evidence }, script: `${runtime}\nmountQuiz(JSON.parse(document.getElementById('artifact-data').textContent));` });
  await writeFile(path.join(dir, 'index.html'), html);
  await writeJson(path.join(dir, 'quiz.json'), quiz);
  return finishArtifact({
    dir, skill: 'review-quiz', context, outputs: ['index.html', 'quiz.json'],
    summary: `${quiz.questions.length} questions about ${quiz.title}, with deterministic scoring and source-linked recommendations.`,
    markdown: 'Download and open `index.html` to take the quiz. Answers and explanations appear after submission. The score measures this exercise only; it does not establish review completeness or approval readiness.',
    limitations: [...(quiz.limitations || []), ...(quiz.insufficientEvidence ? [quiz.insufficientEvidence] : [])],
  });
}

async function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  if (positional[0] !== 'render' || !options.context || !options.content || !options.root) throw Error('Usage: review-quiz.mjs render --context FILE --content FILE --root DIR [--questions N]');
  const [context, quiz] = await Promise.all([readJson(options.context), readJson(options.content)]);
  const dir = outputDirectory(options.root, context.target, 'review-quiz');
  await renderQuiz(context, quiz, dir, { questions: options.questions });
  process.stdout.write(`${dir}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { process.stderr.write(`review-quiz: ${error.message}\n`); process.exitCode = 1; });
}
