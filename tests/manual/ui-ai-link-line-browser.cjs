// 1.7.1 승인 시안(BL4/b17-ai-link-line.html): AI 창 제목 아래 연결 줄(↳ 문항 카드 · …)이 왼쪽 칸(150px)에서 한 줄 「…」로 잘리지 않게.
// 두 줄까지 낱말 단위로 줄바꿈, 그래도 넘치면 둘째 줄 끝만 말줄임. 두 줄일 때만 머리 줄이 15px 늘고, 짧은 이름은 지금과 같다.
// 실행: BROWSER_ENGINE=webkit node tests/manual/ui-ai-link-line-browser.cjs (기본 chromium)
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE
  || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..', '..');
function startServer() {
  const child = spawn(process.execPath, ['scripts/preview-local-server.cjs'], { cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((resolve, reject) => {
    child.once('exit', code => reject(new Error(`preview server exited: ${code}`)));
    child.stdout.on('data', chunk => { const m = String(chunk).match(/Local preview: (http:\/\/127\.0\.0\.1:\d+)\//); if (m) resolve({ child, origin: m[1] }); });
  });
}
(async () => {
  const server = await startServer();
  process.on('exit', () => server.child.kill());
  const engine = process.env.BROWSER_ENGINE || 'chromium';
  const browser = await playwright[engine].launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
    // 웹은 AI 창을 열기 전에 로그인을 묻는다 — 검사는 창(aiPanel)을 바로 연다(로그인과 무관한 머리 줄 모양만 본다).
    await page.route(/\/js\/main\.js(\?|$)/, async route => { const res = await route.fetch(); route.fulfill({ response: res, body: (await res.text()) + '\nwindow.__aiPanel = aiPanel;' }); });
    await page.goto(`${server.origin}/?start=0`, { waitUntil: 'load' });
    await page.waitForSelector('#canvas', { timeout: 30000 });
    await page.waitForFunction(() => window.__aiPanel, null, { timeout: 30000 });
    await page.locator('#ai-image-install-open').click();
    await page.waitForSelector('#ai-image-panel #ai-image-title', { state: 'visible', timeout: 30000 });
    const open = async (card, label) => {
      await page.evaluate(({ card, label }) => {
        const c = document.createElement('canvas'); c.width = 64; c.height = 48; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 48);
        void window.__aiPanel.open({ reference: { dataUrl: c.toDataURL('image/png'), name: label, sourceKind: 'exam-figure' }, conversionKind: 'image',
          hwpTarget: card ? { examCard: { qid: 'q-test', key: 'k-' + label } , label } : { label } });
      }, { card, label });
      await page.waitForFunction(label => (document.querySelector('#ai-image-panel #ai-image-title [data-ai-title-link]')?.textContent || '').endsWith(label), label, { timeout: 20000 });
      await page.waitForTimeout(300);
      return page.evaluate(() => {
        const title = document.querySelector('#ai-image-panel #ai-image-title'), link = title.querySelector('[data-ai-title-link]'), head = title.closest('.ai-head');
        const r = link.getBoundingClientRect(), lh = parseFloat(getComputedStyle(link).lineHeight), cs = getComputedStyle(link);
        return { lines: Math.round(r.height / lh), clipped: link.scrollHeight > link.clientHeight + 1, headH: head.getBoundingClientRect().height, attr: head.dataset.aiLinkLines || '',
          fontSize: cs.fontSize, color: cs.color, linkBottom: r.bottom, headBottom: head.getBoundingClientRect().bottom, full: title.title };
      });
    };
    const short = await open(true, '그림');
    assert.equal(short.lines, 1); assert.equal(short.attr, ''); assert.equal(Math.round(short.headH), 43, '짧은 이름: 머리 줄 높이 그대로');
    assert.equal(short.fontSize, '11.5px', '글자 크기 그대로');
    const two = await open(true, '3번 자료 (가) 그림');
    assert.equal(two.lines, 2, '긴 이름: 두 줄'); assert.equal(two.clipped, false, '두 줄로 다 보임');
    assert.equal(two.attr, '2'); assert.equal(Math.round(two.headH), 58, '두 줄일 때만 머리 줄 +15px');
    assert.ok(two.linkBottom <= two.headBottom + 1, '연결 줄이 아래 줄과 겹치지 않음');
    const hwp = await open(false, '2026 1학기 중간 12번 그래프');
    assert.equal(hwp.lines, 2); assert.equal(hwp.clipped, false);
    const long = await open(true, '2026학년도 1학기 중간고사 3번 문항 자료 (가)와 (나)의 실험 장치 그림 원본');
    assert.equal(long.lines, 2, '아주 긴 이름: 두 줄에서 멈춤'); assert.equal(long.clipped, true, '넘치면 둘째 줄 끝 말줄임');
    assert.match(long.full, /실험 장치 그림 원본에서 열었습니다/, '전체 이름은 제목 설명(마우스 올리기)으로');
    const back = await open(true, '표');
    assert.equal(back.attr, ''); assert.equal(Math.round(back.headH), 43, '다시 짧아지면 머리 줄 원래 높이');
    console.log(`ui-ai-link-line ${engine}: 통과`);
  } finally { await browser.close(); server.child.kill(); }
})().catch(error => { console.error(error); process.exit(1); });
