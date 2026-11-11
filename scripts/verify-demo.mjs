import path from 'node:path';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { hash, parseArgs, readJson, writeJson, validateContext, loadBrowser, run } from '../skills/code-unpacked-core/scripts/core.mjs';
const {options}=parseArgs(process.argv.slice(2));
if(!options.dir||!options.ffmpeg)throw Error('Usage: verify-demo.mjs --dir ARTIFACT_DIRECTORY --ffmpeg PATH');
const base=path.resolve(options.dir),skills=['walkthrough','reverse-design','code-map','review-quiz','xkcd'];
const context=validateContext(await readJson(path.join(base,'context/context.json')));
const report={source:context.source,skills:{},screenshots:[],networkRequests:[]};
await mkdir(path.join(base,'verification'),{recursive:true});
for(const skill of skills){const dir=path.join(base,skill),manifest=await readJson(path.join(dir,'manifest.json'));assert.equal(manifest.status,'complete',skill);assert.equal(manifest.delivery.status,'draft');assert.equal(manifest.source.head,context.source.head);
  for(const artifact of manifest.artifacts){const bytes=await readFile(path.join(dir,artifact.path));assert.equal(hash(bytes),artifact.sha256,`${skill}/${artifact.path} hash`);assert.equal(bytes.length,artifact.bytes);}
  const comment=await readFile(path.join(dir,'comment.md'),'utf8');assert.ok(comment.includes(`<!-- code-unpacked:${skill} -->`));assert.ok(!comment.includes('github.com/user-attachments/'),'Draft fabricated an upload URL');report.skills[skill]={status:'complete',artifacts:manifest.artifacts.length};}
const map=await readJson(path.join(base,'code-map/map.json'));assert.equal(map.nodes.length,context.files.length);
const design=await readJson(path.join(base,'reverse-design/design.json'));assert.equal(design.coverage.length,11);
const browser=await loadBrowser();
try{
  const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
  page.on('request',request=>{if(/^https?:/.test(request.url()))report.networkRequests.push(request.url());});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const skill of skills){await page.goto(pathToFileURL(path.join(base,skill,'index.html')).href);await page.evaluate(()=>document.fonts.ready);assert.ok((await page.title()).length);await page.screenshot({path:path.join(base,'verification',`${skill}.png`)});report.screenshots.push(`verification/${skill}.png`);}
  await page.goto(pathToFileURL(path.join(base,'review-quiz/index.html')).href);
  const quiz=await readJson(path.join(base,'review-quiz/quiz.json'));
  for(let i=0;i<quiz.questions.length;i++)await page.locator(`input[name="question-${i}"][value="${quiz.questions[i].correctOptionId}"]`).check();
  await page.getByRole('button',{name:'Check understanding',exact:true}).click();assert.match(await page.locator('#score').innerText(),/100/);
  await page.locator('#results').screenshot({path:path.join(base,'verification','quiz-score.png')});report.quizAllCorrect=await page.locator('#score').innerText();
  await page.getByRole('button',{name:'Reset quiz',exact:true}).click();
  await page.locator('input[name="question-0"][value="b"]').check();await page.locator('input[name="question-1"][value="a"]').check();
  await page.getByRole('button',{name:'Check understanding',exact:true}).click();report.quizMixed=await page.locator('#score').innerText();assert.ok(await page.locator('#recommendations li').count()>0);
  assert.equal(report.networkRequests.length,0);assert.deepEqual(errors,[]);
}finally{await browser.close();}
// Decode the actual exported video; ffmpeg's informational stream describes its format.
let info='';try{await run(options.ffmpeg,['-i',path.join(base,'walkthrough/walkthrough.mp4')]);}catch(error){info=error.stderr||error.message;}
assert.match(info,/Video: h264/);assert.match(info,/1920x1080/);assert.ok(!/Audio:/.test(info));
const frame=path.join(base,'verification','video-frame.png');await run(options.ffmpeg,['-y','-ss','1','-i',path.join(base,'walkthrough/walkthrough.mp4'),'-frames:v','1',frame]);
const png=await readFile(frame);assert.equal(png.readUInt32BE(16),1920);assert.equal(png.readUInt32BE(20),1080);
report.video={codec:'h264',width:1920,height:1080,audio:false,decodedFrame:'verification/video-frame.png',duration:info.match(/Duration: ([\d:.]+)/)?.[1]};
report.passed=true;await writeJson(path.join(base,'verification.json'),report);console.log(JSON.stringify(report,null,2));
