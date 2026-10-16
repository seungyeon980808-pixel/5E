const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, webkit} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
process.env.APP_ENTRY = '/';
const destination = 'https://5e.ai.kr/bug/';
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/feedback/parts/cs-center-links');
fs.mkdirSync(evidence, {recursive:true});
(async () => h.withServer(async origin => {
  for (const [name, engine] of Object.entries({chromium, webkit})) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({viewport:{width:1440,height:1000}}), errors = [], uploads = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {if (request.method() === 'POST') uploads.push(request.url());});
      await page.context().route(destination, route => route.fulfill({contentType:'text/html',body:'<title>Isolated CS destination</title>'}));
      await h.navigate(page, origin + '/?mode=pro&mobile=0&exam=0'); await h.ready(page);
      await page.evaluate(async () => {
        window.__contextReads = 0;
        const {registerBugReportContext} = await import('/js/bug-report.js?v=1.7.0-four-session-integration');
        registerBugReportContext('navigation-privacy', () => {window.__contextReads++; throw new Error('Navigation must not read editor images');});
      });
      const open = async link => {
        assert.equal(await link.getAttribute('href'), destination);
        assert.equal(await link.getAttribute('target'), '_blank');
        assert.match(await link.getAttribute('rel'), /noopener/);
        const popupPromise = page.waitForEvent('popup'); await link.click();
        const popup = await popupPromise; await popup.waitForLoadState();
        assert.equal(popup.url(), destination); assert.equal(await popup.evaluate(() => window.opener), null);
        await popup.close();
        assert.equal(await page.locator('#bug-report-dialog').count(), 0);
      };
      await open(page.locator('.footer-actions .bug-report-open'));
      await page.locator('#ai-image-install-open').click();
      await open(page.locator('#ai-image-panel .bug-report-open'));
      await page.locator('[data-ai-empty-import]:visible').selectOption('library');
      const library = page.locator('.unified-library-overlay'); await library.waitFor();
      await open(library.locator('.bug-report-open'));
      assert.equal(await library.isVisible(), true, 'support navigation preserves the open library');
      assert.equal(await page.evaluate(() => __contextReads), 0);
      assert.deepEqual(uploads, [], 'a support link never uploads documents, images or logs');
      assert.deepEqual(errors, []);
      await page.screenshot({path:path.join(evidence,name + '-links.png')});
      console.log(name + ': footer/AI/library open CS Center in a new tab; current editor and private data preserved');
    } finally {await browser.close();}
  }
}))().catch(error => {console.error(error);process.exitCode = 1;});
