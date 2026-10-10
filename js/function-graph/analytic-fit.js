/* Image observations remain observations. A small, bounded formula may become
 * the editable source only after comparison in DISPLAY coordinates. No units,
 * axis ranges or physical law are inferred here. */
import { compile } from './parser.js?v=1.7.0-four-session-integration';
import { shapePreservingHandles, sampleShapeSegment } from './shape-preserving.js?v=1.7.0-four-session-integration';
import { calibrateTickUnits, fitPhysicsGraphPlan, checkPhysicsApproximation, PHYSICS_FIT_VERSION } from './physics-fit.js?v=1.7.0-four-session-integration';

import { restorePhysicsRelations, checkPhysicsRelationApproximation, RELATION_FIT_VERSION } from './physics-relations.js?v=1.7.0-four-session-integration';

import { fitRelationAnalyticPlan, checkRelationAnalyticApproximation, RELATION_ANALYTIC_FIT_VERSION } from './relation-analytic-fit.js?v=1.7.0-four-session-integration';

export const ANALYTIC_FIT_VERSION = 'simple-image-fit-v1';
export const ANALYTIC_MAX_DEVIATION = 0.008;
const clone = v => JSON.parse(JSON.stringify(v));
const n = v => Number.isFinite(v) ? String(Number(v.toFixed(7))) : '0';
// Axis constants are measured calibration, not fitted display coefficients.
// Preserve round-trip precision; the existing parser has no scientific notation.
const axisNumber = v => {
  if(!Number.isFinite(v))throw Error('Invalid axis constant');
  const value=String(v);if(!/[eE]/.test(value))return value;
  const [mantissa,exponent]=value.toLowerCase().split('e'),negative=mantissa.startsWith('-'),body=negative?mantissa.slice(1):mantissa;
  const [whole,fraction='']=body.split('.'),digits=whole+fraction,place=whole.length+Number(exponent);
  return (negative?'-':'')+(place<=0?'0.'+'0'.repeat(-place)+digits:place>=digits.length?digits+'0'.repeat(place-digits.length):digits.slice(0,place)+'.'+digits.slice(place));
};
const positiveAxis = a => a && Number.isFinite(a.min) && a.max > a.min && (a.scale !== 'log' || a.min > 0);
const normalize = (v, a) => a.scale === 'log' ? (Math.log(v)-Math.log(a.min)) / (Math.log(a.max)-Math.log(a.min)) : (v - a.min) / (a.max - a.min);

export function normalizedExpressionToData(expression, axes, axis = 'y') {
  const ax = axes.x, ay = axes[axis];
  if (!positiveAxis(ax) || !positiveAxis(ay)) throw Error('Numeric axis calibration is required');
  const nx = ax.scale === 'log' ? `((ln(x)-ln(${axisNumber(ax.min)}))/(ln(${axisNumber(ax.max)})-ln(${axisNumber(ax.min)})))` : `((x-(${axisNumber(ax.min)}))/${axisNumber(ax.max - ax.min)})`;
  const body = expression.replace(/\bx\b/g, nx);
  return ay.scale === 'log' ? `exp(ln(${axisNumber(ay.min)})+(ln(${axisNumber(ay.max)})-ln(${axisNumber(ay.min)}))*(${body}))` : `${axisNumber(ay.min)}+${axisNumber(ay.max - ay.min)}*(${body})`;
}
function candidateInDisplaySpace(series,plan) {
  if(typeof series.candidateExpression!=='string'||series.coordinateSpace==='normalized')return series;
  const dataX=normalizedExpressionToData('x',{x:{scale:'linear',min:0,max:1},y:plan.axes.x}),body=series.candidateExpression.replace(/\bx\b/g,`(${dataX})`),ay=plan.axes[series.axis];
  const expression=ay.scale==='log'?`((ln(${body})-ln(${axisNumber(ay.min)}))/(ln(${axisNumber(ay.max)})-ln(${axisNumber(ay.min)})))`:`((${body})-(${axisNumber(ay.min)}))/${axisNumber(ay.max-ay.min)}`;
  return {...series,candidateExpression:expression};
}

function displayPoints(series, plan, source = series.points) {
  if (series.coordinateSpace === 'normalized') return source.map(p => ({x:p.x,y:p.y}));
  if (!positiveAxis(plan.axes.x) || !positiveAxis(plan.axes[series.axis])) return null;
  return source.map(p => ({x:normalize(p.x, plan.axes.x),y:normalize(p.y,plan.axes[series.axis])}));
}
function displayEvaluator(expression, series, plan) {
  const f = compile(expression);
  if (series.coordinateSpace === 'normalized') return f;
  const ax = plan.axes.x, ay = plan.axes[series.axis];
  return x => normalize(f(ax.scale === 'log' ? Math.exp(Math.log(ax.min)+(Math.log(ax.max)-Math.log(ax.min))*x) : ax.min + (ax.max - ax.min) * x), ay);
}

function solve(points, bases) {
  const k = bases.length, m = Array.from({length:k}, () => Array(k + 1).fill(0));
  for (const p of points) {
    const b = bases.map(f => f(p.x));
    if (!b.every(Number.isFinite)) return null;
    for (let i=0;i<k;i++) { for(let j=0;j<k;j++) m[i][j]+=b[i]*b[j]; m[i][k]+=b[i]*p.y; }
  }
  for(let i=0;i<k;i++) {
    let row=i; for(let j=i+1;j<k;j++)if(Math.abs(m[j][i])>Math.abs(m[row][i]))row=j;
    if(Math.abs(m[row][i])<1e-11)return null;
    [m[i],m[row]]=[m[row],m[i]];
    const pivot=m[i][i]; for(let j=i;j<=k;j++)m[i][j]/=pivot;
    for(let r=0;r<k;r++)if(r!==i){const q=m[r][i];for(let j=i;j<=k;j++)m[r][j]-=q*m[i][j];}
  }
  const coefficients=m.map(row=>row[k]);
  return coefficients.every(v=>Number.isFinite(v)&&Math.abs(v)<1e5)?coefficients:null;
}
const equation = (c, terms) => c.map((v,i) => `(${n(v)})${terms[i] ? `*(${terms[i]})` : ''}`).join('+');
const errorAt = (points, f) => {
  let maxDeviation=0,sum=0;
  for(const p of points){const d=Math.abs(f(p.x)-p.y);if(!Number.isFinite(d))return {maxDeviation:Infinity,rmsDeviation:Infinity};maxDeviation=Math.max(maxDeviation,d);sum+=d*d;}
  return {maxDeviation,rmsDeviation:Math.sqrt(sum/points.length)};
};
function referenceSamples(points, series, dense=false) {
  const smooth = series.curveStyle==='smooth', handles=smooth?shapePreservingHandles(points,series.segmentModes||[]):null;
  const samples=[];
  const span=points.at(-1).x-points[0].x;
  for(let i=0;i<points.length-1;i++) {
    const count=dense?Math.max(8,Math.ceil(997*(points[i+1].x-points[i].x)/span)):8;
    const phases=Array.from({length:count},(_,j)=>j/count);
    // Nonuniform irrational phases prevent a sinusoid from aliasing every
    // regular probe. They are comparison probes, never editable observations.
    if(dense)phases.push(.211324865405187,.618033988749895,.788675134594813);
    phases.sort((a,b)=>a-b);
    for(const t of phases)samples.push(smooth?sampleShapeSegment(points,handles,i,t,series.segmentModes):{x:points[i].x+(points[i+1].x-points[i].x)*t,y:points[i].y+(points[i+1].y-points[i].y)*t});
  }
  samples.push(points.at(-1));return samples;
}
function extrema(points, threshold=0.003) {
  // Ignore smaller-than-ink noise, but retain every meaningful peak/valley.
  const found=[];let sign=0,start=points[0];
  for(let i=1;i<points.length;i++) {
    const d=points[i].y-start.y;if(Math.abs(d)<threshold)continue;
    const next=Math.sign(d);
    if(sign&&next!==sign)found.push({x:points[i-1].x,kind:sign});
    sign=next;start=points[i];
  }
  return found;
}
function assess(expression, points, reference, tolerance) {
  let f;try{f=compile(expression);}catch{return null;}
  return assessFunction(f,points,reference,tolerance);
}
function assessFunction(f,points,reference,tolerance) {
  const e=errorAt(points,f);if(e.maxDeviation>tolerance)return null;
  // Test the in-between curve too: a high-degree interpolation at anchors alone
  // must never pass. The reference is the existing shape-preserving renderer.
  const dense=errorAt(reference,f);if(dense.maxDeviation>Math.max(tolerance*1.8,0.012))return null;
  const old=extrema(reference), next=extrema(reference.map(p=>({x:p.x,y:f(p.x)})));
  if(old.length!==next.length||old.some((p,i)=>p.kind!==next[i].kind||Math.abs(p.x-next[i].x)>0.025))return null;
  return {...e,interiorMaxDeviation:dense.maxDeviation,f};
}

function fitCandidates(points, series, tolerance, diagnostics={}, allowedFamilies=null) {
  const reference=referenceSamples(points,series), candidates=[];
  const add=(family,complexity,expression)=>{if(expression.length>300 || allowedFamilies && !allowedFamilies.includes(family))return;try{const e=errorAt(points,compile(expression));if(e.maxDeviation<(diagnostics.bestMaxDeviation??Infinity))Object.assign(diagnostics,{bestFamily:family,bestMaxDeviation:e.maxDeviation,bestRmsDeviation:e.rmsDeviation});}catch{}const a=assess(expression,points,reference,tolerance);if(a)candidates.push({family,complexity,expression,...a});};
  const fit=(family,complexity,bases,terms)=>{const c=solve(points,bases);if(c)add(family,complexity,equation(c,terms));};
  // Straight polylines are not silently rounded; only one actual line qualifies.
  fit('linear',1,[()=>1,x=>x],['','x']);
  if(series.curveStyle!=='smooth')return candidates.sort((a,b)=>a.complexity-b.complexity||a.maxDeviation-b.maxDeviation)[0]||null;
  if(typeof series.candidateExpression==='string'&&series.candidateExpression.length<=240)add('simple-proposal',5,series.candidateExpression);
  if(points.length>=6)fit('quadratic',2,[()=>1,x=>x,x=>x*x],['','x','x^2']);
  if(points.length>=7)fit('cubic',4,[()=>1,x=>x,x=>x*x,x=>x*x*x],['','x','x^2','x^3']);
  if(points.length>=7) {
    const lo=points[0].x,hi=points.at(-1).x,span=hi-lo;
    for(const direction of [-1,1])for(let j=0;j<30;j++) {
      const pole=direction<0?lo-span*(0.05+j*0.1):hi+span*(0.05+j*0.1);
      for(const power of [1,2])fit(power===1?'reciprocal':'inverse-square',3,[()=>1,x=>1/(x-pole)**power],['',`1/(x-(${n(pole)}))^${power}`]);
    }
    for(let j=-32;j<=32;j++)if(j) {
      const rate=j/4/span;
      fit('exponential',3,[()=>1,x=>Math.exp(rate*(x-lo))],['',`exp((${n(rate)})*(x-(${n(lo)})))`]);
    }
    // Saturation and peaked periodic families have only a few readable constants.
    // The search is deliberately bounded; failed matching preserves free curves.
    const coarse=points.length>80?points.filter((_,i)=>i%Math.ceil(points.length/80)===0||i===points.length-1):points;
    const refine=(family,initial,steps,basis,term,allowed)=>{
      const score=params=>{if(!allowed(params))return null;let c=solve(coarse,[()=>1,x=>basis(x,params)]);if(family.startsWith('saturation-')){const first=coarse[0],last=coarse.at(-1),b0=basis(first.x,params),b1=basis(last.x,params);if(Math.abs(b1-b0)<1e-8)return null;const amplitude=(last.y-first.y)/(b1-b0);c=[first.y-amplitude*b0,amplitude];}if(!c)return null;const e=errorAt(coarse,x=>c[0]+c[1]*basis(x,params));return {params,c,score:.65*e.maxDeviation+.35*e.rmsDeviation};};
      let best=score(initial);if(!best)return;
      for(let round=0;round<32;round++) {
        let improved=false;
        for(let i=0;i<steps.length;i++)for(const dir of [-1,1]){const params=[...best.params];params[i]+=dir*steps[i];const trial=score(params);if(trial&&trial.score<best.score){best=trial;improved=true;}}
        if(!improved)steps=steps.map(v=>v/2);
      }
      add(family,family==='saturation-origin'?2:family.startsWith('saturation-')?3:5,equation(best.c,['',term(best.params)]));
    };
    const peaks=extrema(reference).filter(e=>e.kind>0), frequencySet=new Set();
    if(points[0].y>points[1].y+0.003)peaks.unshift({x:points[0].x,kind:1});
    for(let i=1;i<peaks.length;i++)frequencySet.add(2*Math.PI/(peaks[i].x-peaks[i-1].x));
    for(let cycles=0.5;cycles<=5;cycles+=0.125)frequencySet.add(2*Math.PI*cycles/span);
    for(const omega of frequencySet) {
      const sin=x=>Math.sin(omega*x),cos=x=>Math.cos(omega*x);
      const c=solve(points,[()=>1,sin,cos]);
      if(c)add('sinusoidal',3,equation(c,['',`sin(${n(omega)}*x)`,`cos(${n(omega)}*x)`]));
      if(c && allowedFamilies?.includes('sinusoidal')) {
        // Relative textbook waves use amplitude/period/phase, not tracing digits.
        // Try short constants first, but accept only after the same dense checks.
        const simple = v => { const eighth=Math.round(v*8)/8; return Math.abs(v-eighth)<tolerance/2?eighth:Number(v.toPrecision(2)); };
        const amplitude=simple(Math.hypot(c[1],c[2])), offset=simple(c[0]);
        const phase=Math.atan2(c[2],c[1]), ratio=Math.round(omega/Math.PI*4)/4, phaseRatio=Math.round(phase/Math.PI*4)/4;
        if(Math.abs(omega-ratio*Math.PI)<.1 && Math.abs(phase-phaseRatio*Math.PI)<.04) add('sinusoidal',1,`${n(offset)}+${n(amplitude)}*sin(${n(ratio)}*pi*x${phaseRatio?`+(${n(phaseRatio)}*pi)`:''})`);
      }
      const phases=peaks.length?peaks.slice(0,2).map(p=>-omega*p.x):[0,Math.PI/2,Math.PI,3*Math.PI/2];
      for(const phase of phases)for(const sharpness of [0.2,0.4,0.6,0.75,0.85,0.92])for(const power of [1,2]) {
        const basis=x=>1/(1-sharpness*Math.cos(omega*x+phase))**power;
        const coeff=solve(coarse,[()=>1,basis]);
        if(coeff){const expr=equation(coeff,['',`1/(1-${n(sharpness)}*cos(${n(omega)}*x+(${n(phase)})))^${power}`]);add('periodic-peaks',5,expr);}
      }
    }
    // Refine frequencies derived from actual repeated extrema, not a guessed
    // high frequency. Only four bounded nonlinear parameters are adjusted.
    const peakOmega=peaks.length>1?2*Math.PI/(peaks.at(-1).x-peaks[0].x)*(peaks.length-1):null;
    if(peakOmega)for(const harmonics of [3,4])for(let step=-16;step<=16;step++) {
      const omega=peakOmega*(1+step*.001),bases=[()=>1];
      for(let k=1;k<=harmonics;k++)bases.push(x=>Math.cos(k*omega*x),x=>Math.sin(k*omega*x));
      const c=solve(points,bases);if(!c)continue;
      let expression=`(${n(c[0])})`;
      for(let k=1;k<=harmonics;k++){const amplitude=Math.hypot(c[k*2-1],c[k*2]),phase=-Math.atan2(c[k*2],c[k*2-1]);if(amplitude>1e-6)expression+=`+${n(amplitude)}*cos(${n(k*omega)}*x+(${n(phase)}))`;}
      add('periodic-harmonics',2+harmonics*2,expression);
    }
    if(peakOmega)for(const k of [0.4,0.7,0.9])for(const power of [0.5,1,2,3])refine('periodic-peaks',[peakOmega,-peakOmega*peaks[0].x,k,power],[peakOmega*0.02,0.06,0.05,0.2],(x,[w,phase,q,p])=>1/(1-q*Math.cos(w*x+phase))**p,([w,phase,q,p])=>`1/(1-${n(q)}*cos(${n(w)}*x+(${n(phase)})))^${n(p)}`,([w,,q,p])=>w>0&&w<2*Math.PI*8/span&&q>0.05&&q<0.96&&p>0.2&&p<6);
    if(peakOmega)for(const warp of [-0.5,0,0.5])for(const sharpness of [0.5,0.8])refine('periodic-peaks',[peakOmega,-peakOmega*peaks[0].x,sharpness,1,warp],[peakOmega*0.015,0.03,0.04,0.15,0.08],(x,[w,phase,q,p,k])=>{const t=w*x+phase;return 1/(1-q*Math.cos(t+k*Math.sin(t)))**p;},([w,phase,q,p,k])=>`1/(1-${n(q)}*cos(${n(w)}*x+(${n(phase)})+${n(k)}*sin(${n(w)}*x+(${n(phase)}))))^${n(p)}`,([w,,q,p,k])=>w>0&&w<2*Math.PI*8/span&&q>0.05&&q<0.96&&p>0.2&&p<6&&Math.abs(k)<0.9);
    if(peakOmega)for(const width of [2,5,10,20])for(const power of [1,2,3,4])refine('periodic-peaks',[peakOmega,-peakOmega*peaks[0].x,width,power],[peakOmega*.015,.03,1,.15],(x,[w,phase,k,p])=>Math.exp(-k*Math.abs(Math.sin((w*x+phase)/2))**p),([w,phase,k,p])=>`exp(-${n(k)}*abs(sin((${n(w)}*x+(${n(phase)}))/2))^${n(p)})`,([w,,k,p])=>w>0&&w<2*Math.PI*8/span&&k>.1&&k<150&&p>.5&&p<8);
    if(peakOmega)for(const width of [3,10,30])for(const power of [1,2,3])for(const tail of [.5,1,2])refine('periodic-peaks',[peakOmega,-peakOmega*peaks[0].x,width,power,tail],[peakOmega*.015,.03,1,.15,.1],(x,[w,phase,k,p,q])=>1/(1+k*Math.abs(Math.sin((w*x+phase)/2))**p)**q,([w,phase,k,p,q])=>`1/(1+${n(k)}*abs(sin((${n(w)}*x+(${n(phase)}))/2))^${n(p)})^${n(q)}`,([w,,k,p,q])=>w>0&&w<2*Math.PI*8/span&&k>.1&&k<200&&p>.5&&p<6&&q>.2&&q<5);
    if(peakOmega)for(const q0 of [.4,.7,.9])for(const p0 of [.5,1,2,3]) {
      const basis=(x,[w,phase,q,p])=>1/(1-q*Math.cos(w*x+phase))**p;
      const score=params=>{const [w,,q,p]=params;if(w<=0||q<.05||q>.96||p<.2||p>6)return null;const c=solve(coarse,[()=>1,x=>basis(x,params),x=>Math.sqrt(basis(x,params))]);if(!c)return null;const e=errorAt(coarse,x=>c[0]+c[1]*basis(x,params)+c[2]*Math.sqrt(basis(x,params)));return {params,c,score:.65*e.maxDeviation+.35*e.rmsDeviation};};
      let best=score([peakOmega,-peakOmega*peaks[0].x,q0,p0]),steps=[peakOmega*.015,.03,.03,.15];if(!best)continue;
      for(let round=0;round<32;round++){let improved=false;for(let i=0;i<4;i++)for(const dir of [-1,1]){const params=[...best.params];params[i]+=dir*steps[i];const trial=score(params);if(trial&&trial.score<best.score){best=trial;improved=true;}}if(!improved)steps=steps.map(s=>s/2);}
      const [w,phase,q,p]=best.params,den=`1-${n(q)}*cos(${n(w)}*x+(${n(phase)}))`;
      add('periodic-peaks',6,equation(best.c,['',`1/(${den})^${n(p)}`,`1/(${den})^${n(p/2)}`]));
    }
    const clampTerm=([a,width])=>`((abs((x-(${n(a)}))/${n(width)})-abs((x-(${n(a)}))/${n(width)}-1)+1)/2)`;
    const clamp=(x,[a,width])=>Math.max(0,Math.min(1,(x-a)/width));
    for(const width of [span*0.5,span*0.75,span]) {
      refine('saturation-cosine',[lo,width],[span*0.02,span*0.03],(x,p)=>(1-Math.cos(Math.PI*clamp(x,p)))/2,p=>`(1-cos(pi*${clampTerm(p)}))/2`,([a,w])=>a>lo-span*.3&&a<hi&&w>span*.2&&w<span*1.5);
      refine('saturation-cubic',[lo,width],[span*0.02,span*0.03],(x,p)=>{const t=clamp(x,p);return 3*t*t-2*t*t*t;},p=>`(3*${clampTerm(p)}^2-2*${clampTerm(p)}^3)`,([a,w])=>a>lo-span*.3&&a<hi&&w>span*.2&&w<span*1.5);
      for(const power of [0.6,1,1.5])refine('saturation-origin',[width,power],[span*.025,.07],(x,[w,p])=>((1-Math.cos(Math.PI*Math.max(0,Math.min(1,(x-lo)/w))))/2)**p,([w,p])=>`((1-cos(pi*${clampTerm([lo,w])}))/2)^${n(p)}`,([w,p])=>w>span*.2&&w<span*1.5&&p>.51&&p<3);
    }
    for(let rate=2;rate<=30;rate+=2)for(let center=lo;center<=hi;center+=span/16)fit('saturation',4,[()=>1,x=>Math.tanh(rate*(x-center)/span)],['',`tanh(${n(rate/span)}*(x-(${n(center)})))`]);
  }
  // A genuinely matching small polynomial is easier to edit than a different
  // family that merely sneaks under the acceptance threshold. This is still
  // image-fit provenance, never a declaration of an exact physical law.
  const rank=c=>c.complexity-(c.maxDeviation<1e-5?2:0);
  return candidates.sort((a,b)=>rank(a)-rank(b)||a.maxDeviation-b.maxDeviation)[0]||null;
}

export function checkAnalyticApproximation(series, plan) {
  if(series?.approximation?.method===RELATION_ANALYTIC_FIT_VERSION)return checkRelationAnalyticApproximation(series,plan);
  if(series?.approximation?.method===RELATION_FIT_VERSION)return checkPhysicsRelationApproximation(series,plan);
  if(series?.approximation?.method===PHYSICS_FIT_VERSION)return checkPhysicsApproximation(series,plan);
  const a=series.approximation;
  if(!a||a.provenance!=='image-fit'||a.method!==ANALYTIC_FIT_VERSION||series.certainty!=='observed'||!Array.isArray(series.observedPoints)||series.observedPoints.length<2||series.observedPoints.length>4096)return {ok:false,reason:'Approximate formula requires bounded image observations and provenance'};
  if(!Number.isFinite(a.tolerance)||a.tolerance<=0||a.tolerance>ANALYTIC_MAX_DEVIATION||!Number.isFinite(a.maxDeviation)||!Number.isFinite(a.rmsDeviation)||!Number.isFinite(a.interiorMaxDeviation)||a.maxDeviation<0||a.rmsDeviation<0||a.interiorMaxDeviation<0||a.maxDeviation>a.tolerance||a.rmsDeviation>a.maxDeviation+1e-8||a.errorSpace!=='normalized-display'||!['straight','smooth'].includes(a.sourceCurveStyle)||typeof series.expression!=='string'||series.expression.length>2048)return {ok:false,reason:'Invalid display-coordinate fitting error'};
  const observations=series.observedPoints;
  if(observations.some((p,i)=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||i&&p.x<=observations[i-1].x)||!series.domain||series.domain.min!==observations[0].x||series.domain.max!==observations.at(-1).x)return {ok:false,reason:'Approximate domain must match an increasing observed function'};
  if(series.closed||series.lineVisible===false||series.markerShape&&series.markerShape!=='none'||series.breaks?.length||series.endpoints?.length||series.arrowSpecs?.length||series.handlesMath||series.segmentModes?.length)return {ok:false,reason:'Approximate expression cannot reinterpret discrete or indexed geometry'};
  try {
    const points=displayPoints(series,plan,series.observedPoints),f=displayEvaluator(series.expression,series,plan);
    if(!points||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.y<0||p.y>1))return {ok:false,reason:'Observation would be clipped by the expression renderer'};
    const reference=referenceSamples(points,{curveStyle:a.sourceCurveStyle},true),e=assessFunction(f,points,reference,a.tolerance);
    if(!e||Math.abs(e.maxDeviation-a.maxDeviation)>1e-6||Math.abs(e.rmsDeviation-a.rmsDeviation)>1e-6||Math.abs(e.interiorMaxDeviation-a.interiorMaxDeviation)>1e-6)return {ok:false,reason:'Formula does not match observations, interior shape, extrema or error report'};
    return {ok:true,...e};
  }catch{return {ok:false,reason:'Approximate formula is invalid'};}
}

function crossings(a,b,lo,hi,margin=0.003) {
  const found=[];let prev=null;
  for(let i=0;i<=256;i++){const x=lo+(hi-lo)*i/256,d=a(x)-b(x);if(!Number.isFinite(d))return null;const sign=Math.abs(d)<margin?0:Math.sign(d);if(sign&&prev&&sign!==prev.sign)found.push((prev.x+x)/2);if(sign)prev={sign,x};}return found;
}
function referenceEvaluator(points,series) {
  const dense=referenceSamples(points,series);let i=0;
  return x=>{while(i<dense.length-2&&dense[i+1].x<x)i++;while(i>0&&dense[i].x>x)i--;const a=dense[i],b=dense[i+1];return a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x);};
}

/* A caller may supply an approximate expression directly, without using the
 * fitter. Validate its relations against retained observations at that same
 * contract boundary, using the fitter's 0.003 ink deadband / 0.025 x limit. */
export function checkAnalyticIntersections(plan) {
  const entries=[],issues=[];
  for(const s of plan.series||[]) {
    if(s.closed||s.breaks?.length||s.lineVisible===false||!['points','expression'].includes(s.kind))continue;
    const approximate=s.kind==='expression'&&!!s.approximation;
    try {
      if(s.kind==='points'||approximate) {
        const points=displayPoints(s,plan,approximate?s.observedPoints:s.points);
        if(!points||points.length<2||points.some((p,i)=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||i&&p.x<=points[i-1].x))continue;
        const source={...s,curveStyle:approximate?s.approximation.sourceCurveStyle:s.curveStyle};
        const before=referenceEvaluator(points,source);
        entries.push({id:s.id,axis:s.axis,approximate,physics:approximate&&[PHYSICS_FIT_VERSION,RELATION_FIT_VERSION,RELATION_ANALYTIC_FIT_VERSION].includes(s.approximation.method),lo:points[0].x,hi:points.at(-1).x,before,after:approximate?displayEvaluator(s.expression,s,plan):before});
      } else if(s.domain) {
        const lo=s.coordinateSpace==='normalized'?s.domain.min:normalize(s.domain.min,plan.axes.x),hi=s.coordinateSpace==='normalized'?s.domain.max:normalize(s.domain.max,plan.axes.x),f=displayEvaluator(s.expression,s,plan);
        if(Number.isFinite(lo)&&Number.isFinite(hi)&&hi>lo)entries.push({id:s.id,axis:s.axis,approximate:false,lo,hi,before:f,after:f});
      }
    }catch { /* Invalid individual series are rejected by their own validator. */ }
  }
  for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++) {
    const a=entries[i],b=entries[j];
    if(a.axis!==b.axis||!a.approximate&&!b.approximate)continue;
    const lo=Math.max(a.lo,b.lo),hi=Math.min(a.hi,b.hi);if(hi-lo<0.02)continue;
    // Physics-family fits ignore tracing jitter; compare only ink-visible crossings.
    const physics=a.physics||b.physics,margin=physics?0.012:0.003,limit=physics?0.05:0.025;
    const before=crossings(a.before,b.before,lo,hi,margin),after=crossings(a.after,b.after,lo,hi,margin);
    if(!before||!after||before.length!==after.length||before.some((x,k)=>Math.abs(x-after[k])>limit))issues.push({seriesId:a.approximate?a.id:b.id,otherSeriesId:a.approximate?b.id:a.id,reason:'Approximate formula changes observed curve intersections'});
  }
  return {ok:issues.length===0,issues};
}

function preferGenericAnalyticPlan(input,{maxDeviation=ANALYTIC_MAX_DEVIATION,relativeSinusoids=false}={}) {
  const plan=clone(input),conversions=[],rejected=[],original=clone(plan.series||[]),originalAnnotations=clone(plan.annotations||[]),fitted=new Map();
  const tolerance=Math.min(ANALYTIC_MAX_DEVIATION,Math.max(0.0001,maxDeviation));
  for(const s of plan.series||[]) {
    if(s.kind!=='points'||s.certainty!=='observed')continue;
    if(relativeSinusoids && !['sinusoid'].includes(s.candidateFamily))continue;
    if(s.closed||s.breaks?.length||s.lineVisible===false||s.markerShape&&s.markerShape!=='none'||s.endpoints?.length||s.arrowSpecs?.length||s.handlesMath||s.segmentModes?.some(m=>m==='line')){rejected.push({seriesId:s.id,reason:'Discrete, closed, discontinuous or explicitly controlled geometry'});continue;}
    const points=displayPoints(s,plan);
    if(!points||points.length<2||points.length>512||points.some((p,i)=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||i&&p.x<=points[i-1].x)){rejected.push({seriesId:s.id,reason:'Not a bounded continuous single-valued function'});continue;}
    if(points.some(p=>p.y<0||p.y>1)){rejected.push({seriesId:s.id,reason:'Source extends beyond the value frame; retain unclipped geometry'});continue;}
    const diagnostics={},fit=fitCandidates(points,candidateInDisplaySpace(s,plan),tolerance,diagnostics,relativeSinusoids?['sinusoidal']:null);
    if(!fit){rejected.push({seriesId:s.id,reason:'No simple formula met shape and error limits',...diagnostics});continue;}
    const dense=assess(fit.expression,points,referenceSamples(points,s,true),tolerance);
    if(!dense){rejected.push({seriesId:s.id,reason:'Formula failed independent dense interior/extrema verification'});continue;}
    Object.assign(fit,dense);
    fitted.set(s.id,{fit,points});
  }
  // Check topology against other continuous curves before replacing any source.
  for(const [id,entry]of [...fitted]) {
    const source=original.find(s=>s.id===id);
    for(const other of original) {
      if(other.id===id||other.kind!=='points'||other.axis!==source.axis||other.closed||other.breaks?.length||other.lineVisible===false)continue;
      const q=displayPoints(other,plan);if(!q||q.length<2||q.some((p,i)=>i&&p.x<=q[i-1].x))continue;
      const lo=Math.max(entry.points[0].x,q[0].x),hi=Math.min(entry.points.at(-1).x,q.at(-1).x);if(hi-lo<0.02)continue;
      const refA=referenceEvaluator(entry.points,source),refB=referenceEvaluator(q,other),before=crossings(refA,refB,lo,hi),after=crossings(entry.fit.f,fitted.get(other.id)?.fit.f||refB,lo,hi);
      if(!before||!after||before.length!==after.length||before.some((x,i)=>Math.abs(x-after[i])>0.025)){fitted.delete(id);rejected.push({seriesId:id,reason:'Formula changes observed curve intersections'});break;}
    }
  }
  for(const s of plan.series||[]) {
    const entry=fitted.get(s.id);if(!entry)continue;
    const {fit}=entry,source=original.find(q=>q.id===s.id),expression=s.coordinateSpace==='data'?normalizedExpressionToData(fit.expression,plan.axes,s.axis):fit.expression;
    s.kind='expression';s.expression=expression;s.domain={min:source.points[0].x,max:source.points.at(-1).x};s.observedPoints=clone(source.points);
    s.approximation={provenance:'image-fit',method:ANALYTIC_FIT_VERSION,family:fit.family,tolerance,maxDeviation:fit.maxDeviation,rmsDeviation:fit.rmsDeviation,interiorMaxDeviation:fit.interiorMaxDeviation,errorSpace:'normalized-display',sourceCurveStyle:source.curveStyle||'straight'};
    if(relativeSinusoids) s.approximation.coefficientSource='relative-diagram-amplitude-period-phase';
    delete s.points;delete s.handlesMath;delete s.segmentModes;delete s.fit;delete s.candidateExpression;
    for(const a of plan.annotations||[])if(a.seriesId===s.id&&Number.isInteger(a.pointIndex)) {
      const contact=source.points[a.pointIndex];if(!contact)continue;
      // annotation coordinates may be normalized even when series coordinates are data.
      a.anchorX=a.coordinateSpace===s.coordinateSpace?contact.x:a.coordinateSpace==='normalized'?normalize(contact.x,plan.axes.x):plan.axes.x.scale==='log'?Math.exp(Math.log(plan.axes.x.min)+(Math.log(plan.axes.x.max)-Math.log(plan.axes.x.min))*contact.x):plan.axes.x.min+(plan.axes.x.max-plan.axes.x.min)*contact.x;
      a.sourcePointIndex=a.pointIndex;delete a.pointIndex;
    }
    conversions.push({seriesId:s.id,family:fit.family,maxDeviation:fit.maxDeviation,rmsDeviation:fit.rmsDeviation});
  }
  // The boundary also sees printed exact expressions as counterparts. If that
  // final comparison rejects a new fit, return its original editable curve
  // rather than handing the caller an invalid fitted plan.
  const reverted=new Set();
  for(let pass=0;pass<conversions.length;pass++) {
    const next=new Set();
    for(const issue of checkAnalyticIntersections(plan).issues)for(const id of [issue.seriesId,issue.otherSeriesId])if(!reverted.has(id)&&conversions.some(c=>c.seriesId===id))next.add(id);
    if(!next.size)break;
    plan.series=plan.series.map(s=>next.has(s.id)?clone(original.find(o=>o.id===s.id)):s);
    plan.annotations=(plan.annotations||[]).map(a=>next.has(a.seriesId)?clone(originalAnnotations.find(o=>o.id===a.id)||a):a);
    for(const id of next){reverted.add(id);rejected.push({seriesId:id,reason:'Formula changes observed curve intersections'});}
  }
  return {plan,conversions:conversions.filter(c=>!reverted.has(c.seriesId)),rejected};
}

/* Keep strict relation-derived models first. The bounded fallback then fixes
 * known contacts and estimates remaining coefficients from the observations.
 * Unknown physical laws are never promoted to exact certainty. Unsupported
 * paths retain their editable observations and a measured rejection reason. */
export function preferAnalyticGraphPlan(input,options={}) {
  if(input?.variant==='axis-break')return {plan:clone(input),conversions:[],rejected:[],calibration:null};
  const calibration=calibrateTickUnits(input);
  const relations=restorePhysicsRelations(calibration.plan);
  const physics=fitPhysicsGraphPlan(relations.plan);
  physics.conversions.unshift(...relations.conversions); physics.rejected.unshift(...relations.rejected);
  const inTickUnits=calibration.calibrated || ['x','y'].some(k=>physics.plan.axes?.[k]?.calibration?.method==='tick-label-units');
  const hasPhysicsIntent=options.requirePhysics===true || (physics.plan.series||[]).some(s=>s.candidateFamily!==undefined || s.relationAnchors?.length);
  if(hasPhysicsIntent && !inTickUnits)for(const s of physics.plan.series||[])if(s.kind==='points' && s.curveStyle==='smooth' && s.lineVisible!==false && !s.closed && !physics.rejected.some(r=>r.seriesId===s.id))physics.rejected.push({seriesId:s.id,reason:'기준점을 계산할 눈금 단위 또는 선형 좌표가 부족합니다.'});
  const relationFit=(inTickUnits||hasPhysicsIntent)?fitRelationAnalyticPlan(physics.plan):{plan:physics.plan,conversions:[],rejected:[]};
  const relativeSinusoids=options.relativeDiagrams===true && !inTickUnits && physics.plan.coordinateMode==='observed' && physics.plan.variant!=='axis-break';
  const generic=relativeSinusoids?preferGenericAnalyticPlan(relationFit.plan,{...options,relativeSinusoids:true}):inTickUnits||hasPhysicsIntent?{plan:relationFit.plan,conversions:[],rejected:[]}:preferGenericAnalyticPlan(relationFit.plan,options);
  // Snapshot each stage before it replaces geometry. A rejected formula must
  // recover its original indexed markers/arrows as well as its observation points.
  const rollbackSources=new Map();
  for(const stage of [relations.plan,physics.plan,relationFit.plan])for(const source of stage.series||[])if(source.kind==='points')rollbackSources.set(source.id,{series:clone(source),annotations:clone((stage.annotations||[]).filter(a=>a.seriesId===source.id))});
  const plan=generic.plan,converted=new Set([...relationFit.conversions,...generic.conversions].map(c=>c.seriesId));
  for(const r of [...physics.rejected,...relationFit.rejected]){const s=(plan.series||[]).find(q=>q.id===r.seriesId);if(s&&s.kind==='points'&&!converted.has(r.seriesId))s.analyticFitFailure=r.reason;}
  const conversions=[...physics.conversions,...relationFit.conversions,...generic.conversions],rejected=[...physics.rejected.filter(r=>!converted.has(r.seriesId)),...relationFit.rejected.filter(r=>!converted.has(r.seriesId)),...generic.rejected],reverted=new Set();
  for(let pass=0;pass<conversions.length;pass++) {
    const ids=new Set(checkAnalyticIntersections(plan).issues.flatMap(i=>[i.seriesId,i.otherSeriesId]).filter(id=>!reverted.has(id)&&conversions.some(c=>c.seriesId===id)));
    if(!ids.size)break;
    // Joint field branches share one validated model. Revert the group together
    // if either member changes its relation to a third curve.
    for(const id of [...ids])for(const peer of plan.series.find(s=>s.id===id)?.approximation?.model?.seriesIds||[])if(!reverted.has(peer)&&conversions.some(c=>c.seriesId===peer))ids.add(peer);
    for(const [index,s] of plan.series.entries())if(ids.has(s.id) && s.observedPoints) {
      const backup=rollbackSources.get(s.id);
      if(backup){
        plan.series[index]=clone(backup.series);
        plan.series[index].analyticFitFailure='기존 곡선의 교차 관계를 바꾸어 수식화를 보류했습니다.';
        plan.annotations=(plan.annotations||[]).filter(a=>a.seriesId!==s.id).concat(clone(backup.annotations));
        reverted.add(s.id);rejected.push({seriesId:s.id,reason:plan.series[index].analyticFitFailure});
        continue;
      }
      s.points=clone(s.observedPoints);s.kind='points';s.certainty='observed';s.curveStyle=s.approximation.sourceCurveStyle;
      s.arrowSpecs=(s.arrowSpecs || []).map(a=>{
        if(!Number.isFinite(a.x))return a;
        const j=Math.max(1,s.points.findIndex(p=>p.x>=a.x)),{x,...style}=a;
        return {...style,segmentIndex:j-1,t:(x-s.points[j-1].x)/(s.points[j].x-s.points[j-1].x)};
      });
      for(const a of plan.annotations || [])if(a.seriesId===s.id) {
        if(Number.isInteger(a.sourcePointIndex))a.pointIndex=a.sourcePointIndex;
        delete a.anchorX;delete a.sourcePointIndex;
      }
      for(const key of ['expression','domain','observedPoints','approximation','physicsModel','extremum'])delete s[key];
      s.analyticFitFailure='기존 곡선의 교차 관계를 바꾸어 수식화를 보류했습니다.';
      reverted.add(s.id);rejected.push({seriesId:s.id,reason:s.analyticFitFailure});
    }
  }
  return {plan,conversions:conversions.filter(c=>!reverted.has(c.seriesId)),rejected,calibration:calibration.calibrated?calibration.calibration:null};
}
