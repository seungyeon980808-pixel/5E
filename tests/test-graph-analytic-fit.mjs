import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { preferAnalyticGraphPlan, normalizedExpressionToData, checkAnalyticApproximation, checkAnalyticIntersections } from '../js/function-graph/analytic-fit.js';
import { compile } from '../js/function-graph/parser.js';
import { validateGraphPlan } from '../js/graph/reconstruction-contract.js';
import { buildNativeGraph } from '../js/graph/native-graph.js';
import { sampleFunctionPoints } from '../js/function-graph/sampler.js';

let count=0;
const test=(name,fn)=>{fn();count++;console.log(`PASS ${name}`);};
const fixture=name=>JSON.parse(readFileSync(new URL(`fixtures/graph-engine-coverage/${name}.json`,import.meta.url)));
const observations=(f,n=41)=>Array.from({length:n},(_,i)=>({x:i/(n-1),y:f(i/(n-1))}));
const base=f=>({schema:'5e.graph-reconstruction/v1',variant:'cartesian',coordinateMode:'observed',source:{id:'analytic-synthetic',hash:'synthetic-v1',width:700,height:500,plotBox:{x:70,y:50,w:560,h:400}},axisPlacement:{x:{mode:'fraction',value:0},y:{mode:'fraction',value:0}},axes:{x:{scale:'unknown',title:'시간',unit:'',min:null,max:null,step:null,ticks:[]},y:{scale:'unknown',title:'힘',unit:'',min:null,max:null,step:null,ticks:[]}},series:[{id:'s',kind:'points',axis:'y',certainty:'observed',coordinateSpace:'normalized',points:observations(f),curveStyle:'smooth',lineStyle:'solid',breaks:[],endpoints:[]}],annotations:[],review:[]});
const fit=p=>{const r=preferAnalyticGraphPlan(p);assert.equal(validateGraphPlan(r.plan).ok,true,JSON.stringify(validateGraphPlan(r.plan).errors));return r;};

test('simple line becomes an expression while exact source observations and units remain unchanged',()=>{
  const p=base(x=>.1+.7*x),before=JSON.stringify(p),r=fit(p),s=r.plan.series[0];assert.equal(s.kind,'expression');assert.equal(s.approximation.family,'linear');assert.equal(s.certainty,'observed');assert.deepEqual(s.observedPoints,p.series[0].points);assert.deepEqual(r.plan.axes,p.axes);assert.equal(JSON.stringify(p),before);assert.equal(s.points,undefined);assert(checkAnalyticApproximation(s,r.plan).ok);
});
test('quadratic has at most degree2 and retains meaningful extremum',()=>{const r=fit(base(x=>.2+2*(x-.5)**2));assert.equal(r.plan.series[0].approximation.family,'quadratic');assert(Math.abs(compile(r.plan.series[0].expression)(.5)-.2)<1e-5);});
test('a cubic curve is supported without generating a polynomial per observation',()=>{const r=fit(base(x=>.1+.3*x+.4*x**3));assert.equal(r.plan.series[0].approximation.family,'cubic');assert(r.plan.series[0].expression.length<160);});
test('reciprocal and exponential are readable short formulas',()=>{
  for(const f of [x=>.1+.3/(x+.5),x=>.2+.1*Math.exp(1.75*x)]){const r=fit(base(f));assert.equal(r.plan.series[0].kind,'expression');assert(r.plan.series[0].expression.length<200);assert(r.plan.series[0].approximation.maxDeviation<=.008);}
});
test('sinusoidal periodic curve matches extrema rather than flattening the samples',()=>{const r=fit(base(x=>.5+.3*Math.sin(4*Math.PI*x)));assert.equal(r.plan.series[0].kind,'expression');assert.equal(r.plan.series[0].approximation.family,'sinusoidal');});
test('sharp periodic peaks have one bounded formula instead of dozens of point rows',()=>{const p=base(x=>x);p.series[0].points=observations(x=>.12+.01/(1-.75*Math.cos(6*Math.PI*x))**2,161);const r=fit(p);assert.equal(r.plan.series[0].kind,'expression');assert.equal(r.plan.series[0].approximation.family,'periodic-peaks');});
test('a source candidate cannot replace disagreeing observations',()=>{const p=base(x=>.2+.5*x);p.series[0].candidateExpression='1-x';const r=fit(p);assert.equal(r.plan.series[0].approximation.family,'linear');assert(Math.abs(compile(r.plan.series[0].expression)(.5)-.45)<1e-5);});
test('scatter, closed curves, vertical runs, gaps and visible endpoint markers stay editable points',()=>{
  for(const change of [s=>s.lineVisible=false,s=>s.closed=true,s=>s.points[10].x=s.points[9].x,s=>s.breaks=[10],s=>s.endpoints=[{index:4,kind:'open'}],s=>s.markerShape='circle',s=>s.arrowSpecs=[{segmentIndex:3,t:.5,dir:1}]]){const p=base(x=>.2+.5*x);change(p.series[0]);const r=preferAnalyticGraphPlan(p);assert.equal(r.plan.series[0].kind,'points');assert.deepEqual(r.plan.series[0].points,p.series[0].points);}
});
test('polyline corners are not rounded into an invented function',()=>{const p=base(x=>.1+Math.abs(x-.5));p.series[0].curveStyle='straight';assert.equal(fit(p).plan.series[0].kind,'points');});
test('visible source outside the value frame is retained instead of being clipped by expression sampling',()=>{const p=base(x=>.1+x);const r=preferAnalyticGraphPlan(p);assert.equal(r.plan.series[0].kind,'points');assert.deepEqual(r.plan.series[0].points,p.series[0].points);});
test('oversized anchor arrays keep source geometry without an unbounded fit search',()=>{const p=base(x=>.2+.5*x);p.series[0].points=observations(x=>.2+.5*x,4096);const r=preferAnalyticGraphPlan(p);assert.equal(r.plan.series[0].kind,'points');assert.deepEqual(r.plan.series[0].points,p.series[0].points);});
test('approximate formulas require provenance, retained observations and independently verified errors',()=>{
  const p=fit(base(x=>.2+.5*x)).plan;
  for(const change of [s=>delete s.observedPoints,s=>delete s.approximation,s=>s.approximation.provenance='physical-law',s=>s.approximation.maxDeviation=.007,s=>s.expression='1-x',s=>s.approximation.tolerance=.05,s=>s.certainty='exact']){const q=structuredClone(p);change(q.series[0]);const r=validateGraphPlan(q);assert(!r.ok);assert(r.errors.some(e=>e.code==='FALSE_PRECISION'));}
});
test('approximate expression validation rejects aliased interior oscillations and changed domains',()=>{
  const original=fit(base(x=>x)).plan;
  for(const expression of ['x+sin(16*pi*x)','x+sin(997*pi*x)','x+sin(2*pi*997*x)']){const p=structuredClone(original),s=p.series[0];s.expression=expression;s.observedPoints=[{x:0,y:0},{x:1,y:1}];s.approximation.maxDeviation=0;s.approximation.rmsDeviation=0;s.approximation.interiorMaxDeviation=0;assert(!checkAnalyticApproximation(s,p).ok);assert(!validateGraphPlan(p).ok);}
  const p=structuredClone(original);p.series[0].domain.max=2;assert(!validateGraphPlan(p).ok);
});
test('caller-supplied individually valid approximate formula cannot shift a source crossing beyond the relation limit',()=>{
  const p=base(x=>.5+.05*(x-.5)),s=fit(p).plan.series[0],other={...structuredClone(p.series[0]),id:'reference',points:observations(()=>.5),curveStyle:'straight'};
  s.expression='0.48+0.05*x';s.approximation.maxDeviation=.005;s.approximation.rmsDeviation=.005;s.approximation.interiorMaxDeviation=.005;
  p.series=[s,other];assert(checkAnalyticApproximation(s,p).ok,'Both individual shape/error limits are met');assert(!checkAnalyticIntersections(p).ok);const rejected=validateGraphPlan(p);assert(!rejected.ok);assert(rejected.errors.some(e=>e.code==='INTERSECTIONS'));
  s.expression='0.475+0.05*x';s.approximation.maxDeviation=0;s.approximation.rmsDeviation=0;s.approximation.interiorMaxDeviation=0;assert(checkAnalyticIntersections(p).ok);assert(validateGraphPlan(p).ok,'The unchanged source crossing remains accepted');
});
test('native expression is authoritative; samples are derived and can be regenerated after editing',()=>{
  const plan=fit(base(x=>.2+.5*x)).plan,built=buildNativeGraph(plan),f=built.objects.find(o=>o.type==='funcgraph');assert(built.ok,built.error);assert.equal(f.sourceKind,'expression');assert.equal(f.expr,plan.series[0].expression);assert.deepEqual(f.observedOriginalPoints,plan.series[0].observedPoints);const stored=JSON.parse(JSON.stringify(built.objects)),native=stored.find(o=>o.type==='funcgraph');native.expr='0.1+0.7*x';const updated=sampleFunctionPoints(native.expr,native.domainMin,native.domainMax,stored[0]);assert.equal(updated.error,null);assert.notDeepEqual(updated.points,native.points);assert.equal(native.reconstruction.certainty,'observed');
});
test('indexed leader/guide links migrate to formula x anchors without moving original coordinates',()=>{
  const p=base(x=>.2+.5*x);p.annotations=[{id:'leader',kind:'leader',text:'',x:.7,y:.8,to:{...p.series[0].points[20]},axis:'y',orientation:'horizontal',coordinateSpace:'normalized',seriesId:'s',pointIndex:20},{id:'guide',kind:'guide',text:'',...p.series[0].points[10],axis:'y',orientation:'vertical',coordinateSpace:'normalized',seriesId:'s',pointIndex:10}];const r=fit(p);for(let i=0;i<2;i++){assert.equal(r.plan.annotations[i].pointIndex,undefined);assert.equal(r.plan.annotations[i].sourcePointIndex,p.annotations[i].pointIndex);assert.equal(r.plan.annotations[i].anchorX,p.series[0].points[p.annotations[i].pointIndex].x);assert.deepEqual(r.plan.annotations[i].to,p.annotations[i].to);assert.equal(r.plan.annotations[i].x,p.annotations[i].x);assert.equal(r.plan.annotations[i].y,p.annotations[i].y);}
});
test('normalized expressions on calibrated logarithmic axes become mathematically correct native equations',()=>{
  const p=base(x=>.2+.5*x);p.coordinateMode='data';p.axes.x={scale:'log',title:'',unit:'',min:1,max:100,step:1};p.axes.y={scale:'log',title:'',unit:'',min:.1,max:1000,step:1};const r=fit(p),built=buildNativeGraph(r.plan);assert(built.ok,built.error);const f=built.objects.find(o=>o.type==='funcgraph');assert(f.expr.includes('ln(x)'));assert(Math.abs(compile(f.expr)(10)-.1*10000**.45)<1e-5);assert.equal(f.domainMin,1);assert.equal(f.domainMax,100);
});
test('data observations fit in display space and never gain exact certainty',()=>{
  const p=base(x=>.2+.5*x);p.coordinateMode='data';p.axes.x={scale:'linear',title:'',unit:'s',min:10,max:30,step:5};p.axes.y={scale:'linear',title:'',unit:'N',min:100,max:300,step:50};p.series[0].coordinateSpace='data';p.series[0].points=p.series[0].points.map(q=>({x:10+20*q.x,y:100+200*q.y}));const r=fit(p),s=r.plan.series[0];assert.equal(s.coordinateSpace,'data');assert.equal(s.certainty,'observed');assert.equal(s.domain.min,10);assert(Math.abs(compile(s.expression)(20)-190)<1e-4);
});
test('coordinate transforms use the parser natural log and preserve negative linear ranges',()=>{const f=compile(normalizedExpressionToData('0.2+0.5*x',{x:{scale:'linear',min:-5,max:5},y:{scale:'linear',min:-10,max:10}}));assert(Math.abs(f(0)+1)<1e-8);});
test('small physics calibration constants keep significant precision on logarithmic and linear axes',()=>{
  for(const scale of ['linear','log']){const axes={x:{scale,min:1e-9,max:1e-8},y:{scale:'linear',min:1,max:10}},f=compile(normalizedExpressionToData('x',axes)),x=scale==='log'?Math.sqrt(1e-17):5.5e-9;assert(Math.abs(f(x)-5.5)<1e-10);}
  const f=compile(normalizedExpressionToData('x',{x:{scale:'linear',min:0,max:1},y:{scale:'log',min:1e-200,max:1e200}}));assert(Math.abs(f(.5)-1)<1e-10);
});
test('three source plateau curves are all fitted without false shoulders or intersecting changes',()=>{const p=fixture('07-g17-p2_2023_11_06'),r=fit(p);assert.equal(r.conversions.length,3);assert(r.plan.series.every(s=>s.kind==='expression'&&s.certainty==='observed'));assert.deepEqual(r.plan.axes,p.axes);});
test('complex supplied gravity tracing stays point-editable in tick units with a visible reason',()=>{const p=fixture('08-g18-p2_2023_11_16'),r=fit(p);assert.equal(r.conversions.length,0);assert(r.rejected.filter(x=>'bestMaxDeviation' in x).every(r=>r.bestMaxDeviation>.008));assert.equal(r.plan.coordinateMode,'data');assert.deepEqual(r.plan.axes.x.ticks.filter(t=>/^[23]?t₁$/.test(t.label)).map(t=>t.value),[1,2,3]);assert.deepEqual(r.plan.axes.y.ticks.filter(t=>/F$/.test(t.label)).map(t=>t.value),[1,2,8,9]);const ax=r.plan.axes.x,ay=r.plan.axes.y;r.plan.series.forEach((s,i)=>{assert.equal(s.kind,'points');assert.equal(typeof s.analyticFitFailure,'string');s.points.forEach((q,j)=>{const o=p.series[i].points[j];assert(Math.abs((q.x-ax.min)/(ax.max-ax.min)-o.x)<2e-4&&Math.abs((q.y-ay.min)/(ay.max-ay.min)-o.y)<2e-4);});});assert.deepEqual(r.plan.annotations,p.annotations);assert(validateGraphPlan(r.plan).review.some(x=>x.reason.startsWith('함수 복원 미완료')));});
test('two marked trajectories with independent initial directions split into editable formulas',()=>{
  const p=base(x=>x);
  p.axes.x.ticks=[{value:null,label:'2L',position:.4},{value:null,label:'4L',position:.8}];
  p.axes.y.ticks=[{value:null,label:'3L',position:.6},{value:null,label:'4L',position:.8}];
  const a=Array.from({length:17},(_,i)=>({x:.4*(i/16)**2,y:.6*i/16}));
  const b=Array.from({length:17},(_,i)=>({x:.4+.4*(i/16)**2,y:.8-.2*(1-i/16)**2}));
  p.series[0]={...p.series[0],candidateFamily:'none',points:[...a,...b.slice(1)],endpoints:[{index:0,kind:'closed'},{index:16,kind:'closed'},{index:32,kind:'closed'}],lineStyle:'dashed',dashLength:2,dashGap:1};
  p.annotations=[
    {id:'origin',kind:'text',text:'O',x:0,y:0,axis:'y',coordinateSpace:'normalized',orientation:'horizontal'},
    {id:'q',kind:'guide',text:'',x:.4,y:.6,to:{x:0,y:.6},seriesId:'s',pointIndex:16,axis:'y',coordinateSpace:'normalized',orientation:'horizontal'},
    {id:'initial-a',kind:'arrow',text:'',x:0,y:.02,to:{x:0,y:.12},axis:'y',coordinateSpace:'normalized',orientation:'vertical'},
    {id:'initial-b',kind:'arrow',text:'',x:.77,y:.8,to:{x:.65,y:.8},axis:'y',coordinateSpace:'normalized',orientation:'horizontal'}
  ];
  const r=preferAnalyticGraphPlan(p,{requirePhysics:true,relativeDiagrams:true});
  assert.equal(r.conversions.length,2,JSON.stringify({rejected:r.rejected,series:r.plan.series.map(s=>({id:s.id,model:s.physicsModel,first:s.points?.[0],last:s.points?.at(-1)}))}));
  assert.equal(validateGraphPlan(r.plan).ok,true,JSON.stringify(validateGraphPlan(r.plan).errors));
  const curves=r.plan.series.filter(s=>s.kind==='expression');
  assert.equal(curves.length,2);
  const fa=compile(curves[0].expression),fb=compile(curves[1].expression);
  assert(Math.abs(fa(0))<1e-8);assert(Math.abs(fa(2)-3)<1e-8);
  assert(Math.abs(fb(2)-3)<1e-8);assert(Math.abs(fb(4)-4)<1e-8);
  assert(Math.abs((fb(4)-fb(4-.0001))/.0001)<.001);
  assert(curves.every(s=>s.lineStyle==='dashed'&&s.dashLength===2&&s.dashGap===1));
  assert.equal(r.plan.annotations.filter(a=>a.kind==='point').length,3);
  assert.equal(r.plan.annotations.find(a=>a.id==='q').to.x,0);
  assert(buildNativeGraph(r.plan).ok);
  const changed=structuredClone(r.plan);changed.series[0].expression='x';assert(!validateGraphPlan(changed).ok);
});
test('unscaled marked inverse curve keeps direction and a compact relative formula',()=>{
  const p=base(x=>x),points=Array.from({length:21},(_,i)=>{const x=.25+.3*i/20;return {x,y:.22/x};}).reverse();
  p.axes.x.title='부피';p.axes.y.title='압력';
  p.series[0]={...p.series[0],points,candidateFamily:'power-inverse',endpoints:[{index:0,kind:'closed'},{index:20,kind:'closed'}],arrowSpecs:[{segmentIndex:7,t:.5,dir:1,strokeWidth:.8}]};
  const r=preferAnalyticGraphPlan(p,{requirePhysics:true,relativeDiagrams:true});
  const s=r.plan.series[0];
  assert.equal(s.kind,'expression');
  assert(!s.expression.includes('log('));assert(s.expression.length<90);
  assert.equal(s.approximation.coefficientSource,'process-endpoints');
  assert.equal(s.arrowSpecs[0].dir,-1);
  assert.equal(validateGraphPlan(r.plan).ok,true,JSON.stringify(validateGraphPlan(r.plan).errors));
  assert(buildNativeGraph(r.plan).ok);
});
test('second invocation and JSON persistence do not reinterpret existing formulas',()=>{const p=fit(base(x=>.2+.5*x)).plan,q=JSON.parse(JSON.stringify(p)),r=preferAnalyticGraphPlan(q);assert.equal(r.conversions.length,0);assert.deepEqual(r.plan,q);});
console.log(`${count} analytic reconstruction scenarios passed`);
