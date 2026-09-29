import { DEFAULT_TEXT_FONT, DEFAULT_TEXT_SIZE_MM } from './state.js?v=1.7.0-preview-0930';

export const EDITABLE_IMAGE_LABEL_PLAN_VERSION = 1;
export const EDITABLE_IMAGE_LABEL_TAG = '5e-editable-labels';

const MAX_LABELS = 128;
const MAX_LABEL_TEXT = 80;

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

function labelEvidenceOptions(value) {
  return typeof value === 'string'
    ? { text: value, preserveSourceLabels: false, referenceCount: 0 }
    : {
      text: typeof value?.text === 'string' ? value.text : '',
      preserveSourceLabels: value?.preserveSourceLabels === true,
      referenceCount: Math.max(0, Number(value?.referenceCount) || 0),
    };
}

function verifiedLabel(value, evidenceOptions) {
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
  const labelType = value.labelType === 'quantity' || contentMode === 'formula' ? 'quantity' : 'label';
  return Object.freeze({ text, evidence, sourceKind: fromReference ? 'reference' : 'request',
    ...(fromReference ? { sourceRef } : {}),
    mode: leader ? 'leader' : 'text', labelType, contentMode, anchor: leader ? anchor : { ...position }, position });
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
  if (!payload || payload.version !== EDITABLE_IMAGE_LABEL_PLAN_VERSION || !Array.isArray(payload.labels)
    || typeof payload.reviewRequired !== 'boolean') return unavailablePlan();

  const labels = [];
  let rejectedCount = Math.max(0, payload.labels.length - MAX_LABELS);
  for (const candidate of payload.labels.slice(0, MAX_LABELS)) {
    const label = verifiedLabel(candidate, evidence);
    if (label) labels.push(label);
    else rejectedCount += 1;
  }
  const reviewRequired = payload.reviewRequired || rejectedCount > 0
    || (evidence.preserveSourceLabels && evidence.referenceCount > 0);
  return Object.freeze({
    version: EDITABLE_IMAGE_LABEL_PLAN_VERSION,
    status: reviewRequired ? 'review' : labels.length ? 'ready' : 'empty',
    labels: Object.freeze(labels),
    reviewRequired,
    rejectedCount,
  });
}

export function withEditableImageLabelPlan(prompt, evidenceSource) {
  const options = labelEvidenceOptions(evidenceSource);
  const evidence = options.text.trim();
  const sourceInstruction = options.preserveSourceLabels && options.referenceCount
    ? `원본 글자를 5E 편집 라벨로 대체하는 옵션이 켜져 있다. 변환 원본(INPUT_SOURCE) ${options.referenceCount}장에 보이는 글자를 종류와 관계없이 빠짐없이 전사한다. 지시선 라벨, 상자·타원·도형 안의 글자, 그림 옆 설명 글자, 원문자와 기호(ⓐ, ⓑ, ㉠, ㉡, Ⓟ처럼 원문자는 원문자 한 글자 그대로. 동그라미 안의 한글 자모는 ㉠㉡㉢㉣㉤㉥ 문자로 쓰고 동그라미를 뺀 ㄱ, ㄴ, ㄷ으로 바꾸지 않는다), 영문자·숫자·단위·극성 기호, 화학식과 물리량이 모두 대상이다. 화학식·물리량의 아래첨자는 CO_2, 위첨자는 x^2처럼 쓰고 contentMode formula, labelType quantity로 둔다. 줄바꿈되었거나 세로로 쓰인 한 덩어리 문구는 한 항목으로 묶고 text에 공백으로 이어 쓴다. 쉼표로 이어진 여러 표기(예: ⓑ, CO_2)는 각각 따로 둔다. 각 항목은 sourceKind를 reference, sourceRef를 변환 원본의 1부터 시작하는 순서, evidence를 text와 똑같이 적는다. 원본 라벨의 좌표는 첨부된 변환 원본 이미지 기준으로 적는다. 원본 왼쪽 위가 (0,0), 오른쪽 아래가 (1,1)이다. 최종 PNG는 원본과 같은 구도와 비율로 그려지므로 프로그램이 이 좌표를 그대로 옮긴다. position은 원본에서 그 글자 덩어리의 중심이다. 글자와 대상을 잇는 화살촉 없는 가는 지시선이 있을 때만 mode leader로 두고 anchor는 지시선이 대상에 닿는 끝점이다. 과정·흐름·이동을 나타내는 화살표 옆의 글자는 지시선 라벨이 아니므로 mode text로 두고 anchor와 position을 같게 둔다. 지시선이 없으면 mode text로 둔다. 이미지에서는 전사한 글자와 글자 전용 지시선을 지우고 그 자리는 흰 배경으로 비워 둔다. 원문자(ⓐ, Ⓟ, ㉠ 등)의 동그라미는 글자의 일부로 함께 전사되므로 이미지에 빈 원으로 남기지 않는다. 글자를 담고 있던 상자·타원 같은 실제 도형은 그대로 그린다. 표현 참고(STYLE_REFERENCE)나 직전 생성 후보에서 글자를 가져오지 않는다. 읽히지 않거나 일부만 보여 추측해야 하는 글자는 빼고 reviewRequired를 true로 둔다. 최대 ${MAX_LABELS}개까지 반환하고 더 있으면 reviewRequired를 true로 둔다. labels 배열 항목 수는 원본에서 읽힌 글자 덩어리 수와 같아야 한다.`
    : '원본 이미지의 글자를 전사하지 않는다. 라벨은 아래 확인 입력에 문자 그대로 있는 경우에만 만든다.';
  return `${prompt}\n\n[${EDITABLE_IMAGE_LABEL_TAG} version=${EDITABLE_IMAGE_LABEL_PLAN_VERSION}]
이미지에는 문자·숫자·수식·극성·라벨과 문자용 지시선을 그리지 않는다. 이미지 생성 도구를 호출하기 전에 같은 턴의 commentary 메시지로 아래 태그와 JSON 하나만 먼저 출력한다. 그다음 이미지 생성 도구를 정확히 한 번 호출한다. 이미지 완성 직후 턴이 종료될 수 있으므로 도구 호출 뒤 설명에 이 계획을 미루지 않는다.
<${EDITABLE_IMAGE_LABEL_TAG}>{"version":${EDITABLE_IMAGE_LABEL_PLAN_VERSION},"reviewRequired":false,"labels":[]}</${EDITABLE_IMAGE_LABEL_TAG}>
요청 문구에서 온 라벨의 좌표는 최종 PNG의 왼쪽 위가 (0,0), 오른쪽 아래가 (1,1)이다. anchor는 가리키는 대상, position은 라벨 중심이다. 지시선 없는 표기는 mode를 text로 하고 두 좌표를 같게 둔다. 물리량·수식만 labelType quantity와 contentMode formula를 쓴다.
각 labels 항목에는 text, evidence, sourceKind, mode, labelType, contentMode, anchor, position을 넣는다. mode는 leader 또는 text, labelType은 label 또는 quantity, contentMode는 plain 또는 formula만 쓴다. anchor와 position은 각각 x와 y가 0~1인 객체다. 요청 문구에서 온 라벨은 sourceKind request를 쓰고, text가 아래 확인 입력에 문자 그대로 있어야 한다. ${sourceInstruction} 번역·보완 라벨은 금지한다. 위의 빈 배열 예시를 복사하지 말고 확인 가능한 라벨을 채운다. 확인 가능한 라벨이 하나도 없을 때만 labels를 빈 배열로 둔다.
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

export function createEditableImageLabelObjects({ labels, image, metadata = {}, idFactory }) {
  if (!Array.isArray(labels) || labels.length > MAX_LABELS) throw new TypeError('자동 라벨 목록을 확인할 수 없습니다.');
  if (!image || typeof image.id !== 'string' || !['x', 'y', 'w', 'h'].every(key => Number.isFinite(image[key]))
    || image.w <= 0 || image.h <= 0) throw new TypeError('자동 라벨을 배치할 이미지를 확인할 수 없습니다.');
  if (typeof idFactory !== 'function') throw new TypeError('자동 라벨 식별자 생성기가 필요합니다.');

  return labels.map((label) => {
    const anchor = worldPoint(image, label.anchor);
    const position = worldPoint(image, label.position);
    const formula = label.contentMode === 'formula';
    return {
      id: idFactory(),
      type: 'labeler',
      p1: label.mode === 'text' ? { ...position } : anchor,
      p2: position,
      text: label.text,
      labelType: label.labelType,
      contentMode: label.contentMode,
      ...(formula ? { source: label.text, rawSource: label.text } : {}),
      fontFamily: DEFAULT_TEXT_FONT,
      labelSize: DEFAULT_TEXT_SIZE_MM,
      strokeLevel: 0,
      strokeWidth: 0.2,
      locked: false,
      positionLocked: false,
      groupId: null,
      aiAutoLabel: true,
      aiLabelPlanVersion: EDITABLE_IMAGE_LABEL_PLAN_VERSION,
      aiParentImageId: image.id,
      ...(metadata.aiTaskId ? { aiTaskId: metadata.aiTaskId, aiCandidateId: metadata.aiCandidateId } : {}),
    };
  });
}
