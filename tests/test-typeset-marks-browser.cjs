'use strict';

// 조판 부호(10-22 17번): ExamPool 조판 칸과 5E_hwp에서 같은 층이
// 1) 고정 띄어쓰기에 빨간 V, 둘째 줄이 생긴 내어쓰기 문단에 초록 선을 그리고,
// 2) 「조판 부호」 단추(기본 켜짐)로 끄면 사라지며 기억하고, 두 화면이 같은 설정을 쓰고,
// 3) 화면에만 있다 — 켜도 꺼도 내보내는 한글 파일 바이트가 같다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/feedback/parts/typeset-marks');
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
      await page.evaluate(() => localStorage.removeItem('5e.typeset.marks'));
      await page.click('.app-switch-image [data-app-switch="exam"]');
      const frame = await page.waitForSelector('#exampool-sheet-workspace iframe'), sheet = await frame.contentFrame();
      await sheet.waitForSelector('#side-new'); await sheet.waitForFunction(() => document.querySelector('#status').textContent !== '준비 중');
      const q = structuredClone(examples.questions[0]);
      await sheet.setInputFiles('#excel-file', { name: 'marks.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: examples.format, questions: [q], documents: [] })) });
      await sheet.waitForSelector('#import-dialog[open]'); await sheet.evaluate(() => { const u = document.querySelector('input[name="import-mode"][value="update"]'); if (u) u.checked = true; }); await sheet.click('#apply-import');
      await sheet.waitForSelector(`[data-open-card="${q.id}"]`); await sheet.evaluate(id => document.querySelector(`[data-open-card="${id}"]`).click(), q.id);
      await sheet.waitForFunction(() => document.querySelector('#native-editor')?.dataset.ready === 'true' && document.querySelector('#preview-dialog')?.getAttribute('aria-busy') !== 'true');
      // 「1. 」 뒤 보통 띄어쓰기를 고정 띄어쓰기로 바꾼다.
      const marks = () => sheet.evaluate(() => { const layer = document.querySelector('#native-editor iframe').contentDocument.querySelector('[data-exam-marks]');
        return { layer: !!layer, hidden: !!layer?.hidden, spaces: layer?.querySelectorAll('[data-mark="space"]').length || 0, indents: layer?.querySelectorAll('[data-mark="indent"]').length || 0,
          pressed: document.querySelector('.typeset-view-controls [data-exam-marks]')?.getAttribute('aria-pressed') }; });
      await sheet.evaluate(() => { const st = document.querySelector('#native-editor iframe').contentWindow.rhwpStudio, d = st.plugins.deps.wasm.borrowDocumentHandle();
        const t = d.getTextRange(0, 1, 0, 4), at = t.indexOf(' ', 2); d.deleteText(0, 1, at, 1); d.insertText(0, 1, at, ' '); st.plugins.deps.eventBus.emit('document-changed'); });
      await sheet.waitForFunction(() => document.querySelector('#native-editor iframe').contentDocument.querySelectorAll('[data-exam-marks] [data-mark="space"]').length === 1);
      let m = await marks();
      assert.equal(m.pressed, 'true', `${name}: marks are on by default`);
      assert.equal(m.spaces, 1, `${name}: one red V for the one fixed space`);
      assert.ok(m.indents >= 2, `${name}: green lines on wrapped hanging-indent paragraphs: ${m.indents}`);
      // 둘째 줄 시작이 초록 선 위에 온다(내어쓰기 맞음).
      const aligned = await sheet.evaluate(() => { const ifr = document.querySelector('#native-editor iframe'), d = ifr.contentWindow.rhwpStudio.plugins.deps.wasm.borrowDocumentHandle();
        const runs = JSON.parse(d.getPageTextLayout(0)).runs.filter(r => r.secIdx === 0 && r.paraIdx === 1 && !r.cellPath);
        // 줄 = 같은 높이의 글자 조각들(자간을 줄마다 다르게 맞추면 한 줄이 여러 조각이 된다) → 줄마다 가장 왼쪽 x
        const starts = [...runs.reduce((m, r) => m.set(Math.round(r.y), Math.min(m.get(Math.round(r.y)) ?? Infinity, r.x)), new Map())].sort((a, b) => a[0] - b[0]).map(([, x]) => x);
        return starts.length > 1 && starts.slice(1).every(x => Math.abs(x - starts[1]) < .5); });
      assert.ok(aligned, `${name}: wrapped lines of item 1 share one start`);
      const exportBytes = () => sheet.evaluate(async () => { const w = document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.wasm; const out = await w.exportHwpx(); const bytes = out instanceof Uint8Array ? out : new Uint8Array(out); let sum = 0; for (const b of bytes) sum = (sum * 31 + b) >>> 0; return `${bytes.length}:${sum}`; });
      const withMarks = await exportBytes();
      await sheet.waitForTimeout(800);
      const box = await sheet.locator('.cv-hwp-layer').boundingBox(), fr = await frame.boundingBox();
      await page.screenshot({ path: path.join(evidence, `${name}-exampool-marks.png`), clip: { x: fr.x + box.x, y: fr.y + box.y, width: box.width, height: Math.min(box.height, 700) } });

      // 끄기: 사라지고 기억, 내보내기 바이트는 같다.
      await sheet.evaluate(() => document.querySelector('.typeset-view-controls [data-exam-marks]').click()); // 10-23 B: 카드 조판 칸의 단추는 숨김(설정은 팝업) — 같은 명령, 단축키 ⌥⌘8은 아래에서
      await sheet.waitForFunction(() => document.querySelector('#native-editor iframe').contentDocument.querySelector('[data-exam-marks]').hidden);
      m = await marks();
      assert.equal(m.pressed, 'false'); assert.equal(await sheet.evaluate(() => localStorage.getItem('5e.typeset.marks')), 'off');
      assert.equal(await exportBytes(), withMarks, `${name}: marks are screen-only (HWPX bytes unchanged)`);
      await sheet.evaluate(() => document.querySelector('.typeset-view-controls [data-exam-marks]').click()); // 10-23 B: 카드 조판 칸의 단추는 숨김(설정은 팝업) — 같은 명령, 단축키 ⌥⌘8은 아래에서
      await sheet.waitForFunction(() => !document.querySelector('#native-editor iframe').contentDocument.querySelector('[data-exam-marks]').hidden);
      // 단축키 ⌥⌘8(윈도우 Ctrl+Alt+8): 편집기 안에서 눌러도 켜고 끈다. 브라우저 탭 전환 ⌘8과 겹치지 않는다.
      await sheet.locator('#native-editor iframe').click({ position: { x: 200, y: 160 } });
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Alt+Digit8' : 'Control+Alt+Digit8');
      await sheet.waitForFunction(() => document.querySelector('#native-editor iframe').contentDocument.querySelector('[data-exam-marks]').hidden && document.querySelector('.typeset-view-controls [data-exam-marks]').getAttribute('aria-pressed') === 'false');
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Alt+Digit8' : 'Control+Alt+Digit8');
      await sheet.waitForFunction(() => !document.querySelector('#native-editor iframe').contentDocument.querySelector('[data-exam-marks]').hidden);

      // 5E_hwp: 도구 줄의 같은 단추, 같은 설정
      await sheet.locator('.top [data-app-switch="hwp"]').click();
      await page.locator('#rhwp-exam-workspace').waitFor({ state: 'visible' }); await h.idle(page);
      if (await page.locator('#rhwp-exam-workspace').getAttribute('data-tool-mode') !== 'focus') await page.locator('[data-exam-mode="focus"]').click();
      const hwpButton = page.locator('.exam-inspector [data-exam-marks]');
      await hwpButton.waitFor();
      assert.equal(await hwpButton.getAttribute('aria-pressed'), 'true', `${name}: 5E_hwp shares the on setting`);
      await page.evaluate(() => { const b = window.fiveEHwpPalette.native.bridge(), d = b.wasm.borrowDocumentHandle(); d.insertText(0, 0, 0, '가 나'); b.deps.eventBus.emit('document-changed'); });
      await page.waitForFunction(() => document.querySelector('#exam-studio iframe')?.contentDocument?.querySelectorAll('[data-exam-marks] [data-mark="space"]').length >= 1);
      await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(evidence, `${name}-hwp-marks.png`) });
      await hwpButton.click();
      await page.waitForFunction(() => document.querySelector('#exam-studio iframe').contentDocument.querySelector('[data-exam-marks]').hidden);
      assert.equal(await hwpButton.getAttribute('aria-pressed'), 'false');
      await hwpButton.click();
      assert.deepEqual(errors, [], `${name}: no page errors`);
      console.log(`${name}: typeset marks ok`);
    } finally { await browser.close(); }
  }
});
