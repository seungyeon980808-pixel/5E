// 교사 흐름: 5E 라이브러리 창에서 PDF 그림을 잘라 「보내기」(이미지 객체화 자리)로 ExamPool 문항 카드나 한글 시험지로 보낸다.
// 고정 교과서 PDF(teacher-flow 자료집)와 실제 pdf.js·실제 ExamPool 창을 그대로 쓴다.
const assert = require('node:assert/strict');
const flow = require('./helpers/teacher-flow.cjs');

async function openSend(page, ui) {
  await ui.locator('[data-unilib-crop-workbench]').click();
  await ui.locator('[data-unilib-crop]').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => !document.querySelector('.unified-library-overlay [data-unilib-send]').disabled, null, { timeout: 30_000 });
  const actions = await ui.locator('.unilib-actions > button').evaluateAll(list => list.filter(b => !b.hidden && getComputedStyle(b).display !== 'none').map(b => b.textContent.trim()));
  assert.deepEqual(actions, ['PDF에서 자르기', '보내기', 'AI 이미지 변환', '좌표/함수 생성'], '2×2: 「보내기」가 이미지 객체화 자리에');
  assert.equal(await ui.locator('[data-unilib-objectify]').count(), 0, '라이브러리 창에는 이미지 객체화가 없다');
  await ui.locator('[data-unilib-send]').click();
  const menu = await page.evaluate(() => {
    const b = document.querySelector('.unified-library-overlay [data-unilib-send]'), m = document.querySelector('.unified-library-overlay .unilib-send-menu');
    const br = b.getBoundingClientRect(), mr = m.getBoundingClientRect();
    return { hidden: m.hidden, expanded: b.getAttribute('aria-expanded'), items: [...m.querySelectorAll('[data-unilib-send-to]')].map(x => x.dataset.unilibSendTo + ':' + x.querySelector('span').textContent),
      left: Math.round(mr.left - br.left), right: Math.round(mr.right - br.right), gap: Math.round(br.top - mr.bottom), height: Math.round(br.height) };
  });
  assert.equal(menu.hidden, false); assert.equal(menu.expanded, 'true');
  assert.deepEqual(menu.items, ['hwp:한글 시험지로', 'exampool:ExamPool 문항 카드로']);
  assert.deepEqual([menu.left, menu.right, menu.gap, menu.height], [0, 0, 6, 36], '메뉴는 단추 바로 위 6px, 단추와 같은 폭');
}

flow.runEngines('library-send', {
  async run({ page, shot }) {
    // 1. ExamPool 문항 카드로: 문항 창이 열리고 왼쪽 라이브러리 칸 맨 위 「가져온 자료」 카드로 들어온다.
    let ui = await flow.cropTextbookFigure(page);
    await openSend(page, ui);
    await shot('1-send-menu');
    await page.keyboard.press('Escape');
    assert.equal(await ui.locator('.unilib-send-menu').isHidden(), true, 'Esc는 메뉴만 닫는다');
    assert.equal(await ui.locator('[data-unilib-send]').isVisible(), true, '라이브러리 창은 그대로');
    await ui.locator('[data-unilib-send]').click();
    await ui.locator('[data-unilib-send-to="exampool"]').click();
    await page.waitForFunction(() => document.querySelector('#exampool-sheet-workspace')?.hidden === false, null, { timeout: 60_000 });
    await page.waitForFunction(() => /5E 라이브러리에서 1개를 가져왔습니다/.test(document.querySelector('#exampool-sheet-workspace iframe')?.contentDocument?.querySelector('#status')?.textContent || ''), null, { timeout: 60_000 });
    const sheet = page.frames().find(f => f.url().includes('/assets/exampool/sheet/index.html'));
    assert.ok(sheet, 'ExamPool 문항 창');
    // 문항 카드를 열면 기출 탭 목록 맨 위에 가져온 자료가 있다.
    await sheet.click('#side-new'); await sheet.click('#new-dialog .nq-opt[data-step="form"][data-k="combo"]'); await sheet.click('#new-dialog .nq-opt[data-step="struct"][data-k="experiment"]'); await sheet.click('#new-dialog [data-nq="go"]');
    await sheet.waitForSelector('#card-view:not([hidden]) .cv-writer');
    await sheet.click('#card-view [data-cvtab="past"]');
    await sheet.waitForSelector('#card-view .past-list figure.past.pick', { timeout: 30_000 });
    assert.equal(await sheet.evaluate(() => document.querySelector('#card-view .past-list').firstElementChild.matches('figure.past.pick')), true, '보낸 그림이 첫 카드');
    await sheet.click('#card-view figure.past.pick [data-cvpick-slot]');
    await sheet.waitForFunction(() => [...document.querySelectorAll('#card-view .cv-writer img')].some(i => i.src.startsWith('data:image/')), null, { timeout: 30_000 });
    await shot('2-exampool-pick');
    await sheet.evaluate(() => window.parent.postMessage({ channel: '5e-question-sheet', action: 'close' }, location.origin));
    await page.waitForFunction(() => document.querySelector('#exampool-sheet-workspace')?.hidden === true);

    // 2. 한글 시험지로: 그림이 작업대에 들어가고 기존 「한글로 보내기」(영역 확인)로 이어진다.
    const before = await page.evaluate(() => document.querySelectorAll('#canvas image').length);
    // 라이브러리를 다시 열고 교과서 PDF 쪽을 고른다(쪽 그림도 보낼 수 있다 — 예전 객체화와 같은 조건).
    await page.locator('#exam-library-open').click();
    ui = page.locator('.unified-library-overlay').last();
    await ui.locator('[data-result-id*="teacher-flow-textbook"]').first().click();
    await page.waitForFunction(() => !document.querySelector('.unified-library-overlay [data-unilib-send]').disabled, null, { timeout: 30_000 });
    await ui.locator('[data-unilib-send]').click();
    await ui.locator('[data-unilib-send-to="hwp"]').click();
    await page.waitForFunction(() => !document.querySelector('.unified-library-overlay')?.classList.contains('open') || document.querySelector('.unified-library-overlay')?.hidden, null, { timeout: 30_000 }).catch(() => {});
    await page.waitForFunction(n => document.querySelectorAll('#canvas image').length > n, before, { timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('.exam-region-surface, [data-exam-region], .exam-edit-badge, #rhwp-exam-workspace:not([hidden])'), null, { timeout: 30_000 });
    // 라이브러리 창은 다 닫히고(투명) 「시험지에 보낼 영역」 고르기만 남는다.
    await page.waitForFunction(() => { const o = document.querySelector('.unified-library-overlay'); return !o || o.hidden || getComputedStyle(o).visibility === 'hidden' || getComputedStyle(o).display === 'none' || Number(getComputedStyle(o).opacity) === 0; }, null, { timeout: 5_000 });
    await shot('3-hwp-send');
    return {};
  },
}).then(() => console.log('교사 흐름: 라이브러리 「보내기」(ExamPool·한글) chromium·webkit 통과'))
  .catch(error => { console.error(error); process.exitCode = 1; });
