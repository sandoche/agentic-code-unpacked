import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { renderWalkthrough, renderVideo, validateWalkthrough, buildTimeline, captionFiles } from '../scripts/walkthrough.mjs';
import { loadBrowser } from '../../code-unpacked-core/scripts/core.mjs';

const exec = promisify(execFile);

const context = {
  schemaVersion: 1, target: { kind: 'pr', repo: 'example/repo', number: 12 },
  source: { head: 'abc123', base: 'def456', repo: 'example/repo' }, limitations: [],
  files: [{ id: 'file-main', path: 'main.js', status: 'modified', content: 'const value = "<unsafe>";\nexport { value };\n', hunks: [] }],
  evidence: [{ id: 'main-head', fileId: 'file-main', startLine: 1, endLine: 2, side: 'head', url: 'https://github.com/example/repo/blob/abc123/main.js#L1-L2' }],
};
const content = { schemaVersion: 1, title: 'A small walkthrough', summary: 'Why this changes.', steps: [
  { id: 'intent', title: 'Intent', explanation: 'The constant is exposed for reuse.', evidence: ['main-head'] },
  { id: 'code', title: 'The implementation', explanation: 'The export makes the constant available to importing modules.', evidence: ['main-head'], codeEvidence: 'main-head' },
] };
async function temporary(t) { const dir = await mkdtemp(path.join(os.tmpdir(), 'walkthrough-test-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }

test('validation rejects unknown references, duplicate IDs and invalid timing', () => {
  assert.equal(validateWalkthrough(context, content), content);
  assert.throws(() => validateWalkthrough(context, { ...content, steps: [{ ...content.steps[0], evidence: ['missing'] }] }), /Unknown evidence/);
  assert.throws(() => validateWalkthrough(context, { ...content, steps: [content.steps[0], content.steps[0]] }), /duplicate/i);
  assert.throws(() => validateWalkthrough(context, { ...content, steps: [{ ...content.steps[0], durationSeconds: 0 }] }), /duration/i);
});

test('timeline gives long explanations enough time and honors explicit durations', () => {
  const long = { ...content, steps: [{ ...content.steps[0], explanation: Array(160).fill('word').join(' ') }, { ...content.steps[1], durationSeconds: 2 }] };
  assert.deepEqual(buildTimeline(long).map(({ startSeconds, endSeconds }) => [startSeconds, endSeconds]), [[0, 60], [60, 62]]);
  assert.equal(buildTimeline(content)[0].durationSeconds, 6);
});

test('captions have deterministic boundaries and remove subtitle markup', () => {
  const captions = captionFiles([{ title: 'First', explanation: '<b>Hello</b> --> there', startSeconds: 0, endSeconds: 6.25 }]);
  assert.match(captions.srt, /00:00:00,000 --> 00:00:06,250/);
  assert.match(captions.vtt, /^WEBVTT\n/);
  assert.doesNotMatch(captions.srt, /<b>| --> there/);
});

test('render produces evidence-backed offline HTML and hashed manifest', async t => {
  const dir = await temporary(t);
  const manifest = await renderWalkthrough(context, content, dir);
  const html = await readFile(path.join(dir, 'index.html'), 'utf8');
  assert.match(html, /&lt;unsafe&gt;/);
  assert.match(html, /main\.js:1–2/);
  assert.doesNotMatch(html, /src="https?:|href="https?:\/\/.*\.css/);
  assert.equal(manifest.skill, 'walkthrough');
  assert.ok(manifest.artifacts.some(artifact => artifact.path === 'index.html' && /^[a-f\d]{64}$/.test(artifact.sha256)));
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'walkthrough.json'), 'utf8')), content);
});

test('offline browser navigation, playback, and hostile text work', async t => {
  const dir = await temporary(t);
  // Keep the destination step playing while keyboard input is dispatched under load.
  // A one-second final step could auto-pause before Space arrived, restarting playback.
  const malicious = { ...content, title: '</script><script>window.injected=true</script>', steps: [{ ...content.steps[0], explanation: '</script><img src=x onerror="window.injected=true">', durationSeconds: 1 }, { ...content.steps[1], durationSeconds: 60 }] };
  await renderWalkthrough(context, malicious, dir);
  const browser = await loadBrowser(); t.after(() => browser.close());
  const page = await browser.newPage();
  await page.context().setOffline(true);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
  assert.equal(await page.locator('.step:not([hidden])').count(), 1);
  assert.match(await page.locator('#position').textContent(), /1.*2/);
  await page.keyboard.press('ArrowRight');
  assert.match(await page.locator('#position').textContent(), /2.*2/);
  assert.equal(await page.locator('.step:not([hidden]) pre').textContent(), context.files[0].content.trimEnd());
  await page.getByRole('button', { name: 'Previous step' }).click();
  await page.getByRole('button', { name: 'Play walkthrough' }).click();
  assert.equal(await page.getByRole('button', { name: 'Pause walkthrough' }).count(), 1);
  await page.waitForFunction(() => window.walkthroughPresentation.activeStep === 1);
  await page.keyboard.press('Space');
  assert.equal(await page.getByRole('button', { name: 'Play walkthrough' }).count(), 1);
  assert.equal(await page.evaluate(() => Boolean(window.injected)), false);
  assert.deepEqual(errors, []);
});

test('video dependency failure preserves rendered HTML', async t => {
  const dir = await temporary(t);
  await assert.rejects(renderVideo(context, content, dir, { ffmpeg: path.join(dir, 'missing-ffmpeg') }), /FFmpeg/i);
  assert.match(await readFile(path.join(dir, 'index.html'), 'utf8'), /A small walkthrough/);
  const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'partial');
  assert.match(manifest.limitations.join(' '), /FFmpeg/i);
});

test('video presentation reports content overflow before recording', async t => {
  const dir = await temporary(t);
  await renderWalkthrough(context, { ...content, steps: [{ ...content.steps[0], explanation: Array(2500).fill('overflow').join(' ') }] }, dir);
  const browser = await loadBrowser(); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(pathToFileURL(path.join(dir, 'index.html')).href + '?video=1');
  const state = await page.evaluate(() => window.walkthroughPresentation.showStep(0));
  assert.equal(state.overflow, true);
  assert.equal(state.id, 'intent');
});

test('real video is silent 1080p H.264 with matching timeline and decodable frames', { timeout: 300000 }, async t => {
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  try { await exec(ffmpeg, ['-version'], { windowsHide: true }); }
  catch (error) {
    if (process.env.FFMPEG_PATH || error.code !== 'ENOENT') throw error;
    t.skip('FFmpeg is absent; set FFMPEG_PATH or install ffmpeg on PATH to run real-video integration');
    return;
  }
  const dir = await temporary(t);
  const fixture = { ...content, steps: content.steps.map(step => ({ ...step, durationSeconds: 1 })) };
  const manifest = await renderVideo(context, fixture, dir, { ffmpeg });
  assert.equal(manifest.status, 'complete');
  assert.ok(manifest.artifacts.some(artifact => artifact.path === 'walkthrough.mp4' && artifact.bytes > 1000));
  const video = path.join(dir, 'walkthrough.mp4');
  const { stderr: inspection } = await exec(ffmpeg, ['-hide_banner', '-i', video, '-map', '0:v:0', '-frames:v', '1', '-f', 'null', '-'], { encoding: 'utf8', windowsHide: true });
  assert.match(inspection, /Video: h264\b/);
  assert.match(inspection, /1920x1080/);
  assert.doesNotMatch(inspection, /Stream #.*Audio:/);
  const duration = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(inspection);
  assert.ok(duration, 'FFmpeg reports an MP4 duration');
  const seconds = Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
  assert.ok(Math.abs(seconds - buildTimeline(fixture).at(-1).endSeconds) <= 1 / 30, `duration ${seconds} matches the authored timeline`);
  const captions = await readFile(path.join(dir, 'captions.srt'), 'utf8');
  assert.match(captions, /00:00:00,000 --> 00:00:01,000/);
  assert.match(captions, /00:00:01,000 --> 00:00:02,000/);
  assert.ok(captions.indexOf(fixture.steps[0].explanation) < captions.indexOf(fixture.steps[1].explanation));
  assert.match(await readFile(path.join(dir, 'captions.vtt'), 'utf8'), /00:00:01\.000 --> 00:00:02\.000/);
  const decoded = path.join(dir, 'decoded-frame.png');
  await exec(ffmpeg, ['-y', '-v', 'error', '-i', video, '-frames:v', '1', '-update', '1', decoded], { windowsHide: true });
  const png = await readFile(decoded);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 1920);
  assert.equal(png.readUInt32BE(20), 1080);
});
