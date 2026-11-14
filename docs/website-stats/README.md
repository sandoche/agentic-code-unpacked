# A lighter treatment for PR statistics

This follow-up brings the statistics back into the site's editorial design: larger display numerals, small file/commit icons, and plain labels. The individual white boxes, borders, rounded corners and gray count pills are removed. Green additions, red deletions and the five-square diff summary remain.

The homepage statistics sit directly on the page. Colored article headers use a flat paper highlight behind the diff to preserve readable contrast with the same green and red. Source counts and their meaning stay visible; icons are decorative and the diff retains its accessible label.

- [Desktop homepage](desktop.png)
- [Mobile statistics](mobile.png)
- [Article header](article.png)

Visual checks cover the homepage and three article headers at 320, 390, 768 and 1440 pixels. The existing website checks also exercise the native viewers, other page widths, keyboard/no-script access, asset decoding and metadata. The contrast check now follows transparent ancestors to measure the actual background beneath the plain statistics.
