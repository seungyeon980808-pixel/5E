import { applyLabelTargetPlacement } from './ai-label-target-placement.js?v=1.7.0-four-session-integration';
import { normalizeLeaderRoutes, mapLeaderRoutes } from './ai-label-leaders.js?v=1.7.0-four-session-integration';
import { nativePresentationForLabelTypography, LABEL_TYPOGRAPHY_PROMPT, normalizeLabelTypography, positionNativeLabelAtCenter } from './ai-label-typography.js?v=1.7.0-four-session-integration';
import { DEFAULT_TEXT_SIZE_MM } from './state.js?v=1.7.0-four-session-integration';
import { getFormulaScriptSpans, normalizeFormulaScriptStyles } from './formula.js?v=1.7.0-four-session-integration';

export const EDITABLE_IMAGE_LABEL_PLAN_VERSION = 4;
export const EDITABLE_IMAGE_LABEL_TAG = '5e-editable-labels';
export const SOURCE_LABEL_POLICY_VERSION = 4;
export const SOURCE_LABEL_OWNERSHIP_POLICY = '일반 라벨의 글자·숫자·단위·극성 +/− 및 문장 앞 글머리표 •는 편집 텍스트 소유다. 글머리표는 해당 문장 text에 포함하고 원문의 공백·줄바꿈·유니코드 글자를 보존한다. 입자 안 전하와 반응식 사이 +도 일반 라벨이다. 기기 전원 버튼의 ⏻ 같은 물리적 픽토그램은 그림 소유로 보존하며 라벨로 만들거나 지우지 않는다. 선·화살촉의 소유는 글자와의 연결·인접 여부가 아니라 과학적 역할로 판정한다. 설명 대상의 이름·위치를 가리키기만 하는 설명용 지시선 및 끝의 원형 표식은 화살촉 유무와 무관하게 편집 라벨 소유다. 확인된 라벨 소속의 선 전체·접점·화살촉·채운 점·빈 원은 과학 화살표 유지 옵션보다 우선하여 글자와 함께 제거한 뒤 편집 라벨로 복원한다. 실제 물체·관·혈관·도선·막·눈금은 그림 소유다. 빛·혈액·전류·힘·반응의 과학적 방향과 치수·두께·범위를 표시하는 선·화살촉은 그림 소유이며 이미지 하네스의 표시선 설정을 따른다. 글자가 그 선에 연결되거나 선을 중간에서 끊어도 그 사실만으로 설명용 지시선으로 분류하지 않는다. 이 그림 소유 표식의 글자는 mode text로 글자만 복원하고 leaderRoutes, leaderArrowHead, elbow, extraAnchors, leaderDash를 저장하지 않는다. 과학 선·화살촉을 라벨 소유 제거 영역이나 네이티브 지시선 복원 목록에 넣지 않는다. 확대 원·강조틀·확대 연결선·투영 가이드는 설명용 표식이며 과학 물체로 보존하거나 편집 라벨로 복원하지 않는다. 이 표식의 제거·유지는 이미지 하네스의 처리 설정과 사용자 명시 요청을 따르고 라벨 소유 명세가 그 판정을 뒤집지 않는다. 그래프 및 세로쓰기는 기존 보류 범위다. 소유가 불명확한 표식은 지우지 않고 uncertainties에 기록한다.';

export function freezeLabelPlan(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeLabelPlan);
    Object.freeze(value);
  }
  return value;
}

const MAX_LABELS = 128;
const MAX_LABEL_TEXT = 80;

export function editableLabelScope(label) {
  if (label.owner === 'graph' || label.scope === 'graph') return 'graph';
  if (label.scope === 'non_graph_vertical_deferred' || label.typography?.orientation === 'vertical') return 'non_graph_vertical_deferred';
  if (label.scope !== undefined && label.scope !== 'general') return 'unknown';
  return 'general';
}

function unavailablePlan() {
  return Object.freeze({
    version: EDITABLE_IMAGE_LABEL_PLAN_VERSION,
    status: 'unavailable',
    labels: [],
    reviewRequired: true,
    rejectedCount: 0,
  });
}

function normalizedPoint(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
  if (value.x < 0 || value.x > 1 || value.y < 0 || value.y > 1) return null;
  return { x: value.x, y: value.y };
}

export function normalizeSourceLabelUncertainty(value, referenceCount) {
  if (typeof value === 'string') return value.trim() && value.length <= 1000 ? value : null;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > 1000
    || !Number.isInteger(value.sourceRef) || value.sourceRef < 1 || value.sourceRef > referenceCount) return null;
  const result = { sourceRef: value.sourceRef, reason: value.reason };
  if (value.labelId !== undefined) {
    if (typeof value.labelId !== 'string' || !/^[A-Za-z0-9_.:-]{1,80}$/.test(value.labelId)) return null;
    result.labelId = value.labelId;
  }
  if (value.component !== undefined) {
    if (!['text','leader','endpoint'].includes(value.component)) return null;
    result.component = value.component;
  }
  if (value.domain !== undefined) {
    if (!['text','ownership','geometry','removal'].includes(value.domain)) return null;
    result.domain = value.domain;
  }
  if (value.bounds !== undefined) {
    const b = value.bounds;
    if (!b || !['x', 'y', 'w', 'h'].every(k => Number.isFinite(b[k]))
      || b.x < 0 || b.y < 0 || b.w <= 0 || b.h <= 0 || b.x + b.w > 1 + 1e-9 || b.y + b.h > 1 + 1e-9) return null;
    result.bounds = { x: b.x, y: b.y, w: b.w, h: b.h };
  }
  return result;
}

function labelEvidenceOptions(value) {
  return typeof value === 'string'
    ? { text: value, preserveSourceLabels: false, referenceCount: 0 }
    : {
      text: typeof value?.text === 'string' ? value.text : '',
      preserveSourceLabels: value?.preserveSourceLabels === true,
      referenceCount: Math.max(0, Number(value?.referenceCount) || 0),
    };
}

function verifiedLabel(value, evidenceOptions, strict = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const text = typeof value.text === 'string' ? value.text.trim() : '';
  const anchor = normalizedPoint(value.anchor);
  const position = normalizedPoint(value.position);
  if (!text || text.length > MAX_LABEL_TEXT || !position) return null;
  const sourceOption = evidenceOptions.preserveSourceLabels && evidenceOptions.referenceCount > 0;
  const fromReference = value.sourceKind === 'reference' || (value.sourceKind === undefined && sourceOption);
  const sourceRef = Number.isInteger(value.sourceRef) ? value.sourceRef
    : fromReference && evidenceOptions.referenceCount === 1 ? 1 : null;
  const evidence = fromReference ? text : typeof value.evidence === 'string' ? value.evidence.trim() : '';
  if (fromReference) {
    if (!sourceOption || sourceRef === null || sourceRef < 1 || sourceRef > evidenceOptions.referenceCount) return null;
  } else if (value.sourceKind !== undefined && value.sourceKind !== 'request') return null;
  else if (!evidence || evidence.length > 500 || !evidence.includes(text) || !evidenceOptions.text.includes(evidence)) return null;
  const leader = value.mode === 'leader' ? Boolean(anchor) : value.mode === 'text' ? false
    : Boolean(anchor) && Math.hypot(anchor.x - position.x, anchor.y - position.y) > 0.01;
  const contentMode = value.contentMode === 'formula' ? 'formula' : 'plain';
  const legacyLabelType = value.labelType === 'quantity' || contentMode === 'formula' ? 'quantity' : 'label';
  const { typography, review } = normalizeLabelTypography(value.typography, { text, labelType: legacyLabelType, contentMode });
  if (strict && (!typography.bounds || review || !['leader', 'text'].includes(value.mode))) return null;
  if (strict && value.mode === 'leader' && !anchor) return null;
  const leaderRoutes = value.leaderRoutes === undefined ? null : normalizeLeaderRoutes(value.leaderRoutes);
  if (value.leaderRoutes !== undefined && (!leaderRoutes || !leader)) return null;
  if (leaderRoutes && Math.hypot(anchor.x-leaderRoutes[0].target.x, anchor.y-leaderRoutes[0].target.y) > 1e-6) return null;
  const elbow = value.elbow === undefined ? null : normalizedPoint(value.elbow);
  const extraAnchors = value.extraAnchors === undefined ? [] : value.extraAnchors;
  if (value.elbow !== undefined && !elbow || !Array.isArray(extraAnchors) || extraAnchors.length > 12
    || extraAnchors.some(point => !normalizedPoint(point))
    || value.leaderArrowHead !== undefined && !['none', 'target'].includes(value.leaderArrowHead)
    || value.leaderDash !== undefined && !['solid', 'dashed', 'dotted'].includes(value.leaderDash)
    || !leader && (elbow || extraAnchors.length || value.leaderArrowHead === 'target')) return null;
  const labelType = value.typography ? (typography.role === 'quantity' ? 'quantity' : 'label') : legacyLabelType;
  return Object.freeze({ text, evidence, sourceKind: fromReference ? 'reference' : 'request',
    ...(fromReference ? { sourceRef } : {}),
    mode: leader ? 'leader' : 'text', labelType, contentMode, anchor: leader ? anchor : { ...position }, position,
    ...(leaderRoutes ? { leaderRoutes } : {}),
    typography, scope: editableLabelScope({ ...value, typography }),
    ...(leader ? { ...(elbow ? { elbow } : {}), ...(extraAnchors.length ? { extraAnchors: extraAnchors.map(normalizedPoint) } : {}),
      leaderArrowHead: value.leaderArrowHead || 'none', leaderDash: value.leaderDash || 'solid' } : {}),
    ...(value.owner ? { owner: value.owner } : {}), ...(value.reviewRequired === true ? { ownershipReviewRequired: true } : {}), ...(review ? { typographyReviewRequired: true } : {}) });
}

export function parseEditableImageLabelPlan(response, evidenceSource) {
  const text = typeof response === 'string' ? response : '';
  const evidence = labelEvidenceOptions(evidenceSource);
  const open = `<${EDITABLE_IMAGE_LABEL_TAG}>`;
  const close = `</${EDITABLE_IMAGE_LABEL_TAG}>`;
  const start = text.indexOf(open);
  const end = start < 0 ? -1 : text.indexOf(close, start + open.length);
  if (start < 0 || end < 0) return unavailablePlan();

  let payload;
  try {
    payload = JSON.parse(text.slice(start + open.length, end).trim());
  } catch {
    return unavailablePlan();
  }
  if (!payload || ![1, 2, 3, EDITABLE_IMAGE_LABEL_PLAN_VERSION].includes(payload.version) || !Array.isArray(payload.labels)
    || typeof payload.reviewRequired !== 'boolean') return unavailablePlan();

  const labels = [];
  const excludedLabels = [];
  const ids = new Set();
  const preservedMarks = [];
  const uncertainties = [];
  let rejectedCount = Math.max(0, payload.labels.length - MAX_LABELS);
  if (payload.uncertainties !== undefined && !Array.isArray(payload.uncertainties)) rejectedCount += 1;
  for (const value of (Array.isArray(payload.uncertainties) ? payload.uncertainties : []).slice(0, MAX_LABELS)) {
    const uncertainty = normalizeSourceLabelUncertainty(value, evidence.referenceCount);
    if (uncertainty) uncertainties.push(uncertainty);
    else rejectedCount += 1;
  }
  rejectedCount += Math.max(0, (payload.uncertainties?.length || 0) - MAX_LABELS);
  for (const [index, candidate] of payload.labels.slice(0, MAX_LABELS).entries()) {
    const parsed = verifiedLabel(candidate, evidence, payload.version >= 3);
    const id = typeof candidate?.id === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(candidate.id)
      ? candidate.id : `source-${parsed?.sourceRef || 0}-label-${index + 1}`;
    // Device pictograms belong to the source drawing, even if an old model calls them text.
    if (parsed?.sourceKind === 'reference' && parsed.text === '⏻') {
      preservedMarks.push({ text: parsed.text, sourceRef: parsed.sourceRef, reason: 'physical-device-icon', bounds: parsed.typography.bounds });
      continue;
    }
    const label = parsed && !ids.has(id) ? freezeLabelPlan({ ...parsed, id }) : null;
    if (label) ids.add(id);
    if (label && label.scope === 'general') labels.push(label);
    else if (label) excludedLabels.push(label);
    else rejectedCount += 1;
  }
  for (const mark of (Array.isArray(payload.preservedMarks) ? payload.preservedMarks : []).slice(0, MAX_LABELS)) {
    const bounds = normalizeLabelTypography({ role: 'symbol', bounds: mark?.bounds }, { text: String(mark?.text || '') }).typography.bounds;
    if (bounds && Number.isInteger(mark.sourceRef) && mark.sourceRef >= 1 && mark.sourceRef <= evidence.referenceCount
      && typeof mark.reason === 'string' && mark.reason.length <= 300 && typeof mark.text === 'string' && mark.text.length <= 80) {
      preservedMarks.push({ text: mark.text, sourceRef: mark.sourceRef, reason: mark.reason, bounds });
    } else { rejectedCount += 1; }
  }
  const reviewRequired = payload.reviewRequired || rejectedCount > 0 || excludedLabels.length > 0
    || uncertainties.length > 0
    || labels.some(label => label.typographyReviewRequired)
    || (evidence.preserveSourceLabels && evidence.referenceCount > 0);
  return freezeLabelPlan({
    version: EDITABLE_IMAGE_LABEL_PLAN_VERSION,
    policyVersion: SOURCE_LABEL_POLICY_VERSION,
    status: reviewRequired ? 'review' : labels.length ? 'ready' : 'empty',
    labels: Object.freeze(labels),
    excludedLabels: Object.freeze(excludedLabels),
    preservedMarks, uncertainties,
    reviewRequired,
    rejectedCount,
  });
}

export function withEditableImageLabelPlan(prompt, evidenceSource, { analysisOnly = false } = {}) {
  const options = labelEvidenceOptions(evidenceSource);
  const evidence = options.text.trim();
  const sourceInstruction = options.preserveSourceLabels && options.referenceCount
    ? `원문 추적: 변환 원본(INPUT_SOURCE) ${options.referenceCount}장만 읽는다.`
      + ' sourceKind를 reference, sourceRef를 원본의 1부터 시작하는 순서로 둔다. evidence는 text와 같다. STYLE_REFERENCE나 직전 후보의 글자는 가져오지 않는다.'
      + ' 일반 그림의 글자를 빠짐없이 전사한다. 도형 안의 표기, 설명, 원문자, 영문자, 숫자, 단위, 극성, 물리량과 화학식을 포함한다.'
      + ' scope는 general, graph, non_graph_vertical_deferred 중 하나다. 축·눈금·그래프 제목·그래프 내부 표기는 graph이며 일반 라벨 변환에서 제외한다. 그래프 영역의 문자와 지시선은 원본에 보존한다. 그래프 밖 세로쓰기도 non_graph_vertical_deferred로 제외하고 원본에 보존한다. 회전된 지도 고도 표기는 세로쓰기와 다르며 general이다. 소속이 불확실하면 reviewRequired를 true로 두고 해당 영역을 지우지 않는다.'
      + ' 원문자는 ⓐ, ⓑ, ㉠, ㉡, Ⓟ처럼 원문자 한 글자 그대로 쓴다. ㉠을 ㄱ으로 바꾸거나 원을 별도 도형으로 남기지 않는다.'
      + ' 영문 대소문자도 원문 그대로 보존한다. p를 P로, n을 N으로 정규화하지 않는다. 점 이름과 변수라는 역할을 이유로 글자를 바꾸지 않는다.'
      + ' 아래첨자는 CO_2, 위첨자는 Na^+처럼 쓰고 contentMode는 formula로 둔다. 쉼표로 이어진 독립 표기(ⓑ, CO_2 또는 B(g), C(g))는 반드시 각각 따로 둔다.'
      + ' 이때 쉼표·구분점도 원문의 구성 요소다. 각 구분 문자를 별도 general/plain 항목으로 남겨 삭제하거나 누락하지 않는다.'
      + ' 한 문구의 줄바꿈은 text에 JSON 이스케이프 \"\\n\"으로 보존한다. 세로로 한 자씩 쌓인 문구는 글자를 이어 쓰고 typography.orientation을 vertical로 둔다. 줄바꿈을 공백으로 합치지 않는다.'
      + ' 좌표는 원본 왼쪽 위 (0,0), 오른쪽 아래 (1,1) 기준이다. position은 글자 덩어리 중심, typography.bounds는 글자 전체의 외접 사각형이며 지시선은 제외한다.'
      + LABEL_TYPOGRAPHY_PROMPT
      + ' 복잡한 설명 지시선은 leaderRoutes 배열로 각 경로를 독립 기록한다: {kind:straight|polyline|quadratic|cubic,attachment:label|frame,start:{x,y},target:{x,y},controls:[],end:none|open-arrow|filled-arrow|circle,endRadius:선택적 원본 비율 반지름(0보다 크고 0.05 이하)}. 모든 좌표는 원본 0~1 좌표다. start는 글자 경계 또는 설명 상자의 실제 출발점이다. controls는 직선 0개, 꺾은선 1~12개, 이차곡선 1개, 삼차곡선 2개다. anchor는 첫 경로 target과 같다. 채운 점과 빈 원 모두 설명 지시선의 끝점이면 함께 제거한다. 관·혈관 위 흰 원도 원본 글자와 연결된 끝점인지 확인하고, 물리적 관 입구와 혼동하지 않는다. 가려진 접점은 추측하지 않고 uncertainties에 기록한다. 과학적 경로는 이 배열에 넣지 않는다.'
      + ' 설명용으로 확인된 지시선은 화살촉이 있어도 mode leader다. anchor는 대상 끝점, 꺾임은 elbow, 다른 대상 끝점은 extraAnchors로 기록한다. 대상 끝 화살촉이 있으면 leaderArrowHead target, 없으면 none이다. 선 모양은 leaderDash solid/dashed/dotted이다. 이동·흐름·과정·힘의 방향 및 치수·두께·범위를 표시하는 그림 소유 선·화살촉은 표시선 설정을 따르며 그 글자는 mode text로 둔다. 글자와 연결·인접하거나 글자 양쪽으로 선이 이어진다는 이유만으로 mode leader를 선택하지 않는다. mode text에서는 anchor와 position을 글자 중심으로 같게 두고 leaderRoutes, leaderArrowHead, elbow, extraAnchors, leaderDash를 생략한다. 그 과학 선·화살촉은 라벨 소속 removalRegions에 넣지 않고 네이티브로 중복 복원하지 않는다. 설명용인지 과학 표식인지 불명확하면 선·화살촉을 추측해 라벨에 넣지 말고 uncertainties에 기록하며 원본에 남긴다.'
      + ' 생성 이미지의 캔버스 비율, 여백, 축·물체 위치와 라벨의 빈 공간을 원본 그대로 유지한다. scope general로 확인된 글자와 문자 전용 지시선은 제거 후 편집 객체로 복원한다. 글자를 담던 상자·타원, 영역 괄호, 확대 원·강조틀·확대 연결선·투영 가이드의 처리와 축·눈금·화살표 보존은 이미지 하네스 설정을 따른다. 라벨 좌표 보존을 이유로 제거 대상 설명 표식을 남기지 않는다. 제외된 graph와 non_graph_vertical_deferred 항목은 제거하지 않는다.'
      + ' 읽히지 않거나 일부만 보여 추측해야 하는 글자는 빼고 reviewRequired를 true로 둔다. labels 항목 수는 읽힌 독립 표기 수와 같아야 한다.'
    : '원본 이미지의 글자를 전사하지 않는다. 아래 확인 입력에 문자 그대로 있는 라벨만 sourceKind request로 만든다. evidence는 그 라벨을 포함하는 입력 문구다. 좌표는 생성 이미지 기준이다.';
  return `${prompt}\n\n[${EDITABLE_IMAGE_LABEL_TAG} version=${EDITABLE_IMAGE_LABEL_PLAN_VERSION}]
${analysisOnly ? '이 턴은 원본 라벨 관찰만 한다. 이미지 생성·파일·웹·코드 등 모든 도구 호출을 금지한다. 아래 태그와 JSON 하나만 최종 응답으로 출력한다. 생성하거나 원본을 수정하지 않는다.' : '일반 라벨 변환 영역에는 문자·숫자·수식·극성·라벨과 문자 전용 지시선을 그리지 않는다. 그래프 영역과 보류한 세로쓰기의 원본 글자는 보존한다. 이미지 생성 도구를 호출하기 전에 같은 턴의 commentary 메시지로 아래 태그와 JSON 하나만 먼저 출력한다. 그다음 이미지 생성 도구를 정확히 한 번 호출한다.'}
${analysisOnly ? '' : `<${EDITABLE_IMAGE_LABEL_TAG}>`}{"version":${EDITABLE_IMAGE_LABEL_PLAN_VERSION},"reviewRequired":false,"labels":[],"preservedMarks":[],"uncertainties":[]}${analysisOnly ? '' : `</${EDITABLE_IMAGE_LABEL_TAG}>`}
소유 규칙 v${SOURCE_LABEL_POLICY_VERSION}: ${SOURCE_LABEL_OWNERSHIP_POLICY}
각 항목에는 고유 id, text, evidence, sourceKind, scope, mode, labelType, contentMode, anchor, position, typography를 넣는다. scope general만 편집 객체로 변환한다. preservedMarks에는 전원 픽토그램 같은 실제 물리 표식의 text, sourceRef, bounds, reason을 기록한다. 제거 대상으로 지정된 확대·강조·투영 가이드는 preservedMarks에 넣지 않는다. 판독·소유 불확실성은 uncertainties에 {sourceRef, reason, bounds}로 쓴다. bounds를 확인할 수 없으면 생략하며 단순 이유 문자열도 허용한다. labels 안에 물리 아이콘을 넣지 않는다.
mode: leader | text. 확인된 설명용 지시선만 leader로 둔다. 지시선이 없거나 옆 선·화살촉이 그림 소유 과학 표식이면 text로 두고 anchor와 position을 글자 중심으로 같게 둔다. text에는 leaderRoutes와 leaderArrowHead 등 지시선 필드를 넣지 않는다. 두 좌표는 x,y가 0~1인 객체다.
contentMode: plain | formula. 첨자·수식 문법이 필요한 부분에만 formula를 쓴다. labelType quantity는 물리량, 그 외는 label이다.
typography: {"role":"text","bounds":{"x":0.1,"y":0.2,"w":0.08,"h":0.03},"orientation":"horizontal","rotation":0}.
bounds의 x,y는 글자 외접 사각형 왼쪽 위, w,h는 폭·높이이며 모두 원본 크기에 대한 비율이다. 글꼴 크기를 추정하기 위한 값이므로 실제 글자만 둘러싼다. 원문 크기와 줄 수를 고려해 라벨마다 개별로 측정한다. rotation은 화면 기준 시계 방향 -180~180도이며 세로로 쌓기(vertical)와 글자 전체 회전을 구별한다.
role은 text(한글 설명·축 제목), name(물체·점 이름 A/B/C), quantity(물리 변수 m/v/F 및 첨자), chemical(화학식·이온 Na^+/CO_2/H^+), unit(단위·괄호), number(눈금·고도 숫자), symbol(원문자·극성·물음표) 중 하나다. quantity만 변수 기울임이며 chemical/unit/number는 정자다. 글꼴명·CSS·고정 pt 크기를 출력하지 않는다. 프로그램의 기존 글꼴 체계를 적용한다.
혼합 문구에는 typography.runs를 반드시 추가한다. 예: text="Na^+의 몰 농도(M)", runs=[{"text":"Na^+","role":"chemical","contentMode":"formula"},{"text":"의 몰 농도","role":"text","contentMode":"plain"},{"text":"(M)","role":"unit","contentMode":"plain"}]. 각 run.text를 이어 붙인 값은 text와 정확히 같아야 한다. 공백·줄바꿈도 보존하고 추가·번역 글자를 넣지 않는다. 순수 한 종류 표기는 runs를 생략할 수 있다.
상태 표기 B(g)는 B( 정자체 chemical, g 기울임 quantity, ) 정자체 unit의 세 plain run으로 둔다. 첨자의 서체가 본문과 다르면 typography.scriptStyles에 원문 UTF-16 범위와 kind(sub/sup), role을 넣는다. m_B의 물체 이름 B는 {"start":2,"end":3,"kind":"sub","role":"name"}이다. 범위는 _/^와 바깥 중괄호를 제외한 실제 첨자 내용만 가리킨다. 변수 첨자는 quantity이며 모든 첨자를 일괄 정자체로 만들지 않는다.
${sourceInstruction}
최대 ${MAX_LABELS}개다. 초과하거나 좌표·서식이 불확실하면 reviewRequired를 true로 둔다. 빈 배열 예시를 복사하지 말고 확인 가능한 라벨을 채운다. 확인할 수 있는 라벨이 하나도 없을 때만 빈 배열을 둔다. 번역·추측·보완 라벨은 금지한다.
[editable-label-evidence]
${evidence}
[/editable-label-evidence]`;

}

function worldPoint(image, normalized) {
  const point = { x: image.x + normalized.x * image.w, y: image.y + normalized.y * image.h };
  const rotation = Number(image.rotation) || 0;
  if (!rotation) return point;
  const center = { x: image.x + image.w / 2, y: image.y + image.h / 2 };
  const radians = rotation * Math.PI / 180;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

export function createEditableImageLabelObjects({ labels, placement, candidateSha256, image, metadata = {}, relationGroups = [], idFactory }) {
  if (placement) labels = applyLabelTargetPlacement(labels, placement, { candidateSha256 });
  if (!Array.isArray(labels) || labels.length > MAX_LABELS) throw new TypeError('자동 라벨 목록을 확인할 수 없습니다.');
  if (!image || typeof image.id !== 'string' || !['x', 'y', 'w', 'h'].every(key => Number.isFinite(image[key]))
    || image.w <= 0 || image.h <= 0) throw new TypeError('자동 라벨을 배치할 이미지를 확인할 수 없습니다.');
  if (typeof idFactory !== 'function') throw new TypeError('자동 라벨 식별자 생성기가 필요합니다.');

  const sourceGroups = new Map(), nativeGroups = new Map();
  for (const group of relationGroups) {
    if (!group || typeof group.id !== 'string' || !Array.isArray(group.labelIds) || group.labelIds.length < 2) throw new TypeError('잘못된 라벨 관계 묶음입니다.');
    const nativeId = idFactory();
    for (const id of group.labelIds) {
      if (sourceGroups.has(id) || !labels.some(label => label.id === id)) throw new TypeError('중복 또는 누락된 라벨 관계 묶음입니다.');
      sourceGroups.set(id, group.id); nativeGroups.set(id, nativeId);
    }
  }
  const names = new Set(labels.filter(label => label.typography?.role === 'name').map(label => label.text));
  return labels.filter(label => editableLabelScope(label) === 'general').map((label) => {
    const anchor = worldPoint(image, label.anchor);
    const position = worldPoint(image, label.position);
    const formula = label.contentMode === 'formula';
    const { typography } = normalizeLabelTypography(label.typography, label);
    const inferredScripts = typography.role === 'quantity' ? getFormulaScriptSpans(label.text)
      .filter(span => names.has(span.text)).map(span => ({ start: span.start, end: span.end, kind: span.kind, role: 'name' })) : [];
    const scriptStyles = normalizeFormulaScriptStyles(label.text, typography.scriptStyles || inferredScripts);
    const object = {
      id: idFactory(),
      type: 'labeler',
      p1: label.mode === 'text' ? { ...position } : anchor,
      p2: position,
      text: label.text,
      labelType: typography.role === 'quantity' ? 'quantity' : 'label',
      contentMode: label.contentMode,
      ...(formula ? { source: label.text, rawSource: label.text } : {}),
      ...nativePresentationForLabelTypography({ role: typography.role === 'name' ? 'text' : typography.role }),
      ...(['text', 'name', 'symbol'].includes(typography.role) ? { labelFontOverride: true } : {}),
      labelTypographyVersion: 1,
      aiLabelRole: typography.role,
      ...(typography.runs ? { labelRuns: typography.runs } : {}),
      ...(scriptStyles.length ? { labelScriptStyles: scriptStyles } : {}),
      ...(typography.orientation === 'vertical' ? { textOrient: 'vertical' } : {}),
      textRotation: typography.rotation || 0,
      ...(typography.bounds ? { aiLabelSourceBounds: typography.bounds } : {}),
      strokeLevel: 0,
      strokeWidth: 0.2,
      locked: false,
      positionLocked: false,
      groupId: nativeGroups.get(label.id) || null,
      ...(sourceGroups.has(label.id) ? { aiSourceRelationGroupId: sourceGroups.get(label.id) } : {}),
      aiAutoLabel: true,
      ...(placement ? { aiTargetPlacementSha256: placement.candidateSha256, aiTargetReviewRequired: label.targetReviewRequired === true } : {}),
      aiLabelPlanVersion: EDITABLE_IMAGE_LABEL_PLAN_VERSION,
      ...(label.id ? { aiSourceLabelId: label.id } : {}),
      aiParentImageId: image.id,
      ...(metadata.aiTaskId ? { aiTaskId: metadata.aiTaskId, aiCandidateId: metadata.aiCandidateId } : {}),
    };
    if (label.mode === 'leader') {
      if (label.leaderRoutes) {
        const routes = normalizeLeaderRoutes(label.leaderRoutes);
        if (!routes) throw new TypeError('잘못된 지시선 경로입니다.');
        object.leaderRoutes = mapLeaderRoutes(routes.map(({ endRadius, ...route }) => route), point => worldPoint(image, point));
      }
      if (label.elbow) object.elbow = worldPoint(image, label.elbow);
      if (label.extraAnchors?.length) object.extraAnchors = label.extraAnchors.map(point => worldPoint(image, point));
      object.leaderArrowHead = label.leaderArrowHead || 'none';
      if (label.leaderDash === 'dashed') { object.dashLength = 1.2; object.dashGap = 0.8; }
      if (label.leaderDash === 'dotted') { object.dashLength = 0.2; object.dashGap = 0.6; }
    }
    // Source bounds are removal/position evidence, not the native tool's size.
    const style = label.manualStyle;
    if (style && (!Number.isFinite(style.size) || style.size <= 0 || style.size > 16
      || style.strokeLevel !== undefined && ![0,1,2,3,4].includes(style.strokeLevel))) {
      throw new TypeError('직접 편집한 라벨 서식을 확인할 수 없습니다.');
    }
    if (style) Object.assign(object, nativePresentationForLabelTypography(typography));
    object.labelSize = style ? image.h * style.size : DEFAULT_TEXT_SIZE_MM;
    if (style?.strokeLevel !== undefined) object.strokeLevel = style.strokeLevel;
    if (label.mode !== 'leader') {
      object.type = formula ? 'formula' : 'text';
      object.fontSize = object.labelSize;
      object.rotation = object.textRotation;
      positionNativeLabelAtCenter(object, position);
      delete object.p1; delete object.p2; delete object.labelSize; delete object.textRotation;
    }
    return object;
  });
}
