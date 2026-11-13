# Large-PR quality review

Recorded 2026-11-13 against Code Unpacked 0.3.0 at
`ed416d3f18ace6531ebd4601ad6a6769e8ead971` and the fixes in this change.

## Evidence and scope

The complete committed differences were captured from these recorded revisions:

| Source | Base | Head | Changed files |
| --- | --- | --- | ---: |
| [Vue Vapor mode](https://github.com/vuejs/core/pull/12359) | `be178f876caad694ebbb1fd0a88a2c7cdabe361e` | `3a3bd842cad433462697f329c3dceaf274b3847d` | 303 |
| [React Compiler](https://github.com/react/react/pull/29061) | `915b914b3a05b60590c75851464e1ca75249976d` | `575477a2e8f9db57ef4a1bf0d3b449e4f8244af8` | 3,669 |

The showcase runs retain every changed-file inventory entry and shared analysis
fileCoverage entry, plus 54 unchanged context files for Vue and four for React.
Source is pinned to these commits; recorded metadata does not establish the latest
upstream revision. The analyzed projects were not executed or comprehensively
tested. These artifacts explain captured code; they do not verify either compiler.

The retrieved Vue discussion contained ten issue comments, no submitted reviews,
and no inline review comments. React contained 36 issue comments, three reviews,
and no inline review comments. Vue discussion identifies ongoing development and
history-preserving integration; React discussion includes history and fix-forward
lint handling. These threads provide context, not a detailed correctness oracle.
Technical findings below come from captured source, artifacts, and reproductions.

Graph discovery used generation `2026-11-12T15:52:44Z`. The isolated quality
worktree is excluded from that graph; its actual TypeScript and assets were read
directly. No claim here treats the graph as verification of this checkout.

## Confirmed defects and fixes

| Observed failure | Reproduction and narrow fix |
| --- | --- |
| React retained a count of 3,669 but replaced two Unicode fixture paths with literal `\\342\\200\\223` strings. The corresponding blobs/evidence were silently missing. | Compare captured paths with `git diff --name-only -z` at the pinned commits. Decode Git C-quoted UTF-8 bytes and quoted rename paths; missing blob metadata now produces an explicit omission. Regression covers the actual en-dash filename, both revisions, and encoded evidence URLs. |
| TypeScript was parsed as JavaScript. Vue omitted structure in 29 valid files; React had 34 false `.ts` omissions. | Generic functions and angle-bracket assertions reproduce the parser failure. Select TS/TSX/JSX/JS by extension, and remove an old parser limitation only after successful parsing. Vue refresh: symbols 1,717 → 2,088; relationships 2,443 → 2,962; parser gaps 29 → 0. React: symbols 3,015 → 3,275; relationships 1,410 → 2,020; parser gaps 47 → 13, with zero `.ts` parser gaps. More unresolved calls reflect newly visible code, not verified dynamic targets. |
| Vue's complete map HTML was 47,651,801 bytes and failed the publisher's 25 MiB attachment limit. | Keep the original offline HTML and full source, additionally create a standard lossless `index.html.zip`, record both hashes, and select the truthfully named ZIP for upload. The attachment limit remains enforced on the archive. Regression checks exact decompression, CRC, manifest, delivery selection, and unchanged small HTML handling. |
| React's reverse-design draft reached 70,746 characters before attachment links. Vue's draft was already 63,094. | Large inline Markdown gets an explicitly labeled compact comment; complete authored Markdown remains in comment-content.json and complete documents/diagrams remain in HTML. Whole limitation entries are bounded with a shown/total disclosure. The publisher reserves the exact attachment-link length inside a 60,000-character budget. No document or Mermaid fence is sliced. |
| A 3,669-card map's Fit files left 3,156 cards outside a 1440 × 900 viewport. | A browser fixture at the actual React file count reproduces the fixed 12% minimum scale. Fit now uses the scale required by all visible cards, and zoom can return to that fitted scale. Every card remains searchable; source DOM stays lazy. |
| Expanding Vue walkthrough coverage on a 390-pixel phone widened the document to 664 pixels. | Long captured paths in coverage entries did not wrap. Add wrapping to the coverage entries; retain the complete paths. |
| React's quiz widened a 390-pixel phone viewport to 487 pixels. | DOM inspection traced the overflow to long limitation paths in coverage entries. Contained Mermaid diagrams were not the cause. Wrap coverage text without changing diagrams or hiding content; a browser regression uses the actual React omission path and checks width before and after revealing feedback. |
| Installed workflows pointed to nonexistent development tests. | Correct the development-checkout paths and state explicitly that installed bundles omit tests; installed users verify their generated artifacts in the browser. |

One additional scalability defect was reproduced synthetically, not observed in
either showcase: 72 individually allowed 480 KB files with small one-line changes
exceeded the collector's single 64 MiB base/head batch. Hydration now processes
size-bounded 8 MiB batches. The regression verifies every file, both snapshots,
evidence count, and original source pins without truncating the inventory.

## Validation and remaining limits

Focused core, extraction, ZIP/comment, and 3,669-file browser regressions passed.
`pnpm run check` passed type checking, linting, generated-bundle freshness,
website checks, skill Markdown checks, and 100 of 102 tests, with no failures.
Two existing optional video integrations skipped because FFmpeg was unavailable.
The final head-only contextual-source guard was followed by a focused pinned
capture regression and repeated type/lint/bundle checks. This does not substitute
for Vue or React's own tests.
The subsequent quiz coverage-wrapping fix passed all four quiz browser tests,
including the real-path mobile regression, plus generated-bundle freshness.

Vue's corrected five-format browser smoke passed with zero JavaScript errors and
zero HTTP requests. The complete map retained 303 changed and 357 total files;
topic filters, source views, stable symbol links, callees, pan, zoom, and reset
worked. The expanded walkthrough coverage fit a 390-pixel viewport. The 20-question
quiz scored 100 for all correct and 95 for one wrong answer, then reset correctly;
all three generated comic PNGs loaded. Independent Python zipfile validation found
one `index.html` member, no CRC errors, and exact byte equality: 49,159,927-byte
HTML compressed to 3,406,086 bytes. Manifest and context hashes matched the final
source snapshot.

React's final complete map retained all 3,669 changed files plus four context
files. Its 111,165,670-byte HTML and 135,598,667-byte JSON also exceed GitHub's
100 MiB repository-blob limit; the 7,728,884-byte ZIP permits distribution while
the full originals remain local. No artifact scope was reduced to reach that size.
Independent Python zipfile validation also confirmed its exact HTML bytes and CRC.
Native browser uploading was unavailable during the live session. That external
platform limitation is separate from package generation: native browser upload
end to end was not verified, and this report makes no successful-upload claim.

The shared analysis remains authored and evidence-backed; a syntactically valid
citation does not prove its explanation. Walkthrough chapters, design documents,
quiz answers, map teaching filters, and comics must be reviewed against that same
analysis. Their evidence IDs, artifact paths, offline behavior, context schema,
and source pins are preserved by these changes.

Remaining boundaries include the per-source 512 KB limit, intentionally excluded
generated/sensitive paths, bounded import expansion, unsupported syntax such as
Flow, conservative unresolved calls, and complete-HTML memory/highlighting costs.
The existing 64 MiB Git-command buffer still bounds unusually large raw diff text.
The GitHub API's 3,000-file cap still requires local pinned Git objects for React.
ZIP compression cannot guarantee an archive below the attachment limit; failed
delivery remains separate from completed generation. Full inventories and honest
omissions are retained even when teaching content focuses on selected topics.

Comics require image generation and visual inspection. One Vue strip's initial
image attempt overused the series-wide cast/concept and was regenerated with strip-local
instructions. Prompt quality remains an authoring limitation; it does not establish
compiler behavior. Quiz scores measure only the supplied exercise, and upstream
merge status or celebratory review comments do not establish review completeness.
