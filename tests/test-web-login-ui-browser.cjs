const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
let server, baseUrl, browser;

before(async () => {
  server = createServer(async (request, response) => {
    const target = new URL(request.url, 'http://localhost').pathname;
    const file = path.resolve(root, `.${target === '/' ? '/tests/fixtures/web-login-ui-fixture.html' : target}`);
    if (!file.startsWith(root)) { response.writeHead(403).end(); return; }
    try {
      const contentType = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
      response.writeHead(200, { 'content-type':contentType });
      response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless:true });
});

after(async () => {
  await browser?.close();
  server?.closeAllConnections();
  await new Promise(resolve => server?.close(resolve));
});

async function pageWithDialog() {
  const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
  await page.goto(baseUrl);
  await page.getByRole('button', { name:'AI 이미지 변환' }).click();
  await page.locator('.web-login-dialog[open]').waitFor();
  return page;
}

test('Test_copy_stages_authentication_when_clipboard_succeeds', async () => {
  // Given: an issued code in an isolated provider fixture.
  const page = await pageWithDialog();
  try {
    await page.evaluate(() => window.qaReady('FIRST-CODE'));
    const start = page.locator('[data-login-start]');
    // When: the code is copied successfully.
    await page.getByRole('button', { name:'복사' }).click();
    // Then: the copy state directs the next authentication action without opening it.
    assert.equal(await start.getAttribute('data-copy-ready'), 'true');
    assert.deepEqual(await page.evaluate(() => window.qaEvents), []);
  } finally { await page.close(); }
});

test('Test_copy_does_not_stage_authentication_when_clipboard_fails', async () => {
  // Given: clipboard access is denied by the isolated provider fixture.
  const page = await pageWithDialog();
  try {
    await page.evaluate(() => { window.qaReady('FIRST-CODE'); window.qaClipboardFails = true; });
    // When: the user tries to copy the code.
    await page.getByRole('button', { name:'복사' }).click();
    // Then: the next authentication action remains unstaged.
    assert.equal(await page.locator('[data-login-start]').getAttribute('data-copy-ready'), null);
  } finally { await page.close(); }
});

test('Test_new_code_resets_copy_stage_when_provider_reissues_code', async () => {
  // Given: a successfully copied old code.
  const page = await pageWithDialog();
  try {
    await page.evaluate(() => window.qaReady('OLD-CODE'));
    await page.getByRole('button', { name:'복사' }).click();
    // When: the provider issues a new code.
    await page.evaluate(() => window.qaReady('NEW-CODE'));
    // Then: copy feedback and the staged next step reset for the new code.
    assert.equal(await page.locator('[data-copy-code]').textContent(), '복사');
    assert.equal(await page.locator('[data-login-start]').getAttribute('data-copy-ready'), null);
  } finally { await page.close(); }
});

test('Test_authentication_stops_next_step_orbit_when_external_window_is_active', async () => {
  // Given: a copied code that has highlighted the next authentication action.
  const page = await pageWithDialog();
  try {
    await page.evaluate(() => window.qaReady('AUTH-CODE'));
    await page.getByRole('button', { name:'복사' }).click();
    // When: the isolated provider reports that its external window is authenticating.
    await page.evaluate(() => window.qaAuthenticating());
    // Then: the flow reports return-to-window guidance and removes the repeated-action cue.
    assert.equal(await page.locator('[data-login-start]').getAttribute('data-copy-ready'), null);
    assert.equal(await page.getByRole('button', { name:'인증 창으로 돌아가기' }).count(), 1);
  } finally { await page.close(); }
});

test('Test_copy_does_not_reactivate_authentication_orbit_when_external_window_is_active', async () => {
  // Given: the isolated provider has already opened its authentication window.
  const page = await pageWithDialog();
  try {
    await page.evaluate(() => { window.qaReady('ACTIVE-CODE'); window.qaAuthenticating(); });
    // When: the user copies the still-visible code again.
    await page.getByRole('button', { name:'복사' }).click();
    // Then: the external-authentication guidance remains the current stage without an orbiting next-step cue.
    assert.equal(await page.locator('[data-login-start]').getAttribute('data-copy-ready'), null);
    assert.equal(await page.getByRole('button', { name:'인증 창으로 돌아가기' }).count(), 1);
  } finally { await page.close(); }
});

test('Test_cancel_and_completion_keep_one_dialog_flow_when_waiting_or_connected', async () => {
  // Given: a waiting code dialog.
  const page = await pageWithDialog();
  try {
    await page.evaluate(() => window.qaReady('FLOW-CODE'));
    // When: the user cancels.
    await page.getByRole('button', { name:'나중에' }).click();
    // Then: the provider receives one cancellation and the dialog is closed.
    assert.deepEqual(await page.evaluate(() => window.qaEvents), ['cancel']);
    assert.equal(await page.locator('.web-login-dialog').evaluate(dialog => dialog.open), false);
    await page.getByRole('button', { name:'AI 이미지 변환' }).click();
    await page.evaluate(() => window.qaComplete());
    await page.getByText('AI가 준비되었습니다. 자동으로 편집기로 돌아갑니다.').waitFor();
    // When: the completion timer settles.
    await page.waitForFunction(() => !document.querySelector('.web-login-dialog').open, null, { timeout:2000 });
    // Then: there is no inspector-obscuring success toast and the dialog alone closes.
    assert.equal(await page.locator('.web-login-toast:not([hidden])').count(), 0);
  } finally { await page.close(); }
});

test('Test_connected_status_stays_in_inspector_utility_area_without_reopening_the_login_dialog', async () => {
  // Given: a completed isolated connection whose brief completion dialog has closed.
  const page = await pageWithDialog();
  try {
    await page.evaluate(() => window.qaComplete());
    await page.waitForFunction(() => !document.querySelector('.web-login-dialog').open, null, { timeout:2000 });
    // When: the persistent connected-status badge is clicked.
    await page.getByRole('button', { name:'ChatGPT 연결됨' }).click();
    // Then: its visible status remains in the inspector control strip and no empty guide opens.
    assert.equal(await page.locator('.panel-utility-bar-right > .web-account-status').count(), 1);
    assert.equal(await page.locator('.canvas-global-controls > .web-account-status').count(), 0);
    assert.equal(await page.locator('.web-login-dialog').evaluate(dialog => dialog.open), false);
  } finally { await page.close(); }
});

test('Test_unconnected_status_still_opens_the_login_dialog', async () => {
  // Given: an unconnected account represented by the same utility-area status control.
  const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
  try {
    await page.goto(baseUrl);
    // When: the account-status control is clicked before authentication.
    await page.getByRole('button', { name:'ChatGPT 연결', exact:true }).click();
    // Then: it opens the meaningful sign-in flow.
    await page.locator('.web-login-dialog[open]').waitFor();
  } finally { await page.close(); }
});

test('Test_library_ai_request_waits_for_login_and_resumes_with_its_original_payload', async () => {
  // Given: the library requests AI with selected references while the web account is disconnected.
  const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
  try {
    await page.goto(baseUrl);
    await page.evaluate(() => window.qaLoginUi.openAi({ source:'library', referenceCount:2 }));
    await page.locator('.web-login-dialog[open]').waitFor();
    assert.deepEqual(await page.evaluate(() => window.qaEvents), []);
    // When: login completes, the queued library action resumes after the completion dialog closes.
    await page.evaluate(() => window.qaComplete());
    await page.waitForFunction(() => window.qaEvents.includes('open-ai'), null, { timeout:2000 });
    // Then: no unauthenticated entry occurred and the original library context is preserved.
    assert.deepEqual(await page.evaluate(() => window.qaAiPayloads), [{ source:'library', referenceCount:2 }]);
  } finally { await page.close(); }
});

test('Test_narrow_inspector_uses_a_compact_visible_status_label', async () => {
  // Given: the real inspector's 215px width, which leaves one short slot beside three controls.
  const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
  try {
    await page.goto(baseUrl);
    // Then: the visible compact label retains ChatGPT and the dot retains status while accessibility keeps the full state.
    const compact = await page.locator('.web-account-status').evaluate((badge) => {
      const label = badge.querySelector('[data-account-label]');
      const strip = badge.parentElement;
      const badgeBox = badge.getBoundingClientRect();
      const stripBox = strip.getBoundingClientRect();
      return {
        visibleLabel:getComputedStyle(label, '::after').content,
        accessibleLabel:badge.getAttribute('aria-label'),
        fits:badgeBox.left >= stripBox.left && badgeBox.right <= stripBox.right,
      };
    });
    assert.equal(compact.visibleLabel, '"ChatGPT"');
    assert.equal(compact.accessibleLabel, 'ChatGPT 연결');
    assert.equal(compact.fits, true);
  } finally { await page.close(); }
});

test('Test_reduced_motion_disables_login_motion_when_requested', async () => {
  // Given: a reduced-motion browser preference and a paired code dialog.
  const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
  try {
    await page.emulateMedia({ reducedMotion:'reduce' });
    await page.goto(baseUrl);
    await page.getByRole('button', { name:'AI 이미지 변환' }).click();
    await page.evaluate(() => { window.qaReady('MOTION-CODE'); window.qaLayout(); });
    // When: the paired layout is rendered.
    const motion = await page.locator('[data-copy-code]').evaluate(button => getComputedStyle(button).animationName);
    // Then: the repeating glow is removed while the code remains actionable.
    assert.equal(motion, 'none');
    assert.equal(await page.locator('[data-login-code]').isVisible(), true);
  } finally { await page.close(); }
});

test('Test_install_download_keeps_navigation_semantics_and_motion_states', async () => {
  // Given: the install guide is open in the central login dialog.
  const page = await pageWithDialog();
  try {
    const download = page.getByRole('link', { name:'설치형 다운로드' });
    // Then: the link keeps its external-navigation contract and rests at full scale.
    assert.match(await download.getAttribute('href'), /^https:/u);
    assert.equal(await download.getAttribute('target'), '_blank');
    assert.equal(await download.getAttribute('rel'), 'noopener noreferrer');
    assert.equal(await download.evaluate((link) => getComputedStyle(link).transform), 'none');
    assert.match(await download.evaluate((link) => getComputedStyle(link).animationName), /orbit/u);
    assert.notEqual(await download.evaluate((link) => getComputedStyle(link).backgroundColor), 'rgb(47, 128, 237)');
    assert.match(await download.evaluate((link) => getComputedStyle(link).backgroundImage), /linear-gradient/u);
    // When: a fine pointer hovers the action, the sparkle layer becomes active.
    await download.hover();
    assert.notEqual(await download.evaluate((link) => getComputedStyle(link, '::after').transform), 'none');
  } finally { await page.close(); }
});

test('Test_reduced_motion_keeps_install_download_actionable_without_orbit', async () => {
  // Given: reduced motion is requested before opening the install guide.
  const page = await browser.newPage({ viewport:{ width:1280, height:800 }, reducedMotion:'reduce' });
  try {
    await page.goto(baseUrl);
    await page.getByRole('button', { name:'AI 이미지 변환' }).click();
    const download = page.getByRole('link', { name:'설치형 다운로드' });
    // Then: spatial motion is removed while the real release destination remains available.
    assert.equal(await download.evaluate((link) => getComputedStyle(link).animationName), 'none');
    assert.equal(await download.evaluate((link) => getComputedStyle(link, '::after').transform), 'none');
    assert.match(await download.getAttribute('href'), /^https:/u);
  } finally { await page.close(); }
});
