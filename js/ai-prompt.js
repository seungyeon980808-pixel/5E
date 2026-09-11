import { AI_QUALITY_MODES, normalizeQualityMode, qualityModeRule } from "./ai-quality-mode.js?v=1.5.5";

export const EXAM_STYLE_PROMPT = `평가원식 과학 도식 제작 규칙:
- 명시적 변경 대상 밖의 핵심 구조, 객체·부품 수, 연결·접촉 관계, 상대 비율·배치와 패널 순서를 보존하고 과학적으로 정확하게 표현한다. 원본이나 설명에 없는 장치·부품·구조는 추가하지 않는다.
- 흑백 중심의 단정한 2D 선화로 그린다. 외곽선은 내부선보다 굵게 하고, 사실적 조명·광택·그림자·질감·과도한 3D 표현은 쓰지 않는다. 회색은 물리적 구분이 필요한 영역에만 한두 단계의 균일한 평면색으로 최소 사용하며, 후편집용 여백을 남긴다.`;

const MODE_RULES = {
  diagram: "그림형 분류 대상: 문자, 숫자, 단위, 수식, 기호, 라벨, 로고, 워터마크, 지시선과 화살표. 문자 요소와 문자용 지시선은 생성하지 않고 전원·계기·표시 화면은 빈 면으로 둔다. 화살표는 [arrows:*] 계약을 따른다.",
  complete: "완성형(라벨 포함): 사용자가 명시적으로 요청한 문자, 라벨과 부가 표시만 포함한다. 요청하지 않은 라벨이나 기호는 임의로 추가하지 않는다.",
};

const OPERATION_RULES = Object.freeze({
  generate: "[operation:generate change-scope=new-output] 신규 생성 작업: 사용자 요청을 구성 근거로 삼는다. 참고 이미지가 있으면 명시적 변경을 제외한 구조 근거로만 사용하고, 없으면 불명확한 세부를 임의로 추가하지 않는다.",
  transform: "[operation:transform change-scope=requested-source-transform] 원본 변환 작업: 요청된 전역 표현 변환과 명시된 변경만 적용한다. 그 밖의 원본 구조와 픽셀은 보존한다.",
  "scoped-edit": "[operation:scoped-edit change-scope=selected-pixels outside-scope-rgba=exact] 범위 수정 작업: 사용자 요청이 지정한 선택 픽셀과 객체·관계만 변경한다. 선택 밖의 원본 RGBA는 그대로 보존하고 전체 이미지 후처리를 하지 않는다.",
  separate: "[operation:separate change-scope=inter-asset-layout preserve-scope=asset-internal] 분리 작업: 독립 객체·기능 조립체 사이의 배치만 바꾼다. 각 객체·조립체 내부의 객체 수, 연결·접촉, 방향과 상대 배치는 보존하며 임의로 합치거나 쪼개거나 생략하지 않는다.",
});

const BACKGROUND_RULES = Object.freeze({
  white: "[background:white apply-within=operation-change-scope] 작업별 변경 허용 범위의 배경은 순수 흰색 #FFFFFF, alpha 255의 완전 불투명 단색으로 만들고 투명·반투명·체커보드 배경은 금지한다.",
  transparent: "[background:transparent apply-within=operation-change-scope] 작업별 변경 허용 범위의 배경은 실제 RGBA 투명 배경으로 만들고 불투명 배경면·종이 질감·체커보드 픽셀은 생성하지 않는다.",
  preserve: "[background:preserve apply-within=operation-change-scope] 작업별 변경 허용 범위에서도 대응하는 원본 배경의 RGBA를 유지하며 흰색 또는 투명으로 교체하거나 제거하지 않는다.",
});

const ARROW_RULES = Object.freeze({
  "scientific-only": "[arrows:scientific-only apply-within=operation-change-scope] 힘·운동·흐름·방향을 나타내는 과학적 화살표는 내용으로 보존하고, 작업별 변경 허용 범위의 장식 화살표는 스타일로 보아 금지한다.",
  preserve: "[arrows:preserve apply-within=operation-change-scope] 모든 원본 화살표의 개수·방향·화살촉과 몸통을 보존하며 요청에 없는 화살표를 추가하지 않는다.",
  none: "[arrows:none apply-within=operation-change-scope] 작업별 변경 허용 범위의 모든 화살표를 명시적 변경 대상으로 삼아 화살촉과 몸통을 제거하되 실제 도선·관·축·경계선은 지우지 않는다.",
});

const SHARED_INVARIANTS = Object.freeze([
  "명시된 변경 대상이 아닌 객체 수, 연결·접촉 관계, 과학적 방향과 상대 배치를 보존한다.",
  "원본 픽셀이 있는 작업은 명시된 변경 대상 밖의 원본 RGBA를 정확히 보존한다.",
  "힘·운동·흐름·방향 화살표는 과학 내용이고 장식 화살표는 스타일이며, 선택한 [arrows:*] 정책으로만 처리한다.",
  "작업 종류·대상·범위가 불확실하면 픽셀을 임의로 지우거나 정확히 분리했다고 주장하지 말고 실패로 닫는다.",
]);

function hasRule(rules, value) {
  return Object.prototype.hasOwnProperty.call(rules, value);
}

function normalizeOperation(value, revision) {
  return hasRule(OPERATION_RULES, value) ? value : revision ? "transform" : "generate";
}

function explicitPreservationRules(value) {
  if (!Array.isArray(value)) return "";
  return value
    .filter((statement) => typeof statement === "string" && statement.trim())
    .map((statement) => `[explicit-preserve] ${statement.trim()}`)
    .join("\n");
}

export function buildImagePrompt({
  request,
  mode = "diagram",
  revision = false,
  qualityMode = AI_QUALITY_MODES.STANDARD,
  operation,
  backgroundPolicy,
  arrowPolicy,
  preserve,
} = {}) {
  const modeRule = MODE_RULES[mode] || MODE_RULES.diagram;
  const normalizedQuality = normalizeQualityMode(qualityMode);
  const normalizedOperation = normalizeOperation(operation, revision);
  const defaultBackground = normalizedOperation === "generate" ? "white" : "preserve";
  const normalizedBackground = hasRule(BACKGROUND_RULES, backgroundPolicy) ? backgroundPolicy : defaultBackground;
  const normalizedArrows = hasRule(ARROW_RULES, arrowPolicy) ? arrowPolicy : "scientific-only";
  const correction = Boolean(revision) && normalizedOperation === "transform";
  const execution = correction
    ? "이번 호출은 원본-직전 결과 비교를 통한 교정 1회다."
    : "이번 호출은 현재 단계의 생성 1회다.";
  const explicitPreserve = explicitPreservationRules(preserve);
  const sharedPreserve = SHARED_INVARIANTS.map((rule) => `[shared-invariant] ${rule}`).join("\n");

  return [
    `[image-contract] operation=${normalizedOperation} backgroundPolicy=${normalizedBackground} arrowPolicy=${normalizedArrows}`,
    "[priority] explicit-change > operation > explicit-preserve > shared-invariants > style",
    "[explicit-change scope=named-only] 사용자 요청에서 변경 대상으로 명시한 객체·관계·선택 픽셀에는 요청을 먼저 반영한다. 그 범위에서만 하위 보존 규칙을 덮어쓴다.",
    `사용자 요청: ${String(request || "").trim()}`,
    OPERATION_RULES[normalizedOperation],
    BACKGROUND_RULES[normalizedBackground],
    ARROW_RULES[normalizedArrows],
    explicitPreserve,
    sharedPreserve,
    qualityModeRule(normalizedQuality, { revision: correction }),
    `[style]\n${EXAM_STYLE_PROMPT}\n${modeRule}\n마감 규칙: 검정 외곽선과 필요한 영역의 균일한 연회색 한 단계만 사용한다. 컬러·그라데이션·광택·사실적 그림자·질감·장식적 3D는 금지한다.`,
    `실행 규칙: 파일·저장소·문서·웹을 검색하거나 읽지 말고 추가 질문도 하지 않는다. 제공된 요청과 첨부만 사용해 imagegen 이미지 생성 도구를 정확히 1회 호출한다. 같은 생성 턴의 재시도·추가 생성은 금지한다. ${execution} 호출 뒤 성공하면 '이미지 생성 완료', 실패하면 '이미지 생성 실패: 짧은 이유'만 한 문장으로 반환한다.`,
  ].filter(Boolean).join("\n");
}

export function buildDiscussionPrompt({ request, mode = "diagram" }) {
  const modeRule = MODE_RULES[mode] || MODE_RULES.diagram;
  return `당신은 5E 과학 도식 제작의 요구사항을 정리하는 대화형 설계 보조자다. ${modeRule}\n이미지 생성 도구와 다른 도구를 호출하지 않는다. 사용자의 의도를 짧고 구체적으로 확인하거나, 현재까지 확정된 구조·배치·보존·수정 사항만 정리해 답한다. 결과를 임의로 확정하지 말고, 과학적 의미나 핵심 관계가 불명확할 때만 짧게 질문한다.\n사용자 메시지: ${String(request || "").trim()}`;
}
