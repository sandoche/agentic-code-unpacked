# Development

Use Node.js 22.23.4+ and the pnpm version pinned in `package.json`.

```sh
pnpm install
pnpm skills:build
pnpm run check
pnpm --filter website build
```

## Skill bundles

The five skills under `skills/` are independently installable. Shared runtime source, source schemas, and operating guidance live in `packages/core/`. Edit that canonical source, then run `pnpm skills:build` to refresh each skill's committed `runtime/` directory. `pnpm skills:check` detects stale or extra bundled files without rewriting them.

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

The website build publishes the five skills at `/.well-known/agent-skills/index.json` and supporting files beneath that directory, using the skills CLI's compatible `name`, `description`, and `files` discovery format. It excludes tests, dependencies, and local artifacts. The homepage remains independent of distribution.

The Claude marketplace and plugin manifests point to the same skill folders. Do not maintain a second set of skill instructions for plugin installations.

Preserve context/content schema compatibility and artifact paths. Manifests track source, hashes, coverage limitations, completion, and delivery separately. Tests using recorded PR metadata must identify it as a snapshot; source capture does not execute the analyzed project.
