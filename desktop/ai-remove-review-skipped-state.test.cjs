// 11-10: 라벨 삭제 기본 흐름(검수 건너뜀)의 성공 결과는 「검수 미통과」「확인 필요」 없이 완료로 보인다.
// 원본 대체(fallback)는 여전히 확인 필요를 띄운다.
const test = require('node:test');
const assert = require('node:assert/strict');

const reviewPromise = import('../js/ai-image-review.js');
const pngPromise = import('../js/ai-png-inspection.js');
const attentionPromise = import('../js/ai-result-attention.js');

const generalRemove = { explicit: true, imageKind: 'general', labelResult: 'remove' };
const skippedReport = { verdict: 'pass', checks: [], issues: [], reviewSkipped: true };
const fallbackReport = { verdict: 'uncertain', checks: [], issues: [{ code: 'ai-fallback-result', message: '변환을 끝내지 못해 원본 그림을 그대로 두었습니다.', severity: 'major' }] };

test('a skipped-review remove result passes the review gate without any check items', async () => {
  const { enforceImageLabelAcceptance, isImageLabelCandidateAccepted } = await reviewPromise;
  const gate = enforceImageLabelAcceptance(skippedReport, { workflow: generalRemove, candidateSha256: 'abc' });
  assert.equal(gate.accepted, true);
  assert.equal(gate.strictAccepted, true);
  assert.equal(gate.state, 'passed');
  assert.equal(gate.report.verdict, 'pass');
  assert.equal(isImageLabelCandidateAccepted({ imageLabelWorkflow: generalRemove, reviewState: 'passed', reviewReport: skippedReport }), true);
  // 검수 상태가 실패로 남아 있으면 그대로 실패로 본다.
  assert.equal(isImageLabelCandidateAccepted({ imageLabelWorkflow: generalRemove, reviewState: 'needs-attention', reviewReport: skippedReport }), false);
});

test('a malformed report without the skip marker still blocks on the remove path', async () => {
  const { enforceImageLabelAcceptance } = await reviewPromise;
  assert.equal(enforceImageLabelAcceptance({ verdict: 'pass', checks: [], issues: [] }, { workflow: generalRemove }).accepted, false);
});

test('the PNG pixel gate does not mark a skipped-review remove result as failed', async () => {
  const { enforcePngAcceptance } = await pngPromise;
  const candidate = { id: 'c1', kind: 'generated', data: 'data:image/png;base64,AA' };
  const detail = { state: 'passed', report: skippedReport };
  const gated = enforcePngAcceptance(detail, candidate);
  assert.equal(gated.state, 'passed');
  assert.equal(gated.report, skippedReport);
});

test('a skipped-review remove result is not failed by colour, but still fails on transparent pixels', async () => {
  const { enforcePngAcceptance } = await pngPromise;
  const passed = { state: 'passed', report: skippedReport };
  const colourful = { id: 'c3', kind: 'generated', data: 'data:image/png;base64,AA', pixelInspection: { opaque: true, strictlyAchromatic: false, chromaticPixels: 224577 } };
  assert.equal(enforcePngAcceptance(passed, colourful).state, 'passed');
  const transparent = { id: 'c4', kind: 'generated', data: 'data:image/png;base64,AA', pixelInspection: { opaque: false, strictlyAchromatic: true, chromaticPixels: 0 } };
  assert.equal(enforcePngAcceptance(passed, transparent).state, 'needs-attention');
});

test('the PNG pixel gate still downgrades a normal pass that has no pixel inspection', async () => {
  const { enforcePngAcceptance } = await pngPromise;
  const candidate = { id: 'c2', kind: 'generated', data: 'data:image/png;base64,AA' };
  const gated = enforcePngAcceptance({ state: 'passed', report: { verdict: 'pass', checks: [], issues: [] } }, candidate);
  assert.equal(gated.state, 'needs-attention');
});

test('a successful skipped-review remove result is quiet; the original-image fallback is not', async () => {
  const { isQuietSkippedReviewResult, markResultReady } = await attentionPromise;
  const { enforceImageLabelAcceptance } = await reviewPromise;
  const candidate = { id: 'r1', kind: 'generated', data: 'data:image/png;base64,AA', reviewState: 'passed' };
  const ok = { status: 'complete', metrics: { reviewSkipped: true }, labelReadNotice: undefined };
  assert.equal(isQuietSkippedReviewResult(ok, candidate), true);
  assert.equal(markResultReady({ id: 't1', generated: [candidate] }, { ...candidate, quietCompletion: true }), false);

  // 원본 대체 결과: 검수 건너뜀 표시가 없고 fallback 사유가 남으므로 조용히 끝내지 않는다.
  const fallback = { status: 'fallback', metrics: { reviewSkipped: true } };
  assert.equal(isQuietSkippedReviewResult(fallback, candidate), false);
  const fallbackGate = enforceImageLabelAcceptance(fallbackReport, { workflow: generalRemove });
  assert.equal(fallbackGate.accepted, false);
  assert.equal(fallbackGate.state, 'needs-attention');
  assert.equal(isQuietSkippedReviewResult({ status: 'complete', metrics: {} }, candidate), false);
  assert.equal(isQuietSkippedReviewResult(ok, { ...candidate, reviewState: 'needs-attention' }), false);
});

test('the original-image fallback keeps needs-attention through the PNG gate', async () => {
  const { enforcePngAcceptance } = await pngPromise;
  const candidate = { id: 'f1', kind: 'generated', data: 'data:image/png;base64,AA' };
  const detail = { state: 'needs-attention', report: fallbackReport };
  assert.equal(enforcePngAcceptance(detail, candidate).state, 'needs-attention');
});
