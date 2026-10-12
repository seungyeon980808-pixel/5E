const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');

h.withServer(async origin => {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/fixture', route => route.fulfill({
        contentType: 'text/html',
        body: '<html><head><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/unified-library.css"></head><body></body></html>',
      }));
      await page.goto(origin + '/fixture');
      const firstFrame = await page.evaluate(async () => {
        const { createUnifiedLibraryUi } = await import('/js/unified-library-ui.js?v=1.7.0-four-session-integration');
        const ready = Promise.withResolvers();
        const provider = {
          getSources: () => [], getExamFilterOptions: () => ({ academicYears: [] }),
          search: () => Array.from({length:1000},(_,i)=>({id:'load-'+i,kind:'image',title:'Image '+i,preview:'/tests/fixtures/rights-clear-smoke.png'})), listPdfPages: () => [], listPdfFiles: () => [],
        };
        const fixture = window.entranceFixture = { requests: 0, release: () => ready.resolve(provider) };
        fixture.ui = createUnifiedLibraryUi({
          getProvider: () => { fixture.requests += 1; return ready.promise; },
          insertMaterialized: async () => {}, initialSearchReadiness: 'loading',
        });
        fixture.opened = fixture.ui.open();
        fixture.ui.setSearchReadiness('ready');
        return { requests: fixture.requests, motion: fixture.ui.element.dataset.modalMotionState };
      });
      assert.equal(firstFrame.motion, 'start');
      assert.equal(firstFrame.requests, 0, 'readiness cannot start catalog work during entrance');
      await page.waitForFunction(() => window.entranceFixture.requests > 0);
      assert.equal(await page.locator('.unified-library-overlay').getAttribute('data-modal-motion-state'), 'open');
      await page.evaluate(async () => { const f = window.entranceFixture; f.release(); await f.opened; });
      assert.equal(await page.locator('[data-unilib-result-state]').getAttribute('data-state'), 'ready');
      await page.evaluate(async()=>{ const scroller=document.querySelector('.unilib-result-scroll'); for(let i=0;i<20;i++){scroller.scrollTop=scroller.scrollHeight;scroller.dispatchEvent(new Event('scroll'));await new Promise(requestAnimationFrame);} scroller.scrollTop=0; });
      const closing = await page.evaluate(() => {
        const f = window.entranceFixture;
        const before = f.requests;
        const native = window.getComputedStyle;
        window.motionStyleReads = 0;
        window.getComputedStyle = (...args) => { window.motionStyleReads++; return native(...args); };
        window.motionStyleWrites=0; const mo=new MutationObserver(records=>window.motionStyleWrites+=records.filter(r=>r.attributeName==='style').length);mo.observe(f.ui.element,{attributes:true});window.motionStarted = performance.now();
        f.ui.close({ restoreFocus: false });
        f.ui.setSearchReadiness('ready');
        return { before, after: f.requests };
      });
      assert.equal(closing.after, closing.before, 'closing does not start a background refresh');
      await page.locator('.unified-library-overlay').waitFor({ state: 'hidden' });
      const profile=await page.evaluate(() => ({cards:document.querySelectorAll('[data-result-id]').length,styleWrites:window.motionStyleWrites,styleReads:window.motionStyleReads,closeMs:Math.round(performance.now()-window.motionStarted)}));
      assert.equal(profile.cards,1000);assert.ok(profile.styleWrites<=3,'native fade avoids frame-by-frame style invalidation');console.log(name,profile);
      await page.evaluate(async()=>{const f=window.entranceFixture;f.ui.open();await new Promise(requestAnimationFrame);f.ui.close();await new Promise(requestAnimationFrame);f.ui.open();});
      await page.waitForFunction(()=>document.querySelector('.unified-library-overlay').dataset.modalMotionState==='open');
      assert.equal(await page.locator('.unified-library-overlay').isVisible(),true,'reopening cancels stale close');
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.evaluate(()=>window.entranceFixture.ui.close());
      assert.equal(await page.locator('.unified-library-overlay').isVisible(),false,'reduced motion closes immediately');
      await page.emulateMedia({reducedMotion:'no-preference'});
      await page.evaluate(async () => {
        const { initEscapeLayers } = await import('/js/escape-layers.js?v=1.7.0-four-session-integration');
        initEscapeLayers();
        await window.entranceFixture.ui.open();
      });
      await page.keyboard.press('Escape');
      await page.locator('.unified-library-overlay').waitFor({ state: 'hidden', timeout: 2000 });
      for (const width of [900, 760]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => window.entranceFixture.ui.open());
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.unified-library-overlay').isVisible(), true, 'Esc closes a narrow-screen drawer before the library');
        assert.equal(await page.locator('.unilib').evaluate(el => el.classList.contains('preview-open')), false);
        await page.keyboard.press('Escape');
        await page.locator('.unified-library-overlay').waitFor({ state: 'hidden', timeout: 2000 });
      }
      assert.deepEqual(errors, []);
      console.log(name + ': entrance refresh and single desktop Esc pass; tablet/mobile drawer Esc remains layered');
    } finally { await browser.close(); }
  }
}).catch(error => { console.error(error); process.exitCode = 1; });
