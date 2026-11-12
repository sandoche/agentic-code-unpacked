// Generated from packages/presentations/code-map/src/scripts/code-map.mts. Edit that source, then run pnpm skills:build.
import { decodeMapContent } from '../runtime/scripts/decode.mjs';
import { message, present } from '../runtime/scripts/values.mjs';
import { option } from '../runtime/scripts/core.mjs';
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { VERSION, validateContext, assertEvidence, resolveEvidence, escapeHtml, renderShell, readJson, writeJson, finishArtifact, outputDirectory, parseArgs, } from '../runtime/scripts/core.mjs';
import { validateAnalysis } from '../runtime/scripts/analysis.mjs';
import { highlightCode, highlightCss } from '../runtime/scripts/highlight.mjs';
const asset = (name) => new URL(`../assets/${name}`, import.meta.url);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const directory = (name) => path.posix.dirname(name.replace(/\\/g, '/'));
function packedLayout(files) {
    const byDirectory = new Map();
    for (const file of files) {
        const name = directory(file.path);
        if (!byDirectory.has(name))
            byDirectory.set(name, []);
        present(byDirectory.get(name)).push(file);
    }
    if (!files.length)
        return { groups: [], positions: new Map() };
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
                if (candidate < top) {
                    column = start;
                    top = candidate;
                }
            }
            const x = 40 + column * 340, rows = Math.ceil(groupFiles.length / span);
            groups.push({ name, x, y: top, fileIds: groupFiles.map(file => file.id) });
            groupFiles.forEach((file, index) => positions.set(file.id, { x: x + index % span * 340, y: top + 34 + Math.floor(index / span) * 180 }));
            const nextTop = top + rows * 180 + 46;
            for (let offset = 0; offset < span; offset++)
                heights[column + offset] = nextTop;
            right = Math.max(right, x + (span - 1) * 340 + 310);
            bottom = Math.max(bottom, nextTop - 50);
        }
        const score = Math.max((right - 40) / 1.25, bottom - 40);
        if (!best || score < best.score)
            best = { groups, positions, score };
    }
    return present(best);
}
function citations(context, ids) {
    return [...ids].sort(compare).map(id => {
        const evidence = resolveEvidence(context, id);
        return { id, path: evidence.path, side: evidence.side, startLine: evidence.startLine, endLine: evidence.endLine, ...(evidence.url && /^https?:\/\//.test(evidence.url) ? { url: evidence.url } : {}) };
    });
}
export function validateContent(context, value) {
    let content = value === undefined ? undefined : decodeMapContent(value);
    if (content === undefined)
        content = { schemaVersion: 2 };
    if (content === null || ![1, 2].includes(content.schemaVersion) || typeof content !== 'object')
        throw Error('Content requires schemaVersion 1 or 2');
    for (const key of ['title', 'summary'])
        if (content[key] !== undefined && typeof content[key] !== 'string')
            throw Error(`${key} must be text`);
    const files = new Set(context.files.map(file => file.id));
    const annotations = content.annotations ?? [];
    const relationships = [...(context.relationships ?? []), ...(content.relationships ?? [])];
    if (!Array.isArray(annotations) || !Array.isArray(content.relationships ?? []))
        throw Error('Annotations and relationships must be arrays');
    const ids = new Set();
    for (const note of annotations) {
        if (!note.id || typeof note.id !== 'string' || ids.has(note.id))
            throw Error('Invalid/duplicate annotation ID');
        ids.add(note.id);
        if (!files.has(note.fileId))
            throw Error(`Unknown annotation file: ${note.fileId}`);
        if (typeof note.title !== 'string' || typeof note.text !== 'string')
            throw Error('Annotation title and text are required');
        assertEvidence(context, note.evidenceIds);
        if (!note.evidenceIds.some(id => resolveEvidence(context, id).fileId === note.fileId))
            throw Error('Annotation requires evidence from its file');
    }
    ids.clear();
    const symbols = new Map((context.symbols ?? []).map(symbol => [symbol.id, symbol]));
    for (const edge of relationships) {
        if (!edge.id || typeof edge.id !== 'string' || ids.has(edge.id))
            throw Error('Invalid/duplicate relationship ID');
        ids.add(edge.id);
        if (!files.has(edge.fromFileId) || !files.has(edge.toFileId))
            throw Error(`Unknown relationship endpoint: ${edge.id}`);
        if (typeof edge.label !== 'string' || !edge.label.trim())
            throw Error('Relationship label required');
        if (edge.kind !== undefined && (typeof edge.kind !== 'string' || !edge.kind.trim()))
            throw Error('Relationship kind must be text');
        if (edge.provenance !== undefined && (edge.provenance === null || !['string', 'object'].includes(typeof edge.provenance) || Array.isArray(edge.provenance)))
            throw Error('Relationship provenance must be text or an object');
        for (const [symbolKey, fileKey] of [['fromSymbolId', 'fromFileId'], ['toSymbolId', 'toFileId']]) {
            if (edge[symbolKey] && (!symbols.has(edge[symbolKey]) || present(symbols.get(edge[symbolKey])).fileId !== edge[fileKey]))
                throw Error(`Invalid relationship symbol ownership: ${edge.id}`);
        }
        assertEvidence(context, edge.evidenceIds);
        if (!edge.evidenceIds.some(id => [edge.fromFileId, edge.toFileId].includes(resolveEvidence(context, id).fileId)))
            throw Error('Relationship requires endpoint evidence');
    }
    return { ...content, annotations, relationships };
}
function structure(context) {
    const fileById = new Map(context.files.map(file => [file.id, file]));
    const ids = new Set();
    const symbols = (context.symbols ?? []).map(symbol => {
        if (typeof symbol.id !== 'string' || !symbol.id || ids.has(symbol.id) || typeof symbol.name !== 'string' || !symbol.name || !fileById.has(symbol.fileId))
            throw Error('Invalid/duplicate symbol or symbol file');
        ids.add(symbol.id);
        const file = present(fileById.get(symbol.fileId));
        const source = symbol.side === 'base' ? file.baseContent : file.content;
        if (!Number.isInteger(symbol.startLine) || symbol.startLine < 1 || !Number.isInteger(symbol.endLine) || symbol.endLine < symbol.startLine || typeof source !== 'string' || symbol.endLine > source.replace(/\n$/, '').split('\n').length)
            throw Error(`Invalid symbol source range: ${symbol.id}`);
        assertEvidence(context, symbol.evidenceIds);
        if (!symbol.evidenceIds.some(id => { const evidence = resolveEvidence(context, id); return evidence.fileId === symbol.fileId && evidence.startLine <= symbol.startLine && evidence.endLine >= symbol.endLine; }))
            throw Error(`Symbol file/evidence ownership or range mismatch: ${symbol.id}`);
        return { ...symbol, anchor: `symbol=${encodeURIComponent(symbol.id)}`, citations: citations(context, symbol.evidenceIds) };
    }).sort((a, b) => compare(a.id, b.id));
    const symbolById = new Map(symbols.map(symbol => [symbol.id, symbol]));
    const unresolved = (context.unresolved ?? []).map(item => {
        if (!fileById.has(item.fileId))
            throw Error('Unknown unresolved call file');
        if (item.fromSymbolId && symbolById.get(item.fromSymbolId)?.fileId !== item.fileId)
            throw Error('Invalid unresolved symbol ownership');
        if (item.evidenceIds?.length)
            assertEvidence(context, item.evidenceIds);
        return { ...item, citations: citations(context, item.evidenceIds ?? []) };
    }).sort((a, b) => compare(a.fileId, b.fileId) || (a.line ?? 0) - (b.line ?? 0) || compare(a.expression ?? '', b.expression ?? ''));
    return { symbols, unresolved };
}
function teaching(context, symbols) {
    if (!context.analysis)
        return { topics: [], flows: [], coverage: new Map(), limitations: [] };
    const analysis = validateAnalysis(context, context.analysis);
    const coverage = new Map(analysis.fileCoverage.map(item => [item.fileId, item]));
    const filesForEvidence = (ids) => ids.map(id => resolveEvidence(context, id).fileId);
    const topics = analysis.topics.map(topic => ({
        ...topic,
        fileIds: [...new Set([...filesForEvidence(topic.evidenceIds), ...analysis.fileCoverage.filter(item => item.topicIds.includes(topic.id)).map(item => item.fileId)])].sort(compare),
        citations: citations(context, topic.evidenceIds),
        reviewFocus: topic.reviewFocus.map(item => ({ ...item, citations: citations(context, item.evidenceIds) })),
        extensionPoints: topic.extensionPoints.map(item => ({ ...item, citations: citations(context, item.evidenceIds) })),
    }));
    const flows = analysis.flows.map(flow => {
        const symbolIds = [...new Set(flow.steps.flatMap(step => step.symbolIds ?? []))].sort(compare);
        return { ...flow, symbolIds, fileIds: [...new Set([...filesForEvidence([...flow.evidenceIds, ...flow.steps.flatMap(step => step.evidenceIds)]), ...symbols.filter(symbol => symbolIds.includes(symbol.id)).map(symbol => symbol.fileId)])].sort(compare), citations: citations(context, flow.evidenceIds), steps: flow.steps.map(step => ({ ...step, citations: citations(context, step.evidenceIds) })) };
    });
    return { topics, flows, coverage, limitations: analysis.limitations };
}
export function buildMap(context, content) {
    validateContext(context);
    const { symbols, unresolved } = structure(context);
    const validated = validateContent(context, content);
    const notes = validated;
    const { topics, flows, coverage, limitations } = teaching(context, symbols);
    const files = [...context.files].sort((a, b) => compare(directory(a.path), directory(b.path)) || compare(a.path, b.path));
    const { groups, positions } = packedLayout(files);
    const nodes = files.map(file => {
        const hunkLines = (file.hunks ?? []).flatMap(hunk => hunk.lines ?? []);
        return {
            ...file,
            highlighted: undefined,
            status: file.status || 'snapshot',
            contextual: file.role === 'context' || file.status === 'context',
            coverageRole: coverage.get(file.id)?.role,
            coverageReason: coverage.get(file.id)?.reason,
            topicIds: topics.filter(topic => topic.fileIds.includes(file.id)).map(topic => topic.id),
            symbolIds: symbols.filter(symbol => symbol.fileId === file.id).map(symbol => symbol.id),
            additions: file.additions ?? hunkLines.filter(line => line.kind === 'add').length,
            deletions: file.deletions ?? hunkLines.filter(line => line.kind === 'remove').length,
            ...present(positions.get(file.id)), width: 310, height: 142,
            evidenceIds: context.evidence.filter(item => item.fileId === file.id).map(item => item.id).sort(compare),
        };
    });
    return {
        schemaVersion: 2, version: VERSION,
        title: validated.title || context.analysis?.title || context.source.title || 'Code map',
        summary: validated.summary || context.analysis?.summary || `${nodes.length} files from a pinned source snapshot. Select a file to inspect its code and evidence.`,
        source: context.source, target: context.target, groups, nodes,
        symbols, unresolved, topics, flows, provenance: context.provenance ?? {},
        annotations: notes.annotations.map(note => ({ ...note, citations: citations(context, note.evidenceIds) })).sort((a, b) => compare(a.id, b.id)),
        relationships: notes.relationships.map(edge => ({ ...edge, kind: edge.kind || 'relationship', provenance: edge.provenance || 'authored evidence (untyped)', citations: citations(context, edge.evidenceIds) })).sort((a, b) => compare(a.id, b.id)),
        evidence: [...context.evidence].sort((a, b) => compare(a.id, b.id)),
        limitations: [...new Set([...context.limitations, ...limitations, ...(unresolved.length ? [`${unresolved.length} dynamic, external, or unavailable targets remain unresolved; inspect a file or symbol for its gaps.`] : []), ...(notes.relationships.length ? [] : ['No source-backed relationships were supplied; directory layout does not imply dependencies.'])])],
    };
}
export async function renderCodeMap(context, content, dir) {
    const model = buildMap(context, content);
    for (const node of model.nodes) {
        node.highlighted = {};
        if (typeof node.content === 'string')
            node.highlighted.head = await highlightCode(node.content, { path: node.path });
        if (typeof node.baseContent === 'string')
            node.highlighted.base = await highlightCode(node.baseContent, { path: node.oldPath || node.path });
    }
    await mkdir(dir, { recursive: true });
    const css = highlightCss + await readFile(asset('map.css'), 'utf8') + await readFile(asset('structure.css'), 'utf8');
    const script = await readFile(asset('map.js'), 'utf8');
    const body = `<header><div><p class="eyebrow">CODE UNPACKED / CODE MAP</p><h1>${escapeHtml(model.title)}</h1><p class="summary">${escapeHtml(model.summary)}</p></div><p class="revision">Source <code>${escapeHtml(context.source.head || 'local selection')}</code></p></header>
<div class="toolbar" aria-label="Canvas controls"><label>Find file <input id="search" type="search" placeholder="Search files or symbols" autocomplete="off"></label><label class="check"><input id="changed" type="checkbox"${['pr', 'branch'].includes(context.target.kind) ? ' checked' : ''}>Changed only</label><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button><button id="fit">Fit files</button><button id="reset">Reset layout</button><output id="zoom-label" aria-live="polite">100%</output><span id="count" class="muted"></span></div>
<div class="toolbar teaching-filters" aria-label="Review filters"><label>Topic <select id="topic-filter" aria-label="Topic"><option value="">All topics</option>${model.topics.map(topic => `<option value="${escapeHtml(topic.id)}">${escapeHtml(topic.title)}</option>`).join('')}</select></label><label>Flow <select id="flow-filter" aria-label="Flow"><option value="">All flows</option>${model.flows.map(flow => `<option value="${escapeHtml(flow.id)}">${escapeHtml(flow.title)}</option>`).join('')}</select></label><label>Relationship type <select id="relationship-kind" aria-label="Relationship type"><option value="">All types</option>${[...new Set(model.relationships.map(edge => edge.kind))].sort(compare).map(kind => `<option value="${escapeHtml(kind)}">${escapeHtml(kind)}</option>`).join('')}</select></label><button id="review-guide">Review guide</button><span class="muted filter-help">Context files appear when Changed only is cleared or a symbol link opens one.</span></div>
<main><nav class="file-nav" aria-label="Files"><h2>Files</h2><p class="muted help">Select a path for code. Drag the canvas to pan; scroll to zoom.</p><ul id="file-list">${model.nodes.map(node => `<li data-file="${escapeHtml(node.id)}"><button class="file-select" data-id="${escapeHtml(node.id)}" title="${escapeHtml(node.path)}">${escapeHtml(node.path)}</button><small>${escapeHtml(node.status)}</small></li>`).join('')}</ul></nav><section id="viewport" tabindex="0" aria-label="Explorable code canvas"><div id="plane"><svg id="edges" aria-label="Source-backed relationships"></svg><div id="groups"></div><div id="cards"></div></div><p id="empty" hidden>No files match.</p></section><aside id="detail" aria-label="Selected file"><h2>Explore the code</h2><p>Select any file on the canvas or in the file list.</p></aside></main>
<footer><details${model.limitations.length ? ' open' : ''}><summary>Coverage and interpretation (${model.limitations.length})</summary><ul>${model.limitations.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul><p>Source provenance: ${escapeHtml(Object.entries(model.provenance).map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`).join(' · ') || 'Captured source; no additional extractor metadata supplied.')}</p></details><p>Directory layout is independent of call semantics. Calls, imports, construction, verified routes, and tests retain their own edge types and provenance. Dynamic targets remain gaps. The canvas works offline; source links open separately.</p></footer><noscript><p>Enable JavaScript for the canvas. All paths and statuses are listed above; the adjacent map.json contains the full source snapshot.</p></noscript>`;
    await writeJson(path.join(dir, 'map.json'), model);
    await writeFile(path.join(dir, 'index.html'), renderShell({ title: model.title, body, css, script, data: model }));
    return finishArtifact({ dir, skill: 'code-map', context, outputs: ['map.json', 'index.html'], summary: model.summary, markdown: `${model.nodes.length} file cards · ${model.symbols.length} symbols · ${model.relationships.length} source-backed relationships.\n\nIncludes file/function exploration, callers and callees, topic/flow filters, syntax highlighting, and source gaps.`, limitations: model.limitations.filter(item => !context.limitations.includes(item)) });
}
async function main() {
    const { positional, options } = parseArgs(process.argv.slice(2));
    if (positional[0] !== 'render' || !option(options, 'context') || !option(options, 'root'))
        throw Error('Usage: node code-map.mjs render --context FILE [--content FILE] --root DIR');
    const context = validateContext(await readJson(present(option(options, 'context'))));
    const contentFile = option(options, 'content');
    const content = contentFile ? decodeMapContent(await readJson(contentFile)) : undefined;
    const dir = outputDirectory(present(option(options, 'root')), context.target, 'code-map');
    await renderCodeMap(context, content, dir);
    process.stdout.write(`${dir}\n`);
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url)
    main().catch((error) => { process.stderr.write(`${message(error)}\n`); process.exitCode = 1; });
