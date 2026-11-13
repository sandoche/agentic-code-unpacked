# Website redesign evidence

The site was rebuilt from main after merge df36c55707dc152a2efb5711abea4aa1a2feb6a5. The original workspace was left intact; implementation used a separate checkout.

## Screenshots

- [Desktop homepage](homepage-desktop.png)
- [Full desktop homepage](homepage-full.png)
- [Mobile hero](homepage-mobile-hero.png)
- [Full mobile homepage](homepage-mobile.png)
- [Real map section](real-map.png)
- [Showcase index](showcase-desktop.png)
- [React article](react-compiler.png)
- [Vue article](vue-vapor.png)
- [Silk article](silk-gzip.png)
- [Homepage social card](../../website/public/og/home.png)

Screenshots use the production build and its actual viewers. Full-page screenshots explicitly load the lazy frames before capture; normal visitors retain lazy loading. The map is an eight-file excerpt from the 3,669-file source change, rendered with the same skill viewer, rather than a recreated website component.

## Checks

The production website build validates eight viewer hashes, source revisions, the two fork URLs, excerpt scope, and five distinct 1200 × 630 social images. It still publishes all six portable skills under /.well-known/agent-skills/.

Browser verification covers all five consecutive skill sections; walkthrough navigation/playback; design diagrams/source navigation; map source, search, zoom, pan and reset; quiz scoring/feedback/reset; and comic image/transcript access. It also checks command copying and fallback, canonical/social metadata on all five pages, five responsive widths from 320 to 1920 pixels, keyboard focus, no-script reading, and browser/HTTP errors.

A separate deploy-preview build verifies noindex metadata on all five pages and Disallow in robots.txt. Normal builds retain production canonicals and a sitemap. The repository check covers types, lint, bundle freshness, skill distribution and tests. Two optional FFmpeg integrations are excluded when FFmpeg is unavailable; no video is part of this redesign.

## Provenance and scope

The public runs are sandoche/react#1, sandoche/core#1 and silk-lang/silk#3079. Original PR snapshots, native downloads, checksums and excerpt labels are recorded in website/examples/provenance.json. Case studies explain how the formats help a reviewer; they do not assert measured time savings, new compiler test results or a verified performance improvement.

The original logo, artwork prompt and brand-generation notes are in website/art/README.md. The six unmodified viewers and two renderer-produced excerpts are documented in website/examples/README.md. Full original source/analysis bundles remain linked downloads, rather than automatic page payloads.
