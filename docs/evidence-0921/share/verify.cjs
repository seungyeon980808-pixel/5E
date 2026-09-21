// Run: PLAYWRIGHT_MODULE=/path/to/playwright SHARE_QA_BROWSER=chromium node docs/evidence-0921/share/verify.cjs
// Uses production markup, styles, fonts, and sharing module. Only the AI snapshot/API are fixtures.
const playwright = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const browserName = process.env.SHARE_QA_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const outputDir = process.env.SHARE_QA_OUTPUT || __dirname;

function servePreview(root) {
  return http.createServer((req, res) => {
    let file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    try {
      if (file.endsWith('/preview/')) file += 'index.html';
      const extension = path.extname(file);
      res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' })[extension] || 'text/html');
      let data = fs.readFileSync(file);
      if (file.endsWith('/preview/index.html')) data = data.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
      res.end(data);
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
}

async function installFixture(page) {
  await page.evaluate(async () => {
    window.shareFixture = { fail: false, calls: [], expiresInMs: 3600000 };
    window.fiveEDesktop = {
      sharingRequest: async ({ method }) => {
        window.shareFixture.calls.push(method);
        if (window.shareFixture.fail) throw Error('테스트 서버 응답 실패');
        if (method === 'POST') window.shareFixture.apiSuccessAt = performance.now();
        return method === 'POST'
          ? { id: 'a'.repeat(48), revokeKey: 'fixture-only', expiresAt: new Date(Date.now() + window.shareFixture.expiresInMs).toISOString() }
          : { ok: true };
      },
    };
    const { idbSet } = await import('/preview/js/idb-store.js?v=1.6.0-preview-labeler-0917-1111');
    await idbSet('sharing:latest-sent', null);
    const { initAiSharing } = await import('/preview/js/ai-sharing-ui.js');
    initAiSharing({
      sharingHasViewOnly: () => false,
      sharingSnapshot: async () => ({ workspaces: [{ tabs: [{ id: 'fixture', title: '검증용 빈 작업' }] }], activeWorkspace: 0 }),
    });
  });
}

(async () => {
  const root = path.resolve(__dirname, '../../..');
  fs.mkdirSync(outputDir, { recursive: true });
  const server = servePreview(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright[browserName].launch({ headless: true });
  const contextOptions = { viewport: { width: 1280, height: 900 } };
  if (browserName === 'chromium') contextOptions.permissions = ['clipboard-read', 'clipboard-write'];
  const context = await browser.newContext(contextOptions);
  await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const stateEvidence = {};
  const shot = name => page.screenshot({ path: path.join(outputDir, `${browserName}-${name}.png`), fullPage: false });

  try {
    await page.goto(`${base}/preview/`);
    await installFixture(page);
    await page.evaluate(() => document.getElementById('sharing-btn').click());
    await page.locator('.ai-sharing-dialog').waitFor();
    await page.evaluate(() => document.fonts.ready);

    const create = page.locator('[data-create]');
    assert.equal(await create.getAttribute('data-sparkle-state'), 'idle', 'share create CTA must start as an idle sparkle button');
    stateEvidence.idle = await create.evaluate(element => ({ animation: getComputedStyle(element).animationName, duration: getComputedStyle(element).animationDuration }));
    assert.equal(stateEvidence.idle.animation, 'sparkle-button-orbit');
    assert.equal(stateEvidence.idle.duration, '2.4s');
    await shot('01-idle');

    await page.evaluate(() => {
      const create = document.querySelector('[data-create]');
      const result = document.querySelector('[data-result]');
      window.shareFixture.transitions = [];
      window.shareFixture.transitionObserver = new MutationObserver(() => {
        window.shareFixture.transitions.push({
          at: performance.now(),
          state: create.dataset.sparkleState,
          resultVisible: !result.hidden,
        });
      });
      window.shareFixture.transitionObserver.observe(create, { attributes: true, attributeFilter: ['data-sparkle-state'] });
      window.shareFixture.transitionObserver.observe(result, { attributes: true, attributeFilter: ['hidden'] });
      window.shareFixture.activationAt = performance.now();
      create.click();
    });
    await page.waitForFunction(() => !document.querySelector('[data-result]').hidden);
    assert.equal(await create.getAttribute('data-sparkle-state'), 'activating', 'the result must reveal while the sparkle settles');
    stateEvidence.activating = await create.evaluate(element => ({
      animation: getComputedStyle(element).animationName,
      shimmer: getComputedStyle(element, '::after').animationDuration,
    }));
    assert.equal(stateEvidence.activating.animation, 'sparkle-button-settle');
    assert.equal(stateEvidence.activating.shimmer, '0.42s');
    await shot('02-activation');

    await page.waitForFunction(() => document.querySelector('[data-create]').dataset.sparkleState === 'settling');
    stateEvidence.settling = await create.evaluate(element => ({
      text: element.textContent,
      animation: getComputedStyle(element).animationName,
      border: getComputedStyle(element).borderTopColor,
    }));
    assert.equal(stateEvidence.settling.text, '✓ 링크 생성됨');
    assert.equal(stateEvidence.settling.animation, 'sparkle-button-emerald-settle');
    await page.waitForFunction(() => document.querySelector('[data-create]').dataset.sparkleState === 'complete');
    await page.waitForFunction(() => document.querySelector('[data-status]').textContent.includes('링크가 준비'));
    stateEvidence.complete = await create.evaluate(element => ({
      text: element.textContent,
      animation: getComputedStyle(element).animationName,
      border: getComputedStyle(element).borderTopColor,
    }));
    assert.deepEqual(stateEvidence.complete, { text: '✓ 링크 생성됨', animation: 'none', border: 'rgb(52, 211, 153)' });
    stateEvidence.timeline = await page.evaluate(() => {
      window.shareFixture.transitionObserver.disconnect();
      const activationAt = window.shareFixture.activationAt;
      const transitions = window.shareFixture.transitions;
      const first = state => transitions.find(entry => entry.state === state);
      const result = transitions.find(entry => entry.resultVisible);
      return {
        apiToResultMs: result.at - window.shareFixture.apiSuccessAt,
        activationToSettlingMs: first('settling').at - activationAt,
        settlingToCompleteMs: first('complete').at - first('settling').at,
        transitions,
      };
    });
    assert(stateEvidence.timeline.apiToResultMs >= 0 && stateEvidence.timeline.apiToResultMs < 80, 'the API result must reveal without waiting for the shimmer');
    assert(stateEvidence.timeline.activationToSettlingMs >= 390, 'the full 420ms shimmer must finish before emerald settling begins');
    assert(stateEvidence.timeline.activationToSettlingMs < 650, 'emerald settling should begin promptly after the 420ms shimmer');
    assert(stateEvidence.timeline.settlingToCompleteMs >= 160 && stateEvidence.timeline.settlingToCompleteMs < 300, 'the emerald transition must complete over 180ms');
    const link = await page.locator('[data-link]').inputValue();
    const expiry = await page.locator('[data-expiry]').textContent();
    await shot('03-complete');

    await page.click('[data-copy]');
    if (browserName === 'chromium') assert.equal(await page.evaluate(() => navigator.clipboard.readText()), link);
    assert.equal(await page.locator('[data-expiry]').textContent(), expiry, 'copy must not alter expiry');

    await page.click('[data-close]');
    await page.evaluate(() => document.getElementById('sharing-btn').click());
    await page.waitForFunction(() => !document.querySelector('[data-result]').hidden);
    assert.equal(await create.getAttribute('data-sparkle-state'), 'complete', 'reopening an active share must restore the complete state');
    await shot('04-reopened');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    stateEvidence.reducedMotion = await create.evaluate(element => ({ animation: getComputedStyle(element).animationName, state: element.dataset.sparkleState }));
    assert.deepEqual(stateEvidence.reducedMotion, { animation: 'none', state: 'complete' });
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    await page.evaluate(() => { window.shareFixture.fail = true; });
    await page.click('[data-create]');
    await page.waitForFunction(() => document.querySelector('[data-status]').textContent.includes('실패:'));
    assert.equal(await create.getAttribute('data-sparkle-state'), 'idle', 'a failed share must restore the idle sparkle button');
    await shot('05-failure');

    await page.evaluate(() => { window.shareFixture.fail = false; });
    await page.click('[data-revoke]');
    await page.waitForFunction(() => document.querySelector('[data-result]').hidden);
    assert.equal(await create.getAttribute('data-sparkle-state'), 'idle', 'revoking must restore the idle sparkle button');
    await shot('06-revoked');

    await page.evaluate(() => { window.shareFixture.expiresInMs = 90; });
    await page.click('[data-create]');
    await page.waitForFunction(() => !document.querySelector('[data-result]').hidden);
    await page.waitForFunction(() => document.querySelector('[data-result]').hidden);
    assert.equal(await create.getAttribute('data-sparkle-state'), 'idle', 'actual expiry must cancel sparkle timers and return to idle');
    assert.match(await page.locator('[data-status]').textContent(), /만료/);
    await shot('07-expired');

    await page.click('[data-close]');
    await page.evaluate(() => document.getElementById('sharing-btn').click());
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-result]').isVisible(), false);
    assert.equal(await create.getAttribute('data-sparkle-state'), 'idle', 'an expired or absent share must open in the idle state');

    await page.setViewportSize({ width: 375, height: 812 });
    const dialog = page.locator('.ai-sharing-dialog');
    const dialogBox = await dialog.boundingBox();
    const createBox = await create.boundingBox();
    assert(createBox.x >= dialogBox.x && createBox.x + createBox.width <= dialogBox.x + dialogBox.width, 'mobile sparkle button must remain inside the dialog');
    await shot('08-mobile-idle');
    assert.deepEqual(errors, []);

    const result = {
      source: 'actual preview/index.html + production CSS/fonts + ai-sharing-ui.js',
      api: 'local fixture only; no external requests',
      browser: browserName,
      checks: ['idle 2.4s blue orbit', 'activation full 420ms shimmer', 'API result reveal before visual settle', '180ms emerald static complete', 'active-share reopen', 'reduced motion', 'failure resets idle', 'revoke resets idle', 'actual expiry cancels timers and resets idle', 'mobile dialog bounds'],
      stateEvidence,
      calls: await page.evaluate(() => window.shareFixture.calls),
      errors,
    };
    fs.writeFileSync(path.join(outputDir, `${browserName}-results.json`), JSON.stringify(result, null, 2));
    console.log(`PASS sparkle sharing states (${browserName})`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
