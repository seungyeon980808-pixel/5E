import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFlowSteps, parsePlotTable, buildFlowchart } from '../js/figure-studio-model.js';
import { planDataPlot, insertDataPlot } from '../js/data-plot.js';
import { state } from '../js/state.js?v=1.7.0-four-session-integration';

test('table import accepts spreadsheet tabs, strict CSV quotes, semicolons and exponents', () => {
  assert.deepEqual(parsePlotTable('시간(s)\t거리(m)\n0\t0\n1\t2.1'), { labels: ['시간(s)', '거리(m)'], points: [{x:0,y:0},{x:1,y:2.1}] });
  for (const table of ['0,1\n1,2', '0;1\n1;2', '0 1\n1 2']) assert.equal(parsePlotTable(table).points.length, 2);
  assert.deepEqual(parsePlotTable('"x,축","y축"\n"1,000",2e-3\n2000,4').points, [{x:1000,y:.002},{x:2000,y:4}]);
});
test('bad numeric rows are never silently omitted or parsed as truncated numbers', () => {
  for (const row of ['1,2oops', '1,', '1,2,3', '1,Infinity', '1,"2', '1,"2"oops', '1 2']) {
    assert.throws(() => parsePlotTable(`x,y\n0,0\n${row}`), /3행/);
  }
  assert.throws(() => parsePlotTable('0,0'), /두 행/);
  assert.throws(() => parsePlotTable(Array.from({length:1001}, (_,i) => `${i},${i}`).join('\n')), /1,000행/);
});
test('flowchart fits both layouts, labels remain on native boxes and arrow order follows input', () => {
  const steps = parseFlowSteps('문제 인식 → 가설 설정 -> 탐구 수행\n결론 도출');
  for (const layout of ['vertical', 'horizontal']) {
    const objects = buildFlowchart(steps, {layout, artboard:{w:150,h:100}, makeId:i=>`test-${i}`});
    assert.equal(objects.length, 7); assert.equal(new Set(objects.map(o=>o.id)).size, 7);
    assert.deepEqual(objects.filter(o=>o.type==='rect').map(o=>o.labelInner.replaceAll('\n','')), steps);
    for (const o of objects.filter(o=>o.type==='rect')) { assert.ok(o.x>=-75 && o.y>=-50); assert.ok(o.x+o.w<=75 && o.y+o.h<=50); }
    for (const o of objects.filter(o=>o.type==='line')) { assert.equal(o.arrowHead,'end'); assert.ok(layout==='vertical' ? o.p2.y>o.p1.y : o.p2.x>o.p1.x); }
  }
  assert.throws(()=>parseFlowSteps('한 단계'), /두 개/);
  assert.throws(()=>buildFlowchart(['가'.repeat(60),'나'.repeat(60)],{artboard:{w:30,h:30}}), /글자/);
});
test('plot planning is pure, has numeric native markers and can reuse the existing plane', () => {
  const snapshot={objects:[{id:'prior',type:'rect'}], selectedIds:[], viewBox:{x:-55,y:-40,w:110,h:80},activeLayerId:1};
  const original=structuredClone(snapshot);let i=0;
  const plan=planDataPlot([{x:-1,y:2},{x:3,y:4}],{connect:true,labels:['시간','거리'],size:{w:66,h:36},center:{x:0,y:0}},snapshot,()=>`p${i++}`);
  assert.equal(plan.ok,true);assert.deepEqual(snapshot,original);
  assert.deepEqual(plan.objects.map(o=>o.type),['coordplane','polyline','optics','optics']);
  assert.equal(plan.plane.labelX,'시간');assert.equal(plan.plane.x,-33);
  const reused=planDataPlot([{x:0,y:1}],{}, {...snapshot,objects:[plan.plane],selectedIds:[plan.plane.id]},()=>`r${i++}`);
  assert.equal(reused.objects.length,1);assert.equal(reused.plane,plan.plane);
  assert.equal(planDataPlot([{x:Infinity,y:1}],{},snapshot).ok,false);
  assert.equal(planDataPlot([{x:0,y:0},{x:1e-100,y:2e-100}],{},snapshot).ok,true);
});
test('legacy data modal insertion still records one undo step and retains existing objects', () => {
  const previous=structuredClone(state.get());
  try {
    state.update(s=>{s.objects=[{id:'keep',type:'rect',x:0,y:0,w:4,h:4}];s.selectedIds=[];s.undoStack=[];s.redoStack=[[]];});
    assert.equal(insertDataPlot([{x:0,y:0},{x:1,y:2}],{connect:true}).ok,true);
    assert.equal(state.get().objects[0].id,'keep');assert.equal(state.get().undoStack.length,1);
    assert.deepEqual(state.get().undoStack[0],[{id:'keep',type:'rect',x:0,y:0,w:4,h:4}]);assert.equal(state.get().redoStack.length,0);
    assert.equal(state.get().selectedIds.length,3);
  } finally { state.update(s=>Object.assign(s,previous)); }
});
