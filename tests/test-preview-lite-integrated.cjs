const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const url = process.env.PREVIEW_URL || 'http://127.0.0.1:8798/preview/?mode=lite';
const evidence = process.env.EVIDENCE_DIR || '.omo/evidence/lite-persistent-four-pane-0924/integrated';
const fixture = path.resolve('preview/assets/exam-library/images/p1_2027_06_01.png');
const fixtureDataUrl = `data:image/png;base64,${fs.readFileSync(fixture).toString('base64')}`;
fs.mkdirSync(evidence, { recursive: true });

async function installTransport(context) {
  const state = { sends: [], delivered: false };
  await context.addInitScript(() => {
    localStorage.setItem('5e.tutorial.bannerSeen', 'true');
    localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
    localStorage.setItem('5e.preview:5e.desktopHandoff.v1', JSON.stringify({ dismissed: true, remindUntil: 0, installStarted: false }));
    sessionStorage.setItem('5e:web-ai-session', 'f'.repeat(64));
  });
  await context.route('**/api/**', async (route) => {
    const action = new URL(route.request().url()).pathname.split('/').pop();
    const request = route.request().postDataJSON();
    let result = {};
    if (action === 'bridge-status') result = { login: { loggedIn: true }, server: true };
    if (action === 'bridge-models') result = { data: [{
      model: 'gpt-5.6-sol', displayName: 'Controlled QA', supportedReasoningEfforts: ['medium'],
      defaultReasoningEffort: 'medium', serviceTiers: ['priority'], defaultServiceTier: 'priority',
    }] };
    if (action === 'bridge-account') result = { account: { name: 'Controlled QA' }, limits: {} };
    if (action === 'bridge-send') {
      state.sends.push(request);
      result = { turnId: 'lite-integrated-1', renderThreadId: 'lite-integrated-render-1' };
    }
    if (action === 'bridge-events') {
      const events = [];
      if (state.sends.length && !state.delivered) {
        state.delivered = true;
        const clientScope = state.sends[0].clientScope || '';
        events.push(
          { clientScope, method: 'item/completed', params: { turnId: 'lite-integrated-1', item: { type: 'imageGeneration', imageDataUrl: fixtureDataUrl } } },
          { clientScope, method: 'turn/completed', params: { turn: { id: 'lite-integrated-1', status: 'completed' } } },
        );
      }
      result = { cursor: state.delivered ? 1 : 0, events };
    }
    if (action === 'bridge-interrupt') result = { ok: true };
    await route.fulfill({ json: result });
  });
  return state;
}

async function run(engine) {
  const browser = await engine.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const transport = await installTransport(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(url);
    await page.locator('#ai-image-panel').waitFor({ state: 'visible' });
    await page.locator('.ai-result-pane [data-ai-empty] strong').filter({ hasText: '변환 결과 대기' }).waitFor();
    assert.equal(await page.locator('.ai-task-rail').isVisible(), true);
    assert.equal(await page.locator('.ai-original-pane').isVisible(), true);
    assert.equal(await page.locator('.ai-result-pane').isVisible(), true);
    assert.equal(await page.locator('.ai-conversation').isVisible(), true);
    assert.equal(await page.locator('#lite-ai-open').isVisible(), false, 'no separate AI entry screen');
    assert.equal(await page.locator('.ai-original-pane .ai-pane-metadata > strong').textContent(), '레퍼런스');
    assert.equal(await page.locator('.lite-source-header-actions button').count(), 3);
    assert.equal(await page.locator('.lite-ai-segment-group:visible').count(), 3);
    await page.locator('.ai-output-option-background [data-lite-ai-option="connected"]').click();
    assert.equal(await page.locator('[data-ai-background-policy]').inputValue(), 'connected');
    await page.locator('.ai-output-option-background [data-lite-ai-option="preserve"]').click();
    assert.equal(await page.locator('.ai-result-pane [data-ai-empty] strong').textContent(), '변환 결과 대기');
    assert.equal(await page.locator('.ai-result-pane [data-ai-add-file]').count(), 0);
    assert.equal(await page.locator('#lite-graph-open').evaluate((button) => button.parentElement.classList.contains('lite-dock-tools')), true);

    const equalPanes = await page.evaluate(() => {
      const source = document.querySelector('.ai-original-pane').getBoundingClientRect();
      const result = document.querySelector('.ai-result-pane').getBoundingClientRect();
      return Math.abs(source.width - result.width);
    });
    assert.ok(equalPanes <= 1, `reference/result width delta ${equalPanes}`);

    for (const name of ['workbench', 'reference', 'inspector']) {
      await page.locator(`[data-lite-pane-toggle="${name}"]`).click();
      assert.equal(await page.locator(`[data-lite-pane-restore="${name}"]`).isVisible(), true);
      await page.locator(`[data-lite-pane-restore="${name}"]`).click();
    }

    await page.locator('#ai-image-file-input').setInputFiles(fixture);
    await page.locator('[data-ai-reference-id]').waitFor();
    assert.equal(await page.locator('[data-ai-send]').isVisible(), true);
    await page.screenshot({ path: path.join(evidence, `${engine.name()}-four-pane-source.png`) });

    await page.locator('[data-ai-send]').click();
    await page.locator('[data-ai-insert-selected]:not([disabled])').waitFor({ timeout: 45000 });
    assert.equal(transport.sends.length, 1);
    const unexpectedOverlays = await page.locator('.modal-overlay:visible').evaluateAll((nodes) => nodes
      .filter((node) => node.id !== 'ai-image-panel')
      .map((node) => ({ id: node.id, text: node.textContent.trim().slice(0, 160) })));
    assert.deepEqual(unexpectedOverlays, [], `unexpected overlays before accepting result: ${JSON.stringify(unexpectedOverlays)}`);
    await page.locator('[data-ai-insert-selected]').click();
    await page.waitForFunction(() => document.documentElement.dataset.liteResultMode === 'edit', null, { timeout: 45000 });
    assert.equal(await page.locator('#ai-image-panel').isVisible(), true, 'persistent workspace remains visible');
    assert.equal(await page.locator('.lite-result-editor-slot #canvas').count(), 1);
    assert.equal(await page.locator('.lite-edit-inspector-slot #inspector').count(), 1);
    assert.equal(await page.locator('#scene image[data-id]').count(), 1);
    assert.equal(await page.locator('[data-lite-inspector-tab="edit"]').getAttribute('aria-pressed'), 'true');
    await page.screenshot({ path: path.join(evidence, `${engine.name()}-integrated-edit.png`) });

    const hitTwinBaseline = await page.locator('#canvas [data-ui="hit-twin"]').count();
    await page.locator('#lite-dock .tool-btn[data-tool="L"]').click();
    const canvas = await page.locator('#canvas').boundingBox();
    await page.mouse.click(canvas.x + canvas.width * 0.42, canvas.y + canvas.height * 0.45);
    await page.mouse.click(canvas.x + canvas.width * 0.62, canvas.y + canvas.height * 0.55);
    assert.equal(await page.locator('#canvas [data-ui="hit-twin"]').count(), hitTwinBaseline + 1);
    await page.keyboard.press('Delete');
    assert.equal(await page.locator('#canvas [data-ui="hit-twin"]').count(), hitTwinBaseline, 'persistent AI workspace does not block editor shortcuts');

    await page.locator('[data-lite-pane-toggle="workbench"]').click();
    await page.locator('[data-lite-pane-toggle="reference"]').click();
    assert.equal(await page.locator('.ai-task-rail').isVisible(), false);
    assert.equal(await page.locator('.ai-original-pane').isVisible(), false);
    assert.equal(await page.locator('.ai-result-pane').isVisible(), true);
    assert.equal(await page.locator('.ai-conversation').isVisible(), true);
    await page.screenshot({ path: path.join(evidence, `${engine.name()}-focused-edit.png`) });

    await page.locator('#mode-toggle-btn').click();
    assert.equal(await page.locator('#ai-image-panel').isVisible(), false);
    assert.equal(await page.locator('.panel-center #canvas').count(), 1);
    assert.equal(await page.locator('.panel-right #inspector').count(), 1);
    assert.deepEqual(errors, []);
    return { engine: engine.name(), sends: transport.sends.length, errors };
  } finally {
    await browser.close();
  }
}

(async () => {
  const report = [];
  for (const engine of [chromium, webkit]) report.push(await run(engine));
  fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  console.log('Lite persistent four-pane workspace, controlled conversion, integrated edit, collapse, shortcuts, and Pro return PASS');
})().catch((error) => { console.error(error); process.exitCode = 1; });
