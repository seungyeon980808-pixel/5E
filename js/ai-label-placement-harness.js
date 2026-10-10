// Deterministic geometry proposals, never semantic target assignments.
// All boxes use normalized RAW coordinates. Raster pixels are immutable RGBA.
const copy = value => JSON.parse(JSON.stringify(value));
const validBox = b => b && ['x','y','w','h'].every(k => Number.isFinite(b[k])) && b.w > 0 && b.h > 0;
const inside = b => validBox(b) && b.x >= 0 && b.y >= 0 && b.x + b.w <= 1 + 1e-9 && b.y + b.h <= 1 + 1e-9;
const translate = (b, dx, dy) => ({ ...b, x: b.x + dx, y: b.y + dy });
const intersects = (a,b) => Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)+1e-9 && Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y)+1e-9;
export const LABEL_PLACEMENT_POLICY = Object.freeze({version:3,ordinaryTextVerticalWeight:2,luminanceThreshold:242,halo:.006,inset:.004,step:.006,maxDx:.22,maxDy:.10,maxCandidates:3});

export function createLabelInkIndex({width,height,data}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width*height>16777216 || data?.length !== width*height*4) throw new TypeError('Bounded decoded RAW RGBA required');
  const stride=width+1, integral=new Uint32Array(stride*(height+1));
  for(let y=0;y<height;y++) { let sum=0; for(let x=0;x<width;x++) {
    const i=(y*width+x)*4,a=data[i+3]/255;
    sum += (.2126*data[i]+.7152*data[i+1]+.0722*data[i+2])*a+255*(1-a)<LABEL_PLACEMENT_POLICY.luminanceThreshold?1:0;
    integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+sum;
  }}
  return {width,height,count(box) {
    if(!inside(box))return null;
    const x0=Math.max(0,Math.floor(box.x*width)),y0=Math.max(0,Math.floor(box.y*height));
    const x1=Math.min(width,Math.ceil((box.x+box.w)*width)),y1=Math.min(height,Math.ceil((box.y+box.h)*height));
    return integral[y1*stride+x1]-integral[y0*stride+x1]-integral[y1*stride+x0]+integral[y0*stride+x0];
  }};
}

export function labelPlacementGroups(plan) {
  const labels=plan.labels || [], used=new Set(), ids=new Set(), groups=[];
  for(const group of plan.relationGroups || []) {
    if(!group || typeof group.id!=='string' || ids.has(group.id) || !['reaction','sequence','phrase'].includes(group.kind) || !Array.isArray(group.labelIds) || group.labelIds.length<2) throw new TypeError('Invalid source relation group');
    const members=group.labelIds.map(id=>labels.find(l=>l.id===id));
    if(members.some(l=>!l || used.has(l.id)) || new Set(group.labelIds).size!==members.length || new Set(members.map(l=>l.sourceRef)).size!==1) throw new TypeError('Conflicting source relation group');
    members.forEach(l=>used.add(l.id));ids.add(group.id);
    // Reaction and sequence arrows belong to RAW: moving their words alone
    // would change the scientific relation even if every text box were clear.
    groups.push({id:group.id,kind:group.kind,labelIds:[...group.labelIds],locked:group.kind!=='phrase'||members.some(l=>l.mode==='leader')});
  }
  for(const label of labels) if(!used.has(label.id)) {
    const id=`label:${label.id}`;
    if(ids.has(id))throw new TypeError('Conflicting source group id');
    ids.add(id);groups.push({id,kind:'single',labelIds:[label.id],locked:label.mode==='leader'});
  }
  return groups;
}

function geometry(label,dx,dy) {
  return {id:label.id,position:translate(label.position,dx,dy),anchor:label.mode==='text'?translate(label.position,dx,dy):copy(label.anchor),bounds:translate(label.typography.bounds,dx,dy),
    ...(label.leaderRoutes?{leaderRoutes:copy(label.leaderRoutes)}:{}),...(label.elbow?{elbow:copy(label.elbow)}:{}),...(label.extraAnchors?{extraAnchors:copy(label.extraAnchors)}:{})};
}

export function buildLabelPlacementCandidates({plan,measurements,raster,imageKind='general'}) {
  if(!plan?.frozen || !Array.isArray(measurements) || !['exam','general'].includes(imageKind))throw new TypeError('Frozen plan, native glyph measurements and image kind required');
  const ink=createLabelInkIndex(raster), policy=LABEL_PLACEMENT_POLICY, groups=labelPlacementGroups(plan), byId=new Map();
  for(const label of plan.labels) {
    const m=measurements.find(m=>m.id===label.id);
    // Do not substitute estimated source boxes for missing rendered glyphs.
    if(validBox(m?.glyphBounds))byId.set(label.id,m.glyphBounds);
  }
  const rows=groups.map(group=>{
    const members=group.labelIds.map(id=>plan.labels.find(l=>l.id===id)), candidates=[];
    if(group.labelIds.some(id=>!byId.has(id)))return {...group,candidates,reason:'missing-native-glyph-measurement'};
    const locked=group.locked||imageKind==='exam', offsets=[];
    const xSteps=locked?0:Math.floor(policy.maxDx/policy.step), ySteps=locked?0:Math.floor(policy.maxDy/policy.step);
    for(let yi=-ySteps;yi<=ySteps;yi++)for(let xi=-xSteps;xi<=xSteps;xi++)offsets.push({dx:xi===0?0:xi*policy.step,dy:yi===0?0:yi*policy.step});
    const ordinaryText= !locked && group.kind==='single' && members.length===1 && members[0].mode==='text'
      && (members[0].scope??'general')==='general' && ['text','name'].includes(members[0].typography?.role)
      && (members[0].contentMode??'plain')==='plain';
    const verticalWeight=ordinaryText?policy.ordinaryTextVerticalWeight:1;
    offsets.sort((a,b)=>Math.hypot(a.dx*raster.width,a.dy*raster.height*verticalWeight)-Math.hypot(b.dx*raster.width,b.dy*raster.height*verticalWeight)||Math.abs(a.dy*raster.height)-Math.abs(b.dy*raster.height)||(a.dx-b.dx)*raster.width);
    for(const {dx,dy} of offsets) {
      const glyphs=group.labelIds.map(id=>({id,box:translate(byId.get(id),dx,dy)}));
      const boxes=glyphs.map(g=>({x:g.box.x-policy.halo,y:g.box.y-policy.halo,w:g.box.w+2*policy.halo,h:g.box.h+2*policy.halo}));
      if(boxes.some(b=>!inside(b)||b.x<policy.inset||b.y<policy.inset||b.x+b.w>1-policy.inset||b.y+b.h>1-policy.inset||ink.count(b)!==0))continue;
      if(glyphs.some((g,i)=>glyphs.slice(i+1).some(other=>intersects(g.box,other.box))))continue;
      if(boxes.some(b=>plan.labels.some(l=>!group.labelIds.includes(l.id)&&byId.has(l.id)&&intersects(b,byId.get(l.id)))))continue;
      const labels=members.map(l=>geometry(l,dx,dy));
      if(labels.some(l=>!inside(l.bounds)))continue;
      if(candidates.some(c=>Math.hypot(c.dx-dx,c.dy-dy)<.024))continue;
      candidates.push({candidateId:`${group.id}:candidate:${candidates.length}`,dx,dy,labels,glyphs,rawInkPixels:0});
      if(candidates.length===policy.maxCandidates)break;
    }
    return {...group,locked,candidates,...(!candidates.length?{reason:'no-clear-whole-group-candidate'}:{})};
  });
  return {version:1,imageKind,policy,sourceLabelsJson:JSON.stringify(plan.labels),sourceGroupsJson:JSON.stringify(plan.relationGroups||[]),sourceAssociationsJson:JSON.stringify(plan.sourceAssociations||[]),sourceGeometryJson:JSON.stringify(plan.geometryLock||null),width:raster.width,height:raster.height,groups:rows};
}

function association(plan,id) { return (plan.sourceAssociations || []).find(a=>(a.labelId??a.id)===id); }
export function matchesSourceLabelIdentity(plan,label,identity) {
  const expected=association(plan,label.id);
  if(expected?.bindingKind==='figure')return expected.status==='confirmed' && label.mode==='text'
    && identity?.bindingKind==='figure' && identity.sourceObjectId===undefined
    && identity.sourceRef===expected.sourceRef && expected.sourceRef===label.sourceRef;
  if(identity?.bindingKind==='figure')return false;
  return (!plan.sourceAssociations || expected?.status==='confirmed' && identity?.sourceObjectId===expected.objectId)
    && Boolean(plan.geometryLock?.objects.some(o=>o.id===identity?.sourceObjectId&&o.sourceRef===label.sourceRef));
}
export function validateGroupedLabelPlacement(plan,rows) {
  for(const group of labelPlacementGroups(plan)) {
    const members=group.labelIds.map(id=>({source:plan.labels.find(l=>l.id===id),row:rows.find(r=>r.id===id)}));
    if(members.some(m=>!m.row))throw new TypeError('Incomplete grouped placement');
    if(group.kind!=='single'&&new Set(members.map(m=>m.row.status)).size!==1)throw new TypeError('Partial group confirmation is forbidden');
    let delta;
    for(const {source,row} of members) {
      if(row.status!=='matched')continue;
      const expected=association(plan,source.id);
      if(plan.sourceAssociations && !matchesSourceLabelIdentity(plan,source,row.targetIdentity))throw new TypeError('Fixed source identity changed');
      const d={x:row.position.x-source.position.x,y:row.position.y-source.position.y};
      if(plan.sourceAssociations || group.kind!=='single') {
        const b=row.bounds,s=source.typography?.bounds;
        if(!b||!s||Math.abs(b.w-s.w)>1e-9||Math.abs(b.h-s.h)>1e-9||Math.abs((b.x-s.x)-d.x)>1e-9||Math.abs((b.y-s.y)-d.y)>1e-9)throw new TypeError('Source glyph size and relative bounds must be preserved');
      }
      if(group.kind!=='single'&&delta&&(Math.abs(d.x-delta.x)>1e-9||Math.abs(d.y-delta.y)>1e-9))throw new TypeError('Source group was scattered');
      delta=d;
      if((group.kind==='reaction'||group.kind==='sequence'||(source.mode==='leader'&&plan.sourceAssociations)) && (Math.abs(d.x)>1e-9||Math.abs(d.y)>1e-9))throw new TypeError('Scientific relation geometry is locked');
      if(source.mode==='leader'&&plan.sourceAssociations)for(const key of ['anchor','leaderRoutes','elbow','extraAnchors'])if(JSON.stringify(row[key])!==JSON.stringify(source[key]))throw new TypeError('Scientific leader geometry is locked');
    }
  }
  return rows;
}
export function buildCompactLabelPlacementPrompt(plan,proposals) {
  const groups=proposals.groups.map(g=>({id:g.id,kind:g.kind,locked:g.locked,labels:g.labelIds.map(id=>{const l=plan.labels.find(l=>l.id===id);return {id,text:l.text,mode:l.mode,sourceAssociation:association(plan,id)};}),candidates:g.candidates}));
  return `첨부 원본과 RAW/네이티브 합성 후보를 직접 비교한다. JSON만 반환한다. 고정 원본 대상 신원과 글자 의미를 유지한다. 이름 문구는 대상의 바깥 여백에 놓여도 된다. 물리 화살표는 RAW 소유이며 새 지시선으로 만들지 않는다. 묶음의 모든 글자와 지시선 끝점을 확인한 경우에만 matched. 좌표나 텍스트를 만들거나 바꾸지 않는다. candidateId를 반드시 명시한다. 객체 대상은 identities에 {id,sourceObjectId}를 쓰고 confirmed 관찰의 objectId를 그대로 쓴다. 명시적으로 bindingKind figure인 원본 캡션·패널 표기는 {id,bindingKind:"figure",sourceRef}를 쓰며 물리 객체 id를 만들어 넣지 않는다. 불명확하거나 좋은 후보가 없으면 uncertain과 구체적 reason. 누락된 선택은 동의가 아니다. 모든 묶음을 정확히 한 번 반환한다. 형식: {"version":1,"groups":[{"id":"그룹 id","status":"matched","candidateId":"제시된 후보 id","identities":[{"id":"라벨 id","sourceObjectId":"고정 objectId"}],"reason":"직접 대조 근거"} 또는 {"id":"그룹 id","status":"uncertain","reason":"사유"}]}\n고정 후보: ${JSON.stringify(groups)}`;
}

export function parseCompactLabelPlacementResponse(raw,plan,proposals) {
  if(typeof raw!=='string'||raw.length>100000)throw new TypeError('Invalid compact placement response');
  const data=JSON.parse(raw);
  if(proposals.sourceLabelsJson!==JSON.stringify(plan.labels)||proposals.sourceGroupsJson!==JSON.stringify(plan.relationGroups||[])||proposals.sourceAssociationsJson!==JSON.stringify(plan.sourceAssociations||[])||proposals.sourceGeometryJson!==JSON.stringify(plan.geometryLock||null))throw new TypeError('Stale placement proposals');
  if(data?.version!==1||!Array.isArray(data.groups)||data.groups.length!==proposals.groups.length)throw new TypeError('Incomplete placement groups');
  const seen=new Set(), rows=[];
  for(const row of data.groups) {
    const group=proposals.groups.find(g=>g.id===row?.id);
    if(!group||seen.has(row.id)||!['matched','uncertain'].includes(row.status)||typeof row.reason!=='string'||!row.reason.trim()||row.reason.length>1000)throw new TypeError('Invalid group confirmation');
    seen.add(row.id);
    const allowed=row.status==='matched'?['id','status','candidateId','identities','reason']:['id','status','reason'];
    if(Object.keys(row).some(k=>!allowed.includes(k)))throw new TypeError('Custom placement geometry is forbidden');
    if(row.status==='uncertain'){rows.push(...group.labelIds.map(id=>({id,status:'uncertain',reason:row.reason})));continue;}
    const candidate=group.candidates.find(c=>c.candidateId===row.candidateId);
    if(!candidate||!Array.isArray(row.identities)||row.identities.length!==group.labelIds.length)throw new TypeError('Explicit candidate and identities required');
    const identities=new Set();
    for(const id of group.labelIds) {
      const label=plan.labels.find(l=>l.id===id), identity=row.identities.find(i=>i.id===id), expected=association(plan,id);
      const figure=expected?.bindingKind==='figure', identityKeys=figure?['id','bindingKind','sourceRef']:['id','sourceObjectId'];
      if(!identity||identities.has(identity.id)||Object.keys(identity).some(k=>!identityKeys.includes(k))||expected?.status!=='confirmed'||!matchesSourceLabelIdentity(plan,label,identity))throw new TypeError('Fixed source identity not confirmed');
      identities.add(identity.id);
      rows.push({...copy(candidate.labels.find(l=>l.id===id)),status:'matched',targetIdentity:{...(figure?{bindingKind:'figure',sourceRef:identity.sourceRef}:{sourceObjectId:identity.sourceObjectId}),description:row.reason}});
    }
  }
  return validateGroupedLabelPlacement(plan,plan.labels.map(l=>rows.find(r=>r.id===l.id)));
}

// Called on the final native composite AFTER fallback/guard application.
// Every glyph is checked, including uncertain labels restored at source coords.
export function assessFinalLabelPlacement({plan,measurements,raster}) {
  const ink=raster?createLabelInkIndex(raster):null,issues=[], glyphs=[];
  for(const label of plan.labels.filter(l=>!l.scope||l.scope==='general')) {
    const matches=measurements.filter(m=>m.id===label.id), box=matches[0]?.glyphBounds;
    if(matches.length!==1||!validBox(box)){issues.push({code:'unmeasured-final-glyph',id:label.id});continue;}
    glyphs.push({id:label.id,box});
    if(!inside(box))issues.push({code:'clipped-final-glyph',id:label.id,bounds:box});
    const count=ink?.count(box);
    if(count>0)issues.push({code:'raw-ink-occlusion',id:label.id,pixels:count});
    if(label.targetReviewRequired)issues.push({code:'unconfirmed-source-fallback',id:label.id});
  }
  if(!ink)issues.push({code:'raw-ink-not-checked'});
  for(let i=0;i<glyphs.length;i++)for(let j=i+1;j<glyphs.length;j++)if(intersects(glyphs[i].box,glyphs[j].box))issues.push({code:'final-glyph-overlap',ids:[glyphs[i].id,glyphs[j].id]});
  return {version:1,status:issues.length?'needs-attention':'mechanical-checks-clear',checkedLabelIds:glyphs.map(g=>g.id),issues,visualReviewRequired:true,limitations:['RAW ink is conservatively treated as meaningful; visual review is still required for target identity and source geometry.']};
}
