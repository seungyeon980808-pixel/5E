import { planImageReferences } from "./ai-reference-roles.js?v=1.7.0-four-session-integration";

import { resolveAIModelSelection } from "./ai-model-capabilities.js?v=1.7.0-four-session-integration";
import { STYLE_CONTRACT_VERSION, REQUIRED_STYLE_CHECKS, buildKiceStyleContract } from './ai-image-style-contract.js?v=1.7.0-four-session-integration';

export const AI_IMAGE_REVIEW_VERSION = "1.7.0";
export const LABEL_REVIEW_POLICY = '5e-standard-v1';
export const AI_IMAGE_MAX_GENERATIONS = 2;

const REQUIRED_CHECKS = Object.freeze([
  ["object-counts", "객체·부품 수"],
  ["inside-outside", "안/밖 및 포함 관계"],
  ["liquid-occupancy", "액체 점유와 경계"],
  ["connections", "연결·접촉·분기"],
  ["composition-state", "방향·상대 배치·패널 상태"],
  ["black-fill-meaning", "검은 채움의 의미 구분"],
  ["presentation", "문자·질감·배경 표현"],
  ["request-scope", "요청 반영·요청 외 보존"],
]);
export const LABEL_REVIEW_CHECKS = Object.freeze([
  ['raster-label-removal', '원본 글자·기호 잔존'],
  ['editable-label-coverage', '편집 라벨 원문 대조'],
  ['leader-relations', '설명 지시선 관계'],
]);

export const LABEL_COMPOSITE_REVIEW_CHECKS = Object.freeze([
  ['label-overlay-alignment', '최종 라벨 가독성·겹침·잘림'],
  ['label-typography', '5E 표준 서식·의미 첨자'],
  ['leader-overlay', '최종 지시선 대상·가독성'],
]);

const text = (value) => value == null ? "" : String(value).trim();
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

export function buildStructuralInventory({ request = "", references = [], structureContract = "" } = {}) {
  const names = references.map((item, index) => `${index + 1}. ${text(item?.name) || `원본 참고 ${index + 1}`}`);
  return [
    "내부 구조 목록(그림에 출력하지 않음):",
    text(structureContract),
    names.length ? `원본 참고 순서:\n${names.join("\n")}` : "원본 참고 없음: 사용자 요청만 구조 근거로 사용",
    `요청 핵심: ${text(request) || "명시된 요청 없음"}`,
    "생성 전에 내부적으로 객체·부품 수, 안/밖, 액체 점유, 연결·접촉·분기, 층 순서, 검은 채움의 의미를 짧게 열거하고 서로 모순이 없는지 확인한다. 이 목록이나 설명은 최종 이미지에 쓰지 않는다.",
  ].join("\n");
}

// Header metadata only, not PNG integrity validation or pixel processing.
// Read the prepared attachment, never the pre-resize candidate or a STYLE image.
export function readReviewPngDimensions(data) {
  if (typeof data !== "string") return null;
  const prefix = /^data:image\/png;base64,/i.exec(data);
  if (!prefix) return null;
  try {
    const header = atob(data.slice(prefix[0].length, prefix[0].length + 44));
    if (header.length < 33) return null;
    const b = Array.from(header, (c) => c.charCodeAt(0));
    if ([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82].some((v, i) => b[i] !== v)) return null;
    const uint32 = (i) => b[i] * 16777216 + b[i+1] * 65536 + b[i+2] * 256 + b[i+3];
    const width = uint32(16), height = uint32(20);
    if (!width || !height || width > 2147483647 || height > 2147483647) return null;
    return { width, height };
  } catch { return null; }
}

export function buildImageReviewPrompt({
  request = "", structuralInventory = "", referenceNames = [], candidateName = "현재 후보", candidateAttachmentData = "", markPolicyContract = "", referenceRoleContract = "", labelPlan = null, labelOutcome = 'restore-editable', workflow = {}, labelOwnershipPolicy = "", labelCompositeReport = null, labelCompositeName = "",
} = {}) {
  const exam = workflow.imageKind === 'exam';
  const dimensions = readReviewPngDimensions(candidateAttachmentData);
  const referenceList = referenceNames.length
    ? referenceNames.map((name, index) => `${index + 1}. ${text(name) || `원본 참고 ${index + 1}`}`).join("\n")
    : "(원본 참고 이미지 없음: 사용자 요청만 기준으로 사용)";
  const exampleChecks = [...REQUIRED_CHECKS, ...(!exam ? REQUIRED_STYLE_CHECKS : []), ...(labelPlan ? LABEL_REVIEW_CHECKS.filter(([id]) => labelOutcome !== 'remove' || id === 'raster-label-removal') : []), ...(labelCompositeReport ? LABEL_COMPOSITE_REVIEW_CHECKS : [])].map(([id,label]) => ({id,label,status:'pass|fail|uncertain',detail:'원본과 실제 첨부를 대조한 관찰 근거'}));
  return `5E 과학 도식 독립 시각 검수 규칙 v${AI_IMAGE_REVIEW_VERSION}
${exam ? '기출 원본 보존 검수: 전체 스타일 변환은 금지다. 제거 마스크 밖의 디코딩 픽셀 동일성은 별도 픽셀 검사에서 판정하며 시각 검수만으로 동일성을 입증하지 않는다. 원본의 색·검정 채움·배경·질감·선 굵기는 보존 대상이다. 원본의 서체나 지시선 끝점 외형을 네이티브 라벨에서 복제할 필요는 없으며 내용·의미·대상과 가독성을 확인한다.' : '일반 이미지 최초 스타일 변환 검수.'}
역할: 새 대화에서 원본 참고 이미지들과 현재 후보 이미지를 직접 대조하는 독립 검수자다. ${text(referenceRoleContract) ? `첨부 순서와 역할은 다음 계약을 따른다. STYLE_REFERENCE를 원본 또는 후보로 계수하지 않는다.\n${text(referenceRoleContract)}` : `첨부 순서는 원본 참고 이미지 전부가 먼저이고 마지막 첨부가 현재 후보 "${text(candidateName) || "현재 후보"}"다.`}

${labelCompositeReport ? `최종 편집 라벨 검수 첨부 순서: 위 원본 참고 목록 ${referenceNames.length}장 → RAW_CANDIDATE "${text(candidateName)}" 1장 → FINAL_NATIVE_OVERLAY "${text(labelCompositeName)}" 1장이다. 마지막 첨부는 실제 5E 텍스트·수식·라벨 객체를 복원해 내보낸 합성 화면이다. 두 후보를 별도 패널/물체로 계수하지 않는다. raster-label-removal와 그림 구조/스타일은 RAW_CANDIDATE에서 확인하고 라벨의 최종 배치/서식/연결은 FINAL_NATIVE_OVERLAY를 원본과 직접 비교한다. FINAL_NATIVE_OVERLAY의 편집 글자는 정상적인 의도된 출력이다. generic presentation의 무문자 규칙은 RAW_CANDIDATE에만 적용한다. 실제 편집 조작과 정확한 원본 폰트 파일 일치는 첨부 화면만으로 검증했다고 주장하지 않는다.
라벨 검수 정책: ${LABEL_REVIEW_POLICY}. 원본은 내용과 과학적 대상 관계의 근거다. 일반 라벨의 서체·굵기·크기·자간·줄바꿈·위치·지시선 경로·점선 간격·채운 점/빈 원은 기존 5E 스타일로 정리해도 된다. 이러한 외형 차이만으로 실패 처리하지 않는다. 원문 글자·발생 수·기호·극성·수식 첨자·단위의 의미와 가리키는 대상은 유지해야 한다. 원본 서체 파일의 정체가 불명확하다는 이유만으로 uncertain을 주지 않는다.
실제 네이티브 렌더러의 측정·적용 서식 기록(대상 연결과 실제 편집 조작의 증명이 아님): ${JSON.stringify(labelCompositeReport)}
추가 필수 checks: ${LABEL_COMPOSITE_REVIEW_CHECKS.map(([id,label]) => id+' ('+label+')').join(', ')}.
label-overlay-alignment: 실제 최종 글자가 읽을 수 있는 크기인지, 다른 라벨이나 핵심 물체를 가리거나 캔버스 밖으로 잘리지 않는지 확인한다. 가독성을 위한 위치·줄바꿈 조정은 허용한다. 원본 bounds와의 편차는 참고 관찰이며 그 자체가 실패가 아니다. 배경 대상이 바뀌거나 지시선이 다른 부위를 가리키면 실패다. 불명확한 대상은 uncertain이다.
label-typography: measurements의 presentation에 기록된 실제 기존 5E fontFamily·fontWeight·크기·줄 간격·혼합 runs를 기준으로 화면을 확인한다. 해당 기록은 선언된 CSS 폰트 스택이며 실제 시스템 폰트 파일 식별의 증명이 아니다. 기존 5E 서체 및 정상 fallback은 허용한다. 물리량의 기울임, 단위·화학식의 정자, 위/아래첨자처럼 의미 있는 서식과 가독성은 유지한다. 원본 서체·굵기·글자 크기·줄바꿈의 외형 일치를 요구하지 않는다.
leader-overlay: 글자와 대상이 명확하게 연결되는지, 여러 대상이 빠짐없이 연결되는지, 선이 다른 글자나 물체를 가려 오독을 유발하는지 확인한다. 기존 5E의 점선·끝점·선 경로로 표준화해도 된다. 과학적 방향 화살표와 일반 설명 지시선을 구별하고, 방향 의미의 소실·뒤바뀜이나 연결 대상 오류는 실패다.
실제 편집 가능성은 별도 네이티브 편집 테스트에서 검증한다. 화면만으로 그 테스트를 통과했다고 주장하지 않는다. 원본 bounds 차이 등 diagnostics와 겹침·잘림 등 issues를 구별한다. issues에는 관련 checkId, 라벨 id와 실제 관찰 위치를 기록한다.` : ''}

원본 참고 목록:
${referenceList}

사용자 원래 요청:
${text(request)}

${text(structuralInventory)}

${text(markPolicyContract)}
${labelPlan ? `확정된 제거·복구 명세(자동 관찰 가설, 원본이 최우선): ${JSON.stringify(labelPlan)}
라벨 소유 규칙: ${text(labelOwnershipPolicy)}
추가 필수 checks: ${LABEL_REVIEW_CHECKS.filter(([id]) => labelOutcome !== 'remove' || id === 'raster-label-removal').map(([id, label]) => `${id} (${label})`).join(', ')}.
raster-label-removal: 각 일반 라벨의 글자·숫자·기호·글머리표·극성/반응 +/−, 전체 지시선 몸통, 프레임 접점, 화살촉, 채운 점과 빈 원을 RAW에서 각각 확인한다. 글자만 사라지고 끝점만 남거나 끊어진 선 조각이 남아도 실패다. 원형 끝점 내부가 흰색이라는 이유로 실제 혈관·구멍으로 오인해 보존하지 않는다. 원본의 해당 라벨 경로와 접점을 직접 대조하며 물리적 구멍과 구별한다. 최종 편집 끝점이 RAW의 잔재를 가려도 합격시키지 않는다. preservedMarks의 물리 아이콘과 보류한 그래프/세로쓰기, 과학적 화살표는 제거 대상이 아니다.
${labelOutcome === 'remove' ? '삭제 결과에서는 편집 라벨 coverage·연결·overlay를 요구하지 않는다. RAW 제거와 과학 구조만 검수한다.' : `editable-label-coverage: 원본의 실제 일반 표기와 명세 text를 발생 위치별로 직접 비교한다. 같은 문구라도 발생 수, 글머리표, 원문자, 대소문자·첨자·기호·단위를 확인한다. 가독성을 위한 줄바꿈과 비의미적 간격 조정은 허용한다. 빠진/추가된 글자나 불확실성은 pass로 추정하지 않는다. ${labelCompositeReport ? '마지막 합성 화면에서 실제 문구가 표시되는지 확인한다. 실제 편집 조작까지 주장하지 않는다.' : '이 첨부는 라벨 복구 전 PNG이므로 실제 편집 조작/최종 오버레이를 확인했다고 주장하지 않는다.'}
leader-relations: 설명 글자가 가리키는 과학적 대상과 여러 대상의 대응이 맞는지 대조한다. 선 경로·꺾임·끝점 외형의 원본 복제는 요구하지 않는다. RAW에서 라벨 소유의 선과 끝점은 함께 없어야 한다. 과학적 방향 화살표나 치수선의 누락을 허용하지 않는다. 각 실패에 관련 checkId와 label id 또는 실제 위치를 issues에 남긴다.`}
presentation에서 일반 문자는 제거 대상, 물리 픽토그램과 보류 범위 문자는 허용 대상이다. 명세의 rejectedCount/uncertainties가 있으면 전체 verdict를 pass로 하지 않는다.` : ''}

판정 원칙:
- 명시된 수정 요청을 판정 기준에 먼저 반영한다. 사용자가 의도한 개수·위치·연결 변경을 단순히 원본과 다르다는 이유로 실패 처리하지 않는다.
- 이름이 '수정 전 선택 버전'인 첨부는 추가 물체나 패널이 아니라 수정 전 기준 이미지다. 최초 원본은 과학적 의미의 근거, 수정 전 버전은 요청 밖 부분의 보존 근거로 구분한다.
- request-scope: 위치별 코멘트와 이번 요청이 각각 반영됐는가. 수정 전 버전이 있으면 요청하지 않은 부분의 물체·형태·색조·배치가 불필요하게 바뀌지 않았는가. ${exam ? '기출은 제거 영역 외 원본 스타일 변경을 허용하지 않는다.' : '최초 생성이면 평가원식 표현 변경은 허용하되 요청과 원본 구조를 보존했는지 확인한다.'} 관찰할 수 없으면 uncertain이다.
- 점수나 임의의 95점 기준을 만들지 않는다. 아래 구조적 하드 게이트를 각각 시각적으로 확인한다.
- object-counts: 의미 있는 객체·부품·층·패널의 수가 원본과 같은가. 단계별 묘사 수와 동시 존재 개체 수를 구별하고 작은 내부/하층 요소도 대조한다. 자동 관찰 명세는 정답이 아니므로 원본을 직접 확인한다. 명세의 null/불확실 관찰을 임의의 확정 개수나 fail 근거로 사용하지 않는다.
- inside-outside: 무엇이 무엇의 안/밖에 있는지, 포함·중첩·통과 관계가 같은가.
- liquid-occupancy: 액체가 어느 용기의 어느 구획을 얼마나 채우는지, 액면·경계·빈 공간의 위치가 같은가. 액체가 없으면 해당 없음의 근거를 detail에 쓴 뒤 pass로 표시한다.
- connections: 도선·관·막대·경계의 연결, 접촉, 교차, 분기, 단절이 원본과 같은가. 상태 변화/발생 과정의 방향 화살표는 의미 관계지만, 표시선 선택이 제거이면 의도적 제거로 판정한다. 유지로 선택한 표시와 실제 도선·관의 연결은 보존해야 한다.
- composition-state: 방향, 좌우·상하 상대 배치, 패널 순서와 각 패널의 상태·변화가 원본과 같은가. 크기 순서만 같다고 상대 크기 비율까지 pass로 판정하지 않는다. 전체 그림의 균일 확대·이동과 특정 객체의 확대·플롯 종횡비 변경을 구별한다. 그래프는 축 구획 내 교점·끝점·직선 전환 위치를 대조하고, 강조면의 상·하·좌·우 경계를 곡선과 별개로 확인한다. 모델 관찰의 경계 설명을 복사하지 말고 원본에서 재확인하며 불명확하면 uncertain이다.
- 회로·관·분기망의 형상 추가 대조(composition-state/request-scope): 전기적·기능적 연결이 같아 connections가 pass여도 실제 경로와 비율은 따로 판정한다. 각 분기 묶음·폐회로의 실제 실선 외곽 폭/높이, 내부 분기 위치, 별도 연결선과 중간 연결 구간, 빈 간격과 꺾임을 원본과 후보에서 직접 짝지어 대조한다. 전체 이미지 픽셀 크기나 제거된 문자·점선 주석을 크기 기준으로 쓰지 않는다. 같은 폭 또는 같은 외곽 범위로 정규화했을 때 국소 종횡비와 접점 배치가 유지되는지 확인한다. 명시 요청 없이 별도 연결선이 외곽선에 합쳐지거나 국소 비율·배선이 바뀌면 composition-state/request-scope 실패이며, 전기적 연결 오류와 구분해 설명한다. 패널 순서나 전기적 등가만으로 이 항목을 pass하지 않는다. detail에는 직접 비교한 경로·외곽 기준과 관찰 근거를 쓰고, 픽셀 수치를 측정하지 못했으면 정밀 수치를 발명하지 않는다. 기준 경계를 판독할 수 없으면 uncertain이다. 자동 관찰 명세가 경로를 단순화했더라도 원본 이미지가 우선한다.
${exam ? '- black-fill-meaning: 원본의 검정 채움과 색 범주가 그대로 보존되었는가. 흰 면이나 중성 회색으로 바꾸라고 요구하지 않는다.' : '- black-fill-meaning: 원본의 검은 물질·재료는 후보에서 흰 면+검정 윤곽으로 표현되었는가. 검은 채움이 실제 물질 의미인지 단순 윤곽/인쇄색인지 구분했는가. 과학적 구분에 필요한 제한적 중성 회색만 허용되었는가.'}
- 계측 표식 대조(presentation/request-scope): 실제 자·계기·눈금실린더·좌표축의 눈금선은 숫자·단위·문자와 구별한다. 명시적인 눈금 삭제 요청이 없으면 보존 대상이며, 보조선·지시선 제거 선택이나 반복 표식이라는 이유로 삭제를 요구하지 않는다. 원본에 실제 눈금이 보이는데 후보가 빈 막대·빈 계기로 바뀌면 이 기능 표식의 누락을 실패로 기록한다. 반대로 실제 눈금이 남아 있음을 문자 잔존 실패로 오판하지 않는다. 자동 관찰이 annotation으로 분류했어도 원본에서 기능과 위치를 다시 확인한다. 확인할 수 없는 개별 눈금 수를 발명하지 않는다.
${exam ? '- presentation: 원본 배경·질감·착색·해칭을 보존하고 확정된 제거 주석만 사라졌는가. 원래의 스타일 자체를 실패로 판단하지 않는다.' : '- presentation: 문자·라벨·로고·워터마크가 없고, 배경은 불투명 순백색이며, 불필요한 해칭·그림자·질감·착색이 없는가.'}
${exam ? '' : `독립 스타일 하드 게이트 v${STYLE_CONTRACT_VERSION} (RAW_CANDIDATE에서만 검사):
${buildKiceStyleContract()}
- kice-flat-style: rhwp 승인 하네스의 흑백 과학 도식인가. 선명한 검정 윤곽과 필요한 회색 채움·음영을 허용하고 불필요한 질감·반사·장식은 실패로 판정한다. 형태 구분을 돕는 절제된 음영을 무음영 규칙으로 거절하지 않는다. 구조·라벨 제거 여부는 다른 checks에서 각각 확인한다.
- flat-gray-regions: 회색 채움·음영이 물질·입자·단면 범주나 형태 구분을 돕는가. 피스톤과 유체의 명도 구분 및 도르래의 절제된 회색 음영은 허용한다. 필요한 음영을 무조건 제거하거나 균일한 평면색만 요구하지 않는다. 불필요한 질감·반사·장식 또는 과학적 범주·내부 경계 손상은 실패다. 회색이 없으면 관찰 근거를 적고 pass다.
두 항목을 생략하거나 관찰 없이 pass로 추정하지 않는다. 확인되지 않은 스타일은 uncertain이며 전체 합격·채택을 금지한다.`}
${exam ? '- 색·질감 보존: 원본의 색과 질감은 기출 보존 대상이다. 명시된 주석 제거 이외의 도식화·단순화·배경 정리는 허용하지 않는다.' : '- 원본의 색 자체는 충실도 기준이 아니다. 색을 보존하라는 이유로 실패 처리하지 않는다. 흰 배경 도식화에서 과학적 의미가 없는 것으로 확인된 배경장식의 제거는 객체 누락으로 오판하지 않는다. 실제 좌표틀·자료 구획·강조면·층은 배경장식과 다르며 보존해야 한다. 자동 decorative 분류도 정답이 아니므로 원본 근거 없이 삭제를 허용하지 않는다.'}
- 설명 표식 대조(request-scope/presentation): 이미지 하네스 또는 사용자 요청이 제거 대상으로 지정한 확대 원·강조틀·확대 연결선·투영 가이드·빈 주석 상자는 RAW_CANDIDATE와 최종 합성 화면 모두에서 전체 선·끝점·채움까지 없어야 한다. 원본에 보인다는 이유나 preservedMarks/geometryLock에 들어갔다는 이유로 잔존을 pass하지 않는다. 실제 관·혈관·도선·물체 윤곽·기기 눈금과 구별한다. 명시적으로 제거한 설명 표식의 소실을 구조 누락으로 오판하지 않는다.
- 불확실하거나 가려져 확인할 수 없는 하드 게이트는 pass로 추정하지 말고 uncertain으로 판정한다.
- 모든 check에는 원본과 후보를 직접 관찰한 구체적 근거를 detail에 쓴다. 빈 detail이나 단순 결론 반복은 관찰 근거가 아니다.

도구 금지: 이 검수 턴에는 imagegen 또는 다른 이미지 생성·편집 도구를 호출하지 않는다. 웹 검색, 파일 읽기, 코드 실행 등 다른 도구도 호출하지 않는다. 첨부 이미지를 보고 JSON 보고서만 작성한다.

출력: 코드 펜스나 설명 없이 아래 모양의 엄격한 JSON 객체 하나만 출력한다.
${JSON.stringify({verdict:'pass|fail|uncertain',checks:exampleChecks,issues:[{checkId:'관련 checks의 id',message:'실제 문제 설명',bbox:{x:0,y:0,width:1,height:1},severity:'critical|major|minor'}]})}
${dimensions ? `후보 첨부 PNG 헤더의 해상도는 ${dimensions.width}×${dimensions.height}px이다. x/width는 ${dimensions.width}, y/height는 ${dimensions.height}를 각각 분모로 사용한다.` : "후보 해상도 헤더를 확인하지 못했다. 해상도나 좌표 수치를 추측하지 않는다."}
bbox는 후보 전체 이미지의 왼쪽 위가 (0,0), 오른쪽 아래가 (1,1)인 좌표다. x와 width는 후보 전체 너비로, y와 height는 후보 전체 높이로 각각 나눈다. 세로 좌표를 너비로 나누거나 정사각형 패딩·화면 미리보기·부분 crop의 좌표를 쓰지 않는다. 위에서 형상 비교를 위해 폭을 맞춘 것과 bbox 좌표계는 별개다. 좌표 값은 JSON 숫자로만 작성한다. 위치를 확신할 때만 bbox를 넣고, 불명확하면 bbox를 생략하고 문제 설명만 남긴다. 문제가 없으면 issues는 빈 배열이다. 모든 필수 하드 게이트가 pass이고 중대한 문제가 없을 때만 verdict를 pass로 한다.`;
}

function normalizeBbox(value) {
  let bbox = value;
  if (Array.isArray(value) && value.length === 4) {
    bbox = { x: value[0], y: value[1], width: value[2], height: value[3] };
  }
  if (!bbox || typeof bbox !== "object") return undefined;
  const normalized = {};
  for (const key of ["x", "y", "width", "height"]) {
    const number = Object.hasOwn(bbox, key) ? bbox[key] : (key === "width" ? bbox.w : key === "height" ? bbox.h : undefined);
    if (typeof number !== "number" || !Number.isFinite(number) || number < 0 || number > 1) return undefined;
    normalized[key] = number;
  }
  if (normalized.width <= 0 || normalized.height <= 0) return undefined;
  if (normalized.x >= 1 || normalized.y >= 1) return undefined;
  if (normalized.x + normalized.width > 1 || normalized.y + normalized.height > 1) return undefined;
  return normalized;
}

// Derived from required checks, never from a model-supplied summary. This does
// not upgrade the combined image verdict or claim that editing was exercised.
export function summarizeLabelReview(report, compositeIssues = [], labelOutcome = 'restore-editable') {
  const ids = labelOutcome === 'remove' ? ['raster-label-removal'] : [...LABEL_REVIEW_CHECKS, ...LABEL_COMPOSITE_REVIEW_CHECKS].map(([id]) => id);
  const checks = ids.map(id => report.checks?.find(check => check.id === id));
  const issues = (report.issues || []).filter(issue => !issue.checkId || ids.includes(issue.checkId));
  const verdict = checks.some(check => check?.status === 'fail') ? 'fail'
    : checks.some(check => !check || check.status !== 'pass') || issues.length || compositeIssues.length ? 'uncertain' : 'pass';
  return { policy: LABEL_REVIEW_POLICY, verdict, editability: 'not-verified', checkIds: ids };
}

export function parseImageReviewReport(raw, { requireLabelChecks = false, requireCompositeChecks = false, requireStyleChecks = false, labelOutcome = 'restore-editable' } = {}) {
  let value;
  try {
    value = JSON.parse(text(raw));
  } catch {
    return { ok: false, error: "검수 응답이 엄격한 JSON 객체가 아닙니다." };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "검수 응답 최상위 값이 객체가 아닙니다." };
  }
  const verdict = text(value.verdict).toLowerCase();
  if (!new Set(["pass", "fail", "uncertain"]).has(verdict) || !Array.isArray(value.checks) || !Array.isArray(value.issues)) {
    return { ok: false, error: "검수 verdict, checks 또는 issues 형식이 잘못되었습니다." };
  }
  const checks = value.checks.map((check) => ({
    id: text(check?.id), label: text(check?.label), status: text(check?.status).toLowerCase(), detail: text(check?.detail),
  }));
  if (checks.some((check) => !check.id || !check.label || !check.detail || !new Set(["pass", "fail", "uncertain"]).has(check.status))) {
    return { ok: false, error: "검수 checks 항목 형식 또는 관찰 근거가 잘못되었습니다." };
  }
  const ids = checks.map((check) => check.id);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "검수 check id가 중복되었습니다." };
  }
  const byId = new Map(checks.map((check) => [check.id, check]));
  const requiredChecks = [...REQUIRED_CHECKS, ...(requireStyleChecks ? REQUIRED_STYLE_CHECKS : []), ...(requireLabelChecks || requireCompositeChecks ? LABEL_REVIEW_CHECKS.filter(([id]) => labelOutcome !== 'remove' || id === 'raster-label-removal') : []), ...(requireCompositeChecks ? LABEL_COMPOSITE_REVIEW_CHECKS : [])];
  if (requiredChecks.some(([id]) => !byId.has(id))) {
    return { ok: false, error: "필수 구조 하드 게이트가 누락되었습니다." };
  }
  const issues = [];
  for (const issue of value.issues) {
    const message = text(issue?.message);
    if (!message) return { ok: false, error: "검수 issue에 message가 없습니다." };
    const normalized = { message };
    if (issue?.checkId !== undefined) {
      if (typeof issue.checkId !== 'string' || !byId.has(issue.checkId)) return { ok: false, error: '검수 issue의 checkId가 실제 검수 항목과 다릅니다.' };
      normalized.checkId = issue.checkId;
    }
    const bbox = normalizeBbox(issue?.bbox);
    if (issue?.bbox != null && !bbox) return { ok: false, error: "검수 issue bbox가 유효한 0~1 양수 영역이 아닙니다." };
    if (bbox) normalized.bbox = bbox;
    const severity = text(issue?.severity).toLowerCase();
    if (severity && new Set(["critical", "major", "minor"]).has(severity)) normalized.severity = severity;
    issues.push(normalized);
  }
  const hardGateUnclear = requiredChecks.some(([id]) => byId.get(id)?.status !== "pass");
  const anyCheckUnclear = checks.some((check) => check.status !== "pass");
  const hasAnyIssue = issues.length > 0;
  const safeVerdict = checks.some(check => check.status === 'fail') ? 'fail'
    : verdict === "pass" && (hardGateUnclear || anyCheckUnclear || hasAnyIssue) ? "uncertain" : verdict;
  const report = { verdict: safeVerdict, checks, issues };
  if (requireLabelChecks || requireCompositeChecks) report.labelReview = summarizeLabelReview(report, [], labelOutcome);
  return { ok: true, report };
}

// A model's top-level verdict cannot bypass an omitted style/structure check.
// This gate retains raw diagnostics; it grants no permission to retry generation.
export function enforceImageLabelAcceptance(report, { workflow = {}, candidateSha256 = null } = {}) {
  const general = workflow.imageKind !== 'exam';
  const parsed = parseImageReviewReport(JSON.stringify(report), {
    requireLabelChecks: true,
    requireCompositeChecks: workflow.labelResult === 'restore-editable',
    requireStyleChecks: general,
    labelOutcome: workflow.labelResult === 'remove' ? 'remove' : 'restore-editable',
  });
  const retained = report && typeof report === 'object' ? clone(report) : emptyReport();
  let gated;
  if (parsed.ok) gated = { ...retained, ...parsed.report };
  else {
    const issues = Array.isArray(retained.issues) ? retained.issues : [];
    const issue = { code: 'acceptance-review-incomplete', message: parsed.error, severity: 'major' };
    const alreadyRecorded = issues.some(value => value?.code === issue.code
      && value.message === issue.message && value.severity === issue.severity);
    gated = { ...retained, verdict: 'uncertain', checks: Array.isArray(retained.checks) ? retained.checks : [],
      issues: alreadyRecorded ? issues : [...issues, issue] };
  }
  if (general && REQUIRED_STYLE_CHECKS.some(([id]) => gated.checks.find(check => check.id === id)?.status === 'fail')) gated.verdict = 'fail';
  if (general) gated.styleReview = { version: STYLE_CONTRACT_VERSION, candidateSha256,
    verdict: REQUIRED_STYLE_CHECKS.some(([id]) => gated.checks.find(check => check.id === id)?.status === 'fail') ? 'fail'
      : REQUIRED_STYLE_CHECKS.every(([id]) => gated.checks.find(check => check.id === id)?.status === 'pass') ? 'pass' : 'uncertain' };
  return { accepted: parsed.ok && gated.verdict === 'pass', state: parsed.ok && gated.verdict === 'pass' ? 'passed' : 'needs-attention', report: gated };
}

export function isImageLabelCandidateAccepted(candidate) {
  if (!candidate?.imageLabelWorkflow?.explicit) return true; // Scoped edits and other engines have their own contracts.
  const gate = enforceImageLabelAcceptance(candidate.reviewReport, { workflow: candidate.imageLabelWorkflow, candidateSha256: candidate.candidateSha256 });
  return candidate.reviewState === 'passed' && gate.accepted
    && (candidate.imageLabelWorkflow.imageKind === 'exam' || candidate.reviewReport?.styleReview?.version === STYLE_CONTRACT_VERSION
      && candidate.reviewReport.styleReview.candidateSha256 === candidate.candidateSha256);
}

export function buildImageCorrectionRequest({ request = "", report } = {}) {
  const issues = (report?.issues || []).map((issue, index) => {
    const box = issue.bbox ? ` [bbox x=${issue.bbox.x}, y=${issue.bbox.y}, width=${issue.bbox.width}, height=${issue.bbox.height}]` : "";
    return `${index + 1}. ${issue.message}${box}`;
  });
  const failedChecks = (report?.checks || [])
    .filter((check) => check.status !== "pass")
    .map((check) => `- ${check.label}: ${check.detail || check.status}`);
  return `${text(request)}

독립 검수에서 명시적으로 실패한 부분만 한 번 교정한다. 원본 참고와 현재 후보를 다시 대조하고, 맞는 영역은 그대로 보존한다.
검수 bbox는 AI의 위치 가설이며 검증된 마스크가 아니다. 후보 전체 너비/높이에 각각 정규화된 좌표로 읽되, 문제 설명과 실제 대상의 위치가 맞는지 먼저 확인한다. 맞지 않거나 불명확한 bbox를 임의 재척도하거나 그 영역을 삭제·재설계하는 허가로 사용하지 않는다.
${failedChecks.join("\n")}
${issues.length ? `구체적 문제:\n${issues.join("\n")}` : ""}`.trim();
}

const emptyReport = () => ({ verdict: "uncertain", checks: [], issues: [] });

export function createAiImageReviewController({ transport, onState = () => {}, now = () => Date.now() } = {}) {
  if (!transport || typeof transport.send !== "function") throw new TypeError("review transport.send is required");
  let activeRun = null;
  let serial = 0;
  let turnSerial = 0;
  const retiredTurnIds = new Set();
  const retiredThreadIds = new Set();

  const isCurrent = (owner, turn = null) => Boolean(
    owner && activeRun === owner && !owner.done && !owner.cancelled && (!turn || owner.turn === turn),
  );

  const emit = (owner, state, extra = {}) => {
    if (!owner || activeRun !== owner) return;
    const detail = {
      state,
      candidateId: owner.candidate?.id || null,
      report: clone(extra.report || owner.report || emptyReport()),
      generationCount: owner.generationCount,
      reviewCount: owner.reviewCount,
      ...owner.selection,
      elapsedMs: Math.max(0, now() - owner.startedAt),
    };
    owner.state = state;
    owner.report = detail.report;
    onState(detail, owner.candidate);
  };

  const rememberTurn = (turn) => {
    if (turn?.turnId) retiredTurnIds.add(turn.turnId);
    if (turn?.threadId) retiredThreadIds.add(turn.threadId);
  };

  const finish = (owner, state, report) => {
    if (!isCurrent(owner)) return false;
    rememberTurn(owner.turn);
    if (owner.turn) owner.turn.closed = true;
    owner.done = true;
    emit(owner, state, { report });
    return true;
  };

  const failureReport = (message, report = null) => ({
    verdict: "uncertain",
    checks: report?.checks || [],
    issues: [...(report?.issues || []), { message: text(message) || "독립 검수 작업 실패", severity: "major" }],
  });

  const deliverCorrectionAssistant = async (owner, turn) => {
    if (!isCurrent(owner, turn) || turn.closed || !turn.pendingCandidate) return false;
    if (turn.assistantDeliveryPromise) return turn.assistantDeliveryPromise;
    turn.assistantDeliveryPromise = Promise.resolve()
      .then(() => owner.acceptCorrectionAssistant?.(turn.pendingCandidate, turn.assistantText))
      .then(() => true)
      .catch((error) => {
        if (isCurrent(owner, turn) && !turn.closed) turn.errorText = error?.message || String(error);
        return false;
      });
    return turn.assistantDeliveryPromise;
  };

  function route(owner, turn, event) {
    if (!isCurrent(owner, turn) || turn.closed) return;
    // Desktop stops trailing narration after a completed image. This scoped
    // marker is not a user cancellation and must survive the terminal interrupt.
    if (event.kind === "finalization" && turn.kind === "correction") {
      if (event.state === "interrupting") turn.autoImageFinalization = true;
      if (event.state === "recovering" && turn.autoImageFinalization) turn.recoveringImage = true;
    }
    if (event.kind === "assistant" && ["review", "correction"].includes(turn.kind)) {
      if (turn.kind === "correction" && turn.assistantText.includes("<5e-editable-labels>")
        && !text(event.text).includes("<5e-editable-labels>")) return;
      turn.assistantText = text(event.text);
      turn.assistantReceived = true;
      if (turn.kind === "correction" && turn.pendingCandidate) void deliverCorrectionAssistant(owner, turn);
      return;
    }
    if (event.kind === "error") {
      turn.errorText = text(event.text) || "작업 오류";
      return;
    }
    if (event.kind === "image") {
      if (turn.kind === "review") {
        turn.errorText = "검수 전용 턴에서 예기치 않은 이미지 생성 이벤트가 발생했습니다.";
        turn.closed = true;
        finish(owner, "failed", failureReport(turn.errorText, owner.report));
        return;
      }
      if (turn.kind === "correction" && event.src && !turn.pendingCandidatePromise) {
        const capturedRun = owner;
        const capturedTurn = turn;
        turn.pendingCandidatePromise = Promise.resolve()
          .then(() => capturedRun.acceptCorrectionImage(event.src, capturedRun.generationCount, { rendererPrompt: event.rendererPrompt }))
          .then(async (candidate) => {
            if (!isCurrent(capturedRun, capturedTurn) || capturedTurn.closed || !candidate?.id) return null;
            if (!candidateUnchanged(capturedRun)) return null;
            capturedTurn.pendingCandidate = candidate;
            capturedRun.candidate = candidate;
            capturedRun.candidateBinding = candidateBinding(candidate);
            if (capturedTurn.assistantReceived) await deliverCorrectionAssistant(capturedRun, capturedTurn);
            capturedRun.report = emptyReport();
            emit(capturedRun, "correcting");
            return candidate;
          })
          .catch((error) => {
            if (isCurrent(capturedRun, capturedTurn) && !capturedTurn.closed) {
              capturedTurn.errorText = error?.message || String(error);
            }
            return null;
          });
      }
      return;
    }

    let terminal = null;
    if (event.kind === "done") {
      terminal = event;
    } else if (event.kind === "finalization" && ["confirmed", "recovered"].includes(event.state)) {
      terminal = { ...event, kind: "done", status: event.status || "completed" };
    } else if (event.kind === "finalization" && event.state === "recoveryFailed") {
      turn.errorText = text(event.message) || "작업 종료 확인 실패";
      terminal = { ...event, kind: "done", status: "failed" };
    }
    if (!terminal || turn.terminalStarted) return;
    turn.terminalStarted = true;
    if (turn.kind === "review") void completeReview(owner, turn, terminal);
    else if (turn.kind === "correction") void completeCorrection(owner, turn, terminal);
  }

  async function sendBoundTurn(owner, kind, payload) {
    if (!isCurrent(owner)) return false;
    rememberTurn(owner.turn);
    const turn = {
      token: ++turnSerial,
      kind,
      turnId: null,
      threadId: null,
      awaiting: true,
      queued: [],
      assistantText: "",
      assistantReceived: false,
      assistantDeliveryPromise: null,
      errorText: "",
      pendingCandidate: null,
      pendingCandidatePromise: null,
      terminalStarted: false,
      closed: false,
    };
    owner.turn = turn;
    try {
      const result = await transport.send(payload);
      if (!isCurrent(owner, turn) || turn.closed) return false;
      turn.turnId = result?.turnId || null;
      turn.threadId = result?.renderThreadId || result?.threadId || null;
      turn.awaiting = false;
      const queued = turn.queued;
      turn.queued = [];
      for (const event of queued) {
        if (!isCurrent(owner, turn) || turn.closed) break;
        const sameTurn = !event.turnId || !turn.turnId || event.turnId === turn.turnId;
        const sameThread = !event.threadId || !turn.threadId || event.threadId === turn.threadId;
        if (sameTurn && sameThread) route(owner, turn, event);
      }
      return isCurrent(owner, turn) && !turn.closed;
    } catch (error) {
      if (isCurrent(owner, turn) && !turn.closed) {
        finish(owner, "failed", failureReport(error?.message || String(error), owner.report));
      }
      return false;
    }
  }

  const candidateBinding = item => ({id:item?.id, name:item?.name, data:item?.data});
  const candidateUnchanged = owner => {
    if (Object.keys(owner.candidateBinding).every(key => owner.candidate?.[key] === owner.candidateBinding[key])) return true;
    finish(owner, "failed", failureReport("검수 도중 후보가 변경되어 결과를 적용하지 않았습니다.", owner.report));
    return false;
  };

  async function sendReview(owner) {
    if (!isCurrent(owner) || !candidateUnchanged(owner)) return false;
    owner.reviewCount += 1;
    emit(owner, "reviewing");
    const capturedCandidate = owner.candidate;
    let candidateAttachment;
    let referencePlan = null;
    try {
      candidateAttachment = await owner.prepareCandidateAttachment(capturedCandidate);
      if (owner.styleAttachments.length) referencePlan = planImageReferences({
        inputs: owner.originalAttachments, styleReferences: owner.styleAttachments, candidate: candidateAttachment,
      });
    } catch (error) {
      if (isCurrent(owner)) finish(owner, "failed", failureReport(error?.message || String(error), owner.report));
      return false;
    }
    if (!isCurrent(owner) || owner.candidate !== capturedCandidate || !candidateUnchanged(owner)) return false;
    // Desktop currently normalizes purpose:"chat" + ephemeralRender:true to
    // actual purpose "image". conversationId:null + resetConversation:true still
    // creates a fresh thread. The prompt forbids imagegen, and any image event
    // received on this review turn fails closed above.
    return sendBoundTurn(owner, "review", {
      text: buildImageReviewPrompt({
        request: owner.request,
        structuralInventory: owner.structuralInventory,
        referenceNames: owner.referenceNames,
        candidateName: owner.candidate?.name,
        candidateAttachmentData: candidateAttachment?.data,
        markPolicyContract: owner.markPolicyContract,
        referenceRoleContract: referencePlan?.roleContract || "",
      }),
      attachments: referencePlan?.attachments || [...owner.originalAttachments, candidateAttachment],
      conversationId: null,
      resetConversation: true,
      purpose: "chat",
      ephemeralRender: true,
      ...owner.selection,
    });
  }

  async function sendCorrection(owner, report) {
    if (!isCurrent(owner) || !candidateUnchanged(owner)) return false;
    if (owner.generationCount >= AI_IMAGE_MAX_GENERATIONS) {
      finish(owner, "needs-attention", report);
      return false;
    }
    owner.generationCount += 1;
    emit(owner, "correcting", { report });
    const capturedCandidate = owner.candidate;
    let payload;
    try {
      const referencePlan = owner.styleAttachments.length ? planImageReferences({
        inputs: owner.originalAttachments, styleReferences: owner.styleAttachments,
        candidate: await owner.prepareCandidateAttachment(capturedCandidate),
      }) : null;
      if (!isCurrent(owner) || owner.candidate !== capturedCandidate || !candidateUnchanged(owner)) return false;
      payload = await owner.makeCorrectionPayload({
        report: clone(report), candidate: capturedCandidate, generationCount: owner.generationCount,
        referenceRoleContract: referencePlan?.roleContract || "",
      });
      if (["model", "effort", "serviceTier"].some(key => (payload?.[key] ?? null) !== owner.selection[key])) {
        throw new Error("교정 요청의 모델 설정이 선택한 설정과 다릅니다. 다시 선택해 주세요.");
      }
      if (referencePlan) {
        if (!text(payload?.text)) throw new TypeError("Correction prompt is required");
        // The controller owns ordered images; callback cannot drop/reorder styles
        // or accidentally retain a previous candidate. Roles travel with them.
        payload = { ...payload, attachments: referencePlan.attachments,
          text: `${[referencePlan.roleContract, owner.markPolicyContract].filter(Boolean).join("\n\n")}\n\n${payload.text}` };
      }
    } catch (error) {
      if (isCurrent(owner) && owner.candidate === capturedCandidate) {
        finish(owner, "failed", failureReport(error?.message || String(error), report));
      }
      return false;
    }
    if (!isCurrent(owner) || owner.candidate !== capturedCandidate || !candidateUnchanged(owner)) return false;
    return sendBoundTurn(owner, "correction", payload);
  }

  async function completeReview(owner, turn, event) {
    if (!isCurrent(owner, turn) || turn.closed) return;
    const status = text(event.status).toLowerCase();
    if (["cancelled", "canceled", "interrupted"].includes(status)) {
      turn.closed = true;
      finish(owner, "cancelled", owner.report || emptyReport());
      return;
    }
    if (["failed", "error"].includes(status) || turn.errorText) {
      turn.closed = true;
      finish(owner, "failed", failureReport(turn.errorText || event.error || "검수 작업 실패", owner.report));
      return;
    }
    if (!candidateUnchanged(owner)) return;
    const parsed = parseImageReviewReport(turn.assistantText);
    if (!parsed.ok) {
      turn.closed = true;
      finish(owner, "failed", failureReport(parsed.error, owner.report));
      return;
    }
    owner.report = parsed.report;
    turn.closed = true;
    rememberTurn(turn);
    if (parsed.report.verdict === "pass") {
      finish(owner, "passed", parsed.report);
    } else if (parsed.report.verdict === "fail" && owner.generationCount < AI_IMAGE_MAX_GENERATIONS) {
      await sendCorrection(owner, parsed.report);
    } else {
      finish(owner, "needs-attention", parsed.report);
    }
  }

  async function completeCorrection(owner, turn, event) {
    if (!isCurrent(owner, turn) || turn.closed) return;
    const pending = turn.pendingCandidatePromise;
    if (pending) await pending;
    if (!isCurrent(owner, turn) || turn.closed) return;
    if (turn.pendingCandidate) await deliverCorrectionAssistant(owner, turn);
    if (!isCurrent(owner, turn) || turn.closed) return;
    const status = text(event.status).toLowerCase();
    const completedImageStop = status === "interrupted" && turn.autoImageFinalization && turn.pendingCandidate && !turn.errorText;
    if (["cancelled", "canceled", "interrupted"].includes(status) && !completedImageStop) {
      turn.closed = true;
      finish(owner, "cancelled", owner.report || emptyReport());
      return;
    }
    if (["failed", "error"].includes(status) || turn.errorText || !turn.pendingCandidate) {
      turn.closed = true;
      finish(owner, "failed", failureReport(turn.errorText || event.error || "교정 이미지 결과가 없습니다.", owner.report));
      return;
    }
    if (!candidateUnchanged(owner)) return;
    const correctedCandidate = turn.pendingCandidate;
    turn.closed = true;
    rememberTurn(turn);
    owner.candidate = correctedCandidate;
    owner.candidateBinding = candidateBinding(correctedCandidate);
    await sendReview(owner);
  }

  const handleEvent = (event) => {
    const turnId = event?.turnId || null;
    const threadId = event?.threadId || null;
    if (turnId && retiredTurnIds.has(turnId)) return true;
    if (threadId && retiredThreadIds.has(threadId)) return true;
    const owner = activeRun;
    const turn = owner?.turn;
    if (!isCurrent(owner, turn) || turn.closed || (!turnId && !threadId)) return false;
    if (turn.awaiting && !turn.turnId) {
      turn.queued.push(event);
      return true;
    }
    if (turnId && turn.turnId && turnId !== turn.turnId) return false;
    if (threadId && turn.threadId && threadId !== turn.threadId) return false;
    if ((turnId && turn.turnId === turnId) || (threadId && turn.threadId === threadId)) {
      route(owner, turn, event);
      return true;
    }
    return false;
  };

  const start = async (options = {}) => {
    if (!options.candidate?.id) throw new TypeError("review candidate is required");
    if (typeof options.prepareCandidateAttachment !== "function") throw new TypeError("prepareCandidateAttachment is required");
    if (typeof options.makeCorrectionPayload !== "function") throw new TypeError("makeCorrectionPayload is required");
    if (typeof options.acceptCorrectionImage !== "function") throw new TypeError("acceptCorrectionImage is required");
    // Validate before replacing an active run. Snapshot bytes/names, not caller objects.
    const requestedStyles = options.styleAttachments ?? [];
    if (!Array.isArray(requestedStyles)) throw new TypeError("styleAttachments must be an array");
    const initialPlan = requestedStyles.length ? planImageReferences({
      inputs: options.originalAttachments || [], styleReferences: requestedStyles,
    }) : null;
    if (activeRun && !activeRun.done && !activeRun.cancelled) {
      const prior = activeRun;
      prior.cancelled = true;
      rememberTurn(prior.turn);
      emit(prior, "cancelled");
      prior.done = true;
    }
    const owner = {
      id: ++serial,
      candidate: options.candidate,
      candidateBinding: candidateBinding(options.candidate),
      request: text(options.request),
      structuralInventory: text(options.structuralInventory),
      markPolicyContract: text(options.markPolicyContract),
      referenceNames: initialPlan ? [...initialPlan.sourceNames] : [...(options.referenceNames || [])],
      originalAttachments: initialPlan ? initialPlan.analysisAttachments : [...(options.originalAttachments || [])],
      styleAttachments: initialPlan ? initialPlan.attachments.slice(initialPlan.analysisAttachments.length).map(item => ({...item})) : [],
      prepareCandidateAttachment: options.prepareCandidateAttachment,
      makeCorrectionPayload: options.makeCorrectionPayload,
      acceptCorrectionImage: options.acceptCorrectionImage,
      acceptCorrectionAssistant: typeof options.acceptCorrectionAssistant === "function" ? options.acceptCorrectionAssistant : null,
      selection: { model: options.model, effort: options.effort, serviceTier: options.serviceTier ?? null },
      generationCount: Math.max(1, Number(options.generationCount || 1)),
      reviewCount: 0,
      startedAt: Number.isFinite(options.startedAt) && options.startedAt >= 0 ? Math.min(options.startedAt, now()) : now(),
      report: emptyReport(),
      state: "idle",
      done: false,
      cancelled: false,
      turn: null,
    };
    activeRun = owner;
    try { owner.selection = resolveAIModelSelection(owner.selection, options.models); }
    catch (error) {
      finish(owner, "failed", failureReport(error.message));
      return false;
    }
    return sendReview(owner);
  };

  const cancel = () => {
    const owner = activeRun;
    if (!owner || owner.done || owner.cancelled) return false;
    owner.cancelled = true;
    rememberTurn(owner.turn);
    if (owner.turn) owner.turn.closed = true;
    emit(owner, "cancelled");
    owner.done = true;
    return true;
  };

  return {
    start,
    cancel,
    handleEvent,
    isRecoveringImageTurn: () => Boolean(isCurrent(activeRun, activeRun?.turn) && activeRun.turn.kind === "correction" && activeRun.turn.autoImageFinalization && activeRun.turn.recoveringImage && activeRun.turn.pendingCandidatePromise && !activeRun.turn.closed),
    isActive: () => Boolean(activeRun && !activeRun.done && !activeRun.cancelled),
    getState: () => activeRun ? {
      state: activeRun.state,
      candidateId: activeRun.candidate?.id || null,
      generationCount: activeRun.generationCount,
      reviewCount: activeRun.reviewCount,
      report: clone(activeRun.report),
    } : null,
  };
}
