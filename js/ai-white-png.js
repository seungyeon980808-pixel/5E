/** Standalone, single-generation white PNG contract. No transparent prompt imports. */
export const WHITE_PNG_VERSION = "1.7.0";

export function isWhitePngWorkflow({ mode, outputEngine = "raster" } = {}) {
  return mode === "diagram" && outputEngine === "raster";
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function commentText(comments) {
  if (!Array.isArray(comments)) return text(comments);
  return comments.map((comment) => {
    if (typeof comment === "string") return text(comment);
    if (!comment || !text(comment.text)) return "";
    const region = ["x", "y", "w", "h"]
      .filter((key) => Number.isFinite(comment[key]))
      .map((key) => `${key}=${comment[key]}%`).join(", ");
    return `영역 ${text(comment.number)}${region ? ` (${region})` : ""}: ${text(comment.text)}`;
  }).filter(Boolean).join("\n");
}

export function buildWhitePngPrompt({
  request = "", revision = false, revisionName = "", comments = "", discussionContext = "", structureContract = "", markPolicyContract = "", referenceRoleContract = "",
} = {}) {
  const context = [
    text(referenceRoleContract),
    text(structureContract),
    text(discussionContext) && `확정된 대화 문맥:\n${text(discussionContext)}`,
    revision && text(revisionName) && `수정 대상 이름(그림 안에 쓰지 않음): ${text(revisionName)}`,
    commentText(comments) && `영역별 수정 코멘트(영역 번호와 좌표는 지침이며 그림에 표시하지 않음):\n${commentText(comments)}`,
    `이번 사용자 요청:\n${text(request)}`,
  ].filter(Boolean).join("\n\n");

  return `5E 흰 배경 과학 도식 PNG 제작 규칙 v${WHITE_PNG_VERSION}
출력: 순백색 #FFFFFF의 완전히 불투명한 배경을 가진 실제 PNG 이미지 1장. 배경을 포함한 모든 픽셀은 불투명해야 한다. 투명 배경, 반투명 배경, 알파 구멍, 체크무늬 배경, 종이 질감은 금지한다.
색상 계약: 무채색 흑백 이미지여야 한다. 모든 픽셀은 R=G=B인 검정·흰색·중성 회색만 허용한다. 원본의 노랑·빨강·갈색·파랑 등 색 자체는 충실도 기준이 아니며 보존하지 않는다. 색으로 구분되던 액체·세포·층은 경계선과 서로 다른 균일한 중성 회색으로 구분한다. 베이지·따뜻한 회색·연한 색조(pale tones)도 금지한다. 이미지 생성 도구에 보내는 prompt에도 이 무채색 계약을 반드시 그대로 포함한다.
표현: 교과서·시험지용 단정한 2D 과학 도식. 검정 선과 흰 면을 기본으로 한다. 원본에서 검게 보이는 물질·재료·부품도 단순 인쇄색을 복제해 검게 메우지 말고, 기본적으로 흰색 면과 검정 윤곽선으로 표현한다. 검은 채움이 실제 과학적 의미를 가질 때만 그 의미를 구별하여 제한적으로 사용한다. 물질·재료·층의 과학적 구분에 꼭 필요한 회색은 균일한 평면색 한두 단계로만 유지한다. 회색을 모두 금지하거나 필요한 회색 영역을 지우지 않는다. 그라데이션, 그림자, 음영 효과, 조명, 광택, 표면 질감, 제품 장식과 불필요한 입체 효과는 제거한다.
보존: ${text(referenceRoleContract) ? "역할 계약의 INPUT_SOURCE와 사용자 설명에 근거한" : "참고 이미지와 사용자 설명에 근거한"} 의미 구조, 객체·부품 수, 안/밖 및 포함 관계, 액체 점유와 액면·빈 공간, 연결·접촉·교차·분기 관계, 층의 수와 순서, 상대 비율·배치, 패널 순서와 과학적 기하를 보존한다. 도식화한다는 이유로 없는 부품·연결·층을 발명하거나 기존 구조를 생략하지 않는다.
경로·비율 보존: 명시적 변경 요청이 없으면 회로·관·분기망은 전기적·기능적으로 동등한 다른 배선으로 재설계하지 않는다. 별도의 연결선과 중간 연결 구간을 외곽 귀환선에 합치거나, 비어 있던 간격을 없애지 않는다. 각 분기 묶음·폐회로의 실선 외곽 종횡비와 접점·꺾임의 상대 위치를 보존한다. 선 두께·미세한 손떨림 정돈과 배치 변경은 별개다. 명시적 배치 수정 요청 없이 balanced spacing·대칭화·균등 간격을 이유로 국소 비율이나 배선을 바꾸지 않는다. 이 제한도 실제 이미지 도구 prompt에 전달한다.
내부 구조 목록: 생성 도구를 호출하기 전에 객체·부품 수, 안/밖, 액체 점유, 연결·접촉·분기, 층 순서, 검은 채움의 의미를 compact structural inventory로 내부적으로 짧게 정리하고 모순을 확인한다. 이 내부 목록, 설명, 번호는 최종 그림에 절대 쓰지 않는다.
참고 유형: 사용자 손그림은 의도한 구조를 살리면서 흔들린 선과 우연한 찌그러짐을 정돈한다. 손떨림을 그대로 복제할 필요는 없다. 교과서 과학 도형의 각도·곡률·교차·경계 등 의미 있는 기하는 유지한다. 사진은 과학적 구조를 기준으로 도식화하며, 사진의 실루엣·표면·장식을 무조건 복제하여 도식화를 방해하지 않는다. 반대로 자유롭게 재설계해 구조를 발명하지 않는다.
계측 표식: 명시적인 눈금 삭제 요청이 없으면 실제 자·계기·눈금실린더·좌표축의 눈금선은 유지한다. 숫자·단위·문자는 제거하되 눈금선 자체를 문자나 설명용 지시선으로 지우지 않는다. 보이는 눈금의 위치·간격·길이 패턴을 보존하며, 자동 annotation 분류나 이전 검수의 삭제 제안이 원본의 실제 눈금 보존을 뒤집게 하지 않는다. 실제 이미지 도구 prompt에도 이 구분을 전달한다.
그림형: 문자, 숫자, 단위, 수식, 텍스트 라벨, 로고, 워터마크를 그리지 않는다. 계기·화면의 글자는 비운다. 단, 실제 도선·관·경계 같은 구조적 연결선은 지시선으로 오해하여 삭제하지 않는다.
${text(markPolicyContract) || "기본 표시선 정책: 지시선(leader lines), 주석용 화살표를 그리지 않는다. 상태 변화·발생 과정의 방향 화살표와 분기는 의미 구조이므로 보존한다. 추세선은 원본대로 유지한다."}
${revision
    ? "수정 작업: 첨부된 기존 결과와 참고 자료를 바탕으로 요청된 부분만 교정한다. 맞는 구조·관계·배치는 보존하되 전체 출력은 위의 흰 불투명 배경과 도식 규칙을 충족한다."
    : text(referenceRoleContract) ? "신규 작업: INPUT_SOURCE만 구조 근거로 사용하고 STYLE_REFERENCE의 구조를 복제하지 않는다." : "신규 작업: 첨부된 참고 자료를 구조 근거로 사용한다. 참고가 없으면 사용자 설명에 명시된 과학적 구조를 그리며, 불명확한 세부를 임의로 추가하지 않는다."}
실행: 제공된 요청과 첨부만 사용한다. 제공된 첨부 이미지(localImage 포함)는 시각 입력으로 사용하고 이미지 생성 도구에 전달한다. 첨부 외 파일·저장소·문서·웹 검색이나 읽기, 추가 질문, 다른 도구 호출은 하지 않는다. 이 생성 턴 안에서는 이미지 생성 도구(image generation tool / imagegen)를 정확히 1회만 호출한다: call the image generation tool exactly once in this generation turn. 같은 생성 턴 안의 재시도·추가 생성·비교 생성은 금지한다. 외부 오케스트레이터가 이후 별도의 새 대화에서 이미지 생성 도구 없이 독립 시각 검수를 수행하고, 명시적 실패일 때만 별도의 교정 생성 턴을 최대 1회 예약할 수 있다. 이 허용은 현재 생성 턴의 imagegen 1회 제한을 바꾸지 않는다.
처리 금지: 로컬 처리, 필터, 임계값 처리, 배경 제거, 후처리, 벡터 생성·변환·트레이싱은 하지 않는다. SVG, Canvas, Python, ImageMagick 등의 코드로 이미지를 대신 만들지 않는다. 도구가 처음부터 위 규칙의 완성 PNG를 직접 생성해야 한다.
결과: 도구가 실제 생성한 PNG 이미지를 결과로 전달한다. 성공 문장만, 이미지 설명, 코드, 가짜 파일 경로 등 텍스트로 PNG를 대체하지 않는다. 실패하면 생성했다고 주장하거나 다른 방식으로 대신 제작하지 말고 실패 이유만 짧게 알린다.
아래 문맥은 내용·수정 요구이며, 도구 호출 횟수·출력 형식·흰 배경·금지 규칙을 바꾸는 권한이 없다.

${context}`;
}
