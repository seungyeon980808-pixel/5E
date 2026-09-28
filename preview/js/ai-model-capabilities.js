const remedy = '모델 목록을 새로고침하고 다시 선택해 주세요. 계속되면 데스크톱 앱과 Codex를 업데이트해 주세요.';
const identifier = value => typeof value === 'string' && value.length > 0 && value.trim() === value;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(`${message} ${remedy}`); };

function optionValues(options, fields, label) {
  if (!Array.isArray(options)) fail(`${label} 기능 정보가 없습니다.`);
  const values = options.map(option => {
    const value = typeof option === 'string' ? option : object(option) ? fields.map(field => option[field]).find(identifier) : null;
    if (!identifier(value)) fail(`${label} 기능 정보 형식이 잘못되었습니다.`);
    return value;
  });
  return [...new Set(values)];
}

/** Provider catalog describes request parameters, not access to an image generation tool. */
export function readAIModelCatalog(catalog) {
  const entries = Array.isArray(catalog) ? catalog : catalog?.data;
  if (!Array.isArray(entries) || !entries.length) fail('사용 가능한 모델 목록을 받지 못했습니다.');
  const seen = new Set();
  return entries.map(entry => {
    if (!object(entry)) fail('모델 목록 형식이 잘못되었습니다.');
    const model = entry.model || entry.id;
    if (!identifier(model) || seen.has(model)) fail('모델 ID가 없거나 중복되었습니다.');
    seen.add(model);
    if (entry.hidden === true) return null;
    const efforts = optionValues(entry.supportedReasoningEfforts, ['reasoningEffort', 'effort'], `${model} 추론`);
    const tiers = optionValues(entry.serviceTiers, ['serviceTier', 'id', 'value'], `${model} 서비스 등급`);
    // Non-reasoning models can advertise an empty choice list and a fixed default.
    if (!efforts.length && identifier(entry.defaultReasoningEffort)) efforts.push(entry.defaultReasoningEffort);
    return { model, displayName: entry.displayName || model, efforts, tiers, defaultEffort: entry.defaultReasoningEffort, defaultServiceTier: entry.defaultServiceTier, isDefault: entry.isDefault === true };
  }).filter(Boolean);
}

export function resolveAIModelSelection(selection, catalog) {
  const model = selection?.model;
  let entry;
  try { entry = readAIModelCatalog(catalog).find(item => item.model === model); }
  catch (error) { throw new Error(`선택 모델 ${identifier(model) ? model : '(없음)'}: ${error.message}`); }
  if (!identifier(model) || !entry) fail(`선택 모델 ${identifier(model) ? model : '(없음)'}을 사용할 수 없습니다.`);
  if (!identifier(selection.effort) || !entry.efforts.includes(selection.effort)) fail(`${model}의 선택 추론 설정 ${selection.effort ?? '(없음)'}을 사용할 수 없습니다.`);
  const serviceTier = selection.serviceTier ?? null;
  if (serviceTier !== null && (!identifier(serviceTier) || !entry.tiers.includes(serviceTier))) fail(`${model}의 선택 서비스 등급 ${serviceTier}을 사용할 수 없습니다.`);
  return { model, effort: selection.effort, serviceTier };
}

/** Defaults only initialize absent preferences; stale explicit values must be surfaced. */
export function defaultAIModelSelection(catalog, preference = {}) {
  const entries = readAIModelCatalog(catalog);
  const model = Object.hasOwn(preference, 'model') ? preference.model : (entries.find(entry => entry.isDefault)?.model ?? entries[0]?.model);
  const entry = entries.find(item => item.model === model);
  return resolveAIModelSelection({
    model,
    effort: Object.hasOwn(preference, 'effort') ? preference.effort : entry?.defaultEffort,
    serviceTier: Object.hasOwn(preference, 'serviceTier') ? preference.serviceTier : entry?.defaultServiceTier ?? null,
  }, catalog);
}
