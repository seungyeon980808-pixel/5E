'use strict';
// 1.7.2 X3: 기억에만 남겨 둔 설치판 지적(11-11~11-15)을 지금 코드에서 다시 확인하는 묶음 검사.
// ① 11-14 지적 1: 자료 칸을 지우면 남은 칸 이름이 (가)(나)…로 다시 매겨진다 — 셋 → 둘, 그리고 둘 → 하나(하나 남아도 「(나)」로 남지 않음).
// ② 11-14 지적 2: 「그림 넣기」 메뉴 항목 글(이름 + 설명 줄)이 단추 밖으로 넘쳐 다음 항목과 겹치지 않는다.
// ③ 11-14 지적 3: 빈 칸 「표」는 칸 아래 작은 격자 판만 — 옛 「자료 넣기」 창(#slot-dialog)이 열리지 않는다.
// ④ 11-14 지적 29: 넓은 카드에서도 자료 칸 그림이 칸 안에 다 보인다(아래가 잘리지 않음).
// ⑤ 11-13 지적 9: 보기 판정은 ㄱ·ㄴ·ㄷ 글자 단추(오른쪽 ○× 칸 없음).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const examples = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/exampool/sheet/examples.json'), 'utf8'));
process.env.APP_ENTRY = '/';

async function openSheet(page, origin) {
  await h.navigate(page, origin + '/?mode=pro&mobile=0'); await h.ready(page);
  await page.locator('.app-switch-image [data-app-switch="exam"]').evaluate(b => b.click());
  const frame = await page.waitForSelector('#exampool-sheet-workspace iframe'), sheet = await frame.contentFrame();
  await sheet.waitForSelector('.side [data-pool="drafting"]');
  await sheet.waitForFunction(() => document.querySelector('#status').textContent !== '준비 중');
  return sheet;
}
async function importAndOpen(sheet, questions) {
  await sheet.setInputFiles('#excel-file', { name: 'recheck.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: examples.format, questions, documents: [] })) });
  await sheet.waitForSelector('#import-dialog[open]');
  await sheet.evaluate(() => { const u = document.querySelector('input[name="import-mode"][value="update"]'); if (u) u.checked = true; });
  await sheet.click('#apply-import');
  for (const q of questions) await sheet.waitForSelector(`[data-open-card="${q.id}"]`);
}
async function openCard(sheet, id, tileId) {
  // 목록(출제 중)으로 돌아가서 연다. 고친 카드에서 다른 카드로 가면 확인 창이 뜨므로, 고치지 않는 카드(B)를 먼저 본다.
  await sheet.evaluate(() => document.querySelector('.side [data-pool="drafting"]').click());
  await sheet.waitForSelector(`[data-open-card="${id}"]`);
  await sheet.evaluate(i => document.querySelector(`[data-open-card="${i}"]`).click(), id);
  await sheet.waitForSelector(`.cv-tiles .cv-tile[data-cvtile="${tileId}"]`);
}
const caps = sheet => sheet.evaluate(() => [...document.querySelectorAll('.cv-tiles .cv-tile[data-cvtile] .cap b')].map(b => b.textContent.trim()));
const removeTile = (sheet, id) => sheet.locator(`.cv-tile[data-cvtile="${id}"] [data-cvslot-act="remove"]`).evaluate(b => b.click());

h.withServer(async origin => {
  for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([k]) => !process.env.BROWSER_ENGINE || k === process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      const sheet = await openSheet(page, origin);
      sheet.on?.('pageerror', e => errors.push(e.message));
      // 문항 A: (가)(나)(다) 빈 그림 칸 셋(예시 2번 문항에 칸 하나를 더함)
      const a = structuredClone(examples.questions[1]);
      const group = a.blocks.find(b => b.kind === 'group');
      const third = { ...structuredClone(a.blocks.find(b => b.label === '(나)')), id: 'x3-third-figure', label: '(다)' };
      a.blocks.splice(a.blocks.findIndex(b => b.label === '(나)') + 1, 0, third);
      const [ga, gb] = a.blocks.filter(b => b.parent === group.id);
      // 문항 B: 그림이 든 칸 하나(세로로 긴 그림) + 보기
      const b = structuredClone(examples.questions[0]);
      const tall = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 240; c.height = 720; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 240, 720); g.fillStyle = '#000'; g.fillRect(0, 680, 240, 40); return c.toDataURL('image/png'); });
      const fig = b.blocks.find(x => x.kind === 'figure'); fig.figure = { name: '긴 그림.png', data: tall };
      await importAndOpen(sheet, [a, b]);

      // ④ 넓은 카드에서 긴 그림이 칸 안에 다 보임 / ⑤ 보기 판정은 글자 단추
      await openCard(sheet, b.id, fig.id);
      const tile = `.cv-tile[data-cvtile="${fig.id}"]`;
      await sheet.waitForSelector(`${tile} .pic img`);
      for (const width of [1600, 2200]) {
        await page.setViewportSize({ width, height: 1100 }); await page.waitForTimeout(500);
        await sheet.waitForFunction(s => document.querySelector(`${s} .pic img`)?.complete, tile);
        const box = await sheet.evaluate(s => {
          const pic = document.querySelector(`${s} .pic`).getBoundingClientRect(), img = document.querySelector(`${s} .pic img`);
          const r = img.getBoundingClientRect(), fit = getComputedStyle(img).objectFit;
          // object-fit:contain이면 그려지는 그림은 img 상자 안에서 비율대로 줄어든다 — 그 실제 그림 높이로 본다.
          const scale = fit === 'contain' ? Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight) : r.width / img.naturalWidth;
          const drawnH = img.naturalHeight * scale, drawnTop = r.top + (fit === 'contain' ? (r.height - drawnH) / 2 : 0);
          return { picTop: pic.top, picBottom: pic.bottom, top: drawnTop, bottom: drawnTop + drawnH };
        }, tile);
        assert.ok(box.bottom <= box.picBottom + 1 && box.top >= box.picTop - 1, `${name} ${width}px: 그림이 칸 안에 다 보임(그림 ${Math.round(box.top)}~${Math.round(box.bottom)}, 칸 ${Math.round(box.picTop)}~${Math.round(box.picBottom)})`);
      }
      await page.setViewportSize({ width: 1600, height: 1100 });
      const bogi = await sheet.evaluate(() => ({ letters: document.querySelectorAll('.cv-tk[data-cvtruth-cycle]').length, ox: document.querySelectorAll('.cv-ox, [data-cvox]').length }));
      assert.ok(bogi.letters >= 1, `${name}: 보기 ㄱ·ㄴ·ㄷ 글자가 판정 단추`);
      assert.equal(bogi.ox, 0, `${name}: 오른쪽 ○× 칸 없음`);

      // ② 그림 넣기 메뉴: 항목마다 글이 단추 안에 있고 항목끼리 겹치지 않는다
      await openCard(sheet, a.id, ga.id);
      assert.deepEqual(await caps(sheet), ['(가)', '(나)', '(다)'], `${name}: 처음 이름`);
      await sheet.locator(`.cv-tile[data-cvtile="${ga.id}"] [data-cvslot-act="add-pic"]`).evaluate(x => x.click());
      await sheet.waitForSelector('.cv-tile-menu [data-tm]');
      const menu = await sheet.evaluate(() => [...document.querySelectorAll('.cv-tile-menu [data-tm]')].map(btn => {
        const r = btn.getBoundingClientRect(), inner = btn.querySelector('span').getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, innerBottom: inner.bottom, over: btn.scrollHeight - btn.clientHeight };
      }));
      assert.equal(menu.length, 2, `${name}: 메뉴 항목 둘`);
      for (const m of menu) {
        assert.ok(m.over <= 1, `${name}: 메뉴 글이 단추 밖으로 넘치지 않음(넘침 ${m.over}px)`);
        assert.ok(m.innerBottom <= m.bottom + 1, `${name}: 설명 줄이 단추 안`);
      }
      assert.ok(menu[0].bottom <= menu[1].top + 1, `${name}: 두 항목이 겹치지 않음`);
      await page.keyboard.press('Escape');
      await sheet.evaluate(() => document.querySelector('.cv-tile-menu')?.remove());

      // ③ 빈 칸 「표」: 작은 격자 판, 옛 「자료 넣기」 창 없음
      await sheet.locator(`.cv-tile[data-cvtile="${gb.id}"] [data-cvslot-act="to-table"]`).evaluate(x => x.click());
      await sheet.waitForSelector('.cv-table-grid');
      assert.equal(await sheet.evaluate(() => !!document.querySelector('#slot-dialog')?.open), false, `${name}: 옛 자료 넣기 창이 열리지 않음`);
      await sheet.evaluate(() => document.querySelector('.cv-table-grid')?.remove());

      // ① 이름 다시 매기기: (가)를 지우면 (가)(나), 하나 더 지우면 남은 하나가 (가)
      await removeTile(sheet, ga.id);
      await sheet.waitForFunction(id => !document.querySelector(`.cv-tile[data-cvtile="${id}"]`), ga.id);
      assert.deepEqual(await caps(sheet), ['(가)', '(나)'], `${name}: 셋 중 (가)를 지우면 (가)(나)`);
      await removeTile(sheet, gb.id);
      await sheet.waitForFunction(id => !document.querySelector(`.cv-tile[data-cvtile="${id}"]`), gb.id);
      assert.deepEqual(await caps(sheet), ['(가)'], `${name}: 둘 중 앞 칸을 지워도 남은 하나는 (가) — 「(나)」로 남지 않음`);

      assert.deepEqual(errors, [], `${name}: 페이지 오류 없음`);
      console.log(`${name}: 기억 지적 재확인(이름 다시 매기기·메뉴 겹침·표 격자·그림 잘림·보기 판정) 통과`);
    } finally { await browser.close(); }
  }
});
