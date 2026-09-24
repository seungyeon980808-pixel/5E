const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const url = process.env.PREVIEW_URL || 'http://127.0.0.1:8798/preview/?mode=lite';
const evidence = process.env.EVIDENCE_DIR || '.omo/evidence/lite-restored-workspace-0924';
fs.mkdirSync(evidence, { recursive: true });
const scope = '11111111-2222-4333-8444-555555555555';
const taskId = `${scope}:task-1`;
const secondaryScope = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const secondaryTaskId = `${secondaryScope}:task-1`;

async function seedRestoredWorkspace(page) {
  await page.evaluate(async ({ scope, taskId, secondaryScope, secondaryTaskId }) => {
    localStorage.setItem('5e.aiParallelWorkspaces.v1', JSON.stringify([secondaryScope, scope]));
    localStorage.setItem('5e.aiActiveTask.v1', JSON.stringify({ scope, taskId }));
    localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
    localStorage.setItem('5e.preview:5e.desktopHandoff.v1', JSON.stringify({ dismissed: true, remindUntil: 0, installStarted: false }));
    const seed = (workspaceScope, workspaceTaskId, title) => new Promise((resolve, reject) => {
      const request = indexedDB.open(`5e.preview:5e-ai-image-tasks-${workspaceScope}`, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('tasks')) db.createObjectStore('tasks', { keyPath: 'key' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('tasks', 'readwrite');
        tx.objectStore('tasks').put({
          key: 'workspace',
          tabs: [{ id: workspaceTaskId, title, attachments: [], generated: [], uiMessages: [], conversationMessages: [], workState: 'idle' }],
          activeTaskTabId: workspaceTaskId,
          taskTabSerial: 1,
          imageSerial: 0,
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
    await seed(scope, taskId, '복원된 교과서 작업');
    await seed(secondaryScope, secondaryTaskId, '다른 복원 작업');
  }, { scope, taskId, secondaryScope, secondaryTaskId });
}

async function assertEnhanced(page, label) {
  await page.locator('#ai-image-panel').waitFor({ state: 'visible' });
  await page.locator('#ai-image-panel [data-tab-id]').filter({ hasText: '복원된 교과서 작업' }).waitFor();
  assert.equal(await page.locator('#ai-image-panel .ai-original-pane .ai-pane-metadata > strong').textContent(), '레퍼런스', `${label}: restored source heading`);
  assert.equal(await page.locator('#ai-image-panel .lite-source-header-actions button:visible').count(), 3, `${label}: restored source actions`);
  assert.equal(await page.locator('#ai-image-panel [data-lite-pane-toggle]:visible').count(), 3, `${label}: restored pane toggles`);
  assert.equal(await page.locator('#ai-image-panel .lite-inspector-mode-tabs:visible').count(), 1, `${label}: restored inspector tabs`);
  assert.equal(await page.locator('#ai-image-panel .lite-ai-segment-group:visible').count(), 3, `${label}: restored option segments`);
  assert.equal(await page.locator('#ai-image-panel .lite-result-editor-slot').count(), 1, `${label}: restored editor slot`);
  assert.equal(await page.locator('#ai-image-panel .lite-edit-inspector-slot').count(), 1, `${label}: restored inspector slot`);
}

async function run(engine) {
  const browser = await engine.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url);
    await seedRestoredWorkspace(page);
    await page.reload();
    await assertEnhanced(page, `${engine.name()} reload`);
    await page.screenshot({ path: path.join(evidence, `${engine.name()}-restored-clone.png`) });

    await page.locator('#mode-toggle-btn').evaluate(button => button.click());
    assert.equal(await page.locator('#ai-image-panel').isVisible(), true, `${engine.name()}: Pro preserves the previously open workspace`);
    assert.equal(await page.locator('#ai-image-panel .lite-source-header-actions:visible').count(), 0, `${engine.name()}: Pro hides Lite source actions`);
    assert.equal(await page.locator('#ai-image-panel .ai-original-pane .ai-pane-metadata > strong').textContent(), '원본', `${engine.name()}: Pro restores source heading`);
    await page.locator('#mode-toggle-btn').evaluate(button => button.click());
    await assertEnhanced(page, `${engine.name()} Pro roundtrip`);

    const secondaryTask = page.locator(`#ai-image-panel [data-ai-workspace-link="${secondaryScope}"] .ai-task-tab-select`).first();
    assert.equal(await secondaryTask.count(), 1, `${engine.name()}: secondary restored workspace link`);
    await secondaryTask.click();
    await page.locator('#ai-image-panel [data-tab-id]').filter({ hasText: '다른 복원 작업' }).waitFor();
    assert.equal(await page.locator('#ai-image-panel .lite-source-header-actions button:visible').count(), 3, `${engine.name()}: activated workspace source actions`);
    await page.locator(`#ai-image-panel [data-ai-workspace-link="${scope}"] .ai-task-tab-select`).click();
    await assertEnhanced(page, `${engine.name()} activation roundtrip`);
    assert.deepEqual(errors, [], `${engine.name()}: page errors`);
    return { engine: engine.name(), errors, taskId, secondaryTaskId, activationRoundtrip: true };
  } finally {
    await browser.close();
  }
}

(async () => {
  const report = [];
  for (const engine of [chromium, webkit]) report.push(await run(engine));
  fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  console.log('Lite restored alternate workspace enhancement and Pro roundtrip PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
