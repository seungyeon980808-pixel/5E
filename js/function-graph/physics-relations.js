/* Low dimensional physics models and process decomposition. Source samples
 * remain evidence; they are never the editable definition of an accepted curve. */
import { compile } from './parser.js?v=1.7.0-four-session-integration';
import { measurePhysicsCandidate, solvePhysicsCoefficients } from './physics-fit.js?v=1.7.0-four-session-integration';

export const RELATION_FIT_VERSION = 'physics-relation-fit-v2';
const clone = value => JSON.parse(JSON.stringify(value));
const num = value => String(Number(value.toFixed(9)));
const denominator = pole => pole === 0 ? 'x' : `(x${pole < 0 ? '+' : '-'}${num(Math.abs(pole))})`;

// Explicit diagram coordinates have zero at the drawn axes, even when no
// numerical scale is printed. They must not be reported as physical units.
function relativeCoordinates(input) {
  if(input.variant && input.variant!=='cartesian')return input;
  if (input.coordinateMode !== 'observed') {
    const plan=clone(input);
    for(const k of ['x','y'])if(plan.axes[k].calibration?.method==='frame-fraction') {
      const cross=plan.axisPlacement?.[k==='x'?'y':'x']?.value ?? 0;
      plan.axes[k].min-=cross;plan.axes[k].max-=cross;plan.axes[k].calibration.method='relative-diagram';
      for(const tick of plan.axes[k].ticks || [])tick.value-=cross;
      for(const s of plan.series)for(const q of s.points || [])q[k]-=cross;
    }
    return plan;
  }
  if (input.axes.y2 || ['x','y'].some(k => input.axes[k].scale === 'log')) return null;
  const plan = clone(input), cross = { x: plan.axisPlacement?.y?.value ?? 0, y: plan.axisPlacement?.x?.value ?? 0 };
  for (const k of ['x','y']) {
    const axis = plan.axes[k];
    plan.axes[k] = { ...axis, scale:'linear', min:-cross[k], max:1-cross[k], step:.25,
      ticks:(axis.ticks || []).map(t => ({ ...t, value:t.position-cross[k], sourcePosition:t.position, valueSource:'observed-position' })),
      calibration:{method:'relative-diagram', unit:'', ticksUsed:0} };
  }
  for (const s of plan.series) {
    if(s.kind !== 'points' || s.coordinateSpace !== 'normalized') return null;
    s.points=s.points.map(p=>({...p,x:p.x-cross.x,y:p.y-cross.y})); s.coordinateSpace='data';
  }
  plan.coordinateMode='data'; return plan;
}

function contacts(series, plan) {
  const anchors=(series.relationAnchors || []).map(a => {
    const x=plan.axes.x.ticks.find(t=>[t.label,t.displayMath].includes(a.xTickLabel));
    const y=plan.axes[series.axis || 'y'].ticks.find(t=>[t.label,t.displayMath].includes(a.yTickLabel));
    return x && y && x.valueSource !== 'observed-position' && y.valueSource !== 'observed-position'
      ? {x:x.value,y:y.value,strong:true} : null;
  }).filter(Boolean);
  const points=series.points || series.observedPoints || [];
  for(const label of series.physicsModel?.zeroTicks || []) {
    const tick=plan.axes.x.ticks.find(t=>[t.label,t.displayMath].includes(label));
    if(!tick || tick.valueSource==='observed-position' || tick.value<points[0]?.x || tick.value>points.at(-1)?.x)continue;
    const i=points.findIndex(p=>p.x>=tick.value), a=points[Math.max(0,i-1)],b=points[i];
    const value=b.x===a.x?b.y:a.y+(b.y-a.y)*(tick.value-a.x)/(b.x-a.x);
    if(Math.abs(value)/(plan.axes[series.axis || 'y'].max-plan.axes[series.axis || 'y'].min)>=.012)return null;
    anchors.push({x:tick.value,y:0,strong:true});
  }
  return anchors;
}

function relationExpression(series, plan) {
  const model=series.physicsModel, points=series.points || series.observedPoints;
  if(!model || !points?.length || points.some((p,i)=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||i && p.x<=points[i-1].x))return null;
  if(model.kind==='endpoint-power') {
    const a=points[0], b=points.at(-1);
    if(!(a.x>0 && b.x>a.x && a.y>0 && b.y>0) || a.y===b.y)return null;
    if(model.exponent!==undefined) {
      const amplitude=(b.y-a.y)/((b.x/a.x)**model.exponent-1),offset=a.y-amplitude;
      return {expression:`${num(amplitude)}*(x/${num(a.x)})^(${num(model.exponent)})${offset<0?'':'+'}${num(offset)}`,
        anchors:[{...a,strong:true},{...b,strong:true}],coefficientSource:'process-endpoints-observed-exponent'};
    }
    // Both ends are exact contacts of this editable model. The exponent is
    // computed from endpoint ratios, not from an array of intermediate samples.
    const exponent=Math.log(b.y/a.y)/Math.log(b.x/a.x);
    return {expression:`${num(a.y)}*(x/${num(a.x)})^(${num(exponent)})`,
      anchors:[{...a,strong:true},{...b,strong:true}], coefficientSource:'process-endpoints'};
  }
  if(model.kind==='tangent-quadratic') {
    const a=points[model.tangentAt==='start'?0:points.length-1],b=points[model.tangentAt==='start'?points.length-1:0];
    const dx=b.x-a.x,dy=b.y-a.y;
    if(!dx || !dy)return null;
    const shifted=a.x===0?'x':`(x-(${num(a.x)}))`;
    const remaining=b.x===0?'x':`(x-(${num(b.x)}))`;
    if(model.orientation==='vertical' && model.tangentSpeed!==undefined) {
      const speed=model.tangentSpeed,quadratic=dy-speed;
      const expression=(a.y?num(a.y)+(speed<0?'':'+'):'')+`${num(speed)}*sqrt(${shifted}/${num(dx)})`+(quadratic?`${quadratic<0?'':'+'}${num(quadratic)}*${shifted}/${num(dx)}`:'');
      return {expression,anchors:[{...a,strong:true},{...b,strong:true}],coefficientSource:'endpoint-tangent-observations'};
    }
    const term=model.orientation==='vertical'?`sqrt(${shifted}/${num(dx)})`:model.otherOrientation==='vertical'?`(1-sqrt(${remaining}/${num(-dx)}))^2`:`(${shifted}/${num(dx)})^2`;
    const scaled=(Math.abs(dy)===1?'':`${num(Math.abs(dy))}*`)+term;
    const expression=(a.y?num(a.y):'')+(dy<0?'-':a.y?'+':'')+scaled;
    return {expression,anchors:[{...a,strong:true},{...b,strong:true}],coefficientSource:'endpoint-tangent-relations'};
  }
  if(model.kind!=='inverse-superposition' || ![-1,-2].includes(model.power) || !Array.isArray(model.poles) || model.poles.length<2 || model.poles.length>4 || model.poles.some(p=>!Number.isFinite(p) || p>=points[0].x && p<=points.at(-1).x))return null;
  const directed=model.power===-2 && model.directed!==false;
  const bases=model.poles.map(pole=>x=>(directed?Math.sign(x-pole):1)*(x-pole)**model.power);
  const group=plan.series.filter(s=>(model.groupId?s.physicsModel?.groupId===model.groupId:s.id===series.id) && s.physicsModel?.kind===model.kind && s.physicsModel.power===model.power && s.physicsModel.directed===model.directed && JSON.stringify(s.physicsModel.poles)===JSON.stringify(model.poles) && JSON.stringify(s.physicsModel.ratios)===JSON.stringify(model.ratios));
  const solvingPoints=group.flatMap(s=>s.points || s.observedPoints || []), groupedContacts=group.map(s=>contacts(s,plan));
  if(groupedContacts.some(a=>a===null))return null;
  const anchors=groupedContacts.flat(), ownAnchors=contacts(series,plan);
  let coefficients;
  if(model.ratios) {
    if(model.ratios.length!==bases.length || model.ratios.some(v=>!Number.isFinite(v)) || model.ratios.every(v=>v===0))return null;
    const combined=x=>bases.reduce((sum,f,i)=>sum+model.ratios[i]*f(x),0);
    const amplitude=solvePhysicsCoefficients(solvingPoints,[combined],anchors,{allowRelativeResidual:true});
    if(!amplitude)return null;
    coefficients=model.ratios.map(r=>r*amplitude[0]);
  } else coefficients=solvePhysicsCoefficients(solvingPoints,bases,anchors,{allowRelativeResidual:true});
  if(!coefficients)return null;
  // Unscaled drawings supply relative amplitudes only. Limit their precision.
  let compact=null;
  if(!model.ratios && anchors.length && anchors.every(a=>a.y===0)) {
    // Search low integer ratios around the constrained solution. A common
    // amplitude preserves every zero exactly even when its relative height is
    // rounded. These inferred ratios are estimates, not charge/current data.
    let best=null;
    for(let divisor=1;divisor<=4;divisor++) {
      const unit=Math.min(...coefficients.map(Math.abs).filter(v=>v>1e-9))/divisor;
      const options=coefficients.map(c=>[...new Set([Math.floor(c/unit),Math.round(c/unit),Math.ceil(c/unit)])].filter(v=>v!==0 && Math.abs(v)<=24));
      const combinations=options.reduce((acc,values)=>acc.flatMap(a=>values.map(v=>[...a,v])),[[]]);
      for(const ratios of combinations) {
        const basis=x=>bases.reduce((sum,f,i)=>sum+ratios[i]*f(x),0);
        if(anchors.some(a=>Math.abs(basis(a.x))>1e-9))continue;
        const fit=solvePhysicsCoefficients(solvingPoints,[basis]);if(!fit)continue;
        const amplitude=Number(fit[0].toPrecision(2));
        const error=solvingPoints.reduce((sum,p)=>sum+(amplitude*basis(p.x)-p.y)**2,0)/solvingPoints.length;
        const cost=error+1e-5*ratios.reduce((sum,r)=>sum+Math.abs(r),0);
        if(!best || cost<best.cost)best={cost,amplitude,ratios};
      }
    }
    compact=best;
  }
  const coefficientBases=model.ratios?[x=>bases.reduce((sum,f,i)=>sum+model.ratios[i]*f(x),0)]:bases;
  const exact=anchors.length>0 && !!solvePhysicsCoefficients(solvingPoints,coefficientBases,anchors);
  if(model.ratios && !exact){const i=model.ratios.findIndex(r=>r!==0);compact={amplitude:Number((coefficients[i]/model.ratios[i]).toPrecision(2)),ratios:model.ratios};}
  if(!anchors.length)coefficients=coefficients.map(v=>Number(v.toPrecision(2)));
  else if(!exact)coefficients=coefficients.map(v=>Number(v.toFixed(9)));
  const expression=compact ? `${num(compact.amplitude)}*(${compact.ratios.map((r,i)=>{const c=r*(directed?Math.sign(points[0].x-model.poles[i]):1);return `${c<0?'-':i?'+':''}${Math.abs(c)}/${denominator(model.poles[i])}${model.power===-2?'^2':''}`;}).join('')})` : coefficients.map((coefficient,i)=>{const c=coefficient*(directed?Math.sign(points[0].x-model.poles[i]):1);return `${c<0?'-':i?'+':''}${num(Math.abs(c))}/${denominator(model.poles[i])}${model.power===-2?'^2':''}`;}).join('');
  return {expression,anchors:ownAnchors,coefficientSource:exact?'relation-anchors':anchors.length?'relative-amplitude-with-relations':'relative-amplitude'};
}

function measured(series, plan) {
  const candidate=relationExpression(series,plan); if(!candidate)return null;
  const points=series.points || series.observedPoints;
  const m=measurePhysicsCandidate(candidate.expression,points,candidate.anchors,plan,series.axis || 'y',series.approximation?.sourceCurveStyle || series.curveStyle || 'smooth',{clipToFrame:true});
  return m.ok ? {...candidate,...m} : null;
}

// A marked corner alone is not evidence for two particles. Independent arrows
// directed into both outer ends supply the initial tangent conditions.
function initialTangent(series, plan) {
  const points=series.points,ax=plan.axes.x,ay=plan.axes[series.axis || 'y'];
  if(!points?.length || !ax || !ay)return null;
  const display=p=>({x:(p.x-ax.min)/(ax.max-ax.min),y:(p.y-ay.min)/(ay.max-ay.min)});
  for(const tangentAt of ['start','end']) {
    const i=tangentAt==='start'?0:points.length-1,j=tangentAt==='start'?1:i-1;
    const a=display(points[i]),b=display(points[j]);
    for(const arrow of plan.annotations || []) {
      if(arrow.kind!=='arrow' || !arrow.to || (arrow.axis || 'y')!==(series.axis || 'y'))continue;
      const u=arrow.coordinateSpace==='normalized'?arrow:display(arrow),v=arrow.coordinateSpace==='normalized'?arrow.to:display(arrow.to);
      if(Math.hypot(u.x-a.x,u.y-a.y)>.08)continue;
      const dx=v.x-u.x,dy=v.y-u.y,length=Math.hypot(dx,dy);
      if(length<.025 || dx*(b.x-a.x)+dy*(b.y-a.y)<=0)continue;
      const orientation=Math.abs(dx)<length*.1?'vertical':Math.abs(dy)<length*.1?'horizontal':null;
      if(orientation && (orientation==='vertical'?Math.abs(b.x-a.x):Math.abs(b.y-a.y))<Math.hypot(b.x-a.x,b.y-a.y)*.35) {
        const last=tangentAt==='start'?points.length-1:0,neighbor=tangentAt==='start'?last-1:1;
        const end=display(points[last]),near=display(points[neighbor]);
        const vertical=Math.abs(end.x-near.x)<Math.hypot(end.x-near.x,end.y-near.y)*.35;
        return {kind:'tangent-quadratic',orientation,tangentAt,...(orientation==='horizontal' && vertical?{otherOrientation:'vertical'}:{})};
      }
    }
  }
  return null;
}

function snapReference(point,plan,axis='y') {
  const out={...point};
  for(const [key,axisKey] of [['x','x'],['y',axis]]) {
    const a=plan.axes[axisKey],span=a.max-a.min;
    const candidates=(a.ticks || []).filter(t=>t.valueSource!=='observed-position' && Number.isFinite(t.value)).map(t=>t.value);
    if(a.min<=0 && a.max>=0)candidates.push(0);
    const nearest=candidates.sort((a,b)=>Math.abs(a-point[key])-Math.abs(b-point[key]))[0];
    if(Number.isFinite(nearest) && Math.abs(nearest-point[key])/span<=.012)out[key]=nearest;
  }
  return out;
}

// Pixel/point order is drawing evidence, not the mathematical domain order.
// Preserve every indexed reference while ordering each accepted trajectory by x.
function trajectoryPart(source, startIndex, endIndex, index, split, plan) {
  const reverse=source.points[endIndex].x<source.points[startIndex].x;
  const points=source.points.slice(startIndex,endIndex+1).map(p=>({...p}));
  if(reverse)points.reverse();
  const s={...clone(source),id:split?`${source.id}-trajectory-${index+1}`:source.id,points,endpoints:[],
    processSource:{seriesId:source.id,startIndex,endIndex,reverse}};
  s.points[0]=snapReference(s.points[0],plan,s.axis);
  s.points[s.points.length-1]=snapReference(s.points.at(-1),plan,s.axis);
  s.physicsModel=initialTangent(s,plan);
  return s;
}

function trajectoryCuts(source,plan) {
  // A point annotation can mark q without it being a series endpoint. Only
  // linked points qualify; nearby free text or guides alone never create cuts.
  const annotated=(plan.annotations || []).filter(a=>a.kind==='point' && a.seriesId===source.id && Number.isInteger(a.pointIndex)).map(a=>a.pointIndex);
  const candidates=[...(source.endpoints || []).map(e=>e.index),...annotated];
  const ax=plan.axes.x,ay=plan.axes[source.axis || 'y'];
  if(!ax || !ay)return [];
  const spanX=ax.max-ax.min,spanY=ay.max-ay.min;
  return [...new Set(candidates)].filter(i=>{
    if(i<=0 || i>=source.points.length-1)return false;
    const a=source.points[i-1],b=source.points[i],c=source.points[i+1];
    const u={x:(b.x-a.x)/spanX,y:(b.y-a.y)/spanY},v={x:(c.x-b.x)/spanX,y:(c.y-b.y)/spanY};
    const lengths=Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y);
    return lengths>0 && (u.x*v.x+u.y*v.y)/lengths<.85;
  }).sort((a,b)=>a-b);
}

function restoreTrajectories(plan) {
  const output=[];let added=0;
  for(const source of plan.series) {
    // candidateFamily is only a recognition hint. Tangent evidence and the
    // measured candidate determine acceptance, including mislabeled curves.
    if(source.kind!=='points' || source.curveStyle!=='smooth' || source.closed || source.breaks?.length || source.handlesMath || source.physicsModel || source.lineVisible===false || source.markerShape && source.markerShape!=='none' || source.points.length<2) {output.push(source);continue;}
    const cuts=trajectoryCuts(source,plan),bounds=[0,...cuts,source.points.length-1];
    const parts=bounds.slice(0,-1).map((a,i)=>trajectoryPart(source,a,bounds[i+1],i,!!cuts.length,plan));
    // A marked corner is insufficient. Every resulting part must independently
    // have an inward initial direction at an outer end, so arbitrary corners
    // and a single continuous particle path are not silently split.
    if(plan.series.length+added+parts.length-1>32 || parts.some(s=>!s.physicsModel) || (plan.regions || []).some(r=>r.upperSeriesId===source.id || r.lowerSeriesId===source.id)) {output.push(source);continue;}
    for(const part of parts) {
      const {startIndex:a,endIndex:b,reverse}=part.processSource;
      part.arrowSpecs=(source.arrowSpecs || []).filter(s=>s.segmentIndex>=a && s.segmentIndex<b).map(s=>({...s,
        segmentIndex:reverse?b-s.segmentIndex-1:s.segmentIndex-a,t:reverse?1-s.t:s.t,dir:reverse?-s.dir:s.dir}));
      if(source.segmentModes){part.segmentModes=source.segmentModes.slice(a,b);if(reverse)part.segmentModes.reverse();}
      delete part.candidateFamily;delete part.relationAnchors;
    }
    const owner=i=>parts.find(s=>i>=s.processSource.startIndex && i<=s.processSource.endIndex);
    const localIndex=(part,i)=>part.processSource.reverse?part.processSource.endIndex-i:i-part.processSource.startIndex;
    for(const a of plan.annotations || [])if(a.seriesId===source.id && Number.isInteger(a.pointIndex)) {
      const part=owner(a.pointIndex);if(!part)continue;
      a.seriesId=part.id;a.pointIndex=localIndex(part,a.pointIndex);
    }
    for(const e of source.endpoints || []) {
      const part=owner(e.index);if(!part)continue;
      part.endpoints.push({...e,index:localIndex(part,e.index)});
    }
    added+=parts.length-1;output.push(...parts);
  }
  plan.series=output;
}

function restoreRelativePowers(plan) {
  for(const s of plan.series) {
    if(s.kind!=='points' || s.physicsModel || s.closed || s.breaks?.length || s.handlesMath || s.curveStyle!=='smooth' || s.lineVisible===false || s.markerShape && s.markerShape!=='none' || s.candidateFamily && !['none','power-inverse','power-inverse-square','power-inverse-sqrt','power-sqrt','power-square'].includes(s.candidateFamily))continue;
    if(!['x',s.axis || 'y'].some(k=>plan.axes[k]?.calibration?.method==='relative-diagram'))continue;
    if(s.points.some(p=>p.x<=0 || p.y<=0) || s.points.some((p,i)=>i && (p.x-s.points[i-1].x)*(s.points.at(-1).x-s.points[0].x)<=0))continue;
    if(s.points.at(-1).x<s.points[0].x) {
      const last=s.points.length-1;
      s.points.reverse();
      s.endpoints=(s.endpoints || []).map(e=>({...e,index:last-e.index}));
      s.arrowSpecs=(s.arrowSpecs || []).map(a=>({...a,segmentIndex:last-a.segmentIndex-1,t:1-a.t,dir:-a.dir}));
      if(s.segmentModes)s.segmentModes.reverse();
      for(const a of plan.annotations || [])if(a.seriesId===s.id && Number.isInteger(a.pointIndex))a.pointIndex=last-a.pointIndex;
    }
    s.physicsModel={kind:'endpoint-power',reason:'상대 그림의 끝점 비로 계산한 지수이며 물리 법칙 인증이 아닙니다.'};
  }
}

// A mixed PV path is a collection of processes, not one y=f(x). Only explicit
// line/smooth boundaries qualify; arbitrary closed paths are never reinterpreted.
function splitProcesses(plan) {
  const output=[];let added=0;
  for(const source of plan.series) {
    const pv=/부피|volume/i.test(plan.axes.x.title) && /압력|pressure/i.test(plan.axes.y.title);
    if(!pv || source.kind!=='points' || !source.closed || source.handlesMath || source.breaks?.length || !source.segmentModes?.includes('line') || !source.segmentModes.includes('smooth')) {output.push(source);continue;}
    const modes=source.segmentModes, ranges=[]; let start=0;
    for(let i=1;i<modes.length;i++)if(modes[i]!==modes[i-1]){ranges.push([start,i,modes[i-1]]);start=i;}
    ranges.push([start,modes.length,modes.at(-1)]);
    if(plan.series.length+added+ranges.length-1>32 || ranges.some(([a,b,m])=>m==='smooth' && source.points.slice(a,b+1).some((p,i,ps)=>i && (p.x-ps[i-1].x)*(ps.at(-1).x-ps[0].x)<=0))) {output.push(source);continue;}
    const parts=ranges.map(([a,b,mode],i)=> {
      const reverse=source.points[b].x<source.points[a].x, points=source.points.slice(a,b+1);
      const s={...clone(source),id:`${source.id}-process-${i+1}`,points:reverse?points.reverse():points,closed:false,breaks:[],endpoints:[],curveStyle:mode==='line'?'straight':'smooth',arrowSpecs:[],processSource:{seriesId:source.id,startIndex:a,endIndex:b,reverse}};
      delete s.segmentModes; delete s.candidateFamily; delete s.relationAnchors;
      if(mode==='smooth')s.physicsModel={kind:'endpoint-power'};
      for(const arrow of source.arrowSpecs || [])if(arrow.segmentIndex>=a && arrow.segmentIndex<b) {
        if(mode==='line')s.arrowSpecs.push({...arrow,segmentIndex:reverse?b-arrow.segmentIndex-1:arrow.segmentIndex-a,t:reverse?1-arrow.t:arrow.t,dir:reverse?-arrow.dir:arrow.dir});
        else {const p=source.points[arrow.segmentIndex],q=source.points[arrow.segmentIndex+1];s.arrowSpecs.push({x:p.x+(q.x-p.x)*arrow.t,dir:reverse?-arrow.dir:arrow.dir,...(arrow.strokeWidth===undefined?{}:{strokeWidth:arrow.strokeWidth})});}
      }
      return s;
    });
    // If a process cannot be represented and measured, retain the whole path.
    // This is atomic so labels/region references cannot be left dangling.
    if(parts.some(s=>s.physicsModel && !measured(s,plan)) || (plan.regions || []).some(r=>r.upperSeriesId===source.id || r.lowerSeriesId===source.id)) {output.push(source);continue;}
    const owner = index => parts.find(s=>s.physicsModel && index>=s.processSource.startIndex && index<=s.processSource.endIndex)
      || parts.find(s=>index>=s.processSource.startIndex && index<=s.processSource.endIndex);
    // The repeated closing vertex has the same identity as the first vertex.
    const sameVertex = i => i===0 && source.points.at(-1).x===source.points[0].x && source.points.at(-1).y===source.points[0].y ? source.points.length-1 : i;
    const vertexOwner = i => owner(sameVertex(i));
    for(const part of parts.filter(s=>!s.physicsModel)) {
      part.vertexBindings=[];
      for(const [index,sourceIndex] of [[0,part.processSource.reverse?part.processSource.endIndex:part.processSource.startIndex],[part.points.length-1,part.processSource.reverse?part.processSource.startIndex:part.processSource.endIndex]]) {
        const bound=vertexOwner(sourceIndex);if(bound.physicsModel)part.vertexBindings.push({index,seriesId:bound.id,anchorX:source.points[sourceIndex].x});
      }
    }
    for(const annotation of plan.annotations || [])if(annotation.seriesId===source.id && Number.isInteger(annotation.pointIndex)) {
      const i=annotation.pointIndex, part=vertexOwner(i), linked=sameVertex(i);
      annotation.seriesId=part.id; annotation.pointIndex=part.processSource.reverse?part.processSource.endIndex-linked:linked-part.processSource.startIndex;
    }
    for(const endpoint of source.endpoints || []) {
      const i=endpoint.index, part=vertexOwner(i), linked=sameVertex(i), p=source.points[i];
      const id=`${source.id}-endpoint-${i}`;
      if((plan.annotations || []).some(a=>a.id===id))continue;
      plan.annotations.push({id,kind:'point',text:'',orientation:'horizontal',...p,coordinateSpace:'data',axis:source.axis || 'y',endStyle:endpoint.kind,...(endpoint.markerSize?{markerSize:endpoint.markerSize}:{}),
        ...(endpoint.fillLevel===undefined?{}:{fillLevel:endpoint.fillLevel}),
        seriesId:part.id,pointIndex:part.processSource.reverse?part.processSource.endIndex-linked:linked-part.processSource.startIndex});
    }
    added+=parts.length-1;output.push(...parts);
  }
  plan.series=output;
}

export function restorePhysicsRelations(input) {
  const relevant=(input.series || []).some(s=>s.physicsModel || s.curveStyle==='smooth' && (s.endpoints?.length || (input.annotations || []).some(a=>a.kind==='arrow' || a.kind==='point' && a.seriesId===s.id && Number.isInteger(a.pointIndex)) || ['power-inverse','power-inverse-square','power-inverse-sqrt','power-sqrt','power-square'].includes(s.candidateFamily)) || s.closed && s.segmentModes?.includes('line') && s.segmentModes.includes('smooth') && /부피|volume/i.test(input.axes?.x?.title) && /압력|pressure/i.test(input.axes?.y?.title));
  if(!relevant)return {plan:input,conversions:[],rejected:[]};
  const plan=relativeCoordinates(input); if(!plan)return {plan:input,conversions:[],rejected:[]};
  splitProcesses(plan);
  restoreTrajectories(plan);
  restoreRelativePowers(plan);
  const conversions=[],rejected=[];
  for(const s of plan.series) {
    if(s.kind!=='points' || !s.physicsModel || s.closed || s.breaks?.length || s.handlesMath || s.lineVisible===false || s.markerShape && s.markerShape!=='none')continue;
    let m=measured(s,plan);
    if(!m && s.physicsModel.kind==='tangent-quadratic' && s.physicsModel.orientation==='vertical') {
      const at=s.physicsModel.tangentAt,a=s.points[at==='start'?0:s.points.length-1],b=s.points[at==='start'?s.points.length-1:0];
      const dx=b.x-a.x,dy=b.y-a.y;let numerator=0,denominator=0;
      for(const p of s.points) {
        const t=Math.sqrt((p.x-a.x)/dx),basis=t-t*t;
        numerator+=basis*(p.y-a.y-dy*t*t);denominator+=basis*basis;
      }
      const speed=numerator/denominator,neighbor=s.points[at==='start'?1:s.points.length-2];
      const candidates=[Math.round(speed*2)/2,Math.round(speed*4)/4,Math.round(speed*10)/10,Number(num(speed))];
      for(const value of candidates) {
        if(!Number.isFinite(value) || value*(neighbor.y-a.y)<=0)continue;
        const candidate={...s,physicsModel:{...s.physicsModel,tangentSpeed:value}},fit=measured(candidate,plan);
        if(fit){s.physicsModel=candidate.physicsModel;m=fit;break;}
      }
    }
    if(!m && s.physicsModel.kind==='endpoint-power') {
      let best=null;
      for(const exponent of [-2,-1.5,-1,-.5,.5,1,1.5,2]) {
        const candidate={...s,physicsModel:{...s.physicsModel,exponent}},fit=measured(candidate,plan);
        if(fit && (!best || fit.rmsDeviation<best.fit.rmsDeviation))best={candidate,fit};
      }
      if(best){s.physicsModel=best.candidate.physicsModel;m=best.fit;}
    }
    if(!m){rejected.push({seriesId:s.id,reason:'합성 항 또는 과정의 기준 관계가 관찰과 맞는지 추가 확인이 필요합니다.'});continue;}
    const points=clone(s.points);
    s.arrowSpecs=(s.arrowSpecs || []).map(a=>Number.isFinite(a.x)?a:{x:points[a.segmentIndex].x+(points[a.segmentIndex+1].x-points[a.segmentIndex].x)*a.t,dir:a.dir,...(a.strokeWidth===undefined?{}:{strokeWidth:a.strokeWidth})});
    for(const a of plan.annotations || [])if(a.seriesId===s.id && Number.isInteger(a.pointIndex)) {
      const p=points[a.pointIndex]; if(!p)continue;
      a.anchorX=a.coordinateSpace==='normalized'?(p.x-plan.axes.x.min)/(plan.axes.x.max-plan.axes.x.min):p.x;
      a.sourcePointIndex=a.pointIndex; delete a.pointIndex;
    }
    // Indexed endpoints become formula contacts, which rebind after editing.
    for(const e of s.endpoints || []) {const p=points[e.index];plan.annotations.push({id:`${s.id}-endpoint-${e.index}`,kind:'point',text:'',orientation:'horizontal',...p,anchorX:p.x,sourcePointIndex:e.index,coordinateSpace:'data',seriesId:s.id,axis:s.axis || 'y',endStyle:e.kind,...(e.markerSize?{markerSize:e.markerSize}:{}),...(e.fillLevel===undefined?{}:{fillLevel:e.fillLevel})});}
    s.kind='expression'; s.expression=m.expression; s.domain={min:points[0].x,max:points.at(-1).x};s.observedPoints=points;
    s.approximation={provenance:'image-fit',method:RELATION_FIT_VERSION,errorSpace:'normalized-display-distance',sourceCurveStyle:s.curveStyle || 'smooth',coefficientSource:m.coefficientSource,
      maxDeviation:m.maxDeviation,rmsDeviation:m.rmsDeviation,bias:m.bias,anchorDeviation:m.anchorDeviation,anchors:m.anchors};
    delete s.points;delete s.endpoints;delete s.segmentModes;delete s.fit;delete s.candidateExpression;delete s.candidateFamily;delete s.analyticFitFailure;
    conversions.push({seriesId:s.id,expression:s.expression,family:s.physicsModel.kind,maxDeviation:m.maxDeviation,rmsDeviation:m.rmsDeviation});
  }
  return {plan,conversions,rejected};
}

export function checkPhysicsRelationApproximation(series,plan) {
  const a=series.approximation;
  if(a?.method!==RELATION_FIT_VERSION || a.provenance!=='image-fit' || series.certainty!=='observed' || series.coordinateSpace!=='data' || a.errorSpace!=='normalized-display-distance' || series.closed || series.breaks?.length || series.lineVisible===false || series.markerShape && series.markerShape!=='none' || series.handlesMath || series.endpoints?.length || series.segmentModes?.length)return {ok:false,reason:'Invalid physics relation provenance'};
  const points=series.observedPoints;
  if(!points || points.length<2 || points.length>512 || series.domain?.min!==points[0].x || series.domain?.max!==points.at(-1).x)return {ok:false,reason:'Invalid physics relation observations/domain'};
  const m=measured(series,plan);
  if(!m || m.expression!==series.expression || a.coefficientSource!==m.coefficientSource || a.sourceCurveStyle!==(series.curveStyle || 'smooth') || JSON.stringify(a.anchors)!==JSON.stringify(m.anchors) || ['maxDeviation','rmsDeviation','bias','anchorDeviation'].some(k=>Math.abs(a[k]-m[k])>1e-6 || !Number.isFinite(a[k])))return {ok:false,reason:'Saved formula is not reproduced by the stated relations'};
  try {compile(series.expression);}catch{return {ok:false,reason:'Invalid relation expression'};}
  return {ok:true,...m};
}
