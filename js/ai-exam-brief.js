// The teacher writes the scene; the rendering agent supplies the print conventions.
export const EXAM_BRIEF_PROFILE = 'exam-brief-v1';
export const isExamBrief = input => input?.examBriefProfile === EXAM_BRIEF_PROFILE;

export function prepareExamBriefRunInput(input) {
  if (!isExamBrief(input)) return input;
  return { ...input, mode: 'complete', outputEngine: 'raster', approvedFirstPng: false,
    preserveSourceLabels: false, imageLabelWorkflow: null, generationMode: 'single', reviewEnabled: false };
}

export function buildExamBriefPrompt({ request = '', referenceRoleContract = '', revision = false } = {}) {
  if (!String(request).trim()) throw new Error('물체와 배치를 한 줄로 적어 주세요.');
  return `시험 문항용 과학 도판을 만드는 이미지 하네스다. 사용자는 물체의 위치·모양·관계만 간단히 적는다. 아래 표현 규칙을 사용자가 다시 작성하게 하지 말고 이미지 생성 도구에 전달할 한글 프롬프트에 내부적으로 보강한다.

내부 보강 순서:
1. 사용자 설명에서 물체 종류·개수·모양, 좌우·상하·안팎 위치, 연결·접촉, 액체·층·입자 수, 표기할 글자를 짧게 정리한다. 사용자가 명시한 조건은 보강 과정에서 바꾸지 않는다.
2. 표현 차원을 하나 정한다. 사용자가 평면·단면·2D 또는 입체·3D를 지정하면 그것을 우선한다. 지정하지 않았으면 회로·광선도·그래프·세포 모식도·지층 단면은 평면, 부피와 기구 조립을 보여 주는 실험 장치는 얕은 입체를 기본으로 삼는다. 모호하면 단순한 평면을 택한다. 참고 원본이 있으면 명시적 변경 요청이 없는 한 그 표현 차원을 유지한다.
3. 평면은 끝까지 평면: 원근·입체 옆면·원통의 타원·입체 음영을 섞지 않는다. 입체는 끝까지 입체: 모든 물체·받침·그릇을 같은 시점과 얕은 원근으로 그리고 일부만 평면 기호로 바꾸지 않는다. 글자와 설명선은 평면 주석으로 올릴 수 있다.
4. 평가원 과학탐구 기출의 작은 자료 도판 같은 시험용 창작 그림으로 정리한다. 순백색 불투명 배경, 가늘고 정돈된 검정 윤곽선, 필요한 부분만 옅은 중성 회색. 모든 픽셀은 R=G=B인 무채색으로 한다. 강한 그림자·광택·그라데이션·질감·장식·광고 렌더링·제목·문제 본문·정답·로고·테두리는 넣지 않는다. 축소 인쇄에서 구조가 명료해야 한다.
5. 사용자가 지정한 A·B·각도·기호·이름은 작고 보통 굵기로 겹치지 않게 표시한다. 요청하지 않은 라벨·힘 화살표·수치·물리적 조건·장치·실험 원인이나 결론은 발명하지 않는다. 설명이 짧아도 보강하는 것은 표현 규칙이며 출제 조건이 아니다. 연결·입자 수·층 순서가 과학적으로 모순되지 않는지 생성 전에 내부적으로 확인한다. 확인하지 못한 수치나 관계를 임의로 확정하지 않는다.
6. 참고 원본이 없으면 도판 하나를 가로 3:2 화면 중앙에 적당한 여백으로 배치한다. 원본이 있으면 사용자 요청 밖의 개수·연결·비율·배치·패널 순서를 보존한다.

${revision ? '수정: 기존 결과에서 요청한 부분만 수정하고 나머지 조건과 표현 차원을 유지한다.' : '신규 생성: 아래의 짧은 설명을 구성 근거로 사용한다.'}
${referenceRoleContract}

실행: 위 내부 보강 내용을 실제 이미지 생성 도구의 프롬프트에 포함하여 이미지 생성 도구를 정확히 1회 호출한다. 도구 호출 인수 transparent_background는 반드시 false로 지정한다. 배경 제거·투명 배경 기능을 켜지 않는다. 도구에 전달하는 프롬프트에도 “배경 #FFFFFF, 모든 픽셀 alpha=255, 투명·반투명 금지”를 명시한다. 추가 질문·파일·웹 검색·추가 생성은 하지 않는다. PNG 원본을 직접 생성하고 코드·SVG·필터·후처리로 대신 만들지 않는다. 생성한 실제 PNG를 반환한다. 실패하면 실패 이유를 짧게 알리고 생성했다고 주장하지 않는다. 내부 보강 목록은 그림에 쓰지 않는다.

사용자의 물체·배치 설명:
${String(request).trim()}`;
}
