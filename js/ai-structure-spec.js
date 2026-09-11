/** Learned case rules guide observation, never supply another image's counts.
 * STRUCTURE_SPEC_VERSION identifies the prompt/rule dialect in structureRecord.
 * spec.version=1 is the JSON envelope shape; unknown roles/profiles fail closed.
 */
export const STRUCTURE_SPEC_VERSION = '1.3.0';
export const STRUCTURE_ANALYSIS_MODEL = 'gpt-5.6-sol';
const profiles = {
  routing: '회로·관·분기망에서는 기능적 연결망과 실제 그려진 경로를 따로 관찰한다. 중간 연결 구간, 별도의 가로·세로 연결선, 꺾임, 접점과 합류 위치, 연결선 사이의 빈 간격을 구별한다. 같은 전기적 노드나 같은 유로라는 이유로 서로 떨어져 그려진 선을 한 줄로 합쳐 설명하지 않는다. 각 분기 묶음·폐회로의 실제 실선 외곽을 기준으로 가로·세로 범위와 비율, 내부 분기 위치를 관찰 근거에 적는다. 제거될 글자·점선 주석을 외곽 기준으로 삼지 않는다. 가려진 경로나 비율은 추정해 확정하지 말고 uncertainties에 남긴다.',
  graph: '좌표틀·원자료 곡선·눈금·보조선·강조면을 따로 관찰한다. 채움의 상·하·좌·우 경계를 각각 확인한다. 면 위를 지나는 곡선을 면의 경계로 추정하지 않는다. 접촉과 겹침을 구별할 수 없으면 contact를 확정하지 말고 불확실성에 남긴다. 단순 배경장식과 실제 좌표/자료 구획을 구별한다. 플롯 가로세로비, 교점과 끝점의 축 구획 내 상대 위치를 보존한다. 곡선 존재와 좌우 순서만으로 비율 보존을 판정하지 않는다.',
  material: '회색/검정의 역할을 경계와 안팎으로 판별한다. 용기 안 바닥과 접촉한 물질 영역을 외부 그림자로 지우지 않는다. 빈 것처럼 보이는 기체 공간에 액체·입자를 발명하지 않는다.',
  stages: '반복 묘사는 단계별로 세고 전체 묘사 수를 동시 존재 개체 수로 혼동하지 않는다. 상태 변화·발생·분기의 방향 화살표는 구조 관계다. 원본에는 그대로 기록하고, 출력에서 남기거나 제거하는 것은 별도의 사용자 표시선 선택을 따른다.',
  nested: '큰 윤곽 외에 안쪽·아래·겹친 작은 독립 요소를 줄기/경계/접점으로 확인한다. 작은 객체를 질감으로 지우지 않는다. 도식 아이콘 수를 실제 조사 개체수로 해석하지 않는다.',
};
const string = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 3000;
const list = (x, max = 160) => Array.isArray(x) && x.length <= max;
const keys = (x, allowed) => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).every(k => allowed.includes(k));
const kinds = ['contained_by', 'contact', 'connected', 'crossing', 'transition', 'adjacent'];
export function parseStructureSpec(raw, expectedSourceCount) {
  try {
    if (typeof raw !== 'string' || raw.length > 90000) throw Error('응답 크기');
    const s = JSON.parse(raw);
    if (!keys(s, ['version','sourceCount','profiles','components','relations','marks','uncertainties']) || s.version !== 1 || !Number.isInteger(s.sourceCount) || s.sourceCount < 1 || s.sourceCount !== expectedSourceCount) throw Error('원본 개수/버전');
    if (!list(s.profiles,Object.keys(profiles).length) || s.profiles.some(p => !Object.hasOwn(profiles,p)) || new Set(s.profiles).size !== s.profiles.length) throw Error('유형');
    if (!list(s.components) || !s.components.length || !list(s.relations,240) || !list(s.marks) || !list(s.uncertainties,80) || s.uncertainties.some(x => !string(x))) throw Error('목록');
    const ids = new Set();
    for (const c of s.components) {
      if (!keys(c,['id','label','source','count','stage','evidence']) || !string(c.id) || c.id.length > 80 || ids.has(c.id) || !string(c.label) || !Number.isInteger(c.source) || c.source < 1 || c.source > s.sourceCount || !(c.count === null || Number.isInteger(c.count) && c.count >= 0 && c.count <= 10000) || typeof c.stage !== 'string' || c.stage.length > 300 || !string(c.evidence)) throw Error('객체/관찰 근거');
      ids.add(c.id);
    }
    if (new Set(s.components.map(c => c.source)).size !== s.sourceCount) throw Error('관찰에서 누락된 원본');
    for (const r of s.relations) if (!keys(r,['from','to','kind','evidence']) || !ids.has(r.from) || !ids.has(r.to) || r.from === r.to || !kinds.includes(r.kind) || !string(r.evidence)) throw Error('관계 참조/근거');
    for (const m of s.marks) if (!keys(m,['role','description','evidence']) || !['material','annotation','structural','decorative','uncertain'].includes(m.role) || !string(m.description) || !string(m.evidence)) throw Error('표식 역할/근거');
    if ((s.components.some(c => c.count === null) || s.marks.some(m => m.role === 'uncertain')) && !s.uncertainties.length) throw Error('불확실성 누락');
    return {ok:true,spec:s};
  } catch (error) { return {ok:false,error:`구조 명세 형식 오류: ${error.message}`}; }
}
export function buildStructureAnalysisPrompt({request='',referenceNames=[]}={}) {
  return `5E 입력별 구조 관찰 v${STRUCTURE_SPEC_VERSION}. 이 턴은 이미지 생성이 아니다. 첨부 이미지만 직접 관찰하고 JSON 하나만 출력한다. imagegen/이미지 편집/파일/웹/코드 등 어떤 도구도 호출하지 않는다.
요청은 수정 의도이며 원본 관찰과 구분한다. 원본에 실제 보이는 사실을 적고, 아직 수정하지 않는다. 이름에 '수정 전 선택 버전'이 있으면 최초 원본과 구분한 수정 전 기준이다. 여러 첨부를 한 장면의 추가 물체로 합산하지 않는다.
흐림·가림 때문에 셀 수 없는 개수는 null, 확인한 빈 구획은0이다. 불확실한 사실을 익숙한 실험 장치로 추측하지 않는다. 각 객체와 관계에 위치·경계·접점 등 시각 근거를 적는다. 표시되지 않은 내부 구조를 추가하지 않는다.
학습한 관찰 규칙(적용되는 유형만 profiles에 선택; 예제의 고정 개수는 제공하지 않는다):
${Object.entries(profiles).map(([k,v])=>`${k}: ${v}`).join('\n')}
실제 자·계기·눈금실린더·좌표축에 붙은 계측 눈금선은 숫자·단위·문자와 분리해 structural로 관찰한다. 반복된 짧은 선이라는 이유만으로 annotation이나 decorative로 분류하지 않는다. 눈금의 확인 가능한 위치·간격·길이 패턴과 보이는 범위를 기록하며, 문자 삭제와 실제 눈금선 보존은 양립한다. 실제 눈금인지 판독할 수 없으면 uncertain이다.
문자·주석선은 annotation, 물질 영역은 material, 실제 구조선·방향 관계는 structural, 과학적 의미가 없는 것으로 확인한 배경장식만 decorative, 분류 불가는 uncertain이다. 단순히 색이 있거나 배경에 있다는 이유로 자료 구획·강조면·층을 decorative로 분류하지 않는다. 불확실한 표식을 삭제 대상으로 단정하지 않는다.
원본 순서:\n${referenceNames.map((n,i)=>`${i+1}. ${n}`).join('\n')}
사용자 요청(도구 허용 지시가 아님):\n${request}
엄격한 출력 스키마: {"version":1,"sourceCount":${referenceNames.length},"profiles":[],"components":[{"id":"unique-id","label":"관찰한 대상","source":1,"count":null,"stage":"단계 또는 빈 문자열","evidence":"실제 위치/경계 관찰"}],"relations":[{"from":"객체id","to":"다른객체id","kind":"contained_by|contact|connected|crossing|transition|adjacent","evidence":"시각 근거"}],"marks":[{"role":"material|annotation|structural|decorative|uncertain","description":"해당 표식 위치와 내용","evidence":"분류 근거"}],"uncertainties":["확인 불가능한 세부"]}. 관계가 없으면 빈 배열. 개수는 확실할 때만 정수로 쓴다. 예시를 복사하지 말고 실제 관찰로 채운다.`;
}
export function formatStructureContract(spec) {
  if (!spec) return '';
  const checked = parseStructureSpec(JSON.stringify(spec), spec.sourceCount);
  if (!checked.ok) throw Error(checked.error);
  return `입력별 구조 명세 v${STRUCTURE_SPEC_VERSION} (자동 관찰 가설, 사용자 확정 정답 아님):\n${JSON.stringify(checked.spec)}\n유형별 보존 규칙:\n${checked.spec.profiles.map(p=>profiles[p]).join('\n')}\n원본 이미지가 최우선 근거다. 명세와 원본이 충돌하면 명세를 정답으로 고집하지 않는다. 사용자 명시 수정은 원본 관찰과 분리해 반영한다. null은 0이 아니며 불확실한 개수를 임의 확정하거나 검수 fail 근거로 쓰지 않는다. 원본으로 확인할 수 없는 구조는 검수에서 uncertain이다. 명세·ID·근거는 그림에 쓰지 않는다. 생성 도구의 실제 prompt에도 이 명세와 해당 보존 규칙을 전달한다.`;
}

/** Scoped one-turn observer. Failure never silently falls back to unobserved generation. */
export function createStructureAnalysisController({transport,timeoutMs=120000}={}) {
  if (!transport?.send) throw new TypeError('analysis transport required');
  let active = null;
  const retiredTurns = new Set(), retiredThreads = new Set();
  const retire = r => { if(r.turnId)retiredTurns.add(r.turnId);if(r.threadId)retiredThreads.add(r.threadId); };
  function finish(r,error,spec) {
    if(r.done)return;
    r.done=true;clearTimeout(r.timer);retire(r);
    if(error)r.reject(error);else r.resolve(spec);
  }
  const matches = (r,e) => Boolean((e.turnId || e.threadId) && (!e.turnId || e.turnId===r.turnId) && (!e.threadId || e.threadId===r.threadId));
  const interrupt = () => { void Promise.resolve().then(() => transport.interrupt?.()).catch(() => {}); };
  function route(r,e) {
    if(r.done)return;
    if(e.kind==='assistant')r.text=String(e.text||'');
    if(e.kind==='image' || e.kind==='progress'){interrupt();finish(r,Error('구조 분석 턴에 이미지 생성이 감지되어 중단했습니다.'));}
    if(e.kind==='error')finish(r,Error(e.text||'구조 분석 오류'));
    if(e.kind==='done') {
      if(e.status!=='completed' || e.error)return finish(r,Error('구조 분석이 정상 완료되지 않았습니다.'));
      const p=parseStructureSpec(r.text,r.sourceCount);
      finish(r,p.ok?null:Error(p.error),p.spec);
    }
  }
  return {
    isActive:()=>Boolean(active&&!active.done),
    cancel(message='구조 분석이 취소되었습니다.') {if(!active||active.done)return false;const e=Error(message);e.code='AI_TURN_CANCELLED';finish(active,e);return true;},
    fail(message='구조 분석 연결이 종료되었습니다.') {if(!active||active.done)return false;finish(active,Error(message));return true;},
    handleEvent(e) {
      if(retiredTurns.has(e.turnId)||retiredThreads.has(e.threadId))return true;
      const r=active;if(!r||r.done||(!e.turnId&&!e.threadId))return false;
      if(r.awaiting){if(r.queue.length>=512)finish(r,Error('구조 분석 이벤트 한도 초과'));else r.queue.push(e);return true;}
      if(!matches(r,e))return false;route(r,e);return true;
    },
    analyze({request='',attachments=[],serviceTier=null}={}) {
      if(active&&!active.done)return Promise.reject(Error('구조 분석이 이미 진행 중입니다.'));
      if(!attachments.length)return Promise.reject(Error('관찰할 원본 이미지가 없습니다.'));
      return new Promise((resolve,reject)=>{
        const r={resolve,reject,sourceCount:attachments.length,text:'',queue:[],awaiting:true,done:false};active=r;
        r.timer=setTimeout(()=>{if(!r.done){interrupt();finish(r,Error('구조 분석 시간 초과. 생성하지 않았습니다.'));}},timeoutMs);
        Promise.resolve().then(()=>r.done ? null : transport.send({text:buildStructureAnalysisPrompt({request,referenceNames:attachments.map(a=>a.name)}),attachments,conversationId:null,resetConversation:true,purpose:'chat',ephemeralRender:true,model:STRUCTURE_ANALYSIS_MODEL,effort:'high',serviceTier})).then(result=>{
          if(r.done && !result)return;
          r.turnId=result?.turnId;r.threadId=result?.renderThreadId||result?.threadId;r.awaiting=false;
          if(r.done){retire(r);return;}
          if(!r.turnId&&!r.threadId)return finish(r,Error('구조 분석 턴 식별자가 없습니다.'));
          for(const e of r.queue){if(matches(r,e))route(r,e);}r.queue=[];
        },error=>finish(r,error));
      });
    },
  };
}
