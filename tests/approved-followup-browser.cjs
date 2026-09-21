const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8767/preview/';
const evidenceDir = process.env.TASK4_EVIDENCE_DIR || '.omo/evidence/task-4';
fs.mkdirSync(evidenceDir, { recursive: true });
const tinyPng = path.join(evidenceDir, 'fixture.png');
fs.writeFileSync(tinyPng, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nqkAAAAASUVORK5CYII=', 'base64'));

const taskRows = page => page.locator('#ai-image-panel:not([hidden]) [data-ai-tab-list] > .ai-task-tab:not(.ai-task-add)');

async function addTask(page, method) {
  const before = await taskRows(page).count();
  const add = page.locator('#ai-image-panel:not([hidden]) [data-ai-task-add]');
  await add.waitFor({ state: 'attached' });
  await add.evaluate(element => { element.parentElement.scrollTop = element.parentElement.scrollHeight; });
  await add.waitFor({ state: 'visible' });
  if (method === 'click') await add.click();
  else {
    await add.focus();
    await page.keyboard.press(method);
  }
  await page.waitForFunction(expected => document.querySelectorAll('#ai-image-panel:not([hidden]) [data-ai-tab-list] > .ai-task-tab:not(.ai-task-add)').length === expected, before + 1);
  await page.locator('#ai-image-panel:not([hidden]) [data-ai-task-add]').waitFor({ state: 'attached' });
  assert.equal(await taskRows(page).count(), before + 1, `${method} must create exactly one task`);
}

(async () => {
  const results = [];
  for (const engineName of ['chromium', 'webkit']) {
    const browser = await playwright[engineName].launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 520 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.locator('.tut-welcome-overlay').evaluateAll(items => items.forEach(item => item.remove()));
    await page.evaluate(() => {
      window.fiveEWebAI.status = async () => ({ login: { loggedIn: true } });
      window.dispatchEvent(new Event('5e:web-ai-status'));
    });
    await page.waitForFunction(() => document.querySelector('.web-account-status')?.textContent.includes('연결됨'));
    await page.locator('#ai-image-install-open').click();
    await page.locator('#ai-image-panel').waitFor({ state: 'visible' });
    await page.locator('#ai-image-panel [data-ai-task-add]').waitFor();

    assert.equal(await page.locator('#ai-image-panel .ai-rail-heading [data-ai-tab-new]').count(), 0);
    assert.equal(await page.locator('#ai-image-panel .ai-rail-heading strong').textContent(), '작업');
    assert.equal(await page.locator('#ai-image-panel .ai-rail-heading [data-ai-tab-clear]').textContent(), '모두 지우기');
    assert.equal(await page.locator('#ai-image-panel [data-ai-tab-list][role], #ai-image-panel .ai-task-tab[role], #ai-image-panel .ai-task-tab[tabindex]').count(), 0, 'task containers must not override native button semantics');
    assert.equal(await page.locator('#ai-image-panel .ai-task-tab-select[aria-pressed]').count(), 1, 'task selection must use a dedicated sibling button');
    assert.equal(await page.locator('#ai-image-panel .ai-task-tab-select .ai-task-delete').count(), 0, 'task selection and deletion must be sibling buttons');

    for (let index = 0; index < 8; index += 1) await addTask(page, 'click');
    await addTask(page, 'Enter');
    await addTask(page, 'Space');
    await addTask(page, 'click');
    assert.equal(await taskRows(page).count(), 12);
    const taskSelects = page.locator('#ai-image-panel:not([hidden]) [data-ai-tab-list] > .ai-task-tab .ai-task-tab-select');
    await taskSelects.first().click();
    await page.waitForFunction(() => document.querySelector('#ai-image-panel:not([hidden]) [data-ai-tab-list] > .ai-task-tab .ai-task-tab-select')?.getAttribute('aria-pressed') === 'true');
    await taskSelects.nth(1).focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.querySelectorAll('#ai-image-panel:not([hidden]) [data-ai-tab-list] > .ai-task-tab .ai-task-tab-select')[1]?.getAttribute('aria-pressed') === 'true');

    const metrics = await page.evaluate(() => {
      const list = document.querySelector('#ai-image-panel [data-ai-tab-list]');
      const scroller = list.parentElement;
      const task = list.querySelector('.ai-task-tab:not(.ai-task-add)');
      const add = list.querySelector(':scope > .ai-task-add');
      const taskRect = task.getBoundingClientRect();
      const addRect = add.getBoundingClientRect();
      const taskStyle = getComputedStyle(task);
      const addStyle = getComputedStyle(add);
      return {
        isLast: add === list.lastElementChild,
        task: { width: taskRect.width, height: taskRect.height, padding: taskStyle.padding, radius: taskStyle.borderRadius },
        add: { width: addRect.width, height: addRect.height, padding: addStyle.padding, radius: addStyle.borderRadius },
        gap: getComputedStyle(list).rowGap,
      };
    });
    assert.equal(metrics.isLast, true);
    assert.ok(Math.abs(metrics.task.width - metrics.add.width) <= 1, JSON.stringify(metrics));
    assert.ok(Math.abs(metrics.task.height - metrics.add.height) <= 1, JSON.stringify(metrics));
    assert.equal(metrics.task.padding, metrics.add.padding);
    assert.equal(metrics.task.radius, metrics.add.radius);

    const headingBefore = await page.locator('#ai-image-panel .ai-rail-heading').boundingBox();
    const scroll = await page.locator('#ai-image-panel .ai-task-tabs').evaluate(element => {
      element.scrollTop = element.scrollHeight;
      return { top: element.scrollTop, height: element.clientHeight, scrollHeight: element.scrollHeight };
    });
    const headingAfter = await page.locator('#ai-image-panel .ai-rail-heading').boundingBox();
    assert.ok(scroll.scrollHeight > scroll.height && scroll.top > 0, JSON.stringify(scroll));
    assert.ok(Math.abs(headingBefore.y - headingAfter.y) <= 1, 'heading must remain fixed while the task list scrolls');

    await page.locator('#ai-image-panel [data-ai-tab-clear]').click();
    await page.getByRole('dialog', { name: '작업 모두 지우기' }).getByRole('button', { name: '취소' }).click();
    assert.equal(await taskRows(page).count(), 12, 'cancel must preserve every task');
    await page.locator('#ai-image-panel [data-ai-tab-clear]').click();
    await page.getByRole('dialog', { name: '작업 모두 지우기' }).locator('.ai-confirm-accept').click();
    await page.waitForFunction(() => document.querySelectorAll('#ai-image-panel [data-ai-tab-list] > .ai-task-tab:not(.ai-task-add)').length === 0);
    assert.equal(await page.locator('#ai-image-panel [data-ai-task-add]').count(), 1);

    await page.locator('#ai-image-panel [data-ai-source-file]').setInputFiles(tinyPng);
    await page.locator('#ai-image-panel [data-ai-layout-mode="source"]').click();
    await page.locator('#ai-image-panel [data-ai-reference-id]').waitFor();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#ai-image-panel [data-ai-reference-id] button[title="이미지 제거"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#ai-image-panel [data-ai-reference-id]').length === 0);
    await page.waitForTimeout(800);
    assert.equal(await page.locator('#ai-image-panel [data-ai-reference-id]').count(), 0);

    await page.reload();
    await page.locator('.tut-welcome-overlay').evaluateAll(items => items.forEach(item => item.remove()));
    await page.evaluate(() => {
      window.fiveEWebAI.status = async () => ({ login: { loggedIn: true } });
      window.dispatchEvent(new Event('5e:web-ai-status'));
    });
    await page.waitForFunction(() => document.querySelector('.web-account-status')?.textContent.includes('연결됨'));
    await page.locator('#ai-image-install-open').click();
    await page.locator('#ai-image-panel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#ai-image-panel [data-ai-reference-id]').count(), 0, 'removed attachment must stay removed after workspace restore');

    if (engineName === 'webkit') await page.screenshot({ path: `${evidenceDir}/task-4-ai-task-rail-webkit.png`, fullPage: true });
    assert.deepEqual(errors, []);
    results.push({ engine: engineName, taskCountBeforeClear: 12, taskCountAfterClear: 0, metrics, scroll, attachmentCountAfterRemove: 0, errors });
    await browser.close();
  }
  fs.writeFileSync(`${evidenceDir}/task-4-ai-task-rail.json`, JSON.stringify(results, null, 2));
  console.log('approved-followup-browser: task rail, keyboard creation, overflow, clear confirmation, attachment removal PASS');
})().catch(error => { console.error(error); process.exit(1); });
