# Badges in the website's visual language

This is an alternative to PR #9, starting from the same merged badge design on main. It retains the compact badge layout and restyles it with the existing site tokens:

- Source files use the pale yellow from the walkthrough section.
- Commits use the pale teal from the design section.
- Diffs use the warm paper background and retain their green/red counts and five-square summary.
- Straight dark-ink borders, small offset shadows, display numerals and an ink divider echo the site's buttons and illustrated paper labels.

The gray inner count pills are replaced by a simple divider. Icons, labels, source statistics and accessible diff text are retained.

- [Desktop homepage](desktop.png)
- [Mobile statistics](mobile.png)
- [Article header](article.png)

The homepage and three article headers were checked at 320, 390, 768 and 1440 pixels with no horizontal overflow, script errors or broken page assets. The existing repository checks cover the badge inventory, diff contrast, native viewers, other page widths, keyboard/no-script access and metadata.
