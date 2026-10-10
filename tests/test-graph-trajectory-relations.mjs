import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { restorePhysicsRelations, checkPhysicsRelationApproximation } from '../js/function-graph/physics-relations.js';
import { preferAnalyticGraphPlan } from '../js/function-graph/analytic-fit.js';
import { compile } from '../js/function-graph/parser.js';
import { validateGraphPlan } from '../js/graph/reconstruction-contract.js';
import { buildNativeGraph } from '../js/graph/native-graph.js';

let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
const trajectoryA=x=>4*Math.sqrt(x/2)-x/2;
const trajectoryB=x=>4-(1-Math.sqrt((x-2)/2))**2;
const close=(expression,f,xs)=>{const g=compile(expression);for(const x of xs)assert(Math.abs(g(x)-f(x))<1e-8,`${expression} at ${x}`);};
function diagram(){
  const sample=(lo,hi,f)=>Array.from({length:33},(_,i)=>{const x=lo+(hi-lo)*i/32;return {x,y:f(x)};});
  const first=sample(0,2,trajectoryA),second=sample(2,4,trajectoryB),points=[...first,...second.slice(1)];
  return {schema:'5e.graph-reconstruction/v1',variant:'cartesian',coordinateMode:'data',
    source:{id:'synthetic-independent-trajectories',hash:'synthetic',width:700,height:500,plotBox:{x:70,y:50,w:560,h:400}},
    axisPlacement:{x:{mode:'zero',value:0},y:{mode:'zero',value:0}},frame:{variant:'quadrant'},
    axes:{x:{scale:'linear',title:'x',unit:'L',min:0,max:4.6,step:1,ticks:[{value:2,label:'2L'},{value:4,label:'4L'}],orientation:'horizontal'},
      y:{scale:'linear',title:'y',unit:'L',min:0,max:4.6,step:1,ticks:[{value:3,label:'3L'},{value:4,label:'4L'}],orientation:'horizontal'}},
    series:[{id:'joined',kind:'points',certainty:'observed',coordinateSpace:'data',axis:'y',curveStyle:'smooth',points,
      candidateFamily:'sinusoid',lineStyle:'dashed',dashLength:2,dashGap:.8,strokeWidth:.45,endpoints:[],breaks:[],
      arrowSpecs:[{segmentIndex:3,t:.35,dir:1,strokeWidth:.43},{segmentIndex:60,t:.7,dir:-1,strokeWidth:.41}]}],
    annotations:[{id:'q',kind:'point',text:'q',x:2,y:3,seriesId:'joined',pointIndex:32,coordinateSpace:'data',axis:'y',orientation:'horizontal',endStyle:'closed',markerSize:1.2,fillLevel:160},
      {id:'q-guide',kind:'guide',text:'',x:2,y:3,to:{x:2,y:0},seriesId:'joined',pointIndex:32,coordinateSpace:'data',axis:'y',orientation:'vertical',strokeWidth:.14},
      {id:'velocity-A',kind:'arrow',text:'v',x:0,y:0,to:{x:0,y:.8},coordinateSpace:'data',axis:'y',orientation:'vertical',strokeWidth:.45},
      {id:'velocity-B',kind:'arrow',text:'v',x:4,y:4,to:{x:3.5,y:4},coordinateSpace:'data',axis:'y',orientation:'horizontal',strokeWidth:.45}],regions:[],review:[]};
}
function reversed(plan){
  const p=structuredClone(plan),s=p.series[0],last=s.points.length-1;
  s.points.reverse();
  s.endpoints=s.endpoints.map(e=>({...e,index:last-e.index}));
  s.arrowSpecs=s.arrowSpecs.map(a=>({...a,segmentIndex:last-a.segmentIndex-1,t:1-a.t,dir:-a.dir}));
  for(const a of p.annotations)if(a.seriesId===s.id && Number.isInteger(a.pointIndex))a.pointIndex=last-a.pointIndex;
  return p;
}
function check(result){
  for(const s of result.plan.series.filter(s=>s.kind==='expression'))assert(checkPhysicsRelationApproximation(s,result.plan).ok,s.id);
  assert(validateGraphPlan(result.plan).ok,JSON.stringify(validateGraphPlan(result.plan).errors));
  assert(buildNativeGraph(result.plan).ok);
}
function verifyTwo(result,original){
  assert.equal(result.plan.series.length,2);assert(result.plan.series.every(s=>s.kind==='expression'));
  const a=result.plan.series.find(s=>s.domain.min===0),b=result.plan.series.find(s=>s.domain.min===2);
  assert(a && b);close(a.expression,trajectoryA,[0,.1,.5,1,2]);close(b.expression,trajectoryB,[2,2.1,2.5,3,4]);
  assert.equal(compile(a.expression)(2),compile(b.expression)(2),'q is exactly shared');
  for(const s of [a,b]){assert.equal(s.lineStyle,'dashed');assert.equal(s.dashLength,2);assert.equal(s.dashGap,.8);assert.equal(s.strokeWidth,.45);}
  const q=result.plan.annotations.find(a=>a.id==='q');assert.equal(q.anchorX,2);assert.equal(q.pointIndex,undefined);assert.equal(q.markerSize,1.2);assert.equal(q.endStyle,'closed');assert.equal(q.fillLevel,160);
  for(const id of ['velocity-A','velocity-B'])assert.deepEqual(result.plan.annotations.find(a=>a.id===id),original.annotations.find(a=>a.id===id),'independent tangent arrow preserved');
  const oldGuide=original.annotations.find(a=>a.id==='q-guide'),guide=result.plan.annotations.find(a=>a.id==='q-guide');
  for(const key of ['x','y','to','strokeWidth'])assert.deepEqual(guide[key],oldGuide[key],'guide geometry/style preserved');
  const originalSeries=original.series[0];
  const expected=originalSeries.arrowSpecs.map(a=>({x:originalSeries.points[a.segmentIndex].x+(originalSeries.points[a.segmentIndex+1].x-originalSeries.points[a.segmentIndex].x)*a.t,
    dir:a.dir*(originalSeries.points[a.segmentIndex+1].x>originalSeries.points[a.segmentIndex].x?1:-1),strokeWidth:a.strokeWidth})).sort((a,b)=>a.x-b.x);
  const arrows=result.plan.series.flatMap(s=>s.arrowSpecs).sort((a,b)=>a.x-b.x);assert.equal(arrows.length,2);
  for(let i=0;i<arrows.length;i++){assert(Math.abs(arrows[i].x-expected[i].x)<1e-9);assert.equal(arrows[i].dir,expected[i].dir);assert.equal(arrows[i].strokeWidth,expected[i].strokeWidth);}
  check(result);
}

test('q linked only as point annotation splits independently directed paths into sqrt formulas',()=>{
  const input=diagram(),snapshot=structuredClone(input),r=restorePhysicsRelations(input);
  verifyTwo(r,input);assert.deepEqual(input,snapshot,'restoration never mutates source');
});
test('reversed combined observations preserve contacts, markers, guides and progress direction',()=>{
  const input=reversed(diagram()),snapshot=structuredClone(input),r=restorePhysicsRelations(input);
  verifyTwo(r,input);assert(r.plan.series.every(s=>s.processSource.reverse));assert.deepEqual(input,snapshot);
});
test('incorrect candidate family is a hint and does not veto tangent evidence',()=>{
  const reference=restorePhysicsRelations(diagram()).plan.series.map(s=>s.expression);
  for(const family of ['none','linear','quadratic','power-inverse','exponential','sinusoid']){
    const p=diagram();p.series[0].candidateFamily=family;
    assert.deepEqual(restorePhysicsRelations(p).plan.series.map(s=>s.expression),reference,family);
  }
});
test('a marked corner without independent initial arrows is never split',()=>{
  const p=diagram();p.annotations=p.annotations.filter(a=>a.kind!=='arrow');
  const r=restorePhysicsRelations(p);assert.equal(r.plan.series.length,1);assert.deepEqual(r.plan.series[0],p.series[0]);assert.deepEqual(r.conversions,[]);
});
test('one outer arrow does not identify two independent trajectories',()=>{
  const p=diagram();p.annotations=p.annotations.filter(a=>a.id!=='velocity-B');
  const r=restorePhysicsRelations(p);assert.equal(r.plan.series.length,1);assert.deepEqual(r.plan.series[0],p.series[0]);
});
test('unlinked text or a guide alone cannot invent a trajectory boundary',()=>{
  const p=diagram();p.annotations=p.annotations.filter(a=>a.id!=='q');
  const r=restorePhysicsRelations(p);assert.equal(r.plan.series.length,1,'linked guide is not a q marker');
  const q=diagram();q.annotations.find(a=>a.id==='q').kind='text';assert.equal(restorePhysicsRelations(q).plan.series.length,1);
});
test('marked smooth tangent continuity does not qualify as a split',()=>{
  const p=diagram();p.series[0].points=Array.from({length:65},(_,i)=>{const x=4*i/64;return {x,y:2*Math.sqrt(x)};});
  const r=restorePhysicsRelations(p);assert.equal(r.plan.series.length,1);assert(!r.plan.series[0].id.includes('trajectory-'));
});
test('single reversed trajectory keeps indexed endpoint and linked marker bindings',()=>{
  const p=diagram(),s=p.series[0];s.points=s.points.slice(0,33);s.arrowSpecs=s.arrowSpecs.slice(0,1);s.endpoints=[{index:0,kind:'open',markerSize:.7}];
  p.annotations=p.annotations.filter(a=>a.id!=='velocity-B');const input=reversed(p),r=restorePhysicsRelations(input),out=r.plan.series[0];
  assert.equal(out.kind,'expression');close(out.expression,trajectoryA,[0,.1,1,2]);
  assert.equal(r.plan.annotations.find(a=>a.id==='q').anchorX,2);
  const endpoint=r.plan.annotations.find(a=>a.id==='joined-endpoint-0');assert(endpoint);assert.equal(endpoint.anchorX,0);assert.equal(endpoint.endStyle,'open');assert.equal(endpoint.markerSize,.7);
  assert.equal(out.arrowSpecs[0].dir,1);check(r);
});
test('serialized trajectory provenance rejects a changed formula',()=>{
  const p=JSON.parse(JSON.stringify(restorePhysicsRelations(diagram()).plan));assert(validateGraphPlan(p).ok);
  p.series[0].expression='sqrt(x)';assert(!validateGraphPlan(p).ok);
});
test('actual p2_2027_06_16 response keeps its formulas, circle markers, arrows and guides',()=>{
  const input=JSON.parse(readFileSync(new URL('fixtures/graph-physics/p2_2027_06_16-live-observed.json',import.meta.url)));
  const checked=validateGraphPlan(input);assert(checked.ok);const r=preferAnalyticGraphPlan(checked.plan);check(r);
  assert.equal(r.plan.series.find(s=>s.id==='trajectory-A').expression,'4*sqrt(x/2)-1*x/2');
  assert.equal(r.plan.series.find(s=>s.id==='trajectory-B').expression,'4-(1-sqrt((x-(2))/2))^2');
  assert.equal(r.plan.series.filter(s=>s.closed).length,3);
  for(const ring of r.plan.series.filter(s=>s.closed)){
    const source=input.series.find(s=>s.id===ring.id);assert.equal(ring.points.length,source.points.length);assert.equal(ring.lineStyle,source.lineStyle);
  }
  for(const a of input.annotations.filter(a=>a.kind==='guide' || a.kind==='arrow')){
    const saved=r.plan.annotations.find(q=>q.id===a.id);for(const key of ['x','y','to','text','strokeWidth'])assert.deepEqual(saved[key],a[key],a.id+'.'+key);
  }
});
console.log(count+' trajectory relation scenarios passed; provider requests: 0');
