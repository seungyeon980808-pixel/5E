const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../js/ai-source-label-plan.js');

test('shared source truth policies remain verbatim; pixel observations are exam-only', async () => {
  const { buildSourceLabelAnalysisPrompt } = await modulePromise;
  const { SOURCE_OBSERVATION_PROMPT } = await import('../js/ai-source-observation-wire.js');
  const { SOURCE_LABEL_OWNERSHIP_POLICY } = await import('../js/ai-editable-image-labels.js');
  const { SOURCE_GEOMETRY_PROMPT, SOURCE_REMOVAL_REGIONS_PROMPT } = await import('../js/ai-label-source-geometry.js');
  for (const imageKind of ['general','exam']) {
    const prompt = buildSourceLabelAnalysisPrompt({workflow:{imageKind}});
    const shared = SOURCE_OBSERVATION_PROMPT.slice(0,SOURCE_OBSERVATION_PROMPT.indexOf('기출 제거를 위해'));
    for (const policy of [shared,SOURCE_LABEL_OWNERSHIP_POLICY,SOURCE_GEOMETRY_PROMPT]) assert.ok(prompt.includes(policy));
    assert.equal(prompt.includes(SOURCE_REMOVAL_REGIONS_PROMPT),imageKind==='exam');
    assert.ok(prompt.includes('원문·소속·구조 판독이 불확실하면 그대로 기록'));
    assert.equal(prompt.includes('일반 분석에서 픽셀 획 마스크를 만들지 못했다는 이유만으로'),imageKind==='general');
    assert.equal(prompt.includes('픽셀 검증용 탐색 허가'),imageKind==='exam');
    assert.ok(prompt.includes('누락된 문자나 잘린 영역은 추측하지 않는다'));
    assert.equal(prompt.includes('기출 국소 제거에 필요한 원본 관찰이다'),imageKind==='exam');
  }
});
