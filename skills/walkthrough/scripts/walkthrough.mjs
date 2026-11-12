// Generated from packages/presentations/walkthrough/src/scripts/walkthrough.mts. Edit that source, then run pnpm skills:build.
import { decodeWalkthrough } from '../runtime/scripts/decode.mjs';
import { message, present } from '../runtime/scripts/values.mjs';
import { option } from '../runtime/scripts/core.mjs';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { escapeHtml, parseArgs, outputDirectory, validateContext, assertEvidence, resolveEvidence, citationHtml, readJson, writeJson, renderShell, finishArtifact, loadBrowser, run, } from '../runtime/scripts/core.mjs';
import { highlightCode, highlightCss } from '../runtime/scripts/highlight.mjs';
const assets = new URL('../assets/', import.meta.url);
async function cleanupVideo(work, dir) {
    const absoluteWork = path.resolve(work), boundary = path.resolve(dir) + path.sep;
    if (!absoluteWork.startsWith(boundary))
        throw Error('Video temporary directory escapes artifact directory');
    await rm(absoluteWork, { recursive: true, force: true });
}
const requiredText = (value, label) => { if (typeof value !== 'string' || !value.trim())
    throw Error(`${label} must be nonempty text`); };
const unique = (values) => [...new Set(values)];
function overviewFromAnalysis(context, content) {
    if (content.overview)
        return content.overview;
    const analysis = context.analysis;
    if (analysis?.schemaVersion !== 2)
        throw Error('Walkthrough v2 needs overview content or shared analysis v2');
    const topics = analysis.topics || [];
    return {
        purpose: present(analysis.summary || content.summary, 'overview purpose'),
        before: topics.filter(topic => topic.before).map(topic => `${topic.title}: ${topic.before}`).join('\n\n'),
        after: topics.filter(topic => topic.after).map(topic => `${topic.title}: ${topic.after}`).join('\n\n'),
        evidence: unique([...(analysis.evidenceIds || []), ...topics.flatMap(topic => topic.evidenceIds || [])]),
        reviewOrder: topics.flatMap(topic => (topic.reviewFocus?.length ? topic.reviewFocus : [{ text: topic.summary, evidenceIds: topic.evidenceIds }]).map(item => ({ title: present(topic.title, 'topic title'), explanation: present(item.text, 'review explanation'), evidence: present(item.evidenceIds, 'review evidence') }))),
        extensionPoints: topics.flatMap(topic => (topic.extensionPoints || []).map(item => ({ title: present(topic.title, 'topic title'), explanation: item.text, evidence: item.evidenceIds, basis: item.basis === 'observed' ? 'observed' : 'proposed' }))),
    };
}
function chaptersFor(content, context = {}) {
    if (content.schemaVersion === 1)
        return [{ id: 'walkthrough', title: 'Walkthrough', kind: 'deep-dive', steps: content.steps }];
    const overview = overviewFromAnalysis(context, content);
    const steps = [{ id: '__overview-purpose', title: 'Purpose', explanation: overview.purpose, evidence: overview.evidence }];
    if (overview.before || overview.after)
        steps.push({ id: '__overview-change', title: 'Before and after', explanation: [overview.before && `Before: ${overview.before}`, overview.after && `After: ${overview.after}`].filter(Boolean).join('\n\n'), evidence: overview.evidence });
    const order = overview.reviewOrder || [];
    if (!order.length)
        steps.push({ id: '__overview-review', title: 'Review order', explanation: 'Follow the deep-dive chapters in their displayed order, then inspect the source evidence and coverage notes.', evidence: overview.evidence });
    if (order.length)
        steps.push({ id: '__overview-review', title: 'Review order', explanation: order.map((item, index) => `${index + 1}. ${item.title}: ${item.explanation}`).join('\n\n'), evidence: unique(order.flatMap(item => item.evidence)) });
    const extensions = overview.extensionPoints || [];
    if (!extensions.length)
        steps.push({ id: '__overview-extension', title: 'Extension guidance', explanation: 'No extension guidance was supplied. Inspect the source and its callers before extending this behavior.', evidence: overview.evidence });
    if (extensions.length)
        steps.push({ id: '__overview-extension', title: 'Extension guidance', explanation: extensions.map(item => `${item.basis === 'observed' ? 'Observed extension point' : 'Proposed extension'} · ${item.title}: ${item.explanation}`).join('\n\n'), evidence: unique(extensions.flatMap(item => item.evidence)) });
    return [{ id: '__overview', title: 'Overview', kind: 'overview', steps }, ...content.chapters.map(chapter => ({ ...chapter, kind: 'deep-dive' }))];
}
export function validateWalkthrough(context, value) {
    const content = decodeWalkthrough(value);
    validateContext(context);
    if (![1, 2].includes(content?.schemaVersion))
        throw Error('Walkthrough schemaVersion must be 1 or 2');
    requiredText(content.title, 'title');
    if (content.summary !== undefined && typeof content.summary !== 'string')
        throw Error('summary must be text');
    if (content.schemaVersion === 1 && (!Array.isArray(content.steps) || !content.steps.length))
        throw Error('At least one walkthrough step required');
    if (content.schemaVersion === 2) {
        if (!Array.isArray(content.chapters) || !content.chapters.length)
            throw Error('At least one deep-dive chapter required');
        const chapterIds = new Set(['__overview']);
        const topicIds = new Set((context.analysis?.topics || []).map(topic => topic.id));
        for (const chapter of content.chapters) {
            requiredText(chapter.id, 'chapter id');
            requiredText(chapter.title, 'chapter title');
            if (chapterIds.has(chapter.id))
                throw Error(`Duplicate chapter id: ${chapter.id}`);
            chapterIds.add(chapter.id);
            if (!Array.isArray(chapter.steps) || !chapter.steps.length)
                throw Error('Each chapter needs at least one step');
            if (chapter.topicIds !== undefined && (!Array.isArray(chapter.topicIds) || chapter.topicIds.some(id => typeof id !== 'string' || (topicIds.size && !topicIds.has(id)))))
                throw Error('Unknown or invalid chapter topicIds');
        }
        const overview = overviewFromAnalysis(context, content);
        requiredText(overview.purpose, 'overview purpose');
        assertEvidence(context, overview.evidence);
        for (const key of ['before', 'after'])
            if (overview[key] !== undefined && typeof overview[key] !== 'string')
                throw Error(`overview ${key} must be text`);
        for (const key of ['reviewOrder', 'extensionPoints']) {
            if (overview[key] !== undefined && !Array.isArray(overview[key]))
                throw Error(`overview ${key} must be an array`);
            for (const item of overview[key] || []) {
                requiredText(item.title, `${key} title`);
                requiredText(item.explanation, `${key} explanation`);
                assertEvidence(context, item.evidence);
                if (item.basis !== undefined && !['proposed', 'observed'].includes(item.basis))
                    throw Error('Extension basis must be proposed or observed');
            }
        }
    }
    const ids = new Set();
    for (const step of chaptersFor(content, context).flatMap(chapter => chapter.steps)) {
        requiredText(step.id, 'step id');
        requiredText(step.title, 'step title');
        requiredText(step.explanation, 'step explanation');
        if (ids.has(step.id))
            throw Error(`Duplicate step id: ${step.id}`);
        ids.add(step.id);
        assertEvidence(context, step.evidence);
        if (step.codeEvidence !== undefined) {
            requiredText(step.codeEvidence, 'codeEvidence');
            resolveEvidence(context, step.codeEvidence);
        }
        if (step.snippets !== undefined && !Array.isArray(step.snippets))
            throw Error('snippets must be an array');
        for (const snippet of step.snippets || []) {
            requiredText(snippet.evidence, 'snippet evidence');
            const source = resolveEvidence(context, snippet.evidence);
            if (snippet.label !== undefined && typeof snippet.label !== 'string')
                throw Error('snippet label must be text');
            if (snippet.side !== undefined && !['before', 'after', 'context'].includes(snippet.side))
                throw Error('snippet side must be before, after, or context');
            if (snippet.side === 'before' && source.side !== 'base' || snippet.side === 'after' && source.side !== 'head')
                throw Error('Snippet side does not match evidence revision');
            if (snippet.focusLines !== undefined && (!Array.isArray(snippet.focusLines) || snippet.focusLines.some(line => !Number.isInteger(line) || line < source.startLine || line > source.endLine)))
                throw Error('Snippet focus lines must lie within the evidence range');
        }
        if (step.durationSeconds !== undefined && (!Number.isFinite(step.durationSeconds) || step.durationSeconds < 1 || step.durationSeconds > 300))
            throw Error('durationSeconds must be between 1 and 300');
    }
    return content;
}
export function buildTimeline(content, context = {}) {
    let cursor = 0;
    return chaptersFor(content, context).flatMap(chapter => chapter.steps.map(step => {
        const words = step.explanation.trim().split(/\s+/u).filter(Boolean).length;
        const durationSeconds = step.durationSeconds ?? Math.max(6, Math.ceil(words / 160 * 60));
        const item = { ...step, chapterId: chapter.id, chapterTitle: chapter.title, chapterKind: chapter.kind ?? 'deep-dive', topicIds: chapter.topicIds || [], startSeconds: cursor, endSeconds: cursor + durationSeconds, durationSeconds };
        cursor = item.endSeconds;
        return item;
    }));
}
function timestamp(seconds, separator) {
    const milliseconds = Math.round(seconds * 1000);
    const hours = Math.floor(milliseconds / 3600000), minutes = Math.floor(milliseconds / 60000) % 60, secs = Math.floor(milliseconds / 1000) % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}${separator}${String(milliseconds % 1000).padStart(3, '0')}`;
}
function captionChunks(text) {
    const words = text.replace(/<[^>]*>/gu, '').replace(/-->/gu, '→').trim().split(/\s+/u).filter(Boolean);
    const chunks = [];
    let current = '';
    for (const word of words) {
        if (current && current.length + word.length + 1 > 84) {
            chunks.push(current);
            current = word;
        }
        else
            current += (current ? ' ' : '') + word;
    }
    if (current)
        chunks.push(current);
    return chunks.length ? chunks : [' '];
}
export function captionFiles(timeline) {
    const cues = [];
    for (const step of timeline) {
        const chunks = captionChunks(step.explanation);
        const weights = chunks.map(chunk => chunk.split(/\s+/u).length), total = weights.reduce((a, b) => a + b, 0);
        let cursor = step.startSeconds;
        for (let i = 0; i < chunks.length; i++) {
            const end = i === chunks.length - 1 ? step.endSeconds : cursor + (step.endSeconds - step.startSeconds) * present(weights[i]) / total;
            cues.push({ start: cursor, end, text: chunks[i] });
            cursor = end;
        }
    }
    return {
        srt: cues.map((cue, index) => `${index + 1}\n${timestamp(cue.start, ',')} --> ${timestamp(cue.end, ',')}\n${cue.text}\n`).join('\n'),
        vtt: 'WEBVTT\n\n' + cues.map(cue => `${timestamp(cue.start, '.')} --> ${timestamp(cue.end, '.')}\n${cue.text}\n`).join('\n'),
    };
}
export async function renderWalkthrough(context, content, dir) {
    validateWalkthrough(context, content);
    const timeline = buildTimeline(content, context);
    const chapters = chaptersFor(content, context);
    const steps = (await Promise.all(timeline.map(async (step, index) => {
        const snippets = step.snippets || (step.codeEvidence ? [{ evidence: step.codeEvidence }] : []);
        const citations = unique([...step.evidence, ...snippets.map(snippet => snippet.evidence)]);
        const sourceHtml = await Promise.all(snippets.map(async (snippet) => {
            const source = resolveEvidence(context, snippet.evidence);
            const label = snippet.label || (snippet.side ? snippet.side.charAt(0).toUpperCase() + snippet.side.slice(1) : 'Source');
            // Keep literal line separators so copying/text extraction preserves the source.
            const code = (await highlightCode(source.text, { path: source.path, startLine: source.startLine, focusLines: snippet.focusLines || [] })).replace(/<\/span>(?=<span class="line(?: |"))/g, '</span>\n');
            return `<figure class="snippet" data-side="${escapeHtml(snippet.side || 'context')}"><figcaption><strong>${escapeHtml(label)}</strong><span class="code-label">${escapeHtml(source.path)} · lines ${source.startLine}–${source.endLine}</span></figcaption>${code}</figure>`;
        }));
        return `<section class="step" data-id="${escapeHtml(step.id)}" data-chapter-id="${escapeHtml(step.chapterId)}" data-chapter-kind="${step.chapterKind}" data-duration="${step.durationSeconds}" ${index ? 'hidden' : ''} aria-labelledby="step-title-${index}"><div class="step-chapter">${escapeHtml(step.chapterTitle)} · ${step.chapterKind === 'overview' ? 'Overview' : 'Deep dive'}</div><h2 id="step-title-${index}">${escapeHtml(step.title)}</h2><p class="explanation">${escapeHtml(step.explanation)}</p>${sourceHtml.length ? `<div class="snippet-grid${sourceHtml.length > 1 ? ' multiple' : ''}">${sourceHtml.join('')}</div>` : ''}<details class="step-evidence"><summary>Evidence (${citations.length} ${citations.length === 1 ? 'reference' : 'references'})</summary><div class="sources">${citationHtml(context, citations)}</div></details></section>`;
    }))).join('');
    const limitations = unique([...context.limitations, ...(context.analysis?.limitations || [])]);
    const fileCoverage = context.analysis?.fileCoverage || [];
    const coverage = `<details id="coverage" class="coverage"><summary>Coverage and evidence</summary><p>${context.files.length} captured files · ${context.evidence.length} source references. Coverage describes the supplied snapshot; it does not establish complete runtime behavior.</p><ul class="coverage-files">${context.files.map(file => {
        const item = fileCoverage.find(entry => entry.fileId === file.id);
        const evidence = context.evidence.filter(entry => entry.fileId === file.id).map(entry => entry.id);
        return `<li><strong>${escapeHtml(file.path)}</strong> <span class="coverage-role">${escapeHtml(item?.role || (file.role === 'context' || file.status === 'context' ? 'context' : 'not classified'))}</span><p>${escapeHtml(item?.reason || file.omission || 'No teaching-coverage classification was supplied.')}</p>${item?.topicIds?.length ? `<p class="muted">Topics: ${item.topicIds.map(escapeHtml).join(', ')}</p>` : ''}<div class="sources">${citationHtml(context, evidence)}</div></li>`;
    }).join('')}</ul>${limitations.length ? `<h3>Limits of this explanation</h3><ul>${limitations.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}</details>`;
    const navigation = chapters.map(chapter => `<div class="chapter-group"><button class="chapter-start" type="button" data-chapter-start="${timeline.findIndex(step => step.chapterId === chapter.id)}">${escapeHtml(chapter.title)}</button><div class="chapter-steps">${timeline.flatMap((step, index) => step.chapterId === chapter.id ? [`<button type="button" data-chapter="${index}" ${index === 0 ? 'aria-current="step"' : ''}>${index + 1}. ${escapeHtml(step.title)}</button>`] : []).join('')}</div></div>`).join('');
    const body = `<main class="app"><header class="header"><div class="eyebrow">Code Unpacked · Walkthrough</div><h1>${escapeHtml(content.title)}</h1>${content.summary ? `<p class="muted">${escapeHtml(content.summary)}</p>` : ''}</header><div class="layout"><nav class="chapters" aria-label="Walkthrough chapters">${navigation}</nav><div><div class="viewer" aria-live="polite">${steps}</div><div class="progress-track" aria-hidden="true"><div class="progress-fill"></div></div><div class="controls"><div class="transport"><button id="previous" type="button" aria-label="Previous step">← Previous</button><button id="play" type="button" aria-label="Play walkthrough" aria-pressed="false">Play</button><button id="next" type="button" aria-label="Next step">Next →</button></div><span id="position" role="status"></span></div><p class="video-note">Use ← → to navigate, Space to play or pause, and Home / End to jump. Start with the overview, then open a deep-dive chapter.</p></div></div>${coverage}<footer class="footer">Source revision: <code>${escapeHtml(context.source.head)}</code> · ${chapters.length} chapters · ${timeline.length} steps · ${present(timeline.at(-1)).endSeconds}s at default playback speed. Explanations describe the captured source.</footer></main>`;
    const [css, script] = await Promise.all([readFile(new URL('walkthrough.css', assets), 'utf8'), readFile(new URL('walkthrough.js', assets), 'utf8')]);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), renderShell({ title: content.title, body, css: highlightCss + css, script }));
    await writeJson(path.join(dir, 'walkthrough.json'), content);
    return finishArtifact({ dir, skill: 'walkthrough', context, outputs: ['index.html', 'walkthrough.json'], summary: content.summary || content.title, markdown: `${chapters.length} chapters and ${timeline.length} source-linked steps. Open the HTML locally to navigate the overview and deep dives, or play the walkthrough.` });
}
export async function renderVideo(context, content, dir, { ffmpeg = 'ffmpeg' } = {}) {
    await renderWalkthrough(context, content, dir);
    let work;
    try {
        try {
            await run(ffmpeg, ['-version']);
        }
        catch (error) {
            throw Error(`FFmpeg is required for video export. Install FFmpeg or pass --ffmpeg PATH. ${message(error).split('\n')[0]}`);
        }
        work = await mkdtemp(path.join(dir, '.video-'));
        const browser = await loadBrowser();
        const timeline = buildTimeline(content, context);
        try {
            const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
            await page.goto(pathToFileURL(path.join(dir, 'index.html')).href + '?video=1');
            await page.evaluate(() => document.fonts.ready);
            for (let index = 0; index < timeline.length; index++) {
                const state = await page.evaluate(i => window.walkthroughPresentation.showStep(i), index);
                if (state.overflow)
                    throw Error(`Video step "${state.id}" overflows the 1920×1080 frame. Shorten its explanation or narrow its code evidence range; HTML is preserved.`);
                await page.screenshot({ path: path.join(work, `frame-${String(index).padStart(4, '0')}.png`), animations: 'disabled' });
            }
        }
        finally {
            await browser.close();
        }
        // Encode bounded constant-rate clips. A sparse PNG concat followed by fps=30
        // can queue thousands of duplicated frames and stall on long presentations.
        const clips = [];
        for (const [index, step] of timeline.entries()) {
            const stem = String(index).padStart(4, '0'), clip = `slide-${stem}.mp4`;
            clips.push(clip);
            await run(ffmpeg, ['-y', '-threads', '2', '-loop', '1', '-framerate', '30', '-i', path.join(work, `frame-${stem}.png`), '-t', String(step.durationSeconds), '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-threads', '2', '-pix_fmt', 'yuv420p', '-an', '-map_metadata', '-1', path.join(work, clip)], { timeout: Math.max(60000, step.durationSeconds * 2000) });
        }
        await writeFile(path.join(work, 'clips.txt'), clips.map(clip => `file '${clip}'`).join('\n') + '\n');
        await run(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', path.join(work, 'clips.txt'), '-c', 'copy', '-an', '-t', String(present(timeline.at(-1)).endSeconds), '-map_metadata', '-1', '-movflags', '+faststart', path.join(dir, 'walkthrough.mp4')], { timeout: 60000 });
        const captions = captionFiles(timeline);
        await writeFile(path.join(dir, 'captions.srt'), captions.srt);
        await writeFile(path.join(dir, 'captions.vtt'), captions.vtt);
        return finishArtifact({ dir, skill: 'walkthrough', context, outputs: ['index.html', 'walkthrough.json', 'walkthrough.mp4', 'captions.srt', 'captions.vtt'], summary: content.summary || content.title, markdown: `${chaptersFor(content, context).length} chapters and ${timeline.length} source-linked steps, plus a silent 1080p MP4 with on-screen explanations and SRT/VTT captions.` });
    }
    catch (error) {
        await finishArtifact({ dir, skill: 'walkthrough', context, outputs: ['index.html', 'walkthrough.json'], summary: content.summary || content.title, status: 'partial', limitations: [message(error)], markdown: 'HTML walkthrough generated. Video export did not complete; see manifest limitations.' });
        throw error;
    }
    finally {
        if (work)
            await cleanupVideo(work, dir);
    }
}
export async function main(args = process.argv.slice(2)) {
    const { positional: [mode], options } = parseArgs(args);
    if (!['render', 'video'].includes(mode ?? '') || !option(options, 'context') || !option(options, 'content'))
        throw Error('Usage: walkthrough.mjs render|video --context FILE --content FILE --root DIR [--ffmpeg PATH]');
    const [rawContext, rawContent] = await Promise.all([readJson(present(option(options, 'context'))), readJson(present(option(options, 'content')))]);
    const context = validateContext(rawContext), content = decodeWalkthrough(rawContent);
    const dir = outputDirectory(option(options, 'root') || process.cwd(), context.target, 'walkthrough');
    const manifest = mode === 'video' ? await renderVideo(context, content, dir, { ffmpeg: option(options, 'ffmpeg') || 'ffmpeg' }) : await renderWalkthrough(context, content, dir);
    process.stdout.write(JSON.stringify({ directory: dir, status: manifest.status, outputs: manifest.artifacts.map(item => item.path) }) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    main().catch((error) => { console.error(message(error)); process.exitCode = 1; });
