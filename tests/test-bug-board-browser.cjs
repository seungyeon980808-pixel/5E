// 문제 게시판 화면(bug/) 흐름: 작성·임시 저장·비공개 이미지·작성자 관리·공감·관리자 처리.
// 임시 폴더의 로컬 게시판 서버만 쓰고, 운영 서버로는 아무것도 보내지 않는다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createBugBoardServer } = require('../scripts/bug-board-server.cjs');

const root = path.resolve(__dirname, '..');
const ADMIN = 'b'.repeat(48);
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css' };
const evidence = path.resolve(process.env.EVIDENCE_DIR || path.join(root, '_work/feedback/parts/bug-board'));

async function servers() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), '5e-bug-board-browser-'));
  const site = http.createServer();
  await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${site.address().port}`;
  const board = await createBugBoardServer({ directory, adminToken:ADMIN, allowedOrigins:[origin] });
  await new Promise(resolve => board.listen(0, '127.0.0.1', resolve));
  const boardPort = board.address().port;
  site.on('request', (req, res) => {
    const url = new URL(req.url, origin);
    if (url.pathname.startsWith('/api/bug-board')) {
      // 로컬 미리보기 서버와 같은 방식: 같은 출처 요청을 게시판 서버로 넘긴다.
      const headers = { ...req.headers, host:`127.0.0.1:${boardPort}` };
      const upstream = http.request({ hostname:'127.0.0.1', port:boardPort, path:req.url, method:req.method, headers }, response => {
        res.writeHead(response.statusCode, response.headers); response.pipe(res);
      });
      req.pipe(upstream); return;
    }
    const file = path.resolve(root, '.' + (url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname));
    if (!file.startsWith(path.join(root, 'bug') + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return { origin, close:async () => { await new Promise(r => site.close(r)); await new Promise(r => board.close(r)); fs.rmSync(directory, { recursive:true, force:true }); } };
}

async function pasteImage(page, color) {
  await page.evaluate(async color => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 100;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 160, 100);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const data = new DataTransfer(); data.items.add(new File([blob], 'shot.png', { type:'image/png' }));
    document.querySelector('form').dispatchEvent(new ClipboardEvent('paste', { clipboardData:data, bubbles:true, cancelable:true }));
  }, color);
}

(async () => {
  fs.mkdirSync(evidence, { recursive:true });
  const { origin, close } = await servers();
  try {
    for (const engine of [chromium, webkit]) {
      const browser = await engine.launch();
      try {
        const context = await browser.newContext({ viewport:{ width:1280, height:900 } });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin + '/bug/');
        await page.locator('.empty h2, .report-row').first().waitFor();

        // 작성: 제목·설명·붙여넣은 이미지(비공개) → 새로 고침해도 임시 저장 복원
        await page.locator('.write-link').click();
        await page.locator('textarea[name=description]').fill(`${engine.name()} 작업대에 그림이 안 들어갑니다.`);
        await page.locator('input[name=title]').fill(`${engine.name()} 크롭 오류`);
        await pasteImage(page, '#d33');
        await page.locator('.attachment-list figure').waitFor();
        await page.waitForTimeout(500);
        await page.reload(); await page.locator('.attachment-list figure').waitFor();
        assert.equal(await page.locator('input[name=title]').inputValue(), `${engine.name()} 크롭 오류`);
        await page.locator('input[name=password]').fill('owner-pass-1');
        await page.locator('input[name=confirm]').fill('owner-pass-2');
        await page.locator('button[type=submit]').click();
        assert.match(await page.locator('.form-status').textContent(), /일치하지 않습니다/);
        await page.locator('input[name=confirm]').fill('owner-pass-1');
        await page.locator('button[type=submit]').click();
        await page.waitForFunction(() => location.hash.startsWith('#report/'));
        const id = page.url().split('#report/')[1];
        await page.locator('.detail-head h2').waitFor();
        assert.match(await page.locator('#board-status').textContent(), /접수되었습니다/);
        assert.equal(await page.locator('.attachment-list img').count(), 1, '작성자는 비공개 이미지를 본다');
        await page.screenshot({ path:path.join(evidence, `${engine.name()}-detail-owner.png`) });

        // 추가 내용·공감
        await page.locator('section[aria-label="답글"] textarea').fill('Safari에서도 같습니다.');
        await page.locator('section[aria-label="답글"] button[type=submit]').click();
        await page.locator('.reply', { hasText:'Safari에서도 같습니다.' }).waitFor();
        await page.getByRole('button', { name:/나도 겪었어요/ }).click();
        await page.getByRole('button', { name:'나도 겪었어요 · 1' }).waitFor();

        // 다른 방문자: 비공개 이미지·관리 버튼 없음, 틀린 비밀번호 거부
        const visitor = await (await browser.newContext()).newPage();
        await visitor.goto(`${origin}/bug/#report/${id}`); await visitor.locator('.detail-head h2').waitFor();
        assert.equal(await visitor.locator('.attachment-list img').count(), 0);
        assert.equal(await visitor.getByRole('button', { name:'삭제' }).count(), 0);
        await visitor.getByRole('button', { name:'내 글 관리' }).click();
        await visitor.locator('#message-dialog input').fill('wrong-pass-9');
        await visitor.locator('#message-actions button.primary').click();
        await visitor.locator('#message-title', { hasText:'확인하지 못했습니다' }).waitFor();
        await visitor.context().close();

        // 관리자: 접속 → 상태·해결 버전·답변 → 접속 끝내기
        await page.goto(origin + '/bug/#admin');
        await page.locator('input[type=password]').fill(ADMIN);
        await page.locator('button[type=submit]').click();
        await page.waitForFunction(() => location.hash.startsWith('#reports'));
        await page.goto(`${origin}/bug/#report/${id}`); await page.locator('.admin-panel').waitFor();
        await page.locator('.attachment-list img').waitFor();
        assert.equal(await page.locator('.attachment-list img').count(), 1, '관리자도 비공개 이미지를 본다');
        await page.locator('.admin-panel select').selectOption('fixed');
        await page.locator('.admin-panel input').first().fill('1.7.0');
        await page.locator('.admin-panel button.primary').click();
        await page.waitForFunction(() => document.querySelector('.detail-head .status')?.dataset.status === 'fixed');
        await page.locator('section[aria-label="답글"] textarea').fill('1.7.0에서 고쳤습니다.');
        await page.locator('section[aria-label="답글"] button[type=submit]').click();
        await page.locator('.reply', { hasText:'1.7.0에서 고쳤습니다.' }).waitFor();
        await page.goto(origin + '/bug/#admin'); await page.getByRole('button', { name:'접속 끝내기' }).click();
        assert.equal(await page.locator('#admin-link').textContent(), '관리자');

        // 목록: 상태 필터
        await page.goto(origin + '/bug/#reports?status=fixed');
        await page.locator('.report-row', { hasText:`${engine.name()} 크롭 오류` }).waitFor();
        await page.screenshot({ path:path.join(evidence, `${engine.name()}-list.png`) });

        assert.deepEqual(errors, []);
        console.log(`${engine.name()}: 문제 게시판 작성·임시 저장·비공개 이미지·관리·관리자 처리 PASS`);
      } finally { await browser.close(); }
    }
  } finally { await close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
