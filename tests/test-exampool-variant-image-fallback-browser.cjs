// 11-22 결함 13: 한 문항 「변형」이 한글로 못 바뀌어 원본 그림 한 장짜리 문항으로 들어갈 때(45d5e3d3)
//  - 그림 속 원본 번호(「20.」)가 남아 카드 번호와 번호가 둘이 되던 것 → 번호를 지운다
//  - 아래 「※ 확인 사항」 상자 위 테두리 조각이 붙던 것 → 문항(그림 선지 ⑤)까지만
//  - 카드 제목이 「발문을 입력하세요」이던 것 → 원본 출처(2008학년도 6월 모평 물리학Ⅱ 20번)
// 실제 문항: 2008학년도 6월 모평 물리Ⅱ 20번(선지가 그림이라 실제로도 한글 변환이 실패하는 문항). 한글 변환은 일부러 막는다(AI 없음).
// 원본 PDF는 5E 공유 자료(게이트웨이)에서 받는다(인터넷 필요).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const { openLibrary } = require('./helpers/exampool-open.cjs');

const ID = 'p2_2008_06_20', TITLE = '2008학년도 6월 모평 물리학Ⅱ 20번';
const evidence = process.env.EVIDENCE_DIR ? path.resolve(process.env.EVIDENCE_DIR) : null;

// 원본 PDF는 node에서 한 번 받아(빠른 주소 → 게이트웨이 순) 브라우저 요청에 그대로 돌려준다 — 머리 없는 브라우저의 외부 요청이 막히는 환경에서도 같은 PDF로.
const PDF = '%EA%B8%B0%EC%B6%9C%EB%AC%B8%EC%A0%9C/%EB%AC%BC%EB%A6%AC2/p2_2008_06.pdf';
async function pdfBytes() {
  for (const url of [`https://5e-exam-pdf.5e-desktop.workers.dev/v1/${PDF}`, `https://5e-google-drive-gateway.5e-desktop.workers.dev/v1/google-drive/folders/1N46Woe4wIXs-PoUpVf0Uu4hPkSIUBqgX/public/${PDF}`]) {
    try { const r = await fetch(url); if (r.ok) { const b = Buffer.from(await r.arrayBuffer()); if (b.subarray(0, 5).toString() === '%PDF-') return b; } } catch {}
  }
  throw Error('원본 PDF(2008 6월 물리Ⅱ)를 받지 못했습니다 — 인터넷 연결을 확인하세요.');
}

h.withServer(async origin => {
  const pdf = await pdfBytes();
  for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([k]) => !process.env.BROWSER_ENGINE || k === process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({ headless: true });
    const out = evidence ? path.join(evidence, name) : null; if (out) fs.mkdirSync(out, { recursive: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1512, height: 900 } });
      const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); const net = []; page.on('requestfailed', r => net.push(`${r.url().slice(0, 120)} ${r.failure()?.errorText}`)); page.on('request', r => { if (/\.pdf/.test(r.url())) net.push('요청 ' + r.url().slice(0, 120)); });
      // 한글 변환은 막는다: 미리 변환한 문항 없음 · 변환 엔진을 못 받음 → 그림 한 장짜리 문항으로.
      await page.route(/5e-exam-pdf\.5e-desktop\.workers\.dev\/q\//, r => r.fulfill({ status: 404, body: '' }));
      await page.route(/\/assets\/exampool\/convert\/kice-engine\.js/, r => r.fulfill({ status: 500, body: '' }));
      await h.navigate(page, origin + '/?mode=pro&mobile=0');
      // h.navigate가 바깥 요청을 모두 막으므로(나중에 건 길이 먼저) 그 뒤에 원본 PDF 길을 건다.
      await page.route(/p2_2008_06\.pdf/, r => r.fulfill({ status: 200, body: pdf, headers: { 'content-type': 'application/pdf', 'access-control-allow-origin': '*' } }));
      await h.ready(page);
      await page.addStyleTag({ content: '.tut-pointout,.tut-pointout-ring{display:none!important}' });
      await page.locator('.app-switch-image [data-app-switch="exam"]').evaluate(b => b.click());
      const sheet = await (await page.waitForSelector('#exampool-sheet-workspace iframe')).contentFrame();
      sheet.on?.('pageerror', e => errors.push(e.message));
      await sheet.waitForSelector('.side [data-pool="drafting"]'); await sheet.waitForFunction(() => document.querySelector('#status').textContent !== '준비 중', null, { timeout: 30000 });
      await sheet.evaluate(() => document.querySelector('.side [data-pool="drafting"]').click()); await sheet.click('[data-lv-new]');
      await sheet.click('#new-dialog .nq-opt[data-step="form"][data-k="combo"]'); await sheet.click('#new-dialog .nq-opt[data-step="struct"][data-k="experiment"]'); await sheet.click('#new-dialog [data-nq="go"]');
      await sheet.waitForSelector('#card-view:not([hidden]) .cv-writer');
      await openLibrary(sheet);
      await sheet.selectOption('#card-view [data-cvscope]', 'past');
      await sheet.waitForSelector('#card-view .past-list figure.past', { timeout: 60000 });
      const search = sheet.locator('#card-view .lp-search input').first();
      await search.fill(ID); await search.press('Enter');
      const convert = sheet.locator(`#card-view [data-cvconvert="${ID}"]`).first();
      await convert.waitFor({ state: 'attached', timeout: 60000 });
      // 원본 PDF에서 직접 잘라 보기(라이브러리 크게 보기 그림과 변형용 그림) — 실패하면 그 오류를 그대로 보인다.
      const direct = await sheet.evaluate(async id => {
        try {
          const { loadPastQuestions } = await import('./past-data.js'); const { items } = await loadPastQuestions(['p2']); const item = items.find(i => i.id === id);
          const { croppedQuestion } = await import('./past-pdf.js');
          const size = async url => { const i = new Image(); i.src = url; await i.decode(); return [i.naturalWidth, i.naturalHeight]; };
          const lib = await croppedQuestion(item), bare = await croppedQuestion(item, [], { bare: true });
          return { lib: await size(lib.url), bare: await size(bare.url) };
        } catch (e) { return { error: String(e?.stack || e) }; }
      }, ID);
      assert.ok(!direct.error, `${name}: 원본 PDF에서 문항 자르기 · ${direct.error} · ${net.join(' | ')}`);
      await convert.evaluate(b => b.click());// 카드 위에 커서를 올릴 때만 보이는 단추 — 누르는 것과 같은 동작
      const q = await sheet.evaluate(async title => {
        const db = await new Promise((r, j) => { const o = indexedDB.open('5e-exampool-structure'); o.onsuccess = () => r(o.result); o.onerror = () => j(o.error); });
        let d; for (let k = 0; k < 480; k++) { d = await new Promise(r => { const g = db.transaction('state').objectStore('state').get('draft'); g.onsuccess = () => r(g.result); }); if (d?.questions?.some(x => x.figureOnly)) break; await new Promise(r => setTimeout(r, 250)); }
        db.close();
        const x = d.questions.find(v => v.figureOnly && (v.references?.[0]?.label || '').includes(title));
        if (!x) return null;
        const { questionSubtitle, questionTitle } = await import('./views.js');
        return { name: x.name, ask: x.ask, title: questionTitle(x), subtitle: questionSubtitle(x), answer: x.answer, data: x.blocks?.[0]?.figure?.data || '' };
      }, TITLE);
      if (!q && out) await page.screenshot({ path: path.join(out, 'fail.png') });
      assert.ok(q, `${name}: 그림 한 장짜리 문항이 들어감 · 상태: ${await sheet.evaluate(() => document.querySelector('#status')?.textContent)} · 오류: ${errors.join(' | ')}`);
      if (out) { const m = /^data:image\/(\w+);base64,(.*)$/.exec(q.data); fs.writeFileSync(path.join(out, `after-figure.${m[1] === 'jpeg' ? 'jpg' : m[1]}`), Buffer.from(m[2], 'base64')); }
      // 그림 재기: 첫 글자 줄·둘째 줄의 왼쪽 끝, 아래쪽 넓은 가로줄(상자 테두리), 아래 빈 여백.
      const g = await sheet.evaluate(async src => {
        const img = new Image(); img.src = src; await img.decode();
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const { data, width: W, height: H } = x.getImageData(0, 0, c.width, c.height), ink = (i, j) => { const p = (j * W + i) * 4; return data[p] < 160 && data[p + 1] < 160 && data[p + 2] < 160; };
        // 글자 줄은 왼쪽 절반만 보고 나눈다(오른쪽 그림 칸 점선이 줄 사이를 이어 붙이지 않게).
        const rows = []; for (let j = 0; j < H; j++) { let l = -1, n = 0; for (let i = 0; i < W * 0.5; i++) if (ink(i, j)) { if (l < 0) l = i; n++; } rows.push({ l, n }); }
        const bands = []; for (let j = 0, s = -1; j <= H; j++) { const on = j < H && rows[j].n > 0; if (on && s < 0) s = j; if (!on && s >= 0) { bands.push([s, j - 1]); s = -1; } }
        const left = ([a, b]) => Math.min(...rows.slice(a, b + 1).filter(r => r.l >= 0).map(r => r.l));
        let wideLow = 0; for (let j = Math.floor(H * 0.6); j < H; j++) { let run = 0, best = 0; for (let i = 0; i < W; i++) { run = ink(i, j) ? run + 1 : 0; best = Math.max(best, run); } wideLow = Math.max(wideLow, best / W); }
        let last = H - 1; const any = j => { for (let i = 0; i < W; i++) if (ink(i, j)) return true; return false; }; while (last > 0 && !any(last)) last--;
        return { W, H, line1: left(bands[0]), line2: left(bands[1]), wideLow, tail: H - 1 - last };
      }, q.data);
      if (out) {
        await sheet.evaluate(() => document.querySelector('#card-view')?.scrollIntoView());
        await page.screenshot({ path: path.join(out, 'after-card.png') });
        fs.writeFileSync(path.join(out, 'after.json'), JSON.stringify({ ...q, data: undefined, measure: g }, null, 2));
      }
      assert.equal(q.name, TITLE, '카드 이름은 원본 출처');
      assert.equal(q.subtitle, TITLE, '부제도 「발문을 입력하세요」가 아니라 출처');
      assert.equal(q.ask, '', '발문은 비워 둔다(시험지에 출처 글이 찍히지 않게)');
      // 원본 「20.」은 첫 줄 맨 왼쪽(둘째 줄보다 왼쪽)에 있다 — 지웠으면 첫 줄은 「그림은」부터라 둘째 줄보다 오른쪽에서 시작한다.
      assert.ok(g.line1 > g.line2 + 10, `${name}: 원본 번호 지움 (첫 줄 ${g.line1}px · 둘째 줄 ${g.line2}px)`);
      assert.ok(g.wideLow < 0.6, `${name}: 아래 「확인 사항」 상자 테두리 없음 (가장 긴 가로줄 ${Math.round(g.wideLow * 100)}%)`);
      assert.ok(g.tail <= 40, `${name}: 아래 빈 여백은 조금만 (${g.tail}px)`);
      assert.ok(g.H > g.W * 0.5, `${name}: 그림 선지 ④⑤까지 남음 (${g.W}×${g.H})`);
      assert.deepEqual(errors.filter(e => !/kice-engine|Failed to fetch dynamically imported module|Importing a module script failed/.test(e)), [], `${name}: 페이지 오류 없음`);
      await context.close();
      console.log(`${name}: 그림 변형 문항 ${g.W}×${g.H}, 첫 줄 ${g.line1} > 둘째 줄 ${g.line2}, 아래 여백 ${g.tail}px — 통과`);
    } finally { await browser.close(); }
  }
}).catch(error => { console.error(error); process.exitCode = 1; });
