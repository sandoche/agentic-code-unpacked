// Authoring helper: uses the existing browser tooling, never runs during a site build.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadBrowser } from "../../packages/core/scripts/core.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "public/og");
const cache = path.join(root, "node_modules/.cache/brand-assets");
await mkdir(output, { recursive: true });
await mkdir(cache, { recursive: true });
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
const asset = (file) => pathToFileURL(path.join(root, "public", file)).href;
const cards = [
  [
    "home",
    "Your PR is\na monster.",
    "Five ways to understand it before you type “LGTM”.",
    "#f66d52",
  ],
  [
    "showcase",
    "Real PRs.\nReal ways in.",
    "React Compiler, Vue Vapor and Silk. Try the actual outputs.",
    "#087a73",
  ],
  [
    "react-compiler",
    "3,669 files.\nOne way in.",
    "React Compiler / 1,900 commits / a real Code Unpacked run",
    "#f6ce53",
  ],
  [
    "vue-vapor",
    "Follow the\nmoving parts.",
    "Vue Vapor / 303 source files / 856 commits",
    "#087a73",
  ],
  [
    "silk-gzip",
    "Small diff.\nSharp edges.",
    "Silk gzip decoder / 18 source files / 10 commits",
    "#f66d52",
  ],
];
const browser = await loadBrowser();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  for (const [id, title, subtitle, color] of cards) {
    const html =
      '<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:Display;src:url("' +
      asset("fonts/familjen-grotesk.woff2") +
      '")}@font-face{font-family:Body;src:url("' +
      asset("fonts/ibm-plex-sans.woff2") +
      '")}*{box-sizing:border-box}body{margin:0;background:#f7f2e9;color:#19251f;width:1200px;height:630px;overflow:hidden}.brand{position:absolute;left:52px;top:36px;display:flex;align-items:center;gap:12px;font:600 29px Display;letter-spacing:-1px}.brand img{width:48px;height:48px}h1{position:absolute;left:52px;top:138px;margin:0;font:600 100px/.98 Display;letter-spacing:-5px;white-space:pre-line;z-index:1}p{position:absolute;left:56px;bottom:60px;width:580px;margin:0;font:21px/1.5 Body;z-index:1}.monster{position:absolute;width:700px;right:-190px;bottom:28px;mix-blend-mode:multiply}.bar{position:absolute;bottom:0;width:100%;height:16px;background:' +
      color +
      '}.line{position:absolute;left:56px;top:113px;right:56px;height:1px;background:#19251f}</style></head><body><div class="brand"><img src="' +
      asset("logo-mark.svg") +
      '">Code Unpacked</div><div class="line"></div><h1>' +
      escape(title) +
      "</h1><p>" +
      escape(subtitle) +
      '</p><img class="monster" src="' +
      asset("images/pr-monsters.webp") +
      '"><div class="bar"></div></body></html>';
    const file = path.join(cache, id + ".html");
    await writeFile(file, html);
    await page.goto(pathToFileURL(file).href);
    await page.evaluate(() => document.fonts.ready);
    await page.locator(".monster").evaluate((image) => image.decode());
    await page.screenshot({ path: path.join(output, id + ".png") });
  }
  for (const [name, size] of [
    ["favicon-32.png", 32],
    ["apple-touch-icon.png", 180],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    const file = path.join(cache, name + ".html");
    await writeFile(
      file,
      '<style>body{margin:0;display:grid;place-items:center;background:#f7f2e9;width:100vw;height:100vh}img{width:85%;height:85%}</style><img src="' +
        asset("logo-mark.svg") +
        '">',
    );
    await page.goto(pathToFileURL(file).href);
    await page.locator("img").evaluate((image) => image.decode());
    await page.screenshot({ path: path.join(root, "public", name) });
  }
} finally {
  await browser.close();
}
const mark = await readFile(path.join(root, "public/logo-mark.svg"), "utf8");
await writeFile(
  path.join(root, "public/logo.svg"),
  mark
    .replace(
      'width="64" height="64" viewBox="0 0 64 64"',
      'width="360" height="64" viewBox="0 0 360 64"',
    )
    .replace(
      "</svg>",
      '<text x="76" y="43" font-family="Arial,sans-serif" font-size="33" font-weight="700" letter-spacing="-1.4" fill="#19251f">Code Unpacked</text></svg>',
    ),
);
console.log("Generated five 1200×630 social cards, PNG icons and SVG wordmark.");
