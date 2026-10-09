const {chromium}=require('playwright');
const assert=require('assert/strict');
const fs=require('fs');
(async()=>{
 const b=await chromium.launch({channel:'msedge',headless:true});
 fs.mkdirSync('outputs',{recursive:true});
 const results=[];
 for(const reducedMotion of ['reduce','no-preference']){
  const p=await b.newPage({reducedMotion,viewport:{width:390,height:844}});
  let redirectAt;
  await p.route('https://vishtynets.ru/**',r=>{redirectAt=Date.now();return r.fulfill({body:'QA'})});
  await p.goto((process.env.QA_BASE_URL || 'http://127.0.0.1:8765'));
  await p.locator('#open').click();
  if(reducedMotion==='reduce')assert.equal(await p.evaluate(()=>document.getAnimations().length),0);
  await p.locator('#motion').click();
  const start=Date.now();
  assert((await p.evaluate(()=>document.getAnimations().length))>=8);
  const first=await p.locator('.forest').evaluate(e=>getComputedStyle(e).transform);
  await p.waitForTimeout(1000);
  assert.notEqual(await p.locator('.forest').evaluate(e=>getComputedStyle(e).transform),first);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.waitForURL('https://vishtynets.ru/',{timeout:12000});
  assert(redirectAt-start>9900&&redirectAt-start<11000);
  results.push({reducedMotion,redirectMs:redirectAt-start,passed:true});
  await p.close();
 }
 const context=await b.newContext({viewport:{width:1280,height:800},recordVideo:{dir:'work/video',size:{width:1280,height:800}}});
 const p=await context.newPage();
 await p.route('https://vishtynets.ru/**',r=>r.abort());
 await p.goto((process.env.QA_BASE_URL || 'http://127.0.0.1:8765'));
 await p.locator('#open').click();
 await p.waitForTimeout(9800);
 const video=p.video();
 await context.close();
 await video.saveAs('outputs/animation-demo.webm');
 await b.close();
 fs.writeFileSync('outputs/motion-fix-qa.json',JSON.stringify(results,null,2));
 console.log(results);
})().catch(e=>{console.error(e);process.exit(1)});
