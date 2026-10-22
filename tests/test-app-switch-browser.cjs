'use strict';

// 5E 세 프로그램 전환(맨 위 줄 exam · image · hwp, 10-20):
// 1) exam↔hwp 사이에 그림 화면이 비치는 프레임이 없다(새 프로그램을 먼저 열고 다 나타난 뒤 옛 것을 닫음).
// 2) 조판이 바쁜 순간(「한글에 넣기」 영역 고르기 중)에 누른 hwp도 바쁜 일이 끝나면 열린다.
// 3) 전환 도중에 누른 이름은 버리지 않고 이어서 간다(빠르게 눌러도 마지막 것으로).
// 4) 전환 도중 출제 칸 ✕를 눌러도 그림 화면이 잠긴 채 남지 않는다(H1, 10-21).
// 5) 이름을 빠르게 두 번 눌러도 원래 화면으로 튕겨 돌아가지 않는다(M8, 10-21).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/feedback/parts/app-switch');
process.env.APP_ENTRY = '/';

h.withServer(async origin => {
  fs.mkdirSync(evidence, { recursive: true });
  for (const [name, engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await h.navigate(page, origin + '/?mode=pro&mobile=0'); await h.ready(page);
      const sheet = async () => (await page.waitForSelector('#exampool-sheet-workspace iframe')).contentFrame();
      // 매 프레임 「출제·조판 중 하나라도 보이는지」를 기록한다(둘 다 안 보이면 그 프레임에 그림 화면이 비친 것).
      const record = () => page.evaluate(() => { window.__switchFrames = []; const t0 = performance.now();
        const step = () => { const exam = document.getElementById('exampool-sheet-workspace'), hwp = document.getElementById('rhwp-exam-workspace');
          window.__switchFrames.push({ exam: !!exam && !exam.hidden, hwp: !!hwp && !hwp.hidden }); if (performance.now() - t0 < 1500) requestAnimationFrame(step); };
        requestAnimationFrame(step); });
      const frames = async () => { await page.waitForTimeout(1600); return page.evaluate(() => window.__switchFrames); };

      await page.locator('.app-switch-image [data-app-switch="exam"]').click();
      await (await sheet()).waitForSelector('#side-new', { state: 'attached' });
      await page.waitForFunction(() => !document.querySelector('.app-leaving'));

      // 1) exam → hwp → exam: 둘 다 안 보이는 프레임이 없어야 한다.
      for (const [from, to] of [['exam', 'hwp'], ['hwp', 'exam']]) {
        await record();
        if (from === 'exam') await (await sheet()).locator('.top [data-app-switch="hwp"]').click();
        else await page.locator('.exam-topbar [data-app-switch="exam"]').click();
        const seen = await frames();
        assert.ok(seen.length > 10, `${name}: frames recorded`);
        assert.equal(seen.filter(s => !s.exam && !s.hwp).length, 0, `${name} ${from}→${to}: the image screen never flashes between programs`);
        assert.deepEqual(seen.at(-1), { exam: to === 'exam', hwp: to === 'hwp' }, `${name}: ends on ${to}`);
      }
      await (await sheet()).locator('.top [data-app-switch="image"]').click();
      await page.waitForFunction(() => document.getElementById('exampool-sheet-workspace').hidden && !document.querySelector('.app-leaving'));

      // 2) 조판이 바쁜 동안 누른 hwp: 「한글에 넣기」 영역 고르기 중(바쁨)에 누르고, 취소하면 열린다.
      await page.locator('[data-tool="L"]').first().click();
      const canvas = await page.locator('#canvas').boundingBox();
      await page.mouse.click(canvas.x + canvas.width * .35, canvas.y + canvas.height * .45);
      await page.mouse.click(canvas.x + canvas.width * .65, canvas.y + canvas.height * .55);
      await page.keyboard.press('Escape');
      await h.sendCanvas(page);
      await page.locator('.capture-overlay').waitFor({ state: 'visible' });
      await page.evaluate(() => document.querySelector('.app-switch-image [data-app-switch="hwp"]').click());
      await page.keyboard.press('Escape');
      await page.locator('#rhwp-exam-workspace').waitFor({ state: 'visible', timeout: 6000 });
      await h.idle(page);

      // 3) 전환 도중에 누른 이름: hwp → exam 전환이 끝나기 전에 image를 누르면 끝내 image로 간다.
      await page.evaluate(() => {
        document.querySelector('.exam-topbar [data-app-switch="exam"]').click();
        setTimeout(() => document.querySelector('.exam-topbar [data-app-switch="image"]').click(), 60);
      });
      await page.waitForFunction(() => {
        const exam = document.getElementById('exampool-sheet-workspace'), hwp = document.getElementById('rhwp-exam-workspace');
        return hwp.hidden && exam && exam.hidden && !document.querySelector('.app-leaving');
      }, null, { timeout: 10000 });
      assert.equal(await page.evaluate(() => document.querySelector('body>.app').inert), false, `${name}: the image screen is usable again`);
      // 4) H1: hwp → exam 전환 도중(0.15초)에 출제 칸 ✕(5E로 돌아가기)를 누르면, 아무 칸도 없는데 그림 화면이 잠긴 채 남던 것.
      await page.locator('.app-switch-image [data-app-switch="hwp"]').click();
      await page.locator('#rhwp-exam-workspace').waitFor({ state: 'visible' }); await h.idle(page);
      await page.locator('.exam-topbar [data-app-switch="exam"]').click();
      await page.waitForTimeout(150);
      await (await sheet()).evaluate(() => document.getElementById('return').click());
      await page.waitForFunction(() => document.getElementById('exampool-sheet-workspace').hidden && document.getElementById('rhwp-exam-workspace').hidden && !document.querySelector('.app-leaving'), null, { timeout: 10000 });
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => document.querySelector('body>.app').inert), false, `${name}: closing the sheet mid-switch never leaves the image screen locked`);
      await page.locator('.app-switch-image [data-app-switch="hwp"]').click({ timeout: 5000 });
      await page.locator('#rhwp-exam-workspace').waitFor({ state: 'visible' });
      // 5) M8: 이름을 빠르게 두 번 누르면 둘째 클릭이 새 화면의 같은 자리(방금 떠나온 프로그램)를 눌러 튕겨 돌아가던 것.
      await page.waitForTimeout(500);
      await page.locator('.exam-topbar [data-app-switch="image"]').click();
      await page.waitForFunction(() => document.getElementById('rhwp-exam-workspace').hidden && !document.querySelector('.app-leaving'));
      const examName = page.locator('.app-switch-image [data-app-switch="exam"]'), box = await examName.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(200);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(1500);
      assert.equal(await page.evaluate(() => document.getElementById('exampool-sheet-workspace').hidden), false, `${name}: a quick second click does not bounce back to the image screen`);
      await (await sheet()).locator('.top [data-app-switch="image"]').click();
      await page.waitForFunction(() => document.getElementById('exampool-sheet-workspace').hidden && !document.querySelector('.app-leaving'));
      await page.screenshot({ path: path.join(evidence, `${name}-end.png`) });
      assert.deepEqual(errors, []);
      console.log(`PASS app switch ${name}: no flash between programs, busy hwp opens, queued switch, no stuck lock`);
    } finally { await browser.close(); }
  }
}).catch(error => { console.error(error); process.exitCode = 1; });
