# Code Unpacked website

A static Astro site with an illustrated homepage, five consecutive real skill examples, a showcase index and three source-backed case studies.

## Content

Homepage copy, navigation, installation instructions and FAQs live in the YAML front matter of src/content/pages/home.md. The showcase index also uses front matter. Case studies use front matter for metadata and example references, and Markdown bodies for the articles. Astro content collections validate these files; missing example IDs fail the build.

The three runs are Silk's actual PR and the sandoche/core and sandoche/react showcase forks. Website examples retain their source revisions and direct original-download links. Source statistics exclude the extra artifact commits in the two forks.

## Real examples

examples/provenance.json records eight committed HTML viewers with hashes, byte counts, source pins and explicit excerpt scope. Six are exact published outputs. The two React excerpts use the canonical skill renderers and bounded inputs. See examples/README.md for reproduction and scope. No GitHub requests, agent calls or image generation happen during a production build or visitor session.

The surrounding website does not recreate quiz, map or walkthrough controls: the actual viewers run inside visually isolated iframes. They load lazily and offer full-size links. Full large bundles remain linked downloads.

## Develop and verify

Run these commands from the repository root:

```sh
pnpm --filter website dev
pnpm --filter website examples:check
pnpm --filter website check
pnpm --filter website build
node --test tests/website.test.mjs
pnpm run check
```

The build validates the viewer hashes and social-image dimensions before Astro runs, then preserves publication of the six installable skills under /.well-known/agent-skills/. Public viewer HTML and its bounded source inputs are excluded from website formatting so the original outputs remain unchanged.

## Brand and sharing

The new identity is custom illustrated editorial: paper, ink, coral, yellow and teal. The original SVG logo, generated monster artwork, prompt and asset notes are in public/ and art/. Fonts remain self-hosted with their original license files. The old .hallmark records describe the previous website, not the current design.

Each route has its own 1200 × 630 PNG, canonical URL, Open Graph and Twitter large-image metadata. Article pages add their publication date and BlogPosting structured data. Sitemap and robots output are generated from the actual routes; Netlify preview contexts are marked noindex.

```sh
pnpm --filter website assets:brand
```

This optional authoring command uses the existing browser tooling to regenerate the social cards and icons. It is not a production build dependency. Screenshots and validation notes for the redesign are in docs/website-revamp at the repository root.
