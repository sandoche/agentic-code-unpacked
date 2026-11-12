import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { renderWalkthrough, renderVideo, validateWalkthrough, buildTimeline, captionFiles } from '../../../skills/walkthrough/scripts/walkthrough.mjs';
import { loadBrowser } from '../../../skills/walkthrough/runtime/scripts/core.mjs';

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
const context2 = {
  ...context, schemaVersion: 2,
  files: [{ ...context.files[0], baseContent: 'const value = 1;\n' }],
  evidence: [...context.evidence, { id: 'main-base', fileId: 'file-main', startLine: 1, endLine: 1, side: 'base' }],
  analysis: {
    schemaVersion: 2, title: 'Exported value', summary: 'Expose the constant for importing modules.', evidenceIds: ['main-head'],
    topics: [{ id: 'exports', title: 'Public export', summary: 'A module can import value.', evidenceIds: ['main-head'], before: 'The value was private to this file.', after: 'Other modules can import the value.', reviewFocus: [{ text: 'Check the exported name.', evidenceIds: ['main-head'] }], extensionPoints: [{ text: 'Add another named export when needed.', evidenceIds: ['main-head'], basis: 'proposed' }] }],
    flows: [], fileCoverage: [{ fileId: 'file-main', role: 'substantive', topicIds: ['exports'], reason: 'Defines the public value.' }], limitations: ['Consumers are outside this snapshot.'],
  },
};
const content2 = {
  schemaVersion: 2, title: 'Understand the export',
  chapters: [{ id: 'implementation', title: 'Read export implementation', topicIds: ['exports'], steps: [
    { id: 'contract', title: 'The contract', explanation: 'The constant becomes part of the module contract.', evidence: ['main-head'] },
    { id: 'comparison', title: 'Compare the source', explanation: 'Compare the original definition with the exported constant.', evidence: ['main-base', 'main-head'], snippets: [{ evidence: 'main-base', side: 'before', label: 'Original definition', focusLines: [1] }, { evidence: 'main-head', side: 'after', label: 'Exported value', focusLines: [2] }] },
  ] }],
};
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

test('v2 validates chapter snippets and evidence line focus while retaining v1 input', () => {
  assert.equal(validateWalkthrough(context2, content2), content2);
  const badFocus = structuredClone(content2); badFocus.chapters[0].steps[1].snippets[1].focusLines = [99];
  assert.throws(() => validateWalkthrough(context2, badFocus), /focus.*range/i);
  const badSide = structuredClone(content2); badSide.chapters[0].steps[1].snippets[0].side = 'after';
  assert.throws(() => validateWalkthrough(context2, badSide), /side.*evidence/i);
  const duplicate = structuredClone(content2); duplicate.chapters.push(duplicate.chapters[0]);
  assert.throws(() => validateWalkthrough(context2, duplicate), /duplicate.*chapter/i);
  assert.equal(validateWalkthrough(context, content), content);
});

test('v2 timeline starts with shared-analysis overview and follows deep-dive chapters', () => {
  const timeline = buildTimeline(content2, context2);
  assert.equal(timeline[0].chapterKind, 'overview');
  assert.equal(timeline[0].title, 'Purpose');
  assert.match(timeline[0].explanation, /Expose the constant/);
  assert.ok(timeline.some(step => /Before:.*private[\s\S]*After:.*import/u.test(step.explanation)));
  assert.ok(timeline.some(step => /Check the exported name/u.test(step.explanation)));
  assert.ok(timeline.some(step => /Proposed extension.*Add another named export/u.test(step.explanation)));
  assert.deepEqual(timeline.filter(step => step.chapterKind === 'deep-dive').map(step => step.id), ['contract', 'comparison']);
  for (let i = 1; i < timeline.length; i++) assert.equal(timeline[i].startSeconds, timeline[i - 1].endSeconds);
  assert.equal(captionFiles(timeline).srt.includes('Compare the original definition'), true);
});

test('v2 renders overview, before/after highlighting, and progressive coverage offline', async t => {
  const dir = await temporary(t);
  await renderWalkthrough(context2, content2, dir);
  const browser = await loadBrowser(); t.after(() => browser.close());
  const page = await browser.newPage(); await page.context().setOffline(true);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
  assert.equal(await page.locator('.step:not([hidden])').getAttribute('data-chapter-kind'), 'overview');
  assert.equal(await page.locator('#coverage').getAttribute('open'), null);
  await page.getByRole('button', { name: 'Read export implementation', exact: true }).click();
  assert.equal(await page.locator('.step:not([hidden])').getAttribute('data-id'), 'contract');
  assert.equal(await page.locator('.step:not([hidden]) pre').count(), 0);
  await page.getByRole('button', { name: 'Next step' }).click();
  assert.equal(await page.locator('.step:not([hidden]) .snippet').count(), 2);
  assert.equal(await page.locator('.step:not([hidden]) .snippet[data-side=before]').count(), 1);
  assert.equal(await page.locator('.step:not([hidden]) .snippet[data-side=after] .line.focus').getAttribute('data-line'), '2');
  assert.ok(await page.locator('.step:not([hidden]) .source-code span[style]').count() > 0);
  await page.locator('#coverage > summary').click();
  assert.match(await page.locator('#coverage').innerText(), /main\.js[\s\S]*substantive[\s\S]*Defines the public value/);
  assert.match(await page.locator('#coverage').innerText(), /Consumers are outside this snapshot/);
  const timeline = buildTimeline(content2, context2);
  await page.goto(pathToFileURL(path.join(dir, 'index.html')).href + '?video=1');
  const videoState = await page.evaluate(index => window.walkthroughPresentation.showStep(index), timeline.length - 1);
  assert.equal(videoState.id, 'comparison');
  assert.equal(videoState.overflow, false);
  assert.equal(await page.locator('.step:not([hidden])').getAttribute('data-chapter-kind'), 'deep-dive');
  assert.deepEqual(errors, []);
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

test('overview stays four stops as review and extension topics grow',()=>{const c=structuredClone(context2);for(let i=0;i<3;i++)c.analysis.topics.push({...structuredClone(c.analysis.topics[0]),id:'extra-'+i});const overview=buildTimeline(content2,c).filter(s=>s.chapterKind==='overview');assert.equal(overview.length,4);assert.match(overview.find(s=>s.title==='Review order').explanation,/Check the exported name/);});

test('video wraps long source lines in paired snippets without clipping',async t=>{const dir=await temporary(t),c=structuredClone(context2),v=structuredClone(content2);c.files[0].content='const label = "'+ 'x'.repeat(120)+'";\nexport {label};';await renderWalkthrough(c,v,dir);const b=await loadBrowser();t.after(()=>b.close());const p=await b.newPage({viewport:{width:1920,height:1080}});await p.goto(pathToFileURL(path.join(dir,'index.html')).href+'?video=1');const timeline=buildTimeline(v,c);assert.equal((await p.evaluate(i=>window.walkthroughPresentation.showStep(i),timeline.length-1)).overflow,false);});

test('multi-minute still-video fixture joins timed slides and decodes its final second',{timeout:300000},async t=>{const ffmpeg=process.env.FFMPEG_PATH;if(!ffmpeg){t.skip('Set FFMPEG_PATH to exercise long export');return;}const dir=await temporary(t),fixture={...content,steps:content.steps.map(s=>({...s,durationSeconds:101}))};const manifest=await renderVideo(context,fixture,dir,{ffmpeg});assert.equal(manifest.status,'complete');const decoded=path.join(dir,'late-frame.png');const {stderr}=await exec(ffmpeg,['-hide_banner','-ss','201','-i',path.join(dir,'walkthrough.mp4'),'-frames:v','1','-update','1',decoded],{windowsHide:true});assert.match(stderr,/Duration: 00:03:22/);assert.equal((await readFile(decoded)).readUInt32BE(16),1920);});
