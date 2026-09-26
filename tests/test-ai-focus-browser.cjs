const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE
  || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = path.resolve(__dirname, '..');

function startServer() {
  const child = spawn(process.execPath, ['scripts/preview-local-server.cjs'], {
    cwd: root,
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((resolve, reject) => {
    child.once('exit', code => reject(new Error(`preview server exited: ${code}`)));
    child.stdout.on('data', chunk => {
      const match = String(chunk).match(/Local preview: (http:\/\/127\.0\.0\.1:\d+)\/preview\//);
      if (match) resolve({ child, origin: match[1] });
    });
  });
}

async function cycle(page, key) {
  let first = null;
  for (let index = 0; index < 96; index += 1) {
    const focus = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active.dataset.aiFocusTestId) active.dataset.aiFocusTestId = crypto.randomUUID();
      return { inside: Boolean(active.closest('#ai-image-panel')), id: active.dataset.aiFocusTestId };
    });
    assert.equal(focus.inside, true, `${key} Tab escaped the AI workbench`);
    if (first === focus.id && index > 0) return;
    first ||= focus.id;
    await page.keyboard.press(key);
  }
  assert.fail(`${key} Tab did not complete a focus cycle`);
}

(async () => {
  const evidence = process.env.EVIDENCE_DIR;
  if (evidence) fs.mkdirSync(evidence, { recursive: true });
  const server = process.env.PREVIEW_URL ? null : await startServer();
  const origin = process.env.PREVIEW_URL ? new URL(process.env.PREVIEW_URL).origin : server.origin;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('5e.tutorial.bannerSeen', 'true');
      localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
      const listeners = new Set();
      window.fiveEDesktop = {
        web: true,
        status: async () => ({ login: { loggedIn: true }, server: true }),
        start: async () => ({ ok: true }), stop: async () => ({ ok: true }),
        models: async () => ({ data: [{ model: 'gpt-5.6-sol', displayName: 'Sol', isDefault: true, supportedReasoningEfforts: ['low'], serviceTiers: ['priority'] }] }),
        account: async () => ({ email: 'local@example.invalid', rateLimits: {} }),
        login: async () => {}, send: async () => ({ turnId: 'local', threadId: 'local' }), interrupt: async () => ({ ok: true }),
        onEvent: callback => { listeners.add(callback); return () => listeners.delete(callback); },
        onState: () => () => {}, onLog: () => () => {}, setAiTaskShortcutActive: () => {}, onAiCloseTaskShortcut: () => () => {},
      };
    });
    await page.goto(`${origin}/preview/?mode=pro`, { waitUntil: 'load' });
    await page.locator('#ai-image-install-open').click();
    const panel = page.locator('#ai-image-panel');
    await panel.waitFor({ state: 'visible' });
    await cycle(page, 'Tab');
    await page.locator('[data-ai-close]').focus();
    await cycle(page, 'Shift+Tab');
    await page.locator('[data-ai-close]').focus();
    await page.keyboard.press('Escape');
    assert.equal(await panel.isHidden(), true, 'Escape closes the AI workbench');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'canvas', 'Escape restores canvas focus');
    if (evidence) await page.screenshot({ path: path.join(evidence, 'ai-focus-browser.png'), fullPage: true });
  } finally {
    await browser.close();
    server?.child.kill('SIGTERM');
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
