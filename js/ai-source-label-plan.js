import { compactJsonSchema } from './ai-json-schema-compact.js?v=1.7.0-four-session-integration';
import { SOURCE_LEADER_OBSERVATION_VERSION, SOURCE_OBSERVATION_CONTRACT_REVISION, buildSourceObservationPrompt, expandSourceObservationWire, normalizeObservationRelations } from './ai-source-observation-wire.js?v=1.7.0-four-session-integration';
import { buildLabelTargetPlacementPrompt, parseLabelTargetPlacement, bindLabelTargetPlacement, labelBindingHash, validateLabelTargetPlacement } from './ai-label-target-placement.js?v=1.7.0-four-session-integration';
import { normalizeSourceGeometry, SOURCE_GEOMETRY_PROMPT, sourceGeometryContract, SOURCE_REMOVAL_REGIONS_PROMPT, normalizeSourceRemovalRegions } from './ai-label-source-geometry.js?v=1.7.0-four-session-integration';
import { withEditableImageLabelPlan, parseEditableImageLabelPlan, freezeLabelPlan, normalizeSourceLabelUncertainty, SOURCE_LABEL_POLICY_VERSION, SOURCE_LABEL_OWNERSHIP_POLICY } from './ai-editable-image-labels.js?v=1.7.0-four-session-integration';
import { resolveAIModelSelection } from './ai-model-capabilities.js?v=1.7.0-four-session-integration';
import { buildImageReviewPrompt, parseImageReviewReport, summarizeLabelReview } from './ai-image-review.js?v=1.7.0-four-session-integration';
import { buildCompactLabelPlacementPrompt, parseCompactLabelPlacementResponse } from './ai-label-placement-harness.js?v=1.7.0-four-session-integration';
import { buildSourceObservationOutputSchema, buildImageReviewOutputSchema, buildJointLabelReviewOutputSchema } from './ai-label-json-schema.js?v=1.7.0-four-session-integration';
import { collectSourceLabelCandidates } from './ai-source-label-candidates.js?v=1.7.0-four-session-integration';
import { normalizeSourceCandidateSets, buildSourceCandidatePrompt } from './ai-source-candidate-contract.js?v=1.7.0-four-session-integration';

const copy = value => JSON.parse(JSON.stringify(value));
const snapshotAttachments = items => {
  if (!Array.isArray(items) || !items.length || items.some(a => typeof a?.data !== 'string' || !a.data.startsWith('data:image/'))) throw new TypeError('라벨 관찰에 사용할 원본 이미지가 없습니다.');
  return items.map(a => ({ name: String(a.name || '원본'), data: a.data }));
};

export function buildSourceLabelAnalysisPrompt({ request = '', referenceNames = [], workflow = {}, candidateSets = [] } = {}) {
  return `입력 원본 라벨 관찰. 첨부 순서:\n${referenceNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}\n사용자 수정 의도(관찰 사실과 구별): ${request}\n${SOURCE_LABEL_OWNERSHIP_POLICY}\n${SOURCE_GEOMETRY_PROMPT}\n${workflow.imageKind==='exam'?SOURCE_REMOVAL_REGIONS_PROMPT:''}\n${buildSourceObservationPrompt(workflow)}
${workflow.imageKind==='exam'?'기출 국소 제거에 필요한 원본 관찰이다. 각 general 라벨의 textInkSearch 판정을 빠짐없이 기록한다. leader 항목은 leader와 endpoint까지 관찰한다. 보호 영역은 실제 과학 구조를 덮으며, 글자만 있는 빈 여백까지 전체 그림 사각형으로 보호하지 않는다. 겹침·소유·배경을 확인할 수 없으면 해당 labelId와 component가 있는 uncertainties에 구체적인 이유를 남긴다. 모든 제거 배열을 비웠다고 관찰을 완료한 것은 아니다.':'일반 스타일 변환을 위한 관찰이다. 원본 문구의 대상과 반응식·연속 문구 묶음을 첫 분석에서 함께 기록한다.'}
각 항목의 중괄호를 완결한 엄격한 JSON을 반환한다. 누락된 문자나 잘린 영역은 추측하지 않는다.${buildSourceCandidatePrompt(normalizeSourceCandidateSets(candidateSets,referenceNames.length || 1))}`;
}

export function parseSourceLabelAnalysis(raw, sourceCount, candidateSets = [], { requireLeaderObservation = false, requireClassification = false } = {}) {
  if (typeof raw !== 'string' || raw.length > 100000) throw new Error('원본 라벨 관찰 응답 크기가 올바르지 않습니다.');
  const tagged = /^<5e-editable-labels>([\s\S]*)<\/5e-editable-labels>$/.exec(raw.trim());
  let value; try { value = JSON.parse(tagged ? tagged[1] : raw); } catch { throw new Error('원본 라벨 관찰 응답이 엄격한 JSON이 아닙니다.'); }
  if (!Number.isInteger(sourceCount) || sourceCount<1 || ![3,4].includes(value?.version)) throw new Error('원본 라벨 명세 버전·원본 수가 올바르지 않습니다.');
  if(value.observationContractRevision!==undefined && value.observationContractRevision!==SOURCE_OBSERVATION_CONTRACT_REVISION) throw new Error('원본 관찰 분류 계약 버전이 잘못되었습니다.');
  if(requireLeaderObservation && (value?.observationVersion!==1 || value?.leaderObservationVersion!==SOURCE_LEADER_OBSERVATION_VERSION)) throw new Error('새 원본 관찰에는 라벨별 지시선 존재 관찰 계약이 필요합니다.');
  if(requireClassification && value.observationContractRevision!==SOURCE_OBSERVATION_CONTRACT_REVISION) throw new Error('새 원본 관찰에는 명시적 분류 계약이 필요합니다.');
  const geometryLock = value.version >= 4 ? normalizeSourceGeometry(value.geometryLock, sourceCount) : null;
  const metadataIssues=(geometryLock?.quarantinedRelations || []).map(relation=>({...relation,stage:'geometry-relations'}));
  for(const key of ['uncertainties','preservedMarks','removalRegions','protectedRegions','inkSearchRegions','removalOnlyItems']) {
    if(value[key]===undefined) value[key]=[];
    if(!Array.isArray(value[key]) || value[key].length>(['removalRegions','inkSearchRegions'].includes(key)?1024:key==='protectedRegions'?256:128)) {
      metadataIssues.push({stage:key,reason:`원본 ${key} 목록이 잘못되었습니다.`,deletionAuthority:false});value[key]=[];
    }
  }
  value.uncertainties=value.uncertainties.filter(x=>{
    if(normalizeSourceLabelUncertainty(x,sourceCount))return true;
    metadataIssues.push({stage:'uncertainty',reason:'원본 불확실성 항목이 잘못되었습니다.',deletionAuthority:false});return false;
  });
  const originalLabels=value.labels;
  const wire = expandSourceObservationWire(value,{candidateSets,sourceCount}); value = wire.value;
  const parse = v => parseEditableImageLabelPlan(`<5e-editable-labels>${JSON.stringify(v)}</5e-editable-labels>`, {preserveSourceLabels:true,referenceCount:sourceCount});
  const quarantinedItems=[...wire.quarantinedItems,...metadataIssues], labels=[], excludedLabels=[], graphOwnedLabels=[], removalOnlyItems=[], accepted=[], observedPreservedMarks=[];
  const quarantine=(item,stage,reason)=>quarantinedItems.push({...(typeof item?.id==='string'?{labelId:item.id}:{}),...(Number.isInteger(item?.sourceRef)?{sourceRef:item.sourceRef}:{}),
    ...(typeof item?.scope==='string'?{scope:item.scope}:{}),stage,reason,deletionAuthority:false});
  for(const item of value.labels) {
    try {
      const single=parse({...value,labels:[item],preservedMarks:[],uncertainties:[]});
      if(!single.rejectedCount && single.preservedMarks.length) {observedPreservedMarks.push(...single.preservedMarks);continue;}
      const label=single.labels[0] || single.excludedLabels[0];
      if(single.status==='unavailable' || single.rejectedCount || !label?.typography.bounds) throw new Error('원본 라벨 명세의 좌표·서식이 잘못되었습니다.');
      if(wire.compact) normalizeObservationRelations({...value,labels:[{...item,relationGroup:undefined}]},{labels:[label]},geometryLock,true);
      const classified=value.observationContractRevision===SOURCE_OBSERVATION_CONTRACT_REVISION || item.disposition!==undefined || item.semanticRole!==undefined;
      if(classified) {
        if(typeof item.reason!=='string' || !item.reason.trim() || item.reason.length>1000) throw new Error('원본 분류 근거가 필요합니다.');
        const valid=label.scope==='graph'?item.disposition==='graph-owned'&&item.semanticRole==='graph-label'
          :label.scope==='general'&&(item.disposition==='restore'&&['scientific-label','panel-marker'].includes(item.semanticRole)
            ||item.disposition==='remove-only'&&['textbook-prose','caption','speech'].includes(item.semanticRole));
        if(!valid) throw new Error('원본 의미 역할·소유 분류가 충돌합니다.');
      }
      if(label.scope==='graph') { graphOwnedLabels.push(label);excludedLabels.push(label); }
      else if(item.disposition==='remove-only') {
        if(label.ownershipReviewRequired) throw new Error('불확실 소속은 제거 전용 권한을 가질 수 없습니다.');
        const b=label.typography.bounds;
        if(geometryLock?.objects.some(o=>o.sourceRef===label.sourceRef && o.role==='scientific-inset' && b.x<o.bounds.x+o.bounds.w && b.x+b.w>o.bounds.x && b.y<o.bounds.y+o.bounds.h && b.y+b.h>o.bounds.y)) throw new Error('과학적 확대 삽화에 제거 전용 영역이 겹칩니다.');
        removalOnlyItems.push({id:label.id,sourceRef:label.sourceRef,kind:item.semanticRole,reason:item.reason,text:label.text,bounds:copy(label.typography.bounds),
          ...(label.mode==='leader'?{leaderRoutes:copy(label.leaderRoutes || []),leaderDash:label.leaderDash}:{})});
      } else if(label.scope==='general') labels.push(label);
      else excludedLabels.push(label);
      accepted.push(item);
    } catch(error) { quarantine(item,'label',error.message); }
  }
  for(const item of value.removalOnlyItems) {
    try {
      const b=item?.bounds;
      if(!item || !/^[A-Za-z0-9_.:-]{1,80}$/.test(item.id) || originalLabels.some(l=>l?.id===item.id) || value.removalOnlyItems.filter(l=>l?.id===item.id).length!==1 || removalOnlyItems.some(l=>l.id===item.id)
        || !Number.isInteger(item.sourceRef) || item.sourceRef<1 || item.sourceRef>sourceCount || !['decoration','speech','textbook-prose','caption'].includes(item.kind)
        || typeof item.reason!=='string' || !item.reason.trim() || item.reason.length>1000 || !b || ![b.x,b.y,b.w,b.h].every(Number.isFinite)
        || b.x<0 || b.y<0 || b.w<=0 || b.h<=0 || b.x+b.w>1+1e-9 || b.y+b.h>1+1e-9
        || item.text!==undefined && (typeof item.text!=='string' || !item.text.trim() || item.text.length>1000)) throw new Error('제거 전용 항목의 소속·좌표·근거가 잘못되었습니다.');
      if(geometryLock?.objects.some(o=>o.sourceRef===item.sourceRef && o.role==='scientific-inset' && b.x<o.bounds.x+o.bounds.w && b.x+b.w>o.bounds.x && b.y<o.bounds.y+o.bounds.h && b.y+b.h>o.bounds.y)) throw new Error('과학적 확대 삽화에 제거 전용 영역이 겹칩니다.');
      removalOnlyItems.push({id:item.id,sourceRef:item.sourceRef,kind:item.kind,reason:item.reason,bounds:copy(b),...(item.text!==undefined?{text:item.text}:{})});
    } catch(error) { quarantine(item,'removal-only',error.message); }
  }
  const base=parse({...value,labels:[],preservedMarks:[],uncertainties:[]}), preservedMarks=[...observedPreservedMarks];
  for(const mark of value.preservedMarks) {
    const parsed=parse({...value,labels:[],preservedMarks:[mark],uncertainties:[]});
    if(parsed.rejectedCount) quarantine(mark,'preserved-mark','원본 보존 표식이 잘못되었습니다.');
    else preservedMarks.push(...parsed.preservedMarks);
  }
  const plan={...base,labels,excludedLabels,preservedMarks,uncertainties:value.uncertainties,reviewRequired:true,status:'review',
    rejectedCount:quarantinedItems.length,removalOnlyItems,graphOwnedLabels,quarantinedItems,...(geometryLock?{geometryLock}:{})};
  const allowed=new Set(labels.map(l=>l.id)), regionValue={...value};
  for(const key of ['removalRegions','inkSearchRegions']) regionValue[key]=value[key].filter(r=>{
    if(r?.labelId===undefined || allowed.has(r.labelId)) return true;
    quarantine({...r,id:r.labelId},key,'유효한 복원 라벨에 속하지 않는 제거·탐색 영역입니다.');
    return false;
  });
  const regionIds=new Map();
  for(const region of [...regionValue.removalRegions,...regionValue.inkSearchRegions]) regionIds.set(region?.id,(regionIds.get(region?.id)||0)+1);
  // Optional malformed deletion metadata is discarded, never converted into authority.
  for(const key of ['removalRegions','inkSearchRegions','protectedRegions']) {
    regionValue[key]=regionValue[key].filter(r=>{
      try {
        if(key!=='protectedRegions' && regionIds.get(r?.id)>1) throw new Error('원본 제거·탐색 영역 ID가 중복되었습니다.');
        normalizeSourceRemovalRegions({[key]:[r]},plan,sourceCount);return true;
      }
      catch(error) {quarantine({...r,id:r?.labelId},key,error.message);return false;}
    });
  }
  const blocked=quarantinedItems.filter(item=>item.stage==='protectedRegions');
  for(const key of ['removalRegions','inkSearchRegions']) regionValue[key]=regionValue[key].filter(r=>!blocked.some(item=>item.sourceRef===undefined || item.sourceRef===r.sourceRef));
  const regions=normalizeSourceRemovalRegions(regionValue,plan,sourceCount);
  const relations=normalizeObservationRelations({...value,labels:originalLabels},plan,geometryLock,wire.compact);
  const candidateSelections=(wire.candidateSelections || []).filter(s=>allowed.has(s.labelId));
  return freezeLabelPlan({...plan,rejectedCount:quarantinedItems.length,quarantinedItems,...regions,...relations,
    ...(candidateSelections.length?{sourceTextCandidateSelections:candidateSelections}:{})});
}

// A checklist of observed annotation components, not a deletion mask. Coordinates
// cannot authorize erasing the scientific boundary beneath a label endpoint.
export function buildSourceLabelRemovalManifest(plan) {
  const blockedSource = sourceRef => plan.quarantinedItems?.some(item=>item.stage==='protectedRegions' && (item.sourceRef===undefined || item.sourceRef===sourceRef));
  return [...plan.labels.filter(label => label.scope === 'general' && !label.ownershipReviewRequired && !blockedSource(label.sourceRef)).map(label => ({
    id: label.id, sourceRef: label.sourceRef, text: label.text, textBounds: copy(label.typography.bounds),
    disposition:'restore',
    leader: label.mode === 'leader' ? {
      ...(label.leaderRoutes ? { routes: copy(label.leaderRoutes) } : {
        anchor: copy(label.anchor), position: copy(label.position),
        ...(label.elbow ? { elbow: copy(label.elbow) } : {}),
        extraAnchors: copy(label.extraAnchors || []), arrowHead: label.leaderArrowHead,
      }),
      remove: ['whole-path', 'start-contact', 'target-mark-and-outline'],
    } : null,
  })),...(plan.removalOnlyItems || []).filter(item=>!blockedSource(item.sourceRef)).map(item=>({...copy(item),disposition:'remove-only',restore:false}))];
}

export function withFrozenSourceLabelPlan(prompt, plan, workflow = {}) {
  if (!plan?.frozen || plan.policyVersion !== SOURCE_LABEL_POLICY_VERSION || !Array.isArray(plan.labels)) throw new TypeError('확정된 원본 라벨 명세가 필요합니다.');
  return `${prompt}\n\n[5e-source-label-ownership v${SOURCE_LABEL_POLICY_VERSION}]\n${SOURCE_LABEL_OWNERSHIP_POLICY}
${sourceGeometryContract(plan.geometryLock)}
이 명세가 제거와 편집 객체 복구에 동시에 사용된다. 라벨을 다시 추출하거나 JSON을 새로 작성하지 않는다. 아래 일반 항목의 글자 전체 영역과 설명용 지시선(전체 곡선·프레임 접점·대상 끝 화살촉·원형 끝점 포함)만 제거한다. labels의 글머리표와 +/−도 PNG에 남기지 않는다. 확인된 일반 라벨 소속 요소는 과학적 화살표 유지 옵션과 무관하게 함께 제거한다. 불확실 소속은 삭제하지 않고 검수 대상으로 남긴다. preservedMarks의 실제 물리 표식, excludedLabels의 보류 영역과 실제 과학 물체는 그 판정에 따라 보존한다. 확대 원·강조틀·확대 연결선·투영 가이드 및 빈 주석 상자는 이미지 하네스가 제거하도록 지정하면 전체 표식과 선 몸통·끝점을 제거하고 네이티브 라벨로 복원하지 않는다. 불확실성 기록이나 라벨 좌표 유지가 이 제거 요청을 뒤집지 않는다. 후보에 새 문자를 쓰지 않는다. 첨부 원본의 종횡비·물체 위치·라벨 빈 공간을 유지한다. 명세의 좌표는 sourceRef별 원본 캔버스의 0~1이다. 처리 경로에도 이 제거 명세를 그대로 전달한다.
라벨별 제거 체크리스트: ${JSON.stringify(buildSourceLabelRemovalManifest(plan))}
restore 항목만 편집 객체로 복원한다. remove-only의 본문·주변 설명·페이지 캡션·말풍선·장식은 제거하고 복원하지 않는다. 과학적 확대 삽화 내부의 내용과 개수는 보존한다. 그래프 소관 표기는 일반 제거·복원에서 제외하고 보존한다. 격리 항목에는 삭제 권한이 없다: ${JSON.stringify(plan.quarantinedItems || [])}
각 항목의 글자와 선 몸통·출발 접점·대상 끝점(채운 점, 빈 원 테두리, 화살촉)을 하나의 주석으로 함께 제거한다. 끝점이 혈관이나 관 위에 놓여도 라벨 소유이면 남기지 않는다. 다만 아래의 실제 관 벽·혈관 윤곽·물리적 입구는 보존한다. 좌표는 관찰 가설이며 사각형을 흰색으로 덮는 마스크가 아니다. 접점의 소유를 판독할 수 없으면 과학적 구조를 임의로 지우거나 새 구조로 보완하지 않는다. 편집 끝점으로 가릴 예정이라는 이유로 RAW의 잔재를 허용하지 않는다.
확정 명세: ${JSON.stringify(plan)}\n${workflow.imageKind === 'exam' ? '기출: 전체 이미지 생성·스타일 변환 금지. 확정 국소 제거 영역만 처리하고 마스크 밖 디코딩 픽셀을 보존한다.' : '일반: 이미지 생성 도구를 정확히 한 번 호출한다. 자동 추가 교정은 실행하지 않는다.'}`;
}

// Each observer owns one fresh tool-free turn. Late events are consumed after retirement.
// A timeout rejects the operation; it never falls back to generation without a plan.
// The web runtime allows a ten-minute turn. Do not interrupt it after three
// minutes; leave a minute for the final event to reach the browser.
export const SOURCE_LABEL_TIMEOUT_MS = 660000;
export const SOURCE_CANDIDATE_TIMEOUT_MS = 20000;
export function createSourceLabelController({ transport, timeoutMs = SOURCE_LABEL_TIMEOUT_MS,
  candidateTimeoutMs = SOURCE_CANDIDATE_TIMEOUT_MS, collectCandidates = collectSourceLabelCandidates } = {}) {
  if (!transport?.send) throw new TypeError('label transport required');
  let active = null;
  let preparation = null;
  const retired = new Set();
  const candidateCache = new Map();
  const retire = r => { if (r.turnId) retired.add(r.turnId); if (r.threadId) retired.add(r.threadId); };
  const interrupt = r => {
    r.interruptRequested = true;
    // A pending RPC has no safe remote identity. Defer until its own binding
    // arrives, even if another operation has since become active.
    if (r.interruptSent || (!r.turnId && !r.threadId)) return;
    r.interruptSent = true;
    const binding = { ...(r.turnId ? { turnId: r.turnId } : {}), ...(r.threadId ? { threadId: r.threadId } : {}) };
    void Promise.resolve().then(() => transport.interrupt?.(binding)).catch(() => {});
  };
  const finish = (r, error, value) => {
    if (r.done) return;
    r.done = true; clearTimeout(r.timer); retire(r);
    if (error) error.aiRequest = { model:r.model, effort:r.effort, serviceTier:r.serviceTier,
      turnId:r.turnId || null, threadId:r.threadId || null,
      elapsedMs:Math.round(performance.now()-r.startedAt), timeoutMs };
    if (error) r.reject(error); else r.resolve(value);
  };
  const matches = (r, e) => Boolean((e.turnId || e.threadId) && (!e.turnId || e.turnId === r.turnId) && (!e.threadId || e.threadId === r.threadId));
  const route = (r, e) => {
    if (r.done) return;
    if (e.kind === 'assistant') r.text = String(e.text || '');
    if (e.kind === 'image' || e.kind === 'progress') { interrupt(r); finish(r, Error('라벨 관찰·검수 턴에서 이미지 생성이 감지되어 중단했습니다.')); }
    if (e.kind === 'error') finish(r, Error(e.text || '라벨 관찰 오류'));
    if (e.kind === 'done') {
      if (e.status !== 'completed' || e.error) return finish(r, Error(e.error || '라벨 관찰·검수가 정상 완료되지 않았습니다.'));
      try { finish(r, null, r.parse(r.text)); } catch (error) { finish(r, error); }
    }
  };
  const send = (payload, parse, preparationToken) => {
    if (active && !active.done) return Promise.reject(Error('라벨 관찰·검수가 이미 진행 중입니다.'));
    return new Promise((resolve, reject) => {
      const r = { resolve, reject, parse, preparationToken, text: '', queue: [], awaiting: true, done: false,
        model:payload.model, effort:payload.effort, serviceTier:payload.serviceTier, startedAt:performance.now() }; active = r;
      r.timer = setTimeout(() => { interrupt(r); const error=Error('라벨 분석 응답 시간 초과. 로그의 단계와 실행 번호를 확인해 주세요.');
        error.code='AI_LABEL_TIMEOUT'; finish(r,error); }, timeoutMs);
      Promise.resolve().then(() => r.done ? null : transport.send(payload.outputSchema ? { ...payload, outputSchema: compactJsonSchema(payload.outputSchema) } : payload)).then(result => {
        if (r.done && !result) return;
        r.turnId = result?.turnId; r.threadId = result?.renderThreadId || result?.threadId; r.awaiting = false;
        if (r.done) { retire(r); if (r.interruptRequested) interrupt(r); return; }
        if (!r.turnId && !r.threadId) return finish(r, Error('라벨 관찰 턴 식별자가 없습니다.'));
        for (const e of r.queue) if (matches(r, e)) route(r, e);
        r.queue = [];
      }, error => finish(r, error));
    });
  };
  const selectionPayload = options => ({ conversationId: null, resetConversation: true, purpose: 'scene', ephemeralRender: true,
    ...resolveAIModelSelection(options, options.models) });
  const reserve = () => {
    if (preparation || active && !active.done) throw new Error('라벨 관찰·검수가 이미 진행 중입니다.');
    const token = {abort:new AbortController()}; preparation = token; return token;
  };
  const ready = token => {
    if (preparation !== token) { const e = Error('라벨 관찰·검수가 취소되었습니다.'); e.code = 'AI_TURN_CANCELLED'; throw e; }
    if(token.abort.signal.aborted)throw new DOMException('라벨 관찰·검수가 취소되었습니다.','AbortError');
    preparation = null;
  };
  const release = token => { if (preparation === token) preparation = null; };
  return {
    isActive: () => Boolean(preparation || active && !active.done),
    cancel(message = '라벨 관찰·검수가 취소되었습니다.') { const preparing = Boolean(preparation); preparation?.abort.abort(); preparation = null; if (!active || active.done) return preparing; const e = Error(message); e.code = 'AI_TURN_CANCELLED'; interrupt(active); finish(active, e); return true; },
    fail(message) { const preparing = Boolean(preparation); preparation?.abort.abort(); preparation = null; if (!active || active.done) return preparing; finish(active, Error(message || '라벨 관찰 연결 종료')); return true; },
    handleEvent(e) {
      if (retired.has(e.turnId) || retired.has(e.threadId)) return true;
      const r = active; if (!r || r.done || (!e.turnId && !e.threadId)) return false;
      if (r.awaiting) { if (r.queue.length >= 512) finish(r, Error('라벨 관찰 이벤트 한도 초과')); else r.queue.push(e); return true; }
      if (!matches(r, e)) return false; route(r, e); return true;
    },
    async analyze(options = {}) {
      const token = reserve();
      const abortPreparation = () => {token.abort.abort();if(active?.preparationToken===token && !active.done){interrupt(active);finish(active,new DOMException('라벨 관찰이 취소되었습니다.','AbortError'));}};
      options.signal?.addEventListener('abort',abortPreparation,{once:true});
      try {
      const attachments = snapshotAttachments(options.attachments);
      const bindings = await Promise.all(attachments.map(async a => ({ name: a.name, transportSha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(a.data))), b => b.toString(16).padStart(2, '0')).join('') })));
      if(options.signal?.aborted)token.abort.abort();
      const collections=[],candidateErrors=[],collectionStarted=performance.now();
      if(collectCandidates && (typeof Image!=='undefined' || collectCandidates!==collectSourceLabelCandidates))for(let i=0;i<attachments.length;i++){
        try {
          const key=`${i+1}:${bindings[i].transportSha256}`;
          let collection=candidateCache.get(key);
          if(collection) collection=copy(collection);
          else {
            const candidateAbort=new AbortController();
            const abort=()=>candidateAbort.abort();
            token.abort.signal.addEventListener('abort',abort,{once:true});
            let timer, stop;
            try {
              // Position candidates are optional. Slow OCR must not prevent the
              // model from observing the attached original image directly.
              collection=await Promise.race([
                Promise.resolve().then(()=>collectCandidates({data:attachments[i].data,sourceRef:i+1,sourceSha256:bindings[i].transportSha256,pdfTextCandidates:options.attachments[i].sourceTextCandidates},{signal:candidateAbort.signal})),
                new Promise((_,reject)=>{timer=setTimeout(()=>{const error=Error('글자 위치 후보 준비 시간 초과: 원본 직접 관찰로 계속합니다.');error.code='AI_CANDIDATE_TIMEOUT';reject(error);candidateAbort.abort();},candidateTimeoutMs);}),
                new Promise((_,reject)=>{stop=()=>reject(new DOMException('글자 위치 후보 준비가 취소되었습니다.','AbortError'));candidateAbort.signal.addEventListener('abort',stop,{once:true});if(token.abort.signal.aborted)abort();}),
              ]);
            } finally {clearTimeout(timer);candidateAbort.signal.removeEventListener('abort',stop);token.abort.signal.removeEventListener('abort',abort);}
          }
          if(collection.sourceSha256!==bindings[i].transportSha256 || collection.sourceRef!==i+1)throw Error('위치 후보가 실제 원본에 연결되지 않았습니다.');
          if(collection.candidates?.length){candidateCache.set(key,copy(collection));if(candidateCache.size>4)candidateCache.delete(candidateCache.keys().next().value);}
          collections.push(collection);
        } catch(error){
          if(token.abort.signal.aborted || error?.name==='AbortError')throw error;
          candidateErrors.push({sourceRef:i+1,message:String(error?.message || error)});
        }
      }
      const candidateSets=normalizeSourceCandidateSets(collections,attachments.length);
      const candidateBindings=await Promise.all(candidateSets.map(async set=>({sourceRef:set.sourceRef,sourceSha256:set.sourceSha256,candidateSha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(set)))),b=>b.toString(16).padStart(2,'0')).join(''),count:set.candidates.length})));
      await options.onSourceCandidates?.({collections,candidateSets,errors:candidateErrors,totalMs:performance.now()-collectionStarted});
      ready(token);
      const plan = await send({ ...selectionPayload(options), attachments, outputSchema: buildSourceObservationOutputSchema(attachments.length,candidateSets,options.workflow),
        text: buildSourceLabelAnalysisPrompt({ request: options.request, referenceNames: attachments.map(a => a.name), workflow: options.workflow,candidateSets }) }, raw => {
        const observed = parseSourceLabelAnalysis(raw, attachments.length,candidateSets,{requireLeaderObservation:true,requireClassification:true});
        if (!observed.geometryLock) throw new Error('현재 생성에는 원본 형태 관찰 명세가 필요합니다. 이전 버전의 응답으로 생성하지 않았습니다.');
        return observed;
      },token);
      return freezeLabelPlan({ ...copy(plan), frozen: true, sourceBindings: bindings,sourceTextCandidateBindings:candidateBindings });
      } finally { options.signal?.removeEventListener('abort',abortPreparation);release(token); }
    },
    async reviewLocalRestore(options = {}) {
      const token = reserve();
      try {
        const attachments = snapshotAttachments([options.source, options.candidate, options.mask]);
        ready(token);
        return await send({...selectionPayload(options),attachments,text:'첨부는 순서대로 원본 국소 crop, 복원된 동일 crop, 흰색이 편집 영역인 이진 마스크다. 전체 그림을 추측하지 말고 이 crop만 직접 대조한다. 글자·지시선·끝점 잔여 제거와 실제 관·혈관·물체 윤곽·연결 보존을 각각 확인한다. 마스크 안이라고 과학적 구조 변형을 허용하지 않는다. 확인할 수 없으면 uncertain. 도구 호출 없이 엄격한 JSON만 반환한다: {"annotationRemoved":true,"scientificStructurePreserved":true,"verdict":"pass|fail|uncertain","reason":"직접 대조한 근거"}.'},raw=>{
          if (typeof raw !== 'string' || raw.length>10000) throw new Error('국소 복원 검수 응답이 잘못되었습니다.');
          let result; try {result=JSON.parse(raw);} catch {throw new Error('국소 복원 검수는 엄격한 JSON이어야 합니다.');}
          if (!result || typeof result.annotationRemoved!=='boolean' || typeof result.scientificStructurePreserved!=='boolean' || !['pass','fail','uncertain'].includes(result.verdict) || typeof result.reason!=='string' || !result.reason.trim() || result.reason.length>2000) throw new Error('국소 복원 검수 근거가 잘못되었습니다.');
          return {...result,verified:result.verdict==='pass' && result.annotationRemoved && result.scientificStructurePreserved};
        });
      } finally {release(token);}
    },
    async verifyPlacement(options = {}) {
      const token = reserve();
      try {
        const plan = freezeLabelPlan(copy(options.plan));
        const attachments = snapshotAttachments(options.attachments), candidate = snapshotAttachments([options.candidate])[0];
        const preview = options.preview ? copy(options.preview) : null;
        if (!plan?.frozen || plan.observationVersion !== 1 || !preview?.composite?.attachment || !preview?.proposals) throw new Error('측정된 원본 기반 최종 배치 후보가 필요합니다.');
        if (preview.proposalsSha256 !== await labelBindingHash(JSON.stringify(preview.proposals))) throw new Error('최종 검수 배치 후보 목록이 변경되었습니다.');
        for (const group of preview.proposals.groups) {
          if (group.candidates.length > 1) throw new Error('최종 검수는 첨부된 단일 묶음 후보만 허용합니다.');
          for (const proposed of group.candidates[0]?.labels || []) {
            const rendered = preview.placement.labels.find(l=>l.id===proposed.id);
            if (!rendered || rendered.status!=='matched' || ['position','anchor','bounds','leaderRoutes','elbow','extraAnchors'].some(k=>JSON.stringify(rendered[k])!==JSON.stringify(proposed[k]))) throw new Error('배치 후보가 실제 네이티브 검수 합성과 다릅니다.');
          }
        }
        const hashes = await Promise.all(attachments.map(a => labelBindingHash(a.data)));
        if (hashes.length !== plan.sourceBindings?.length || hashes.some((h,i)=>h!==plan.sourceBindings[i].transportSha256)) throw new Error('최종 검수 원본이 변경되었습니다.');
        await validateLabelTargetPlacement({plan,placement:preview.placement,candidateDataUrl:candidate.data});
        const expected = await Promise.all([labelBindingHash(candidate.data),labelBindingHash(JSON.stringify(plan)),labelBindingHash(preview.composite.attachment.data),labelBindingHash(JSON.stringify(preview.placement))]);
        const bindings = preview.composite.bindings;
        if (expected.some((h,i)=>h!==[bindings?.candidateSha256,bindings?.planSha256,bindings?.compositeSha256,bindings?.placementSha256][i])) throw new Error('최종 검수 후보 바인딩이 변경되었습니다.');
        snapshotAttachments([preview.composite.attachment]);
        const reviewPrompt = buildImageReviewPrompt({request:options.request,referenceNames:attachments.map(a=>a.name),candidateName:candidate.name,candidateAttachmentData:candidate.data,
          labelPlan:plan,workflow:options.workflow,labelOutcome:'restore-editable',labelOwnershipPolicy:SOURCE_LABEL_OWNERSHIP_POLICY,
          labelCompositeReport:preview.composite.report,labelCompositeName:preview.composite.attachment.name,structuralInventory:sourceGeometryContract(plan.geometryLock)});
        const prompt = buildCompactLabelPlacementPrompt(plan,preview.proposals)+'\n'+reviewPrompt+'\n최종 응답 형식을 통합한다. 단일 엄격한 JSON: {"placement":{"version":1,"groups":[위 후보별 선택]},"review":{"verdict":"pass|fail|uncertain","checks":[위 필수 검수 항목],"issues":[]}}. placement는 첨부된 단일 네이티브 합성 후보를 실제 확인하여 선택한다. review는 실제 첨부 RAW와 이 합성 후보를 원본과 대조한다. 후보 목록이나 측정 수치만으로 형태·내용·스타일 통과를 선언하지 않는다.';
        ready(token);
        const checked = await send({...selectionPayload(options),attachments:[...attachments,candidate,preview.composite.attachment],text:prompt,outputSchema:buildJointLabelReviewOutputSchema()},raw=>{
          const value=JSON.parse(raw);
          if (!value || Object.keys(value).some(k=>!['placement','review'].includes(k))) throw new Error('통합 최종 검수 응답 형식이 잘못되었습니다.');
          const labels=parseCompactLabelPlacementResponse(JSON.stringify(value.placement),plan,preview.proposals);
          const parsed=parseImageReviewReport(JSON.stringify(value.review),{requireLabelChecks:true,requireCompositeChecks:true,requireStyleChecks:options.workflow?.imageKind!=='exam'});
          if(!parsed.ok)throw new Error(parsed.error);
          if(parsed.report.verdict==='pass' && (plan.uncertainties?.length||plan.rejectedCount||plan.excludedLabels?.some(l=>l.scope==='unknown'))) {
            parsed.report.verdict='uncertain';parsed.report.issues.push({message:'원본 관찰 불확실성이 남아 있습니다.',severity:'major'});
          }
          return {labels,report:parsed.report};
        });
        const placement=await bindLabelTargetPlacement({plan,candidateDataUrl:candidate.data,imageKind:options.workflow?.imageKind||'general',labels:checked.labels});
        return {placement,report:checked.report};
      } finally {release(token);}
    },
    async mapTargets(options = {}) {
      const token = reserve();
      try {
        const plan = freezeLabelPlan(copy(options.plan));
        if (!plan?.frozen) throw new Error('대상 대응에 확정 원본 계획이 필요합니다.');
        if (plan.observationVersion === 1 && options.workflow?.imageKind !== 'exam') throw new Error('새 원본 명세는 측정된 통합 최종 검수 경로를 사용해야 합니다.');
        const attachments = snapshotAttachments(options.attachments), candidate = snapshotAttachments([options.candidate])[0];
        const hashes = await Promise.all(attachments.map(a => labelBindingHash(a.data)));
        if (hashes.length !== plan.sourceBindings?.length || hashes.some((h,i)=>h !== plan.sourceBindings[i].transportSha256)) throw new Error('대상 대응 원본이 변경되었습니다.');
        const imageKind = options.workflow?.imageKind || options.imageKind || 'general';
        const binding = await bindLabelTargetPlacement({plan,candidateDataUrl:candidate.data,imageKind,labels:[]});
        ready(token);
        const labels = imageKind === 'exam' || !plan.labels.length ? plan.labels.map(l=>({id:l.id,status:l.ownershipReviewRequired?'uncertain':'matched',reason:l.ownershipReviewRequired?'원본 소속 불확실':undefined,position:l.position,anchor:l.anchor,bounds:l.typography.bounds,...(l.elbow?{elbow:l.elbow}:{}),...(l.extraAnchors?{extraAnchors:l.extraAnchors}:{}),...(l.leaderRoutes?{leaderRoutes:l.leaderRoutes}:{})})) : await send({...selectionPayload(options),attachments:[...attachments,candidate],text:buildLabelTargetPlacementPrompt(plan)},raw=>{
          try { return parseLabelTargetPlacement(raw,plan); }
          catch (error) {
            // A completed observer's invalid geometry is not a raster failure.
            // Retain source observations as visibly unverified placements; never
            // retry generation or consume any coordinates from the bad response.
            const reason = `최종 대상 대응 응답을 검증하지 못함: ${String(error.message || '잘못된 응답').slice(0,300)}`;
            return plan.labels.map(label=>({id:label.id,status:'uncertain',reason}));
          }
        });
        return freezeLabelPlan({...binding,labels:copy(labels),status:labels.some(l=>l.status==='uncertain')?'needs-attention':'mapped'});
      } finally { release(token); }
    },
    reviewFinal(options = {}) { return this.review({ ...options, requireFinalComposite: options.workflow?.labelResult !== 'remove' }); },
    async review(options = {}) {
      const token = reserve();
      try {
      const plan = freezeLabelPlan(copy(options.plan));
      if (!plan?.frozen) throw new TypeError('검수할 확정 라벨 명세가 없습니다.');
      const attachments = snapshotAttachments(options.attachments);
      const candidate = snapshotAttachments([options.candidate])[0];
      const removeOnly = options.workflow?.labelResult === 'remove' || options.labelOutcome === 'remove';
      const composite = !removeOnly && options.requireFinalComposite && options.composite ? copy(options.composite) : null;
      const bindings = await Promise.all(attachments.map(async a => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(a.data))), b => b.toString(16).padStart(2, '0')).join('')));
      if (bindings.length !== plan.sourceBindings?.length || bindings.some((hash, i) => hash !== plan.sourceBindings[i].transportSha256)) throw new Error('관찰한 원본과 검수 원본이 달라 결과를 적용하지 않았습니다.');
      if (!removeOnly && options.requireFinalComposite) {
        if (!composite?.attachment?.data || !composite.bindings || !composite.report || !['mechanical-checks-clear','needs-attention'].includes(composite.report.status) || !Array.isArray(composite.report.issues)) throw new Error('최종 편집 라벨 합성 검수 자료가 없습니다.');
        snapshotAttachments([composite.attachment]);
        const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
        const expected = await Promise.all([hash(candidate.data), hash(JSON.stringify(plan)), hash(composite.attachment.data)]);
        if (expected.some((h,i) => h !== [composite.bindings.candidateSha256,composite.bindings.planSha256,composite.bindings.compositeSha256][i])) throw new Error('최종 합성물의 원본 명세 또는 후보가 달라 검수를 중단했습니다.');
      }
      if (options.placement) {
        await validateLabelTargetPlacement({plan,placement:options.placement,candidateDataUrl:candidate.data});
        if (composite && composite.bindings.placementSha256 !== await labelBindingHash(JSON.stringify(options.placement))) throw new Error('최종 합성물의 대상 대응이 변경되었습니다.');
      }
      ready(token);
      return send({ ...selectionPayload(options), outputSchema: buildImageReviewOutputSchema(), attachments: [...attachments, candidate, ...(composite ? [composite.attachment] : [])], text: buildImageReviewPrompt({
        request: options.request, referenceNames: attachments.map(a => a.name), candidateName: candidate.name,
        candidateAttachmentData: candidate.data, labelPlan: plan, workflow: options.workflow || {}, labelOutcome: removeOnly ? 'remove' : 'restore-editable', labelOwnershipPolicy: SOURCE_LABEL_OWNERSHIP_POLICY,
        labelCompositeReport: composite?.report, labelCompositeName: composite?.attachment.name, structuralInventory: sourceGeometryContract(plan.geometryLock),
      }) }, raw => {
        const parsed = parseImageReviewReport(raw, { requireLabelChecks: true, requireStyleChecks: options.workflow?.imageKind !== 'exam', labelOutcome: removeOnly ? 'remove' : 'restore-editable', requireCompositeChecks: Boolean(composite) });
        if (!parsed.ok) throw new Error(parsed.error);
        if (parsed.report.verdict === 'pass' && (plan.uncertainties?.length || plan.rejectedCount || plan.excludedLabels?.some(label => label.scope === 'unknown'))) {
          parsed.report.verdict = 'uncertain'; parsed.report.issues.push({ message: '원본 명세의 불확실성이 남아 있습니다.', severity: 'major' });
        }
        if (composite) {
          parsed.report.compositeBindings = composite.bindings;
          parsed.report.compositeMeasurements = composite.report;
          if (composite.report.status !== 'mechanical-checks-clear') {
            if (parsed.report.verdict === 'pass') parsed.report.verdict = 'uncertain';
            const names = {'source-bounds-deviation':'원본 글자 영역 대비 크기·위치 편차','label-overlap':'라벨끼리 겹침','clipped-label':'라벨이 그림 가장자리 밖으로 나감','source-plan-uncertainty':'원본 관찰 불확실성','unmeasurable-rendered-glyphs':'최종 글자 영역 측정 불가','export-font-unavailable':'내보내기 글꼴 로드 확인 필요'};
            for (const issue of composite.report.issues) parsed.report.issues.push({message:`최종 합성 측정: ${names[issue.code] || issue.code}${issue.id ? ' ('+issue.id+')' : ''}`,severity:'major'});
          }
        }
        parsed.report.labelReview = summarizeLabelReview(parsed.report, composite?.report.issues || [], removeOnly ? 'remove' : 'restore-editable');
        return parsed.report;
      });
      } finally { release(token); }
    },
  };
}

// Prepare one observable raster failure for user review. This never dispatches
// a generation and never treats uncertainty or overlay warnings as raster edits.
export function buildSourceLabelCorrectionDraft({ request = '', report } = {}) {
  const priority = ['connections', 'object-counts', 'inside-outside', 'liquid-occupancy', 'composition-state', 'request-scope', 'raster-label-removal', 'black-fill-meaning', 'presentation'];
  const check = priority.map(id => report?.checks?.find(item => item.id === id && item.status === 'fail')).find(Boolean);
  if (!check) return null;
  return { checkId: check.id, label: check.label || check.id,
    request: `${String(request).trim()}

원본과 대조해 다음 한 종류의 오류를 교정해 주세요.
${check.label || check.id}: ${check.detail}
원본 이미지가 구조의 최종 기준입니다. 확인된 나머지 물체·관계·크기·배치를 보존하고, 라벨 공간 확보를 위해 그림을 이동하거나 재설계하지 마세요. 기존 라벨의 글자·지시선 전체·출발 접점·대상 끝점(채운 점·빈 원의 테두리·화살촉)을 함께 제거하고 실제 과학적 선·표시는 보존합니다. 끝점 아래의 실제 관 벽·혈관 윤곽·물리적 입구는 보존하며, 불명확한 검수 bbox를 흰색 삭제 마스크로 쓰지 마세요. 편집 라벨은 별도 네이티브 객체로 복원합니다. 검수의 불확실 항목이나 글자 배치 경고를 그림 삭제의 근거로 삼지 마세요.`.trim() };
}
