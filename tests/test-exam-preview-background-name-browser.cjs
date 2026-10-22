// M4 재현: 시험지 미리보기 배경 이름(이름 칸을 비우면 파일 이름)이 HTML로 해석되면 안 된다.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');

const HOSTILE = '<img src=x onerror="window.__examPreviewXss=1">.png';
// 4×4 흰 PNG(배경 자리). 실제 그림 크기 계산만 하면 되므로 작아도 된다.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAD0lEQVR4nGP4jwQYiOMAANuQL9FuRbCyAAAAAElFTkSuQmCC';

for (const [engineName, engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) test(`${engineName}: exam preview shows a hostile background file name as text`, async t => {
  await h.withServer(async origin => {
    const browser = await engine.launch({ headless: true }); t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await page.addInitScript(([name, dataUrl]) => {
      localStorage.setItem('5e.tutorial.bannerSeen', 'true');
      localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
      localStorage.setItem('5e.preview:5e.previewBackgrounds', JSON.stringify([{ id: 'pbg_hostile', name, dataUrl, widthMm: 210, heightMm: 297 }]));
    }, [HOSTILE, PNG]);
    await h.navigate(page, origin + '/?mode=pro&mobile=0'); await h.ready(page);
    const info = await page.evaluate(async () => {
      const version = '?v=1.7.0-four-session-integration';
      const { state } = await import('/js/state.js' + version);
      const { openExamPreview } = await import('/js/exam-preview.js' + version);
      state.update(s => { s.objects = [{ id: 'xss-line', type: 'line', p1: { x: -10, y: -5 }, p2: { x: 10, y: 5 }, strokeWidth: 0.2, layerId: 1 }]; });
      openExamPreview({ state, dpi: 96, options: {} });
      const select = [...document.querySelectorAll('select')].find(el => [...el.options].some(o => o.value === 'pbg_hostile'));
      select.value = 'pbg_hostile'; select.dispatchEvent(new Event('change'));
      const deadline = Date.now() + 20000;
      for (;;) {
        const node = [...document.querySelectorAll('div')].find(el => el.textContent.startsWith('그림 실제 크기') && !el.querySelector('div'));
        if (node && node.textContent.includes('210 × 297')) return { text: node.textContent, html: node.innerHTML, imgs: node.querySelectorAll('img').length, strong: node.querySelectorAll('strong').length };
        if (Date.now() > deadline) throw new Error('exam preview info did not render');
        await new Promise(r => setTimeout(r, 100));
      }
    });
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__examPreviewXss), undefined, 'file name must not run as script');
    assert.equal(info.imgs, 0, 'file name must not create elements');
    assert.equal(info.strong, 2, 'size figures keep their bold emphasis');
    assert.ok(info.text.includes(`페이지 ${HOSTILE} 210 × 297 mm`), info.text);
    assert.ok(info.html.includes('&lt;img'), 'file name is stored as escaped text');
  });
});
