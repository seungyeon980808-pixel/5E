// 11-10: 라벨 읽기 결과를 캔버스에 넣은 뒤 라벨 하나만 옮길 수 있는지, 그리고 검수 표시가 붙지 않는지 확인한다.
// 라벨 읽기 계획(labelPlanFromRead)을 실제 모듈로 만들어 insertImageFromSrc로 넣는다(AI 호출은 없다).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const evidence = process.env.EVIDENCE_DIR || path.resolve(__dirname, '../.omo/evidence/ai-label-read-insert-1110');
const preview = process.env.PREVIEW_URL;
assert.ok(preview, 'PREVIEW_URL is required (run through tests/run-browser-tests.cjs)');
const v = '?v=1.7.0-four-session-integration';

test('label-read labels insert without review flags and a targeted label moves alone', { timeout: 120000 }, async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.addInitScript(() => localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true'));
    await page.goto(preview + '?mode=pro', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async v => {
      const { state } = await import('/js/state.js' + v);
      const insert = await import('/js/image-paste.js' + v);
      const run = await import('/js/ai-image-label-run.js' + v);
      window.labelQA = { state, insertImageFromSrc: insert.insertImageFromSrc, labelPlanFromRead: run.labelPlanFromRead };
      await document.fonts.ready;
    }, v);

    // 원본 그림 한 장과 라벨 읽기 결과(0~1 비율 좌표, 지시선 있음·없음)를 준비한다.
    const result = await page.evaluate(async () => {
      const q = labelQA;
      q.state.update(s => {
        s.objects = []; s.groups = []; s.selectedIds = []; s.targetedId = null; s.activeTool = 'V';
        s.artboard = { w: 240, h: 180 }; s.layers = [{ id: 1, visible: true, name: 'QA' }]; s.activeLayerId = 1;
        s.viewBox = { x: -130, y: -100, w: 260, h: 200 }; s.undoStack = []; s.redoStack = [];
      });
      const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 200;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 300, 200);
      ctx.strokeStyle = '#111'; ctx.lineWidth = 4; ctx.strokeRect(60, 40, 180, 120);
      const src = canvas.toDataURL('image/png');
      const items = [
        { text: '온도계', kind: 'ko', x: 0.05, y: 0.06, w: 0.14, h: 0.07, leader: { x2: 0.45, y2: 0.45 } },
        { text: '젓개', kind: 'ko', x: 0.78, y: 0.06, w: 0.12, h: 0.07, leader: { x2: 0.6, y2: 0.42 } },
        { text: '물', kind: 'ko', x: 0.36, y: 0.82, w: 0.07, h: 0.07 },
      ];
      const base = q.labelPlanFromRead(items);
      // 검수가 붙은 것처럼 흉내 낸다(회귀 재현): 라벨 읽기 결과인데 검수 표시가 섞인 계획.
      const plan = { ...structuredClone(base), qualityReview: { verdict: 'pass', checks: [], issues: [], reviewSkipped: true },
        reviewRequired: true, status: 'review', candidateSha256: 'stub-candidate' };
      await q.insertImageFromSrc(q.state, src, { editableLabelPlan: plan, centerArtboard: true, aiTaskId: 'task-read', aiCandidateId: 'cand-read' });
      // 캔버스에 삽입(ai-candidate-materializer.js의 bundleWithImage 묶음)과 같은 방식으로 그림과 라벨을 한 그룹에 묶는다.
      const image0 = q.state.get().objects.find(o => o.type === 'image');
      const gid = `${image0.id}_image_labels`;
      q.state.update(s => {
        for (const o of s.objects) if (o.type === 'image' || o.aiAutoLabel === true) o.groupId = gid;
        s.groups.push({ id: gid, memberIds: s.objects.filter(o => o.groupId === gid).map(o => o.id) });
      });
      const objects = q.state.get().objects;
      const image = objects.find(o => o.type === 'image');
      const labels = objects.filter(o => o.aiAutoLabel === true);
      return {
        imageId: image?.id, imagePlanReview: image?.aiEditableLabelPlan?.reviewRequired,
        labels: labels.map(o => ({ id: o.id, type: o.type, text: o.text, groupId: o.groupId, aiLabelReviewRequired: o.aiLabelReviewRequired,
          aiTargetReviewRequired: o.aiTargetReviewRequired ?? null })),
      };
    });
    fs.writeFileSync(path.join(evidence, 'insert-result.json'), JSON.stringify(result, null, 2));
    assert.ok(result.imageId, 'image inserted');
    assert.equal(result.labels.length, 3, 'three label objects (2 leader labelers + 1 text)');
    assert.equal(result.imagePlanReview, false, 'label-read plan must not stay review-required');
    for (const label of result.labels) {
      assert.equal(label.aiLabelReviewRequired, false, `${label.text} must not be aiLabelReviewRequired`);
      assert.notEqual(label.aiTargetReviewRequired, true, `${label.text} must not be aiTargetReviewRequired`);
      assert.equal(label.groupId, `${result.imageId}_image_labels`, `${label.text} shares the image group`);
    }

    // 지목(더블클릭) 후 편집기를 Esc로 닫고, 라벨 하나를 끈다. 나머지 개체는 그대로여야 한다.
    const geometry = () => page.evaluate(() => labelQA.state.get().objects.map(o => ({
      id: o.id, text: o.text, type: o.type, x: o.x, y: o.y, p1: o.p1, p2: o.p2, groupId: o.groupId,
    })));
    // 라벨 요소는 상태가 바뀐 뒤 비동기로 다시 그려진다. 나타날 때까지 기다린 뒤 가운데 좌표를 읽는다.
    const center = async id => {
      await page.waitForFunction(id => [...document.querySelectorAll('#scene [data-id]')].some(e => e.dataset.id === id), id, { timeout: 10000 });
      return page.evaluate(id => {
        const el = [...document.querySelectorAll('#scene [data-id]')].find(e => e.dataset.id === id);
        const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }, id);
    };
    const idOf = text => result.labels.find(label => label.text === text).id;
    const dragOne = async (text, dx, dy, { handle = false } = {}) => {
      const id = idOf(text);
      const before = await geometry();
      const c = await center(id);
      await page.mouse.dblclick(c.x, c.y);
      await page.waitForFunction(id => labelQA.state.get().targetedId === id, id);
      // 편집기가 열리면 「취소」로 닫는다(사용자가 하는 순서와 같다).
      const cancel = page.locator('button', { hasText: /^취소$/ }).first();
      await cancel.waitFor({ state: 'visible', timeout: 5000 });
      await cancel.click();
      await page.waitForTimeout(200);
      const targeted = await page.evaluate(() => labelQA.state.get().targetedId);
      assert.equal(targeted, id, `${text} is targeted after double-click`);
      const at = handle ? await page.evaluate(id => { const h = [...document.querySelectorAll('#handles [data-handle="p1"]')].find(e => !e.dataset.id || e.dataset.id === id); const b = h.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, id) : await center(id);
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await page.mouse.move(at.x + dx / 2, at.y + dy / 2, { steps: 4 });
      await page.mouse.move(at.x + dx, at.y + dy, { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(150);
      const after = await geometry();
      const moved = after.filter((o, i) => JSON.stringify({ ...o }) !== JSON.stringify(before[i])).map(o => o.id);
      return { id, moved, before, after };
    };

    // 1) 글자만 있는 라벨(text) 이동
    const textMove = await dragOne('물', 60, -30);
    fs.writeFileSync(path.join(evidence, 'text-move.json'), JSON.stringify(textMove, null, 2));
    assert.deepEqual(textMove.moved, [textMove.id], 'only the targeted text label moved');
    const textBefore = textMove.before.find(o => o.id === textMove.id), textAfter = textMove.after.find(o => o.id === textMove.id);
    assert.ok(Math.abs(textAfter.x - textBefore.x) > 0.5 || Math.abs(textAfter.y - textBefore.y) > 0.5, 'text label position changed');

    // 2) 지시선 라벨(labeler) 본체 이동
    await page.evaluate(() => labelQA.state.update(s => { s.targetedId = null; s.selectedIds = []; }));
    const labelerMove = await dragOne('온도계', 50, 20);
    fs.writeFileSync(path.join(evidence, 'labeler-move.json'), JSON.stringify(labelerMove, null, 2));
    assert.deepEqual(labelerMove.moved, [labelerMove.id], 'only the targeted labeler moved');

    // 3) 지시선 끝점(labeler 핸들) 이동: 지목한 라벨 하나의 끝점만 옮긴다.
    const leaderId = idOf('젓개');
    await page.evaluate(() => labelQA.state.update(s => { s.targetedId = null; s.selectedIds = []; }));
    const leaderDrag = await dragOne('젓개', -30, 25, { handle: true });
    fs.writeFileSync(path.join(evidence, 'endpoint-move.json'), JSON.stringify(leaderDrag, null, 2));
    assert.deepEqual(leaderDrag.moved, [leaderId], 'only the targeted labeler endpoint moved');

    const finalState = await page.evaluate(() => labelQA.state.get().objects.map(o => ({ id: o.id, aiLabelReviewRequired: o.aiLabelReviewRequired })));
    assert.ok(finalState.every(o => o.aiLabelReviewRequired !== true), 'no label is review-flagged after moving');
    assert.deepEqual(errors, [], 'no page errors');
  } finally {
    await browser.close();
  }
});
