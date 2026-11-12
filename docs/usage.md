# Using Code Unpacked

Install any skill with `npx skills add sandoche/agentic-code-unpacked --skill NAME`. The installer selects the harness and scope; `-a claude-code`, `-a codex`, `-a cursor`, `-a github-copilot`, `-a gemini-cli`, or `-a opencode` selects one explicitly. Add `-g` for user-wide installation or `--copy` if symlinks are unavailable.

Commands below use Claude-style invocation. Codex uses `$skill-name`. Other harnesses can use their skill picker or a natural-language request. A native Claude plugin installation adds the `code-unpacked:` command namespace.

## Targets

All skills accept these targets:

| Target | Example |
| --- | --- |
| Pull request | `pr https://github.com/owner/repo/pull/123` |
| PR number | `pr 123 --repo owner/repo` |
| Branch | `branch feature/login --base main` |
| Whole repository | `codebase` |
| Selected files | `docs auth --files src/auth.ts:10-90,src/session.ts` |
| Pasted code | Ask the agent to explain the supplied code using the chosen skill |

PRs pin both revisions. Branches compare committed changes against the merge base. File and codebase runs capture local source and record dirty state. Explanations retain source references and disclose missing evidence.

## All formats

```text
/code-unpacked pr https://github.com/owner/repo/pull/123 --draft
/code-unpacked codebase
```

Generates the walkthrough, reverse-design documents, code map, review quiz, and comics in one agent workflow. Install only `code-unpacked` to get the complete bundle; the individual skills do not need to be installed. Source capture and shared analysis happen once, so all outputs explain the same snapshot.

The default walkthrough is HTML. Ask to include video when wanted; it additionally requires FFmpeg. Quiz length and comic count/panel requests work as with the individual skills. If a format fails or image generation is unavailable, completed outputs remain available and the agent reports each result separately. Comic storyboards and prompts are preserved for resumption.

The native Claude plugin command is `/code-unpacked:code-unpacked`. Outputs use the same per-format locations described below. PR delivery follows the same draft and live-delivery rules as the individual skills.

## Walkthrough

`/walkthrough pr https://github.com/owner/repo/pull/123 --draft`

Produces an offline HTML tour with an overview, review order, and chapters containing focused source excerpts. Use `/walkthrough video codebase` to export the same explanation as a silent 1080p MP4 with SRT/VTT captions. Video requires FFmpeg on PATH.

## Reverse-design

`/reverse-design branch feature/login --base main`

Produces architecture and review documents in Markdown and offline HTML, with relevant Mermaid diagrams. The agent selects useful document families and labels inferred requirements and proposed changes.

## Code-map

`/code-map codebase`

Produces an interactive offline canvas with files, function drill-down, typed relationships, topics, and flows. Unresolved calls remain visible as limitations.

## Review-quiz

`/review-quiz docs auth --files src/auth.ts --questions 12`

Produces an offline quiz with deterministic scores, answer explanations, reset, and source-linked recommendations. Architecture questions include partial diagrams, flow interpretation, incorrect connections, or diagram choices when the source supports them. Completed or corrected diagrams appear after submission. Defaults to eight questions, aiming for two architecture checks within that total; insufficient source evidence produces fewer with a reason. Diagrams use Mermaid during generation and remain embedded in the offline page.

## Xkcd

`/xkcd docs billing --files src/billing.ts --count 2 --panels 3`

Produces original stick-figure comics, PNG exports, an offline gallery, and a source-backed transcript. The agent needs an available image-generation tool. Without one, it saves the storyboard and prompts and reports an incomplete result. Default topic selection is automatic; optional counts are 1–12 comics and 2–6 panels each.

## Setup and output

Node.js 22.23.4+ with npm is required. The agent installs pinned rendering dependencies on first use into your user cache and reuses them across skills. Chromium is installed only when required and no usable browser is available. First use needs network access; subsequent generation can use cached dependencies and local source offline. FFmpeg and image generation are separate, mode-specific capabilities.

Outputs live under `.code-unpacked/pr/123/<skill>/`, `.code-unpacked/branch/<name>/<skill>/`, or `.code-unpacked/docs/<name>/<skill>/`. Whole-repository runs use `docs/codebase`. Open `index.html` directly from disk; generated pages include their assets and work offline.

PR runs prepare a comment and attachments. `--draft` stays local; live delivery requires the user to request it and the harness to have authenticated GitHub/browser-upload access. Missing delivery access preserves the completed local files. Review source excerpts before sharing artifacts.

Use `npx skills check` and `npx skills update` for updates, or `npx skills remove NAME` to remove an installed skill. Native Claude plugin users update through Claude's plugin manager instead.
