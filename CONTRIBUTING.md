# Development

Use Node.js 22.23.4+ and the pnpm version pinned in `package.json`.
Development uses Node.js 26.13.1 LTS; install and select it with `nvm install 26.13.1` and `nvm use 26.13.1`. Compatibility checks also run on Node.js 22.23.4.

```sh
pnpm install
pnpm skills:build
pnpm run check
pnpm --filter website build
```

## Skill bundles

The skills under `skills/` are independently installable. Maintain shared TypeScript in `packages/core/src/` and presentation TypeScript in `packages/presentations/<skill>/src/`. Schemas, CSS, and operating guidance remain alongside their existing assets and references. Run `pnpm skills:build` to compile the `.mts` sources and refresh the committed JavaScript and skill bundles. Generated files identify their source in a header; edit the TypeScript source rather than the generated scripts or browser assets. Existing installed commands and artifact paths stay the same.

`pnpm skills:check` compiles into a temporary directory and compares the generated scripts and bundles without rewriting tracked files. It rejects stale, missing, or extra output. Installed skills contain ready-to-run JavaScript and do not need the native TypeScript compiler.

`pnpm typecheck` uses the pinned TypeScript 7 native compiler. `pnpm lint:typescript` runs type-aware Oxlint over all maintained runtime and presentation sources. Both are part of `pnpm run check` and the pre-commit hook. Explicit or implicit `any`, unsafe uses of untyped values, non-null assertions, floating promises, and TypeScript/lint suppression directives are rejected. Narrow JSON and external values from `unknown` with guards. Keep the runtime's TypeScript 6 dependency for the existing AST API and the website's TypeScript 6 tooling.

The pinned Oxfmt dependency has a pnpm patch in `patches/` that uses child-process workers on Windows. This avoids an intermittent native crash during Astro formatter worker shutdown while retaining the normal formatting checks and exit codes. Other platforms keep worker threads. Recheck this workaround when upgrading Oxfmt.

`code-unpacked` orchestrates the five presentation formats. Its generated `presentations/` directory copies the maintained workflows, schemas, renderers, and assets, with imports and links rewritten to its one shared runtime. Edit the individual presentations and rebuild; do not edit generated copies. Nested skill entrypoints and UI metadata are omitted to avoid duplicate discovery. Keep `PRESENTATION_SKILLS` separate from the complete installable `SKILLS` list.

Keep the runtime's `package-lock.json` in sync when changing pinned dependencies. The runtime installs with `npm ci --omit=dev --ignore-scripts`, outside the analyzed repository. Its user cache is keyed by the manifest and lockfile. `CODE_UNPACKED_CACHE` can select a different cache directory for isolated tests or managed environments.

SKILL.md files are portable entrypoints. Put conditional authoring details in `references/workflow.md` and schemas; retain correct relative links. Native UI metadata may use a harness's own invocation syntax.

## Local inspection

The public interface is a skill request. These lower-level commands are useful when developing renderers:

```sh
node skills/walkthrough/runtime/scripts/code-unpacked.mjs collect codebase --root /path/to/repository
node skills/walkthrough/runtime/scripts/code-unpacked.mjs analyze --context /path/to/context.json --content analysis.json
node skills/walkthrough/scripts/walkthrough.mjs render --context /path/to/context.json --content walkthrough.json --root /path/to/repository
```

For a local installation without using the remote repository:

```sh
npx skills add . --skill walkthrough -a claude-code
```

`node scripts/install.mjs --skill walkthrough --dest /path/to/skills --no-deps` remains a non-overwriting checkout fallback. It includes support files, excludes tests and installed dependencies, and defaults to the user Claude skills directory.

## Verification and distribution

Tests cover source capture, rendering, browser interactions, bootstrap recovery/concurrency, isolated installations, and website discovery. They use synthetic source and mocked generated artwork. Browser tests need Chromium or Chrome; the runtime handles setup. Video tests need FFmpeg.

For the full installer matrix, run `node scripts/verify-installations.mjs /absolute/path/to/skills/bin/cli.mjs` with an installed skills CLI. It checks all six documented harnesses, individual selection, HTTP discovery, and all five renderers in temporary projects, retaining a report outside the checkout.

The website build publishes all installable skills at `/.well-known/agent-skills/index.json` and supporting files beneath that directory, using the skills CLI's compatible `name`, `description`, and `files` discovery format. It excludes tests, dependencies, and local artifacts. The homepage remains independent of distribution.

The Claude marketplace and plugin manifests point to the same skill folders. Do not maintain a second set of skill instructions for plugin installations.

Preserve context/content schema compatibility and artifact paths. Manifests track source, hashes, coverage limitations, completion, and delivery separately. Tests using recorded PR metadata must identify it as a snapshot; source capture does not execute the analyzed project.
