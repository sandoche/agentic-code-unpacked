# Agentic Code Unpacked

Version **0.2.0**. Five skills turn a pull request, branch, codebase, or selected code into artifacts that help a reviewer understand it.

| Skill | Output |
| --- | --- |
| `walkthrough` | Offline overview with deep-dive chapters and syntax-highlighted source; `video` exports silent 1080p MP4 and SRT/VTT captions |
| `reverse-design` | Relevant architecture/review documents and focused sequences, selected for the actual change |
| `code-map` | Offline file canvas with function drill-down, typed source-backed relationships, topics, and flows |
| `review-quiz` | Configurable-length offline quiz with deterministic scoring and source-linked recommendations |
| `xkcd` | Complete generated comics including dialogue/code labels, PNG export, and an accessible transcript |

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
$review-quiz docs auth --files src/auth.ts:10-90,src/session.ts --questions 12
$xkcd docs billing --files src/Billing.php --count 2 --panels 3
```

All five skills support `pr`, `branch`, `codebase`, and `docs`. Selected or pasted code uses `docs` with a name; the core also accepts `--text-file` and `--text`.

PR capture pins both revisions. Branch capture compares committed changes with its merge base. Codebase and file selections capture local source and record dirty state. Source excerpts, claims, and relationships retain evidence references; unavailable source and unsupported relationships stay visible as limitations.

The agent captures source, authors a shared source-backed review analysis and relevant teaching content, and runs deterministic renderers. The analysis identifies behavioral topics, end-to-end flows, review priorities, extension points, and an accounting of every changed file. Each skill can generate/reuse it independently. JSON schemas live in each skill's `references` directory. Collection, escaping, layout, quiz grading, captions, file hashes, and packaging are scripted. Project source is never executed to generate an explanation.

PR/branch capture adds bounded direct-import context. Use `--context-files path1,path2` for relevant unchanged callers, guards, or route bindings at the pinned revision. The collector conservatively extracts JavaScript/TypeScript/JSX and PHP structure. Skills prefer fresh graph evidence when available, validate source/coverage, and disclose dynamic/external calls that cannot be resolved. A directory relationship never implies a call.

Walkthrough length follows behavioral coverage rather than file count. Reverse-design selects useful documents and can emit several sequence diagrams; it does not fill every document family. Quiz length defaults to eight and can be set with `--questions N`; insufficient evidence produces fewer questions with a reason. Comics select distinct explanatory topics automatically (one to six) or honor explicit counts, require generative image access, and preserve completed images for resumption.

## Artifact locations

Artifacts live in the analyzed repository, not the skill installation:

```text
.code-unpacked/
  pr/123/
    context/context.json
    context/analysis.json
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
node skills/code-unpacked-core/scripts/code-unpacked.mjs analyze --context /path/to/context.json --content analysis.json
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


Skill/core versions use semantic versioning. Context and new content use schema `2`; version `1` inputs remain supported. Manifests retain schema `1`. See [CHANGELOG.md](CHANGELOG.md).
