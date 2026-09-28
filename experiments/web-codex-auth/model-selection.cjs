const { RequestError } = require('./generation.cjs');

async function listModels(runtime) {
  const data = [];
  const cursors = new Set();
  let cursor;
  do {
    const page = await runtime.rpc('model/list', { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) });
    if (!Array.isArray(page.data)) throw new RequestError(503, '모델 목록을 확인하지 못했습니다. 다시 연결해 주세요.');
    data.push(...page.data.filter(model => !model.hidden));
    cursor = page.nextCursor;
    if (cursor && cursors.has(cursor)) throw new RequestError(503, '모델 목록을 확인하지 못했습니다. 다시 연결해 주세요.');
    cursors.add(cursor);
  } while (cursor);
  return { data, nextCursor: null };
}

async function resolveSelection(runtime, requested) {
  const { data } = await listModels(runtime);
  const model = requested.model === undefined
    ? data.find(item => item.isDefault)
    : data.find(item => (item.model || item.id) === requested.model);
  if (!model) throw new RequestError(422, '선택한 모델을 현재 연결에서 사용할 수 없습니다. 모델 목록을 다시 확인해 주세요.');
  const effort = requested.effort === undefined ? model.defaultReasoningEffort : requested.effort;
  if (!(effort === null && model.supportedReasoningEfforts?.length === 0) && !model.supportedReasoningEfforts?.some(item => (item.reasoningEffort || item.effort || item) === effort)) {
    throw new RequestError(422, '선택한 사고 수준을 이 모델에서 사용할 수 없습니다.');
  }
  const serviceTier = requested.serviceTier === undefined ? null : requested.serviceTier;
  if (serviceTier !== null && !model.serviceTiers?.some(item => (typeof item === 'string' ? item : (item.serviceTier || item.id || item.value)) === serviceTier)) {
    throw new RequestError(422, '선택한 속도를 이 모델에서 사용할 수 없습니다.');
  }
  return Object.freeze({ model: model.model || model.id, effort, serviceTier });
}
module.exports = { listModels, resolveSelection };
