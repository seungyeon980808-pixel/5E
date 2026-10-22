'use strict';

// 간격 보기·조절 + 구조 잠금 규칙(10-22 조판 기준 C-4):
// 1) 「간격 보기」를 켜면 요소 사이 초록 띠(지문↕자료·자료↕발문·발문↕〈보기〉·〈보기〉↕선지)와 단 양옆 보라 띠가 엔진이 그린 자리에 나온다.
// 2) 구조 잠금 중에는 보기만, 풀면 0.5mm씩 — 「이 문항만」은 블록 간격으로 저장되고 다시 조판한 간격이 실제로 넓어진다.
// 3) 「조판 기준에」를 고르면 수능 틀을 「수능 틀 (내 설정)」으로 복제해 이 문항에 쓰고, 메뉴에서 수능 틀로 되돌릴 수 있다.
// 4) 잠금 중 줄 간격·장평·쪽 설정 명령은 ExamPool 조판에서만 막히고, 자간은 그대로 된다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/feedback/parts/typeset-gaps');
const examples = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/exampool/sheet/examples.json'), 'utf8'));
process.env.APP_ENTRY = '/';

h.withServer(async origin => {
  fs.mkdirSync(evidence, { recursive: true });
  for (const [name, engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await h.navigate(page, origin + '/?mode=pro&mobile=0'); await h.ready(page);
      await page.click('.app-switch-image [data-app-switch="exam"]');
      const frame = await page.waitForSelector('#exampool-sheet-workspace iframe'), sheet = await frame.contentFrame();
      sheet.on?.('pageerror', e => errors.push(e.message));
      await sheet.waitForSelector('#side-new'); await sheet.waitForFunction(() => document.querySelector('#status').textContent !== '준비 중');
      await sheet.evaluate(() => localStorage.removeItem('5e.typeset.gaps'));
      const q = structuredClone(examples.questions[0]);
      await sheet.setInputFiles('#excel-file', { name: 'gaps.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: examples.format, questions: [q], documents: [] })) });
      await sheet.waitForSelector('#import-dialog[open]'); await sheet.evaluate(() => { const u = document.querySelector('input[name="import-mode"][value="update"]'); if (u) u.checked = true; }); await sheet.click('#apply-import');
      await sheet.waitForSelector(`[data-open-card="${q.id}"]`); await sheet.evaluate(id => document.querySelector(`[data-open-card="${id}"]`).click(), q.id);
      const ready = () => sheet.waitForFunction(() => document.querySelector('#native-editor')?.dataset.ready === 'true' && document.querySelector('#preview-dialog')?.getAttribute('aria-busy') !== 'true');
      await ready();
      const bands = () => sheet.evaluate(() => [...document.querySelectorAll('.ts-gap-band')].map(b => b.getAttribute('aria-label')));
      assert.equal(await sheet.locator('.ts-std').textContent(), '수능 틀 ▾');
      await sheet.click('[data-ts-gaps]');
      await sheet.waitForFunction(() => document.querySelectorAll('.ts-gap-band').length === 4);
      const labels = await bands();
      assert.deepEqual(labels.map(l => l.replace(/ [\d.]+mm$/, '')), ['지문 ↕ 자료', '자료 ↕ 발문', '발문 ↕ 〈보기〉', '〈보기〉 ↕ 선지'], `${name}: bands between the question elements`);
      assert.equal(await sheet.locator('.ts-gap-margin').count(), 2, `${name}: both column margins`);
      await page.screenshot({ path: path.join(evidence, `${name}-gaps.png`) });
      const measured = label => Number(label.match(/([\d.]+)mm$/)[1]);

      // 잠금 중: 보기만
      await sheet.click('.ts-gap-band >> nth=2');
      await sheet.waitForSelector('.ts-gap-pop:not([hidden])');
      assert.equal(await sheet.locator('.ts-gap-pop [data-gap-step]').count(), 0, `${name}: locked → view only`);
      assert.match(await sheet.locator('.ts-gap-pop').textContent(), /구조 잠금 중/);
      // 잠금 중 줄 간격 명령은 막히고 자간은 된다(ExamPool 조판만)
      const command = id => sheet.evaluate(id => { const input = document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler(); const r = input.dispatcher.dispatchWithResult(id); return r?.reason || 'ran'; }, id);
      assert.equal(await command('format:line-spacing-increase'), 'layout-locked', `${name}: line spacing is a layout change while locked`);
      assert.notEqual(await command('format:char-spacing-increase'), 'layout-locked', `${name}: letter spacing stays editable while locked`);
      await sheet.evaluate(() => document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().dispatcher.dispatchWithResult('format:char-spacing-decrease'));

      // 잠금 풀기 → 〈보기〉↕선지(선지 앞 간격)를 이 문항만 +0.5mm ×2: 보이는 간격이 약 1mm 늘어난다(0.5mm 단위로 정확)
      await sheet.click('#typeset-lock');
      await sheet.click('.ts-gap-pop [data-gap-close]');
      await sheet.click('.ts-gap-band >> nth=3');
      await sheet.waitForSelector('.ts-gap-pop [data-gap-step="0.5"]');
      const choicesBefore = measured((await bands())[3]);
      const step = async index => { const prev = JSON.stringify(await bands()); await sheet.click('.ts-gap-pop [data-gap-step="0.5"]');
        await sheet.waitForFunction(p => JSON.stringify([...document.querySelectorAll('.ts-gap-band')].map(b => b.getAttribute('aria-label'))) !== p, prev, { timeout: 20000 }); await ready();
        await sheet.waitForSelector('.ts-gap-pop [data-gap-step="0.5"]'); return measured((await bands())[index]); };
      const once = await step(3);
      assert.equal(await sheet.locator('#typeset-lock').getAttribute('aria-pressed'), 'false', `${name}: re-typesetting the same question keeps the lock the teacher chose`);
      const twice = await step(3);
      assert.ok(Math.abs(once - choicesBefore - 0.5) <= 0.25 && Math.abs(twice - choicesBefore - 1) <= 0.25, `${name}: 0.5mm steps are exact (${choicesBefore} → ${once} → ${twice})`);
      assert.match((await bands())[3], /이 문항|[\d.]+mm$/);
      assert.match(await sheet.locator('.ts-gap-band >> nth=3').textContent(), /이 문항/);
      // 조판 기준에: 수능 틀 복제
      await sheet.click('.ts-gap-pop [data-gap-close]');
      await sheet.click('.ts-gap-band >> nth=1');
      await sheet.waitForSelector('.ts-gap-pop input[value="std"]');
      await sheet.check('.ts-gap-pop input[value="std"]');
      await sheet.click('.ts-gap-pop [data-gap-step="0.5"]');
      await sheet.waitForFunction(() => document.querySelector('.ts-std')?.textContent === '수능 틀 (내 설정) ▾', null, { timeout: 20000 });
      await ready();
      // 메뉴로 수능 틀 되돌리기
      await sheet.click('.ts-std'); await sheet.waitForSelector('.ts-std-menu:not([hidden]) [data-std-pick]');
      assert.deepEqual(await sheet.locator('.ts-std-menu [data-std-pick]').allTextContents(), ['수능 틀', '수능 틀 (내 설정)']);
      await sheet.click('.ts-std-menu [data-std-pick="kice"]');
      await sheet.waitForFunction(() => document.querySelector('.ts-std')?.textContent === '수능 틀 ▾');
      await ready();
      assert.deepEqual(errors, [], `${name}: no page errors`);
      console.log(`${name}: typeset gaps ok`);
    } finally { await browser.close(); }
  }
});
