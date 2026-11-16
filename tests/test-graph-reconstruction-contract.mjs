import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GRAPH_PLAN_SCHEMA, validateGraphPlan, parseGraphPlanResponse, buildGraphExtractionPrompt } from '../js/graph/reconstruction-contract.js';
import { compile } from '../js/function-graph/parser.js';
const root = fileURLToPath(new URL('./fixtures/graph-reconstruction/', import.meta.url));
const fixture = name => JSON.parse(readFileSync(`${root}${name}.json`, 'utf8'));
const base = fixture('linear');
const outcomes = [];
function test(name, fn) { fn(); outcomes.push({ scenario: name, pass: true }); console.log(`PASS ${name}`); }
const bad = (change, code) => { const p = structuredClone(base); change(p); const r = validateGraphPlan(p); assert.equal(r.ok, false); assert.equal(r.blocked, true); assert(r.errors.some(x => x.code === code), JSON.stringify(r.errors)); };
test('axis-free and single-axis diagrams preserve an explicit frame contract',()=>{
  for(const variant of ['none','x']) {const p=structuredClone(base);p.frame={variant,arrowX:false,arrowY:false};assert(validateGraphPlan(p).ok);}
  bad(p=>p.frame={variant:'y'},'ENUM');
  bad(p=>p.frame={variant:'unknown-axis'},'ENUM');
});
test('synthetic fixtures preserve supplied data without mutating input', () => {
  for (const name of ['linear','units-negative','unlabelled','letter-ticks','discontinuity','open-dot','shade','dual-y','vertical','observed']) {
    const p = fixture(name), snapshot = JSON.stringify(p), r = validateGraphPlan(p);
    assert.equal(r.ok, true, JSON.stringify(r.errors)); assert.equal(r.blocked, false); assert.equal(JSON.stringify(p), snapshot);
    assert.deepEqual(r.plan.series, p.series);
  }
});
test('unknown scale blocks insertion and keeps uncertainty without inventing numbers', () => { const r = validateGraphPlan(fixture('unknown-scale')); assert(r.ok && r.blocked); assert.equal(r.plan.axes.y.min, null); assert(r.review.some(x => x.path === 'axes.y')); });
test('axis-break actual source observation is explicitly unsupported', () => { const r = validateGraphPlan(fixture('actual-axisbreak-observation')); assert(r.ok && r.blocked); assert(r.review.some(x => x.path === 'variant')); });
test('observed shape cannot lose review obligations', () => { const r = validateGraphPlan(fixture('observed')); assert(r.review.some(x => x.path === 'series.0')); });
test('source hash mismatch rejects stale response', () => { const r = validateGraphPlan(base,{source:{...base.source,hash:'different'}}); assert(!r.ok); assert(r.errors.some(x => x.code === 'SOURCE_MISMATCH')); });
test('source box key order does not alter identity', () => { const source=structuredClone(base.source); source.plotBox={h:240,w:320,y:20,x:40}; assert(validateGraphPlan(base,{source}).ok); });
test('non plain root cannot become a valid plan', () => assert.equal(validateGraphPlan(new Date()).ok,false));
test('source binding accepts identical metadata', () => assert(validateGraphPlan(base,{source:base.source}).ok));
test('out-of-axis points fail without clamping', () => bad(p => p.series[0].points[1].y = 100, 'OUT_OF_RANGE'));
test('negative or zero step fails', () => bad(p => p.axes.x.step = 0, 'RANGE'));
test('oversized tick budget fails', () => bad(p => p.axes.x.step = .00001, 'BUDGET'));
test('nonfinite number fails before JSON coercion', () => bad(p => p.series[0].points[0].x = Infinity, 'JSON'));
test('duplicate breaks cannot reconnect gaps', () => bad(p => p.series[0].breaks = [1,1], 'BREAK'));
test('endpoints require an existing point', () => bad(p => p.series[0].endpoints = [{index:42,kind:'open'}], 'REFERENCE'));
test('unknown axis cannot claim bounds', () => bad(p => p.axes.x.scale = 'unknown', 'UNKNOWN_VALUE'));
test('normalized position cannot masquerade as exact data', () => bad(p => p.series[0].coordinateSpace = 'normalized', 'FALSE_PRECISION'));
test('inferred expression is rejected', () => bad(p => p.series[0] = {id:'s1',kind:'expression',expression:'x*x',domain:{min:0,max:4},axis:'y',certainty:'observed',coordinateSpace:'data'}, 'FALSE_PRECISION'));
test('missing y2 cannot fall back silently', () => bad(p => p.series[0].axis = 'y2', 'REFERENCE'));
test('broken annotation relation fails', () => bad(p => p.annotations=[{id:'a',kind:'point',text:'A',x:1,y:1,orientation:'horizontal',seriesId:'missing',pointIndex:1}], 'REFERENCE'));
test('wrong handle count fails', () => bad(p => p.series[0].handlesMath = [{ix:0,iy:0,ox:0,oy:0}], 'HANDLES'));
test('bar with hidden zero baseline is review-blocked on each value axis', () => {
  for (const axis of ['y', 'y2']) for (const [min,max,value] of [[100,200,150],[-200,-100,-150]]) {
    const p=structuredClone(base); p.axes[axis]={scale:'linear',title:'',unit:'',min,max,step:20};
    p.series=[{id:'bar',kind:'bar',axis,certainty:'exact',coordinateSpace:'data',items:[{label:'A',value}]}];
    const r=validateGraphPlan(p); assert(r.ok,JSON.stringify(r.errors)); assert(r.blocked); assert(r.review.some(x=>x.path==='series.0'&&x.reason.includes('기준선'))); assert.equal(r.plan.series[0].items[0].value,value); assert.equal(r.plan.axes[axis].min,min);
  }
});
test('bar whose value axis includes zero remains supported', () => {
  const p=structuredClone(base); p.series=[{id:'bar',kind:'bar',axis:'y',certainty:'exact',coordinateSpace:'data',items:[{label:'A',value:3}]}];
  const r=validateGraphPlan(p); assert(r.ok&&!r.blocked,JSON.stringify(r));
});
test('shading with hidden zero baseline is review-blocked on each value axis', () => {
  for (const axis of ['y','y2']) for (const [min,max,value] of [[100,200,150],[-200,-100,-150]]) {
    const p=structuredClone(base);p.axes[axis]={scale:'linear',title:'',unit:'',min,max,step:20};p.series[0].axis=axis;
    p.series[0].points=[{x:1,y:value},{x:3,y:value}];p.series[0].area={enabled:true,min:1,max:3};
    const r=validateGraphPlan(p);assert(r.ok,JSON.stringify(r.errors));assert(r.blocked);assert(r.review.some(x=>x.path==='series.0.area'&&x.reason.includes('기준선')));assert.equal(r.plan.axes[axis].min,min);assert.equal(r.plan.series[0].points[0].y,value);
  }
});
test('shading whose axis includes zero remains supported', () => {
  const r=validateGraphPlan(fixture('shade'));assert(r.ok&&!r.blocked,JSON.stringify(r));
});
test('nonuniform axes remain unsupported rather than coerced linear', () => {
  const p=structuredClone(base);p.variant='nonuniform';const r=validateGraphPlan(p);assert(r.ok&&r.blocked);assert(r.review.some(x=>x.path==='variant'));
});
test('bar width never autoscaled', () => bad(p => p.series[0].widthRatio=2, 'RANGE'));
test('unknown schema cannot reuse old contract', () => bad(p => p.schema='old', 'VERSION'));
test('invalid review source rectangle fails', () => bad(p => p.review=[{path:'series.0',reason:'uncertain',sourceBox:{x:0,y:0,w:9000,h:1}}], 'BOX_BOUNDS'));
test('log axis rejects a nonpositive domain and accepts positive calibration', () => { const p=structuredClone(base);p.axes.y.scale='log';p.axes.y.min=0;assert(!validateGraphPlan(p).ok);p.axes.y.min=.1;p.series=[];p.annotations=[];p.axes.y.ticks=[];const r=validateGraphPlan(p);assert(r.ok&&!r.blocked,JSON.stringify(r.errors)); });
test('parser accepts only one JSON object, optional code fence', () => { assert(parseGraphPlanResponse('```json\n'+JSON.stringify(base)+'\n```').ok);assert(!parseGraphPlanResponse('answer: '+JSON.stringify(base)).ok);assert(!parseGraphPlanResponse('{}{}').ok); });
test('prototype payload is rejected', () => assert(!parseGraphPlanResponse('{"__proto__":{"x":1}}').ok));
function promptJson(prompt, marker) {
  const prefix=marker+': ';const lines=prompt.split('\n').filter(line=>line.startsWith(prefix));assert.equal(lines.length,1,marker);return JSON.parse(lines[0].slice(prefix.length));
}
test('prompt machine binding and complete examples validate without plotBox supplied', () => {
  const {plotBox,...source}=base.source;const before=JSON.stringify(source);const prompt=buildGraphExtractionPrompt(source);
  assert.deepEqual(promptJson(prompt,'GRAPH_SOURCE_BINDING_JSON'),source);assert.equal(JSON.stringify(source),before);
  for (const marker of ['GRAPH_PLAN_EXAMPLE_JSON','GRAPH_EXPRESSION_EXAMPLE_JSON']) {
    const example=promptJson(prompt,marker);assert.equal(example.schema,GRAPH_PLAN_SCHEMA);assert.equal(example.variant,'cartesian');assert(!Object.hasOwn(example,'plotBox'));
    assert.deepEqual(example.source,{...source,plotBox:{x:0,y:0,w:source.width,h:source.height}});
    const checked=validateGraphPlan(example,{source});assert(checked.ok&&!checked.blocked,JSON.stringify(checked));
  }
});
test('machine example supports visible interior markers as well as terminal markers', () => {
  const example=promptJson(buildGraphExtractionPrompt(base.source),'GRAPH_PLAN_EXAMPLE_JSON');const series=example.series[0];
  assert.deepEqual(series.endpoints.map(e=>e.index),[0,1,2]);assert.equal(series.endpoints[1].kind,'closed');assert(series.endpoints[1].index<series.points.length-1);
  const checked=validateGraphPlan(example);assert(checked.ok);assert.deepEqual(checked.plan.series[0].endpoints,series.endpoints);
});
test('prompt nested plotBox retains supplied frame and parser never repairs top-level box', () => {
  const prompt=buildGraphExtractionPrompt(base.source);const example=promptJson(prompt,'GRAPH_PLAN_EXAMPLE_JSON');assert.deepEqual(example.source,base.source);
  example.plotBox=example.source.plotBox;delete example.source.plotBox;const checked=parseGraphPlanResponse(JSON.stringify(example),{source:base.source});assert(!checked.ok);assert(checked.errors.some(e=>e.path==='source.plotBox'));
});
test('prompt expression example compiles RHS and preserves printed formula annotation', () => {
  const example=promptJson(buildGraphExtractionPrompt(base.source),'GRAPH_EXPRESSION_EXAMPLE_JSON');const series=example.series[0];
  assert.equal(series.expression,'x');assert.equal(compile(series.expression)(3),3);assert.equal(example.annotations[0].text,'y = x');assert.equal(example.annotations[0].seriesId,series.id);
  const invalid=structuredClone(example);invalid.series[0].expression='y = x';const parsed=parseGraphPlanResponse(JSON.stringify(invalid));assert.equal(parsed.plan.series[0].expression,'y = x');assert.throws(()=>compile(parsed.plan.series[0].expression));
});

const evidence = process.env.EVIDENCE_DIR;
if (evidence) { mkdirSync(evidence,{recursive:true});writeFileSync(`${evidence}/results.json`, JSON.stringify({synthetic:true, actualSourceObservationOnly:true, node:process.version, invocation:'node tests/test-graph-reconstruction-contract.mjs', outcomes},null,2)+'\n'); }
console.log(`${outcomes.length} scenarios passed`);
