// Authoring command only. Production builds validate the committed HTML instead.
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { renderCodeMap } from "../../skills/code-map/scripts/code-map.mjs";
import { renderComic } from "../../skills/xkcd/scripts/xkcd.mjs";
const root = path.dirname(fileURLToPath(import.meta.url));
const inventory = JSON.parse(await readFile(path.join(root, "provenance.json"), "utf8"));
const hash = (value) => createHash("sha256").update(value).digest("hex");
async function publish(id, original) {
  const entry = inventory.examples.find((example) => example.id === id);
  if (!entry) throw new Error("Missing example: " + id);
  let html = original;
  if (
    ["react-map", "silk-quiz", "silk-walkthrough", "react-walkthrough", "vue-walkthrough"].includes(
      id,
    )
  ) {
    if (!html.includes("</head>")) throw new Error("Missing viewer head: " + id);
    const css = (await readFile(path.join(root, "mobile-fixes", id + ".css"), "utf8")).trim();
    html = html.replace(
      "</head>",
      '<style data-website-mobile-fix="' + id + '">' + css + "</style></head>",
    );
    entry.originalSha256 = hash(original);
    entry.presentationFix =
      id === "react-map"
        ? "Wrap source-provenance text on narrow screens."
        : id === "silk-quiz"
          ? "Wrap coverage revision IDs on narrow screens; questions and grading are unchanged."
          : "Wrap revision IDs and source coverage on narrow screens; walkthrough content and controls are unchanged.";
  }
  const publicRoot = path.join(root, "../public/examples", id);
  await mkdir(publicRoot, { recursive: true });
  await writeFile(path.join(publicRoot, "index.html"), html);
  entry.bytes = Buffer.byteLength(html);
  entry.sha256 = hash(html);
}
for (const id of ["react-map", "react-comic"]) {
  const input = JSON.parse(await readFile(path.join(root, "inputs", id + ".json"), "utf8"));
  const output = path.join(root, ".rendered", id);
  if (id === "react-map") await renderCodeMap(input.context, input.content, output);
  else
    await renderComic(input.context, input.storyboard, output, {
      artwork: path.join(root, "artwork/react-gating.png"),
    });
  await publish(id, await readFile(path.join(output, "index.html"), "utf8"));
  console.log(id + ": rendered with the canonical skill viewer");
}
for (const id of ["silk-quiz", "silk-walkthrough", "react-walkthrough", "vue-walkthrough"]) {
  await publish(
    id,
    gunzipSync(await readFile(path.join(root, "originals", id + ".html.gz"))).toString("utf8"),
  );
}
await writeFile(path.join(root, "provenance.json"), JSON.stringify(inventory, null, 2) + "\n");
await writeFile(
  path.join(root, ".rendered/README.txt"),
  "Temporary renderer outputs. Only selected HTML is published.\n",
);
