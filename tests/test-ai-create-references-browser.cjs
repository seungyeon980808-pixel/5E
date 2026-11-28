'use strict';
const { openAiWorkflow } = require('./helpers/graph-entry.cjs');

// 이미지 생성·그래프 생성도 좌우 두 칸(10-22 A-3, 시안 ai-panel-1022):
// 1) 왼쪽 「레퍼런스」(그래프 생성은 「참고 그래프」)·오른쪽 「결과」가 나란히 보이고, 보기 단추·소스 추가·빈 칸 안내도 같은 이름.
// 2) 레퍼런스는 지금 작업에 모이고 최대 4개 — 다섯째는 안내만 하고 넣지 않는다(새 작업도 만들지 않는다).
// 3) 그래프 생성의 참고 그래프는 복원할 원본이 아니라 모양 참고(STYLE_REFERENCE)로 들어간다.
// 4) 이미지 변환으로 돌아가면 원래 이름(원본·수정본).
// 11-19(시안 그림생성화면 v4): 레퍼런스가 0개인 이미지 생성 작업은 결과만 크게(왼쪽은 「비교 대상」), 넣으면 다시 좌우 두 칸.
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
      await openAiWorkflow(page,'image-create');
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
      // 11-19(시안 그림생성화면 v4 태그 1·2): 레퍼런스를 넣지 않은 생성 작업은 결과만 크게 — 레퍼런스 칸은 결과 머리줄의 「＋ 레퍼런스」로 접힌다.
      assert.equal(await page.evaluate(p => document.querySelector(p).dataset.aiResultOnly, panel), 'true', `${name}: no references → result-only view`);
      assert.equal(await page.evaluate(p => document.querySelector(p).dataset.aiLayout, panel), 'result');
      assert.ok(await page.locator(`${panel} [data-ai-create-add-ref]`).isVisible(), `${name}: 「＋ 레퍼런스」 in the result header`);
      assert.equal(v.left, '비교 대상', `${name}: without references the left pane is the comparison target`); assert.equal(v.right, '결과');
      assert.equal(v.viewSource, '레퍼런스'); assert.equal(v.viewResult, '결과');
      assert.match(v.add, /레퍼런스 추가/); assert.match(v.empty, /최대 4개/);
      // 「＋ 레퍼런스」는 지금의 레퍼런스 추가 메뉴(라이브러리·파일·클립보드)를 연다.
      await page.locator(`${panel} [data-ai-create-add-ref]`).click();
      assert.equal(await page.locator(`${panel} .ai-create-ref-menu:not([hidden]) [data-ai-create-ref]`).count(), 3, `${name}: add-reference menu`);
      await page.keyboard.press('Escape');
      // 「레퍼런스」 보기로 바꾸면 빈 레퍼런스 칸(불러오기)이 그대로 있다.
      await page.locator(`${panel} .ai-compare-controls [data-ai-layout-mode="side-by-side"]`).evaluate(b => b.click());
      await page.waitForFunction(p => document.querySelector(p).dataset.aiLayout === 'side-by-side', panel);
      v = await look();
      // 11-11(7992a89c, 시안 v7): 빈 칸 불러오기 select는 「라이브러리에서 불러오기」 단추 + 옆 ＋ 메뉴(파일·클립보드)로 바뀌었다.
      assert.equal(await page.locator(`${panel} [data-ai-reference-empty] [data-ai-empty-library]`).count(), 1, `${name}: the empty slot keeps its library import button`);
      assert.equal(await page.locator(`${panel} [data-ai-reference-empty] .ai-stage-import-menu [role="menuitem"]`).count(), 2, `${name}: the empty slot keeps its file/clipboard import menu`);
      assert.ok(v.original.visible && v.result.visible && v.controls.visible, `${name}: both panes and the view group show on a creation tab`);
      assert.ok(v.original.x < v.result.x && Math.abs(v.original.w - v.result.w) <= 2, `${name}: reference left, result right, same width`);

      // 다섯 장을 한꺼번에 → 넷만, 같은 작업에
      await page.locator(`${panel} [data-ai-source-file]`).setInputFiles([png, png, png, png, png]);
      await page.waitForFunction(p => document.querySelector(p).querySelector('[data-ai-reference-count]').textContent === '4', panel);
      await page.waitForTimeout(300);
      v = await look();
      assert.equal(v.count, '4', `${name}: at most four references`);
      assert.equal(await page.evaluate(p => document.querySelector(p).dataset.aiResultOnly, panel), 'false', `${name}: references → two panes again`);
      assert.equal(v.left, '레퍼런스', `${name}: the left pane is the reference pane again`);
      assert.equal(await page.locator(`${panel} [data-ai-create-add-ref]`).isVisible(), false);
      assert.equal(v.tasks, 1, `${name}: references gather in the current task`);
      assert.match(v.status, /최대 4개/);
      await page.locator(`${panel} [data-ai-source-file]`).setInputFiles(png);
      await page.waitForTimeout(400);
      assert.equal((await look()).count, '4', `${name}: a fifth one is refused`);

      // 그래프 생성: 참고 그래프는 모양 참고로
      await openAiWorkflow(page,'graph-create');
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
      await openAiWorkflow(page,'image');
      await page.waitForFunction(p => document.querySelector(p).dataset.aiCreation === 'false', panel);
      v = await look();
      assert.equal(v.left, '원본'); assert.equal(v.right, '수정본'); assert.equal(v.viewSource, '원본'); assert.match(v.add, /소스 추가/);
      assert.deepEqual(errors, [], `${name}: no page errors`);
      console.log(`${name}: creation references ok`);
    } finally { await browser.close(); }
  }
});
