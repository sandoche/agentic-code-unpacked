---
name: code-map
description: Generate an offline explorable code canvas for a pull request, branch, codebase, or selected files, with diff cards, source details, and cited relationships.
metadata:
  version: "0.1.0"
---

# Code Map

Turn code into a self-contained HTML canvas. Use this for spatial exploration of
files and changes; use walkthrough for a guided narrative.

## Select the source

Accept `$code-map pr <URL-or-number>`, `$code-map branch <name> --base <ref>`,
`$code-map codebase`, or `$code-map docs <name> --files <paths-or-ranges>`.
For PR numbers require a repository; for pasted code use the core docs text mode.
Follow [the shared core](../code-unpacked-core/SKILL.md) to capture `context.json`,
resolve source revisions, and choose the target repository root. Reuse the same
context across other Code Unpacked skills.

## Explain and render

- A map requires no model-authored data. For a useful review, optionally write
  `content.json` using [the content schema](references/content.schema.json): title,
  summary, file annotations, and source-backed relationships.
- Inspect code before describing it. Cite existing evidence IDs on every
  annotation and relationship. Evidence must substantiate the statement; a valid
  reference alone does not establish a dependency. Name edge semantics precisely,
  such as `imports`; never turn an import into a claimed call or data flow.
- Keep explanations as plain text. Do not create coordinates, diff lines, or
  source excerpts manually; the renderer derives them from the captured context.
- Without dependency evidence, generate the directory-grouped map and retain its
  explicit relationship limitation. Unsupported languages still display source.

Run from the suite root, substituting absolute input and target-root paths:

```sh
node skills/code-map/scripts/code-map.mjs render --context CONTEXT_JSON --root TARGET_ROOT
node skills/code-map/scripts/code-map.mjs render --context CONTEXT_JSON --content CONTENT_JSON --root TARGET_ROOT
```

The script exports `renderCodeMap(context, content, dir)` for suite integration.
It writes `index.html`, `map.json`, the shared manifest, and draft comment files
under `.code-unpacked/pr/<number>/code-map/`, `branch/<safe-name>/code-map/`, or
`docs/<name>/code-map/`. Whole-codebase snapshots use `docs/codebase/code-map/`.

## Inspect and deliver

Open `index.html` locally. Check search, file selection, unified diff/head/base
views, pan, zoom, dragging, reset, and the keyboard-accessible file list. Source
details load only when selected; every captured path remains searchable. Read the
coverage panel and distinguish omissions from empty files. PR/branch maps show
changes; codebase/docs maps show source snapshots.

For PR requests prepare the shared draft comment and attachment list. Follow the
core publishing workflow when posting is requested; do not imply a local HTML
path is a public preview URL. Demo requests for drafts stay local.

Run meaningful renderer and browser checks with:

```sh
node --test skills/code-map/tests/code-map.test.mjs
```

Rendering needs Node and the shared core. Browser checks need the suite's
Playwright Chromium installation. The generated canvas needs only a browser and
makes no network requests; optional source links open separately.
