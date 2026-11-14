import assert from 'node:assert/strict';
const examples=[
 ['silk-walkthrough','/','walkthrough'],['vue-design','/','design'],['react-map','/','map'],['vue-quiz','/','quiz'],['react-comic','/','comic'],
 ['react-walkthrough','/showcase/react-compiler/','walkthrough'],['vue-walkthrough','/showcase/vue-vapor/','walkthrough'],['silk-quiz','/showcase/silk-gzip/','quiz']
];
async function drag(page,context,mobile,start,end){
 if(!mobile){await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:4});await page.mouse.up();return;}
 const session=await context.newCDPSession(page);
 const tick=()=>page.evaluate(()=>new Promise(requestAnimationFrame));
 try{
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});await tick();
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:(start.x+end.x)/2,y:(start.y+end.y)/2}]});await tick();
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[end]});await tick();
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await tick();
 }finally{await session.detach();}
}
export async function checkRealExamples(browser,url){
 const results=[];
 for(const size of [{width:1440,height:900},{width:390,height:844},{width:320,height:740}]){
  const mobile=size.width<700;
  const device=mobile?'touch-mobile-'+size.width:'desktop';
  const context=await browser.newContext({viewport:size,isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[],failures=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.url().startsWith(url)&&response.status()>=400)failures.push(response.status()+' '+response.url());});
  const click=locator=>mobile?locator.tap():locator.click();
  try{
   for(const [id,route,kind] of examples){
    await page.goto(url+route);
    const element=page.locator('[data-example="'+id+'"] iframe');await element.scrollIntoViewIfNeeded();
    const frame=await (await element.elementHandle()).contentFrame();await frame.waitForURL(/\/examples\//);await frame.waitForLoadState('load');
    const fit=async()=>{
     const size=await frame.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
     assert.ok(size.scroll<=size.width+1,device+' '+id+' must not overflow its frame: '+JSON.stringify(size));
     return size;
    };
    await fit();
    if(kind==='walkthrough'){
     const position=await frame.locator('#position').textContent();
     await click(frame.locator('#next'));assert.notEqual(await frame.locator('#position').textContent(),position);
     await click(frame.locator('#previous'));assert.equal(await frame.locator('#position').textContent(),position);
     await click(frame.locator('#play'));assert.equal(await frame.locator('#play').getAttribute('aria-pressed'),'true');await click(frame.locator('#play'));
     await click(frame.locator('[data-chapter]').last());assert.equal(await frame.locator('#next').isDisabled(),true);
     await click(frame.locator('[data-chapter]').first());
     const coverage=frame.locator('.coverage > summary');
     if(await coverage.count())await click(coverage);
     assert.ok(await frame.locator('a[href*="/blob/"]').count()>0);
    }else if(kind==='quiz'){
     const quiz=await frame.locator('#artifact-data').evaluate(element=>JSON.parse(element.textContent).quiz);
     await click(frame.getByRole('button',{name:'Check understanding',exact:true}));
     assert.match(await frame.locator('#results').innerText(),/\b0%/);
     await click(frame.getByRole('button',{name:'Reset quiz',exact:true}));
     const wrong=quiz.questions[0].options.findIndex(option=>option.id!==quiz.questions[0].correctOptionId);
     await click(frame.locator('#choice-0-'+wrong));await click(frame.getByRole('button',{name:'Check understanding',exact:true}));
     assert.ok(await frame.locator('fieldset[data-result="incorrect"]').count()>0);
     await click(frame.getByRole('button',{name:'Reset quiz',exact:true}));
     for(const [index,question] of quiz.questions.entries()){
      const correct=question.options.findIndex(option=>option.id===question.correctOptionId);
      await click(frame.locator('#choice-'+index+'-'+correct));
     }
     await click(frame.getByRole('button',{name:'Check understanding',exact:true}));
     assert.match(await frame.locator('#results').innerText(),/100%/);await fit();
     await click(frame.getByRole('button',{name:'Reset quiz',exact:true}));
     assert.equal(await frame.locator('input:checked').count(),0);assert.equal(await frame.locator('#results').isHidden(),true);
    }else if(kind==='design'){
     assert.ok(await frame.locator('svg').count()>0);assert.ok(await frame.locator('a[href*="sandoche/core/blob/"]').count()>0);
     await click(frame.locator('a[href^="#"]:not(.skip)').first());
     if(await frame.locator('details summary').count())await click(frame.locator('details summary').first());
    }else if(kind==='comic'){
     const image=frame.locator('img').first();await image.evaluate(image=>image.decode());assert.ok(await image.evaluate(image=>image.naturalWidth>1000));
     const disclosure=frame.locator('details').first();await click(disclosure.locator('summary'));assert.notEqual(await disclosure.getAttribute('open'),null);
     assert.match(await disclosure.innerText(),/hoist/i);
    }else if(kind==='map'){
     assert.equal(await frame.locator('.file-card').count(),8);
     await frame.getByRole('searchbox').fill('Program.ts');
     await click(frame.getByRole('button',{name:'compiler/packages/babel-plugin-react-compiler/src/Entrypoint/Program.ts',exact:true}));
     assert.match(await frame.locator('#detail').innerText(),/compileProgram/);
     const symbol=frame.getByRole('button',{name:'Open symbol compileProgram',exact:true}).first();await click(symbol);
     assert.equal(await frame.locator('#detail h2').textContent(),'compileProgram');
     const beforeZoom=await frame.locator('#plane').getAttribute('style');await click(frame.getByRole('button',{name:'Zoom in',exact:true}));
     assert.notEqual(await frame.locator('#plane').getAttribute('style'),beforeZoom);
     await frame.getByRole('searchbox').fill('');await click(frame.getByRole('button',{name:'Fit files',exact:true}));
     const viewport=frame.locator('#viewport');await viewport.scrollIntoViewIfNeeded();
     // Drag canvas background, not a card: cards intentionally select a file.
     const offset=await viewport.evaluate(viewport=>{
      const box=viewport.getBoundingClientRect();
      for(const x of [8,box.width-8,box.width/2])for(const y of [8,box.height-8,box.height/2]){
       const target=document.elementFromPoint(box.left+x,box.top+y);
       if(target&&viewport.contains(target)&&!target.closest('.file-card'))return{x,y};
      }
      throw Error('No visible canvas background');
     });
     const bounds=await viewport.boundingBox();const beforePan=await frame.locator('#plane').getAttribute('style');
     const start={x:bounds.x+offset.x,y:bounds.y+offset.y};
     const end={x:start.x+(offset.x>bounds.width/2?-40:40),y:start.y+(offset.y>bounds.height/2?-30:30)};
     await drag(page,context,mobile,start,end);
     assert.notEqual(await frame.locator('#plane').getAttribute('style'),beforePan,device+' canvas must pan');
     await click(frame.getByRole('button',{name:'Reset layout',exact:true}));
    }
    const size=await fit();
    const fullSize=page.locator('[data-example="'+id+'"] .example-toolbar a');
    const target=new URL(await fullSize.getAttribute('href'),url);
    const response=await context.request.get(target.href);assert.equal(response.status(),200,device+' '+id+' full-size link');
    results.push({device,id,...size,status:'passed'});
   }
   assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
  }finally{await context.close();}
 }
 return results;
}
