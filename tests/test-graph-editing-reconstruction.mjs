import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as coords from '../js/function-graph/coords.js';
import { sampleFunctionPoints } from '../js/function-graph/sampler.js';
import * as engineControls from '../js/graph/graph-engine-controls.js';
import { buildRegionGeometry } from '../js/graph/graph-features.js';
import * as shapePreserving from '../js/function-graph/shape-preserving.js';
import { fitObservedCurve } from '../js/function-graph/curve-fit.js';
import { buildNativeGraph } from '../js/graph/native-graph.js';
import * as examStyle from '../js/graph/exam-style.js';
import * as axisLayout from '../js/graph/axis-layout.js';
const dir = process.env.EVIDENCE_DIR || path.resolve(import.meta.dirname, '../.omo/evidence/graph-reconstruction-20261004/editing'); fs.mkdirSync(dir,{recursive:true});
const source = fs.readFileSync(new URL('../js/graph/graph-modal.js',import.meta.url),'utf8').replace(/^import\s[\s\S]*?from\s*["'][^"']+["'];\s*/gm,'').replace(/\bexport\s+(?=function)/g,'');
let objects=[];
const ctx=vm.createContext({console,structuredClone,...coords,...engineControls,...shapePreserving,...examStyle,...axisLayout,buildRegionGeometry,fitObservedCurve,sampleFunctionPoints,state:{get:()=>({objects})},markerRadius:()=>0.3});
vm.runInContext(source+'\nglobalThis.api={loadFromPlane,applyCfg,prepareSeries,cfg:()=>_cfg};',ctx);
const api=ctx.api; const plain=v=>JSON.parse(JSON.stringify(v));
const plan=()=>({schema:'5e.graph-reconstruction/v1',source:{id:'unit-edit',hash:'synthetic',width:400,height:300,plotBox:{x:0,y:0,w:400,h:300}},axes:{x:{scale:'linear',title:'',unit:'',min:2.2,max:8.8,step:0.2,ticks:[]},y:{scale:'linear',title:'값',unit:'',min:0,max:100,step:10,ticks:[{value:40,label:'40'}]},y2:{scale:'linear',title:'',unit:'',min:100,max:1000,step:100,ticks:[{value:500,label:'500'}]}},series:[{id:'p',kind:'points',axis:'y',certainty:'exact',coordinateSpace:'data',points:[{x:3,y:20},{x:4,y:40},{x:6,y:60},{x:7,y:80}],breaks:[2],endpoints:[{index:0,kind:'open'}],area:{enabled:true,min:3,max:6}}],annotations:[],review:[]});
const results=[]; function test(name,fn){try{fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.stack});}}
test('exact positive minima and noninteger bounds no-op survive modal conversion',()=>{objects=buildNativeGraph(plan()).objects;api.loadFromPlane(objects[0]);const plane=api.applyCfg(structuredClone(objects[0]),api.cfg());assert.deepEqual(plain(plane),plain(objects[0]));const series=api.prepareSeries(plane);assert.equal(series.ok,true);for(const k of ['mathPoints','points','breaks','endpointMarkers','reconstruction'])assert.deepEqual(plain(series.list[0][k]),plain(objects[1][k]),k);assert.equal(series.list[0].area.worldFrom,objects[1].area.worldFrom);});
test('imported tick mode changes and automatic spacing edits remain effective',()=>{
 objects=buildNativeGraph(plan()).objects;api.loadFromPlane(objects[0]);let cfg=api.cfg();cfg.tickMode='number';cfg.exactBounds.gridStepY=20;
 let plane=api.applyCfg(structuredClone(objects[0]),cfg);
 assert.equal(plane.graphTickMode,'number');assert.deepEqual(plain(plane.explicitTicksY.map(t=>t.value)),[20,40,60,80,100]);
 objects=[plane,objects[1]];api.loadFromPlane(plane);cfg=api.cfg();cfg.exactBounds.gridStepY=25;
 plane=api.applyCfg(structuredClone(plane),cfg);assert.deepEqual(plain(plane.explicitTicksY.map(t=>t.value)),[25,50,75,100]);
});
test('independent y2 bars preserve exact values and heights on no-op and new y2 range',()=>{const p=plan();p.axes.y2.min=0;p.series=[{id:'b',kind:'bar',axis:'y2',certainty:'exact',coordinateSpace:'data',items:[{label:'A',value:800},{label:'B',value:400}]}];objects=buildNativeGraph(p).objects;api.loadFromPlane(objects[0]);const cfg=api.cfg();let plane=api.applyCfg(structuredClone(objects[0]),cfg);let f=api.prepareSeries(plane).list[0];assert.deepEqual(plain(f.points),plain(objects[1].points));cfg.exactY2.y2Max=1900;plane=api.applyCfg(plane,cfg);f=api.prepareSeries(plane).list[0];assert.deepEqual(plain(f.barItems),p.series[0].items);assert.notEqual(f.points[1].y,objects[1].points[1].y);});
test('exact imported bar widths .05 and 1 survive no-op without legacy clamping',()=>{
 for(const widthRatio of [0.05,1]) { const p=plan();p.axes.y2.min=0;p.series=[{id:'b',kind:'bar',axis:'y2',certainty:'exact',coordinateSpace:'data',widthRatio,items:[{label:'A',value:800},{label:'B',value:400}]}];const built=buildNativeGraph(p);assert.equal(built.ok,true,built.error);objects=built.objects;api.loadFromPlane(objects[0]);const f=api.prepareSeries(api.applyCfg(structuredClone(objects[0]),api.cfg())).list[0];assert.equal(f.barWidthRatio,widthRatio);assert.deepEqual(plain(f.points),plain(objects[1].points)); }
});
test('expression explicit range and domain survive load/prepare',()=>{const p=plan();p.axes.x={scale:'linear',title:'',unit:'',min:0,max:4,step:1,ticks:[]};p.axes.y={scale:'linear',title:'',unit:'',min:0,max:4,step:1,ticks:[]};delete p.axes.y2;p.series=[{id:'e',kind:'expression',axis:'y',certainty:'exact',coordinateSpace:'data',expression:'x',expressionSource:'printed',domain:{min:0,max:4}}];objects=buildNativeGraph(p).objects;Object.assign(objects[1],{rangeMin:1,rangeMax:3});api.loadFromPlane(objects[0]);const f=api.prepareSeries(objects[0]).list[0];assert.equal(f.rangeMin,1);assert.equal(f.rangeMax,3);assert.equal(f.domainMin,0);assert.equal(f.domainMax,4);assert.ok(f.points.every(q=>q.y>=objects[0].y&&q.y<=objects[0].y+objects[0].h));});
test('single point remains a native editable point',()=>{const p=plan();p.series[0].points=[{x:3,y:20}];p.series[0].breaks=[];delete p.series[0].area;objects=buildNativeGraph(p).objects;api.loadFromPlane(objects[0]);assert.equal(api.prepareSeries(objects[0]).list[0].points.length,1);});
test('legacy range edit remaps baked markers guides arrows and Bezier handles',()=>{
 const legacySource=fs.readFileSync(new URL('../js/function-graph/plane-modal.js',import.meta.url),'utf8').replace(/^import\s[\s\S]*?from\s*["'][^"']+["'];\s*/gm,'').replace(/\bexport\s+(?=function)/g,'');
 const plane={id:'p',type:'coordplane',x:0,y:0,w:100,h:100,xMin:0,xMax:10,yMin:0,yMax:10};
 const f={id:'f',type:'funcgraph',planeId:'p',mathPoints:[{x:2,y:2},{x:4,y:4}],points:[{x:20,y:80},{x:40,y:60}],markers:[{x:20,y:80}],guideSegs:[[{x:20,y:80},{x:20,y:100}]],arrowMarks:[{x:20,y:80,dx:1,dy:-1}],handles:[{inX:10,inY:90,outX:30,outY:70},{inX:30,inY:70,outX:50,outY:50}]};
 const store={objects:[plane,f],undoStack:[],redoStack:[]}; const legacy=vm.createContext({console,structuredClone,...coords,...engineControls,...shapePreserving,buildRegionGeometry,fitObservedCurve,sampleFunctionPoints,state:{get:()=>store,update:fn=>fn(store)}});
 vm.runInContext(legacySource+"\nglobalThis.change=()=>{_planeId='p';_draft={...state.get().objects[0],xMax:20};commit();};",legacy);legacy.change();
 assert.equal(f.points[0].x,10);assert.equal(f.markers[0].x,10);assert.equal(f.guideSegs[0][0].x,10);assert.equal(f.arrowMarks[0].dx,0.5);assert.equal(f.handles[0].inX,5);assert.equal(store.undoStack.length,1);
});
test('imported label scaling preserves source sizes, guides and data on style edits',()=>{
 objects=buildNativeGraph(plan()).objects;const original=structuredClone(objects[0]);
 api.loadFromPlane(original);const cfg=api.cfg();cfg.axisLabelScale=1.33;cfg.tickLabelScale=1.25;cfg.originLabelSize=8.8;cfg.guideStyle={strokeWidth:.2,dashLength:1.2,dashGap:.9};
 const styled=api.applyCfg(structuredClone(original),cfg);
 assert.equal(styled.axisLabelSize,original.axisLabelSize*1.33);assert.equal(styled.tickLabelSize,original.tickLabelSize*1.25);assert.equal(styled.originLabelSize,8.8);assert.deepEqual(plain(styled.guideStyle),cfg.guideStyle);
 for(const key of ['xMin','xMax','yMin','yMax','explicitTicksX','explicitTicksY'])assert.deepEqual(plain(styled[key]),plain(original[key]));
 objects=[styled,objects[1]];api.loadFromPlane(styled);assert.deepEqual(plain(api.applyCfg(structuredClone(styled),api.cfg())),plain(styled));
});
fs.writeFileSync(path.join(dir,'unit-report.json'),JSON.stringify({pass:results.every(r=>r.pass),results},null,2));console.log(JSON.stringify(results,null,2));if(results.some(r=>!r.pass))process.exitCode=1;
