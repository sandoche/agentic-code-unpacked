import path from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  escapeHtml, parseArgs, outputDirectory, validateContext, assertEvidence, resolveEvidence,
  citationHtml, readJson, writeJson, renderShell, finishArtifact, loadBrowser, run,
} from '../../code-unpacked-core/scripts/core.mjs';

const assets = new URL('../assets/', import.meta.url);
const requiredText = (value, label) => { if (typeof value !== 'string' || !value.trim()) throw Error(`${label} must be nonempty text`); };
export function validateWalkthrough(context, content) {
  validateContext(context);
  if (content?.schemaVersion !== 1) throw Error('Walkthrough schemaVersion must be 1');
  requiredText(content.title, 'title');
  if (content.summary !== undefined && typeof content.summary !== 'string') throw Error('summary must be text');
  if (!Array.isArray(content.steps) || !content.steps.length) throw Error('At least one walkthrough step required');
  const ids = new Set();
  for (const step of content.steps) {
    requiredText(step.id, 'step id'); requiredText(step.title, 'step title'); requiredText(step.explanation, 'step explanation');
    if (ids.has(step.id)) throw Error(`Duplicate step id: ${step.id}`); ids.add(step.id);
    assertEvidence(context, step.evidence);
    if (step.codeEvidence !== undefined) { requiredText(step.codeEvidence, 'codeEvidence'); resolveEvidence(context, step.codeEvidence); }
    if (step.durationSeconds !== undefined && (!Number.isFinite(step.durationSeconds) || step.durationSeconds < 1 || step.durationSeconds > 300)) throw Error('durationSeconds must be between 1 and 300');
  }
  return content;
}
export function buildTimeline(content) {
  let cursor = 0;
  return content.steps.map(step => {
    const words = step.explanation.trim().split(/\s+/u).filter(Boolean).length;
    const durationSeconds = step.durationSeconds ?? Math.max(6, Math.ceil(words / 160 * 60));
    const item = { ...step, startSeconds: cursor, endSeconds: cursor + durationSeconds, durationSeconds };
    cursor = item.endSeconds;
    return item;
  });
}
function timestamp(seconds, separator) {
  const milliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(milliseconds / 3600000), minutes = Math.floor(milliseconds / 60000) % 60, secs = Math.floor(milliseconds / 1000) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}${separator}${String(milliseconds % 1000).padStart(3, '0')}`;
}
function captionChunks(text) {
  const words = text.replace(/<[^>]*>/gu, '').replace(/-->/gu, '→').trim().split(/\s+/u).filter(Boolean);
  const chunks = []; let current = '';
  for (const word of words) { if (current && current.length + word.length + 1 > 84) { chunks.push(current); current = word; } else current += (current ? ' ' : '') + word; }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [' '];
}
export function captionFiles(timeline) {
  const cues = [];
  for (const step of timeline) {
    const chunks = captionChunks(step.explanation);
    const weights = chunks.map(chunk => chunk.split(/\s+/u).length), total = weights.reduce((a, b) => a + b, 0);
    let cursor = step.startSeconds;
    for (let i = 0; i < chunks.length; i++) {
      const end = i === chunks.length - 1 ? step.endSeconds : cursor + (step.endSeconds - step.startSeconds) * weights[i] / total;
      cues.push({ start: cursor, end, text: chunks[i] }); cursor = end;
    }
  }
  return {
    srt: cues.map((cue, index) => `${index + 1}\n${timestamp(cue.start, ',')} --> ${timestamp(cue.end, ',')}\n${cue.text}\n`).join('\n'),
    vtt: 'WEBVTT\n\n' + cues.map(cue => `${timestamp(cue.start, '.')} --> ${timestamp(cue.end, '.')}\n${cue.text}\n`).join('\n'),
  };
}
export async function renderWalkthrough(context, content, dir) {
  validateWalkthrough(context, content);
  const timeline = buildTimeline(content);
  const steps = timeline.map((step, index) => {
    const snippet = step.codeEvidence ? resolveEvidence(context, step.codeEvidence) : null;
    const citations = [...new Set([...step.evidence, ...(step.codeEvidence ? [step.codeEvidence] : [])])];
    return `<section class="step" data-id="${escapeHtml(step.id)}" data-duration="${step.durationSeconds}" ${index ? 'hidden' : ''} aria-labelledby="step-title-${index}"><h2 id="step-title-${index}">${escapeHtml(step.title)}</h2><p class="explanation">${escapeHtml(step.explanation)}</p>${snippet ? `<div class="code-label">${escapeHtml(snippet.path)} · lines ${snippet.startLine}–${snippet.endLine}</div><pre><code>${escapeHtml(snippet.text)}</code></pre>` : ''}<div class="sources">${citationHtml(context, citations)}</div></section>`;
  }).join('');
  const limitations = context.limitations.length ? `<details class="limitations"><summary>Source limitations</summary><ul>${context.limitations.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details>` : '';
  const body = `<main class="app"><header class="header"><div class="eyebrow">Code Unpacked · Walkthrough</div><h1>${escapeHtml(content.title)}</h1>${content.summary ? `<p class="muted">${escapeHtml(content.summary)}</p>` : ''}</header><div class="layout"><nav class="chapters" aria-label="Walkthrough chapters">${timeline.map((step, index) => `<button type="button" data-chapter="${index}" ${index === 0 ? 'aria-current="step"' : ''}>${index + 1}. ${escapeHtml(step.title)}</button>`).join('')}</nav><div><div class="viewer" aria-live="polite">${steps}</div><div class="progress-track" aria-hidden="true"><div class="progress-fill"></div></div><div class="controls"><div class="transport"><button id="previous" type="button" aria-label="Previous step">← Previous</button><button id="play" type="button" aria-label="Play walkthrough" aria-pressed="false">Play</button><button id="next" type="button" aria-label="Next step">Next →</button></div><span id="position" role="status"></span></div><p class="video-note">Use ← → to navigate, Space to play or pause, and Home / End to jump.</p></div></div>${limitations}<footer class="footer">Source revision: <code>${escapeHtml(context.source.head)}</code> · ${timeline.length} steps · ${timeline.at(-1).endSeconds}s at default playback speed. Explanations describe the captured source.</footer></main>`;
  const [css, script] = await Promise.all([readFile(new URL('walkthrough.css', assets), 'utf8'), readFile(new URL('walkthrough.js', assets), 'utf8')]);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), renderShell({ title: content.title, body, css, script }));
  await writeJson(path.join(dir, 'walkthrough.json'), content);
  return finishArtifact({ dir, skill: 'walkthrough', context, outputs: ['index.html', 'walkthrough.json'], summary: content.summary || content.title, markdown: `${content.steps.length} source-linked chapters. Open the HTML locally to navigate or play the walkthrough.` });
}
export async function renderVideo(context, content, dir, { ffmpeg = 'ffmpeg' } = {}) {
  await renderWalkthrough(context, content, dir);
  let work;
  try {
    try { await run(ffmpeg, ['-version']); } catch (error) { throw Error(`FFmpeg is required for video export. Install FFmpeg or pass --ffmpeg PATH. ${error.message.split('\n')[0]}`); }
    work = await mkdtemp(path.join(dir, '.video-'));
    const browser = await loadBrowser();
    const timeline = buildTimeline(content);
    try {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      await page.goto(pathToFileURL(path.join(dir, 'index.html')).href + '?video=1');
      await page.evaluate(() => document.fonts.ready);
      for (let index = 0; index < timeline.length; index++) {
        const state = await page.evaluate(i => window.walkthroughPresentation.showStep(i), index);
        if (state.overflow) throw Error(`Video step "${state.id}" overflows the 1920×1080 frame. Shorten its explanation or narrow its code evidence range; HTML is preserved.`);
        await page.screenshot({ path: path.join(work, `frame-${String(index).padStart(4, '0')}.png`), animations: 'disabled' });
      }
    } finally { await browser.close(); }
    const frames = timeline.map((step, index) => `file 'frame-${String(index).padStart(4, '0')}.png'\nduration ${step.durationSeconds}`).join('\n') + `\nfile 'frame-${String(timeline.length - 1).padStart(4, '0')}.png'\n`;
    await writeFile(path.join(work, 'frames.txt'), frames);
    await run(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', path.join(work, 'frames.txt'), '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-an', '-t', String(timeline.at(-1).endSeconds), '-map_metadata', '-1', '-movflags', '+faststart', path.join(dir, 'walkthrough.mp4')], { timeout: 300000 });
    const captions = captionFiles(timeline);
    await writeFile(path.join(dir, 'captions.srt'), captions.srt);
    await writeFile(path.join(dir, 'captions.vtt'), captions.vtt);
    return finishArtifact({ dir, skill: 'walkthrough', context, outputs: ['index.html', 'walkthrough.json', 'walkthrough.mp4', 'captions.srt', 'captions.vtt'], summary: content.summary || content.title, markdown: `${content.steps.length} source-linked chapters, plus a silent 1080p MP4 with on-screen explanations and SRT/VTT captions.` });
  } catch (error) {
    await finishArtifact({ dir, skill: 'walkthrough', context, outputs: ['index.html', 'walkthrough.json'], summary: content.summary || content.title, status: 'partial', limitations: [error.message], markdown: 'HTML walkthrough generated. Video export did not complete; see manifest limitations.' });
    throw error;
  } finally {
    if (work) {
      const absoluteWork = path.resolve(work), boundary = path.resolve(dir) + path.sep;
      if (!absoluteWork.startsWith(boundary)) throw Error('Video temporary directory escapes artifact directory');
      await rm(absoluteWork, { recursive: true, force: true });
    }
  }
}
export async function main(args = process.argv.slice(2)) {
  const { positional: [mode], options } = parseArgs(args);
  if (!['render', 'video'].includes(mode) || !options.context || !options.content) throw Error('Usage: walkthrough.mjs render|video --context FILE --content FILE --root DIR [--ffmpeg PATH]');
  const [context, content] = await Promise.all([readJson(options.context), readJson(options.content)]);
  const dir = outputDirectory(options.root || process.cwd(), context.target, 'walkthrough');
  const manifest = mode === 'video' ? await renderVideo(context, content, dir, { ffmpeg: options.ffmpeg || 'ffmpeg' }) : await renderWalkthrough(context, content, dir);
  process.stdout.write(JSON.stringify({ directory: dir, status: manifest.status, outputs: manifest.artifacts.map(item => item.path) }) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
