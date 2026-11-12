import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import {
  escapeHtml,
  hash,
  parseArgs,
  outputDirectory,
  validateContext,
  assertEvidence,
  citationHtml,
  readJson,
  writeJson,
  renderShell,
  finishArtifact,
  loadBrowser,
} from "../../../runtime/scripts/core.mjs";

const nonempty = (value, label) => {
  if (typeof value !== "string" || !value.trim()) throw Error(`${label} must be a nonempty string`);
};
const identifier = (value, label) => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value))
    throw Error(`${label} must be a safe identifier`);
};
const uniqueId = (value, seen, label) => {
  identifier(value, label);
  if (seen.has(value)) throw Error(`Duplicate ${label}: ${value}`);
  seen.add(value);
};

export function validateStoryboard(context, storyboard) {
  validateContext(context);
  if (![1, 2].includes(storyboard?.schemaVersion))
    throw Error("Storyboard schemaVersion must be 1 or 2");
  nonempty(storyboard.title, "title");
  nonempty(storyboard.concept, "concept");
  assertEvidence(context, storyboard.evidence);
  if (!Array.isArray(storyboard.characters) || !storyboard.characters.length)
    throw Error("At least one personified character required");
  const characters = new Set();
  for (const character of storyboard.characters) {
    uniqueId(character.id, characters, "character id");
    nonempty(character.name, "character name");
    nonempty(character.role, "character role");
    assertEvidence(context, character.evidence);
  }
  if (
    !Array.isArray(storyboard.strips) ||
    storyboard.strips.length < 1 ||
    storyboard.strips.length > 12
  )
    throw Error("Use 1 to 12 strips");
  const strips = new Set();
  for (const strip of storyboard.strips) {
    uniqueId(strip.id, strips, "strip id");
    nonempty(strip.title, "strip title");
    nonempty(strip.limitation, "strip limitation");
    if (strip.topicId && !context.analysis?.topics?.some((topic) => topic.id === strip.topicId))
      throw Error(`Unknown analysis topic: ${strip.topicId}`);
    if (!Array.isArray(strip.panels) || strip.panels.length < 2 || strip.panels.length > 6)
      throw Error("Each strip needs 2 to 6 panels");
    const panels = new Set();
    for (const panel of strip.panels) {
      uniqueId(panel.id, panels, "panel id");
      nonempty(panel.scene, "panel scene");
      assertEvidence(context, panel.evidence);
      if (panel.caption !== undefined && typeof panel.caption !== "string")
        throw Error("Panel caption must be text");
      if (panel.dialogue !== undefined && !Array.isArray(panel.dialogue))
        throw Error("Panel dialogue must be an array");
      for (const line of panel.dialogue || []) {
        if (!characters.has(line.characterId))
          throw Error(`Unknown character: ${line.characterId}`);
        nonempty(line.text, "dialogue text");
      }
      if (!panel.caption?.trim() && !(panel.dialogue || []).length)
        throw Error("Each panel needs a caption or dialogue");
    }
  }
  return storyboard;
}

export function makePrompts(storyboard) {
  const style =
    "Create a COMPLETE COMIC image, including all lettering, dialogue, captions, title, and code labels. Original minimalist black-and-white stick figures on white, thin hand-drawn black lines, expressive simple poses, consistent characters. Use clear large readable lettering. Place dialogue in speech bubbles attached to the correct speaker. Render supplied text verbatim; preserve punctuation, accents, and code identifiers. The image itself must explain the concept without an external caption grid. No logos or watermark.";
  const cast = storyboard.characters
    .map((c) => `${c.id}: visible code label ${JSON.stringify(c.name)}; role ${c.role}`)
    .join("\n");
  const names = new Map(storyboard.characters.map((c) => [c.id, c.name]));
  return {
    schemaVersion: 2,
    mode: "complete-comic",
    requiredCapability: "generative-image-model",
    preferredTool: "image_gen",
    entries: storyboard.strips.map((strip) => {
      const prompt = `${style}\nSeries title (visible): ${JSON.stringify(storyboard.title)}\nStrip title (visible): ${JSON.stringify(strip.title)}\nTechnical concept: ${storyboard.concept}\nCast and source-backed roles:\n${cast}\nDraw one horizontal strip with ${strip.panels.length} panels separated by thin black borders. All panels have equal width; leave enough room for readable text.\n${strip.panels.map((panel, i) => `Panel ${i + 1}: ${panel.scene}\n${(panel.dialogue || []).map((line) => `Speech by ${JSON.stringify(names.get(line.characterId))}: ${JSON.stringify(line.text)}`).join("\n")}\nCaption (visible): ${JSON.stringify(panel.caption || "")}`).join("\n\n")}\nTechnical boundary to preserve (do not invent a stronger guarantee): ${strip.limitation}`;
      return {
        stripId: strip.id,
        mode: "complete-comic",
        prompt,
        promptHash: hash(prompt),
        artwork: [],
      };
    }),
  };
}

export function planComicTopics(context, { count, panels = 3 } = {}) {
  validateContext(context);
  if (
    count !== undefined &&
    (!Number.isInteger(Number(count)) || Number(count) < 1 || Number(count) > 12)
  )
    throw Error("Comic count must be an integer from 1 to 12");
  if (!Number.isInteger(Number(panels)) || Number(panels) < 2 || Number(panels) > 6)
    throw Error("Panel count must be an integer from 2 to 6");
  if (!Array.isArray(context.analysis?.topics))
    throw Error(
      "Shared analysis topics required; inspect source and author analysis before planning comics",
    );
  const priority = { high: 0, medium: 1, low: 2 },
    seen = new Set(),
    candidates = [];
  for (const [index, topic] of context.analysis.topics.entries()) {
    if (!topic.id || seen.has(topic.id)) throw Error("Invalid/duplicate comic topic");
    seen.add(topic.id);
    nonempty(topic.title, "topic title");
    nonempty(topic.summary, "topic summary");
    assertEvidence(context, topic.evidenceIds);
    if (
      topic.comicSuitable === false ||
      topic.role === "supporting" ||
      /^(?:verification|release|tests?|supporting)$/i.test(topic.id) ||
      /^(?:test coverage|supporting changes|release metadata|what (?:the )?tests)/i.test(
        topic.title,
      )
    )
      continue;
    candidates.push({ ...topic, index });
  }
  candidates.sort(
    (a, b) => (priority[a.priority] ?? 1) - (priority[b.priority] ?? 1) || a.index - b.index,
  );
  if (!candidates.length)
    throw Error("No evidence-backed behavioral or invariant topics are suitable for a comic");
  const requestedCount = count === undefined ? "auto" : Number(count),
    wanted = requestedCount === "auto" ? Math.min(6, candidates.length) : requestedCount;
  const topics = candidates.slice(0, wanted).map(({ index, ...topic }) => topic),
    limitations = [];
  if (topics.length < wanted)
    limitations.push(
      `Requested ${wanted} comics but only ${topics.length} distinct source-backed topics are available; do not pad with generic strips.`,
    );
  return {
    schemaVersion: 2,
    requestedCount,
    generatedCount: topics.length,
    panels: Number(panels),
    topics,
    limitations,
  };
}

function imageType(bytes) {
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return { extension: "png", mime: "image/png" };
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return { extension: "jpg", mime: "image/jpeg" };
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return { extension: "webp", mime: "image/webp" };
  throw Error("Artwork must be PNG, JPEG, or WebP from a generative image model");
}

async function prepareArtwork(dir, strip, entry, supplied, previous) {
  let specification = supplied;
  if (
    !specification &&
    previous?.mode === "complete-comic" &&
    previous.promptHash === entry.promptHash &&
    previous.artwork?.length === 1
  ) {
    const saved = previous.artwork;
    if (saved.every((item) => /^artwork\/[a-zA-Z0-9_-]+\.(png|jpg|webp)$/.test(item.path))) {
      const checked = await Promise.all(
        saved.map(async (item) => {
          try {
            const bytes = await readFile(path.join(dir, item.path));
            return hash(bytes) === item.sha256;
          } catch {
            return false;
          }
        }),
      );
      if (checked.every(Boolean)) specification = { strip: path.join(dir, saved[0].path) };
    }
  }
  if (!specification) return null;
  if (typeof specification === "string") specification = { strip: specification };
  if (!specification.strip || specification.panels || typeof specification.strip !== "string")
    throw Error(
      `Supply one complete strip image including lettering for ${strip.id}; separate panel images are not accepted`,
    );
  const files = [specification.strip];
  await mkdir(path.join(dir, "artwork"), { recursive: true });
  const images = [];
  for (const file of files) {
    const bytes = await readFile(file);
    if (bytes.length > 20 * 1024 * 1024)
      throw Error("Artwork exceeds 20 MiB; resize with the image generation tool");
    const type = imageType(bytes);
    const relative = `artwork/${strip.id}-${entry.promptHash.slice(0, 12)}.${type.extension}`;
    await writeFile(path.join(dir, relative), bytes);
    images.push({
      path: relative,
      sha256: hash(bytes),
      extension: type.extension,
      bytes,
      dataUrl: `data:${type.mime};base64,${bytes.toString("base64")}`,
    });
  }
  entry.layout = "strip";
  entry.artwork = images.map(({ path, sha256 }) => ({
    path,
    sha256,
    provenance: "supplied-generative-artwork",
  }));
  return { layout: "strip", images };
}

function transcript(storyboard, context) {
  const characters = new Map(storyboard.characters.map((c) => [c.id, c.name]));
  const sources = (ids) =>
    ids
      .map((id) => {
        const e = context.evidence.find((item) => item.id === id);
        const file = context.files.find((item) => item.id === e.fileId);
        return `${file.path}:${e.startLine}-${e.endLine}${e.url ? ` (${e.url})` : " (local snapshot)"}`;
      })
      .join("; ");
  return `# ${storyboard.title}\n\n${storyboard.concept}\n\nSource revision: ${context.source.head}\n\n${storyboard.strips.map((strip) => `## ${strip.title}\n\n${strip.panels.map((panel, i) => `### Panel ${i + 1}\n\nScene: ${panel.scene}\n\n${(panel.dialogue || []).map((line) => `${characters.get(line.characterId)}: ${line.text}`).join("\n\n")}${panel.caption ? `\n\n${panel.caption}` : ""}\n\nEvidence: ${sources(panel.evidence)}`).join("\n\n")}\n\nLimitation: ${strip.limitation}`).join("\n\n")}\n`;
}

function comicHtml(context, storyboard, artwork) {
  const cast = new Map(storyboard.characters.map((c) => [c.id, c.name]));
  return storyboard.strips
    .map((strip, stripIndex) => {
      const art = artwork[stripIndex];
      const drawing = !art
        ? '<p class="missing" role="status">Generative artwork required. Run the saved prompt with an image model, then render again with its output.</p>'
        : `<img class="strip-art" src="${art.images[0].dataUrl}" alt="${escapeHtml(`${strip.title}. ${strip.panels.map((p, i) => `Panel ${i + 1}: ${p.scene}`).join(" ")}`)}" aria-describedby="transcript-${escapeHtml(strip.id)}">`;
      return `<section class="comic" data-strip-id="${escapeHtml(strip.id)}"><header><p class="eyebrow">CODE UNPACKED · COMIC ${stripIndex + 1}</p><h2>${escapeHtml(strip.title)}</h2></header>${drawing}<details class="transcript" id="transcript-${escapeHtml(strip.id)}"><summary>Transcript and source evidence</summary>${strip.panels.map((panel, i) => `<article><h3>Panel ${i + 1}</h3>${(panel.dialogue || []).map((line) => `<p><strong>${escapeHtml(cast.get(line.characterId))}:</strong> ${escapeHtml(line.text)}</p>`).join("")}${panel.caption ? `<p>${escapeHtml(panel.caption)}</p>` : ""}<p class="sources">${citationHtml(context, panel.evidence)}</p></article>`).join("")}</details><footer><strong>What this leaves out:</strong> ${escapeHtml(strip.limitation)}</footer></section>`;
    })
    .join("\n");
}

async function exportPng(image, filename, browser) {
  if (image.extension === "png") {
    const width = image.bytes.readUInt32BE(16),
      height = image.bytes.readUInt32BE(20);
    if (!width || !height) throw Error("PNG has invalid dimensions");
    await writeFile(filename, image.bytes); // Exact model pixels and lettering; no overlay or screenshot.
    return { width, height, conversion: "none" };
  }
  const page = await browser.newPage();
  try {
    await page.route("**/*", (route) =>
      route.request().url().startsWith("data:") ? route.continue() : route.abort(),
    );
    const converted = await page.evaluate(async (source) => {
      const img = new Image();
      img.src = source;
      await img.decode();
      if (img.naturalWidth * img.naturalHeight > 50000000)
        throw Error("Artwork exceeds 50 megapixels");
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      return {
        width: canvas.width,
        height: canvas.height,
        data: canvas.toDataURL("image/png").split(",")[1],
      };
    }, image.dataUrl);
    await writeFile(filename, Buffer.from(converted.data, "base64"));
    return { width: converted.width, height: converted.height, conversion: "pixels-only-png" };
  } finally {
    await page.close();
  }
}

export async function renderComic(context, storyboard, dir, { artwork } = {}) {
  validateStoryboard(context, storyboard);
  await mkdir(dir, { recursive: true });
  let previous;
  try {
    previous = await readJson(path.join(dir, "prompts.json"));
  } catch {
    /* First render. */
  }
  if (typeof artwork === "string" && storyboard.strips.length !== 1)
    throw Error("A single artwork file requires exactly one strip; use a strip-id mapping");
  const prompts = makePrompts(storyboard);
  const prepared = [];
  for (const [index, strip] of storyboard.strips.entries()) {
    const supplied = typeof artwork === "string" ? artwork : artwork?.[strip.id];
    try {
      prepared.push(
        await prepareArtwork(
          dir,
          strip,
          prompts.entries[index],
          supplied,
          previous?.entries?.find((item) => item.stripId === strip.id),
        ),
      );
    } finally {
      await writeJson(path.join(dir, "prompts.json"), prompts);
    }
  }
  await writeJson(path.join(dir, "storyboard.json"), storyboard);
  await writeJson(path.join(dir, "prompts.json"), prompts);
  await writeFile(path.join(dir, "transcript.md"), transcript(storyboard, context));
  const css = await readFile(new URL("../assets/comic.css", import.meta.url), "utf8");
  const coverage = context.limitations.length
    ? `<details class="characters"><summary>Source coverage limitations</summary><ul>${context.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>`
    : "";
  const html = renderShell({
    title: storyboard.title,
    css,
    body: `<main><div class="intro"><h1>${escapeHtml(storyboard.title)}</h1><p>${escapeHtml(storyboard.concept)}</p><p>Complete comic images, including dialogue and code labels, come from a generative image model. Open a transcript for source evidence.</p><p class="sources">Source revision: ${escapeHtml(context.source.head)} · ${citationHtml(context, storyboard.evidence)}</p></div>${comicHtml(context, storyboard, prepared)}<details class="characters"><summary>Who is who</summary>${storyboard.characters.map((c) => `<p><strong>${escapeHtml(c.name)}</strong> — ${escapeHtml(c.role)}<br><span class="sources">${citationHtml(context, c.evidence)}</span></p>`).join("")}</details>${coverage}</main>`,
  });
  await writeFile(path.join(dir, "index.html"), html);
  const outputs = [
    "index.html",
    "storyboard.json",
    "prompts.json",
    "transcript.md",
    ...prompts.entries.flatMap((entry) => entry.artwork.map((item) => item.path)),
  ];
  const limitations = [];
  // A failed new export must not leave a prior revision's PNG looking current.
  const priorCount = Math.min(12, previous?.entries?.length || 0);
  for (let index = 0; index < Math.max(storyboard.strips.length, priorCount); index++)
    await rm(path.join(dir, `comic-${String(index + 1).padStart(2, "0")}.png`), { force: true });
  let browser;
  const exports = [];
  try {
    if (prepared.some(Boolean)) {
      if (prepared.some((art) => art && art.images[0].extension !== "png"))
        browser = await loadBrowser();
      for (const [index, strip] of storyboard.strips.entries()) {
        const filename = `comic-${String(index + 1).padStart(2, "0")}.png`;
        if (!prepared[index]) {
          await rm(path.join(dir, filename), { force: true });
          continue;
        }
        try {
          const dimensions = await exportPng(
            prepared[index].images[0],
            path.join(dir, filename),
            browser,
          );
          exports.push({
            stripId: strip.id,
            path: filename,
            ...dimensions,
            promptHash: prompts.entries[index].promptHash,
            artworkHash: prepared[index].images[0].sha256,
          });
          outputs.push(filename);
        } catch (error) {
          limitations.push(`${strip.id}: PNG export incomplete (${error.message.split("\n")[0]})`);
        }
      }
    } else {
      for (let index = 0; index < storyboard.strips.length; index++)
        await rm(path.join(dir, `comic-${String(index + 1).padStart(2, "0")}.png`), {
          force: true,
        });
    }
  } catch (error) {
    limitations.push(`PNG export incomplete: ${error.message.split("\n")[0]}`);
  } finally {
    await browser?.close();
  }
  await writeJson(path.join(dir, "exports.json"), {
    schemaVersion: 2,
    mode: "complete-comic",
    images: exports,
  });
  outputs.push("exports.json");
  const missing = storyboard.strips
    .filter((strip, index) => !prepared[index])
    .map((strip) => strip.id);
  if (missing.length)
    limitations.push(
      `Generative artwork required for: ${missing.join(", ")}. No substitute drawing was generated.`,
    );
  const status = limitations.length ? "incomplete" : "complete";
  return finishArtifact({
    dir,
    skill: "xkcd",
    context,
    outputs,
    status,
    limitations,
    summary: `${storyboard.title}: ${storyboard.concept}`,
    markdown: `${storyboard.strips.map((strip) => `**${strip.title}** — ${strip.limitation}`).join("\n\n")}\n\nThe generated images include the full explanation. Source-backed accessible transcripts are available in the HTML and transcript.md.${status === "incomplete" ? "\n\nArtwork/export is incomplete; see manifest limitations." : ""}`,
  });
}

async function main() {
  const {
    positional: [command],
    options,
  } = parseArgs(process.argv.slice(2));
  if (command === "plan") {
    if (!options.context)
      throw Error("Usage: xkcd.mjs plan --context FILE --root DIR [--count N] [--panels N]");
    const context = await readJson(options.context),
      plan = planComicTopics(context, { count: options.count, panels: options.panels });
    const dir = outputDirectory(options.root || process.cwd(), context.target, "xkcd");
    await writeJson(path.join(dir, "topic-plan.json"), plan);
    process.stdout.write(path.join(dir, "topic-plan.json") + "\n");
    return;
  }
  if (command !== "render" || !options.context || !options.content)
    throw Error(
      "Usage: xkcd.mjs render --context FILE --content FILE --root DIR [--artwork FILE | --artwork-json FILE]",
    );
  if (options.artwork && options["artwork-json"])
    throw Error("Use --artwork or --artwork-json, not both");
  const context = await readJson(options.context);
  const board = await readJson(options.content);
  if (
    options.count !== undefined &&
    (!Number.isInteger(Number(options.count)) ||
      Number(options.count) < 1 ||
      Number(options.count) > 12 ||
      board.strips.length !== Number(options.count))
  )
    throw Error("--count must be 1 to 12 and match the authored complete strips");
  if (
    options.panels !== undefined &&
    (!Number.isInteger(Number(options.panels)) ||
      Number(options.panels) < 2 ||
      Number(options.panels) > 6 ||
      board.strips.some((strip) => strip.panels.length !== Number(options.panels)))
  )
    throw Error("--panels must be 2 to 6 and match every authored strip");
  const artwork = options["artwork-json"]
    ? await readJson(options["artwork-json"])
    : options.artwork;
  const dir = outputDirectory(options.root || process.cwd(), context.target, "xkcd");
  const manifest = await renderComic(context, board, dir, { artwork });
  process.stdout.write(JSON.stringify({ directory: dir, status: manifest.status }) + "\n");
  if (manifest.status !== "complete") process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  });
}
