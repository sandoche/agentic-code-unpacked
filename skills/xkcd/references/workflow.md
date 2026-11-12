# Code comics

Create original black-and-white stick-figure comics that teach actual source behavior. Generate the complete image, including dialogue, captions, and code labels. Choose distinct useful topics rather than a generic office metaphor.

## Capture and choose topics

Use the bundled [source guide](../runtime/guide.md) for PR, branch, codebase, or docs capture. Build or reuse its source-backed review analysis. Include relevant unchanged context and disclose unresolved calls and provider gaps. Each skill runs independently.

Default to one to six meaningful topics, with three panels per comic. Favor a tricky persistence boundary, failure/retry path, non-obvious invariant, important call chain, or code complexity. Avoid release metadata and generic verification strips. For a tiny scope, one good image is enough. Accept explicit `--count 1..12` and `--panels 2..6` requests; do not pad with trivia when the source cannot support the requested count.

The deterministic planner ranks evidence-backed analysis topics and reports a count shortfall:

```sh
node <xkcd>/scripts/xkcd.mjs plan --context CONTEXT --root REPOSITORY [--count N] [--panels N]
```

Use the saved topic plan to author the story; an explicit user-authored storyboard remains canonical and is not automatically replaced by the planner.

## Storyboard and generate

Author `storyboard.json` using [the schema](storyboard.schema.json). Version 2 uses the same title, concept, evidence, characters, and strips structure as version 1. Each panel supplies a scene, dialogue and/or caption, and source evidence. Each strip states a useful limitation and may link an analysis topic with `topicId`. Mark any selection notes explicitly. Character names and roles must refer to actual files/functions; the metaphor must not invent behavior or guarantees.

Run the renderer without artwork to save complete-image prompts and an explicitly incomplete preview:

```sh
node <xkcd>/scripts/xkcd.mjs render --context CONTEXT --content STORYBOARD --root REPOSITORY
```

Use `prompts.json` with an available image-generation tool by default. Generate one complete horizontal comic per prompt, including the exact supplied titles, dialogue, captions, and code labels. Delegate the full image to the model; never add an external caption grid or patch lettering over it. Use the current harness's available image tools; no particular provider is required. If image access is unavailable, report it and preserve the storyboard, prompts, and incomplete artifacts. Offer a CLI/API fallback only if the user explicitly requests that path.

Inspect every generated image for correct technical meaning, legible text/code labels, the intended panel count, and useful storytelling. Regenerate incorrect images. Save the actual prompt and inspection outcome beside the artifact. Source citations support the technical explanation, not every detail of the metaphor.

Copy generated artwork into the repository artifact folder and render again:

```sh
node <xkcd>/scripts/xkcd.mjs render --context CONTEXT --content STORYBOARD --root REPOSITORY --artwork GENERATED_IMAGE
```

A single image applies to exactly one strip. For several complete images, supply `--artwork-json FILE`:

```json
{"strip-id":{"strip":"/absolute/generated-comic.png"},"other-strip":"/absolute/other-comic.png"}
```

PNG, JPEG, and WebP are accepted. Separate panel-image composition is no longer supported: request one complete strip image. Original PNG bytes are exported unchanged; other formats receive a pixel-only PNG conversion, with no lettering overlay.

## Resume, export, and deliver

Prompt fingerprints include all visible text and scene/cast details. Unchanged complete artwork is reused only when prompt and image hashes match. Changed dialogue requires regeneration. Version 1 storyboards remain readable, but old unlettered artwork is not automatically reused. Completed images and their prompts are preserved when a later strip fails.

The shared target folder's `xkcd/` directory contains the offline HTML gallery, exact `comic-01.png` exports, original artwork, storyboard, prompts, export dimensions/provenance, source-backed transcript, manifest, and draft comment. Transcripts and citations are collapsed in the gallery. PNG-only export does not require a browser; JPEG/WebP conversion requires Playwright and Chromium from the suite dependencies.

Missing artwork or failed export remains `incomplete` with CLI exit code 2. Never post incomplete comics. Use the core's PR delivery workflow and honor draft mode; do not invent attachment URLs.
