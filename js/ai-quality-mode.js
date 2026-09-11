export const AI_QUALITY_MODES = Object.freeze({
  SIMPLE: "simple",
  STANDARD: "standard",
  COMPLEX: "complex",
});

export const AI_OUTPUT_ENGINES = Object.freeze({
  RASTER: "raster",
  ASSET: "asset",
});

export const QUALITY_MODE_PROFILES = Object.freeze({
  [AI_QUALITY_MODES.SIMPLE]: Object.freeze({
    id: AI_QUALITY_MODES.SIMPLE,
    label: "단순",
    description: "물체 1~2개, 연결이 거의 없는 그림",
    expectedMinutes: "약 20~50초",
    correctionPasses: 0,
  }),
  [AI_QUALITY_MODES.STANDARD]: Object.freeze({
    id: AI_QUALITY_MODES.STANDARD,
    label: "보통",
    description: "여러 부품이 연결된 일반 실험 장치",
    expectedMinutes: "약 1~2분",
    correctionPasses: 0,
  }),
  [AI_QUALITY_MODES.COMPLEX]: Object.freeze({
    id: AI_QUALITY_MODES.COMPLEX,
    label: "복잡",
    description: "해부도, 혈관, 복합 회로·배관",
    expectedMinutes: "약 2~4분",
    correctionPasses: 1,
  }),
});

export function normalizeQualityMode(value) {
  return QUALITY_MODE_PROFILES[value] ? value : AI_QUALITY_MODES.STANDARD;
}

export function normalizeOutputEngine(value) {
  return value === AI_OUTPUT_ENGINES.ASSET ? value : AI_OUTPUT_ENGINES.RASTER;
}

export function qualityModeRule(value, { revision = false } = {}) {
  const mode = normalizeQualityMode(value);
  const invariant = "사용자가 변경 대상으로 명시한 객체·관계·선택 픽셀에는 요청을 먼저 반영한다. 그 대상 밖에서 원본의 주 객체 종류·개수·실루엣·연결·접촉·겹침·방향·좌우/상하 순서와 상대 비율은 어떤 경우에도 바꾸지 않는다.";
  if (mode === AI_QUALITY_MODES.SIMPLE) {
    return `단순 모드(고품질 1회 처리): 원본이 있으면 주 객체 외곽, 내부 경계, 구멍, 접촉점과 반복 세부를 빠짐없이 확인한다. ${invariant} 장면을 새로 해석하지 말고 명시적 변경 대상 밖의 원본 주 객체를 정밀한 선화로 옮긴다. 사진 필터처럼 거친 가장자리만 따지 말고 평가원 인쇄 도판 수준으로 선을 매끈하게 정돈한다. 흐림·노이즈·사진 질감을 새로운 내부 무늬로 발명하지 말고, 물체 식별과 과학적 의미에 필요한 내부 경계는 모두 남긴다. 명시적 변경 요청 없이 형태를 단순화하거나 다른 물체로 치환하지 않는다.`;
  }
  if (mode === AI_QUALITY_MODES.COMPLEX) {
    return revision
      ? `복잡 모드 교정 단계: 원본과 직전 결과를 객체별로 대조한다. ${invariant} 달라진 부품·분기·연결만 고치고 맞는 영역은 그대로 보존한다.`
      : `복잡 모드: 처리 전에 보이는 주 객체를 내부적으로 폐쇄 목록으로 정리하고 각 객체의 개수·분기·연결·접촉·앞뒤 관계를 점검한다. ${invariant} 해부학적 분기와 복합 배관을 임의로 보완하거나 생략하지 않는다.`;
  }
  return `보통 모드: 처리 전에 보이는 주 객체를 내부적으로 폐쇄 목록으로 정리하고 부품 수와 연결 관계를 확인한다. ${invariant} 사용자 요청과 원본에 없는 장치·프레임·기호를 추가하지 않는다.`;
}

export function qualityModeCacheVersion(value) {
  const mode = normalizeQualityMode(value);
  return `quality-${mode}-v2`;
}
