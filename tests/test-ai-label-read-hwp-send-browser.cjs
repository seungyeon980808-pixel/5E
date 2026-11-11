'use strict';

// 11-10: 라벨 복원(기본, 글자 읽기 통로)으로 만든 AI 결과를 한글로 보낼 때 그림과 라벨(지시선 라벨 labeler + 글자 라벨 text)이
// 함께, 그림 기준 위치를 지키며, 검정 잉크·역할 글꼴로, 실패 없이 들어가는지 확인한다.
// 두 길을 본다: (A) 캔버스에 넣은 뒤 캔버스 → 5E_hwp, (B) AI 패널 「한글로 보내기」. AI 호출은 없다(합성 응답·글자 읽기 스텁).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const { instrumentAiMain } = require('./helpers/canonical-fixture-adapter.cjs');
const root = path.resolve(__dirname, '..');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/feedback/parts/ai-label-read-hwp-send');
process.env.APP_ENTRY = '/';

// 라벨 읽기 결과(글자 읽기 통로의 항목)를 labelPlanFromRead로 만든 계획. 같은 입력을 쓰는 test-ai-label-read-insert-browser와 맞춘다.
const READ_PLAN = {"version":4,"policyVersion":4,"frozen":true,"status":"ready","labels":[
  {"id":"L0","scope":"general","contentMode":"text","mode":"leader","text":"온도계","position":{"x":0.12,"y":0.095},"anchor":{"x":0.45,"y":0.45},"typography":{"role":"text","bounds":{"x":0.05,"y":0.06,"w":0.14,"h":0.07}},"measuredSize":0.0595,"sizeFromBox":true},
  {"id":"L1","scope":"general","contentMode":"text","mode":"leader","text":"젓개","position":{"x":0.84,"y":0.095},"anchor":{"x":0.6,"y":0.42},"typography":{"role":"text","bounds":{"x":0.78,"y":0.06,"w":0.12,"h":0.07}},"measuredSize":0.0595,"sizeFromBox":true},
  {"id":"L2","scope":"general","contentMode":"text","mode":"text","text":"물","position":{"x":0.395,"y":0.855},"anchor":{"x":0.395,"y":0.855},"typography":{"role":"text","bounds":{"x":0.36,"y":0.82,"w":0.07,"h":0.07}},"measuredSize":0.0595,"sizeFromBox":true}
],"excludedLabels":[],"preservedMarks":[],"uncertainties":[],"reviewRequired":false,"rejectedCount":0,"relationGroups":[],"sourceBindings":[]};

const lifecycle = fs.readFileSync(path.join(root, 'tests/test-ai-workspace-lifecycle-browser.cjs'), 'utf8');
const start = lifecycle.indexOf('function seedRequestWorkspaces(');
const end = lifecycle.indexOf('\nasync function requestBrowserFixture(', start);
assert.ok(start >= 0 && end > start, 'lifecycle seed helper must exist');
const seed = lifecycle.slice(start, end).replace('window.__task5Expected = structuredClone(tabs);', `
  for (const tab of tabs) { tab.conversionKind = 'image'; tab.generated[0].reviewState = 'scoped-applied'; }
  // 11-10: 라벨 읽기 성공 결과의 실제 모양(ai-image-label-run.js 535~545): 검수 건너뜀(reviewSkipped), reviewRequired false.
  const readReport = ${JSON.stringify({ verdict: 'pass', checks: [], issues: [], reviewSkipped: true })};
  tabs[0].generated[0] = { ...tabs[0].generated[0], reviewState: 'passed', reviewReport: readReport,
    imageLabelWorkflow: { imageKind: 'general', labelResult: 'restore-editable' },
    labelPlan: { ...${JSON.stringify(READ_PLAN)}, qualityReview: readReport, reviewRequired: false, candidateSha256: 'label-read-stub' } };
  window.__task5Expected = structuredClone(tabs);`);

const dark = hex => /^#(0{3}|0{6}|1{3}|1{6}|2{3}|2{6})$/i.test(String(hex || '').trim());
const labelsOf = objects => objects.filter(o => o.aiAutoLabel === true);
const imageOf = objects => objects.find(o => o.type === 'image');

// 그림 안의 라벨 위치를 그림 크기로 나눠 비교한다(그림이 옮겨지거나 키워져도 상대 위치는 같아야 한다).
// 지시선 라벨(labeler)은 p2가 글자 상자, p1이 지시선 끝점이고, 글자만 있는 라벨(text)은 x,y가 글자 위치다.
function relativeLabels(objects) {
  const image = imageOf(objects);
  assert.ok(image, 'image object exists in the document page');
  return labelsOf(objects).map(o => {
    const at = o.type === 'labeler' ? o.p2 : { x: o.x, y: o.y };
    const tip = o.type === 'labeler' ? o.p1 : null;
    return {
      text: o.text, type: o.type,
      rx: (at.x - image.x) / image.w, ry: (at.y - image.y) / image.h,
      tx: tip ? (tip.x - image.x) / image.w : null, ty: tip ? (tip.y - image.y) / image.h : null,
    };
  });
}

// 라벨 계획(READ_PLAN)의 위치: 글자 상자 위치와 지시선 끝점(anchor).
const PLAN = Object.fromEntries(READ_PLAN.labels.map(l => [l.text, { at: l.position, anchor: l.anchor }]));

function assertLabels(objects, label) {
  const labels = labelsOf(objects);
  const image = imageOf(objects);
  assert.ok(image, `${label}: picture object present`);
  assert.equal(labels.length, 3, `${label}: three native labels (two leader labelers + one text)`);
  assert.deepEqual(labels.map(o => o.text).sort(), ['물', '온도계', '젓개'], `${label}: label texts preserved`);
  assert.deepEqual(labels.map(o => o.type).sort(), ['labeler', 'labeler', 'text'], `${label}: label object kinds`);
  // 같은 그림의 라벨 글자 크기는 한 기준(잰 글자 높이)에서 나온다(±15%).
  const sizes = labels.map(o => o.labelSize ?? o.fontSize);
  assert.ok(Math.max(...sizes) <= Math.min(...sizes) * 1.15, `${label}: label sizes are consistent (${sizes.join(',')})`);
  for (const o of labels) {
    assert.notEqual(o.aiLabelReviewRequired, true, `${label}: ${o.text} is not review-flagged`);
    assert.notEqual(o.aiTargetReviewRequired, true, `${label}: ${o.text} target is not review-flagged`);
    // 잉크 색 필드가 없으면 기본 검정이다. 있다면 검정이어야 한다.
    assert.ok(o.color === undefined || dark(o.color), `${label}: ${o.text} is black ink (${o.color})`);
    assert.match(String(o.fontFamily || ''), /돋움|Dotum|맑은 고딕|Malgun|Apple SD Gothic/, `${label}: ${o.text} uses the text-role Korean font`);
  }
  for (const r of relativeLabels(objects)) {
    const plan = PLAN[r.text];
    assert.ok(Math.abs(r.rx - plan.at.x) < 0.06 && Math.abs(r.ry - plan.at.y) < 0.06,
      `${label}: ${r.text} sits where the picture-relative plan puts it (${r.rx.toFixed(3)},${r.ry.toFixed(3)} vs ${plan.at.x},${plan.at.y})`);
    if (r.tx !== null) assert.ok(Math.abs(r.tx - plan.anchor.x) < 0.06 && Math.abs(r.ty - plan.anchor.y) < 0.06,
      `${label}: ${r.text} leader ends on the picture-relative anchor (${r.tx.toFixed(3)},${r.ty.toFixed(3)})`);
  }
}

h.withServer(async origin => {
  fs.mkdirSync(evidence, { recursive: true });
  const engines = Object.entries({ chromium, webkit }).filter(([k]) => !process.env.BROWSER_ENGINE || k === process.env.BROWSER_ENGINE);
  for (const [engineName, engine] of engines) {
    const browser = await engine.launch({ headless: true });
    const results = {};
    try {
      // (B) AI 패널 「한글로 보내기」: 라벨 켜짐(기본) 상태의 작업을 바로 보낸다.
      for (const route of ['canvas', 'panel']) {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
          await page.addInitScript({ content: seed + '\nseedRequestWorkspaces(1);' });
          const observed = instrumentAiMain(root, { manager: '__directManager', state: '__directState' });
          await page.route('**/js/main.js?*', route => route.fulfill({ contentType: 'text/javascript', body: observed.body }));
          await h.navigate(page, origin + '/?mode=pro&mobile=0&exam=0'); await h.ready(page);
          const ai = page.locator('#ai-image-panel');
          if (!await ai.isVisible()) await page.locator('#ai-image-install-open').click();
          await ai.locator('[data-tab-id="task-0"] .ai-task-tab-select').click();
          await page.waitForFunction(() => document.querySelector('#ai-image-panel .ai-task-tab.is-on')?.dataset.tabId === 'task-0');
          const toggle = ai.locator('[data-ai-label-toggle-state]');
          results[route + 'LabelToggle'] = await toggle.count() ? (await toggle.textContent()).trim() : null;
          const newDoc = page.locator('[data-dialog-purpose="hwp"]').getByRole('button', { name: '새 문서 만들기', exact: true });
          if (route === 'canvas') {
            await ai.locator('[data-ai-insert-selected]').click(); await ai.waitFor({ state: 'hidden' });
            await h.crop(page);
          } else {
            await h.crop(page, '#ai-image-panel [data-ai-exam-send]');
          }
          if (await newDoc.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) await newDoc.click();
          await h.place(page);
          const pictures = await h.pictures(page);
          assert.equal(pictures.length, 1, `${engineName}/${route}: one picture is placed`);
          const objects = pictures[0].figure.source.pages[0].objects;
          const dump = { engine: engineName, route, objects: objects.map(o => ({ ...o, data: o.data ? '[data]' : undefined, labelPlan: undefined })) };
          fs.writeFileSync(path.join(evidence, `${engineName}-${route}-objects.json`), JSON.stringify(dump, null, 2));
          assertLabels(objects, `${engineName}/${route}`);
          assert.deepEqual(errors, [], `${engineName}/${route}: no page errors`);
          results[route] = { labels: labelsOf(objects).length, pictures: pictures.length, errors: errors.length };
        } finally {
          await page.screenshot({ path: path.join(evidence, `${engineName}-${route}.png`) }).catch(() => {});
          await page.close();
        }
      }
      console.log(engineName + ': label-read labels sent with the picture from both routes', JSON.stringify(results));
    } finally {
      await browser.close();
    }
  }
}).catch(error => { console.error(error); process.exitCode = 1; });
