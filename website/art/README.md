# Original visual identity

The logo-mark.svg is an original code packet drawn as SVG for this redesign. Its folded page contains code brackets; open packet flaps give the mark its silhouette. The site combines that mark with its self-hosted display face. logo.svg provides a portable wordmark; the favicon and Apple touch icon derive from the same mark.

The original PR-monster illustration was generated with the built-in image generation tool on 2026-11-13. The original source PNG is retained here. The website now uses the transparent cutout described below, encoded as a 1200 × 800 WebP (quality 86). No project logos or statistics are baked into the artwork.

## Generation prompt

Create an original editorial illustration for Code Unpacked, a developer tool website. Wide landscape composition, approximately 3:2. Three funny but slightly threatening pull-request monsters made out of folded code printouts, tangled paper strips and jagged diff pages: a big coral-red many-eyed beast on the right, a teal angular smaller paper creature on the left, and a tiny mustard-yellow zipped-up creature in front. They feel like a mountain of changes waiting for a human review. Sophisticated indie magazine illustration, flat cut-paper shapes, confident dark forest ink outlines, playful exaggerated silhouette, subtle grain, tactile off-white paper. Limited palette: warm cream #f7f2e9 background, dark ink #19251f, coral #f66d52, teal #087a73 and mustard #f6ce53. No gradients, no 3D, no laptop, no browser window. Lots of character and expressive eyes; small teeth, not horror gore. Composition centered with breathing room around the shapes, clean cream background reaching every edge. Absolutely no words, letters, numbers, logos, signatures or watermarks. The illustration must be fully finished, charming and visually memorable. The real metrics will be laid over it separately in HTML.

## Social cards

The five committed 1200 × 630 JPEGs use the original mark, transparent illustration, self-hosted fonts and route-specific text. They have new `-v2.jpg` URLs and quality 82, with a 200 KB size budget. The legacy PNG URLs remain available for previously shared links. The assets:brand authoring command reproduces the current JPEGs and WebP using the existing browser tooling. Site builds validate the JPEG dimensions, format and size without launching a browser. There is no image generation or external asset dependency during build or page use.

## Transparent cutout

The background-extraction edit used the built-in imagegen tool on 2026-11-14, with `transparent_background: true`. The edit target was the original illustration supplied by Sandoche. The resulting RGBA PNG is saved as `pr-monsters-transparent.png`; the website consumes `/images/pr-monsters-cutout.webp`. Alpha is preserved during encoding. The hero and showcase no longer use a multiply blend to hide a rectangular background.

Prompt:

> Use case: background-extraction. Edit target: the attached PR-monster illustration. Remove only the flat warm cream background outside and between the illustrated monsters and loose diff-paper ribbons. Return a clean cutout on a genuinely transparent alpha background for a website hero. Preserve the original three monsters, every eye and face, black ink outlines, coral/teal/yellow colors, paper texture, composition, proportions, and all cream-colored papers and teeth inside the artwork. Do not redraw, add text, add a shadow, or add a new backdrop. Keep the complete artwork uncropped.

## GitHub vocabulary

The PR, commit and file-diff symbols are GitHub's MIT-licensed Octicons, from https://github.com/primer/octicons/tree/main/icons. Their license is retained in `licenses/octicons-LICENSE.txt`. `Octicon.astro` contains the three paths. These decorative symbols accompany visible text; green additions and red deletions also retain their signs and an accessible label. The five-square diff bar is a coarse summary of the added/deleted line mix, reserving at least one square for each nonzero change type. The exact counts remain beside it. The colors and neutral count badges apply to the surrounding website; published skill viewers keep their original presentation.
