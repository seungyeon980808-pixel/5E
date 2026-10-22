'use strict';

// 이미지 생성·그래프 생성도 좌우 두 칸(10-22 A-3, 시안 ai-panel-1022):
// 1) 왼쪽 「레퍼런스」(그래프 생성은 「참고 그래프」)·오른쪽 「결과」가 나란히 보이고, 보기 단추·소스 추가·빈 칸 안내도 같은 이름.
// 2) 레퍼런스는 지금 작업에 모이고 최대 4개 — 다섯째는 안내만 하고 넣지 않는다(새 작업도 만들지 않는다).
// 3) 그래프 생성의 참고 그래프는 복원할 원본이 아니라 모양 참고(STYLE_REFERENCE)로 들어간다.
// 4) 이미지 변환으로 돌아가면 원래 이름(원본·수정본).
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
process.env.APP_ENTRY = '/';

const panel = '#ai-image-panel';
const png = path.join(__dirname, 'fixtures/rights-clear-smoke.png');

h.withServer(async origin => {
  for (const [name, engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.addInitScript(() => { localStorage.setItem('5e.tutorial.bannerSeen', 'true'); localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true'); });
      await h.navigate(page, origin + '/?mode=pro&mobile=0&exam=0');
      await page.locator('#ai-image-install-open').click();
      await page.locator(`${panel} [data-ai-workflow="image-create"]`).click();
      await page.waitForFunction(p => document.querySelector(p).dataset.aiCreation === 'true', panel);
      const look = () => page.evaluate(p => {
        const root = document.querySelector(p), text = s => root.querySelector(s)?.textContent.trim();
        const box = s => { const r = root.querySelector(s).getBoundingClientRect(); return { x: r.x, w: r.width, visible: r.width > 0 && r.height > 0 }; };
        return { left: text('.ai-original-pane .ai-pane-metadata > strong'), right: text('.ai-result-pane .ai-pane-metadata > strong'),
          viewSource: text('.ai-compare-controls [data-ai-layout-mode="source"]'), viewResult: text('.ai-compare-controls [data-ai-layout-mode="result"]'),
          add: text('[data-ai-source-menu-trigger]'), empty: text('[data-ai-reference-empty]'), count: text('[data-ai-reference-count]'),
          original: box('.ai-original-pane'), result: box('.ai-result-pane'), controls: box('.ai-compare-controls'),
          tasks: root.querySelectorAll('[data-ai-tab-list] .ai-task-tab[data-tab-id]').length,
          roles: [...root.querySelectorAll('.ai-reference-card')].map(c => c.dataset.aiReferenceRole), status: text('[data-ai-status]') };
      }, panel);
      let v = await look();
      assert.equal(v.left, '레퍼런스'); assert.equal(v.right, '결과');
      assert.equal(v.viewSource, '레퍼런스'); assert.equal(v.viewResult, '결과');
      assert.match(v.add, /레퍼런스 추가/); assert.match(v.empty, /최대 4개/);
      assert.equal(await page.locator(`${panel} [data-ai-reference-empty] select[data-ai-empty-import] option`).count(), 3, `${name}: the empty slot keeps its import menu`);
      assert.ok(v.original.visible && v.result.visible && v.controls.visible, `${name}: both panes and the view group show on a creation tab`);
      assert.ok(v.original.x < v.result.x && Math.abs(v.original.w - v.result.w) <= 2, `${name}: reference left, result right, same width`);

      // 다섯 장을 한꺼번에 → 넷만, 같은 작업에
      await page.locator(`${panel} [data-ai-source-file]`).setInputFiles([png, png, png, png, png]);
      await page.waitForFunction(p => document.querySelector(p).querySelector('[data-ai-reference-count]').textContent === '4', panel);
      await page.waitForTimeout(300);
      v = await look();
      assert.equal(v.count, '4', `${name}: at most four references`);
      assert.equal(v.tasks, 1, `${name}: references gather in the current task`);
      assert.match(v.status, /최대 4개/);
      await page.locator(`${panel} [data-ai-source-file]`).setInputFiles(png);
      await page.waitForTimeout(400);
      assert.equal((await look()).count, '4', `${name}: a fifth one is refused`);

      // 그래프 생성: 참고 그래프는 모양 참고로
      await page.locator(`${panel} [data-ai-workflow="graph-create"]`).click();
      await page.waitForFunction(p => document.querySelector(p).dataset.aiWorkflow === 'graph-create', panel);
      v = await look();
      assert.equal(v.left, '참고 그래프'); assert.equal(v.viewSource, '참고 그래프'); assert.match(v.add, /참고 그래프 추가/);
      if (Number(v.count) === 0) {
        await page.locator(`${panel} [data-ai-source-file]`).setInputFiles(png);
        await page.waitForFunction(p => document.querySelector(p).querySelector('[data-ai-reference-count]').textContent === '1', panel);
        v = await look();
      }
      assert.ok(v.roles.length >= 1 && v.roles.every(r => r === 'STYLE_REFERENCE'), `${name}: graph references are shape references: ${v.roles}`);

      // 이미지 변환: 원래 이름
      await page.locator(`${panel} [data-ai-workflow="image"]`).click();
      await page.waitForFunction(p => document.querySelector(p).dataset.aiCreation === 'false', panel);
      v = await look();
      assert.equal(v.left, '원본'); assert.equal(v.right, '수정본'); assert.equal(v.viewSource, '원본'); assert.match(v.add, /소스 추가/);
      assert.deepEqual(errors, [], `${name}: no page errors`);
      console.log(`${name}: creation references ok`);
    } finally { await browser.close(); }
  }
});
