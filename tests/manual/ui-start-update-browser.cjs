// 1.7.1 승인 시안(K/업데이트알림-설치판.html): 시작 창 왼쪽 아래 「새 버전」 알림 단추.
// 설치판(window.fiveEDesktop)은 GitHub 최신 릴리즈 태그를 읽어, 더 새 판이 있을 때만 「1.7.0 → 1.7.1 [받기]」를 띄운다.
// 같은 판·인터넷 없음·초안 릴리즈면 지금처럼 「버전 1.7.0」 그대로. 누르면 릴리즈 페이지가 새 창(설치판은 바깥 브라우저)으로.
// 웹은 예전처럼 release-channels.json을 읽는다(글자만 「받기」).
// 실행: BROWSER_ENGINE=webkit node tests/manual/ui-start-update-browser.cjs (기본 chromium). SHOT_DIR을 주면 화면을 찍는다.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE
  || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = path.resolve(__dirname, '..', '..');
const API = 'https://api.github.com/repos/seungyeon980808-pixel/5E/releases/latest';
const RELEASE_PAGE = 'https://github.com/seungyeon980808-pixel/5E/releases/latest';

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

(async () => {
  const server = await startServer();
  const engine = process.env.BROWSER_ENGINE || 'chromium';
  const browser = await playwright[engine].launch({ headless: true });
  const failures = [];
  // desktop: null(웹) 또는 { tag, draft, fail }
  async function run(name, { desktop = null, channels = null }, check) {
    const page = await browser.newPage({ viewport: { width: 960, height: 560 }, deviceScaleFactor: 2 });
    try {
      let apiCalls = 0;
      await page.route(API, route => {
        apiCalls += 1;
        if (desktop?.fail) return route.abort();
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ tag_name: desktop?.tag || 'v1.7.0', draft: !!desktop?.draft, prerelease: false }) });
      });
      await page.route('**/release-channels.json', route => channels
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ channels }) })
        : route.fulfill({ status: 404, body: '' }));
      await page.addInitScript(isDesktop => {
        try { localStorage.clear(); sessionStorage.clear(); } catch {}
        window.__opened = [];
        window.open = (url, target, features) => { window.__opened.push({ url, target, features }); return null; };
        // 설치판 다리 흉내: 시작 창이 쓰는 것만(startWindow). 나머지 기능은 없음.
        if (isDesktop) window.fiveEDesktop = { startWindow: { shrink: async () => {}, expand: async () => {} } };
      }, !!desktop);
      await page.goto(`${server.origin}/?start=1`, { waitUntil: 'load' });
      await page.waitForSelector('#start-screen .ss-foot', { timeout: 30000 });
      await page.waitForTimeout(1500);
      if (process.env.SHOT_DIR) {
        await page.waitForSelector('#start-screen .ss-win.is-ready', { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(process.env.SHOT_DIR, `${engine}-${name}.png`) });
      }
      await check(page, { apiCalls: () => apiCalls });
      console.log(`ok ${engine} ${name}`);
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
      console.log(`FAIL ${engine} ${name}: ${error.message}`);
    } finally { await page.close(); }
  }
  const footText = page => page.evaluate(() => document.querySelector('#start-screen .ss-foot')?.innerText.replace(/\s+/g, ' ').trim());
  try {
    await run('desktop-newer', { desktop: { tag: 'v1.7.1' } }, async (page, { apiCalls }) => {
      const button = page.locator('#start-screen .ss-upd');
      await button.waitFor({ timeout: 5000 });
      assert.equal(apiCalls(), 1, 'GitHub 최신 릴리즈를 한 번 읽음');
      assert.match((await button.innerText()).replace(/\s+/g, ' '), /1\.7\.0 → 1\.7\.1 받기/);
      assert.equal(await button.getAttribute('title'), '새 버전 1.7.1 받기');
      assert.equal(await page.locator('#start-screen .ss-ver').count(), 0, '버전 글자 자리를 단추가 차지');
      await button.click();
      const opened = await page.evaluate(() => window.__opened);
      assert.deepEqual(opened.map(o => o.url), [RELEASE_PAGE]);
    });
    await run('desktop-same', { desktop: { tag: 'v1.7.0' } }, async page => {
      assert.equal(await page.locator('#start-screen .ss-upd').count(), 0);
      assert.match(await footText(page), /버전 1\.7\.0/);
    });
    await run('desktop-offline', { desktop: { fail: true } }, async page => {
      assert.equal(await page.locator('#start-screen .ss-upd').count(), 0);
      assert.match(await footText(page), /버전 1\.7\.0/);
    });
    await run('desktop-draft', { desktop: { tag: 'v1.8.0', draft: true } }, async page => {
      assert.equal(await page.locator('#start-screen .ss-upd').count(), 0);
    });
    await run('web-newer', { channels: { stableWeb: { version: '1.7.1' } } }, async (page, { apiCalls }) => {
      const button = page.locator('#start-screen .ss-upd');
      await button.waitFor({ timeout: 5000 });
      assert.equal(apiCalls(), 0, '웹은 GitHub을 읽지 않음');
      assert.match((await button.innerText()).replace(/\s+/g, ' '), /1\.7\.0 → 1\.7\.1 받기/);
    });
    await run('web-same', {}, async page => {
      assert.equal(await page.locator('#start-screen .ss-upd').count(), 0);
    });
  } finally {
    await browser.close();
    server.child.kill();
  }
  if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
  console.log(`ui-start-update ${engine}: 통과`);
})().catch(error => { console.error(error); process.exit(1); });
