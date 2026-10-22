const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');

async function scenario(engine, origin, surface) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await h.navigate(page, new URL(surface + '?mode=pro&mobile=0&exam=0', origin).href);
    await h.ready(page);
    await page.locator('#page-add').click();
    await page.locator('#page-add').click();
    const tabs = page.locator('.page-tab');
    const menu = page.getByRole('menu', { name: '페이지 관리' });
    const assertAnchor = async () => {
      await menu.waitFor();
      const bounds = await page.evaluate(() => {
        const menu = document.querySelector('.page-ctx-menu');
        const tab = document.querySelector('.page-tab.is-active');
        const rect = element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
        return { menu: rect(menu), tab: rect(tab), height: innerHeight, width: innerWidth,
          scroll: menu.scrollHeight, visible: menu.clientHeight,
          last: rect(menu.querySelector('button:last-child')) };
      });
      assert.ok(bounds.menu.bottom <= bounds.tab.top + 1 && bounds.tab.top - bounds.menu.bottom < 20,
        'page menu must open immediately above the current live tab: ' + JSON.stringify(bounds));
      assert.ok(bounds.menu.top >= 0 && bounds.menu.left >= 0 && bounds.menu.right <= bounds.width + 1);
      assert.ok(bounds.last.bottom <= bounds.menu.bottom + 1, 'delete action must remain visible');
      assert.ok(bounds.scroll <= bounds.visible + 1, 'full menu fits in this viewport');
    };
    // Switching pages replaces the tab DOM. The right-click handler must anchor
    // to the replacement, rather than reading a disconnected former tab.
    await tabs.first().click({ button: 'right' });
    await assertAnchor();
    assert.equal(await tabs.first().getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'hidden' });
    assert.equal(await tabs.first().evaluate(tab => document.activeElement === tab), true);

    await tabs.first().focus(); await page.keyboard.press('Enter');
    await assertAnchor();
    await menu.getByRole('menuitem', { name: '복제', exact: true }).click();
    assert.equal(await tabs.count(), 4);
    assert.match(await page.locator('.page-tab.is-active').textContent(), /페이지 1 복사/);

    // Repeat the inactive-tab path at a larger UI scale, then delete and undo.
    await page.locator('html').evaluate(el => el.style.setProperty('--ui-zoom', '1.4'));
    await tabs.last().click({ button: 'right' });
    await assertAnchor();
    await menu.getByRole('menuitem', { name: '삭제', exact: true }).click();
    await page.getByRole('button', { name: '삭제', exact: true }).click();
    assert.equal(await tabs.count(), 3);
    await page.keyboard.press('Meta+z');
    assert.equal(await tabs.count(), 4, 'deleted page is recoverable');
    assert.equal((await page.locator('.page-tab.is-active').textContent()).trim(), '페이지 3');
    assert.deepEqual(errors, []);
    console.log(engine.name() + ' ' + surface + ': inactive/active menu anchor, keyboard, scale, duplicate/delete/undo passed');
  } finally { await browser.close(); }
}
(async () => h.withServer(async origin => {
  for (const engine of [chromium,webkit].filter(e=>!process.env.BROWSER_ENGINE||e.name()===process.env.BROWSER_ENGINE)) for (const surface of ['/', '/preview/']) await scenario(engine, origin, surface);
}))().catch(error => { console.error(error); process.exitCode = 1; });
