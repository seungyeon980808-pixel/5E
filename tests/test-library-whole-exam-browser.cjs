// 11-20 시안 「시험지 통째로 변환」(시험지통째변환/index.html 태그 1~6): 5E 라이브러리 PDF 보기에서 평가원·학평 시험지 PDF 하나를 열고
// 「시험지 통째로 변환」 → 한 줄 확인 → 5E_exam 새 시험지(시험 이름, 원래 번호 순서 1→20).
// 평가원: 2026학년도 수능 물리학Ⅰ 20문항. 12·17번은 한글 변환을 일부러 실패시켜 그림 문항으로 들어가고(맨 위·다시 시도), 다시 시도하면 제자리에서 한글 문항으로 바뀐다.
// 학평: 2026학년도 10월 학평 물리학Ⅰ 20문항 — 모두 그림 문항으로, 같은 순서·이름.
// 실제 5E 공유 자료(게이트웨이)와 미리 변환한 문항(5e-exam-pdf)을 받는다(인터넷 필요).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const URL_ = process.env.PREVIEW_URL || process.env.EXAM_URL;
const FAILED = [12, 17];
const failedPre = new RegExp(`5e-exam-pdf\\.5e-desktop\\.workers\\.dev/q/p1_2026_11_(${FAILED.join('|')})\\.json`);
const engineFile = /\/assets\/exampool\/convert\/kice-engine\.js/;

async function openPdf(page, name) {
  await page.locator('#exam-library-open').click();
  const ui = page.locator('.unified-library-overlay').last();
  await page.waitForFunction(() => document.querySelector('.unified-library-overlay')?.dataset.searchReadiness === 'ready', null, { timeout: 90_000 });
  const label = ui.locator('[data-browse-source]').filter({ hasText: new RegExp(`^${name}$`) }).first();
  await label.waitFor({ state: 'attached', timeout: 60_000 });
  // 출처 목록은 접혀 있을 수 있다 — 이름을 누르는 것과 같은 동작(그 파일 하나만 PDF 보기로 연다).
  await label.evaluate(el => el.click());
  await ui.locator('[data-unilib-whole]').waitFor({ state: 'visible', timeout: 60_000 });
  return ui;
}

const sheetFrame = page => page.frames().find(f => f.url().includes('/assets/exampool/sheet/index.html'));
async function waitSheet(page) {
  await page.waitForFunction(() => document.querySelector('#exampool-sheet-workspace iframe')?.contentDocument?.querySelector('#status'), null, { timeout: 120_000 });
  return sheetFrame(page);
}
// 저장소(IndexedDB)에 저장된 시험지: 이름 · 문항 수 · 각 문항의 원래 번호(근거 「원본 기출 · … n번」) · 그림 문항인지.
async function storedExam(page, title) {
  return sheetFrame(page).evaluate(async (title) => {
    const db = await new Promise((r, j) => { const o = indexedDB.open('5e-exampool-structure'); o.onsuccess = () => r(o.result); o.onerror = () => j(o.error); });
    const d = await new Promise(r => { const g = db.transaction('state').objectStore('state').get('draft'); g.onsuccess = () => r(g.result); });
    db.close();
    const exams = (d?.exams || []).filter(e => e.title === title);
    if (exams.length !== 1) return { count: exams.length };
    const qs = exams[0].items.map(id => d.questions.find(q => q.id === id));
    return { count: 1, items: qs.map(q => ({ no: Number(/(\d+)번$/.exec(q?.references?.[0]?.label || '')?.[1]), number: q?.number,
      image: q?.blocks?.length === 1 && q.blocks[0].kind === 'figure' && /^data:image\//.test(q.blocks[0].figure?.data || '') && /^기출 그림/.test(q.source || ''),
      figureOnly: q?.figureOnly === true, points: q?.points })) };
  }, title);
}
async function waitStored(page, title, test, what) {
  const until = Date.now() + 120_000; let last;
  while (Date.now() < until) { try { last = await storedExam(page, title); if (test(last)) return last; } catch (error) { last = String(error); } await page.waitForTimeout(500); }
  assert.fail(`${what}: ${JSON.stringify(last)}`);
}
const order = items => items.map(i => i.no);
const range = n => Array.from({ length: n }, (_, i) => i + 1);

(async () => {
  for (const engine of [chromium, webkit].filter(e => !process.env.BROWSER_ENGINE || e.name() === process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({ headless: true });
    const evidence = process.env.EVIDENCE_DIR ? path.join(process.env.EVIDENCE_DIR, engine.name()) : null;
    if (evidence) fs.mkdirSync(evidence, { recursive: true });
    const shot = async (page, name) => { if (evidence) await page.screenshot({ path: path.join(evidence, `${name}.png`) }); };
    try {
      // ── 평가원 ──
      {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(() => { for (const p of ['', '5e.preview:']) localStorage.setItem(`${p}5e.tutorial.bannerSeen`, 'true'); });
        await page.route(failedPre, r => r.fulfill({ status: 404, body: '' }));
        await page.route(engineFile, r => r.fulfill({ status: 500, body: '' }));
        await page.goto(URL_);
        const ui = await openPdf(page, 'p1_2026_11');
        const whole = ui.locator('[data-unilib-whole]');
        assert.equal(await whole.textContent(), '시험지 통째로 변환');
        const box = await whole.boundingBox(), row = await ui.locator('.unilib-actions').boundingBox();
        assert.ok(Math.abs(box.width - row.width) < 2, `${engine.name()}: 한 줄 전체 폭 (${box.width} / ${row.width})`);
        await shot(page, '1-pdf');
        // 확인 줄: Esc는 확인만 닫는다(라이브러리 창은 그대로).
        await whole.click();
        const confirm = ui.locator('[data-unilib-whole-confirm]');
        await confirm.waitFor({ state: 'visible' });
        assert.equal(await whole.isVisible(), false, '단추 자리가 확인 줄로 바뀐다');
        assert.match(await confirm.innerText(), /2026학년도 수능 물리학Ⅰ 20문항 → 5E_exam 새 시험지 · 약 10초/);
        assert.deepEqual(await confirm.locator('button').allTextContents(), ['취소', '변환']);
        await shot(page, '2-confirm');
        await page.keyboard.press('Escape');
        await whole.waitFor({ state: 'visible' });
        assert.equal(await ui.isVisible(), true, 'Esc는 라이브러리를 닫지 않는다');
        // Enter = 변환
        await whole.click();
        await confirm.locator('[data-unilib-whole-go]').waitFor({ state: 'visible' });
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.querySelector('#exampool-sheet-workspace')?.hidden === false, null, { timeout: 120_000 });
        await page.waitForFunction(() => document.querySelector('#exampool-sheet-workspace iframe')?.contentDocument?.querySelector('#whole-progress, #job-box .job-sum'), null, { timeout: 120_000 });
        await shot(page, '3-progress');
        const sheet = await waitSheet(page);
        await sheet.waitForSelector('#job-box .job-sum', { timeout: 180_000 });
        assert.equal(await sheet.locator('#whole-progress').count(), 0, '끝나면 가운데 진행은 사라진다');
        assert.match(await sheet.locator('#job-box .job-head').innerText(), /변환 20문항/);
        assert.match(await sheet.locator('#job-box .job-sum').innerText(), /18문항 한글로 · 2문항 그림으로 넣음\s*다시 시도/);
        const firstRows = await sheet.locator('#job-box .job-list li').evaluateAll(list => list.slice(0, 3).map(li => [li.dataset.state, li.querySelector('em').textContent]));
        assert.deepEqual(firstRows.map(r => r[0]), ['image', 'image', 'done'], '그림으로 넣은 줄이 맨 위');
        assert.match(firstRows[0][1], /12번 → 12번 · 그림으로 넣음/); assert.match(firstRows[1][1], /17번 → 17번 · 그림으로 넣음/);
        await shot(page, '4-result');
        const stored = await waitStored(page, '2026학년도 수능 물리학Ⅰ', s => s.count === 1 && s.items.length === 20 && s.items.every(i => i.no), '평가원 새 시험지');
        assert.deepEqual(order(stored.items), range(20), `${engine.name()}: 원래 번호 순서 1→20`);
        assert.deepEqual(stored.items.map(i => i.number), range(20).map(String));
        assert.deepEqual(stored.items.filter(i => i.image).map(i => i.no), FAILED, '못 바꾼 문항만 그림 문항');
        assert.deepEqual(stored.items.filter(i => i.figureOnly).map(i => i.no), FAILED, '그림 문항 표시(figureOnly)는 그림 문항에만');
        // 12번 줄 다시 시도 → 미리 변환한 문항이 오면 그 자리에서 한글 문항으로 바뀐다.
        await page.unroute(failedPre);
        await page.route(/5e-exam-pdf\.5e-desktop\.workers\.dev\/q\/p1_2026_11_17\.json/, r => r.fulfill({ status: 404, body: '' }));
        await sheet.locator('#job-box .job-list li[data-state="image"]').first().locator('[data-job-retry]').click();
        await sheet.waitForFunction(() => /19문항 한글로 · 1문항 그림으로 넣음/.test(document.querySelector('#job-box .job-sum')?.textContent || ''), null, { timeout: 120_000 });
        const retried = await waitStored(page, '2026학년도 수능 물리학Ⅰ', s => s.count === 1 && s.items.filter(i => i.image).length === 1, '다시 시도 뒤');
        assert.deepEqual(order(retried.items), range(20), '다시 시도해도 순서 그대로');
        assert.deepEqual(retried.items.filter(i => i.image).map(i => i.no), [17]);
        assert.deepEqual(errors, [], `${engine.name()}: page errors`);
        await context.close();
      }
      // ── 학평 ──
      {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(() => { for (const p of ['', '5e.preview:']) localStorage.setItem(`${p}5e.tutorial.bannerSeen`, 'true'); });
        await page.goto(URL_);
        const ui = await openPdf(page, 'p1_2026_10');
        await ui.locator('[data-unilib-whole]').click();
        const confirm = ui.locator('[data-unilib-whole-confirm]');
        await confirm.waitFor({ state: 'visible' });
        const text = await confirm.innerText();
        assert.match(text, /2026학년도 10월 학평 물리학Ⅰ 20문항 → 새 시험지 · 그림으로/);
        assert.match(text, /학평은 5E_exam 기출 목록에 없어 한글 문항으로 바꾸지 못합니다/);
        assert.equal(await confirm.locator('[data-unilib-whole-go]').textContent(), '그림으로 변환');
        await shot(page, '5-hak-confirm');
        await confirm.locator('[data-unilib-whole-go]').click();
        await page.waitForFunction(() => document.querySelector('#exampool-sheet-workspace')?.hidden === false, null, { timeout: 120_000 });
        const sheet = await waitSheet(page);
        await sheet.waitForSelector('#job-box .job-sum', { timeout: 120_000 });
        assert.match(await sheet.locator('#job-box .job-sum').innerText(), /^20문항 그림으로 넣음$/);
        const stored = await waitStored(page, '2026학년도 10월 학평 물리학Ⅰ', s => s.count === 1 && s.items.length === 20, '학평 새 시험지');
        assert.deepEqual(order(stored.items), range(20), `${engine.name()}: 학평도 원래 번호 순서`);
        assert.ok(stored.items.every(i => i.image), '학평은 모두 그림 문항');
        assert.ok(stored.items.every(i => i.figureOnly && i.points === 3), '그림 문항 표시 · 기본 배점 3점');
        // 11-20: 그림 문항은 빈 발문 자리(흐린 「발문 [3점]」)와 빈 ①~⑤를 그리지 않는다 — 원본 그림 한 장이 문항.
        const drawn = await sheet.evaluate(async () => {
          const db = await new Promise((r, j) => { const o = indexedDB.open('5e-exampool-structure'); o.onsuccess = () => r(o.result); o.onerror = () => j(o.error); });
          const d = await new Promise(r => { const g = db.transaction('state').objectStore('state').get('draft'); g.onsuccess = () => r(g.result); });
          db.close();
          const q = d.questions.find(x => x.figureOnly);
          const { buildQuestionHtml, skeletonKey } = await import('/assets/exampool/sheet/handoff.js');
          const sized = async f => { const i = new Image(); i.src = f.data; await i.decode(); return { ...f, width: i.naturalWidth, height: i.naturalHeight }; };
          const plain = await buildQuestionHtml(q, sized, 540);
          const typed = await buildQuestionHtml({ ...q, ask: '다음은 무엇인가?', choices: q.choices.map((c, i) => ({ ...c, text: `선지${i + 1}` })) }, sized, 540);
          const text = html => { const n = document.createElement('div'); n.innerHTML = html; return n.textContent; };
          return { plain: text(plain.html), typed: text(typed.html), skeleton: skeletonKey(q), images: plain.images.length };
        });
        assert.doesNotMatch(drawn.plain, /발문|\[3점\]|①|⑤/, `그림 문항에 빈 발문·선지 자리가 없다: ${drawn.plain}`);
        assert.equal(drawn.skeleton, '', '그림 문항은 빈 칸(틀 보기) 문항이 아니다');
        assert.equal(drawn.images, 1, '원본 그림 한 장');
        assert.match(drawn.typed, /다음은 무엇인가\? \[3점\]/, '발문을 쓰면 [3점]과 함께 보인다');
        assert.match(drawn.typed, /①/, '선지를 쓰면 ①~⑤가 보인다');
        await shot(page, '6-hak-result');
        assert.deepEqual(errors, [], `${engine.name()}: page errors`);
        await context.close();
      }
      // ── 시험지가 아니면 단추가 없다(교과서·여러 파일) ──
      {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await context.newPage();
        await page.addInitScript(() => { for (const p of ['', '5e.preview:']) localStorage.setItem(`${p}5e.tutorial.bannerSeen`, 'true'); });
        await page.goto(URL_);
        await page.locator('#exam-library-open').click();
        const ui = page.locator('.unified-library-overlay').last();
        await page.waitForFunction(() => document.querySelector('.unified-library-overlay')?.dataset.searchReadiness === 'ready', null, { timeout: 90_000 });
        await ui.locator('[data-unilib-type="pdf"]').click();
        await page.waitForTimeout(1500);
        assert.equal(await ui.locator('[data-unilib-whole]').isVisible(), false, '여러 파일이 켜져 있으면 안 보인다');
        await context.close();
      }
      // ── Lite: 보내기처럼 단추 자체를 숨긴다 ──
      {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await context.newPage();
        await page.addInitScript(() => { for (const p of ['', '5e.preview:']) localStorage.setItem(`${p}5e.tutorial.bannerSeen`, 'true'); });
        await page.goto(URL_);
        const ui = await openPdf(page, 'p1_2026_11');
        await page.evaluate(() => { document.documentElement.dataset.mode = 'lite'; });
        assert.equal(await ui.locator('[data-unilib-whole]').isVisible(), false, 'Lite에서는 「시험지 통째로 변환」이 안 보인다');
        assert.equal(await ui.locator('[data-unilib-send]').isVisible(), false, 'Lite에서는 보내기도 안 보인다');
        await context.close();
      }
      console.log(`${engine.name()}: whole-exam conversion ok`);
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exit(1); });
