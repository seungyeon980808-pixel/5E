// 11-17 B3 설치판 결함 3개(밤샘2 B2 보고에서 찾은 것).
// 1) 꺼진 앱을 .5e 두 번 눌러 켜면 파일이 시작 창 뒤 줄에서 기다리기만 했다(js/project-launch.js의 ready = 시작 창 고르기).
//    → 시작 창이 떠 있어도 파일이 오면 시작 창이 걷히고 맞는 프로그램(그림=5E_image, 시트=5E_exam 불러오기)에서 바로 열린다.
//    검사 브라우저는 navigator.webdriver 때문에 시작 창을 띄우지 않으므로 ?start=1로 강제로 띄운다(js/start-screen.js).
//    설치판 다리(window.fiveEDesktop)는 시작 창 크기(startWindow)와 파일 받기(project.onOpen)만 흉내 낸다.
// 2) 5E_exam 보관함 검색 칸: 입력 0.25초 뒤 다시 그릴 때 칸이 새것으로 바뀌어 ⌘Z와 글자 사이 커서가 사라졌다.
// 3) Lite에서 ⌥⌘2·⌥⌘3은 아무 반응이 없었다 → 다른 막힌 길과 같은 「정식판에서 됩니다」 안내 + [Pro로 바꾸기].
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const root = path.resolve(__dirname, '..');
const evidence = process.env.EVIDENCE_DIR ? path.resolve(process.env.EVIDENCE_DIR) : null;
if (evidence) fs.mkdirSync(evidence, { recursive: true });
const fixture = name => [...fs.readFileSync(path.join(root, 'tests/fixtures/project-launch', name))];
const shot = (page, name) => evidence ? page.screenshot({ path: path.join(evidence, name) }).catch(() => {}) : null;
const notice = p => p.locator('.modal-overlay', { hasText: '정식판에서 됩니다' });
const shown = (p, id) => p.evaluate(id => { const el = document.getElementById(id); return !!el && !el.hidden && el.getBoundingClientRect().width > 0; }, id);

async function startWithScreen(browser, origin) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }), errors = [];
  page.setDefaultTimeout(60000);
  page.on('pageerror', e => errors.push(e.message));
  // 업데이트 확인(GitHub)은 밖으로 나가지 않게 같은 판으로 답한다.
  await page.route('https://api.github.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"tag_name":"v0.0.0"}' }));
  await page.addInitScript(() => {
    try { localStorage.removeItem('5e.mode'); } catch {}
    const waiting = [];
    window.__deliverProject = payload => { window.__projectPayloads = (window.__projectPayloads || 0) + 1; waiting.forEach(fn => fn(payload)); };
    // 다리 흉내는 파일 받을 곳이 걸릴 때(main.js initProjectFileOpening)까지만 보인다 — 그 뒤 AI·그래프 등은 웹처럼 움직여야
    // 흉내 다리에 없는 기능을 기다리다 멈추지 않는다(그림 프로젝트 복원이 AI 준비를 기다림).
    let bridge = {
      startWindow: { shrink: async () => {}, expand: async () => {} },
      project: { onOpen(fn) { waiting.push(fn); bridge = undefined; return () => {}; } },
    };
    Object.defineProperty(window, 'fiveEDesktop', { configurable: true, get: () => bridge });
  });
  await h.navigate(page, `${origin}/?start=1&mode=pro&mobile=0`);
  await page.waitForSelector('#start-screen', { timeout: 30000 });
  return { page, errors };
}
const deliver = (page, name, bytes) => page.evaluate(({ name, bytes }) => window.__deliverProject({ name, bytes: new Uint8Array(bytes).buffer }), { name, bytes });
const objectCount = page => page.evaluate(async url => (await import(url)).state.get().objects.length, h.runtime(page).stateUrl);
// waitForFunction에 async 함수를 주면 약속(참) 자체로 바로 통과하므로 여기서 직접 돈다.
async function waitObjects(page, more, ms = 10000) {
  const until = Date.now() + ms;
  for (;;) { const n = await objectCount(page); if (n > more) return n; if (Date.now() > until) throw new Error(`그림이 들어오지 않음(객체 ${n}개)`); await page.waitForTimeout(150); }
}

for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([k]) => !process.env.BROWSER_ENGINE || k === process.env.BROWSER_ENGINE)) {
  test(`${name}: B3-1 시작 창이 떠 있을 때 받은 .5e가 바로 열린다`, async t => {
    await h.withServer(async origin => {
      const browser = await engine.launch(); t.after(() => browser.close());

      // ⓐ 첫 장면(준비 중)에서 그림 파일이 옴 — 7초 머무는 시간을 기다리지 않고 걷힌 뒤 그림이 그대로 들어온다.
      {
        const { page, errors } = await startWithScreen(browser, origin);
        assert.equal(await page.locator('#start-screen .ss-win.is-ready').count(), 0, '아직 첫 장면(준비 중)');
        const before = await objectCount(page);
        const at = Date.now();
        await deliver(page, '그림.5e', fixture('drawing-171.5e'));
        await page.waitForSelector('#start-screen', { state: 'detached', timeout: 6000 });
        await waitObjects(page, before);
        assert.ok(Date.now() - at < 6000, '고르기를 기다리지 않음');
        assert.equal(await page.locator('.modal-overlay', { hasText: '대체할까요' }).count(), 0, '새로 켠 빈 작업이면 대체를 묻지 않음');
        assert.equal(await shown(page, 'exampool-sheet-workspace'), false, '그림 파일은 5E_image에 남음');
        await shot(page, `${name}-1a-그림-첫장면.png`);
        assert.deepEqual(errors, []);
        await page.close();
      }

      // ⓑ 고르기 화면(카드가 보이는 때)에서 시트 파일이 옴 — 카드를 고르지 않아도 5E_exam 불러오기 창이 뜬다.
      {
        const { page, errors } = await startWithScreen(browser, origin);
        await page.waitForSelector('#start-screen .ss-win.is-ready', { timeout: 40000 });
        await deliver(page, '시험지-보관함.5e', fixture('sheet-171.5e'));
        await page.waitForSelector('#start-screen', { state: 'detached', timeout: 6000 });
        await page.waitForFunction(() => { const ws = document.getElementById('exampool-sheet-workspace'); return !!ws && !ws.hidden && !!ws.querySelector('iframe')?.contentDocument?.querySelector('#import-dialog[open]'); }, null, { timeout: 30000 });
        const count = await page.evaluate(() => document.querySelector('#exampool-sheet-workspace iframe').contentDocument.querySelector('#import-count')?.textContent || '');
        assert.match(count, /1/, '시트의 문항 1개를 불러올지 묻는다');
        await shot(page, `${name}-1b-시트-고르기화면.png`);
        assert.deepEqual(errors, []);
        await page.close();
      }

      // ⓒ 파일이 시작 창보다 먼저 와도(자동 저장 읽기 전) 시작 창이 걷히고 열린다.
      {
        const { page, errors } = await startWithScreen(browser, origin);
        await deliver(page, '그림.5e', fixture('drawing-171.5e'));
        await page.waitForSelector('#start-screen', { state: 'detached', timeout: 6000 });
        await waitObjects(page, 0);
        assert.equal(await page.locator('.modal-overlay', { hasText: '대체할까요' }).count(), 0);
        assert.deepEqual(errors, []);
        await page.close();
      }
    });
  });

  test(`${name}: B3-2 보관함 검색 칸은 다시 그려도 같은 칸 — ⌘Z·커서가 남는다`, async t => {
    await h.withServer(async origin => {
      const browser = await engine.launch(); t.after(() => browser.close());
      const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }), errors = [];
      page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(e.message));
      await h.navigate(page, origin + '/?mode=pro&mobile=0'); await h.ready(page);
      await page.locator('.app-switch-image [data-app-switch="exam"]').evaluate(b => b.click());
      const sheet = await (await page.waitForSelector('#exampool-sheet-workspace iframe')).contentFrame();
      await sheet.waitForSelector('.side [data-pool="drafting"]');
      await sheet.waitForFunction(() => document.querySelector('#status').textContent !== '준비 중');
      await sheet.waitForSelector('#library-view:not([hidden]) #lib-query');
      const box = sheet.locator('#lib-query');
      await box.click();
      await sheet.evaluate(() => { document.querySelector('#lib-query').__b3 = true; });
      await page.keyboard.type('전류', { delay: 30 });
      await sheet.waitForTimeout(450);// 다시 그리기(0.25초) 뒤
      await page.keyboard.type(' 자기장', { delay: 30 });
      await sheet.waitForTimeout(450);
      assert.equal(await sheet.evaluate(() => document.querySelector('#lib-query').__b3 === true), true, '다시 그려도 검색 칸 요소가 그대로');
      assert.equal(await box.inputValue(), '전류 자기장');
      assert.equal(await sheet.evaluate(() => document.activeElement?.id), 'lib-query', '초점이 칸에 남음');
      // 글자 사이 커서: 「전류|」 뒤에 넣은 글자가 그 자리에 들어가고, 다시 그린 뒤에도 커서가 끝으로 튀지 않는다.
      await sheet.evaluate(() => { const n = document.querySelector('#lib-query'); n.setSelectionRange(2, 2); });
      await page.keyboard.type('계', { delay: 30 });
      await sheet.waitForTimeout(450);
      assert.equal(await box.inputValue(), '전류계 자기장');
      assert.equal(await sheet.evaluate(() => document.querySelector('#lib-query').selectionStart), 3, '다시 그린 뒤에도 커서가 넣은 자리에 남음');
      // ⌘Z(윈도우 Ctrl+Z): 브라우저 되돌리기 기록이 남아 마지막 입력이 되돌아간다.
      await page.keyboard.press('ControlOrMeta+z');
      await sheet.waitForTimeout(450);
      const undone = await box.inputValue();
      assert.notEqual(undone, '전류계 자기장', `⌘Z로 되돌아가야 함(지금: ${undone})`);
      assert.equal(await sheet.evaluate(() => document.querySelector('#lib-query').__b3 === true), true, '되돌린 뒤 다시 그려도 같은 칸');
      await shot(page, `${name}-2-검색칸-되돌리기.png`);
      assert.deepEqual(errors, []);
    });
  });

  test(`${name}: B3-3 Lite에서 ⌥⌘2·⌥⌘3도 「정식판에서 됩니다」 안내`, async t => {
    await h.withServer(async origin => {
      const browser = await engine.launch(); t.after(() => browser.close());
      const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }), errors = [];
      page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(e.message));
      await h.navigate(page, origin + '/?mode=lite&mobile=0');
      await page.locator('#mode-toggle-btn').waitFor();
      await page.waitForFunction(() => document.getElementById('rhwp-exam-workspace')?.dataset.examReady === 'true', null, { timeout: 30000 }).catch(() => {});
      assert.equal(await page.locator('html').getAttribute('data-mode'), 'lite');
      await page.locator('#canvas').click({ position: { x: 5, y: 5 } }).catch(() => {});
      for (const [digit, label] of [['2', '5E_exam'], ['3', '5E_hwp']]) {
        await page.keyboard.press(`Meta+Alt+Digit${digit}`.replace('Meta', process.platform === 'darwin' ? 'Meta' : 'Control'));
        await notice(page).waitFor({ timeout: 5000 });
        assert.match(await notice(page).innerText(), new RegExp(label.replace('5E_', '')), `⌥⌘${digit}: 어떤 기능인지 말함`);
        assert.equal(await notice(page).getByRole('button', { name: 'Pro로 바꾸기' }).count(), 1, `⌥⌘${digit}: Pro로 바꾸는 길`);
        assert.equal(await shown(page, 'exampool-sheet-workspace'), false, `⌥⌘${digit}: 출제 칸이 열리지 않음`);
        assert.equal(await shown(page, 'rhwp-exam-workspace'), false, `⌥⌘${digit}: 조판 창이 열리지 않음`);
        await shot(page, `${name}-3-Lite-⌥⌘${digit}.png`);
        await notice(page).getByRole('button', { name: '닫기' }).click();
        await page.waitForTimeout(200);
        assert.equal(await notice(page).count(), 0);
        assert.equal(await page.locator('html').getAttribute('data-mode'), 'lite', '닫기를 누르면 Lite 그대로');
      }
      // [Pro로 바꾸기] → 정식판으로 바뀌고 누른 프로그램(5E_exam)으로 이어서 간다.
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Alt+Digit2' : 'Control+Alt+Digit2');
      await notice(page).getByRole('button', { name: 'Pro로 바꾸기' }).click();
      const keep = page.getByRole('button', { name: '유지하고 전환', exact: true });
      await keep.waitFor({ timeout: 3000 }).then(() => keep.click()).catch(() => {});
      await page.waitForFunction(() => document.documentElement.dataset.mode === 'pro', null, { timeout: 10000 });
      await page.waitForFunction(() => { const el = document.getElementById('exampool-sheet-workspace'); return !!el && !el.hidden; }, null, { timeout: 30000 });
      assert.deepEqual(errors, []);
    });
  });
}
