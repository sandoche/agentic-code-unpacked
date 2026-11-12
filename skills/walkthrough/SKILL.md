---
name: walkthrough
description: Create a source-linked HTML code walkthrough for a PR, branch, codebase, or selected files; use video mode to export the same explanation as a silent MP4 with captions.
metadata:
  version: "0.2.0"
---

# Walkthrough

Produce an offline HTML presentation that starts with purpose, behavior changes,
review order, and extension guidance. Follow the overview with deep-dive chapters
that explain the requested code and its limits. Each step has a title and
explanation; explanation-only steps are valid.

## Target and evidence

Use the installed sibling [core skill](../code-unpacked-core/SKILL.md) to capture
the requested `pr`, `branch`, `codebase`, or `docs` target. A selected code block
uses a named `docs` target. Preserve immutable revisions and source limitations.
The core owns target parsing, output paths, evidence capture, and PR delivery.

Read the captured context and referenced source before authoring explanations.
Follow repository graph-discovery instructions when graph tools are available;
use direct source for coverage gaps. Never treat an inferred intent as a proven
requirement or invent a source reference.

Use the core's [shared review analysis](../code-unpacked-core/references/analysis.md)
to establish topics, before/after behavior, review focus, extension points, and
file coverage. Reuse existing analysis at the same source revision. Read callers,
guards, and tests needed to explain the flow; request pinned context files through
the core collector instead of inferring their behavior. Classify supporting and
omitted changes in the analysis rather than padding the narrative.

## Author and render

Write schema 2 content using [the content schema](references/content.schema.json):
`schemaVersion: 2`, `title`, optional `summary`, and ordered `chapters`. Each
chapter has `id`, `title`, optional `topicIds` from shared analysis, and `steps`.
Every step has `id`, `title`, plain-text `explanation`, and nonempty `evidence`
IDs. Step IDs must be globally unique; IDs beginning `__overview` are reserved.

The renderer prepends an Overview chapter from `context.analysis`. It covers the
purpose, supplied before/after behavior, suggested review order, and extension
guidance. Recommendations remain labeled as proposals. An explicit `overview`
can replace this content: `purpose`, `evidence`, optional `before`/`after`,
`reviewOrder`, and `extensionPoints`. Guidance items use `title`, `explanation`,
and `evidence`; extension items may mark `basis` as `proposed` or `observed`.
If no before/after behavior is supplied, the renderer does not invent a change.

Use `snippets` for one or more pieces of source in a step. Each snippet has an
`evidence` ID and optional `label`, `side` (`before`, `after`, or `context`), and
`focusLines` with absolute source line numbers. Before snippets must reference
base evidence and after snippets head evidence. Focus lines must stay within the
captured range. Code is syntax-highlighted with line numbers and is read from
source rather than copied into authored JSON. Narrow each snippet to the lines
needed to explain the step. Compare before and after snippets when that clarifies
the behavior; do not require code on every step.

Schema 1 flat `steps` and single `codeEvidence` inputs remain supported. New
walkthroughs use schema 2 so reviewers can start with an overview and choose a
deep dive. Evidence and file coverage remain available in collapsed panels.

Run the deterministic renderer from the installed skill location:

```sh
node <skills>/walkthrough/scripts/walkthrough.mjs render --context <context.json> --content <content.json> --root <target-repository>
```

Artifacts go to the core's `.code-unpacked/<scope>/walkthrough/` directory:
`index.html`, `walkthrough.json`, `manifest.json`, and `comment.md`. The HTML has
chapter navigation, keyboard controls, and timed playback. Inspect it in a
browser, including any code block that is longer than a screen.

## Video command

For `$walkthrough video <target>` or “export this walkthrough as video,” reuse
the saved `walkthrough.json` and source context:

```sh
node <skills>/walkthrough/scripts/walkthrough.mjs video --context <context.json> --content <walkthrough.json> --root <target-repository>
```

Video mode creates the HTML first, then exports silent 1920×1080 H.264 MP4 plus
`captions.srt` and `captions.vtt`. It requires suite Playwright/Chromium and FFmpeg
on PATH; `--ffmpeg <executable>` selects an installed FFmpeg. It does not use a
speech service. Default step timing is at least six seconds, increasing at 160
words per minute; `durationSeconds` can explicitly choose 1–300 seconds per step.

Video refuses to clip overflowing content. Shorten an explanation or capture a
narrower code-evidence range, then retry. A failed export preserves the HTML and
records a partial result and reason in the manifest. Review the resulting video
and confirm the captions agree with the step order.

## Delivery

Return artifact paths and a brief account of source coverage. For a PR, use the
core's generated draft comment and attachment workflow. Post only when the user
has requested live comments; a request for examples or drafts stays local.
