import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
export async function checkHomepage(browser,url,{screenshots}={}){
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 const page=await context.newPage();const errors=[],failed=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{if(response.status()>=400&&response.url().startsWith(url))failed.push(response.status()+' '+response.url());});
 if(screenshots)await mkdir(screenshots,{recursive:true});
 try{
  await page.goto(url);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('h1').textContent(),'Your PR is a monster.');
  assert.equal(await page.locator('section.skill-section').count(),5);
  assert.equal(await page.getByRole('tab').count(),0,'skills must be visible in sequence');
  assert.equal(await page.locator('.case-card').count(),3);
  assert.equal(await page.locator('.hero-run a[href="https://github.com/sandoche/react/pull/1"]').count(),1);
  const primary=await page.locator('.hero .primary').boundingBox();assert.ok(primary&&primary.y+primary.height<800);
  if(screenshots)await page.screenshot({path:path.join(screenshots,'homepage-desktop.png')});
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:url});
  await page.locator('#install [data-copy]').first().click();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'npx skills add sandoche/agentic-code-unpacked');
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied');}}}));
  await page.locator('#install [data-copy]').nth(1).click();
  assert.match(await page.locator('#install [data-copy-status]').nth(1).innerText(),/copy it manually/);

  const walkElement=page.locator('[data-example="silk-walkthrough"] iframe');await walkElement.scrollIntoViewIfNeeded();
  const walk=page.frameLocator('[data-example="silk-walkthrough"] iframe');await walk.locator('#next').waitFor();
  const before=await walk.locator('#position').textContent();await walk.locator('#next').click();
  assert.notEqual(await walk.locator('#position').textContent(),before);
  await walk.locator('#play').click();assert.equal(await walk.locator('#play').getAttribute('aria-pressed'),'true');await walk.locator('#play').click();
  assert.ok(await walk.locator('a[href*="silk-lang/silk/blob/"]').count()>0);

  await page.locator('[data-example="vue-design"] iframe').scrollIntoViewIfNeeded();
  const design=page.frameLocator('[data-example="vue-design"] iframe');
  const diagram=design.locator('svg').first();await diagram.waitFor();
  assert.ok(await design.locator('a[href*="sandoche/core/blob/"]').count()>0);
  const documentLink=design.locator('a[href^="#"]:not(.skip)').first();await documentLink.click();

  await page.locator('[data-example="react-map"] iframe').scrollIntoViewIfNeeded();
  const map=page.frameLocator('[data-example="react-map"] iframe');await map.locator('#search').waitFor();
  assert.equal(await map.locator('.file-card').count(),8);
  await map.getByRole('searchbox').fill('Program.ts');
  await map.getByRole('button',{name:'compiler/packages/babel-plugin-react-compiler/src/Entrypoint/Program.ts',exact:true}).click();
  assert.match(await map.locator('#detail').innerText(),/compileProgram/);
  const transform=await map.locator('#plane').getAttribute('style');await map.getByRole('button',{name:'Zoom in',exact:true}).click();
  assert.notEqual(await map.locator('#plane').getAttribute('style'),transform);
  await map.getByRole('searchbox').fill('');await map.getByRole('button',{name:'Fit files',exact:true}).click();
  const beforePan=await map.locator('#plane').getAttribute('style');
  const viewport=await map.locator('#viewport').boundingBox();
  await page.mouse.move(viewport.x+8,viewport.y+8);await page.mouse.down();
  await page.mouse.move(viewport.x+80,viewport.y+40,{steps:4});await page.mouse.up();
  assert.notEqual(await map.locator('#plane').getAttribute('style'),beforePan);
  await map.getByRole('button',{name:'Reset layout',exact:true}).click();
  assert.ok(await map.locator('a[href*="sandoche/react/blob/"]').count()>0);
  if(screenshots){await map.getByRole('searchbox').fill('');await map.getByRole('button',{name:'Fit files',exact:true}).click();await page.locator('#code-map').screenshot({path:path.join(screenshots,'real-map.png')});}

  await page.locator('[data-example="vue-quiz"] iframe').scrollIntoViewIfNeeded();
  const quiz=page.frameLocator('[data-example="vue-quiz"] iframe');await quiz.locator('#quiz-form').waitFor();
  const questions=await quiz.locator('#artifact-data').evaluate(element=>JSON.parse(element.textContent).quiz.questions);
  for(const [index,question] of questions.entries()){
   const correct=question.options.findIndex(option=>option.id===question.correctOptionId);
   await quiz.locator('#choice-'+index+'-'+correct).check();
  }
  await quiz.getByRole('button',{name:'Check understanding',exact:true}).click();
  assert.match(await quiz.locator('#results').innerText(),/100/);
  assert.ok(await quiz.locator('.feedback:not([hidden])').count()>0);
  await quiz.getByRole('button',{name:'Reset quiz',exact:true}).click();
  assert.equal(await quiz.locator('input:checked').count(),0);assert.equal(await quiz.locator('#results').isHidden(),true);

  await page.locator('[data-example="react-comic"] iframe').scrollIntoViewIfNeeded();
  const comic=page.frameLocator('[data-example="react-comic"] iframe');
  const image=comic.locator('img').first();await image.waitFor();await image.evaluate(image=>image.decode());
  assert.ok(await image.evaluate(image=>image.naturalWidth>1000));
  await comic.locator('details').first().locator('summary').click();
  assert.match(await comic.locator('body').innerText(),/hoist/i);

  const routes=['/','/showcase/','/showcase/react-compiler/','/showcase/vue-vapor/','/showcase/silk-gzip/'];
  const images=new Set();
  for(const route of routes){
   await page.goto(url+route);
   assert.equal(await page.locator('h1').count(),1);
   assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://codeunpacked.san.cx'+route);
   assert.equal(await page.locator('meta[name="twitter:card"]').getAttribute('content'),'summary_large_image');
   assert.equal(await page.locator('meta[property="og:type"]').getAttribute('content'),route==='/showcase/'||route==='/'?'website':'article');
   const imageUrl=await page.locator('meta[property="og:image"]').getAttribute('content');images.add(imageUrl);
   assert.equal(new URL(imageUrl).origin,'https://codeunpacked.san.cx','production sharing images stay on production');
   const response=await page.request.get(url+new URL(imageUrl).pathname);assert.equal(response.status(),200);
   const png=await response.body();assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
   assert.equal(await page.locator('meta[property="og:image:alt"]').count(),1);
   const structured=await page.locator('script[type="application/ld+json"]').textContent();
   assert.doesNotThrow(()=>JSON.parse(structured));
   if(route.includes('-')){assert.equal(await page.locator('.results-grid a').count(),5);assert.equal(await page.locator('.article-examples iframe').count(),2);}
   for(const width of [320,375,768,1280,1920]){
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1,route+' fits '+width);
   }
   await page.setViewportSize({width:1280,height:900});
   if(screenshots&&route!=='/'){await page.screenshot({path:path.join(screenshots,route==='/showcase/'?'showcase-desktop.png':route.split('/')[2]+'.png')});}
  }
  assert.equal(images.size,5,'each route needs its own social card');
  await page.goto(url);await page.setViewportSize({width:375,height:812});await page.evaluate(()=>document.fonts.ready);
  if(screenshots)await page.screenshot({path:path.join(screenshots,'homepage-mobile.png'),fullPage:true});
  await page.keyboard.press('Tab');assert.equal(await page.locator('.skip').evaluate(element=>element===document.activeElement),true);
  const robots=await page.request.get(url+'/robots.txt');assert.match(await robots.text(),/Sitemap: https:\/\/codeunpacked\.san\.cx\/sitemap.xml/);
  const sitemap=await page.request.get(url+'/sitemap.xml');assert.match(await sitemap.text(),/showcase\/silk-gzip/);
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 }finally{await context.close();}
 const noScript=await browser.newContext({javaScriptEnabled:false,viewport:{width:375,height:812}});
 try{
  const page=await noScript.newPage();await page.goto(url);
  assert.equal(await page.locator('section.skill-section').count(),5);
  await page.locator('.faq-list summary').first().click();assert.equal(await page.locator('.faq-list details').first().getAttribute('open'),'');
  await page.goto(url+'/showcase/silk-gzip/');assert.match(await page.locator('.prose').innerText(),/31 input bytes/);
 }finally{await noScript.close();}
}
