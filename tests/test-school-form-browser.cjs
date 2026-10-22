'use strict';

// 학교 양식(한글 파일)에서 조판 기준 만들기(10-22 C-6): 「수능 틀 ▾」 메뉴 → 파일 → 한글 엔진으로 읽은 값 표 → 이름 붙여 저장 → 이 문항에 씀.
// 시험 파일은 사용자 파일 대신 같은 엔진으로 만든 B4 2단 양식(「1.」 문항 문단 함초롬돋움 10pt·줄 간격 150%)을 쓴다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/feedback/parts/school-form');
const examples = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/exampool/sheet/examples.json'), 'utf8'));
process.env.APP_ENTRY = '/';

h.withServer(async origin => {
  fs.mkdirSync(evidence, { recursive: true });
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
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
      const q = structuredClone(examples.questions[0]);
      await sheet.setInputFiles('#excel-file', { name: 'school.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: examples.format, questions: [q], documents: [] })) });
      await sheet.waitForSelector('#import-dialog[open]'); await sheet.evaluate(() => { const u = document.querySelector('input[name="import-mode"][value="update"]'); if (u) u.checked = true; }); await sheet.click('#apply-import');
      await sheet.waitForSelector(`[data-open-card="${q.id}"]`); await sheet.evaluate(id => document.querySelector(`[data-open-card="${id}"]`).click(), q.id);
      await sheet.waitForFunction(() => document.querySelector('#native-editor')?.dataset.ready === 'true' && document.querySelector('#preview-dialog')?.getAttribute('aria-busy') !== 'true');
      // 같은 엔진으로 학교 양식 같은 한글 파일을 만든다.
      const bytes = await sheet.evaluate(() => {
        const D = document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.wasm.borrowDocumentHandle().constructor, HU = 7200 / 25.4, d = D.createEmpty();
        d.createBlankDocument(); const pg = JSON.parse(d.getPageDef(0));
        Object.assign(pg, { width: Math.round(257 * HU), height: Math.round(364 * HU), marginLeft: Math.round(20 * HU), marginRight: Math.round(20 * HU), marginTop: Math.round(18 * HU), marginBottom: Math.round(18 * HU) }); d.setPageDef(0, JSON.stringify(pg));
        d.setColumnDef(0, 2, 0, true, Math.round(10 * HU));
        const para = t => `<p style="margin:0 0 6px;text-align:justify;line-height:150%"><span style="font-family:함초롬돋움;font-size:10pt">${t}</span></p>`;
        d.pasteHtml(0, 0, 0, '<div>' + para('1. 그림은 물체의 운동을 나타낸 것이다. 이에 대한 설명으로 옳은 것은?') + para('2. 다음은 실험 과정이다. 옳은 것만을 고른 것은?') + '</div>');
        const out = Array.from(d.exportHwpx()); d.free(); return out;
      });
      await sheet.setInputFiles('#school-file-input', { name: '○○고 중간고사.hwpx', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
      await sheet.waitForSelector('#school-dialog[open]');
      const rows = await sheet.$$eval('#school-rows tr', trs => trs.map(tr => [...tr.cells].map(c => c.childNodes[0]?.textContent.trim())));
      fs.writeFileSync(path.join(evidence, `${name}-rows.json`), JSON.stringify(rows, null, 1));
      const value = label => rows.find(r => r[0] === label)?.[1];
      assert.equal(value('용지'), 'B4'); assert.equal(value('단'), '2단'); assert.equal(value('단 간격'), '10mm'); assert.equal(value('여백 왼쪽'), '20mm');
      assert.equal(value('글꼴'), '함초롬돋움'); assert.equal(value('글자 크기'), '10pt');
      assert.equal(await sheet.inputValue('#school-name'), '○○고 중간고사');
      await page.screenshot({ path: path.join(evidence, `${name}-school-dialog.png`) });
      await sheet.click('#school-save');
      await sheet.waitForFunction(() => !document.querySelector('#school-dialog').open && document.querySelector('.ts-std')?.textContent === '○○고 중간고사 ▾', null, { timeout: 20000 });
      await sheet.waitForFunction(() => document.querySelector('#native-editor')?.dataset.ready === 'true' && document.querySelector('#preview-dialog')?.getAttribute('aria-busy') !== 'true');
      await sheet.click('.ts-std'); await sheet.waitForSelector('.ts-std-menu:not([hidden]) [data-std-pick]');
      assert.deepEqual(await sheet.locator('.ts-std-menu [data-std-pick]').allTextContents(), ['수능 틀', '○○고 중간고사']);
      await sheet.click('.ts-std-menu [data-std-pick="kice"]');
      await sheet.waitForFunction(() => document.querySelector('.ts-std')?.textContent === '수능 틀 ▾');
      assert.deepEqual(errors, [], `${name}: no page errors`);
      console.log(`${name}: school form ok`);
    } finally { await browser.close(); }
  }
});
