'use strict';
// PATHFIX(11-20): Finder·Dock에서 띄운 설치판처럼 PATH가 최소(/usr/bin:/bin:/usr/sbin:/sbin)일 때도 codex를 찾는지 실제 Electron으로 본다.
//  1) 실제 codex: codex:status가 installed:true·loggedIn:true, codex:models가 성공(모델 목록만 — 그림·글 요청은 보내지 않음, 사용량 0)
//  2) 없는 codex(FIVE_E_CODEX_PATH=없는 경로): status는 installed:false(「로그인 필요」로 오판하지 않음), models는 [CODEX_NOT_FOUND],
//     화면은 한국어 설치 안내(영어 「Error invoking」 없음), ai-turns.log에 실패가 남는다.
// 실행: node --test tests/test-codex-path-desktop.cjs  (1은 이 맥의 Codex 로그인이 있어야 함 — 없으면 건너뜀이 아니라 실패)
// 앱 실행 파일을 바꾸려면 FIVE_E_APP_EXECUTABLE=<…/5E.app/Contents/MacOS/5E> (빌드한 설치판으로 같은 검사).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const MIN_PATH = process.platform === 'win32' ? process.env.PATH : '/usr/bin:/bin:/usr/sbin:/sbin';
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function launch(t, extraEnv = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), '5e-codex-path-'));
  const documents = path.join(profile, 'documents');
  fs.mkdirSync(documents, { recursive: true });
  // env -i 와 같게: HOME과 최소 PATH만 + 임시 프로필
  const env = { HOME: os.homedir(), PATH: MIN_PATH, USER: process.env.USER || '', SHELL: process.env.SHELL || '/bin/zsh',
    FIVE_E_DEV_USER_DATA: profile, FIVE_E_DEV_DOCUMENTS: documents, FIVE_E_EXAM_PORT: '0', FIVE_E_DISABLE_GPU: '1', ...extraEnv };
  if (process.platform === 'win32') Object.assign(env, { SystemRoot: process.env.SystemRoot, APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA, USERPROFILE: process.env.USERPROFILE });
  const packaged = process.env.FIVE_E_APP_EXECUTABLE;
  const app = await _electron.launch(packaged ? { executablePath: packaged, args: [], env, timeout: 60000 } : { executablePath: require('electron'), args: [root], cwd: root, env, timeout: 60000 });
  t.after(async () => { try { await app.close(); } catch {} fs.rmSync(profile, { recursive: true, force: true }); });
  let page;
  const deadline = Date.now() + 60000;
  while (!page && Date.now() < deadline) {
    page = app.windows().find(candidate => /\/index\.html/.test(candidate.url()));
    if (!page) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(page, '주 창이 열리지 않았습니다');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => typeof window.fiveEDesktop?.status === 'function', null, { timeout: 30000 });
  const logFile = path.join(profile, 'logs', 'ai-turns.log');
  const log = () => { try { return fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)); } catch { return []; } };
  return { app, page, profile, log };
}

test('최소 PATH에서도 실제 codex를 찾아 상태·모델 목록이 된다', { timeout: 180000, skip: process.env.CODEX_PATH_SKIP_REAL === '1' }, async t => {
  const { page, log } = await launch(t);
  const status = await page.evaluate(() => window.fiveEDesktop.status());
  assert.equal(status.installed, true, `codex를 찾지 못함: ${JSON.stringify(status)}`);
  assert.equal(status.login.loggedIn, true, `로그인 상태가 아님(이 맥의 Codex 로그인 필요): ${JSON.stringify(status.login)}`);
  const models = await page.evaluate(async () => { const result = await window.fiveEDesktop.models(); return (result.data || []).map(item => item.model || item.id); });
  assert.ok(models.length > 0, '모델 목록이 비었습니다');
  const resolved = log().find(entry => entry.event === 'codex-resolve' && entry.ok === true);
  assert.ok(resolved && path.isAbsolute(resolved.path), 'codex 위치 찾기 결과가 기록되어야 합니다');
  assert.ok(log().some(entry => entry.event === 'codex-started'), 'App Server 시작이 기록되어야 합니다');
});

test('codex가 없으면 「로그인 필요」가 아니라 한국어 설치 안내 + 오류 기록', { timeout: 180000 }, async t => {
  const { page, profile, log } = await launch(t, { FIVE_E_CODEX_PATH: path.join(os.tmpdir(), '5e-no-such-codex', 'codex') });
  const status = await page.evaluate(() => window.fiveEDesktop.status());
  assert.equal(status.installed, false);
  assert.equal(status.login.loggedIn, null, '설치 안 됨을 로그인 안 됨(false)으로 말하면 안 됩니다');
  assert.equal(status.login.code, 'CODEX_NOT_FOUND');
  const models = await page.evaluate(() => window.fiveEDesktop.models().then(() => 'ok', error => String(error.message)));
  assert.match(models, /\[CODEX_NOT_FOUND\]/);
  const start = await page.evaluate(() => window.fiveEDesktop.start());
  assert.equal(start.ok, false, 'start가 거짓 성공(ok:true)을 돌려주면 안 됩니다');
  const login = await page.evaluate(() => window.fiveEDesktop.login());
  assert.equal(login.ok, false, 'login이 거짓 성공(ok:true)을 돌려주면 안 됩니다');
  assert.equal(login.code, 'CODEX_NOT_FOUND');
  // 화면: AI 작업대를 열면 연결 정보에 설치 안내, 상태 줄은 한국어, 영어 원문은 한 글자도 없음.
  await page.evaluate(() => { localStorage.setItem('5e.preview:5e.mode', 'pro'); localStorage.setItem('5e.tutorial.bannerSeen', 'true'); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const welcome = page.locator('.tut-welcome-overlay .tut-banner-no');
  if (await welcome.isVisible().catch(() => false)) await welcome.click();
  await page.locator('#ai-image-install-open').click({ timeout: 30000 });
  const install = page.locator('#ai-image-panel [data-ai-codex-install]');
  await install.waitFor({ state: 'attached', timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('#ai-image-panel [data-ai-codex-install]')?.hidden, null, { timeout: 30000 });
  const text = await page.evaluate(() => ({
    status: document.querySelector('#ai-image-panel [data-ai-status]')?.textContent || document.querySelector('#ai-image-panel .ai-status')?.textContent || '',
    install: document.querySelector('#ai-image-panel [data-ai-codex-install]')?.textContent || '',
    body: document.querySelector('#ai-image-panel')?.innerText || '',
  }));
  assert.match(text.install, /chatgpt\.com\/codex\/install\.ps1/); // 11-22: 공식 설치 명령(윈도우·맥)
  assert.match(text.install, /chatgpt\.com\/codex\/install\.sh/);
  assert.match(text.install, /다시 찾기/);
  assert.doesNotMatch(text.body, /Error invoking remote method|spawn codex ENOENT/);
  assert.doesNotMatch(text.status, /ChatGPT 로그인 필요/);
  // 「다시 찾기」는 여전히 못 찾는다고 한국어로 알린다(막다른 경고 없이 기다림).
  await page.evaluate(() => { const details = document.querySelector('#ai-image-panel details.ai-advanced-settings'); if (details) details.open = true; });
  await page.evaluate(() => document.querySelector('#ai-image-panel [data-ai-codex-locate]').click());
  await page.waitForFunction(() => /아직 찾지 못했습니다/.test(document.querySelector('#ai-image-panel [data-ai-codex-install-note]')?.textContent || ''), null, { timeout: 20000 });
  // 기록: 위치 찾기 실패·시작 실패·로그인 실패·IPC 거절이 모두 ai-turns.log에 남는다.
  const entries = log();
  const events = new Set(entries.map(entry => entry.event));
  for (const event of ['codex-resolve', 'codex-start-failed', 'codex-login-failed', 'ipc-failed', 'codex-status'])
    assert.ok(events.has(event), `${event} 기록 없음 — ${[...events].join(', ')}`);
  assert.ok(entries.some(entry => entry.event === 'ipc-failed' && entry.channel === 'codex:models' && entry.code === 'CODEX_NOT_FOUND'));
  fs.mkdirSync(process.env.EVIDENCE_DIR || path.join(profile, 'evidence'), { recursive: true });
  if (process.env.EVIDENCE_DIR) {
    await page.screenshot({ path: path.join(process.env.EVIDENCE_DIR, 'codex-missing-guide.png') });
    fs.writeFileSync(path.join(process.env.EVIDENCE_DIR, 'codex-missing-ai-turns.log'), entries.map(entry => JSON.stringify(entry)).join('\n') + '\n');
  }
});
