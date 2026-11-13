# Deployed desktop and mobile review

Reviewed PR #7's original deploy at commit 0c210227c32d23a7c93846d043b88ed502de6238, then reproduced and corrected the findings locally. The original deployment remains available at https://6af73002152773aa28d1f87c--agentic-code-unpacked.netlify.app/ for comparison.

## Findings and fixes

| Finding | Evidence | Fix |
| --- | --- | --- |
| React map widened its 350px mobile frame to 1,092px. | An uncontained source-provenance paragraph in the footer caused the overflow. Source code was already inside a scrolling panel. | Wrap footer text, without clipping or changing the code or graph. |
| Silk quiz widened its 350px frame to 402px. | Long revision IDs in coverage notes overflowed; SVG diagrams were already scroll-contained. | Wrap coverage text. Questions, diagrams, answers and grading remain unchanged. |
| Walkthroughs widened 280px frames to 298px on 320px phones. | Revision IDs in the footer, with additional long paths in Silk's coverage disclosure. | Wrap footer and coverage text. Preserve horizontal scrolling inside source-code panels. |
| Five social images returned 404 from the deploy preview. | The image metadata pointed at production, where the unmerged assets did not exist. | Resolve sharing images against the Netlify deploy origin for preview contexts; keep production canonicals and production image origins for production builds. |

## Verification

The earlier page-level responsive test did not assert the embedded documents' widths. The new test exercises every viewer and checks inside-frame widths both before and after interaction.

- Eight viewers at desktop 1440px and touch-enabled mobile 390px and 320px: 24 passing combinations. See [the recorded results](viewer-regressions.json).
- Walkthrough next/previous, playback, last-step boundary, chapters and coverage disclosure.
- Design diagrams, document navigation and disclosures.
- Map file and symbol selection, zoom, touch/mouse canvas pan, reset and full-size links.
- Both quizzes: unanswered, incorrect and all-correct responses; feedback; reset; narrow layout after results.
- Comic image decoding and transcript disclosure.
- All five routes' production and preview sharing metadata; preview noindex/robots and production canonical behavior.
- Browser script and same-site HTTP errors are asserted in the regression matrix.

Touch dragging is tested on actual canvas background, found with a hit test. A card intentionally selects a file; its heading supports node dragging. The original touch-pan implementation did not require a behavior change.

The only viewer amendments are the recorded wrapping styles. Original full HTML inputs are retained as lossless gzip files. Build validation removes each exact style block and verifies the remaining HTML against its original SHA-256, preserving source, controls, grading, diagrams and artwork.

## Mobile evidence

Screenshots compare the original live deployment with the corrected local production build.

| Viewer | Before | After |
| --- | --- | --- |
| Map provenance | [Before](react-map-before.png) | [After](react-map-after.png) |
| Quiz coverage | [Before](silk-quiz-before.png) | [After](silk-quiz-after.png) |
| Walkthrough revision | [Before](silk-walkthrough-before.png) | [After](silk-walkthrough-after.png) |

The existing homepage, article and social-card screenshots remain in ../website-revamp/. These corrections preserve that visual design.
