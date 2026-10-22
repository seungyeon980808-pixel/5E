'use strict';

// 세 앱 왼쪽 칸 폭 하나 + 한글 집중 도구 줄(10-22, 시안 shell-layout-1022):
// 1) 1440에서 그림·출제·한글(집중) 왼쪽 칸이 모두 160, 한글 도구 줄은 52px이고 문서 쪽 열에만(첫 탭 = 칸 경계 + 10).
// 2) 칸 160에서는 칸 안이 좁은 목록(공통 도구 1열, 물감 1열 — 교사가 짠 배치 값은 그대로).
// 3) 경계를 끌어 240 → 다른 앱도 240, 새로고침 뒤에도 240. 두 번 누르면 160. ←/→ 8px씩.
// 4) 900px 이하 화면은 끈 폭을 쓰지 않고 160, 손잡이 숨김.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/feedback/parts/shell-left-width');
process.env.APP_ENTRY = '/';

const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;

h.withServer(async origin => {
  fs.mkdirSync(evidence, { recursive: true });
  for (const [name, engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await h.navigate(page, origin + '/?mode=pro&mobile=0'); await h.ready(page);
      await page.evaluate(() => localStorage.removeItem('5e.shell.leftWidth'));
      const imageLeft = () => page.evaluate(() => document.getElementById('panel-left').getBoundingClientRect().width);
      assert.ok(near(await imageLeft(), 160), `${name}: image left panel starts at 160`);

      // 한글(집중)
      await page.locator('.app-switch-image [data-app-switch="hwp"]').click();
      await page.locator('#rhwp-exam-workspace').waitFor({ state: 'visible' }); await h.idle(page);
      if (await page.locator('#rhwp-exam-workspace').getAttribute('data-tool-mode') !== 'focus') await page.locator('[data-exam-mode="focus"]').click();
      await page.locator('.exam-focusbar').waitFor({ state: 'visible' });
      const hwp = () => page.evaluate(() => {
        const r = s => document.querySelector(s).getBoundingClientRect();
        const side = r('#rhwp-exam-workspace .exam-sidebar'), bar = r('.exam-focusbar'), tab = r('.exam-ftabs button'), top = r('.exam-topbar'), studio = r('#exam-studio');
        const common = getComputedStyle(document.querySelector('#rhwp-exam-workspace .palette-common')).gridTemplateColumns.split(' ').length;
        const grid = document.querySelector('#rhwp-exam-workspace .palette-grid');
        const blocks = [...grid.querySelectorAll('.palette-block')].slice(0, 3).map(b => ({ x: b.getBoundingClientRect().x, inline: b.style.gridColumn }));
        return { side: { x: side.x, right: side.right, top: side.top, w: side.width }, bar: { x: bar.x, top: bar.top, h: bar.height }, tabX: tab.x, tabH: tab.height, topBottom: top.bottom, studioTop: studio.top, common, blocks };
      });
      let g = await hwp();
      fs.writeFileSync(path.join(evidence, `${name}-hwp-160.json`), JSON.stringify(g, null, 2));
      await page.screenshot({ path: path.join(evidence, `${name}-hwp-160.png`) });
      assert.ok(near(g.side.w, 160), `${name}: hwp focus sidebar is 160 like the other apps: ${g.side.w}`);
      assert.ok(near(g.side.top, g.topBottom), `${name}: sidebar starts right under the top bar`);
      assert.ok(near(g.bar.h, 52) && near(g.tabH, 32), `${name}: focus toolbar 52px, tabs 32px: ${JSON.stringify(g.bar)} ${g.tabH}`);
      assert.ok(near(g.bar.x, g.side.right) && near(g.bar.top, g.topBottom), `${name}: toolbar sits only over the document column`);
      assert.ok(near(g.tabX, g.side.right + 10 + 2, 2.5), `${name}: first tab starts at the panel edge + 10 (+2 group inset): ${g.tabX} vs ${g.side.right}`);
      assert.ok(near(g.studioTop, g.bar.top + g.bar.h), `${name}: paper starts under the toolbar`);
      assert.equal(g.common, 1, `${name}: common palette tools are one column in a narrow panel`);
      assert.ok(g.blocks.length >= 2 && g.blocks.every(b => near(b.x, g.blocks[0].x)), `${name}: palette blocks list in one column`);
      assert.ok(g.blocks.every(b => /\d/.test(b.inline)), `${name}: the teacher's saved grid placement stays on the blocks`);

      // 끌어서 240
      const grip = page.locator('#rhwp-exam-workspace .shell-left-grip:not([hidden])');
      await grip.waitFor({ state: 'visible' });
      const gb = await grip.boundingBox();
      await page.mouse.move(gb.x + gb.width / 2, gb.y + 200); await page.mouse.down();
      await page.mouse.move(gb.x + gb.width / 2 + 40, gb.y + 200, { steps: 4 });
      await page.mouse.move(gb.x + gb.width / 2 + 80, gb.y + 200, { steps: 4 }); await page.mouse.up();
      await page.waitForFunction(() => localStorage.getItem('5e.shell.leftWidth') === '240');
      g = await hwp();
      assert.ok(near(g.side.w, 240), `${name}: dragged to 240: ${g.side.w}`);
      assert.ok(near(g.tabX, g.side.right + 12, 2.5), `${name}: toolbar follows the wider panel`);
      assert.equal(g.common, 2, `${name}: wide panel keeps the two-column common tools`);

      // 출제도 240
      await page.locator('.exam-topbar [data-app-switch="exam"]').click();
      const sheet = await (await page.waitForSelector('#exampool-sheet-workspace iframe')).contentFrame();
      await sheet.waitForSelector('#side-new', { state: 'attached' });
      await page.waitForFunction(() => !document.querySelector('.app-leaving'));
      await sheet.waitForFunction(() => Math.abs(document.querySelector('.side').getBoundingClientRect().width - 240) <= 1.5, null, { timeout: 5000 });
      assert.equal(await sheet.locator('.shell-left-grip:not([hidden])').count(), 1, `${name}: exam panel has its own resize grip`);

      // 그림도 240, 새로고침 뒤에도
      await sheet.locator('.top [data-app-switch="image"]').click();
      await page.waitForFunction(() => document.getElementById('exampool-sheet-workspace').hidden && !document.querySelector('.app-leaving'));
      assert.ok(near(await imageLeft(), 240), `${name}: image left panel follows the shared width`);
      await h.navigate(page, origin + '/?mode=pro&mobile=0'); await h.ready(page);
      await page.waitForFunction(() => Math.abs(document.getElementById('panel-left').getBoundingClientRect().width - 240) <= 1.5);

      // 두 번 누르면 160, 키보드 ←/→ 8px
      const imageGrip = page.locator('body > .shell-left-grip:not([hidden])');
      await imageGrip.waitFor({ state: 'visible' });
      await imageGrip.dblclick();
      await page.waitForFunction(() => localStorage.getItem('5e.shell.leftWidth') === null && Math.abs(document.getElementById('panel-left').getBoundingClientRect().width - 160) <= 1.5);
      await imageGrip.waitFor({ state: 'visible' });
      await imageGrip.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => localStorage.getItem('5e.shell.leftWidth') === '176');
      await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(() => localStorage.getItem('5e.shell.leftWidth') === null, null, { timeout: 3000 });

      // 900 이하: 끈 폭을 쓰지 않음
      await page.evaluate(() => localStorage.setItem('5e.shell.leftWidth', '280'));
      await h.navigate(page, origin + '/?mode=pro&mobile=0'); await h.ready(page);
      await page.setViewportSize({ width: 880, height: 900 });
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ds-panel-left').trim()), '160px', `${name}: narrow screens keep 160`);
      assert.equal(await page.locator('.shell-left-grip:visible').count(), 0, `${name}: no grip on narrow screens`);
      await page.evaluate(() => localStorage.removeItem('5e.shell.leftWidth'));
      assert.deepEqual(errors, [], `${name}: no page errors`);
      console.log(`${name}: shell left width ok`);
    } finally { await browser.close(); }
  }
});
