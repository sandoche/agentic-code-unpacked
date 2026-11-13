# Code Map

Turn code into a self-contained HTML canvas. Use this for spatial exploration of
files and changes; use walkthrough for a guided narrative.

## Select the source

Accept `/code-map pr <URL-or-number>`, `/code-map branch <name> --base <ref>`,
`/code-map codebase`, or `/code-map docs <name> --files <paths-or-ranges>`.
For PR numbers require a repository; for pasted code use the core docs text mode.
Follow [the shared core](../runtime/guide.md) to capture `context.json`,
resolve source revisions, and choose the target repository root. Reuse the same
context across other Code Unpacked skills.

## Explain and render

- A map consumes the core's extracted symbols and graph automatically; no
  model-authored graph is required. Reuse or author the shared
  [review analysis](../runtime/references/analysis.md) to explain
  purpose, behavior changes, review order, and extension points. Its topics and
  flows become teaching filters. Flow steps work with evidence even when they
  have no symbol IDs.
- For extra file notes, optionally write
  `content.json` using [the content schema](content.schema.json): title,
  summary, file annotations, and source-backed relationships. Context/content v1
  input remains supported; generated map data uses schema version 2.
- Inspect code before describing it. Cite existing evidence IDs on every
  annotation and relationship. Evidence must substantiate the statement; a valid
  reference alone does not establish a dependency. Preserve `kind` and
  `provenance`: calls, imports, construction, routes, and test relationships have
  different meanings. Bind verified callback, HTTP, route, or test edges only
  after inspecting both endpoints at the captured revision. Dynamic targets in
  `unresolved` stay gaps; do not fabricate missing edges.
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
views, pan, zoom, dragging, reset, and the keyboard-accessible file list. Open a
function from its file, follow callers/callees, and check its stable symbol link.
Use topic/flow and relationship-type filters. PR/branch views initially show
changed files; contextual unchanged neighbors have distinct styling and appear
when Changed only is cleared or a symbol link opens one. A context role excludes
a file from changed-only views even if its status says modified. Source and
generated syntax highlighting enter the DOM only when selected; every captured
path and symbol remains searchable. Read the
coverage panel and distinguish omissions from empty files. PR/branch maps show
changes; codebase/docs maps show source snapshots.

For PR requests prepare the shared draft comment and attachment list. Follow the
core publishing workflow when posting is requested; do not imply a local HTML
path is a public preview URL. Demo requests for drafts stay local.

Installed bundles omit development tests. Perform the browser checks above against
the generated artifact. In the development checkout, run renderer and browser checks with:

```sh
node --test tests/skills/code-map/*.test.mjs
```

Rendering needs Node and the shared core. Browser checks need the suite's
Playwright Chromium installation. The generated canvas needs only a browser and
makes no network requests; optional source links open separately.
