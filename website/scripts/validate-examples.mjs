import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inventory = JSON.parse(await readFile(path.join(root, "examples/provenance.json"), "utf8"));
const ids = new Set();
for (const example of inventory.examples) {
  assert.ok(!ids.has(example.id), "Duplicate example ID");
  ids.add(example.id);
  assert.ok(inventory.runs[example.run], "Missing run");
  assert.match(example.src, /^\/examples\/[a-z-]+\/index\.html$/);
  const bytes = await readFile(path.join(root, "public", example.src));
  assert.equal(bytes.length, example.bytes, example.id + " byte count");
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    example.sha256,
    example.id + " hash",
  );
  assert.ok(
    bytes.toString().includes(inventory.runs[example.run].sourceHead),
    example.id + " source revision",
  );
  if (example.presentationFix) {
    const css = (
      await readFile(path.join(root, "examples/mobile-fixes", example.id + ".css"), "utf8")
    ).trim();
    const patch = '<style data-website-mobile-fix="' + example.id + '">' + css + "</style>";
    assert.equal(
      bytes.toString().split(patch).length,
      2,
      example.id + " has one recorded layout patch",
    );
    const original = bytes.toString().replace(patch, "");
    assert.equal(
      createHash("sha256").update(original).digest("hex"),
      example.originalSha256,
      example.id + " content is unchanged outside the CSS patch",
    );
  }
  if (["react", "vue"].includes(example.run)) {
    const repo = inventory.runs[example.run].repository;
    assert.ok(example.originalArtifact.startsWith("https://github.com/" + repo + "/raw/"));
  }
}
for (const [id, repo] of [
  ["react", "sandoche/react"],
  ["vue", "sandoche/core"],
  ["silk", "silk-lang/silk"],
]) {
  assert.equal(inventory.runs[id].repository, repo);
  assert.ok(inventory.runs[id].prUrl.startsWith("https://github.com/" + repo + "/pull/"));
  assert.equal(Object.keys(inventory.runs[id].artifacts).length, 5);
}
const map = JSON.parse(await readFile(path.join(root, "examples/inputs/react-map.json"), "utf8"));
assert.equal(map.originalRun.changedFiles, 3669);
assert.equal(map.context.files.length, 8);
assert.equal(map.context.files.filter((file) => typeof file.content === "string").length, 8);
assert.equal(map.context.source.head, inventory.runs.react.sourceHead);
for (const name of ["home", "showcase", "react-compiler", "vue-vapor", "silk-gzip"]) {
  const image = await readFile(path.join(root, "public/og", name + ".png"));
  assert.equal(image.subarray(1, 4).toString(), "PNG");
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
}
console.log(
  "Verified " +
    ids.size +
    " real viewers, source pins, fork URLs, excerpt scope and five social images.",
);
