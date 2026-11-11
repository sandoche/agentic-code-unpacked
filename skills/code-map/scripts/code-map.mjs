import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  VERSION, validateContext, assertEvidence, resolveEvidence, escapeHtml,
  renderShell, readJson, writeJson, finishArtifact, outputDirectory, parseArgs,
} from '../../code-unpacked-core/scripts/core.mjs';

const asset = name => new URL(`../assets/${name}`, import.meta.url);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const directory = name => path.posix.dirname(name.replace(/\\/g, '/'));

function packedLayout(files) {
  const byDirectory = new Map();
  for (const file of files) {
    const name = directory(file.path);
    if (!byDirectory.has(name)) byDirectory.set(name, []);
    byDirectory.get(name).push(file);
  }
  if (!files.length) return { groups: [], positions: new Map() };
  let best;
  // Evaluate bounded, deterministic masonry widths against a landscape canvas.
  // Directory blocks stay intact; large directories can use additional columns.
  const maxColumns = Math.min(files.length, Math.max(3, Math.ceil(Math.sqrt(files.length) * 2)));
  for (let columns = 1; columns <= maxColumns; columns++) {
    const heights = Array(columns).fill(40);
    const groups = [], positions = new Map();
    let right = 40, bottom = 40;
    for (const [name, groupFiles] of byDirectory) {
      const span = Math.min(columns, groupFiles.length);
      let column = 0, top = Infinity;
      for (let start = 0; start <= columns - span; start++) {
        const candidate = Math.max(...heights.slice(start, start + span));
        if (candidate < top) { column = start; top = candidate; }
      }
      const x = 40 + column * 340, rows = Math.ceil(groupFiles.length / span);
      groups.push({ name, x, y: top, fileIds: groupFiles.map(file => file.id) });
      groupFiles.forEach((file, index) => positions.set(file.id, { x: x + index % span * 340, y: top + 34 + Math.floor(index / span) * 180 }));
      const nextTop = top + rows * 180 + 46;
      for (let offset = 0; offset < span; offset++) heights[column + offset] = nextTop;
      right = Math.max(right, x + (span - 1) * 340 + 310);
      bottom = Math.max(bottom, nextTop - 50);
    }
    const score = Math.max((right - 40) / 1.25, bottom - 40);
    if (!best || score < best.score) best = { groups, positions, score };
  }
  return best;
}

function citations(context, ids) {
  return [...ids].sort(compare).map(id => {
    const evidence = resolveEvidence(context, id);
    return { id, path: evidence.path, side: evidence.side, startLine: evidence.startLine, endLine: evidence.endLine, ...(evidence.url && /^https?:\/\//.test(evidence.url) ? { url: evidence.url } : {}) };
  });
}

export function validateContent(context, content) {
  if (content === undefined) return { schemaVersion: 1, annotations: [], relationships: [] };
  if (content === null || content.schemaVersion !== 1 || typeof content !== 'object') throw Error('Content requires schemaVersion 1');
  for (const key of ['title', 'summary']) if (content[key] !== undefined && typeof content[key] !== 'string') throw Error(`${key} must be text`);
  const files = new Set(context.files.map(file => file.id));
  const annotations = content.annotations ?? [];
  const relationships = [...(context.relationships ?? []), ...(content.relationships ?? [])];
  if (!Array.isArray(annotations) || !Array.isArray(content.relationships ?? [])) throw Error('Annotations and relationships must be arrays');
  const ids = new Set();
  for (const note of annotations) {
    if (!note.id || typeof note.id !== 'string' || ids.has(note.id)) throw Error('Invalid/duplicate annotation ID');
    ids.add(note.id);
    if (!files.has(note.fileId)) throw Error(`Unknown annotation file: ${note.fileId}`);
    if (typeof note.title !== 'string' || typeof note.text !== 'string') throw Error('Annotation title and text are required');
    assertEvidence(context, note.evidenceIds);
    if (!note.evidenceIds.some(id => resolveEvidence(context, id).fileId === note.fileId)) throw Error('Annotation requires evidence from its file');
  }
  ids.clear();
  for (const edge of relationships) {
    if (!edge.id || typeof edge.id !== 'string' || ids.has(edge.id)) throw Error('Invalid/duplicate relationship ID');
    ids.add(edge.id);
    if (!files.has(edge.fromFileId) || !files.has(edge.toFileId)) throw Error(`Unknown relationship endpoint: ${edge.id}`);
    if (typeof edge.label !== 'string' || !edge.label.trim()) throw Error('Relationship label required');
    assertEvidence(context, edge.evidenceIds);
    if (!edge.evidenceIds.some(id => [edge.fromFileId, edge.toFileId].includes(resolveEvidence(context, id).fileId))) throw Error('Relationship requires endpoint evidence');
  }
  return { ...content, annotations, relationships };
}

export function buildMap(context, content) {
  validateContext(context);
  const validated = validateContent(context, content);
  // Context edges still need validation when content was omitted.
  const notes = content === undefined ? validateContent(context, { schemaVersion: 1 }) : validated;
  const files = [...context.files].sort((a, b) => compare(directory(a.path), directory(b.path)) || compare(a.path, b.path));
  const { groups, positions } = packedLayout(files);
  const nodes = files.map(file => {
    const hunkLines = (file.hunks ?? []).flatMap(hunk => hunk.lines ?? []);
    return {
      ...file,
      status: file.status || 'snapshot',
      additions: file.additions ?? hunkLines.filter(line => line.kind === 'add').length,
      deletions: file.deletions ?? hunkLines.filter(line => line.kind === 'remove').length,
      ...positions.get(file.id), width: 310, height: 142,
      evidenceIds: context.evidence.filter(item => item.fileId === file.id).map(item => item.id).sort(compare),
    };
  });
  return {
    schemaVersion: 1, version: VERSION,
    title: validated.title || context.source.title || 'Code map',
    summary: validated.summary || `${nodes.length} files from a pinned source snapshot. Select a file to inspect its code and evidence.`,
    source: context.source, target: context.target, groups, nodes,
    annotations: notes.annotations.map(note => ({ ...note, citations: citations(context, note.evidenceIds) })).sort((a, b) => compare(a.id, b.id)),
    relationships: notes.relationships.map(edge => ({ ...edge, citations: citations(context, edge.evidenceIds) })).sort((a, b) => compare(a.id, b.id)),
    evidence: [...context.evidence].sort((a, b) => compare(a.id, b.id)),
    limitations: [...context.limitations, ...(notes.relationships.length ? [] : ['No source-backed relationships were supplied; directory layout does not imply dependencies.'])],
  };
}

export async function renderCodeMap(context, content, dir) {
  const model = buildMap(context, content);
  await mkdir(dir, { recursive: true });
  const css = await readFile(asset('map.css'), 'utf8');
  const script = await readFile(asset('map.js'), 'utf8');
  const body = `<header><div><p class="eyebrow">CODE UNPACKED / CODE MAP</p><h1>${escapeHtml(model.title)}</h1><p class="summary">${escapeHtml(model.summary)}</p></div><p class="revision">Source <code>${escapeHtml(context.source.head || 'local selection')}</code></p></header>
<div class="toolbar" aria-label="Canvas controls"><label>Find file <input id="search" type="search" placeholder="Search all file paths" autocomplete="off"></label><label class="check"><input id="changed" type="checkbox">Changed only</label><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button><button id="fit">Fit files</button><button id="reset">Reset layout</button><output id="zoom-label" aria-live="polite">100%</output><span id="count" class="muted"></span></div>
<main><nav class="file-nav" aria-label="Files"><h2>Files</h2><p class="muted help">Select a path for code. Drag the canvas to pan; scroll to zoom.</p><ul id="file-list">${model.nodes.map(node => `<li data-file="${escapeHtml(node.id)}"><button class="file-select" data-id="${escapeHtml(node.id)}" title="${escapeHtml(node.path)}">${escapeHtml(node.path)}</button><small>${escapeHtml(node.status)}</small></li>`).join('')}</ul></nav><section id="viewport" tabindex="0" aria-label="Explorable code canvas"><div id="plane"><svg id="edges" aria-label="Source-backed relationships"></svg><div id="groups"></div><div id="cards"></div></div><p id="empty" hidden>No files match.</p></section><aside id="detail" aria-label="Selected file"><h2>Explore the code</h2><p>Select any file on the canvas or in the file list.</p></aside></main>
<footer><details${model.limitations.length ? ' open' : ''}><summary>Coverage and interpretation (${model.limitations.length})</summary><ul>${model.limitations.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details><p>Layout expresses folder groups. Only labelled, cited edges express relationships. The canvas works offline; source links open separately.</p></footer><noscript><p>Enable JavaScript for the canvas. All paths and statuses are listed above; the adjacent map.json contains the full source snapshot.</p></noscript>`;
  await writeJson(path.join(dir, 'map.json'), model);
  await writeFile(path.join(dir, 'index.html'), renderShell({ title: model.title, body, css, script, data: model }));
  return finishArtifact({ dir, skill: 'code-map', context, outputs: ['map.json', 'index.html'], summary: model.summary, markdown: `${model.nodes.length} file cards · ${model.relationships.length} source-backed relationships.\n\nIncludes pan, zoom, search, file details, and an accessible file list.`, limitations: model.limitations.filter(item => !context.limitations.includes(item)) });
}

async function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  if (positional[0] !== 'render' || !options.context || !options.root) throw Error('Usage: node code-map.mjs render --context FILE [--content FILE] --root DIR');
  const context = await readJson(options.context);
  const content = options.content ? await readJson(options.content) : undefined;
  const dir = outputDirectory(options.root, context.target, 'code-map');
  await renderCodeMap(context, content, dir);
  process.stdout.write(`${dir}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
