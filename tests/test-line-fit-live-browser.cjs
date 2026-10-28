'use strict';
// 자간 맞춤 실시간 반영(10-22 O1): ExamPool 조판(한글 창)에서 본문에 글을 더 치면 0.3초 뒤 그 문단을 커서 줄부터 다시 맞춘다.
// 글은 그대로이고, 자간이 기준(−5%)이 아닌 글자가 생긴다(줄 맞춤이 일함). 표 칸 안에서는 하지 않는다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const examples = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/exampool/sheet/examples.json'), 'utf8'));
process.env.APP_ENTRY = '/';
h.withServer(async origin => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } }); page.setDefaultTimeout(60000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await h.navigate(page, origin + '/?mode=pro&mobile=0'); await h.ready(page);
    await page.click('.app-switch-image [data-app-switch="exam"]');
    const frame = await page.waitForSelector('#exampool-sheet-workspace iframe'), sheet = await frame.contentFrame();
    await sheet.waitForSelector('.side [data-pool="drafting"]'); await sheet.waitForFunction(() => document.querySelector('#status').textContent !== '준비 중');
    const q = structuredClone(examples.questions[2]);
    await sheet.setInputFiles('#excel-file', { name: 'live.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: examples.format, questions: [q], documents: [] })) });
    await sheet.waitForSelector('#import-dialog[open]'); await sheet.evaluate(() => { const u = document.querySelector('input[name="import-mode"][value="update"]'); if (u) u.checked = true; }); await sheet.click('#apply-import');
    await sheet.waitForSelector(`[data-open-card="${q.id}"]`); await sheet.evaluate(id => document.querySelector(`[data-open-card="${id}"]`).click(), q.id);
    await sheet.waitForFunction(() => document.querySelector('#native-editor')?.dataset.ready === 'true' && document.querySelector('#preview-dialog')?.getAttribute('aria-busy') !== 'true');
    // 발문 문단 끝에 커서를 두고 글을 더 친다.
    const ask = await sheet.evaluate(() => { const st = document.querySelector('#native-editor iframe').contentWindow.rhwpStudio, d = st.plugins.deps.wasm.borrowDocumentHandle();
      for (let p = 0; p < d.getParagraphCount(0); p++) { const n = d.getParagraphLength(0, p); if (d.getTextRange(0, p, 0, Math.min(n, 6)).startsWith('시간에')) { st.plugins.deps.getInputHandler().cursor.moveTo({ sectionIndex: 0, paragraphIndex: p, charOffset: 4 }); return p; } } return -1; });
    assert.ok(ask >= 0, 'found the ask paragraph');
    await sheet.locator('#native-editor iframe').focus();
    const editor = sheet.frameLocator('#native-editor iframe');
    await editor.locator('body').press('End').catch(() => {});
    await sheet.evaluate(p => { const input = document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler(); input.cursor.moveTo({ sectionIndex: 0, paragraphIndex: p, charOffset: 4 }); input.textarea?.focus?.(); }, ask);
    // 자간 맞춤이 한 번의 되돌리기 단계(5e-exam:line-fit)로 기록되는지 엿본다.
    await sheet.evaluate(() => { const input = document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler(), run = input.executeOperation.bind(input); window.__ops = []; input.executeOperation = (op, ...a) => { window.__ops.push(op?.operationType); return run(op, ...a); }; });
    await page.keyboard.type(' 매우 빠르게');
    await sheet.waitForTimeout(1500);
    const after = await sheet.evaluate(p => { const d = document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.wasm.borrowDocumentHandle();
      const n = d.getParagraphLength(0, p), text = d.getTextRange(0, p, 0, n), spacings = new Set();
      for (let k = 0; k < n; k += 2) spacings.add(JSON.parse(d.getCharPropertiesAt(0, p, k)).spacings[0]);
      return { text, spacings: [...spacings] }; }, ask);
    assert.match(after.text, /매우 빠르게/, 'the typed text stays');
    const ops = await sheet.evaluate(() => window.__ops);
    assert.equal(ops.filter(o => o === '5e-exam:line-fit').length >= 1, true, `line fit ran once after typing paused: ${ops}`);
    assert.ok(ops.lastIndexOf('5e-exam:line-fit') === ops.length - 1 || !ops.slice(ops.lastIndexOf('5e-exam:line-fit') + 1).includes('5e-exam:line-fit'), 'not re-run by its own change');
    assert.deepEqual(errors, []);
    console.log('chromium: live line fit ok', JSON.stringify(after.spacings));
  } finally { await browser.close(); }
});
