import test from 'node:test';
import assert from 'node:assert/strict';
import {IDENTITY,mapPoint,inverseMatrix,multiplyMatrix,fitThreePoints,sourceFrameMatrix,axisLandmarks,normalizeTraceState,traceMatrixForPlane} from '../js/graph/trace-coordinates.js';
const near=(a,b)=>{assert.ok(Math.abs(a.x-b.x)<1e-8,JSON.stringify({a,b}));assert.ok(Math.abs(a.y-b.y)<1e-8);};
const p={x:-25,y:-15,w:50,h:30,xMin:-2,xMax:8,yMin:-3,yMax:3};
test('off-center crop registration maps both frame edges exactly',()=>{
 const m=sourceFrameMatrix({width:800,height:600,plotBox:{x:120,y:90,w:500,h:300}},p);
 near(mapPoint(m,{x:120,y:90}),{x:-25,y:-15});near(mapPoint(m,{x:620,y:390}),{x:25,y:15});
});
test('manual image fit preserves aspect ratio rather than stretching to plane',()=>{
 const m=sourceFrameMatrix({width:400,height:400},p);assert.equal(m[0],m[3]);near(mapPoint(m,{x:200,y:200}),{x:0,y:0});
});
test('affine calibration maps three correspondences and inverse restores editing coordinates',()=>{
 const source=[{x:-10,y:8},{x:45,y:8},{x:-10,y:-30}], target=[{x:120,y:350},{x:560,y:370},{x:130,y:50}];
 const m=fitThreePoints(source,target);source.forEach((point,i)=>near(mapPoint(m,point),target[i]));
 near(mapPoint(inverseMatrix(m),mapPoint(m,{x:13.2456,y:-7.88})),{x:13.2456,y:-7.88});
});
test('invalid collinear calibration is rejected instead of destroying registration',()=>{
 assert.throws(()=>fitThreePoints([{x:0,y:0},{x:1,y:0},{x:2,y:0}],[{x:0,y:0},{x:1,y:0},{x:0,y:1}]));
 assert.throws(()=>fitThreePoints([{x:0,y:0},{x:1,y:0},{x:0,y:1}],[{x:0,y:0},{x:1,y:0},{x:2,y:0}]));
});
test('axis landmarks honor fractional axis positions and log frame rails',()=>{
 near(axisLandmarks({...p,axisPlacement:{x:{mode:'fraction',value:.25},y:{mode:'fraction',value:.7}}}).points[0],{x:10,y:7.5});
 near(axisLandmarks({...p,xScale:'log',xMin:1,xMax:100}).points[0],{x:-25,y:15});
});
test('top-right axes choose opposite reference ends without collapsing basis',()=>{
 const landmarks=axisLandmarks({...p,axisPlacement:{x:{mode:'fraction',value:1},y:{mode:'fraction',value:1}}});
 assert.equal(landmarks.xEnd,'왼쪽');assert.equal(landmarks.yEnd,'아래쪽');assert.deepEqual(fitThreePoints(landmarks.points,landmarks.points),[...IDENTITY]);
});
test('state normalizer rejects singular matrices and source frame rejects empty images',()=>{
 assert.deepEqual(normalizeTraceState({graphMatrix:[0,0,0,0,0,0],opacity:8,mode:'bad'}),{version:1,previewZoom:100,graphMatrix:[...IDENTITY],opacity:1,mode:'graph',wipePosition:0.5});
 assert.throws(()=>sourceFrameMatrix({width:0,height:500},p));
});
test('registration composition changes only display positions and preserves input data',()=>{
 const input=structuredClone(p), m=[2,0,0,2,20,-3];
 near(mapPoint(multiplyMatrix(m,inverseMatrix(m)),{x:1.3,y:7.8}),{x:1.3,y:7.8});
 sourceFrameMatrix({width:100,height:100},p);axisLandmarks(p);assert.deepEqual(p,input);
});

test('saved registration follows moved or resized graph frames without changing its relative alignment',()=>{
 const state={graphMatrix:[1,0,0,1,5,-3],frame:{x:-25,y:-15,w:50,h:30}};
 const newPlane={x:100,y:200,w:100,h:60};
 const m=traceMatrixForPlane(state,newPlane);
 near(mapPoint(m,{x:100,y:200}),{x:110,y:194});
});

test('value mode matches rendered zero axis rather than interpreting its disabled numeric field',()=>{
 const plane={...p,axisPlacement:{x:{mode:'value',value:2},y:{mode:'value',value:5}}};
 near(axisLandmarks(plane).points[0],{x:-15,y:0});
 const positive={...plane,xMin:2,xMax:12,yMin:4,yMax:10};
 near(axisLandmarks(positive).points[0],{x:-35,y:35});
 near(axisLandmarks({...positive,reconstruction:{preserveAxes:true}}).points[0],{x:-25,y:15});
});
test('explicit tick labels do not relocate the log frame axis intersection',()=>{
 near(axisLandmarks({...p,xScale:'log',xMin:10,xMax:1000,explicitTicksX:[{value:100,label:'100'}],axisPlacement:{y:{mode:'fraction',value:.8}}}).points[0],{x:-25,y:15});
});
