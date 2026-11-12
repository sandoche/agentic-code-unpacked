# 🧩 Code Unpacked

Understand a PR or codebase through walkthroughs, architecture docs, interactive maps, quizzes, and comics. Use each format independently or generate all five with `/code-unpacked`.

## 📦 Install

Run from your project, then choose the skills and agents you use:

```sh
npx skills add sandoche/agentic-code-unpacked
```

Supports **Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI, OpenCode**, and other [skills CLI harnesses](https://github.com/vercel-labs/skills/blob/main/docs/agents.md). Requires Node.js **22.23.4+** with npm. No clone or pnpm needed.

```sh
# All five formats with one skill
npx skills add sandoche/agentic-code-unpacked --skill code-unpacked -a claude-code

# Available across your projects
npx skills add sandoche/agentic-code-unpacked -g
```

The hosted distribution uses the same installer:

```sh
npx skills add https://codeunpacked.san.cx
```

<details>
<summary>Native Claude Code plugin</summary>

Run inside Claude Code:

```text
/plugin marketplace add sandoche/agentic-code-unpacked
/plugin install code-unpacked@code-unpacked
```

Plugin commands have a namespace, for example `/code-unpacked:walkthrough`. Choose either this plugin or the skills CLI for a given agent to avoid duplicates.

</details>

## 🚀 Use

Start a new agent session after installation. Invoke a skill directly or ask your agent to use it:

| Skill | What you get |
| --- | --- |
| [/code-unpacked](docs/usage.md#all-formats) | All five formats from one source snapshot and shared analysis |
| [/walkthrough](docs/usage.md#walkthrough) | A source-linked code tour; optional silent video with captions |
| [/reverse-design](docs/usage.md#reverse-design) | Architecture, behavior, and design documents with diagrams |
| [/code-map](docs/usage.md#code-map) | An interactive map of files, functions, and relationships |
| [/review-quiz](docs/usage.md#review-quiz) | A comprehension quiz with answers and source references |
| [/xkcd](docs/usage.md#xkcd) | Stick-figure comics explaining the code |

```text
/code-unpacked pr https://github.com/owner/repo/pull/123 --draft
/walkthrough pr https://github.com/owner/repo/pull/123 --draft
/reverse-design branch feature/login --base main
/code-map codebase
/review-quiz docs auth --files src/auth.ts --questions 8
/xkcd docs billing --files src/billing.ts
```

Examples use Claude-style `/skill` commands. In Codex, use `$skill`; elsewhere use your agent's skill picker or ask “Use walkthrough to explain this PR.”

The agent handles setup and generation. Dependencies download on first use; Chromium is installed when needed. Video also needs FFmpeg; comics need an available image-generation tool.

Artifacts are saved in `.code-unpacked/` inside the analyzed repository. Open the generated HTML locally; it works offline. PR runs can prepare comments and attachments. `--draft` keeps delivery local.

## 🔄 Update or remove

```sh
npx skills update
npx skills remove walkthrough
```

[Usage and requirements](docs/usage.md) · [Development](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

## 📄 License

Licensed under the [MIT License](LICENSE).
