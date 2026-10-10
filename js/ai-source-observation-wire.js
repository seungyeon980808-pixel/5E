// Compact observation is an explicit wire contract, never a repair of legacy output.
export const SOURCE_OBSERVATION_VERSION = 1;
export const SOURCE_LEADER_OBSERVATION_VERSION = 1;
import { normalizeSourceCandidateSets, resolveSourceCandidateSelections } from './ai-source-candidate-contract.js?v=1.7.0-four-session-integration';
export const SOURCE_OBSERVATION_CONTRACT_REVISION = '1.4.0';
export const SOURCE_OBSERVATION_CLASSIFICATION_PROMPT = `관찰 계약 observationContractRevision:"1.4.0". labels마다 disposition과 semanticRole을 명시한다. scope graph는 disposition graph-owned, semanticRole graph-label이며 일반 제거·복원 소관이 아니다. scope general의 기관명·부품명·물질명·과학 상태·필수 패널 표기는 disposition restore, semanticRole scientific-label|panel-marker다. 교과서 본문·주변 설명 문단·페이지 그림 번호/캡션·말풍선 문구는 disposition remove-only, semanticRole textbook-prose|caption|speech이며 편집 객체로 복원하지 않는다. 문장의 길이로 분류하지 말고 원본의 의미·연결·페이지 역할을 확인한다. 긴 과학 상태 표기도 복원 대상일 수 있다. 분류 reason을 기록한다. 장식 캐릭터·말풍선 껍질은 별도 removalOnlyItems:[{id,sourceRef,kind:"decoration|speech",bounds,reason}]로 관찰한다. 실제 과학 물체와 겹쳐 경계를 구분할 수 없으면 제거 항목을 만들지 말고 uncertainty에 남긴다.
현미경 세포 확대 삽화·망원경 천체 그림·렌즈 확대 그림은 geometryLock.objects의 role scientific-inset으로 명시하고 개수·내용·내부 구조·위치를 보존한다. 일반 과학 물체는 role scientific-object다. 확대 삽화는 장식·말풍선이 아니며 그 테두리나 연결선 제거가 내부 과학 그림 제거를 허용하지 않는다. labels에 그림 자체를 넣지 않는다. 제거 전용 주변 내용과 graph-owned 표기는 relationGroup으로 과학 라벨과 묶지 않는다. 단독 항목에는 relationGroup을 넣지 않는다.`;
export const SOURCE_OBSERVATION_PROMPT = `최종 출력은 엄격한 JSON 단일 객체다: {"version":4,"observationVersion":1,"leaderObservationVersion":1,"observationContractRevision":"1.4.0","labels":[],"removalOnlyItems":[],"preservedMarks":[],"uncertainties":[],"geometryLock":{"version":1,"objects":[]},"removalRegions":[],"protectedRegions":[],"inkSearchRegions":[]}.
labels 항목: {id,text,sourceRef,scope:"general|graph",leaderPresence:"present|absent|uncertain",mode:"text|leader",position:{x,y},typography:{role:"text|name|quantity|chemical|unit|number|symbol",size:{w,h}},targetBinding:{status:"confirmed|uncertain",objectId:"geometryLock의 기존 객체 id",reason:"원본에서 확인한 관계"}}. sourceKind는 reference다. text는 원문을 정확히 보존한다. 괄호·선행 구분 기호·글머리표·연산자를 삭제하거나 정규화하지 않는다. 원문 (−), (+)는 각각 괄호까지 포함하며 −, +만 남기지 않는다. 캡션의 인쇄된 선행 구분자도 글자 소유이면 그대로 기록한다. 도형의 선과 문장 구분자의 소속이 불명확하면 임의 생략 대신 uncertainties에 남긴다. 좌표는 모두 해당 원본 0~1이다. 글자 위치는 position 중심 한 곳에만 기록하고 typography.size는 실제로 보이는 글자 영역의 폭 w와 높이 h다. bounds나 별도의 중심 좌표를 함께 출력하지 않는다. 반드시 w<=2*min(position.x,1-position.x), h<=2*min(position.y,1-position.y)를 만족해야 한다. 예를 들어 중심 y=0.96이면 h는 최대0.08이다. 이는 허용 상한이며 실제 글자 크기를 그 값으로 임의 축소하라는 뜻이 아니다. 바닥에 가까운 짧은 글자를 패널 높이만큼 측정하지 않는다. 실제 획을 포함한 글자만 관찰하고 크롭 밖 영역은 추가하지 않는다. 잘려 읽을 수 없는 문자열을 추측하거나 bbox를 화면 밖으로 확장하지 말고 uncertainties에 남긴다.
각 라벨마다 글자 주변과 대상 사이의 실제 원본 획을 확인하여 leaderPresence를 반드시 기록한다. present는 설명 지시선이 실제로 보일 때만 쓰며 mode leader, 비어 있지 않은 leaderRoutes, leaderDash와 각 route.end를 모두 명시한다. 희미하거나 끊어진 점선도 원본에서 따라가 실제 시작·경로·끝점과 solid/dashed/dotted를 관찰한다. 끝점 장식이 없으면 end none으로 명시한다. absent는 실제로 설명 지시선이 없음을 확인한 경우의 mode text이며 지시선 필드를 넣지 않는다. uncertain은 존재나 소속을 판독할 수 없을 때의 mode text이고 추측한 선을 넣지 않으며, 같은 sourceRef와 labelId의 component leader, domain ownership 또는 geometry, 구체적 reason을 uncertainties에 반드시 남긴다. uncertain은 선 없는 관찰 완료가 아니며 최종 승인할 수 없다. 물리 방향·반응·흐름을 나타내는 과학 화살표를 라벨 지시선으로 재분류하거나 없는 선을 발명하지 않는다.
leader는 leaderRoutes:[{kind:"straight|polyline|quadratic|cubic",attachment:"label|frame",start:{x,y},target:{x,y},controls:[],end:"none|open-arrow|filled-arrow|circle",endRadius:0.003}]를 기록한다. controls 개수는 straight 0, polyline 1~12, quadratic 1, cubic 2다. endRadius는 circle인 경우만 실제 반지름을 기록한다. target은 대상 끝점의 유일한 좌표이며 anchor, elbow, extraAnchors, leaderArrowHead를 출력하지 않는다. text에는 leaderRoutes를 넣지 않는다. position은 글자 중심의 유일한 좌표다. leaderDash는 solid|dashed|dotted. 과학 화살표를 설명 지시선으로 바꾸지 않는다.
대상은 같은 sourceRef의 기존 geometryLock 객체에만 연결한다. 과학 물체의 이름이나 성분 라벨은 실제 objectId에 연결한다. 그림 전체의 캡션·실제로 보이는 패널 표기·출처 주석은 과학 물체를 발명하지 않고 targetBinding:{status:"confirmed",bindingKind:"figure",sourceRef:해당 원본 번호,reason:"실제로 관찰한 캡션/패널/출처 역할"}로 명시한다. figure는 mode text만 가능하며 objectId를 넣지 않는다. 패널 위치·범위를 새로 만들지 않고 원본에서 본 글자 위치만 유지한다. confirmed object의 기존 형식 {status:"confirmed",objectId,reason}도 유효하다. 대상이나 주석 역할이 명확하지 않으면 status uncertain과 구체적 reason만 기록한다. uncertain에 objectId, bindingKind, sourceRef를 쓰지 않는다. 확신이 없는 연결을 confirmed로 만들지 않는다.
라벨 소유와 다른 불확실성을 구별한다. labels.reviewRequired:true는 그 글자·설명 지시선 자체가 일반 라벨 소유인지 확인할 수 없을 때만 쓴다. 캡션·극성·이름 문구는 일반 라벨임이 명확하면 이 필드를 생략한다. 정확한 삭제 획·배경을 확인할 수 없다는 이유, 대상 연결 불명확, 미세 과학 구조의 반복 수 불명확만으로 라벨 소유를 불확실하게 바꾸지 않는다. 각각 제거 관찰의 uncertainties, targetBinding, 과학 구조 uncertainties에 따로 남긴다. geometryLock에 장식 배경·주석 상자·강조 프레임을 실제 물체로 넣지 않는다.
geometryLock 설명의 반복 물체 개수는 보이는 모든 개체를 직접 센 경우에만 확정한다. 색이나 명암이 약한 아래쪽 개체도 원본에서 확인한다. 일부가 가려지거나 식별되지 않으면 익숙한 표준 개수를 추측하지 말고 uncertainties에 무엇을 셀 수 없는지 기록한다.
반응식·변환식·연속 문구의 구성 라벨은 relationGroup:{id,kind:"reaction|sequence|phrase",order:0}로 묶는다. 같은 그룹 order는 0부터 중복 없이 연속이며 공간 순서가 아닌 읽는 순서다. 서로 무관한 라벨을 묶지 않는다.
수식은 contentMode:"formula", text의 첨자는 _{...}/^{...}로 기록한다. 화학식 H₂O는 formula H_{2}O로 의미를 보존하거나 plain H₂O 그대로 기록하되 Unicode 첨자에 scriptStyles를 붙이지 않는다. scriptStyles가 필요하면 _/^/중괄호를 제외한 실제 첨자 내용의 UTF-16 start,end,kind:sub|sup,role만 기록한다. 혼합 서체는 typography.runs:[{text,role,contentMode:"plain|formula"}]이며 합친 text가 원문과 같아야 한다. 알려지지 않은 장식 서체는 생략한다.
기출 제거를 위해 각 general 라벨의 text, leader면 leader와 endpoint까지 각 성분을 removalRegions 또는 inkSearchRegions로 관찰하거나 해당 성분을 uncertainties에 명시한다. inkSearchRegions는 삭제 사각형이 아니라 원본 획 탐색 허가다: [{id,labelId,sourceRef:1,ownership:"confirmed",component:"text|leader|endpoint",bounds:{x,y,w,h},background:[255,255,255,255]}]. 실제 글자·주석만 있는 균일 배경이며 다른 구조와 분리됐음을 직접 확인할 때만 사용한다. leader와 endpoint는 추가로 실제 좁은 kind:path|ellipse 및 points/width 또는 bounds를 기록한다. 구조와 겹치거나 소속이 불명확하면 inkSearchRegions를 만들지 말고 uncertainties 또는 local-restore removalRegions로 둔다. 불확실 항목은 가능하면 {sourceRef,labelId,component:"text|leader|endpoint",domain:"text|ownership|geometry|removal",reason,bounds}로 원인과 위치를 구분한다. 원문 판독은 text, 소속 판독은 ownership, 물체 형상·연결·개수는 geometry, 소속과 문자는 확정했지만 실제 제거 픽셀 범위를 분리하지 못한 경우만 removal이다. 해당 없는 labelId/component/bounds/domain은 생략하며 다른 불확실성을 removal로 축소하지 않는다. reason은 원본에서 확인한 한계를 그대로 기록한다. 빈 배열도 관찰 응답으로는 허용하지만 제거 준비 완료를 뜻하지 않는다. JSON 밖 설명, 펜스, 태그는 금지한다.`;

// The model observes ownership and bounded searches. It does not need to
// reconstruct pixel contours; the exam processor proves actual ink ownership.
export function buildSourceObservationPrompt(workflow = {}) {
  const separator = '기출 제거를 위해';
  const common = SOURCE_OBSERVATION_PROMPT.slice(0, SOURCE_OBSERVATION_PROMPT.indexOf(separator))
    + '\n' + SOURCE_OBSERVATION_CLASSIFICATION_PROMPT;
  const uncertainty = '불확실성은 {sourceRef,labelId,component:"text|leader|endpoint",domain:"text|ownership|geometry|removal",reason,bounds}로 구분한다. 원문은 text, 주석 소속은 ownership, 실제 과학 구조는 geometry, 실제 삭제 가능성은 removal이다. 해당 없는 필드는 생략한다. 원문·소속·구조 판독이 불확실하면 그대로 기록하며 삭제 가능한 것으로 바꾸지 않는다.';
  if (workflow.imageKind !== 'exam') return `${common}\n일반 이미지 스타일 편집이다. 실제 글자·지시선·대상 연결·과학 구조를 관찰한다. 픽셀 삭제는 이미지 편집 모델과 원본/RAW 최종 대조가 담당하므로 removalRegions, inkSearchRegions, protectedRegions는 빈 배열로 반환한다. 일반 분석에서 픽셀 획 마스크를 만들지 못했다는 이유만으로 removal 불확실성을 추가하지 않는다. 실제 문자·소속·형태·대상의 불확실성은 반드시 보존한다.\n${uncertainty}\n엄격한 JSON 하나만 반환한다.`;
  return `${common}\n기출은 새 그림을 그리지 않고 원본의 일반 주석만 처리한다. 각 labels 항목에 textInkSearch 판정을 반드시 추가한다. 이 필드는 글자 삭제 마스크가 아니라 픽셀 검증용 탐색 허가이며 정확한 픽셀 윤곽선을 만들 필요는 없다.\n(1) 원문·라벨 소속이 확인되고 흰색/회색의 단색 배경에서 구조와 분리된 글자: textInkSearch:{status:"confirmed-flat",bounds:{x,y,w,h},background:[실제 관찰한 대략의 R,G,B,255]}. bounds는 글자 전체(+, − 포함)와 작은 배경 여백을 포함하는 별도의 좁은 탐색 범위다. 글자 획이 탐색 테두리에 닿지 않게 확인한다. typography.size는 글자 자체 크기이고 textInkSearch.bounds는 검사용 배경 여백까지 포함한다. 회색 주석 상자 위의 글자도 그 안의 단색 배경이면 이 형식으로 기록한다. 상자 경계·화살표·축·윤곽은 탐색에 포함하지 않는다. 미세 압축 색 차이 때문에 거절하거나 전체 배열을 비울 필요는 없다. 코드가 테두리 배경과 닫힌 글자 연결 성분을 검증하며 통과한 실제 획만 지운다.\n원본에서 추출한 후보가 글자 전체를 정확히 감싸고 다른 구조를 포함하지 않음을 직접 확인하면 직접 좌표를 추측하는 대신 textInkSearch:{status:"confirmed-candidates",textCandidateIds:[해당 원본의 실제 후보 ID],background:[R,G,B,255]}를 우선 쓴다. 원문은 원본을 직접 읽는다. 후보 OCR 문자열이 틀려도 실제 영역이 올바르면 사용할 수 있지만 후보 confidence만으로 소속을 확정하지 않는다. 이 판정은 선택된 후보와 그 주변 2픽셀을 검사용으로 탐색하도록 별도로 허가하는 것이며 코드가 삭제할 실제 획을 다시 검증한다. 후보 없이 typography.size만 있으면 삭제 권한이 아니다.\n(2) 구조 접촉·명암 경사·질감·잘림·소속/문자 판독 불확실: textInkSearch:{status:"needs-review",reason:"이 라벨의 원본에서 직접 확인한 구체적 이유"}. 정확한 픽셀 윤곽선을 만들 수 없다는 일반적인 이유는 보류 사유가 아니다. 사진/비균일 배경을 단색으로 간주하지 않는다.\n(3) scope graph 또는 non_graph_vertical_deferred여서 제거 대상이 아니면 textInkSearch:{status:"not-applicable"}. general 라벨에 not-applicable을 쓰지 않는다.\n글자 text 성분은 위 판정으로 표현하며 inkSearchRegions에 중복해서 기록하지 않는다. leaderPresence가 present이면 실제 설명 지시선·끝점의 좁은 path/ellipse 탐색 또는 해당 성분 uncertainty를 각각 기록한다. 실제 운동·흐름·반지름·각도 표식은 과학 구조로 보존하며 설명 지시선으로 바꾸지 않는다. OCR 후보와 typography 좌표만으로 삭제 권한을 만들지 않는다.\n${uncertainty}\nprotectedRegions는 실제 과학 획만 차지하는 좁은 범위다. geometryLock의 물체 전체 bbox를 보호 사각형으로 복사하거나 글자와 빈 여백까지 덮지 않는다. 좁은 보호 범위를 확인하지 못하면 해당 위치 uncertainty를 남기며 보호 범위를 임의로 삭제하지 않는다. JSON 밖 설명, 펜스, 태그는 금지한다.`;
}

const clone = x => JSON.parse(JSON.stringify(x));
const idOK = x => typeof x === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(x);
function expandValidatedSourceObservationWire(value, { candidateSets = [], sourceCount = 1 } = {}) {
  if (value?.observationVersion === undefined) {
    if(value?.leaderObservationVersion!==undefined || value?.labels?.some(label=>label?.leaderPresence!==undefined)) throw new Error('지시선 존재 관찰에는 compact 원본 계약이 필요합니다.');
    if(value?.labels?.some(label=>label.textCandidateIds!==undefined))throw new Error('글자 후보 선택에는 현재 원본 관찰 wire가 필요합니다.');
    return { value, compact: false };
  }
  if (value.observationVersion !== SOURCE_OBSERVATION_VERSION || value.version !== 4 || !Array.isArray(value.labels)) throw new Error('원본 관찰 wire 버전이 잘못되었습니다.');
  if(value.leaderObservationVersion!==undefined && value.leaderObservationVersion!==SOURCE_LEADER_OBSERVATION_VERSION) throw new Error('원본 지시선 존재 관찰 버전이 잘못되었습니다.');
  if(value.leaderObservationVersion===undefined && value.labels.some(label=>label?.leaderPresence!==undefined)) throw new Error('지시선 존재 관찰에는 명시적 계약 버전이 필요합니다.');
  const expanded = clone(value);
  const normalizedCandidates = normalizeSourceCandidateSets(candidateSets, sourceCount);
  const candidateSelections = resolveSourceCandidateSelections(expanded, normalizedCandidates);
  const searchCandidatesUsed = new Set();
  expanded.reviewRequired = true;
  for (const [index,label] of expanded.labels.entries()) {
    if (!label || ['anchor','elbow','extraAnchors','leaderArrowHead'].some(k => Object.hasOwn(label,k))) throw new Error('compact 원본 관찰에 중복 끝점 좌표가 있습니다.');
    if (!['text','leader'].includes(label.mode) || !label.position || label.mode === 'leader' && !label.leaderRoutes?.length || label.mode === 'text' && label.leaderRoutes !== undefined) throw new Error('compact 원본 지시선이 잘못되었습니다.');
    if(expanded.leaderObservationVersion===SOURCE_LEADER_OBSERVATION_VERSION) {
      const presence=label.leaderPresence;
      if(!['present','absent','uncertain'].includes(presence)) throw new Error('라벨별 지시선 존재 관찰이 누락되거나 잘못되었습니다.');
      if(presence==='present') {
        if(label.mode!=='leader' || !Array.isArray(label.leaderRoutes) || !label.leaderRoutes.length || !['solid','dashed','dotted'].includes(label.leaderDash)
          || label.leaderRoutes.some(route=>!['none','open-arrow','filled-arrow','circle'].includes(route?.end))) throw new Error('존재하는 지시선의 경로·선형·끝점 관찰이 필요합니다.');
      } else {
        if(label.mode!=='text' || label.leaderRoutes!==undefined || label.leaderDash!==undefined) throw new Error('없거나 불확실한 지시선을 임의로 만들 수 없습니다.');
        if(presence==='uncertain' && !expanded.uncertainties?.some(u=>u.sourceRef===label.sourceRef && u.labelId===label.id && u.component==='leader'
          && ['ownership','geometry'].includes(u.domain) && typeof u.reason==='string' && u.reason.trim())) throw new Error('불확실한 지시선의 라벨별 보류 근거가 필요합니다.');
      }
    }
    if(label.sourceKind!==undefined && label.sourceKind!=='reference') throw new Error('원본 관찰은 reference 소속만 허용합니다.');
    if(label.typography?.size !== undefined) {
      const size=label.typography.size,p=label.position;
      if(label.typography.bounds!==undefined || !size || Object.keys(size).some(k=>!['w','h'].includes(k)) || ![size.w,size.h,p.x,p.y].every(Number.isFinite) || size.w<=0 || size.h<=0) throw new Error('원본 글자 크기와 중심 좌표가 잘못되거나 중복되었습니다.');
      const bounds={x:p.x-size.w/2,y:p.y-size.h/2,w:size.w,h:size.h};
      if(bounds.x<0 || bounds.y<0 || bounds.x+bounds.w>1+1e-9 || bounds.y+bounds.h>1+1e-9) throw new Error('원본 글자 영역이 캔버스 밖에 있어 관찰을 다시 확인해야 합니다.');
      const {size:ignored,...typography}=label.typography;
      label.typography={...typography,bounds};
    }
    label.sourceKind = 'reference';
    label.anchor = clone(label.mode === 'leader' ? label.leaderRoutes[0].target : label.position);
    if(label.textInkSearch!==undefined) {
      if(expanded.leaderObservationVersion!==SOURCE_LEADER_OBSERVATION_VERSION) throw new Error('글자 탐색 판정에는 현재 원본 관찰 계약이 필요합니다.');
      const search=label.textInkSearch;
      if(!search || !['confirmed-flat','confirmed-candidates','needs-review','not-applicable'].includes(search.status)) throw new Error('라벨별 글자 탐색 판정이 잘못되었습니다.');
      if(search.status==='confirmed-flat'||search.status==='confirmed-candidates') {
        const allowedKeys=search.status==='confirmed-flat'?['status','bounds','background']:['status','textCandidateIds','background'];
        if(label.scope!=='general' || label.reviewRequired || Object.keys(search).some(k=>!allowedKeys.includes(k)) || expanded.inkSearchRegions?.some(r=>r.labelId===label.id&&r.component==='text')) throw new Error('확정 글자 탐색 소속이 잘못되거나 중복되었습니다.');
        let searchBounds=search.bounds;
        if(search.status==='confirmed-candidates') {
          const set=normalizedCandidates.find(set=>set.sourceRef===label.sourceRef),ids=search.textCandidateIds;
          if(!set || !Array.isArray(ids)||!ids.length||ids.length>64||new Set(ids).size!==ids.length) throw new Error('글자 탐색 후보 선택이 잘못되었습니다.');
          const selected=ids.map(id=>{
            const c=set.candidates.find(c=>c.id===id);
            if(!c || searchCandidatesUsed.has(id) || candidateSelections.some(s=>s.labelId!==label.id&&s.textCandidateIds.includes(id))) throw new Error('다른 원본·라벨의 글자 탐색 후보를 사용할 수 없습니다.');
            searchCandidatesUsed.add(id);return c.bounds;
          });
          // The model separately authorizes a search of these exact source
          // candidates and a two-pixel inspection border. No bbox is erased.
          const x=Math.max(0,Math.min(...selected.map(b=>b.x))-2/set.width),y=Math.max(0,Math.min(...selected.map(b=>b.y))-2/set.height);
          const right=Math.min(1,Math.max(...selected.map(b=>b.x+b.w))+2/set.width),bottom=Math.min(1,Math.max(...selected.map(b=>b.y+b.h))+2/set.height);
          searchBounds={x,y,w:right-x,h:bottom-y};
        }
        // This explicit search is independent of typography/OCR bounds. Only
        // the pixel stage may turn its verified ink components into a mask.
        expanded.inkSearchRegions ||= [];
        expanded.inkSearchRegions.push({id:`wire-text-${index+1}`,labelId:label.id,sourceRef:label.sourceRef,ownership:'confirmed',component:'text',bounds:clone(searchBounds),background:clone(search.background),backgroundMode:'sample-flat'});
      } else if(search.status==='needs-review') {
        if(Object.keys(search).some(k=>!['status','reason'].includes(k)) || typeof search.reason!=='string' || !search.reason.trim() || search.reason.length>1000) throw new Error('글자 탐색 보류 근거가 필요합니다.');
        expanded.uncertainties ||= [];
        expanded.uncertainties.push({sourceRef:label.sourceRef,labelId:label.id,component:'text',domain:'removal',reason:search.reason});
      } else if(label.scope==='general' || Object.keys(search).length!==1) throw new Error('일반 라벨의 글자 제거 관찰을 생략할 수 없습니다.');
      delete label.textInkSearch;
    }
  }
  return { value: expanded, compact: true, candidateSelections };
}
export function expandSourceObservationWire(value, { candidateSets = [], sourceCount = 1 } = {}) {
  // Root and source/frame contracts stay fatal. Item errors carry no authority.
  const sets = normalizeSourceCandidateSets(candidateSets, sourceCount);
  if (!Array.isArray(value?.labels) || value.labels.length > 128) throw new Error('원본 라벨 목록이 잘못되었습니다.');
  if(value.leaderObservationVersion===undefined && value.labels.some(label=>label?.leaderPresence!==undefined)) throw new Error('지시선 존재 관찰에는 명시적 계약 버전이 필요합니다.');
  if(value.observationVersion===undefined && value.labels.some(label=>label?.textCandidateIds!==undefined)) throw new Error('글자 후보 선택에는 현재 원본 관찰 wire가 필요합니다.');
  const root = expandValidatedSourceObservationWire({...value, labels:[]}, {candidateSets:sets, sourceCount});
  const labels=[], selections=[], quarantinedItems=[], searches=[], uncertainties=[];
  const claims = new Map(), labelIds = new Map();
  for (const label of value.labels) {
    labelIds.set(label?.id, (labelIds.get(label?.id) || 0) + 1);
    const ids = [...new Set([...(Array.isArray(label?.textCandidateIds)?label.textCandidateIds:[]),
      ...(Array.isArray(label?.textInkSearch?.textCandidateIds)?label.textInkSearch.textCandidateIds:[])])];
    for (const id of ids) claims.set(id, (claims.get(id) || 0) + 1);
  }
  for (const label of value.labels) {
    try {
      if (!idOK(label?.id) || labelIds.get(label.id)>1) throw new Error('원본 라벨 ID가 잘못되거나 중복되었습니다.');
      if (!Number.isInteger(label.sourceRef) || label.sourceRef<1 || label.sourceRef>sourceCount) throw new Error('원본 라벨의 sourceRef 바인딩이 잘못되었습니다.');
      const ids=[...(Array.isArray(label.textCandidateIds)?label.textCandidateIds:[]),...(Array.isArray(label.textInkSearch?.textCandidateIds)?label.textInkSearch.textCandidateIds:[])];
      if(ids.some(id=>claims.get(id)>1)) throw new Error('다른 라벨과 공유된 글자 후보 바인딩입니다.');
      const item = expandValidatedSourceObservationWire({...value, labels:[label],
        inkSearchRegions:(value.inkSearchRegions || []).filter(r=>r?.labelId===label.id)}, {candidateSets:sets, sourceCount});
      labels.push(item.value.labels[0]); selections.push(...(item.candidateSelections || []));
      uncertainties.push(...(item.value.uncertainties || []).slice(value.uncertainties?.length || 0));
      searches.push(...(item.value.inkSearchRegions || []).filter(r=>r.id==='wire-text-1').map(r=>({...r,id:`wire-text-${labels.length}`})));
    } catch(error) {
      quarantinedItems.push({...(idOK(label?.id)?{labelId:label.id}:{}),...(Number.isInteger(label?.sourceRef)?{sourceRef:label.sourceRef}:{}),
        ...(typeof label?.scope==='string'?{scope:label.scope}:{}),stage:'wire',reason:error.message,deletionAuthority:false});
    }
  }
  const ids=new Set(labels.map(l=>l.id));
  const expanded={...root.value, labels};
  expanded.uncertainties=[...(value.uncertainties || []),...uncertainties];
  for(const key of ['removalRegions','inkSearchRegions']) expanded[key]=(value[key] || []).filter(r=>{
    if(r?.labelId===undefined || ids.has(r.labelId)) return true;
    quarantinedItems.push({...(idOK(r?.labelId)?{labelId:r.labelId}:{}),
      ...(Number.isInteger(r?.sourceRef)?{sourceRef:r.sourceRef}:{}),stage:key,
      reason:'살아남은 원본 라벨에 소속되지 않은 영역입니다.',deletionAuthority:false});
    return false;
  });
  expanded.inkSearchRegions.push(...searches);
  return {value:expanded,compact:root.compact,candidateSelections:selections,quarantinedItems};
}
export function normalizeObservationRelations(value, plan, geometry, compact) {
  if (!compact) return {};
  const objects = new Map(geometry.objects.map(o => [o.id,o])), associations=[], groups=new Map(), discardedRelationGroups=[];
  for (const label of plan.labels) {
    const wire=value.labels.find(l=>l.id===label.id), binding=wire?.targetBinding;
    if (!binding || !['confirmed','uncertain'].includes(binding.status) || typeof binding.reason !== 'string' || !binding.reason.trim() || binding.reason.length>1000) throw new Error('원본 라벨 대상 연결 근거가 없습니다.');
    let identity={};
    if(binding.status==='confirmed') {
      if(binding.bindingKind==='figure') {
        if(label.mode!=='text' || binding.sourceRef!==label.sourceRef || !Number.isInteger(binding.sourceRef) || binding.objectId!==undefined) throw new Error('그림 주석 연결은 같은 원본의 text 라벨이어야 합니다.');
        identity={bindingKind:'figure',sourceRef:binding.sourceRef};
      } else {
        if(binding.bindingKind!==undefined && binding.bindingKind!=='object' || !objects.has(binding.objectId) || objects.get(binding.objectId).sourceRef!==label.sourceRef) throw new Error('원본 라벨이 기존 원본 객체에 연결되지 않았습니다.');
        identity={...(binding.bindingKind==='object'?{bindingKind:'object'}:{}),objectId:binding.objectId};
      }
    } else if(binding.objectId!==undefined || binding.bindingKind!==undefined || binding.sourceRef!==undefined) throw new Error('불확실 대상에 확정 연결을 지정할 수 없습니다.');
    associations.push({labelId:label.id,status:binding.status,...identity,reason:binding.reason});
    if (wire.relationGroup !== undefined) {
      const g=wire.relationGroup;
      if (!g || !idOK(g.id) || !['reaction','sequence','phrase'].includes(g.kind) || !Number.isInteger(g.order) || g.order<0 || g.order>127) {
        discardedRelationGroups.push({...(idOK(g?.id)?{id:g.id}:{}),reason:'원본 라벨 관계 묶음이 잘못되었습니다.'});
        if(idOK(g?.id)) groups.set(g.id,{id:g.id,invalid:true,members:[]});
        continue;
      }
      const group=groups.get(g.id) || {id:g.id,kind:g.kind,sourceRef:label.sourceRef,members:[]};
      if(group.kind!==g.kind || group.sourceRef!==label.sourceRef || group.members.some(m=>m.order===g.order)) group.invalid=true;
      group.members.push({id:label.id,order:g.order}); groups.set(g.id,group);
    }
  }
  for(const g of groups.values()) {
    g.members.sort((a,b)=>a.order-b.order);
    if(g.invalid || g.members.length<2 || g.members.some((m,i)=>m.order!==i)
      || value.labels.filter(l=>l.relationGroup?.id===g.id).length!==g.members.length) {
      discardedRelationGroups.push({id:g.id,reason:g.invalid?'원본 라벨 관계 순서가 충돌합니다.':'원본 관계 묶음의 구성원이 누락되었습니다.'});
      groups.delete(g.id);
    }
  }
  for(const label of value.labels) {
    const g=label.relationGroup;
    if(g!==undefined && !plan.labels.some(l=>l.id===label.id) && !discardedRelationGroups.some(item=>item.id===g?.id)) {
      discardedRelationGroups.push({...(idOK(g?.id)?{id:g.id}:{}),reason:'관계 묶음에 일반 복원 범위 밖 또는 격리된 항목이 있습니다.'});
      if(idOK(g?.id))groups.delete(g.id);
    }
  }
  return {observationVersion:SOURCE_OBSERVATION_VERSION,...(value.leaderObservationVersion===SOURCE_LEADER_OBSERVATION_VERSION?{leaderObservationVersion:SOURCE_LEADER_OBSERVATION_VERSION,sourceLeaderObservations:plan.labels.map(label=>({labelId:label.id,sourceRef:label.sourceRef,presence:value.labels.find(l=>l.id===label.id)?.leaderPresence}))}:{}),observationContractRevision:value.observationContractRevision || '1.3.4',sourceAssociations:associations,relationGroups:[...groups.values()].map(({members,...g})=>({...g,labelIds:members.map(m=>m.id)})),discardedRelationGroups};
}
