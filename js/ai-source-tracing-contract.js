import { APPROVED_FIRST_PROMPT } from './ai-approved-first-png.js?v=1.7.0-four-session-integration';
import { normalizeKiceStyleBody } from './ai-image-style-contract.js?v=1.7.0-four-session-integration';
export const SOURCE_TRACING_CONTRACT_VERSION = '1.2.0';
const PRIORITY = '[SOURCE-GRID-TRACING: HIGHEST GEOMETRY PRIORITY] 원본만 유일한 기하 기준이다. 원본 위에 겹쳐 놓았을 때 실제 과학 구조의 실루엣·윤곽·곡선·관 경로·물체 위치·크기·비율·끝점·접점·수면이 같은 자리에 맞도록 원본을 문자 그대로 따라 그린다. 의미가 같은 다른 그림으로 다시 구성하지 않는다. 사용자가 대상·속성을 명시해 변경을 요청한 부분만 예외로 하며, 그 밖에는 스타일만 바꾼다. 이 우선권은 위치·윤곽·경로·개수·위상에만 적용한다. 선·면·명암 스타일 계약을 덮어쓰지 않는다. 일반 배치 정돈이나 기하 단순화를 이유로 원본 형상을 바꾸지 않는다.';
export function buildSourceTracingPrompt({sourceFrame,inventory,body=APPROVED_FIRST_PROMPT,preserveStyle=false}={}) {
  if(typeof body!=='string'||body.length>200000)throw new TypeError('Invalid tracing prompt body');
  if(sourceFrame!==undefined&&(!sourceFrame||!Number.isInteger(sourceFrame.width)||!Number.isInteger(sourceFrame.height)||sourceFrame.width<1||sourceFrame.height<1||sourceFrame.width>16384||sourceFrame.height>16384))throw new TypeError('Invalid original source frame');
  if(inventory!==undefined&&(typeof inventory!=='string'&&(typeof inventory!=='object'||inventory===null)||JSON.stringify(inventory).length>100000))throw new TypeError('Invalid source geometry inventory');
  const styleBody=preserveStyle ? body : normalizeKiceStyleBody(body);
  const frame=sourceFrame?JSON.stringify({width:sourceFrame.width,height:sourceFrame.height,coordinateSystem:'original-canvas-top-left'}):'첨부 원본의 실제 전체 캔버스';
  return `${PRIORITY}\n[5e-source-tracing v${SOURCE_TRACING_CONTRACT_VERSION}]\n원본 프레임: ${frame}. 원본 크롭 경계·종횡비·여백·빈 공간을 고정한다. 확대·축소·이동·재중앙정렬·좌우반전·패널 재배치·대칭화·곡률 정돈으로 형상을 바꾸지 않는다.\n첨부된 INPUT_SOURCE.png를 실제 image generation tool의 이미지 편집 대상으로 전달한다. 원본 첨부 없이 텍스트만으로 새 그림을 생성하지 않는다. 실제 AI 이미지 편집으로 원본 과학 구조를 눈으로 추적하되 로컬 필터·자동 벡터 트레이싱·임계값 변환으로 대신하지 않는다. 사진도 새 장치나 이상적인 교과서 도해로 해석하여 재설계하지 않는다. 관의 길이/끝 모양, 개방 스위치의 간격, 가지별 연결과 교차, 수면의 높이와 빈 공간을 정확히 유지한다. 불명확하거나 가려진 구조는 추측해 채우거나 새로운 구조로 보완하지 않는다.\n${preserveStyle ? '스타일은 아래 승인된 본문을 그대로 따른다. 필요한 회색 채움·음영을 허용하고 무음영·균일 평면색이라는 추가 조건을 붙이지 않는다.' : '허용 변경은 스타일 계약에 따라 검정 윤곽선·흰 면을 기본으로 하고, 과학적 범주 구분이 필요한 면만 경계를 움직이지 않은 균일한 제한적 회색으로 바꾸는 것이다.'} 원본 색이나 사진 명암·광택은 기하 보존 대상이 아니다. 질감·광택·그림자 제거가 실제 물체 경계·내부 구획·액면·연결선 삭제를 허용하지 않는다.\n유일한 주석 예외: 확정된 라벨 소속 글자·전체 지시선·접점·화살촉·빈 원/채운 점은 함께 제거한다. 이 예외로 실제 관·혈관·배선·윤곽·눈금·과학적 화살표를 제거하지 않는다. 소속이 불확실한 것은 남겨 검수하고 지우지 않는다. 제거된 라벨 빈 공간으로 물체를 늘리거나 이동하지 않는다.\n${inventory!==undefined?`원본 관찰 메모(관찰 가설이며 실제 원본보다 우선하지 않음): ${typeof inventory==='string'?inventory:JSON.stringify(inventory)}\n`:''}\n${styleBody}\n\n${PRIORITY}\nFINAL CHECK: source crop and empty space remain fixed; trace literal source contours, endpoints and water level, remove only confirmed annotation ownership, invent no hidden structure. Return one actual AI-generated PNG; no automatic correction or second generation. 기하 보존과 승인된 선화 스타일을 각각 확인한다. ${preserveStyle ? '필요한 회색 음영을 임의로 금지하지 않는다.' : '위치·윤곽·경로 보존을 이유로 금지된 음영·광택·그라데이션을 허용하지 않는다.'}`;
}

export function buildSourceRelationReviewContract() {
  return `[5e-source-relations v${SOURCE_TRACING_CONTRACT_VERSION}]
첨부 원본을 유일한 근거로 실제 장치·부품과 연결점을 후보에 하나씩 대응시킨다. 스타일 변환만 요청했다면 기하 변경 허용 목록은 비어 있다. 사용자가 명시적으로 바꾼 대상·속성만 예외이며 일반적인 정돈·단순화는 예외가 아니다.
회로 사진은 전원·센서·스위치·저항판의 실제 종류와 개수, 단자별 도선의 시작·종료, 분기·교차·접촉, 저항선 굴곡과 접점 배열을 대조한다. 전기적 등가나 보기 좋은 회로라는 이유로 다른 장치·직선 저항·새 접점·새 배선을 허용하지 않는다. 원본에 없는 확대 삽화나 장치를 추가하지 않는다.
connections는 단자별 실제 연결, object-counts는 장치와 부품의 발생 수, composition-state/request-scope는 장치 형상·경로·상대 위치와 비율을 각각 판정한다. fail이면 원본의 어느 부품·연결이 후보에서 어떻게 바뀌었는지 detail에 쓴다. 가려진 연결은 추측하여 pass로 판정하지 않고 uncertain으로 남긴다.
[END 5e-source-relations]`;
}
