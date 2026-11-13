# Real viewer snapshots

The site publishes eight viewers selected from three actual Code Unpacked runs. The source revisions, original downloads, excerpt scope, file sizes and SHA-256 hashes live in provenance.json. Production builds check this inventory before Astro runs.

- React: https://github.com/sandoche/react/pull/1
- Vue: https://github.com/sandoche/core/pull/1
- Silk: https://github.com/silk-lang/silk/pull/3079#issuecomment-6854979396

Vue and React source statistics exclude the two artifact commits added to each fork. Silk's captured merge base differs from the PR base ref; both are retained in the inventory. Page loads and production builds do not fetch GitHub data or original bundles. Source links and downloads are user-initiated.

## What is published

Six HTML files are byte-for-byte copies of the published run outputs. The React map and comic are explicit excerpts rendered with the repository's canonical skill renderers.

The map is an explicit eight-file excerpt from the 3,669-file source change. It retains original source for entry, gating, pipeline and dependency files, plus their supported symbols, annotations and relationships. It does not claim the complete map's inventory, source or teaching filters. The original download is always available. A first visual pass confirmed that fitting thousands of metadata-only nodes into the embedded viewer made it harder to use; the final excerpt keeps the working neighborhood readable.

The comic keeps the first original image and panel dialogue from the three-strip run. Its framing describes that scope. No artwork or technical panel text was regenerated.

The bounded source inputs and original comic image are committed here. Run the website's examples:render command to reproduce the two excerpts, then deliberately update the corresponding hashes and byte counts in provenance.json. Regeneration is an authoring action, not part of a normal site build. Temporary renderer output is ignored.

Code snippets retain source URLs and the original project licenses. Complete output manifests and full shared analysis remain in the linked original bundles. The website is a showcase of explanations, not an additional compiler test or benchmark run.
