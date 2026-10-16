// ExamPool's content names are kept at the handoff boundary. IDs are local UUIDs;
// they must not be mistaken for the original ExamPool database's integer keys.
export const POOL_FORMAT = '5e-exampool';
export const POOL_MAX_BYTES = 128 * 1024 * 1024;
const copy = value => structuredClone(value);
const ID = /^[a-zA-Z0-9_-]{1,80}$/;
export function newQuestion(number = '') {
  return {id:crypto.randomUUID(), revision:0, number:String(number), passage:'', ask:'', bogi_items:[],
    choices:Array.from({length:5}, (_, index) => ({id:crypto.randomUUID(), ord:index+1, text:''})),
    standard_code:'', standard:null, intent:'', references:[],
    asset:null, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()};
}
export function validateQuestion(item, validateSource = () => {}) {
  if (!item || !ID.test(item.id) || !Number.isSafeInteger(item.revision) || item.revision < 0) throw new Error('문항 ID 또는 저장 버전이 올바르지 않습니다.');
  for (const key of ['number','passage','ask','createdAt','updatedAt']) {
    if (typeof item[key] !== 'string' || item[key].length > (key === 'number' ? 40 : 100000)) throw new Error('문항 입력 데이터가 올바르지 않습니다.');
  }
  if (!Array.isArray(item.choices) || item.choices.length !== 5 || !Array.isArray(item.bogi_items) || item.bogi_items.length > 20) throw new Error('선지 또는 보기 개수가 올바르지 않습니다.');
  const ids = new Set();
  for (const [index, row] of [...item.choices, ...item.bogi_items].entries()) {
    if (!row || !ID.test(row.id) || ids.has(row.id) || typeof row.text !== 'string' || row.text.length > 100000) throw new Error('개별 선지 또는 보기 데이터가 올바르지 않습니다.');
    if (index < 5 && row.ord !== index + 1) throw new Error('선지 순서가 올바르지 않습니다.');
    ids.add(row.id);
  }
  const asset = item.asset;
  if (item.intent !== undefined && (typeof item.intent !== 'string' || item.intent.length > 10000)) throw new Error('출제 의도가 올바르지 않습니다.');
  if (item.standard_code !== undefined && (typeof item.standard_code !== 'string' || item.standard_code.length > 80)) throw new Error('성취기준 코드가 올바르지 않습니다.');
  if (item.standard != null && (item.standard.code !== item.standard_code || !['code','text','subject','explain','source'].every(key => typeof item.standard[key] === 'string' && item.standard[key].length <= 20000))) throw new Error('성취기준 데이터가 올바르지 않습니다.');
  if (item.references !== undefined) {
    if (!Array.isArray(item.references) || item.references.length > 100) throw new Error('문항 참고자료는 100개까지 저장할 수 있습니다.');
    const referenceIds = new Set();
    for (const ref of item.references) {
      if (!ref || !ID.test(ref.id) || referenceIds.has(ref.id) || !ID.test(ref.resourceId) || !Number.isSafeInteger(ref.page) || ref.page < 1 ||
        !['title','kind','quote','field'].every(key => typeof ref[key] === 'string' && ref[key].length <= 10000)) throw new Error('문항 참고자료 정보가 올바르지 않습니다.');
      referenceIds.add(ref.id);
    }
  }
  if (asset !== null) {
    if (!asset || !ID.test(asset.id) || (!asset.draft && !asset.confirmed)) throw new Error('그림 연결 정보가 올바르지 않습니다.');
    for (const snapshot of [asset.draft, asset.confirmed].filter(Boolean)) {
      if (!ID.test(snapshot.id) || typeof snapshot.name !== 'string' || snapshot.name.length > 200 || typeof snapshot.capturedAt !== 'string' ||
          !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(snapshot.png) || snapshot.png.length > 90 * 1024 * 1024 ||
          !['widthMm','heightMm','pixelWidth','pixelHeight'].every(k => Number.isFinite(snapshot[k]) && snapshot[k] > 0) ||
          snapshot.pixelWidth * snapshot.pixelHeight > 40000000) throw new Error('그림 저장 데이터가 올바르지 않습니다.');
      if (snapshot.source !== null) validateSource(copy(snapshot.source));
    }
    if (asset.confirmed && typeof asset.confirmed.confirmedAt !== 'string') throw new Error('그림 확정 시각이 없습니다.');
  }
  return item;
}
export function confirmFigure(item) {
  if (!item.asset?.draft) throw new Error('먼저 사진 또는 5E 그림을 가져오세요.');
  return {...copy(item), asset:{...copy(item.asset), confirmed:{...copy(item.asset.draft), confirmedAt:new Date().toISOString()}}};
}
export function questionHandoff(item) {
  validateQuestion(item);
  if (!item.ask.trim()) throw new Error('한글로 보내기 전에 발문을 입력하세요.');
  if (item.asset && !item.asset.confirmed) throw new Error('사진·그림을 확정한 뒤 한글로 보내세요.');
  return {format:POOL_FORMAT, version:1, question:copy({id:item.id, number:item.number, passage:item.passage,
    ask:item.ask, bogi_items:item.bogi_items, choices:item.choices}),
    // A newer draft never replaces the confirmed pixels or editable source.
    figure:item.asset?.confirmed ? {assetId:item.asset.id, ...copy(item.asset.confirmed)} : null};
}
export function validateResource(resource) {
  if (!resource || !ID.test(resource.id) || !['교과서','교육과정','기출','수업','참고자료'].includes(resource.kind) ||
    typeof resource.title !== 'string' || resource.title.length > 240 || !['application/pdf','image/png','image/jpeg','image/webp','text/plain'].includes(resource.mime) ||
    typeof resource.base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(resource.base64) || resource.base64.length > 70*1024*1024 ||
    !Array.isArray(resource.pages) || !resource.pages.length || resource.pages.length > 3000 ||
    !resource.pages.every(text => typeof text === 'string' && text.length <= 1000000)) throw new Error('참고자료 파일 데이터가 올바르지 않습니다.');
  return resource;
}
export function encodePool(items, validateSource, resources = []) {
  items.forEach(item => validateQuestion(item, validateSource));
  resources.forEach(validateResource);
  const text = JSON.stringify({format:POOL_FORMAT, version:1, items, ...(resources.length ? {resources} : {})}, null, 2);
  if (new TextEncoder().encode(text).length > POOL_MAX_BYTES) throw new Error('문항 파일은 최대 128 MB까지 저장할 수 있습니다.');
  return text;
}
export function decodePool(text, validateSource) {
  return decodePoolBundle(text, validateSource).items;
}
export function decodePoolBundle(text, validateSource) {
  if (new TextEncoder().encode(text).length > POOL_MAX_BYTES) throw new Error('문항 파일이 128 MB를 초과합니다.');
  const data = JSON.parse(text);
  if (data?.format !== POOL_FORMAT || data.version !== 1 || !Array.isArray(data.items) || data.items.length > 500) throw new Error('지원하는 문항 파일이 아닙니다.');
  const ids = new Set();
  for (const item of data.items) { validateQuestion(item, validateSource); if (ids.has(item.id)) throw new Error('문항 ID가 중복되었습니다.'); ids.add(item.id); }
  const resources = data.resources ?? [];
  if (!Array.isArray(resources) || resources.length > 100) throw new Error('참고자료 파일 개수가 올바르지 않습니다.');
  const resourceIds = new Set();
  resources.forEach(resource => {validateResource(resource);if (resourceIds.has(resource.id)) throw new Error('참고자료 ID가 중복되었습니다.');resourceIds.add(resource.id);});
  return {items:data.items,resources};
}
