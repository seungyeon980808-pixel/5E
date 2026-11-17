// 1.7.1 B6 막다른 경고: 5E_hwp에서 막히는 곳은 경고로 끝내지 않고 필요한 화면으로 데려가 이어서 하게 한다.
// ① 열린 시험지가 없을 때 — 「먼저 시험지를 여세요」만 띄우지 않고 파일 메뉴(새 시험지·열기)를 펼친다.
// ② 조각 편집 중에 새 시험지·열기 — 막지 않고 「수정 저장하고 계속 / 저장하지 않고 계속 / 취소」를 물은 뒤 이어서 한다.
const test = require('node:test'), assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');

const startContentEdit = async page => {
  await page.getByRole('button', { name: '팔레트와 물감 설정', exact: true }).click();
  await page.locator('[data-category="템플릿"][data-palette-action]').click();
  await page.locator('[data-item]').first().click();
  await page.locator('[data-palette-action="item-content"]').click();
  await page.locator('[data-palette-action="content-save"]').waitFor();
  await h.idle(page);
};
// 파일 단추를 직접 누른다(키보드로 고른 것과 같음). 1.7.1부터 조각 편집 막대가 맨 위 줄을 덮지 않아 마우스로도 누를 수 있다(ui-palette-content-bar 검사).
const fileAction = (page, action) => page.evaluate(action => {
  document.querySelector('[data-exam-menu="file"]').click();
  document.querySelector(`#exam-file-menu [data-exam-action="${action}"]`).click();
}, action);
const editing = page => page.evaluate(() => window.fiveEHwpPalette.contentEditing);
// 조각을 마치면 앞 문서(표시 글이 든)로 돌아갔다가, 이어서 「새 시험지」가 되면 표시 글이 사라진다 — 거기까지 기다린다.
const docText = () => String(window.fiveEHwpPalette.native.bridge().wasm.borrowDocumentHandle().getTextFileText());
const markDocument = page => page.evaluate(() => { const b = window.fiveEHwpPalette.native.bridge(); b.wasm.borrowDocumentHandle().insertText(0, 0, 0, '앞문서표시'); b.deps.eventBus.emit('document-changed'); });
const newDocumentReached = page => page.waitForFunction(text => !window.fiveEHwpPalette.contentEditing && !(0, eval)(text)().includes('앞문서표시') && document.querySelector('#rhwp-exam-workspace')?.getAttribute('aria-busy') === 'false', `(${docText})`, { timeout: 15000 });

for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([k]) => !process.env.BROWSER_ENGINE || k === process.env.BROWSER_ENGINE)) test(`${name}: 5E_hwp 막다른 경고 대신 이어서 하기(B6)`, async t => {
  await h.withServer(async origin => {
    const browser = await engine.launch(); t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await h.navigate(page, origin + '/?mode=pro&mobile=0&exam=1'); await h.ready(page);
    await page.waitForSelector('#exam-palette [data-block]'); await h.idle(page);

    // ① 문서가 없는 순간(편집기 입력이 없음)에 조판 점검을 누르면 → 파일 메뉴가 펼쳐지고 안내는 오류가 아니다.
    await page.evaluate(() => { const b = window.fiveEHwpPalette.native.bridge(); Object.defineProperty(b, 'input', { configurable: true, get: () => null }); window.__noDocBridge = b; });
    await page.evaluate(() => document.querySelector('[data-exam-fx="check"]').click());
    await page.waitForFunction(() => document.querySelector('[data-exam-menu="file"]')?.getAttribute('aria-expanded') === 'true', null, { timeout: 5000 });
    assert.equal(await page.locator('#exam-file-menu').isVisible(), true);
    assert.match(await page.locator('#exam-status').textContent(), /열린 시험지가 없습니다.*파일 메뉴/);
    assert.equal(await page.locator('#exam-status').getAttribute('data-error'), 'false');
    // 단축키 길(runDocumentAction)도 같은 안내로.
    await page.evaluate(() => document.querySelector('[data-exam-menu="file"]').click());
    const shortcut = await page.evaluate(async () => { const { runDocumentAction } = await import('/js/rhwp-exam-shortcuts.js'); let got = null; runDocumentAction(window.__noDocBridge, 'bold', { notify: (text, code) => { got = { text, code }; } }); return got; });
    assert.deepEqual(shortcut, { text: '먼저 시험지를 여세요.', code: 'no-document' });
    await page.evaluate(() => { delete window.__noDocBridge.input; });
    await page.keyboard.press('Escape');

    // ② 조각 편집 중 「새 시험지」 → 묻는 창. 「취소」면 조각 편집이 그대로.
    await markDocument(page);
    await startContentEdit(page);
    assert.equal(await editing(page), true);
    await fileAction(page, 'new');
    const dialog = page.locator('dialog.exam-content-edit-dialog');
    await dialog.waitFor();
    assert.deepEqual(await dialog.locator('button').allTextContents(), ['수정 저장하고 계속', '저장하지 않고 계속', '취소']);
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await editing(page), true);
    // 「저장하지 않고 계속」 → 조각 편집을 닫고(팔레트 창도 닫음) 새 시험지까지 이어서.
    
    await fileAction(page, 'new');
    await dialog.waitFor();
    await dialog.getByRole('button', { name: '저장하지 않고 계속', exact: true }).click();
    await newDocumentReached(page);
    assert.equal(await page.locator('.palette-content-edit').count(), 0);
    assert.equal(await page.locator('#palette-manager').count(), 0);
    // 「수정 저장하고 계속」 → 조각에 저장한 뒤 새 시험지.
    await markDocument(page);
    await startContentEdit(page);
    await page.evaluate(() => window.fiveEHwpPalette.native.insertChar('조각저장확인'));
    
    await fileAction(page, 'new');
    await dialog.waitFor();
    await dialog.getByRole('button', { name: '수정 저장하고 계속', exact: true }).click();
    await newDocumentReached(page);
    assert.equal(await page.locator('#palette-manager').count(), 0);
    assert.equal(await page.locator('#exam-status').getAttribute('data-error'), 'false', await page.locator('#exam-status').textContent());
    // 「한글 파일 열기…」: 파일 고르는 창은 누른 순간에만 열리므로, 조각을 마친 뒤 파일 메뉴를 다시 펼치고 그 항목에 커서를 둔다.
    await startContentEdit(page);
    await fileAction(page, 'open-hwp');
    await dialog.waitFor();
    await dialog.getByRole('button', { name: '저장하지 않고 계속', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-exam-menu="file"]')?.getAttribute('aria-expanded') === 'true', null, { timeout: 15000 });
    assert.equal(await editing(page), false);
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.examAction), 'open-hwp');
    assert.match(await page.locator('#exam-status').textContent(), /한글 파일 열기…」를 다시 누르면/);
    assert.deepEqual(errors, []);
  });
});
