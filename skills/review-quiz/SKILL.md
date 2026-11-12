---
name: review-quiz
description: Generate a self-contained HTML comprehension quiz for reviewing a PR, branch, codebase, or selected code, with scores and source-linked recommendations.
metadata:
  version: 0.2.0
---

# Review quiz

Create an offline learning exercise that checks whether a reviewer understands the
selected behavior, execution flow, and limits. Use this skill independently or
alongside the other Code Unpacked skills.

## Select the code

Use the installed [shared core](../code-unpacked-core/SKILL.md) to capture the
target and pin its source revision. All target modes use the same renderer:

- `$review-quiz pr https://github.com/owner/repo/pull/234`
- `$review-quiz pr 234 --repo owner/repo --questions 12`
- `$review-quiz branch feature-name --base main`
- `$review-quiz codebase`
- `$review-quiz docs auth-flow --files src/auth.ts:10-90,src/session.ts`
- `$review-quiz docs selected-code` with code supplied in the conversation.

Keep outputs under the target repository's `.code-unpacked/` directory, using
`pr/<number>/review-quiz`, `branch/<safe-name>/review-quiz`, or
`docs/<name>/review-quiz`. Whole-codebase output uses `docs/codebase/review-quiz`.
Let the core choose paths; do not construct branch paths yourself.

## Author the exercise

Read the pinned context, its [shared review analysis](../code-unpacked-core/references/analysis.md),
and the source needed to understand it. Generate/reuse that analysis independently
of the other presentation skills. Author JSON using [the content schema](references/content.schema.json).
Use `--questions N` to set any positive integer length; default to eight. Match
that request with meaningful, distinct checks. When the source supports fewer,
provide `insufficientEvidence` explaining the shortfall rather than padding with
trivia. New content uses schema version 2, `requestedCount`, and optionally
`generatedCount`; the renderer saves both actual and requested counts. Version 1
content remains accepted at its original length unless a count is explicitly supplied.
Use one correct answer and three or four plausible, distinct choices per question.

Cover the meaningful changed behavior, flow, interfaces, failure cases, tests,
limitations, and where future work would extend the code. Prefer questions that
trace a request, distinguish persistence boundaries, or assess a test's limits.
Use the `extension` topic for source-grounded extension decisions; label proposed
changes in the explanation. Include security only when the evidence supports it. Avoid name or
formatting trivia. Do not turn an inferred requirement into a factual answer.
Explain each answer, cite at least one captured evidence ID, and supply a concrete
check to recommend after an incorrect or unanswered response. Recommendations
reuse the question's evidence. Record missing context and unresolved intent in
`limitations`.

## Render and deliver

```sh
node <skills-dir>/review-quiz/scripts/review-quiz.mjs render --context context.json --content quiz-content.json --root <target-repository> --questions 12
```

Omit `--questions` for the authored request or the default of eight in schema 2.
The renderer refuses mismatched authored/requested lengths, excess questions, and
unexplained shortfalls; it never invents or silently truncates questions.

The deterministic renderer validates IDs and evidence, escapes authored text, and
writes `index.html`, `quiz.json`, `manifest.json`, and draft comment files. The page
works via `file://`, reveals explanations after submission, and gives each question
equal weight. Score is `round(100 * correct / total)`; unanswered questions earn
no points. Missed checks are grouped by topic and evidence, with the most missed
groups first. No model is needed to grade or recommend checks.

Open the HTML and verify answering, submission, recommendations, and reset. Answers
stay in memory. The answer key is inspectable in the file, because this is a
learning exercise. Scores do not establish code correctness or approval readiness.

Use the shared core's draft/publish delivery flow for PRs. Generate exact draft
comments and local attachment paths by default; publish only when the request
authorizes posting. Do not present local paths as remotely accessible attachments.

## Verification

```sh
node --test <skills-dir>/review-quiz/tests/review-quiz.test.mjs
node --test <skills-dir>/review-quiz/tests/browser.test.mjs
```

Browser verification requires the suite's Playwright/Chromium setup. Rendering and
grading otherwise use Node and the shared core without browser dependencies.
