import { buildSourceTracingPrompt } from './ai-source-tracing-contract.js?v=1.7.0-four-session-integration';
import { buildSourceLabelRemovalManifest } from './ai-source-label-plan.js?v=1.7.0-four-session-integration';
import { buildImageLabelWorkflowContract } from './ai-image-label-workflow.js?v=1.7.0-four-session-integration';
import { sourceGeometryContract } from './ai-label-source-geometry.js?v=1.7.0-four-session-integration';
export const SOURCE_STYLE_EDIT_VERSION = '1.1.0';

// Only observed source geometry and this image's annotation ownership enter the
// edit. The tracing wrapper supplies the unchanged approved flat-style contract.
export function buildSourceStyleEditPrompt({sourceFrame,plan,workflow,request=''}) {
  if(workflow?.imageKind!=='general'||!plan?.frozen||!plan.geometryLock)throw new TypeError('Frozen general source observation required');
  const body = `첨부 원본 한 장의 스타일만 변환한다. 원본 물체·내부 윤곽·관계·선 경로·반복 개수·잘림·빈 공간이 기하 기준이다. 사진의 명암·광택·표면 질감을 제거하면서 실제 구조선·내부 경계·물리적 화살표를 보존한다. 확인되지 않는 구조는 새로 만들지 않는다.
이번 원본에서 확인된 제거 주석: ${JSON.stringify(buildSourceLabelRemovalManifest(plan))}
각 확인 항목의 글자 전체·설명 지시선 전체·접점·대상 끝 표식을 함께 제거한다. bbox는 관찰 위치이며 사각형 흰색 덮기 지시가 아니다. 실제 구조를 주석으로 오인하여 삭제하거나 제거된 글자 자리에 물체를 늘리지 않는다.
보존 표식: ${JSON.stringify(plan.preservedMarks||[])}
제외·보류 문구: ${JSON.stringify(plan.excludedLabels||[])}
그래프 소관 표기: ${JSON.stringify(plan.graphOwnedLabels||[])}. 그래프 축·눈금·내부 문자는 제거하거나 일반 편집 라벨로 중복 생성하지 않는다.
격리 항목(삭제 권한 없음): ${JSON.stringify(plan.quarantinedItems||[])}
${sourceGeometryContract(plan.geometryLock)}
불확실 관찰: ${JSON.stringify(plan.uncertainties||[])}
${buildImageLabelWorkflowContract(workflow)}
사용자 요청: ${request}
restore 항목만 별도 네이티브 객체로 복구한다. remove-only의 교과서 본문·주변 설명·페이지 캡션·말풍선·장식은 최종 PNG에서 제거하고 편집 객체로 복원하지 않는다. 주변 내용은 excludedLabels의 보존 항목이 아니다. 격리·불확실 소속과 그래프 표기는 지우지 않는다. 확대 삽화의 내부 과학 그림·개수·내용·광학 경로를 유지하고 테두리와 연결선은 그 소유 판정에 따라 별도로 처리한다. 새 글자나 새 주석을 PNG에 그리지 않는다. 배경과 기본 면은 흰색이며 승인 스타일 계약에서 허용한 과학 영역만 균일한 회색으로 구분한다. 실제 이미지 생성 도구를 정확히 한 번 호출하고 PNG 하나를 반환한다.`;
  return buildSourceTracingPrompt({sourceFrame,inventory:plan.geometryLock,body});
}
