# Agentic Code Unpacked

Version **0.1.0**. Five skills turn a pull request, branch, codebase, or selected code into artifacts that help a reviewer understand it.

| Skill | Output |
| --- | --- |
| `walkthrough` | Offline HTML code tour; `video` exports silent 1080p MP4 and SRT/VTT captions |
| `reverse-design` | Requirements, stories, flows, architecture, data models, contracts, and decision notes in Markdown, Mermaid, and offline HTML |
| `code-map` | Explorable offline canvas of source files or PR diffs |
| `review-quiz` | Offline comprehension quiz with deterministic scoring and source-linked recommendations |
| `xkcd` | Generative stick-figure comic artwork with deterministic captions, PNG export, and a transcript |

## Install

Requires Node **22.23.4+** and pnpm **12.18.0**. Clone this repository, then run:

```sh
pnpm install
node scripts/install.mjs
```

The installer copies the five skills and their shared `code-unpacked-core` companion into `$CODEX_HOME/skills`, or `~/.codex/skills`. It installs the core's rendering dependencies. Restart skill discovery in your agent after installation.

Each skill can be invoked independently. To install just one presentation skill together with its core, or choose another destination:

```sh
node scripts/install.mjs --skill walkthrough --dest /path/to/skills
```

Existing skill folders are preserved: the installer refuses to overwrite them. Back up and remove the relevant destination folders explicitly before upgrading. Use `--no-deps` when dependency installation is managed separately.

Browser exports require Chromium or an installed Google Chrome. Install bundled Chromium from the installed core folder with `npx playwright install chromium`. In this development checkout:

```sh
pnpm --filter code-unpacked-core exec playwright install chromium
```

Video additionally requires FFmpeg on `PATH`, or an explicit `--ffmpeg /path/to/ffmpeg` argument. Comics require access to a generative image model; the skill uses built-in image generation by default. All other analysis uses the agent running the skill, with no extra text-generation API credential.

## Use

These are skill prompts, not operating-system shell commands:

```text
$walkthrough pr https://github.com/owner/repo/pull/123
$walkthrough video pr 123 --repo owner/repo --draft
$reverse-design branch feature/login --base main
$code-map codebase
$review-quiz docs auth --files src/auth.ts:10-90,src/session.ts
$xkcd docs billing --files src/Billing.php --count 1 --panels 3
```

All five skills support `pr`, `branch`, `codebase`, and `docs`. Selected or pasted code uses `docs` with a name; the core also accepts `--text-file` and `--text`.

PR capture pins both revisions. Branch capture compares committed changes with its merge base. Codebase and file selections capture local source and record dirty state. Source excerpts, claims, and relationships retain evidence references; unavailable source and unsupported relationships stay visible as limitations.

The agent captures source, authors the relevant content JSON, and runs deterministic renderers. JSON schemas live in each skill's `references` directory. Collection, escaping, layout, quiz grading, captions, file hashes, and packaging are scripted. Project source is never executed to generate an explanation.

## Artifact locations

Artifacts live in the analyzed repository, not the skill installation:

```text
.code-unpacked/
  pr/123/
    context/context.json
    walkthrough/index.html
    reverse-design/index.html
    code-map/index.html
    review-quiz/index.html
    xkcd/index.html
  branch/<safe-name>/<skill>/
  docs/<name>/<skill>/
```

Whole-codebase runs use `docs/codebase`. Unsafe names receive a normalized, hash-suffixed name. Each skill emits a manifest containing version, source revision, input/output hashes, coverage limitations, completion status, and delivery status. HTML embeds its required scripts, styles, diagrams, and images and opens directly from disk.

Core collection can also run directly:

```sh
node skills/code-unpacked-core/scripts/code-unpacked.mjs collect pr 123 --repo owner/repo --root /path/to/repo
node skills/code-unpacked-core/scripts/code-unpacked.mjs collect docs auth --files src/auth.ts:10-90 --root /path/to/repo
```

For reproducible offline PR capture, `--metadata metadata.json` accepts recorded full `base` and `head` SHAs plus optional title/URL/state, using local Git objects. The manifest identifies recorded metadata and does not claim the revision is still current. Source redaction is best effort; inspect artifacts before sharing, especially diffs that remove credentials.

## PR delivery

PR skills prepare comments with Markdown and Mermaid directly in the body, downloadable HTML attachments, and embedded comic images. Download an HTML attachment and open it locally; GitHub comments do not execute the page.

Use `--draft` to generate files and comment previews without uploading or posting. For actual delivery, the agent uploads HTML through GitHub's browser file picker and records the returned URLs. The shared publisher refuses fabricated or missing attachment URLs and updates only the matching skill comment owned by the current account. If upload access is unavailable, artifacts remain complete and delivery is reported as unpublished.

Do not use an artifact branch or external hosting to publish private source. Attachment size limits are checked before sharing; large exports may need a smaller scope or separate files. See [GitHub's attachment documentation](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files).

## Development and verification

```sh
pnpm test
pnpm run check
```

Tests use Node's test runner and real browser checks through Playwright. They cover pinned/local source capture, selections, redaction, safe output paths, HTML injection boundaries, canvas interactions, quiz grading/reset, Mermaid rendering, video timing/overflow, and comic composition/resume behavior. Image-generation results are mocked for deterministic tests; real generated artwork is visually inspected for demonstrations.

The Kanbanote PR #234 demonstration uses head `8b6fdfe04f8be06bec7544b934b435ff79dab72d`. Its local artifacts are generated under that repository's `.code-unpacked/pr/234/`. Demo mode creates five draft comments and makes no uploads or comments on GitHub.

Replay the curated demonstration after capturing that revision and generating its artwork:

```sh
node examples/pr-234.mjs --context /path/to/context.json --root /path/to/Kanbanote-website --artwork /path/to/generated.png --ffmpeg /path/to/ffmpeg
node scripts/verify-demo.mjs --dir /path/to/Kanbanote-website/.code-unpacked/pr/234 --ffmpeg /path/to/ffmpeg
```

The verifier checks artifact hashes, draft delivery, all five offline pages, quiz interactions, and actual video decoding. Its report and screenshots stay beside the demo. The actual built-in image-generation prompt is saved locally as `xkcd/generation.json`; renderer prompts are saved separately as `xkcd/prompts.json`.

Skill/core versions use semantic versioning, starting at `0.1.0`. Artifact schemas start at `1`. See [CHANGELOG.md](CHANGELOG.md).
