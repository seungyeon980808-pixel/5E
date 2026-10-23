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
      q.blocks.find(b => b.kind === 'text').text += ' 두 물체의 질량은 2kg이다.'; // 숫자·단위 띄어쓰기 점검용
      await sheet.setInputFiles('#excel-file', { name: 'gaps.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: examples.format, questions: [q], documents: [] })) });
      await sheet.waitForSelector('#import-dialog[open]'); await sheet.evaluate(() => { const u = document.querySelector('input[name="import-mode"][value="update"]'); if (u) u.checked = true; }); await sheet.click('#apply-import');
      await sheet.waitForSelector(`[data-open-card="${q.id}"]`); await sheet.evaluate(id => document.querySelector(`[data-open-card="${id}"]`).click(), q.id);
      const ready = () => sheet.waitForFunction(() => document.querySelector('#native-editor')?.dataset.ready === 'true' && document.querySelector('#preview-dialog')?.getAttribute('aria-busy') !== 'true');
      await ready();
      const bands = () => sheet.evaluate(() => [...document.querySelectorAll('.ts-gap-band:not(.inner)')].map(b => b.getAttribute('aria-label')));
      assert.equal(await sheet.locator('.ts-std').textContent(), '수능 틀 ▾');
      await sheet.waitForFunction(() => /숫자·단위 1곳/.test(document.querySelector('.ts-unit-chip')?.textContent || ''));
      assert.match(await sheet.locator('.ts-unit-chip').getAttribute('title'), /2kg/);
      // 10-23 B 다시 하기: 조판 간격은 「⚙ 조판 설정」 팝업에서만 바꾼다(입력할 때는 조판 변경 없음). 팝업 미리보기의 「간격 보기」로 요소 사이를 잰다.
      const popup = {
        open: async () => { if (!(await sheet.locator('.tsx-back:not([hidden])').count())) await sheet.click('#typeset-settings'); await sheet.waitForSelector('.tsx-sheet svg', { timeout: 30000 }); },
        gaps: () => sheet.evaluate(() => [...document.querySelectorAll('.tsx-gap')].map(g => parseFloat(g.dataset.mm))),
        waitGaps: prev => sheet.waitForFunction(p => JSON.stringify([...document.querySelectorAll('.tsx-gap')].map(g => g.dataset.mm)) !== p, prev, { timeout: 20000 }),
      };
      await popup.open();
      await sheet.click('.tsx-pop [data-view="gaps"]');
      await sheet.waitForFunction(() => document.querySelectorAll('.tsx-gap').length === 4);
      const before = await popup.gaps();
      assert.equal(before.length, 4, `${name}: bands between the question elements (지문↕자료·자료↕발문·발문↕〈보기〉·〈보기〉↕선지)`);
      await page.screenshot({ path: path.join(evidence, `${name}-gaps.png`) });

      // 구조 잠금(10-23부터 늘 켜짐): 줄 간격 명령은 막히고 자간은 된다(ExamPool 조판만)
      const command = id => sheet.evaluate(id => { const input = document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler(); const r = input.dispatcher.dispatchWithResult(id); return r?.reason || 'ran'; }, id);
      assert.equal(await command('format:line-spacing-increase'), 'layout-locked', `${name}: line spacing is a layout change while locked`);
      assert.notEqual(await command('format:char-spacing-increase'), 'layout-locked', `${name}: letter spacing stays editable while locked`);
      await sheet.evaluate(() => document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().dispatcher.dispatchWithResult('format:char-spacing-decrease'));

      // 선지 앞 간격 +1.0mm(초안) → 미리보기의 〈보기〉↕선지가 약 1mm 늘어난다(0.5mm 단위 두 번과 같음)
      await sheet.click('.tsx-pop [data-part="choices"]');
      let prev = JSON.stringify(await sheet.evaluate(() => [...document.querySelectorAll('.tsx-gap')].map(g => g.dataset.mm)));
      const field = sheet.locator('.tsx-pop input[data-p="gaps.choices"]');
      await field.fill('1'); await field.press('Enter'); await popup.waitGaps(prev);
      const after = await popup.gaps();
      assert.ok(Math.abs(after[3] - before[3] - 1) <= 0.25, `${name}: +1.0mm before the choices is exact (${before[3]} → ${after[3]})`);
      assert.ok(Math.abs(after[2] - before[2]) <= 0.15, `${name}: other gaps stay (${before[2]} → ${after[2]})`);
      // 적용 → 수능 틀을 복제한 「수능 틀 (내 설정)」이 모든 문항에
      await sheet.click('.tsx-pop [data-apply]');
      await sheet.waitForFunction(() => document.querySelector('.ts-std')?.textContent === '수능 틀 (내 설정) ▾', null, { timeout: 20000 });
      await ready();
      // 틀 고르기로 수능 틀 되돌리기
      await popup.open();
      assert.deepEqual(await sheet.locator('.tsx-pop [data-std-pick] option').allTextContents(), ['수능 틀', '수능 틀 (내 설정)']);
      await sheet.selectOption('.tsx-pop [data-std-pick]', 'kice');
      await sheet.waitForFunction(() => document.querySelector('.ts-std')?.textContent === '수능 틀 ▾');
      await ready();
      // 이 문항만 예외: 값은 이 문항만 쓰는 복사본에(틀 이름 「… · 1번만」)
      await popup.open();
      await sheet.click('.tsx-pop [data-part="choices"]');
      await sheet.click('.tsx-pop .tsx-exc');
      const f2 = sheet.locator('.tsx-pop input[data-p="gaps.choices"]'); await f2.fill('0.5'); await f2.press('Enter');
      assert.equal(await sheet.locator('.tsx-pop [data-apply]').textContent(), '이 문항에 적용');
      await sheet.click('.tsx-pop [data-apply]');
      await sheet.waitForFunction(() => /1번만 ▾$/.test(document.querySelector('.ts-std')?.textContent || ''), null, { timeout: 20000 });
      await ready();
      assert.deepEqual(errors, [], `${name}: no page errors`);
      console.log(`${name}: typeset gaps ok`);
    } finally { await browser.close(); }
  }
});
