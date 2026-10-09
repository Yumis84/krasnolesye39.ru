const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:8765/';
(async () => {
  const browser = await chromium.launch({channel:'msedge'});
  const results = [];
  async function test(name, fn, options = {}) {
    const page = await browser.newPage(options);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://vishtynets.ru/**', r => r.fulfill({body:'QA destination'}));
    await fn(page);
    assert.deepEqual(errors, []);
    results.push({name, passed:true});
    await page.close();
  }
  await test('Idle stays silent and stationary beyond ten seconds', async p => {
    await p.addInitScript(() => {
      const Native = window.AudioContext;
      window.contexts = [];
      window.AudioContext = class extends Native {
        constructor(...args) { super(...args); window.contexts.push(this); }
        createGain() { const gain = super.createGain(); this.qaGains ||= []; this.qaGains.push(gain); return gain; }
      };
    });
    await p.goto(base);
    const before = await p.locator('.forest').evaluate(e => getComputedStyle(e).transform);
    await p.waitForTimeout(10200);
    assert(p.url().startsWith(base));
    assert.equal(await p.evaluate(() => contexts.length), 0);
    assert.equal(await p.locator('.forest').evaluate(e => getComputedStyle(e).transform), before);
    await p.locator('#open').click();
    assert.equal(await p.evaluate(() => contexts.length), 1);
    await p.locator('#pause').click();
    await p.waitForFunction(() => contexts[0].state === 'suspended');
    const audioTime = await p.evaluate(() => contexts[0].currentTime);
    await p.waitForTimeout(300);
    assert.equal(await p.evaluate(() => contexts[0].currentTime), audioTime);
    await p.locator('#sound').click();
    await p.locator('#sound').click();
    assert.equal(await p.evaluate(() => contexts.length), 1);
    await p.locator('#pause').click();
    await p.waitForFunction(() => contexts[0].state === 'running');
    await p.waitForTimeout(200);
    assert(await p.evaluate(() => contexts[0].currentTime) > audioTime);
    assert.equal(await p.evaluate(() => document.activeElement.id), 'pause');
    await p.locator('#sound').click();
    await p.waitForTimeout(250);
    assert(await p.evaluate(() => contexts[0].qaGains[0].gain.value) < 0.001);
    await p.locator('#sound').click();
    await p.waitForTimeout(250);
    assert(await p.evaluate(() => contexts[0].qaGains[0].gain.value) > 0.15);
    assert.equal(await p.locator('#gate').isVisible(), false);
    await p.locator('#open').evaluate(e => e.dispatchEvent(new Event('click')));
    assert.equal(await p.evaluate(() => contexts.length), 1);
  });
  for (const [width,height] of [[1440,900],[390,844],[320,568],[844,390]]) {
    await test(`Initial controls reachable at ${width}x${height}`, async p => {
      await p.goto(base);
      for (const selector of ['#open','#sound','.skip']) {
        assert(await p.locator(selector).evaluate(e => {
          const r=e.getBoundingClientRect();
          return r.width > 0 && r.x >= 0 && r.right <= innerWidth && e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
        }));
      }
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await p.locator('#sound').click();
      assert.equal(await p.locator('#sound').getAttribute('aria-pressed'),'false');
      await p.locator('.skip').click();
      await p.waitForURL('https://vishtynets.ru/');
    }, {viewport:{width,height}});
  }
  await test('No JavaScript: readable landing and direct navigation', async p => {
    await p.goto(base);
    assert(await p.locator('.gate h1').isVisible());
    assert.equal(await p.locator('#open').isVisible(),false);
    await p.waitForTimeout(10100);
    assert(p.url().startsWith(base));
    await p.screenshot({path:'outputs/no-javascript.png'});
    await p.locator('.skip').click();
    await p.waitForURL('https://vishtynets.ru/');
  }, {javaScriptEnabled:false});
  for (const mode of ['missing','throws']) {
    await test(`Audio ${mode}: redirect still works`, async p => {
      await p.addInitScript(mode => {
        window.AudioContext = mode === 'missing' ? undefined : function() { throw Error('Unavailable audio'); };
        window.webkitAudioContext = undefined;
      }, mode);
      await p.goto(base);
      await p.locator('#open').click();
      await p.waitForURL('https://vishtynets.ru/',{timeout:12000});
    });
  }
  await test('Hidden tab pauses and requires manual resume', async p => {
    await p.goto(base);
    await p.locator('#open').click();
    await p.evaluate(() => {
      Object.defineProperty(document,'hidden',{configurable:true,value:true});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert(await p.locator('#experience').evaluate(e => e.classList.contains('paused')));
    await p.waitForTimeout(10100);
    assert(p.url().startsWith(base));
    await p.evaluate(() => {
      Object.defineProperty(document,'hidden',{configurable:true,value:false});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert(await p.locator('#experience').evaluate(e => e.classList.contains('paused')));
  });
  fs.writeFileSync('outputs/interaction-results.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
