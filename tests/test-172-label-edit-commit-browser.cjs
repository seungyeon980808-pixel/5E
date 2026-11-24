// 11-24 1.7.2 출시 전 결함(설치판에서 재현, 그림 엔진 세션이 넘김):
// 1) 문구 칸에서 고친 뒤 다른 곳을 누르지 않고 곧바로 다른 라벨을 누르면 고친 글자가 사라짐(데이터 손실)
// 2) 문구 칸 Enter가 줄바꿈만 넣고 반영되지 않음
// 3) 라벨을 골라도 Delete·Backspace로 지워지지 않음
// 4) 「복제 · 라벨 삭제」가 편집 칸 맨 아래에 숨어 있음 → 문구 줄 오른쪽(시안 2026-11-24_라벨삭제-시안)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, snapshot } = require('./fixtures/ai-image-label-workflow.cjs');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/feedback/parts/inline-labels', 'label-edit-commit');
fs.mkdirSync(evidence, { recursive: true });

test('라벨 편집: 곧바로 다른 라벨을 눌러도 고친 문구가 남고, Enter는 반영, Delete는 지움', { timeout: 120000 }, async t => {
  const { page, errors } = await fixture(t, 1, evidence, { selectedPartial: true, unlabeled: true });
  const panel = page.locator('#ai-image-panel'), editor = panel.locator('[data-ai-inline-label-editor]');
  const text = editor.locator('[data-label-text]');
  const ready = () => page.waitForFunction(() => { const s = document.querySelector('#ai-image-panel [data-ai-inline-label-editor]'); return s && !s.hidden && !s.querySelector('[data-label-add]').disabled; });
  const labels = () => page.evaluate(() => [...document.querySelectorAll('#ai-image-panel .ai-label-edit-overlay [data-ai-label-id]')].map(n => n.dataset.aiLabelId).filter((id, i, a) => a.indexOf(id) === i));
  const hit = id => panel.locator(`.ai-label-edit-overlay [data-ai-label-id="${id}"] .ai-label-edit-hit`).first();
  await panel.locator('[data-ai-label-edit]').click(); await ready();
  // 라벨 둘: 하나는 가운데, 하나는 왼쪽 위로 옮겨 겹치지 않게
  await editor.locator('[data-label-add]').click(); await ready();
  await editor.locator('[data-label-add]').click(); await ready();
  await editor.locator('details').evaluate(el => { el.open = true; });
  await editor.locator('[data-label-x]').fill('20'); await editor.locator('[data-label-x]').blur(); await ready();
  await editor.locator('[data-label-y]').fill('20'); await editor.locator('[data-label-y]').blur(); await ready();
  const [a, b] = await labels(); assert.ok(a && b && a !== b, '라벨 두 개');

  // 1) A 문구를 고친 채(포커스 그대로) 곧바로 B를 누른다 → A에 반영되어 있어야 한다
  await hit(a).click(); await ready();
  await text.click(); await text.fill('우심방'); // blur 없음
  await hit(b).click(); await ready();
  assert.equal(await text.inputValue(), '라벨', 'B를 고르면 B의 문구가 보인다');
  await text.click(); await text.fill('우심실');
  await hit(a).click(); await ready();
  assert.equal(await text.inputValue(), '우심방', '결함 1: A에서 고친 문구가 남는다');
  await hit(b).click(); await ready();
  assert.equal(await text.inputValue(), '우심실', '결함 1: 연달아 고친 B의 문구도 남는다');

  // 2) Enter = 반영(줄바꿈 없음), ⇧Enter = 줄바꿈
  await text.click(); await text.fill('좌심실'); await text.press('Enter'); await ready();
  assert.equal(await text.inputValue(), '좌심실', '결함 2: Enter로 줄바꿈이 들어가지 않는다');
  await hit(a).click(); await ready(); await hit(b).click(); await ready();
  assert.equal(await text.inputValue(), '좌심실', '결함 2: Enter로 반영됐다');

  // 3) 라벨을 누르고 Delete → 그 라벨만 지워진다
  await hit(a).click(); await ready();
  await page.keyboard.press('Delete'); await ready();
  assert.deepEqual(await labels(), [b], '결함 3: 고른 라벨이 Delete로 지워진다');

  // 4) 「복제 · 라벨 삭제」는 문구 줄에(스크롤 없이 보임)
  await hit(b).click(); await ready();
  const del = editor.locator('[data-label-delete]'), textBox = await text.boundingBox(), delBox = await del.boundingBox();
  assert.ok(delBox && textBox && delBox.y < textBox.y, '결함 4: 「라벨 삭제」가 문구 칸 위(문구 줄)에 있다');
  assert.ok(await del.isVisible());
  await page.screenshot({ path: path.join(evidence, 'label-edit-after.png') });

  await panel.locator('[data-ai-edit-save]').click();
  await page.waitForFunction(() => document.querySelector('#ai-image-panel [data-ai-status]').textContent.startsWith('수정 저장 완료'));
  const child = (await snapshot(page))[0].generated.at(-1);
  assert.deepEqual(child.labelPlan.labels.map(l => l.text), ['좌심실'], '저장된 판에도 남은 라벨과 문구가 그대로');
  assert.equal(await page.evaluate(() => window.__task2.sends.length), 0);
  assert.deepEqual(errors, []);
});
