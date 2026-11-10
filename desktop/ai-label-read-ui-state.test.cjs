const test = require('node:test');
const assert = require('node:assert/strict');

const workflowPromise = import('../js/ai-image-label-workflow.js');
const attentionPromise = import('../js/ai-result-attention.js');
const runPromise = import('../js/ai-image-label-run.js');

// 11-10 항목 2: 원본 종류를 나중에 고르면 기본 라벨 처리(기출 복원·교과서 삭제)를 맞춘다. 사용자가 직접 바꾼 작업은 그대로 둔다.
test('label result follows the source kind unless the user touched the setting for this task', async () => {
  const { labelResultAfterKindChange } = await workflowPromise;
  assert.equal(labelResultAfterKindChange({ imageKind: 'exam', current: '', touched: false }), 'restore-editable');
  assert.equal(labelResultAfterKindChange({ imageKind: 'general', current: '', touched: false }), 'remove');
  // 기출을 골랐는데 설정이 「끄기」(빈 값)로 남던 문제: 이제 기본값을 쓴다.
  assert.equal(labelResultAfterKindChange({ imageKind: 'exam', current: 'remove', touched: false }), 'restore-editable');
  // 사용자가 직접 정한 설정은 원본 종류가 바뀌어도 유지한다.
  assert.equal(labelResultAfterKindChange({ imageKind: 'exam', current: 'remove', touched: true }), 'remove');
  assert.equal(labelResultAfterKindChange({ imageKind: 'general', current: 'restore-editable', touched: true }), 'restore-editable');
  // 원본 종류가 없으면 현재 값을 그대로 둔다.
  assert.equal(labelResultAfterKindChange({ imageKind: '', current: 'remove', touched: false }), 'remove');
});

// 11-10 항목 5: 라벨 읽기 성공 결과는 「확인 필요」를 띄우지 않는다. 읽기 실패·0개·원본 대체는 띄운다.
test('a successful label-read result is quiet; failed or fallback results still ask for attention', async () => {
  const { isQuietLabelReadResult, markResultReady, pendingResult } = await attentionPromise;
  const candidate = { id: 'c1', kind: 'generated', data: 'data:image/png;base64,AA', reviewState: 'passed' };
  const ok = { status: 'complete', metrics: { labelRead: { count: 2, error: null } }, labelReadNotice: undefined,
    labelPlan: { labels: [{ id: 'L0', text: '온도계' }, { id: 'L1', text: '22°C' }] } };
  assert.equal(isQuietLabelReadResult(ok, candidate), true);

  const tab = { id: 't1', generated: [candidate] };
  assert.equal(markResultReady(tab, { ...candidate, quietCompletion: true }), false);
  assert.equal(pendingResult({ ...tab, resultAttention: undefined }), null);

  // 글자 읽기 실패(안내 문구 있음): 라벨 0개이고 안내가 있으므로 확인 필요를 띄운다.
  const failed = { ...ok, labelReadNotice: '라벨 글자를 읽지 못해 그림만 넣었습니다.', labelPlan: { labels: [] }, metrics: { labelRead: { count: 0, error: 'x' } } };
  assert.equal(isQuietLabelReadResult(failed, candidate), false);
  // 읽기는 됐지만 라벨이 0개인 경우도 조용히 끝내지 않는다.
  assert.equal(isQuietLabelReadResult({ ...ok, labelPlan: { labels: [] } }, candidate), false);
  // 원본 대체(fallback)와 검수 미통과는 조용히 끝내지 않는다.
  assert.equal(isQuietLabelReadResult({ ...ok, status: 'fallback' }, candidate), false);
  assert.equal(isQuietLabelReadResult(ok, { ...candidate, reviewState: 'needs-attention' }), false);
  // 라벨 읽기 경로가 아닌 일반 결과는 기존처럼 확인 필요를 띄운다.
  assert.equal(isQuietLabelReadResult({ ...ok, metrics: {} }, candidate), false);
  const normalTab = { id: 't2', generated: [candidate] };
  assert.equal(markResultReady(normalTab, candidate), true);
  assert.equal(pendingResult(normalTab), 'c1');
});

// 11-10 항목 1: 기출 그림 지시문은 글자가 들어 있던 네모 틀을 틀만 남기고 비우라고 말한다.
test('exam redraw prompt keeps frames that held text as empty frames', async () => {
  const { REDRAW_EXAM_PROMPT, REDRAW_TEXTBOOK_PROMPT } = await runPromise;
  assert.match(REDRAW_EXAM_PROMPT, /글자가 들어 있던 네모 틀·계기 화면은 틀만 남기고 비워 둬\./);
  assert.doesNotMatch(REDRAW_TEXTBOOK_PROMPT, /틀만 남기고/);
});
