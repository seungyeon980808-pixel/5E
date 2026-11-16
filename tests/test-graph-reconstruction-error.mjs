import assert from 'node:assert/strict';
import { describeGraphFailure } from '../js/graph/reconstruction-error.js';
for (const [message, code] of [['429 Too Many Requests', 'GRAPH_RATE_LIMIT'], ['401 unauthorized', 'GRAPH_AUTH'], ['선택 모델 gpt-6.1-sol을 사용할 수 없습니다.', 'GRAPH_MODEL_UNAVAILABLE'], ['network disconnected', 'GRAPH_CONNECTION'], ['timeout', 'GRAPH_TIMEOUT']]) {
  const value = describeGraphFailure(new Error(message));
  assert.equal(value.code, code); assert.equal(value.detail, message); assert.equal(value.automaticRetry, false); assert.match(value.message, /이전 결과/);
}
assert.equal(describeGraphFailure(Object.assign(new Error('invalid'), { code: 'GRAPH_INVALID_RESULT' })).code, 'GRAPH_INVALID_RESULT');
assert.equal(describeGraphFailure(new Error('Expected series')).code, 'GRAPH_FAILED');
const refusal = describeGraphFailure(Object.assign(new Error('시간 축 최소값은 최대값보다 작게 지정하세요.'), { code: 'GRAPH_DESCRIPTION_REJECTED' }));
assert.match(refusal.message, /최소값은 최대값보다 작게/);
assert.equal(refusal.automaticRetry, false);
assert.match(refusal.message, /이전 결과는 유지/);
assert.doesNotMatch(describeGraphFailure(Object.assign(new Error('private validation detail'), { code: 'GRAPH_INVALID_RESULT' })).message, /private validation detail/);
console.log('Graph failures keep provider reason, fixed selection and no automatic retry PASS');
