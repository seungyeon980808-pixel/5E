// Source observations are hypotheses. The source raster remains authoritative.
export const SOURCE_GEOMETRY_VERSION = 1;
export const SOURCE_GEOMETRY_PROMPT = `라벨 명세와 함께 geometryLock을 기록한다: {"version":1,"objects":[{"id":"object-1","sourceRef":1,"role":"scientific-object","description":"원본에서 직접 확인한 물체·내부 경로·구획과 개수, 잘림, 색 범주의 구분","bounds":{"x":0.1,"y":0.2,"w":0.3,"h":0.4},"relations":[{"target":"object-2","kind":"contact","description":"직접 확인한 접점"}]}]}. 객체는 1~64개이며 id가 고유해야 한다. relations.kind는 contact/connect/inside/crossing/separate 중 하나이고 target은 같은 원본의 실제 객체 id다. 모든 좌표는 sourceRef 원본 캔버스 기준이다. 라벨·설명 지시선·장식 강조틀·투영 가이드는 과학 물체로 계수하지 않는다. 현미경의 세포 확대 삽화, 망원경의 천체 그림, 렌즈의 확대 그림과 내부 광학 경로는 role scientific-inset으로 각각 관찰하고 내용·개수·내부 구조를 보존한다. 원형 테두리나 확대 연결선과 그 안의 과학 그림은 별개의 소유다. 테두리 제거가 내부 삽화 삭제를 허용하지 않는다. 말풍선·장식 캐릭터·페이지 본문은 removalOnlyItems 또는 제거 전용 labels 소관이며 보존 물체에 넣지 않는다. 주요 대상, 내부 분기와 연결, 국소 비율, 패널, 잘린 가장자리와 빈 공간을 원본에서 관찰한다. 읽히지 않는 미세 경로·반복 수는 확정하지 않고 uncertainties에 남긴다. 이 관찰 명세는 원본을 대신하는 정답이 아니며 생성 후 원본과 직접 재대조한다.`;
export function normalizeSourceGeometry(value, sourceCount) {
  if (!value || value.version !== SOURCE_GEOMETRY_VERSION || !Array.isArray(value.objects) || !value.objects.length || value.objects.length > 64) throw new Error('원본 형태 보존 명세가 누락되거나 올바르지 않습니다.');
  const ids = new Set();
  const objects = value.objects.map(o => {
    const b = o?.bounds;
    if (!o || typeof o.id !== 'string' || !/^[A-Za-z0-9_.:-]{1,80}$/.test(o.id) || ids.has(o.id)
      || !Number.isInteger(o.sourceRef) || o.sourceRef < 1 || o.sourceRef > sourceCount
      || typeof o.description !== 'string' || !o.description.trim() || o.description.length > 1000
      || !b || !['x','y','w','h'].every(k => Number.isFinite(b[k])) || b.x < 0 || b.y < 0 || b.w <= 0 || b.h <= 0 || b.x+b.w > 1.000001 || b.y+b.h > 1.000001
      || o.role!==undefined && !['scientific-object','scientific-inset'].includes(o.role)
      || !Array.isArray(o.relations) || o.relations.length > 32) throw new Error('원본 물체·관계 좌표를 확인할 수 없습니다.');
    ids.add(o.id);
    return {id:o.id,sourceRef:o.sourceRef,...(o.role?{role:o.role}:{}),description:o.description,bounds:{x:b.x,y:b.y,w:b.w,h:b.h},relations:o.relations.map(r => {
      if (!r || typeof r.target !== 'string' || !['contact','connect','inside','crossing','separate'].includes(r.kind)
        || r.description !== undefined && (typeof r.description !== 'string' || r.description.length > 500)) throw new Error('원본 물체 연결 명세가 올바르지 않습니다.');
      return {target:r.target,kind:r.kind,...(r.description ? {description:r.description} : {})};
    })};
  });
  const quarantinedRelations=[];
  for(const object of objects) object.relations=object.relations.filter(relation=>{
    const target=objects.find(candidate=>candidate.id===relation.target);
    if(target && target.id!==object.id && target.sourceRef===object.sourceRef) return true;
    quarantinedRelations.push({objectId:object.id,sourceRef:object.sourceRef,target:relation.target,
      kind:relation.kind,reason:'원본 관계의 대상 물체가 없거나 다른 원본입니다.',deletionAuthority:false});
    return false;
  });
  return {version:SOURCE_GEOMETRY_VERSION,objects,...(quarantinedRelations.length?{quarantinedRelations}:{})};
}
export function sourceGeometryContract(geometry) {
  if (!geometry) return '원본 과학 물체·연결·비율은 직접 확인한다. 없는 관찰 명세를 추측하지 않는다.';
  return `형태 보존 관찰 명세: ${JSON.stringify(geometry)}\n과학적 위치·크기·내부 경로·연결·범주·잘림은 사용자 명시 변경 외에는 잠금이다. scientific-inset의 내부 과학 그림·개수·세포·천체·렌즈/광학 경로를 보존한다. 장식 테두리 제거가 내부 삽화 삭제를 허용하지 않는다. 이 잠금은 제거 전용 교과서 본문·페이지 캡션·말풍선·장식의 보존 요구가 아니다. 글자를 지웠다고 물체를 그 빈 공간으로 키우거나 이동하지 않는다. 실제 원본이 관찰 명세보다 우선하며, 새 장치·분기·반복·장식은 추가하지 않는다.`;
}

export const SOURCE_REMOVAL_REGIONS_PROMPT = `라벨 제거 픽셀 소유를 확정할 수 있을 때만 removalRegions를 기록한다: [{id,labelId,sourceRef,ownership:"confirmed",kind:"polygon|path|ellipse",component:"text|leader|endpoint|mark",points:[{x,y}],width:0.002,bounds:{x,y,w,h},method:"flat-background|local-restore"}]. polygon은 실제 주석 획 영역을 좁게 감싼 3~256점, path는 2~256점과 min(원본 폭,높이) 기준 폭, ellipse는 실제 끝점 영역 bounds다. 좌표는 원본 0~1. 글자 bbox 전체를 확인 없이 삭제 영역으로 승격하지 않는다. owner는 label|auxiliary|scientific-arrow이며 생략하면 label이다. labelId는 owner label일 때 labels의 general 소속 id와 같다. 기타 보조선·확대 연결선·강조틀은 auxiliary, 실제 힘/운동/혈류/전류 화살표는 scientific-arrow다. 사용자 현재 옵션에 맞춰 관찰을 생략하지 말고 확인된 모든 소속을 기록한다. 관·혈관·윤곽과 겹치면 flat-background로 처리하지 않고 local-restore로 지정한다. 보호해야 하는 실제 과학 구조는 protectedRegions:[{sourceRef,bounds,reason}]에 기록한다. 불확실 소속은 uncertainties에 남기고 removalRegions에 넣지 않는다. 직접 확인한 영역이 없으면 []로 둔다.`;
export function normalizeSourceRemovalRegions(value, plan, sourceCount) {
  const validBox = b => b && ['x','y','w','h'].every(k=>Number.isFinite(b[k])) && b.x>=0 && b.y>=0 && b.w>0 && b.h>0 && b.x+b.w<=1.000000001 && b.y+b.h<=1.000000001;
  const validPoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x>=0 && p.y>=0 && p.x<=1 && p.y<=1;
  const removalRegions = value.removalRegions || [], protectedRegions = value.protectedRegions || [];
  if (!Array.isArray(removalRegions) || removalRegions.length>1024 || !Array.isArray(protectedRegions) || protectedRegions.length>256) throw new Error('원본 제거·보호 영역이 잘못되었습니다.');
  const ids = new Set();
  const regions = removalRegions.map(r=> {
    const owner = r?.owner || 'label';
    const label = plan.labels.find(l=>l.id===r?.labelId && l.sourceRef===r.sourceRef && !l.ownershipReviewRequired);
    if (!['label','auxiliary','scientific-arrow'].includes(owner) || owner === 'label' && !label || owner !== 'label' && r.labelId !== undefined || !Number.isInteger(r.sourceRef) || r.sourceRef < 1 || r.sourceRef > sourceCount || typeof r.id!=='string' || !/^[A-Za-z0-9_.:-]{1,80}$/.test(r.id) || ids.has(r.id) || r.ownership!=='confirmed' || !['polygon','path','ellipse'].includes(r.kind) || !(owner === 'label' ? ['text','leader','endpoint'] : ['text','leader','endpoint','mark']).includes(r.component) || !['flat-background','local-restore'].includes(r.method)) throw new Error('원본 제거 영역의 라벨 소속을 확인할 수 없습니다.');
    ids.add(r.id);
    if (r.kind==='ellipse' ? !validBox(r.bounds) : !Array.isArray(r.points) || r.points.length<(r.kind==='polygon'?3:2) || r.points.length>256 || r.points.some(p=>!validPoint(p))) throw new Error('원본 제거 영역 좌표가 잘못되었습니다.');
    if (r.kind==='path' && (!Number.isFinite(r.width)||r.width<=0||r.width>0.1)) throw new Error('제거 경로 폭이 잘못되었습니다.');
    if (r.background!==undefined && (!Array.isArray(r.background)||r.background.length!==4||r.background.some(n=>!Number.isInteger(n)||n<0||n>255))) throw new Error('제거 배경색이 잘못되었습니다.');
    return JSON.parse(JSON.stringify(r));
  });
  for (const r of protectedRegions) if (!Number.isInteger(r?.sourceRef)||r.sourceRef<1||r.sourceRef>sourceCount||!validBox(r.bounds)||typeof r.reason!=='string'||!r.reason.trim()||r.reason.length>1000) throw new Error('원본 보호 영역이 잘못되었습니다.');
  const inkSearchRegions=value.inkSearchRegions || [];
  if (!Array.isArray(inkSearchRegions) || inkSearchRegions.length>1024) throw new Error('주석 획 탐색 영역이 잘못되었습니다.');
  for(const r of inkSearchRegions) {
    const label=plan.labels.find(l=>l.id===r?.labelId && l.sourceRef===r.sourceRef && !l.ownershipReviewRequired);
    if(!label || !Number.isInteger(r.sourceRef) || r.sourceRef<1 || r.sourceRef>sourceCount || typeof r.id!=='string' || !/^[A-Za-z0-9_.:-]{1,80}$/.test(r.id) || ids.has(r.id) || r.ownership!=='confirmed' || !['text','leader','endpoint'].includes(r.component) || !validBox(r.bounds)
      || !Array.isArray(r.background) || r.background.length!==4 || r.background.some(n=>!Number.isInteger(n)||n<0||n>255) || r.background[3]!==255) throw new Error('주석 획 탐색 소속·배경을 확인할 수 없습니다.');
    if(r.backgroundMode!==undefined && (r.backgroundMode!=='sample-flat' || r.component!=='text')) throw new Error('배경 표본 탐색은 확정된 글자 영역에만 사용할 수 있습니다.');
    if(r.component==='leader' && (r.kind!=='path' || !Array.isArray(r.points) || r.points.length<2 || r.points.length>256 || r.points.some(p=>!validPoint(p)) || !Number.isFinite(r.width) || r.width<=0 || r.width>0.1)) throw new Error('지시선 획 탐색 경로가 잘못되었습니다.');
    if(r.component==='endpoint' && r.kind!=='ellipse') throw new Error('끝점 획 탐색 영역이 잘못되었습니다.');
    ids.add(r.id);
  }
  const coverage=plan.labels.filter(l=>l.scope==='general').map(l=>{
    const required=l.mode==='leader'?['text','leader','endpoint']:['text'];
    const covered=regions.filter(r=>r.labelId===l.id).map(r=>r.component);
    const searchable=inkSearchRegions.filter(r=>r.labelId===l.id).map(r=>r.component);
    return {labelId:l.id,required,missing:required.filter(c=>!covered.includes(c)&&!searchable.includes(c)),pixelVerificationRequired:searchable.length>0};
  });
  return {removalRegions:regions,protectedRegions:JSON.parse(JSON.stringify(protectedRegions)),inkSearchRegions:JSON.parse(JSON.stringify(inkSearchRegions)),removalReadiness:{status:coverage.some(c=>c.missing.length)||plan.labels.some(l=>l.ownershipReviewRequired)?'needs-observation':coverage.some(c=>c.pixelVerificationRequired)?'needs-pixel-verification':'observed-regions',pixelReady:false,coverage}};
}
