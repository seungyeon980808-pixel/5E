import assert from 'node:assert/strict';
import { describeGraphFailure } from '../js/graph/reconstruction-error.js';
for (const [message, code] of [['429 Too Many Requests', 'GRAPH_RATE_LIMIT'], ['401 unauthorized', 'GRAPH_AUTH'], ['선택 모델 gpt-6.1-sol을 사용할 수 없습니다.', 'GRAPH_MODEL_UNAVAILABLE'], ['network disconnected', 'GRAPH_CONNECTION'], ['timeout', 'GRAPH_TIMEOUT']]) {
  const value = describeGraphFailure(new Error(message));
  assert.equal(value.code, code); assert.equal(value.detail, message); assert.equal(value.automaticRetry, false); assert.match(value.message, /이전 결과/);
}
assert.equal(describeGraphFailure(Object.assign(new Error('invalid'), { code: 'GRAPH_INVALID_RESULT' })).code, 'GRAPH_INVALID_RESULT');
assert.equal(describeGraphFailure(new Error('Expected series')).code, 'GRAPH_FAILED');
console.log('Graph failures keep provider reason, fixed selection and no automatic retry PASS');
