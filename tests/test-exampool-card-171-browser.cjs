'use strict';
// 1.7.1 문항 카드(갈래 BL3) 묶음 검사.
// ① B21: 합답형 선지 칸 「ㄱ, ㄴ, ㄷ」가 좁은 칸에서 다음 줄로 떨어져 칸 위로 삐져나오지 않는다(한 줄, 칸 안).
// ② 사용자 결정: 문항 카드에서 자료 칸을 고르고 Delete·⌫ = 그 칸의 그림만 비우기(칸은 남음, ⌘Z로 되돌림).
// 칸째 지우기는 지금처럼 휴지통 단추. (11-14 40c785b4까지는 Delete가 칸째 지웠다.)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const examples = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/exampool/sheet/examples.json'), 'utf8'));
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
process.env.APP_ENTRY = '/';

h.withServer(async origin => {
  for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([k]) => !process.env.BROWSER_ENGINE || k === process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await h.navigate(page, origin + '/?mode=pro&mobile=0'); await h.ready(page);
      await page.locator('.app-switch-image [data-app-switch="exam"]').evaluate(b => b.click());
      const frame = await page.waitForSelector('#exampool-sheet-workspace iframe'), sheet = await frame.contentFrame();
      sheet.on?.('pageerror', e => errors.push(e.message));
      await sheet.waitForSelector('.side [data-pool="drafting"]'); await sheet.waitForFunction(() => document.querySelector('#status').textContent !== '준비 중');
      const q = structuredClone(examples.questions[0]);
      const fig = q.blocks.find(b => b.kind === 'figure'); fig.figure = { name: '시험 그림.png', data: PNG };
      ['ㄱ', 'ㄷ', 'ㄱ, ㄴ', 'ㄴ, ㄷ', 'ㄱ, ㄴ, ㄷ'].forEach((t, i) => { q.choices[i].text = t; });
      await sheet.setInputFiles('#excel-file', { name: 'tile.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: examples.format, questions: [q], documents: [] })) });
      await sheet.waitForSelector('#import-dialog[open]'); await sheet.evaluate(() => { const u = document.querySelector('input[name="import-mode"][value="update"]'); if (u) u.checked = true; }); await sheet.click('#apply-import');
      await sheet.waitForSelector(`[data-open-card="${q.id}"]`); await sheet.evaluate(id => document.querySelector(`[data-open-card="${id}"]`).click(), q.id);
      // ① 합답형 선지 칸: 넓은 화면·좁은 화면 모두 한 줄로 칸 안에
      await sheet.waitForSelector('.cv-combos .combo-row .eq-ce');
      const combos = () => sheet.evaluate(() => [...document.querySelectorAll('.cv-combos .combo-row .eq-ce')].map(ce => {
        const r = ce.getBoundingClientRect(), row = ce.closest('.combo-row').getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(ce);
        const lines = new Set([...range.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))).size;
        return { text: ce.textContent, over: ce.scrollWidth - ce.clientWidth, lines, inside: r.top >= row.top - 1 && r.bottom <= row.bottom + 1 };
      }));
      for (const width of [1600, 1100, 900]) {
        await page.setViewportSize({ width, height: 1100 }); await page.waitForTimeout(400);
        for (const c of await combos()) {
          assert.ok(c.over <= 1, `${name} ${width}px: 「${c.text}」 칸 안에 (넘침 ${c.over}px)`);
          assert.ok(c.lines <= 1, `${name} ${width}px: 「${c.text}」 한 줄 (${c.lines}줄)`);
          assert.ok(c.inside, `${name} ${width}px: 「${c.text}」 칸 위·아래로 삐져나오지 않음`);
        }
      }
      await page.setViewportSize({ width: 1600, height: 1100 }); await page.waitForTimeout(300);
      const tile = `.cv-tile[data-cvtile="${fig.id}"]`;
      await sheet.waitForSelector(`${tile} .pic img`);
      const tiles = () => sheet.evaluate(() => document.querySelectorAll('.cv-tile[data-cvtile]').length);
      const count = await tiles();
      // 칸 고르기 → Delete
      await sheet.locator(`${tile} .pic`).click();
      await sheet.waitForSelector(`${tile}.is-target`);
      await sheet.evaluate(() => document.activeElement?.blur?.());
      await page.keyboard.press('Delete');
      await sheet.waitForFunction(s => !document.querySelector(`${s} .pic img`), tile);
      assert.ok(await sheet.$(tile), `${name}: Delete 뒤에도 칸은 남는다`);
      assert.equal(await tiles(), count, `${name}: 칸 수 그대로`);
      // 11-20(MISC172): 예전엔 0.3초 뒤 자동 저장 안내(「저장됨」·「저장 중…」)가 이 안내를 덮어 읽기 전에 사라졌다.
      // 이제 동작 안내는 2.5초 붙들리므로, 자동 저장이 한 번 돈 뒤(1초)에도 그대로 보여야 하고, 그 뒤엔 기다리던 안내(저장됨 등)로 넘어간다.
      assert.match(await sheet.locator('#status').textContent(), /그림을 비웠습니다/, `${name}: 비웠다는 안내`);
      await page.waitForTimeout(1000);
      assert.match(await sheet.locator('#status').textContent(), /그림을 비웠습니다/, `${name}: 1초 뒤에도 안내가 남는다(자동 저장이 덮지 않음)`);
      await sheet.waitForFunction(() => !/그림을 비웠습니다/.test(document.querySelector('#status').textContent), null, { timeout: 15000 });
      // ⌘Z(윈도우 Ctrl+Z)로 그림이 돌아온다
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
      await sheet.waitForSelector(`${tile} .pic img`);
      // 휴지통 단추는 칸째 지운다.
      // 11-19(CI 68줄): locator.evaluate는 단추를 찾은 뒤 따로 한 번 더 오가며 누른다. ⌘Z 뒤 카드가 한 번 더 다시 그려지면
      // 그 사이 단추가 문서에서 떨어져 나가, 떨어진 단추를 누르니 아무 일도 없이 60초를 기다렸다(느린 Chromium에서 재현·확인).
      // 찾기와 누르기를 한 번의 실행 안에서 해 지금 화면에 붙어 있는 단추를 누른다.
      assert.ok(await sheet.evaluate(s => { const b = document.querySelector(`${s} [data-cvslot-act="remove"]`); if (!b) return false; b.click(); return true; }, tile), `${name}: 휴지통 단추가 화면에 있다`);
      await sheet.waitForFunction(s => !document.querySelector(s), tile);
      assert.equal(await tiles(), count - 1, `${name}: 휴지통 단추는 칸째 지운다`);
      assert.deepEqual(errors, [], `${name}: 페이지 오류 없음`);
      console.log(`${name}: 합답형 선지 칸·자료 칸 Delete 통과`);
    } finally { await browser.close(); }
  }
});
