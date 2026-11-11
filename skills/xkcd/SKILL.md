---
name: xkcd
description: Explain code or concepts through minimalist stick-figure comics that personify actual files and functions. Use for PRs, branches, a codebase, or selected files; requires generative image model access.
metadata:
  version: "0.1.0"
---

# Code comics

Create original black-and-white stick-figure comics with source-backed personification. Default to one three-panel strip; accept 1–12 strips and 2–6 panels per strip when requested. Simplify the explanation without inventing behavior, guarantees, or historical intent.

## Capture and storyboard

Use the sibling [code-unpacked-core](../code-unpacked-core/SKILL.md) to capture a PR, branch, whole codebase, selected files/ranges, or inline code. Run that core's target collector and inspect its context and limitations before drafting.

Author `storyboard.json` using [the schema](references/storyboard.schema.json): title, concept, source evidence IDs, personified characters, and strips. Each panel supplies a scene, source evidence, and dialogue and/or a caption. Each strip states a meaningful limitation of the explanation. Character roles must refer to real source behavior; keep any analogy clear.

## Generate and render

Run the renderer without artwork to save deterministic prompts and an explicitly incomplete preview:

```sh
node <xkcd>/scripts/xkcd.mjs render --context CONTEXT --content STORYBOARD --root REPOSITORY
```

Use the saved `prompts.json` with the built-in `image_gen` tool. Generative model access is required. Use built-in generation by default; it does not require an API key. If unavailable, report the missing capability. Offer a CLI/API fallback only when the user explicitly requests that path; do not silently change providers or fabricate SVG/canvas artwork.

Generate one horizontal strip with equal-width panels and no lettering. The renderer typesets exact dialogue and captions below the artwork. Copy the generated output into the repository artifact folder; never leave a project asset only in the tool's default image directory. Inspect the actual artwork for correct panel count, readable visual storytelling, consistent characters, and accurate concepts.

```sh
node <xkcd>/scripts/xkcd.mjs render --context CONTEXT --content STORYBOARD --root REPOSITORY --artwork GENERATED_IMAGE
```

One image applies to one strip. For several strips or separate panel images, supply `--artwork-json FILE` containing a mapping:

```json
{"strip-id":{"strip":"/absolute/generated-strip.png"},"other-strip":{"panels":["/absolute/panel1.png","/absolute/panel2.png"]}}
```

PNG, JPEG, and WebP are accepted. Scene prompt hashes and artwork hashes allow unchanged saved artwork to be reused on a later render; changed scenes require new artwork. Inspect a resumed image just as a fresh one. Missing artwork or unavailable PNG export remains `incomplete` and returns CLI exit code 2.

## Artifacts and delivery

The shared target directory's `xkcd/` folder contains an offline `index.html`, `comic-01.png` (and subsequent strips), original artwork, storyboard, prompts, transcript, manifest, and draft comment. PNG composition requires Playwright and Chromium from the suite dependencies. The renderer does not call an image model itself.

Check the exported PNG and transcript together. A source citation supports the technical explanation; it does not establish that the metaphor is exhaustive. Use the core's PR delivery workflow and honor draft mode. This skill must not post incomplete comics or invent attachment URLs.
