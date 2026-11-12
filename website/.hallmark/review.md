# Homepage review

Reviewed the production preview at 1280×800, 1440×900, and 1920×1080, plus full desktop and 375px pages. Reviews ran in-thread using Hallmark's Codex harness.

- Hero review: fix, one finding resolved. Capped the wide headline at 88px so “Stop” does not sit alone at 1920px. The source and database constraint hold the other half of the screen.
- Finish review: ship. The Cobalt system carries through the source preview, format explorer, research, installation, and native FAQ. No remaining gap from the stated direction. Keep the shared example and source-led hero.
- Final rendered lint: zero FAIL, zero REFLEX. One density warning: 81 words in a 900px FAQ window. Accepted because these are short scan-friendly questions with collapsed answers.
- Dismissed image heuristic 28a: the first image is the comic below the fold, inside an inactive tab. The hero contains source text; it has no LCP image. Lazy loading is intentional.

The browser test covers all five formats, source navigation, quiz feedback and retakes, keyboard tabs, successful and denied clipboard writes, mobile navigation, 320–1920px overflow, and reading without JavaScript. Samples are explicitly illustrative. A real PR showcase remains a later task.
