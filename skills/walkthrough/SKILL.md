---
name: walkthrough
description: Create a source-linked HTML code walkthrough for a PR, branch, codebase, or selected files; use video mode to export the same explanation as a silent MP4 with captions.
metadata:
  version: "0.1.0"
---

# Walkthrough

Produce a small offline HTML presentation: one title and explanation per step,
with optional source code and citations. Focus the narrative on the requested
code, its behavior, and its limits. Explanations without code blocks are valid.

## Target and evidence

Use the installed sibling [core skill](../code-unpacked-core/SKILL.md) to capture
the requested `pr`, `branch`, `codebase`, or `docs` target. A selected code block
uses a named `docs` target. Preserve immutable revisions and source limitations.
The core owns target parsing, output paths, evidence capture, and PR delivery.

Read the captured context and referenced source before authoring explanations.
Follow repository graph-discovery instructions when graph tools are available;
use direct source for coverage gaps. Never treat an inferred intent as a proven
requirement or invent a source reference.

## Author and render

Write content JSON using [the content schema](references/content.schema.json):
`schemaVersion: 1`, `title`, optional `summary`, and ordered `steps`. Every step
has `id`, `title`, plain-text `explanation`, and nonempty `evidence` IDs from the
captured context. Optional `codeEvidence` chooses a captured snippet; code is
read from source rather than copied into content. Prefer a short narrative with
enough steps to explain the behavior, tradeoffs, and relevant limits.

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
