import { AI_QUALITY_MODES, normalizeQualityMode, qualityModeRule } from "./ai-quality-mode.js?v=1.5.5";

export const EXAM_STYLE_PROMPT = `평가원식 과학 도식 제작 규칙:
- 참고 이미지나 설명의 핵심 구조, 객체·부품 수, 연결·접촉 관계, 상대 비율·배치와 패널 순서를 보존하고 과학적으로 정확하게 표현한다. 원본이나 설명에 없는 장치·부품·구조는 추가하지 않는다.
- 흑백 중심의 단정한 2D 선화로 그린다. 외곽선은 내부선보다 굵게 하고, 사실적 조명·광택·그림자·질감·과도한 3D 표현은 쓰지 않는다. 회색은 물리적 구분이 필요한 영역에만 한두 단계의 균일한 평면색으로 최소 사용하며, 후편집용 여백을 남긴다.
- 흰 배경 사각형, 종이 질감 또는 체크무늬를 그리지 말고 실제 RGBA 투명 배경으로 출력한다.`;

const MODE_RULES = {
  diagram: "그림형: 문자, 숫자, 단위, 수식, 기호, 라벨, 로고, 워터마크, 지시선과 화살표를 절대 생성하지 않는다. 전원·계기·표시 화면은 빈 면으로 둔다.",
  complete: "완성형(라벨 포함): 사용자가 명시적으로 요청한 문자, 라벨과 부가 표시만 포함한다. 요청하지 않은 라벨이나 기호는 임의로 추가하지 않는다.",
};

export function buildImagePrompt({ request, mode = "diagram", revision = false, qualityMode = AI_QUALITY_MODES.STANDARD }) {
  const modeRule = MODE_RULES[mode] || MODE_RULES.diagram;
  const normalizedQuality = normalizeQualityMode(qualityMode);
  const execution = normalizedQuality === AI_QUALITY_MODES.COMPLEX && revision
    ? "이번 호출은 원본-직전 결과 비교를 통한 교정 1회다."
    : "이번 호출은 현재 단계의 생성 1회다.";
  return `${EXAM_STYLE_PROMPT}\n${modeRule}\n${qualityModeRule(normalizedQuality, { revision })}\n${revision ? "수정 작업: 기존 결과에서 맞는 구조·배치와 요청하지 않은 영역은 그대로 보존하고 잘못된 부분만 변경한다." : "신규 작업: 참고 이미지가 있으면 그것을 유일한 구조 근거로 삼고, 없으면 사용자 설명을 교과서 삽화처럼 명확하고 충분한 세부 구조로 시각화한다."}\n마감 규칙: 순백색 바탕, 검정 외곽선, 필요한 영역의 균일한 연회색 한 단계만 사용한다. 컬러·그라데이션·광택·사실적 그림자·질감·장식적 3D는 금지한다.\n실행 규칙: 파일·저장소·문서·웹을 검색하거나 읽지 말고 추가 질문도 하지 않는다. 제공된 요청과 첨부만 사용해 imagegen 이미지 생성 도구를 정확히 1회 호출한다. ${execution} 호출 뒤 성공하면 '이미지 생성 완료', 실패하면 '이미지 생성 실패: 짧은 이유'만 한 문장으로 반환한다.\n사용자 요청: ${String(request || "").trim()}`;
}

export function buildDiscussionPrompt({ request, mode = "diagram" }) {
  const modeRule = MODE_RULES[mode] || MODE_RULES.diagram;
  return `당신은 5E 과학 도식 제작의 요구사항을 정리하는 대화형 설계 보조자다. ${modeRule}\n이미지 생성 도구와 다른 도구를 호출하지 않는다. 사용자의 의도를 짧고 구체적으로 확인하거나, 현재까지 확정된 구조·배치·보존·수정 사항만 정리해 답한다. 결과를 임의로 확정하지 말고, 과학적 의미나 핵심 관계가 불명확할 때만 짧게 질문한다.\n사용자 메시지: ${String(request || "").trim()}`;
}
