const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const read = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('reviewed workflow migrates to Sol medium and later explicit choices remain authoritative',()=>{
  const panel=read('js/ai-panel.js'), html=read('index.html');
  assert.match(panel,/aiReviewDefaultsVersion/);
  assert.match(panel,/sessionStorage\.setItem\("5e\.aiModelExplicit", AI_IMAGE_REVIEW_MODEL\)/);
  assert.match(panel,/localStorage\.setItem\("5e\.aiEffort", AI_IMAGE_GENERATION_EFFORT\)/);
  assert.match(panel,/sessionStorage\.setItem\("5e\.aiModelExplicit", modelSelect\.value\)/);
  assert.doesNotMatch(panel,/runInput\.model = AI_IMAGE_REVIEW_MODEL/,'selected generation model must not be silently replaced at send time');
  assert.match(panel,/modelWarning\.hidden = !modelSelect\.value \|\| modelSelect\.value === AI_IMAGE_REVIEW_MODEL/);
  assert.match(html,/권장 기본값은 Sol · 보통입니다/);
  assert.doesNotMatch(html,/Luna 외 모델은 생성 시간이 길어질/);
});
