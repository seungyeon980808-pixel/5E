// 1.7.1 승인 시안(UI/팔레트막대-파일단추.html, 11-17 결정): 5E_hwp 조각 편집 막대가 맨 위 줄의 「파일」·모드 탭을 덮지 않는다.
// 넓은 창(1440) = 맨 위 줄 안, 모드 탭과 「파일」 사이. 좁은 창(1100) = 맨 위 줄 바로 아래 한 줄(종이를 덮지 않음).
// 두 폭 모두 조각 편집 중에 「파일」을 마우스로 눌러 메뉴가 열리는지, 창 폭을 바꾸면 자리를 다시 고르는지 본다.
// 실행: node tests/manual/ui-palette-content-bar-browser.cjs (BROWSER_ENGINE=chromium|webkit 로 하나만)
const test = require('node:test'), assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('../helpers/rhwp-exam.cjs');

const startContentEdit = async page => {
  // 「돌아가기」는 팔레트 창(템플릿)을 다시 열어 둔다 — 그때는 바로 조각을 고른다.
  if (!(await page.locator('#palette-manager').count())) await page.getByRole('button', { name: '팔레트와 물감 설정', exact: true }).click();
  await page.locator('[data-category="템플릿"][data-palette-action]').click();
  await page.locator('[data-item]').first().click();
  await page.locator('[data-palette-action="item-content"]').click();
  await page.locator('[data-palette-action="content-save"]').waitFor();
  await h.idle(page);
};
const geometry = page => page.evaluate(() => {
  const box = el => el.getBoundingClientRect().toJSON();
  const bar = document.querySelector('.palette-content-edit'), top = document.querySelector('#rhwp-exam-workspace .exam-topbar');
  // 맨 위 줄에서 누를 수 있는 것: 모드 탭 단추, 파일·구조 잠금·버그·닫기
  const targets = [...top.querySelectorAll('.exam-modes button, .exam-actions > .exam-menu > button, .exam-actions > button, .exam-actions > a')]
    .filter(el => el.getClientRects().length)
    .map(el => { const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { name: (el.textContent || el.getAttribute('aria-label') || '').trim(), box: r.toJSON(), reachable: el === hit || el.contains(hit) }; });
  const body = document.querySelector('#rhwp-exam-workspace .exam-body');
  return { bar: box(bar), below: bar.classList.contains('is-below'), top: box(top), body: box(body), targets };
});
const overlaps = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
const check = (g, wide, label) => {
  assert.equal(g.below, !wide, `${label}: 자리(넓으면 맨 위 줄 안, 좁으면 아래 한 줄)`);
  for (const t of g.targets) {
    assert.ok(!overlaps(g.bar, t.box), `${label}: 막대가 「${t.name}」과 겹침`);
    assert.ok(t.reachable, `${label}: 「${t.name}」 한가운데가 다른 것에 가려짐`);
  }
  assert.ok(g.targets.some(t => t.name.startsWith('파일')), `${label}: 파일 단추를 찾지 못함`);
  assert.ok(g.targets.filter(t => ['기본', '집중', '없음'].includes(t.name)).length === 3, `${label}: 모드 탭 3개`);
  if (wide) {
    assert.ok(g.bar.top >= g.top.top && g.bar.bottom <= g.top.bottom + 0.5, `${label}: 막대가 맨 위 줄 높이 안`);
    const file = g.targets.find(t => t.name.startsWith('파일')).box;
    assert.ok(g.bar.right <= file.left && file.left - g.bar.right <= 30, `${label}: 막대가 「파일」 바로 왼쪽 (${g.bar.right} / ${file.left})`);
  } else {
    assert.ok(Math.abs(g.bar.top - g.top.bottom) <= 1, `${label}: 막대가 맨 위 줄 바로 아래 (${g.bar.top} / ${g.top.bottom})`);
    assert.ok(g.body.top >= g.bar.bottom - 0.5, `${label}: 막대가 종이 칸을 덮지 않음`);
    assert.ok(g.bar.height <= 50, `${label}: 한 줄 (${g.bar.height})`);
  }
};
const clickFile = async (page, label) => {
  await page.locator('[data-exam-menu="file"]').click({ timeout: 3000 }); // 실제 마우스(가리면 Playwright가 실패)
  await page.waitForFunction(() => document.querySelector('[data-exam-menu="file"]')?.getAttribute('aria-expanded') === 'true', null, { timeout: 3000 });
  assert.equal(await page.locator('#exam-file-menu').isVisible(), true, `${label}: 파일 메뉴`);
  // 펼친 메뉴 항목도 막대 밑에 깔리지 않는다(좁은 창에서 막대가 메뉴 위에 그려지던 것)
  const hidden = await page.evaluate(() => [...document.querySelectorAll('#exam-file-menu [role="menuitem"]')].filter(el => el.getClientRects().length)
    .filter(el => { const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.left + 12, r.top + r.height / 2); return !(el === hit || el.contains(hit)); })
    .map(el => el.textContent.trim()));
  assert.deepEqual(hidden, [], `${label}: 가려진 파일 메뉴 항목`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('[data-exam-menu="file"]')?.getAttribute('aria-expanded') !== 'true', null, { timeout: 3000 });
};

for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([k]) => !process.env.BROWSER_ENGINE || k === process.env.BROWSER_ENGINE)) test(`${name}: 조각 편집 중에도 「파일」·모드 탭을 누를 수 있음`, async t => {
  await h.withServer(async origin => {
    const browser = await engine.launch(); t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await h.navigate(page, origin + '/?mode=pro&mobile=0&exam=1'); await h.ready(page);
    await page.waitForSelector('#exam-palette [data-block]'); await h.idle(page);

    // 넓은 창: 맨 위 줄 안
    await startContentEdit(page);
    check(await geometry(page), true, '1440');
    await clickFile(page, '1440');
    assert.equal(await page.evaluate(() => window.fiveEHwpPalette.contentEditing), true, '파일 메뉴를 여닫아도 조각 편집은 그대로');
    // 편집 중 창을 좁히면 아래 한 줄로, 다시 넓히면 맨 위 줄로
    await page.setViewportSize({ width: 1100, height: 900 }); await page.waitForTimeout(300);
    check(await geometry(page), false, '1440→1100');
    await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(300);
    check(await geometry(page), true, '1100→1440');
    await page.locator('[data-palette-action="content-cancel"]').click();
    await page.waitForFunction(() => !window.fiveEHwpPalette.contentEditing, null, { timeout: 15000 });
    assert.equal(await page.locator('.palette-content-edit').count(), 0);

    // 좁은 창에서 처음 시작: 맨 위 줄 바로 아래 한 줄
    await page.setViewportSize({ width: 1100, height: 900 }); await page.waitForTimeout(300);
    await startContentEdit(page);
    check(await geometry(page), false, '1100');
    await clickFile(page, '1100');
    // 모드 탭도 실제로 눌림
    await page.locator('.exam-modes button', { hasText: '기본' }).click({ timeout: 3000 });
    await page.locator('.exam-modes button', { hasText: '집중' }).click({ timeout: 3000 });
    check(await geometry(page), false, '1100 모드 바꾼 뒤');
    await page.locator('[data-palette-action="content-save"]').click();
    await page.waitForFunction(() => !window.fiveEHwpPalette.contentEditing, null, { timeout: 15000 });
    assert.equal(await page.locator('.palette-content-edit').count(), 0);
    assert.deepEqual(errors, []);
  });
});
