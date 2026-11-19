// B9(1.7.1): 한글 입력기 상태(keyCode 229 · isComposing)에서도 그림 도구 단축키가 작동해야 한다.
// 글 입력 칸이 아닌 곳(캔버스·몸체·단추)에 포커스가 있을 때는 조합할 글이 없으므로 단축키로 처리한다.
// 글 입력 칸 안에서 조합 중인 키만 글자 입력에 맡긴다.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE
  || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = path.resolve(__dirname, '..', '..');
const version = '?v=1.7.0-four-session-integration';

function startServer() {
  const child = spawn(process.execPath, ['scripts/preview-local-server.cjs'], {
    cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((resolve, reject) => {
    child.once('exit', code => reject(new Error(`preview server exited: ${code}`)));
    child.stdout.on('data', chunk => {
      const match = String(chunk).match(/Local preview: (http:\/\/127\.0\.0\.1:\d+)\//);
      if (match) resolve({ child, origin: match[1] });
    });
  });
}

// 한글 입력기가 보내는 키: Chrome은 isComposing·229, Safari는 조합 글이 없어도 229 + key 'Process'.
const IME_KEYS = [
  { label: 'Safari형(Process·229)', init: { key: 'Process', keyCode: 229, isComposing: false } },
  { label: 'Chrome형(조합 중·229)', init: { key: 'ㄷ', keyCode: 229, isComposing: true } },
  { label: '한글 글자(ㄴ)', init: { key: 'ㄴ', keyCode: 78, isComposing: false } },
];
// [실제 키 code, 기대 도구]
const SHORTCUTS = [['KeyT', 'T'], ['KeyS', 'RECT'], ['KeyO', 'O'], ['KeyL', 'L'], ['KeyV', 'V']];

(async () => {
  const server = process.env.PREVIEW_URL ? null : await startServer();
  const origin = process.env.PREVIEW_URL ? new URL(process.env.PREVIEW_URL).origin : server.origin;
  const entry = process.env.APP_ENTRY || '/';
  const engine = process.env.BROWSER_ENGINE || 'chromium';
  const browser = await playwright[engine].launch({ headless: true });
  const failures = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
    await page.goto(`${origin}${entry}?start=0`, { waitUntil: 'load' });
    await page.waitForSelector('#canvas', { timeout: 30000 });
    await page.evaluate(async v => { const { state } = await import('/js/state.js' + v); window.qa = { state }; }, version);
    await page.waitForFunction(() => !document.querySelector('.modal-overlay:not([hidden]):not([inert])'), null, { timeout: 15000 }).catch(() => {});

    for (const target of ['body', 'canvas']) {
      for (const ime of IME_KEYS) {
        for (const [code, tool] of SHORTCUTS) {
          const got = await page.evaluate(({ target, init, code, tool }) => {
            window.qa.state.update(s => { s.activeTool = tool === 'V' ? 'L' : 'V'; });
            const el = target === 'canvas' ? document.querySelector('#canvas') : document.body;
            document.activeElement?.blur?.();
            const event = new KeyboardEvent('keydown', { ...init, code, bubbles: true, cancelable: true });
            Object.defineProperty(event, 'keyCode', { get: () => init.keyCode });
            el.dispatchEvent(event);
            return window.qa.state.get().activeTool;
          }, { target, init: ime.init, code, tool });
          if (got !== tool) failures.push(`${target} · ${ime.label} · ${code}: 기대 ${tool}, 실제 ${got}`);
        }
      }
    }

    // 글 입력 칸 안에서 조합 중인 키는 도구를 바꾸면 안 된다.
    const inInput = await page.evaluate(() => {
      window.qa.state.update(s => { s.activeTool = 'V'; });
      const input = document.createElement('input'); document.body.append(input); input.focus();
      const event = new KeyboardEvent('keydown', { key: 'ㅅ', code: 'KeyT', isComposing: true, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'keyCode', { get: () => 229 });
      input.dispatchEvent(event); input.remove();
      return window.qa.state.get().activeTool;
    });
    if (inInput !== 'V') failures.push(`입력 칸 안 조합 키가 도구를 바꿈: ${inInput}`);
  } finally {
    await browser.close();
    server?.child.kill();
  }
  if (failures.length) { console.error(failures.join('\n')); assert.fail(`B9 실패 ${failures.length}건`); }
  console.log(`B9 한글 상태 단축키 검사 통과 (${process.env.BROWSER_ENGINE || 'chromium'})`);
})().catch(error => { console.error(error); process.exit(1); });
