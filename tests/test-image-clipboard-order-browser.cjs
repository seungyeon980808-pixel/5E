const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');

async function scenario(engine, origin, surface) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await h.navigate(page, new URL(surface + '?mode=pro&mobile=0&exam=0', origin).href);
    await h.ready(page);
    const runtime = h.runtime(page);
    await page.evaluate(async stateUrl => {
      window.clipboardTestState = (await import(stateUrl)).state;
      window.clipboardTestData = () => {
        const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 32;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 64, 32);
        ctx.fillStyle = '#000'; ctx.fillRect(8, 8, 48, 16);
        const data = new DataTransfer();
        // Native macOS Safari exposes an image MIME string before the file
        // with the SAME MIME. Matching only type silently chooses the string.
        data.setData('image/png', 'same-type-string-item');
        const bytes = Uint8Array.from(atob(canvas.toDataURL().split(',')[1]), c => c.charCodeAt(0));
        data.items.add(new File([bytes], 'native-clipboard.png', { type: 'image/png' }));
        return data;
      };
      const data = window.clipboardTestData();
      if (data.items[0].kind !== 'string' || data.items[1].kind !== 'file') throw new Error('Wrong clipboard fixture order');
      document.querySelector('#canvas').dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
    }, runtime.stateUrl);
    await page.waitForFunction(() => window.clipboardTestState.get().objects.some(o => o.type === 'image'), null, { timeout: 3000 });
    const image = await page.evaluate(() => window.clipboardTestState.get().objects.find(o => o.type === 'image'));
    assert.ok(image.src.startsWith('data:image/png;base64,'));
    assert.equal(image.w / image.h, 2);
    await page.keyboard.press('Meta+z');
    assert.equal((await h.drawing(page, runtime.stateUrl)).objects.length, 0);
    await page.keyboard.press('Meta+Shift+z');
    assert.equal((await h.drawing(page, runtime.stateUrl)).objects.length, 1);

    await page.locator('#image-objectify-open').click();
    await page.locator('#objectify-preview').evaluate(el => el.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true, cancelable: true, clipboardData: window.clipboardTestData(),
    })));
    await page.waitForFunction(() => document.querySelector('#objectify-status')?.textContent.includes('오브젝트'), null, { timeout: 10000 });
    assert.equal((await h.drawing(page, runtime.stateUrl)).objects.length, 1, 'objectify paste is isolated from canvas paste');
    await page.getByRole('button', { name: '취소', exact: true }).click();
    assert.equal((await h.drawing(page, runtime.stateUrl)).objects.length, 1);

    const ai = await page.evaluate(async moduleUrl => {
      const { pastedImageBlob } = await import(moduleUrl);
      let fallbackReads = 0;
      const file = await pastedImageBlob({ clipboardData: window.clipboardTestData() }, {
        read() { fallbackReads++; throw new Error('Existing event file must not ask for system clipboard access'); },
      });
      return { type: file?.type, bytes: file?.size, fallbackReads };
    }, new URL('ai-panel.js' + runtime.moduleQuery, runtime.mainUrl).href);
    assert.equal(ai.type, 'image/png'); assert.ok(ai.bytes > 0); assert.equal(ai.fallbackReads, 0);
    assert.deepEqual(errors, []);
    console.log(engine.name() + ' ' + surface + ': string-before-file PNG paste, undo/redo, objectify isolation and AI event reader passed (no live AI)');
  } finally { await browser.close(); }
}
(async () => h.withServer(async origin => {
  for (const engine of [chromium,webkit].filter(e=>!process.env.BROWSER_ENGINE||e.name()===process.env.BROWSER_ENGINE)) for (const surface of ['/', '/preview/']) await scenario(engine, origin, surface);
}))().catch(error => { console.error(error); process.exitCode = 1; });
