// Authoring command only. Production builds validate the committed HTML instead.
import path from "node:path";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderCodeMap } from "../../skills/code-map/scripts/code-map.mjs";
import { renderComic } from "../../skills/xkcd/scripts/xkcd.mjs";
const root = path.dirname(fileURLToPath(import.meta.url));
for (const id of ["react-map", "react-comic"]) {
  const input = JSON.parse(await readFile(path.join(root, "inputs", id + ".json"), "utf8"));
  const output = path.join(root, ".rendered", id);
  if (id === "react-map") await renderCodeMap(input.context, input.content, output);
  else
    await renderComic(input.context, input.storyboard, output, {
      artwork: path.join(root, "artwork/react-gating.png"),
    });
  const publicRoot = path.join(root, "../public/examples", id);
  await mkdir(publicRoot, { recursive: true });
  await copyFile(path.join(output, "index.html"), path.join(publicRoot, "index.html"));
  console.log(id + ": rendered with the canonical skill viewer");
}
await writeFile(
  path.join(root, ".rendered/README.txt"),
  "Temporary renderer outputs. Only selected HTML is published.\n",
);
