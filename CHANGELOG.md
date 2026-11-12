# Changelog

## Unreleased

- Migrated the shared runtime, presentation renderers, and browser interactions to TypeScript, compiled with the native TypeScript 7 compiler.
- Added strict type checking and type-aware lint rules that reject `any`, unsafe untyped operations, and suppression directives.
- Kept installed JavaScript commands and supported artifact schemas compatible, with source-free skill bundles and read-only generated-file checks.
- Added compiler/lint regression checks; verified Node.js 22.23.4 and 26.13.1 compatibility.
- Isolated Astro formatter workers in separate processes on Windows to avoid an intermittent native shutdown crash.

## 0.3.0 — 2026-11-12

- Added source-backed architecture quiz questions with partial diagrams, alternative diagrams, and completed diagrams after submission.
- Synchronized all six skills, bundled runtimes, and plugin metadata at version 0.3.0.
- Isolated fixture Git commands from inherited hook settings during pre-commit tests.

- Added the standalone code-unpacked skill to generate all five formats from one shared analysis.

- Added independent skill bundles, automatic first-use setup, and shared dependency caching.
- Added cross-harness installation, hosted skill discovery, and a native Claude plugin.
- Simplified the README and documented direct skill usage with linked technical references.

## 0.2.0 — 2026-11-12

- Added shared review analysis, changed-file coverage, pinned contextual source, conservative JS/TS/JSX and PHP structure, and offline syntax highlighting.
- Walkthroughs now offer an overview and behavioral deep dives with multiple focused source excerpts.
- Code maps expose functions, callers/callees, typed relationships, and topic/flow navigation.
- Reverse-design selects relevant documents and foregrounds focused diagrams.
- Quiz length is configurable; comics generate complete artwork including dialogue and code labels.

## 0.1.0 — 2026-11-11

- Added the walkthrough, reverse-design, code-map, review-quiz, and xkcd skills.
- Added shared source capture, evidence references, offline rendering, manifests, installer, and PR comment drafts/delivery.
- Added silent walkthrough video and generative comic composition workflows.
- Introduced artifact schema version 1.
