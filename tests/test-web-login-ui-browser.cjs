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

test('Test_existing_connected_account_does_not_claim_automatic_return_when_reopened', async () => {
  // Given: a completed isolated connection whose brief completion dialog has closed.
  const page = await pageWithDialog();
  try {
    await page.evaluate(() => window.qaComplete());
    await page.waitForFunction(() => !document.querySelector('.web-login-dialog').open, null, { timeout:2000 });
    // When: the connected account badge opens the guide again.
    await page.getByRole('button', { name:'ChatGPT 연결됨' }).click();
    // Then: it gives stable ready guidance rather than scheduling another automatic close.
    assert.equal(await page.getByText('메인 화면의 AI 버튼을 눌러 작업을 시작하세요.').count(), 1);
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('.web-login-dialog').evaluate(dialog => dialog.open), true);
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
