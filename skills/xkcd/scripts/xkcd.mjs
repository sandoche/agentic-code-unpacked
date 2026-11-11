import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import {
  escapeHtml, hash, parseArgs, outputDirectory, validateContext, assertEvidence,
  citationHtml, readJson, writeJson, renderShell, finishArtifact, loadBrowser,
} from '../../code-unpacked-core/scripts/core.mjs';

const nonempty = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw Error(`${label} must be a nonempty string`);
};
const identifier = (value, label) => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) throw Error(`${label} must be a safe identifier`);
};
const uniqueId = (value, seen, label) => {
  identifier(value, label);
  if (seen.has(value)) throw Error(`Duplicate ${label}: ${value}`);
  seen.add(value);
};

export function validateStoryboard(context, storyboard) {
  validateContext(context);
  if (storyboard?.schemaVersion !== 1) throw Error('Storyboard schemaVersion must be 1');
  nonempty(storyboard.title, 'title'); nonempty(storyboard.concept, 'concept');
  assertEvidence(context, storyboard.evidence);
  if (!Array.isArray(storyboard.characters) || !storyboard.characters.length) throw Error('At least one personified character required');
  const characters = new Set();
  for (const character of storyboard.characters) {
    uniqueId(character.id, characters, 'character id');
    nonempty(character.name, 'character name'); nonempty(character.role, 'character role');
    assertEvidence(context, character.evidence);
  }
  if (!Array.isArray(storyboard.strips) || storyboard.strips.length < 1 || storyboard.strips.length > 12) throw Error('Use 1 to 12 strips');
  const strips = new Set();
  for (const strip of storyboard.strips) {
    uniqueId(strip.id, strips, 'strip id'); nonempty(strip.title, 'strip title'); nonempty(strip.limitation, 'strip limitation');
    if (!Array.isArray(strip.panels) || strip.panels.length < 2 || strip.panels.length > 6) throw Error('Each strip needs 2 to 6 panels');
    const panels = new Set();
    for (const panel of strip.panels) {
      uniqueId(panel.id, panels, 'panel id'); nonempty(panel.scene, 'panel scene');
      assertEvidence(context, panel.evidence);
      if (panel.caption !== undefined && typeof panel.caption !== 'string') throw Error('Panel caption must be text');
      if (panel.dialogue !== undefined && !Array.isArray(panel.dialogue)) throw Error('Panel dialogue must be an array');
      for (const line of panel.dialogue || []) {
        if (!characters.has(line.characterId)) throw Error(`Unknown character: ${line.characterId}`);
        nonempty(line.text, 'dialogue text');
      }
      if (!panel.caption?.trim() && !(panel.dialogue || []).length) throw Error('Each panel needs a caption or dialogue');
    }
  }
  return storyboard;
}

export function makePrompts(storyboard) {
  const style = 'Create original minimalist black-and-white stick-figure comic artwork: white background, thin hand-drawn black lines, expressive simple poses. No lettering, no letters, no numbers, no speech bubbles, no captions, no logos, no watermark. Keep characters visually consistent. Dialogue and captions will be added separately by a deterministic layout.';
  const cast = storyboard.characters.map(c => `${c.name}: ${c.role}`).join('\n');
  return {
    schemaVersion: 1, requiredCapability: 'generative-image-model', preferredTool: 'image_gen',
    entries: storyboard.strips.map(strip => {
      const prompt = `${style}\nConcept: ${storyboard.concept}\nCharacter roles (do not paint their names):\n${cast}\nDraw one horizontal strip with ${strip.panels.length} panels separated by thin black borders. All panels have equal width.\n${strip.panels.map((p, i) => `Panel ${i + 1}: ${p.scene}`).join('\n')}`;
      return {
        stripId: strip.id, prompt, promptHash: hash(prompt),
        panelPrompts: strip.panels.map((panel, i) => {
          const prompt = `${style}\nConcept: ${storyboard.concept}\nCharacter roles (do not paint their names):\n${cast}\nDraw panel ${i + 1} only: ${panel.scene}`;
          return { panelId: panel.id, prompt, promptHash: hash(prompt) };
        }), artwork: [],
      };
    }),
  };
}

function imageType(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { extension: 'png', mime: 'image/png' };
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { extension: 'jpg', mime: 'image/jpeg' };
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return { extension: 'webp', mime: 'image/webp' };
  throw Error('Artwork must be PNG, JPEG, or WebP from a generative image model');
}

async function prepareArtwork(dir, strip, entry, supplied, previous) {
  let specification = supplied;
  if (!specification && previous?.promptHash === entry.promptHash && previous.artwork?.length) {
    const saved = previous.artwork;
    if (saved.every(item => /^artwork\/[a-zA-Z0-9_-]+(?:-panel-\d+)?\.(png|jpg|webp)$/.test(item.path))) {
      const checked = await Promise.all(saved.map(async item => {
        try { const bytes = await readFile(path.join(dir, item.path)); return hash(bytes) === item.sha256; } catch { return false; }
      }));
      if (checked.every(Boolean)) specification = saved.length === 1 && previous.layout === 'strip'
        ? { strip: path.join(dir, saved[0].path) }
        : { panels: saved.map(item => path.join(dir, item.path)) };
    }
  }
  if (!specification) return null;
  if (typeof specification === 'string') specification = { strip: specification };
  const layout = specification.strip ? 'strip' : 'panels';
  const files = layout === 'strip' ? [specification.strip] : specification.panels;
  if (!Array.isArray(files) || !files.length || files.some(file => typeof file !== 'string')) throw Error(`Invalid artwork for ${strip.id}`);
  if (layout === 'panels' && files.length !== strip.panels.length) throw Error(`Expected ${strip.panels.length} panel images for ${strip.id}`);
  await mkdir(path.join(dir, 'artwork'), { recursive: true });
  const images = [];
  for (const [index, file] of files.entries()) {
    const bytes = await readFile(file);
    if (bytes.length > 20 * 1024 * 1024) throw Error('Artwork exceeds 20 MiB; resize with the image generation tool');
    const type = imageType(bytes);
    const relative = `artwork/${strip.id}${layout === 'panels' ? `-panel-${index + 1}` : ''}.${type.extension}`;
    await writeFile(path.join(dir, relative), bytes);
    images.push({ path: relative, sha256: hash(bytes), dataUrl: `data:${type.mime};base64,${bytes.toString('base64')}` });
  }
  entry.layout = layout;
  entry.artwork = images.map(({ path, sha256 }) => ({ path, sha256 }));
  return { layout, images };
}

function transcript(storyboard, context) {
  const characters = new Map(storyboard.characters.map(c => [c.id, c.name]));
  const sources = ids => ids.map(id => {
    const e = context.evidence.find(item => item.id === id);
    const file = context.files.find(item => item.id === e.fileId);
    return `${file.path}:${e.startLine}-${e.endLine}${e.url ? ` (${e.url})` : ' (local snapshot)'}`;
  }).join('; ');
  return `# ${storyboard.title}\n\n${storyboard.concept}\n\nSource revision: ${context.source.head}\n\n${storyboard.strips.map(strip => `## ${strip.title}\n\n${strip.panels.map((panel, i) => `### Panel ${i + 1}\n\nScene: ${panel.scene}\n\n${(panel.dialogue || []).map(line => `${characters.get(line.characterId)}: ${line.text}`).join('\n\n')}${panel.caption ? `\n\n${panel.caption}` : ''}\n\nEvidence: ${sources(panel.evidence)}`).join('\n\n')}\n\nLimitation: ${strip.limitation}`).join('\n\n')}\n`;
}

function comicHtml(context, storyboard, artwork) {
  const cast = new Map(storyboard.characters.map(c => [c.id, c.name]));
  return storyboard.strips.map((strip, stripIndex) => {
    const art = artwork[stripIndex];
    const drawing = !art
      ? '<p class="missing" role="status">Generative artwork required. Run the saved prompt with an image model, then render again with its output.</p>'
      : art.layout === 'strip'
        ? `<img class="strip-art" src="${art.images[0].dataUrl}" alt="${escapeHtml(strip.panels.map((p, i) => `Panel ${i + 1}: ${p.scene}`).join(' '))}">`
        : `<div class="panel-art-grid" style="--panels:${strip.panels.length}">${art.images.map((image, i) => `<img class="panel-art" src="${image.dataUrl}" alt="${escapeHtml(strip.panels[i].scene)}">`).join('')}</div>`;
    return `<section class="comic" data-strip-id="${escapeHtml(strip.id)}"><header><p class="eyebrow">CODE UNPACKED · COMIC ${stripIndex + 1}</p><h2>${escapeHtml(strip.title)}</h2><p>${escapeHtml(storyboard.concept)}</p></header>${drawing}<div class="caption-grid" style="--panels:${strip.panels.length}">${strip.panels.map((panel, i) => `<article><h3>Panel ${i + 1}</h3>${(panel.dialogue || []).map(line => `<p class="dialogue"><strong>${escapeHtml(cast.get(line.characterId))}:</strong> ${escapeHtml(line.text)}</p>`).join('')}${panel.caption ? `<p>${escapeHtml(panel.caption)}</p>` : ''}<p class="sources">${citationHtml(context, panel.evidence)}</p></article>`).join('')}</div><footer><strong>What this leaves out:</strong> ${escapeHtml(strip.limitation)}</footer></section>`;
  }).join('\n');
}

export async function renderComic(context, storyboard, dir, { artwork } = {}) {
  validateStoryboard(context, storyboard);
  await mkdir(dir, { recursive: true });
  let previous;
  try { previous = await readJson(path.join(dir, 'prompts.json')); } catch { /* First render. */ }
  if (typeof artwork === 'string' && storyboard.strips.length !== 1) throw Error('A single artwork file requires exactly one strip; use a strip-id mapping');
  const prompts = makePrompts(storyboard);
  const prepared = [];
  for (const [index, strip] of storyboard.strips.entries()) {
    const supplied = typeof artwork === 'string' ? artwork : artwork?.[strip.id];
    prepared.push(await prepareArtwork(dir, strip, prompts.entries[index], supplied, previous?.entries?.find(item => item.stripId === strip.id)));
  }
  await writeJson(path.join(dir, 'storyboard.json'), storyboard);
  await writeJson(path.join(dir, 'prompts.json'), prompts);
  await writeFile(path.join(dir, 'transcript.md'), transcript(storyboard, context));
  const css = await readFile(new URL('../assets/comic.css', import.meta.url), 'utf8');
  const coverage = context.limitations.length ? `<details class="characters"><summary>Source coverage limitations</summary><ul>${context.limitations.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details>` : '';
  const html = renderShell({ title: storyboard.title, css, body: `<main><div class="intro"><h1>${escapeHtml(storyboard.title)}</h1><p>Personified code, simplified for explanation. Artwork comes from a generative image model; dialogue is typeset separately.</p><p class="sources">Source revision: ${escapeHtml(context.source.head)} · ${citationHtml(context, storyboard.evidence)}</p></div>${comicHtml(context, storyboard, prepared)}<details class="characters"><summary>Who is who</summary>${storyboard.characters.map(c => `<p><strong>${escapeHtml(c.name)}</strong> — ${escapeHtml(c.role)}<br><span class="sources">${citationHtml(context, c.evidence)}</span></p>`).join('')}</details>${coverage}</main>` });
  await writeFile(path.join(dir, 'index.html'), html);
  const outputs = ['index.html', 'storyboard.json', 'prompts.json', 'transcript.md', ...prompts.entries.flatMap(entry => entry.artwork.map(item => item.path))];
  const limitations = [];
  // A failed new export must not leave a prior revision's PNG looking current.
  for (let index = 0; index < storyboard.strips.length; index++) await rm(path.join(dir, `comic-${String(index + 1).padStart(2, '0')}.png`), { force: true });
  let browser;
  try {
    if (prepared.some(Boolean)) {
      browser = await loadBrowser();
      const page = await browser.newPage({ viewport: { width: 1560, height: 1000 }, deviceScaleFactor: 1 });
      await page.route('**/*', route => route.request().url().startsWith('file:') || route.request().url().startsWith('data:') ? route.continue() : route.abort());
      await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
      for (const [index, strip] of storyboard.strips.entries()) {
        const filename = `comic-${String(index + 1).padStart(2, '0')}.png`;
        if (!prepared[index]) { await rm(path.join(dir, filename), { force: true }); continue; }
        await page.locator(`[data-strip-id="${strip.id}"]`).screenshot({ path: path.join(dir, filename), animations: 'disabled' });
        outputs.push(filename);
      }
    } else {
      for (let index = 0; index < storyboard.strips.length; index++) await rm(path.join(dir, `comic-${String(index + 1).padStart(2, '0')}.png`), { force: true });
    }
  } catch (error) { limitations.push(`PNG composition incomplete: ${error.message.split('\n')[0]}`); }
  finally { await browser?.close(); }
  const missing = storyboard.strips.filter((strip, index) => !prepared[index]).map(strip => strip.id);
  if (missing.length) limitations.push(`Generative artwork required for: ${missing.join(', ')}. No substitute drawing was generated.`);
  const status = limitations.length ? 'incomplete' : 'complete';
  return finishArtifact({ dir, skill: 'xkcd', context, outputs, status, limitations,
    summary: `${storyboard.title}: ${storyboard.concept}`,
    markdown: `### Comic transcript\n\n${storyboard.strips.map(strip => `**${strip.title}**\n\n${strip.panels.map((panel, i) => `${i + 1}. ${panel.caption || (panel.dialogue || []).map(line => line.text).join(' ')}`).join('\n')}\n\nLimitation: ${strip.limitation}`).join('\n\n')}${status === 'incomplete' ? '\n\nArtwork/export is incomplete; see manifest limitations.' : ''}`,
  });
}

async function main() {
  const { positional: [command], options } = parseArgs(process.argv.slice(2));
  if (command !== 'render' || !options.context || !options.content) throw Error('Usage: xkcd.mjs render --context FILE --content FILE --root DIR [--artwork FILE | --artwork-json FILE]');
  if (options.artwork && options['artwork-json']) throw Error('Use --artwork or --artwork-json, not both');
  const context = await readJson(options.context);
  const board = await readJson(options.content);
  const artwork = options['artwork-json'] ? await readJson(options['artwork-json']) : options.artwork;
  const dir = outputDirectory(options.root || process.cwd(), context.target, 'xkcd');
  const manifest = await renderComic(context, board, dir, { artwork });
  process.stdout.write(JSON.stringify({ directory: dir, status: manifest.status }) + '\n');
  if (manifest.status !== 'complete') process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}
