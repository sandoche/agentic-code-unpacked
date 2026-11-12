# Code Unpacked website

The homepage is a static Astro site. Its canonical copy, links, preview data, research citations, and FAQs live in the YAML front matter of [home.md](src/content/pages/home.md).

The content collection validates that file with [homepage-schema.ts](src/lib/homepage-schema.ts). Astro component props and browser state use types inferred from that schema. Broken quiz answer references, duplicate question IDs, and unresolved map connections fail validation.

## Develop and check

Use the repository's Node.js and pnpm versions. From the repository root:

```sh
pnpm --filter website dev
pnpm --filter website check
pnpm --filter website build
pnpm run check
```

The website build also publishes the six installable skills under `/.well-known/agent-skills/`. Keep that post-build step when changing the site. The formatter runs with one worker to avoid a native Astro formatter crash observed with multiple workers on Windows.

## Previews and assets

The five homepage previews share an explicitly illustrative webhook change. They demonstrate the formats and are not a real PR showcase. UI state is local; no visitor code is uploaded or analyzed by the page.

The quiz includes a behavior question and an architecture question, completed-diagram feedback, and retakes. Without JavaScript, all format panels and their source explanations remain readable through ordinary links and disclosures.

Fonts are self-hosted, with their license files in [public/fonts](public/fonts/README.md). The original comic and its generation prompt are documented in [public/images](public/images/README.md).

The visual system follows Hallmark's Cobalt theme. Tokens, the design stamp, and the Hallmark log preserve the decisions for follow-up work. Hallmark's rendered checks ran against the production preview; they are development tooling, not a website runtime dependency. See [the review record](.hallmark/review.md) for findings and resolutions.
