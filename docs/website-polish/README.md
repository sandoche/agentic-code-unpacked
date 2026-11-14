# Website polish, 14 November 2026

This follow-up starts from the merge of PR #7. It adds a transparent hero cutout, GitHub's familiar PR/commit/file-diff vocabulary, green additions and red deletions, and a linked "By Sandoche" credit after the footer note. Published skill viewers and their provenance are unchanged.

## Telegram preview

Before changing the site, a public request using `TelegramBot (like TwitterBot)` received:

- HTTP 200 HTML with the current title, `Code Unpacked — Your PR is a monster.`
- An absolute HTTPS `og:image` URL and its type, dimensions and alt text in the initial HTML.
- HTTP 200 for `/og/home.png`: `image/png`, 1200 × 630, 405,103 bytes.
- Crawlable production robots rules.

Sandoche's Telegram screenshot contained the previous site's title and description. That is evidence of an older cached preview; it does not show a new image fetch failing. We cannot prove Telegram's internal cache or crawler state from a request with its user agent.

The change retains standard [Open Graph image metadata](https://ogp.me/#structured), uses fresh `-v2.jpg` image URLs on all five routes, and supplies opaque 1200 × 630 JPEGs around 106–110 KB. The image MIME type is now `image/jpeg`. Legacy PNG URLs remain available, production canonicals stay on `codeunpacked.san.cx`, and deploy previews use their own origin for image URLs. No Telegram-specific meta tags are invented.

A website change cannot rewrite an already cached Telegram message. After merging, an existing text-only preview may need a refresh through [Telegram's WebpageBot](https://t.me/WebpageBot) and then a new share. No messages were sent or bot actions performed during this work. The verification below covers the site's responses; it does not claim a confirmed Telegram client render.

## Verification

The website regression checks cover all eight native viewers at desktop, 390 px and 320 px touch-mobile widths; page layout at five widths; keyboard/no-script reading; copying; source links; and metadata on every route. Added checks decode the actual JPEG bytes, require 1200 × 630 dimensions and a size below 200 KB, verify the footer credit on every route, check the hero's alpha channel, and require readable contrast for the diff counts on the colored article headers. Production and deploy-preview builds both run.

Visual screenshots:

- [Desktop homepage](desktop.png)
- [Mobile hero and PR statistics](mobile.png)
- [Showcase index](showcase.png)
- [Article statistics](article-stats.png)
- [Desktop footer](footer.png)
- [Mobile footer](footer-mobile.png)

The transparent source, extraction prompt, encoding instructions and Octicons license are documented in [the art notes](../../website/art/README.md). Current social cards can be regenerated with `pnpm --filter website assets:brand`; normal builds use committed assets and contact no image service.
