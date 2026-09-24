const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const url = process.env.PREVIEW_URL || 'http://127.0.0.1:8800/preview/?mode=lite';
const evidence = process.env.EVIDENCE_DIR || '.omo/evidence/unified-lite-0922/final';
const fixture = path.resolve('preview/assets/exam-library/images/p1_2027_06_01.png');
const fixtureDataUrl = `data:image/png;base64,${fs.readFileSync(fixture).toString('base64')}`;
fs.mkdirSync(evidence, { recursive: true });

async function installTransport(context) {
  const state = { sends: [], delivered: new Set() };
  await context.addInitScript(() => {
    localStorage.setItem('5e.tutorial.bannerSeen', 'true');
    localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
    localStorage.setItem('5e.preview:5e.desktopHandoff.v1', JSON.stringify({ dismissed: true, remindUntil: 0, installStarted: false }));
    sessionStorage.setItem('5e:web-ai-session', 'f'.repeat(64));
  });
  await context.route('**/api/**', async route => {
    const action = new URL(route.request().url()).pathname.split('/').pop();
    const request = route.request().postDataJSON();
    let result = {};
    if (action === 'bridge-status') result = { login: { loggedIn: true }, server: true };
    if (action === 'bridge-models') result = { data: [{
      model: 'gpt-5.6-sol', displayName: 'Controlled QA', supportedReasoningEfforts: ['medium', 'high'],
      defaultReasoningEffort: 'medium', serviceTiers: ['priority'], defaultServiceTier: 'priority',
    }] };
    if (action === 'bridge-account') result = { account: { name: 'Controlled QA' }, limits: {} };
    if (action === 'bridge-send') {
      state.sends.push(request);
      result = { turnId: `lite-qa-${state.sends.length}`, renderThreadId: `lite-render-${state.sends.length}` };
    }
    if (action === 'bridge-events') {
      const index = state.sends.length;
      const events = [];
      if (index && !state.delivered.has(index)) {
        state.delivered.add(index);
        const clientScope = state.sends.at(-1).clientScope || '';
        events.push(
          { clientScope, method: 'item/completed', params: { turnId: `lite-qa-${index}`, item: { type: 'imageGeneration', imageDataUrl: fixtureDataUrl } } },
          { clientScope, method: 'turn/completed', params: { turn: { id: `lite-qa-${index}`, status: 'completed' } } },
        );
      }
      result = { cursor: state.delivered.size, events };
    }
    if (action === 'bridge-interrupt') result = { ok: true };
    await route.fulfill({ json: result });
  });
  return state;
}

const projection = page => page.locator('#canvas').evaluate(canvas => {
  const matrix = canvas.getScreenCTM();
  return { scale: matrix.a, x: matrix.e, y: matrix.f, viewBox: canvas.getAttribute('viewBox') };
});

(async () => {
  const report = [];
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
    const transport = await installTransport(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(url);
      await page.locator('#lite-dock').waitFor();
      await page.locator('#ai-image-panel').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#lite-stepbar').count(), 0);
      assert.equal(await page.locator('.lite-dock-tools .tool-btn:visible').count(), 7);
      assert.equal(await page.locator('#lite-save span').textContent(), '저장');
      assert.equal(await page.locator('.app-shell-header #lite-dock').count(), 1);
      for (const selector of ['#settings-menu-btn', '#file-menu-btn', '#fullscreen-toggle', '#theme-toggle', '.web-account-status']) {
        assert.equal(await page.locator(selector).isVisible(), false, `${selector} is hidden in Lite`);
      }
      assert.equal(await page.locator('#lite-reference-toggle').count(), 0);
      assert.equal(await page.locator('#ai-image-panel .ai-conversation').evaluate(e => e.inert), false);
      await page.locator('#lite-graph-open').click();
      assert.equal(await page.locator('#graph-modal-overlay').isVisible(), true);
      await page.screenshot({ path: path.join(evidence, `${engine.name()}-graph-popup.png`) });
      await page.keyboard.press('Escape');

      await page.locator('[data-lite-reference-source]').filter({ hasText: '라이브러리' }).click();
      await page.locator('[data-unilib-close]').waitFor({ state: 'visible', timeout: 20000 });
      await page.locator('[data-unilib-close]').click();
      await page.locator('[data-unilib-close]').waitFor({ state: 'hidden', timeout: 20000 });

      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.locator('[data-lite-reference-source]').filter({ hasText: '파일' }).click(),
      ]);
      await fileChooser.setFiles(fixture);
      await page.locator('#ai-image-panel [data-ai-reference-id]').waitFor();
      assert.equal(await page.locator('#ai-image-panel .ai-original-pane').isVisible(), true);
      assert.equal(await page.locator('#ai-image-panel .ai-result-pane').isVisible(), true);
      assert.equal(await page.locator('#ai-image-panel .ai-output-option-thickness').isVisible(), true);
      assert.equal(await page.locator('[data-ai-layout-mode="side-by-side"]').getAttribute('aria-pressed'), 'true');
      const paneLayout = await page.evaluate(() => {
        const box = selector => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width };
        };
        return { original: box('#ai-image-panel .ai-original-pane'), result: box('#ai-image-panel .ai-result-pane'), context: box('#ai-image-panel .ai-conversation') };
      });
      assert.ok(paneLayout.original.width >= 400 && paneLayout.context.width >= 240);
      assert.ok(Math.abs(paneLayout.original.width - paneLayout.result.width) <= 2);
      assert.ok(paneLayout.original.right <= paneLayout.result.left + 1);
      assert.ok(paneLayout.result.right <= paneLayout.context.left + 1);
      assert.equal(await page.locator('#lite-reference').isVisible(), false);
      assert.equal(await page.locator('#ai-image-panel .ai-rail-heading').getByText('작업', { exact: true }).isVisible(), true);
      const originalSource = await page.locator('#ai-image-panel [data-ai-attachment-list] img').first().getAttribute('src');
      const headings = await page.locator('#ai-image-panel .ai-pane-head').evaluateAll(nodes => nodes.map(e => e.getBoundingClientRect().bottom));
      assert.ok(Math.abs(headings[0] - headings[1]) < 2, 'source and result images begin at the same height');
      await page.screenshot({ path: path.join(evidence, `${engine.name()}-source.png`) });
      await page.setViewportSize({ width: 375, height: 900 });
      await page.waitForTimeout(250);
      assert.equal(await page.locator('#lite-save span').isVisible(), true);
      assert.equal(await page.locator('#lite-save').getAttribute('aria-label'), '저장');
      await page.locator('.lite-dock-tools [data-symbol="labeler"]').scrollIntoViewIfNeeded();
      const toolbarBounds = await page.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect();
        return {
          group: rect('.lite-dock-tools').right,
          label: rect('.lite-dock-tools [data-symbol="labeler"]').right,
          save: rect('#lite-save').left,
        };
      });
      assert.ok(toolbarBounds.label <= toolbarBounds.group && toolbarBounds.group < toolbarBounds.save);
      await page.screenshot({ path: path.join(evidence, `${engine.name()}-375-ai-source-open.png`) });
      assert.equal(await page.locator('#ai-image-panel .ai-conversation').isVisible(), true);
      assert.equal(await page.locator('#ai-image-panel .ai-conversation').evaluate(e => e.inert), false);
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.waitForTimeout(250);

      await page.locator('#ai-image-panel [data-ai-send]').click();
      await page.locator('#ai-image-panel [data-ai-insert-selected]:not([disabled])').waitFor({ timeout: 45000 });
      assert.equal(transport.sends.length, 1);
      assert.equal(await page.locator('#ai-image-panel .ai-generated-card').count(), 1);
      await page.screenshot({ path: path.join(evidence, `${engine.name()}-candidate-before-comment.png`) });
      await page.locator('#ai-image-panel [data-ai-comment-tool="point"]').click();
      const resultImage = page.locator('#ai-image-panel .ai-generated-card .ai-preview-stage img').first();
      const resultBox = await resultImage.boundingBox();
      await page.mouse.click(resultBox.x + resultBox.width * 0.58, resultBox.y + resultBox.height * 0.42);
      await page.locator('#ai-image-panel [data-ai-inline-editor]').last().fill('이 위치의 보조선을 더 얇게 해 주세요.');
      await page.locator('#ai-image-panel [data-ai-comment-tool="area"]').click();
      await page.mouse.move(resultBox.x + resultBox.width * 0.18, resultBox.y + resultBox.height * 0.2);
      await page.mouse.down();
      await page.mouse.move(resultBox.x + resultBox.width * 0.42, resultBox.y + resultBox.height * 0.48, { steps: 5 });
      await page.mouse.up();
      await page.locator('#ai-image-panel [data-ai-inline-editor]').last().fill('이 영역의 선 간격을 유지해 주세요.');
      assert.equal(await page.locator('#ai-image-panel [data-ai-comment-row]').count(), 2);
      await page.screenshot({ path: path.join(evidence, `${engine.name()}-review.png`) });
      await page.locator('#ai-image-panel [data-ai-comments-apply]').click();
      await page.waitForFunction(() => document.querySelectorAll('#ai-image-panel .ai-generated-card').length === 2, null, { timeout: 45000 });
      await page.locator('#ai-image-panel [data-ai-insert-selected]:not([disabled])').waitFor({ timeout: 45000 });
      assert.equal(transport.sends.length, 2);
      const revisionPayload = JSON.stringify(transport.sends[1]);
      assert.match(revisionPayload, /이 위치의 보조선을 더 얇게/);
      assert.match(revisionPayload, /이 영역의 선 간격을 유지/);
      assert.match(revisionPayload, /점 1 \(x=/);
      assert.match(revisionPayload, /영역 2 \(x=/);
      await page.screenshot({ path: path.join(evidence, `${engine.name()}-revised.png`) });
      await page.locator('#ai-image-panel [data-ai-insert-selected]').click();
      await page.locator('#canvas').waitFor({ state: 'visible', timeout: 45000 });
      assert.equal(await page.locator('#scene image[data-id]').count(), 1);
      assert.equal(await page.locator('#lite-reference.has-source').count(), 1);
      assert.equal(await page.locator('#lite-reference img').getAttribute('src'), originalSource);
      await page.waitForFunction(() => {
        const image = document.querySelector('#scene image[data-id]').getBoundingClientRect();
        const canvas = document.getElementById('canvas').getBoundingClientRect();
        return image.left >= canvas.left && image.right <= canvas.right && image.top >= canvas.top && image.bottom <= canvas.bottom;
      });
      await page.screenshot({ path: path.join(evidence, `${engine.name()}-accepted.png`) });

      const liteProjection = await projection(page);
      await page.locator('#mode-toggle-btn').click();
      assert.equal(await page.locator('#panel-left').isVisible(), true);
      await page.locator('#mode-toggle-btn').click();
      const roundtripProjection = await projection(page);
      assert.ok(Math.abs(roundtripProjection.x - liteProjection.x) < 1 && Math.abs(roundtripProjection.y - liteProjection.y) < 1,
        'Pro/Lite round trip keeps the accepted result canvas centered in its pane');
      await page.waitForFunction(() => {
        const image = document.querySelector('#scene image[data-id]').getBoundingClientRect();
        const canvas = document.getElementById('canvas').getBoundingClientRect();
        return image.left >= canvas.left && image.right <= canvas.right && image.top >= canvas.top && image.bottom <= canvas.bottom;
      });
      assert.deepEqual(errors, []);
      const loggedOut = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      await loggedOut.addInitScript(() => {
        localStorage.setItem('5e.tutorial.bannerSeen', 'true');
        localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
      });
      const loginPage = await loggedOut.newPage();
      await loginPage.goto(url);
      await loginPage.locator('#ai-image-panel').waitFor({ state: 'visible' });
      await loginPage.locator('#ai-image-file-input').setInputFiles(fixture);
      await loginPage.locator('[data-ai-reference-id]').waitFor();
      await loginPage.locator('[data-ai-send]').click();
      await loginPage.locator('dialog[open] [data-login-start-label]').waitFor();
      assert.match(await loginPage.locator('dialog[open]').textContent(), /ChatGPT로 로그인/);
      await loginPage.locator('dialog[open]').evaluate(async dialog => { await Promise.all(dialog.getAnimations().map(animation => animation.finished)); });
      await loginPage.screenshot({ path: path.join(evidence, `${engine.name()}-auth-required.png`) });
      await loggedOut.close();
      report.push({ engine: engine.name(), sends: transport.sends.length, commentsApplied: 2, sourceStable: true, graphPopup: true, proRoundTrip: true, errors });
    } finally {
      await browser.close();
    }
  }
  fs.writeFileSync(path.join(evidence, 'lite-unified-report.json'), JSON.stringify(report, null, 2));
  console.log('Lite unified source, controlled conversion, point/area revision, accept, graph popup, and Pro round trip PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
