import assert from 'node:assert/strict';
import {inferAxisStep, axisMargins, extendGuideGrid} from '../js/graph/axis-layout.js';

assert.equal(inferAxisStep({min:0,max:4.598,ticks:[.5023,1,1.494,2,2.4986,3].map(value=>({value}))}),.5);
assert.equal(inferAxisStep({min:0,max:6.485,ticks:[1,2.0072,3,3.9888,5].map(value=>({value}))}),1);
assert.equal(inferAxisStep({min:0,max:100,ticks:[]}),20);
assert.equal(inferAxisStep({min:0,max:6,step:2,ticks:[{value:1.1},{value:3.7}]}),2);
const plane={xMin:0,xMax:4.598,yMin:0,yMax:6.485,gridStepX:1,gridStepY:1,explicitTicksX:[1,2,3].map(value=>({value})),explicitTicksY:[1,3,5].map(value=>({value}))};
assert.deepEqual(axisMargins(plane,'x'),{positive:1.598,negative:0});
const guides=[
  ...[1,3,4.9924].map((y,i)=>({id:`h${i}`,kind:'guide',x:3.0009,y,to:{x:0,y},seriesId:'p',anchorX:3})),
  ...[1,2,3.0009].map((x,i)=>({id:`v${i}`,kind:'guide',x,y:4.9924,to:{x,y:0}})),
  {id:'label',kind:'text',text:'P',x:3.4,y:5.4},
  {id:'projection',kind:'guide',x:2,y:3,to:{x:2,y:0}},
];
const before=structuredClone(guides),right=extendGuideGrid(guides,plane,'gridOverXPos',.4);
assert.deepEqual(guides,before,'The source annotations are never mutated');
assert.equal(right[0].x,3.4);
assert.equal(right[0].y,1);
assert.equal(right[0].anchorX,3);
assert.deepEqual(right.slice(3),guides.slice(3),'Vertical guides, labels and single projections retain their coordinates');
const top=extendGuideGrid(right,plane,'gridOverYPos',.3);
assert.equal(top[3].y,5.3);
assert.equal(top[3].x,1);
const reset=extendGuideGrid(top,plane,'gridOverXPos',0);
assert.equal(reset[0].x,3);
assert.equal(reset[3].y,5.3);
assert.deepEqual(extendGuideGrid(guides.slice(-2),plane,'gridOverXPos',.4),guides.slice(-2),'A single projection is not a grid');
assert.deepEqual(extendGuideGrid(guides,{...plane,xScale:'log'},'gridOverXPos',.4),guides);
console.log('Graph axis layout: intervals, shared grid ends and protected anchors passed');
