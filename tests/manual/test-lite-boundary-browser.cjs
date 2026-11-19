// 1.7.1 B1: Lite는 그림(image)·라이브러리만 — 정식판 화면(5E_exam 출제 칸·5E_hwp 조판)이 열리는 길이 없어야 한다.
// 막힌 곳은 말없이 끝나지 않고 「정식판에서 됩니다」 안내 + 정식판(Pro)으로 바꾸는 길을 준다(막다른 경고 금지).
//   ⓐ AI 창 「한글로 보내기」(5e:exam-send-ai)  ⓑ 라이브러리 「보내기 → 한글 시험지로」(5e:exam-send-canvas)
//   ⓒ 라이브러리 「ExamPool로」(5e:exampool-receive)·「문항 카드로」(5e:exampool-past) — 받은 척 하고 사라지지 않게
//   ⓓ Pro에서 조판·출제 화면을 연 채 Lite로 바꾸면 그 화면을 닫는다
// 단독 실행: node tests/manual/test-lite-boundary-browser.cjs (PREVIEW_URL이 없으면 로컬 서버를 직접 띄운다)
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..', '..');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function origin() {
  if (process.env.PREVIEW_URL) return { url: new URL(process.env.PREVIEW_URL).origin, stop() {} };
  const child = spawn(process.execPath, ['scripts/preview-local-server.cjs'], { cwd: root, env: { ...process.env, PORT: '0', FIVE_E_NO_REVISION_BADGE: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
  const url = await new Promise((resolve, reject) => {
    let out = ''; const t = setTimeout(() => reject(new Error('서버가 뜨지 않음')), 15000);
    child.stdout.on('data', c => { out += c; const m = out.match(/(http:\/\/127\.0\.0\.1:\d+)/); if (m) { clearTimeout(t); resolve(m[1]); } });
  });
  return { url, stop: () => child.kill('SIGTERM') };
}

const visible = (p, id) => p.evaluate(id => { const el = document.getElementById(id); return !!el && !el.hidden && el.getBoundingClientRect().width > 0; }, id);
const notice = p => p.locator('.modal-overlay', { hasText: '정식판에서 됩니다' });

async function liteCase(p, name, dispatch) {
  const accepted = await p.evaluate(dispatch);
  await p.waitForTimeout(900);
  assert.equal(await visible(p, 'rhwp-exam-workspace'), false, `${name}: Lite에서 5E_hwp 조판 창이 열림`);
  assert.equal(await visible(p, 'exampool-sheet-workspace'), false, `${name}: Lite에서 5E_exam 출제 칸이 열림`);
  assert.equal(await notice(p).count(), 1, `${name}: 막혔는데 「정식판에서 됩니다」 안내가 없음(말없이 끝남)`);
  assert.equal(await notice(p).getByRole('button', { name: 'Pro로 바꾸기' }).count(), 1, `${name}: 정식판으로 바꾸는 길이 없음`);
  await notice(p).getByRole('button', { name: '닫기' }).click();
  await p.waitForTimeout(200);
  assert.equal(await p.locator('html').getAttribute('data-mode'), 'lite', `${name}: 닫기를 눌렀는데 모드가 바뀜`);
  return accepted;
}

(async () => {
  const server = await origin();
  const failures = [];
  try {
    for (const engine of [chromium, webkit].filter(e => !process.env.BROWSER_ENGINE || e.name() === process.env.BROWSER_ENGINE)) {
      const browser = await engine.launch();
      try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
        await context.addInitScript(() => { try { localStorage.setItem('5e.tutorial.bannerSeen', 'true'); } catch {} });
        const p = await context.newPage();
        const errors = []; p.on('pageerror', e => errors.push(e.message));
        const step = async (label, fn) => { try { await fn(); console.log(`${engine.name()} ✔ ${label}`); } catch (e) { failures.push(`${engine.name()} ${label}: ${e.message.split('\n')[0]}`); console.log(`${engine.name()} ✘ ${label}: ${e.message.split('\n')[0]}`); if (process.env.EVIDENCE_DIR) await p.screenshot({ path: path.join(process.env.EVIDENCE_DIR, `${engine.name()}-실패-${failures.length}.png`) }).catch(() => {}); await p.keyboard.press('Escape').catch(() => {}); await p.evaluate(() => document.querySelectorAll('.modal-overlay').forEach(el => el.remove())).catch(() => {}); } };

        await p.goto(`${server.url}/?mode=lite&mobile=0`);
        await p.locator('#mode-toggle-btn').waitFor();
        await p.waitForFunction(() => document.getElementById('rhwp-exam-workspace')?.dataset.examReady === 'true', null, { timeout: 30000 }).catch(() => {});
        assert.equal(await p.locator('html').getAttribute('data-mode'), 'lite');

        await step('ⓐ AI 「한글로 보내기」', () => liteCase(p, 'ⓐ', () => window.dispatchEvent(new CustomEvent('5e:exam-send-ai', { detail: { scope: '', taskId: '' } }))));
        await step('ⓐ 그래프 「한글로 보내기」', () => liteCase(p, 'ⓐ그래프', () => window.dispatchEvent(new CustomEvent('5e:exam-send-graph', { detail: {} }))));
        await step('ⓑ 라이브러리 「보내기 → 한글 시험지로」', () => liteCase(p, 'ⓑ', () => window.dispatchEvent(new CustomEvent('5e:exam-send-canvas'))));
        await step('ⓒ 라이브러리 「ExamPool로」', async () => {
          await liteCase(p, 'ⓒ', png => { const r = { items: [{ data: png, name: '검사 그림' }], accepted: false }; window.dispatchEvent(new CustomEvent('5e:exampool-receive', { detail: r })); return r.accepted; });
        });
        await step('ⓒ 라이브러리 기출 「문항 카드로」', () => liteCase(p, 'ⓒ기출', () => { const r = { ids: ['kice-2026-06-earth1-01'], toExam: false, accepted: false }; window.dispatchEvent(new CustomEvent('5e:exampool-past', { detail: r })); return r.accepted; }));
        await step('맨 위 「hwp」 신호도 안내', () => liteCase(p, 'hwp-open', () => { const d = { accepted: false }; window.dispatchEvent(new CustomEvent('5e:hwp-open', { detail: d })); return d.accepted; }));

        await step('안내에서 「Pro로 바꾸기」 → 정식판으로 바뀌고 보낸 자료가 출제 칸에 감', async () => {
          await p.evaluate(png => window.dispatchEvent(new CustomEvent('5e:exampool-receive', { detail: { items: [{ data: png, name: '검사 그림' }], accepted: false } })), PNG);
          await notice(p).getByRole('button', { name: 'Pro로 바꾸기' }).click();
          await p.getByRole('button', { name: '유지하고 전환', exact: true }).click();
          await p.waitForFunction(() => document.documentElement.dataset.mode === 'pro', null, { timeout: 10000 });
          await p.waitForFunction(() => { const el = document.getElementById('exampool-sheet-workspace'); return !!el && !el.hidden; }, null, { timeout: 30000 });
          await p.evaluate(() => window.dispatchEvent(new CustomEvent('5e:exampool-close')));
          await p.waitForTimeout(400);
        });

        await step('ⓓ Pro에서 조판 창을 연 채 Lite로 바꾸면 닫힘', async () => {
          if (await p.locator('html').getAttribute('data-mode') !== 'pro') { await p.goto(`${server.url}/?mode=pro&mobile=0`); await p.locator('#mode-toggle-btn').waitFor(); }
          await p.waitForFunction(() => document.getElementById('rhwp-exam-workspace')?.dataset.examReady === 'true', null, { timeout: 30000 });
          await p.evaluate(() => window.dispatchEvent(new CustomEvent('5e:hwp-open', { detail: {} })));
          await p.waitForFunction(() => { const el = document.getElementById('rhwp-exam-workspace'); return !!el && !el.hidden; }, null, { timeout: 30000 });
          // 조판 창이 그림 화면을 덮으므로 모드 단추를 직접 누른다(설치판 메뉴·단축키와 같은 신호).
          await p.evaluate(() => document.getElementById('mode-toggle-btn').click());
          await p.getByRole('button', { name: '유지하고 전환', exact: true }).click();
          await p.waitForFunction(() => document.documentElement.dataset.mode === 'lite', null, { timeout: 10000 });
          await p.waitForTimeout(1500);
          const dialog = p.locator('.modal-overlay');
          if (await dialog.count()) { const leave = dialog.getByRole('button', { name: /저장하지 않고|닫기|나가기/ }); if (await leave.count()) await leave.first().click(); await p.waitForTimeout(800); }
          assert.equal(await visible(p, 'rhwp-exam-workspace'), false, 'Lite로 바꿨는데 5E_hwp 조판 창이 남아 있음');
        });
        if (errors.length) failures.push(`${engine.name()} 페이지 오류: ${errors.join(' | ')}`);
      } finally { await browser.close(); }
    }
  } finally { server.stop(); }
  if (failures.length) { console.error('실패\n' + failures.join('\n')); process.exit(1); }
  console.log('PASS');
})().catch(e => { console.error(e); process.exit(1); });
