# Review quiz

Create an offline learning exercise that checks whether a reviewer understands the
selected behavior, execution flow, and limits. Use this skill independently or
alongside the other Code Unpacked skills.

## Select the code

Use the installed [shared core](../../../runtime/guide.md) to capture the
target and pin its source revision. All target modes use the same renderer:

- `/review-quiz pr https://github.com/owner/repo/pull/234`
- `/review-quiz pr 234 --repo owner/repo --questions 12`
- `/review-quiz branch feature-name --base main`
- `/review-quiz codebase`
- `/review-quiz docs auth-flow --files src/auth.ts:10-90,src/session.ts`
- `/review-quiz docs selected-code` with code supplied in the conversation.

Keep outputs under the target repository's `.code-unpacked/` directory, using
`pr/<number>/review-quiz`, `branch/<safe-name>/review-quiz`, or
`docs/<name>/review-quiz`. Whole-codebase output uses `docs/codebase/review-quiz`.
Let the core choose paths; do not construct branch paths yourself.

## Author the exercise

Read the pinned context, its [shared review analysis](../../../runtime/references/analysis.md),
and the source needed to understand it. Generate/reuse that analysis independently
of the other presentation skills. Author JSON using [the content schema](content.schema.json).
Use `--questions N` to set any positive integer length; default to eight. Match
that request with meaningful, distinct checks. When the source supports fewer,
provide `insufficientEvidence` explaining the shortfall rather than padding with
trivia. New content uses schema version 3, `requestedCount`, and optionally
`generatedCount`; the renderer saves both actual and requested counts. Version 1
content remains accepted at its original length unless a count is explicitly supplied.
Version 2 content retains its existing count rules; both older versions remain text-only.
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

## Check the architecture

Include architecture understanding by default when the selected source supports
it. In the usual eight-question quiz, aim for two architecture questions within
the requested total, including at least one diagram question. Adapt shorter quizzes
to the most useful checks. Test component responsibilities, end-to-end request or
data flow, and boundaries between modules, services, or persistence layers. For a
PR or selected-code target, focus on how that code fits its surrounding system.
Use relevant context at the pinned revision; disclose missing architectural
context in `limitations` rather than inventing a larger system or padding questions.

Use the `architecture` topic and vary the exercises where useful:

- Complete a partial diagram: ask which component, arrow, or label fills `?`.
- Interpret a flow or sequence: ask where a request goes next or which component
  owns a responsibility.
- Spot an incorrect relationship: explicitly label the diagram as a candidate
  containing a mistake, then ask which correction matches the source.
- Compare alternative diagrams: attach a diagram to each answer choice and ask
  which represents the captured architecture.

Use flowcharts for components and boundaries, sequence diagrams for interactions,
and state or data diagrams when transitions or relationships matter. Keep diagrams
focused on the concept under test. Correct answers must follow the captured source;
incorrect alternatives are deliberate hypotheses, not observed architecture.
Explain the difference with the question's evidence.

In schema 3, `question.diagram`, `option.diagram`, and
`question.explanationDiagram` accept the same object:

```json
{
  "title": "Request flow with a missing component",
  "description": "A request reaches an unknown component before the repository.",
  "mermaid": "flowchart LR\n  Request --> Missing[\"?\"]\n  Missing --> Repository"
}
```

Each diagram inherits the question's evidence IDs. Keep titles and descriptions
neutral before submission: describe the visible diagram, including gaps or
candidate relationships, without revealing the answer. Answer choices still
require distinct text labels and exactly one correct option. Put a completed or
corrected diagram in `explanationDiagram` when it helps explain the answer. It
appears with feedback only after submission and hides again on reset or answer
changes. Written explanations and freehand drawings are not graded.

Author plain Mermaid without HTML, links, click actions, configuration directives,
or frontmatter. The renderer validates all diagrams and renders them to embedded
SVG before writing output; invalid diagrams preserve an existing quiz artifact.
Repeated diagrams receive distinct SVG IDs. Generation uses the shared Mermaid
and browser setup only when diagrams are present; the finished quiz needs neither.

## Render and deliver

```sh
node <skill-dir>/scripts/review-quiz.mjs render --context context.json --content quiz-content.json --root <target-repository> --questions 12
```

Omit `--questions` for the authored request or the default of eight in schema 2/3.
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
node --test <skill-dir>/tests/review-quiz.test.mjs
node --test <skill-dir>/tests/browser.test.mjs
```

Browser verification requires the suite's Playwright/Chromium (set up automatically on first use) setup. Rendering and
grading of text-only quizzes otherwise use Node and the shared core without browser dependencies.
