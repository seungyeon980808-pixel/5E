// 1.7.1 승인 시안(BL3/B15-메뉴접기.html): 5E_exam 왼쪽 메뉴 접기·펴기가 뚝 끊기지 않게.
// 접을 때: 폭이 줄어드는 동안 글자는 크기 0·숨김이 아니라 투명도로 사라지고, 다 줄어든 뒤 접힌 모양(nav-off, 44px).
// 펼 때: 글자는 처음엔 투명했다가 나타남. 가운데 칸은 메뉴 폭을 따라 움직임. 빠르게 두 번 눌러도 상태가 꼬이지 않음.
// 「동작 줄이기」면 움직임 없이 바로.
// 실행: BROWSER_ENGINE=webkit node tests/manual/ui-exam-nav-collapse-browser.cjs (기본 chromium)
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE
  || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = path.resolve(__dirname, '..', '..');
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
  try {
    for (const reduced of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 760 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      const page = await context.newPage();
      await page.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
      await page.goto(`${server.origin}/assets/exampool/sheet/index.html`, { waitUntil: 'load' });
      await page.waitForSelector('.shell-body>.side button.nav>span', { timeout: 30000 });
      await page.waitForTimeout(1500);
      const sample = () => page.evaluate(() => {
        const side = document.querySelector('.shell-body>.side'), label = side.querySelector('button.nav>span');
        const main = [...side.parentElement.children].find(c => c !== side && c.getClientRects().length);
        return { off: side.parentElement.classList.contains('nav-off'), w: side.getBoundingClientRect().width, mainL: main.getBoundingClientRect().left,
          op: +getComputedStyle(label).opacity, fs: getComputedStyle(label).fontSize, display: getComputedStyle(label).display,
          pressed: document.querySelector('#toggle-nav').getAttribute('aria-pressed') };
      });
      const open = await sample();
      assert.equal(open.off, false); assert.ok(open.w > 120, `펼친 폭 ${open.w}`);
      if (!reduced) {
        // 접는 중: 글자는 보이는 크기 그대로 투명해지고, 폭은 사이 값, 가운데 칸은 메뉴 폭을 따라감
        const mid = await page.evaluate(async () => {
          document.querySelector('#toggle-nav').click();
          await new Promise(r => setTimeout(r, 50));
          const side = document.querySelector('.shell-body>.side'), label = side.querySelector('button.nav>span');
          const main = [...side.parentElement.children].find(c => c !== side && c.getClientRects().length);
          return { off: side.parentElement.classList.contains('nav-off'), w: side.getBoundingClientRect().width, mainL: main.getBoundingClientRect().left,
            op: +getComputedStyle(label).opacity, fs: getComputedStyle(label).fontSize, display: getComputedStyle(label).display,
            pressed: document.querySelector('#toggle-nav').getAttribute('aria-pressed') };
        });
        assert.equal(mid.pressed, 'false', '누르자마자 단추 상태는 바뀜');
        assert.notEqual(mid.fs, '0px', '글자 크기를 0으로 줄이지 않음');
        assert.notEqual(mid.display, 'none', '글자를 한 번에 숨기지 않음');
        assert.ok(mid.op < 1, `글자가 투명해지는 중이어야 함(${mid.op})`);
        assert.ok(mid.w < open.w && mid.w > 44, `폭이 사이 값이어야 함(${mid.w})`);
        assert.ok(Math.abs(mid.mainL - mid.w) < 2, '가운데 칸이 메뉴 폭을 따라감');
      } else {
        await page.click('#toggle-nav');
      }
      await page.waitForTimeout(700);
      const closed = await sample();
      assert.equal(closed.off, true); assert.ok(Math.abs(closed.w - 44) < 1, `접힌 폭 44px(${closed.w})`);
      assert.ok(Math.abs(closed.mainL - 44) < 2, `가운데 칸 왼쪽 44px(${closed.mainL})`);
      const leftovers = await page.evaluate(() => [...document.querySelectorAll('.shell-body>.side, .shell-body>.side>*')].filter(n => n.style.minWidth || n.style.overflow).length);
      assert.equal(leftovers, 0, '움직이는 동안 붙인 임시 모양이 남지 않음');
      if (!reduced) {
        const midOpen = await page.evaluate(async () => {
          document.querySelector('#toggle-nav').click();
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          const side = document.querySelector('.shell-body>.side'), label = side.querySelector('button.nav>span');
          return { off: side.parentElement.classList.contains('nav-off'), w: side.getBoundingClientRect().width, op: +getComputedStyle(label).opacity };
        });
        assert.equal(midOpen.off, false);
        assert.ok(midOpen.w < open.w - 1, `펴는 중 폭은 아직 다 안 열림(${midOpen.w})`);
        assert.ok(midOpen.op < 0.5, `펴기 시작 때 글자는 투명(${midOpen.op})`);
      } else {
        await page.click('#toggle-nav');
        const now = await sample();
        assert.equal(now.off, false); assert.ok(Math.abs(now.w - open.w) < 1, '동작 줄이기: 바로 펼친 폭');
      }
      await page.waitForTimeout(700);
      const reopened = await sample();
      assert.equal(reopened.off, false); assert.ok(Math.abs(reopened.w - open.w) < 1); assert.equal(reopened.op, 1);
      // 빠르게 두 번(접기→바로 펴기): 펼친 상태로 끝나고 남는 것이 없음
      await page.evaluate(async () => { const t = document.querySelector('#toggle-nav'); t.click(); await new Promise(r => setTimeout(r, 40)); t.click(); });
      await page.waitForTimeout(700);
      const twice = await sample();
      assert.equal(twice.off, false); assert.equal(twice.pressed, 'true'); assert.ok(Math.abs(twice.w - open.w) < 1, `두 번 누른 뒤 폭(${twice.w})`); assert.equal(twice.op, 1);
      // 세 번(접기→펴기→접기): 접힌 상태
      await page.evaluate(async () => { const t = document.querySelector('#toggle-nav'); t.click(); await new Promise(r => setTimeout(r, 40)); t.click(); await new Promise(r => setTimeout(r, 40)); t.click(); });
      await page.waitForTimeout(800);
      const thrice = await sample();
      assert.equal(thrice.off, true); assert.ok(Math.abs(thrice.w - 44) < 1, `세 번 누른 뒤 폭(${thrice.w})`);
      const stored = await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.endsWith('exampool-nav'))?.[1]);
      assert.equal(stored, '0', '접힌 상태 기억');
      console.log(`ok ${engine} ${reduced ? '동작 줄이기' : '보통'}`);
      await context.close();
    }
  } finally {
    await browser.close();
    server.child.kill();
  }
  console.log(`ui-exam-nav-collapse ${engine}: 통과`);
})().catch(error => { console.error(error); process.exit(1); });
