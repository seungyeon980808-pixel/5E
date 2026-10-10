import { normalizeLeaderRoutes } from './ai-label-leaders.js?v=1.7.0-four-session-integration';
import { validateGroupedLabelPlacement, matchesSourceLabelIdentity } from './ai-label-placement-harness.js?v=1.7.0-four-session-integration';
const clone = v => JSON.parse(JSON.stringify(v));
const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
export async function labelBindingHash(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, '0')).join(''); }
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0 && p.x <= 1 && p.y <= 1;
const bounds = b => b && ['x','y','w','h'].every(k => Number.isFinite(b[k])) && b.x >= 0 && b.y >= 0 && b.w > 0 && b.h > 0 && b.x+b.w <= 1.000000001 && b.y+b.h <= 1.000000001;
export function buildLabelTargetPlacementPrompt(plan) {
  // Example geometry is explicitly only a schema illustration. Its optional
  // fields mirror each source occurrence so following it never invents a route.
  const example = {version:1,labels:plan.labels.map(label => {
    const target = plan.geometryLock?.objects.find(object => object.sourceRef === label.sourceRef);
    if (!target) return {id:label.id,status:'uncertain',reason:'대응 가능한 원본 대상이 확인되지 않음'};
    return {id:label.id,status:'matched',targetIdentity:{sourceObjectId:target.id,description:'여기에 원본과 후보의 동일 대상 직접 대조 근거를 기입'},
      position:label.position,anchor:label.mode==='text'?label.position:label.anchor,bounds:label.typography.bounds,
      ...(label.leaderRoutes?{leaderRoutes:label.leaderRoutes}:{}),...(label.elbow?{elbow:label.elbow}:{}),
      ...(label.extraAnchors?.length?{extraAnchors:label.extraAnchors}:{})};
  })};
  return `첨부 원본들 다음 마지막 이미지는 최종 RAW 후보다. 이미지 생성이나 도구 호출 없이 JSON만 반환한다. 원본 라벨을 재추출하지 않는다. 고정 명세의 모든 id에 대해 후보에서 동일한 실제 과학 대상을 대조하여 배치한다. 글자·기호·서식은 바꿀 수 없다. 위치가 이동했으면 후보 기준 좌표로 갱신하며 대응 불확실하면 status uncertain과 reason을 기록하고 좌표를 추측하지 않는다. sourceObjectId는 geometryLock의 같은 sourceRef 물체 id다. text 항목도 해당 글자가 설명하는 물체/영역을 확인한다. 다중 지시선은 모든 대상과 경로 수를 보존한다.
좌표는 후보 캔버스 0~1이다. text 모드는 anchor와 position을 반드시 같은 좌표로 쓴다. leaderRoutes와 elbow는 원본에 있을 때만 반환하고 없으면 키 자체를 생략한다. 빈 leaderRoutes 배열은 쓰지 않는다. extraAnchors는 원본에 있는 추가 대상 수만큼 반환하고 없으면 생략한다. 원본 leaderRoutes/elbow/extraAnchors가 있으면 후보에서 대조한 모든 경로·꺾임·대상을 빠짐없이 반환한다. uncertain 항목에는 id,status,reason만 쓴다.
응답 형식 예제(아래 좌표와 sourceObjectId는 형식 설명일 뿐 대응 증거가 아니다. 후보를 직접 대조하여 실제 위치와 신원을 바꾸며 불확실하면 uncertain으로 작성):
<placement-response-example>${JSON.stringify(example)}</placement-response-example>
고정 명세: ${JSON.stringify(plan)}`;
}
export function parseLabelTargetPlacement(raw, plan) {
  if (typeof raw !== 'string' || raw.length > 100000) throw new Error('대상 대응 응답 크기가 올바르지 않습니다.');
  let data; try { data = JSON.parse(raw); } catch { throw new Error('대상 대응은 엄격한 JSON이어야 합니다.'); }
  if (data?.version !== 1 || !Array.isArray(data.labels) || data.labels.length !== plan.labels.length) throw new Error('대상 대응 라벨 수가 다릅니다.');
  const ids = new Set();
  const labels = data.labels.map(row => {
    const source = plan.labels.find(l => l.id === row?.id);
    if (!source || ids.has(row.id) || !['matched','uncertain'].includes(row.status)) throw new Error('대상 대응 id 또는 상태가 잘못되었습니다.');
    ids.add(row.id);
    if (row.text !== undefined || row.typography !== undefined || row.contentMode !== undefined) throw new Error('대상 대응에서 원본 내용을 바꿀 수 없습니다.');
    if (row.status === 'uncertain') {
      if (typeof row.reason !== 'string' || !row.reason.trim() || row.reason.length > 1000) throw new Error('미확정 대상의 사유가 없습니다.');
      return {id:row.id,status:'uncertain',reason:row.reason};
    }
    const identity = row.targetIdentity;
    if (!identity || typeof identity.description !== 'string' || !identity.description.trim() || identity.description.length > 1000 || !matchesSourceLabelIdentity(plan,source,identity)) throw new Error('원본 대상의 신원을 확인할 수 없습니다.');
    if (!point(row.position) || !point(row.anchor) || !bounds(row.bounds)) throw new Error('대상 대응 좌표가 잘못되었습니다.');
    const routes = row.leaderRoutes === undefined ? null : normalizeLeaderRoutes(row.leaderRoutes);
    if (source.leaderRoutes ? !routes || routes.length !== source.leaderRoutes.length : row.leaderRoutes !== undefined) throw new Error('지시선 경로 수가 바뀌었습니다.');
    if (routes && (Math.hypot(routes[0].target.x-row.anchor.x,routes[0].target.y-row.anchor.y)>1e-6 || routes.some((r,i)=>r.end !== source.leaderRoutes[i].end))) throw new Error('지시선 끝점이 일치하지 않습니다.');
    if (source.elbow ? !point(row.elbow) : row.elbow !== undefined) throw new Error('지시선 꺾임이 잘못되었습니다.');
    const extras = row.extraAnchors || [];
    if (!Array.isArray(extras) || extras.length !== (source.extraAnchors?.length || 0) || extras.some(p=>!point(p))) throw new Error('추가 대상 수가 바뀌었습니다.');
    if (source.mode === 'text' && (row.anchor.x !== row.position.x || row.anchor.y !== row.position.y)) throw new Error('텍스트에 새 지시선을 만들 수 없습니다.');
    return {id:row.id,status:'matched',targetIdentity:clone(identity),position:clone(row.position),anchor:clone(row.anchor),bounds:clone(row.bounds),...(routes?{leaderRoutes:routes}:{}),...(row.elbow?{elbow:clone(row.elbow)}:{}),...(extras.length?{extraAnchors:clone(extras)}:{})};
  });
  return validateGroupedLabelPlacement(plan, labels);
}
export async function bindLabelTargetPlacement({plan,candidateDataUrl,imageKind='general',labels}) {
  if (!plan?.frozen || !['exam','general'].includes(imageKind)) throw new Error('대상 대응에 확정 명세와 이미지 종류가 필요합니다.');
  const [planSha256,candidateSha256] = await Promise.all([labelBindingHash(JSON.stringify(plan)),labelBindingHash(candidateDataUrl)]);
  return freeze({version:1,imageKind,planSha256,candidateSha256,sourceBindings:clone(plan.sourceBindings || []),sourceLabelsJson:JSON.stringify(plan.labels),labels:clone(labels),status:labels.some(l=>l.status==='uncertain')?'needs-attention':'mapped'});
}
export function applyLabelTargetPlacement(labels, placement, {candidateSha256} = {}) {
  if (!placement || placement.version !== 1 || !candidateSha256 || candidateSha256 !== placement.candidateSha256 || JSON.stringify(labels) !== placement.sourceLabelsJson || !Array.isArray(placement.labels) || placement.labels.length !== labels.length) throw new Error('대상 대응과 원본 명세 또는 후보가 다릅니다.');
  const seen = new Set();
  return labels.map(label => {
    const row = placement.labels.find(r=>r.id===label.id);
    if (!row || seen.has(row.id) || !['matched','uncertain'].includes(row.status)) throw new Error('대상 대응 목록이 올바르지 않습니다.');
    seen.add(row.id);
    if (row.status === 'uncertain') return {...clone(label),targetReviewRequired:true,targetReviewReason:row.reason};
    if (!point(row.position)||!point(row.anchor)||!bounds(row.bounds)) throw new Error('대상 대응 좌표가 올바르지 않습니다.');
    return {...clone(label),position:clone(row.position),anchor:clone(row.anchor),typography:{...clone(label.typography),bounds:clone(row.bounds)},...(row.leaderRoutes?{leaderRoutes:clone(row.leaderRoutes)}:{}),...(row.elbow?{elbow:clone(row.elbow)}:{}),...(row.extraAnchors?{extraAnchors:clone(row.extraAnchors)}:{})};
  });
}
export async function validateLabelTargetPlacement({plan,placement,candidateDataUrl}) {
  if (await labelBindingHash(JSON.stringify(plan)) !== placement?.planSha256) throw new Error('대상 대응의 원본 계획이 변경되었습니다.');
  if (placement.imageKind === 'general') parseLabelTargetPlacement(JSON.stringify({version:1,labels:placement.labels}),plan);
  else if (placement.imageKind === 'exam') {
    for (const row of placement.labels) {
      const source = plan.labels.find(l=>l.id===row.id);
      if (row.status === 'matched' && (!source || JSON.stringify(row.position)!==JSON.stringify(source.position) || JSON.stringify(row.anchor)!==JSON.stringify(source.anchor) || JSON.stringify(row.bounds)!==JSON.stringify(source.typography.bounds) || JSON.stringify(row.leaderRoutes)!==JSON.stringify(source.leaderRoutes) || JSON.stringify(row.elbow)!==JSON.stringify(source.elbow) || JSON.stringify(row.extraAnchors)!==JSON.stringify(source.extraAnchors))) throw new Error('기출 대상 좌표는 원본을 유지해야 합니다.');
    }
  } else throw new Error('대상 대응 이미지 종류가 없습니다.');
  return applyLabelTargetPlacement(plan.labels,placement,{candidateSha256:await labelBindingHash(candidateDataUrl)});
}
