const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const previewUrl = process.env.PREVIEW_URL || 'http://127.0.0.1:8765/';
const cases = [
  ['small', '80%'], ['medium', '90%'], ['large', '100%'], ['wide', '110%'],
].flatMap(([screen, scale]) => [320, 375, 768, 1280].map(width => ({ screen, scale, width })));

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const testCase of cases) {
      const context = await browser.newContext({ viewport: { width: testCase.width, height: 900 } });
      const page = await context.newPage();
      await context.addInitScript(() => {
        localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
        localStorage.setItem('5e.tutorial.bannerSeen', 'true');
      });
      await page.goto(previewUrl, { waitUntil: 'networkidle' });
      // main.js installs export handlers after awaiting autosave recovery.
      await page.locator('html[data-mode]').waitFor({ state: 'attached' });
      await page.evaluate(screen => document.documentElement.setAttribute('data-screen', screen), testCase.screen);
      await page.evaluate(() => document.getElementById('image-export').click());
      await page.locator('#export-overlay').waitFor({ state: 'visible' });
      const metrics = await page.evaluate(() => {
        const modal = document.querySelector('#export-overlay .modal');
        const actions = modal.querySelector('.export-actions');
        const rect = element => {
          const value = element.getBoundingClientRect();
          return { left: value.left, right: value.right, top: value.top, bottom: value.bottom };
        };
        const modalRect = rect(modal);
        const actionRect = rect(actions);
        return {
          picker: Function.prototype.toString.call(window.showDirectoryPicker),
          buttons: [...actions.querySelectorAll('button')].map(button => {
            const buttonRect = rect(button);
            return {
              text: button.textContent.trim(),
              wraps: button.scrollHeight > button.clientHeight + 1,
              insideActions: buttonRect.left >= actionRect.left - 0.5 && buttonRect.right <= actionRect.right + 0.5,
              insideModal: buttonRect.left >= modalRect.left - 0.5 && buttonRect.right <= modalRect.right + 0.5,
              insideViewport: buttonRect.left >= -0.5 && buttonRect.right <= innerWidth + 0.5,
            };
          }),
        };
      });
      assert.match(metrics.picker, /\[native code\]/, `${testCase.scale}/${testCase.width} must use the browser directory capability`);
      assert.equal(metrics.buttons.length, 6, `${testCase.scale}/${testCase.width} must render every export action`);
      for (const button of metrics.buttons) {
        assert.equal(button.wraps, false, `${testCase.scale}/${testCase.width} ${button.text} must stay single-line`);
        assert.equal(button.insideActions, true, `${testCase.scale}/${testCase.width} ${button.text} must stay in the action grid`);
        assert.equal(button.insideModal, true, `${testCase.scale}/${testCase.width} ${button.text} must stay in the dialog`);
        assert.equal(button.insideViewport, true, `${testCase.scale}/${testCase.width} ${button.text} must stay in the viewport`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`export action layout passed ${cases.length} viewport/scale cases`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
