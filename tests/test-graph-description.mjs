import test from 'node:test';
import assert from 'node:assert/strict';
import { graphDescriptionSource, buildGraphDescriptionPrompt, prepareGraphDescriptionPlan, compactGraphDescriptionObjects } from '../js/graph/description-contract.js';
import { graphLabelUnitSource, graphLabelRuns } from '../js/graph/label-roles.js';
import { validateGraphPlan } from '../js/graph/reconstruction-contract.js';
import { recoverTaskWorkspaceSnapshot } from '../js/ai-task-workspaces.js';
import { normalizeAIWorkflowKind, isGraphWorkflow, isCreationWorkflow } from '../js/ai-workflow-kinds.js';
import { descriptionAxisTitle, descriptionTitleLayout, descriptionSeriesLabelPositions, descriptionTickLabelLanes } from '../js/graph/description-layout.js';
import { physicsFunctionReference } from '../js/graph/physics-function-reference.js';
import { examPlaneStyle } from '../js/graph/exam-style.js';

test('graph description binding tracks draft and previous editable plan', async () => {
  const source = await graphDescriptionSource('y=x^2');
  assert.deepEqual(source, await graphDescriptionSource(' y=x^2 '));
  assert.notDeepEqual(source, await graphDescriptionSource('y=x^3'));
  assert.notDeepEqual(source, await graphDescriptionSource('y=x^2', { axes: {} }));
  assert.notDeepEqual(await graphDescriptionSource('수정', {}, [{labelY:'속도'}]), await graphDescriptionSource('수정', {}, [{labelY:'빠르기'}]));
  assert.match(buildGraphDescriptionPrompt(source, '수정', {}, [{labelY:'빠르기'}]), /현재 객체를 우선/);
  for (const invalid of ['', ' ', null, 'x'.repeat(20001)]) await assert.rejects(graphDescriptionSource(invalid));
});

test('followup context omits cached analytic samples and preserves exact observations and manual edits', () => {
  const objects = [
    {type:'coordplane',labelY:'f(t)\n(cm)',labelYPos:{fx:-.12,fy:.08},explicitTicksX:[{value:.125,label:'t_0'}],reconstruction:{axes:{y:{unit:'cm'}},quality:{status:'review'}}},
    {type:'funcgraph',expr:'10*cos(2*x)',points:Array.from({length:400},(_,i)=>({x:i/50,y:Math.cos(i/25)})),mathPoints:[{x:0,y:10}],domainMin:0,domainMax:8,offset:{dx:0,dy:0},styleOverrides:{strokeWidth:{value:.21,width:50}}},
    {type:'funcgraph',sourceKind:'points',points:[{x:2.1,y:3.1}],mathPoints:[{x:.123456789,y:.1100123}],handles:[{inX:1,inY:2,outX:3,outY:4}],reconstruction:{certainty:'exact'}},
  ];
  const before=structuredClone(objects), compact=compactGraphDescriptionObjects(objects);
  assert.deepEqual(objects,before);
  assert.equal(compact[1].points,undefined);
  assert.equal(compact[1].mathPoints,undefined);
  for(const key of ['expr','domainMin','domainMax','offset','styleOverrides']) assert.deepEqual(compact[1][key],objects[1][key]);
  assert.deepEqual(compact[2],objects[2]);
  assert.deepEqual(compact[0].explicitTicksX,objects[0].explicitTicksX);
  assert.deepEqual(compact[0].labelYPos,objects[0].labelYPos);
  assert.ok(JSON.stringify(compact).length < JSON.stringify(objects).length/5);
});

test('semantic axis units never turn a function argument into upright unit text', () => {
  for(const text of ['f(t)','g(x+1)','f(g(t))']) {
    assert.equal(graphLabelUnitSource(text,''),text);
    assert.ok(graphLabelRuns(text,false).filter(r=>/[a-z]/.test(r.text)).every(r=>r.kind==='math'));
  }
  assert.equal(graphLabelUnitSource('f(t)\n(cm)','cm'),'f(t)\n(\\mathrm{cm})');
  assert.equal(graphLabelUnitSource('a(m / s^2)','m/s^2'),'a(\\mathrm{m/s^2})');
  assert.equal(graphLabelUnitSource('f(t)(s)','s'),'f(t)(\\mathrm{s})');
  assert.equal(graphLabelUnitSource('f(t)','s'),'f(t)','Only the declared unit suffix is tagged');
  assert.ok(graphLabelRuns('v(m/s)').find(r=>r.text==='(m/s)'&&r.kind==='unit'),'Legacy unit lettering remains compatible');
});

test('nearby numeric and symbolic ticks keep every label in separate rows without moving manual labels', () => {
  const labels=[{id:'3',x:30,y:5,width:4,height:3},{id:'pi',x:31.416,y:5,width:4,height:3},{id:'4',x:40,y:5,width:4,height:3}];
  const before=structuredClone(labels), placed=descriptionTickLabelLanes(labels,.5);
  assert.deepEqual(labels,before);
  assert.deepEqual(placed.map(p=>[p.id,p.dy]),[['3',0],['pi',3.5],['4',0]]);
  assert.deepEqual(descriptionTickLabelLanes([...labels].reverse(),.5),placed);
  const pinned=descriptionTickLabelLanes([{...labels[0],pinned:true},{...labels[1],pinned:true}],.5);
  assert.ok(pinned.every(p=>p.dy===0),'A manual position is never silently overwritten');
  assert.deepEqual(descriptionTickLabelLanes([],1),[]);
});

test('qualitative and numeric prompt examples both satisfy the native graph contract', async () => {
  const source = await graphDescriptionSource('시간과 속도');
  const prompt = buildGraphDescriptionPrompt(source, '시간과 속도');
  for (const marker of ['QUALITATIVE_EXAMPLE: ', 'NUMERIC_EXAMPLE: ']) {
    const plan = JSON.parse(prompt.split(marker)[1].split('\n')[0]);
    const checked = validateGraphPlan(prepareGraphDescriptionPlan(plan), { source });
    assert.equal(checked.ok, true, JSON.stringify(checked.errors));
    assert.equal(checked.blocked, false);
  }
  assert.ok(prompt.endsWith('시간과 속도'));
  assert.match(prompt, /수치·계수를 발명하지/);
});

test('four workflows survive recovery and legacy short-description tasks migrate', () => {
  assert.equal(normalizeAIWorkflowKind('image', true), 'image-create');
  const restored = recoverTaskWorkspaceSnapshot({ tabs: [
    { id: 'legacy', conversionKind: 'image', examBriefProfile: 'exam-brief-v1', input: '빗면 위 A' },
    { id: 'graph-create', conversionKind: 'graph-create', input: 'y=x^2' },
    { id: 'image', conversionKind: 'image' }, { id: 'graph', conversionKind: 'graph' },
  ] });
  assert.deepEqual(restored.tabs.map(t => t.conversionKind), ['image-create','graph-create','image','graph']);
  assert.equal(restored.tabs[1].input, 'y=x^2');
  assert.ok(isGraphWorkflow('graph-create') && isGraphWorkflow('graph'));
  assert.ok(isCreationWorkflow('image-create') && isCreationWorkflow('graph-create'));
  assert.equal(isCreationWorkflow('graph'), false);
});

test('creation layout separates axis titles and prints bar categories only once', () => {
  const plan = { axes: { x: { ticks: [{value:1,label:'A'}] }, y: {} }, series: [{kind:'bar',items:[{x:1,value:3,label:'A'},{x:2,value:5,label:'top label'}]}] };
  const prepared = prepareGraphDescriptionPlan(plan);
  assert.equal(prepared.series[0].items[0].label, '');
  assert.equal(prepared.series[0].items[1].label, 'top label');
  assert.equal(prepared.series[0].items[0].value, 3);
  assert.equal(plan.series[0].items[0].label, 'A');
  assert.equal(prepared.axes.x.titlePosition, undefined, 'The renderer measures automatic title positions');
  assert.equal(prepared.axes.y.titlePosition, undefined);
});

test('qualitative interior axes keep titles with their axes without changing physical observations', async () => {
  const source = await graphDescriptionSource('광전류와 음의 저지전압');
  const prompt = buildGraphDescriptionPrompt(source, '광전류와 음의 저지전압');
  const plan = JSON.parse(prompt.split('QUALITATIVE_EXAMPLE: ')[1].split('\n')[0]);
  plan.axisPlacement = { x: {mode:'fraction',value:0}, y: {mode:'fraction',value:0.4} };
  const prepared = prepareGraphDescriptionPlan(plan);
  assert.equal(validateGraphPlan(prepared, {source}).ok, true);
  assert.deepEqual(prepared.axisPlacement, plan.axisPlacement);
  assert.deepEqual(prepared.series, plan.series);
  assert.deepEqual(prepared.axes.x.ticks, plan.axes.x.ticks);
  plan.axes.y.titlePosition = {x:0.6,y:0.95};
  assert.deepEqual(prepareGraphDescriptionPlan(plan).axes.y.titlePosition, {x:0.6,y:0.95});
});

test('axis captions keep x inline and y stacked without mistaking function arguments for units', () => {
  for (const title of ['V_C', 'V_C(V)', 'V_C ( V )', 'V_C\n(V)', 'V_C（V）']) {
    assert.equal(descriptionAxisTitle({title,unit:'V'}), 'V_C\n(V)');
  }
  assert.equal(descriptionAxisTitle({title:'角振動数',displayMath:'\\omega',unit:'rad/s'}), '\\omega\n(rad/s)');
  assert.equal(descriptionAxisTitle({title:'x ( m / s^2 )',unit:'m/s^2'}), 'x\n(m/s^2)');
  assert.equal(descriptionAxisTitle({title:'f(t)',unit:''}), 'f(t)');
  assert.equal(descriptionAxisTitle({title:'t',displayTitle:'時間',unit:'s'}), '時間\n(s)');
  for (const title of ['t', 't(s)', 't\n(s)', 't（s）']) assert.equal(descriptionAxisTitle({title,unit:'s'},'x'), 't(s)');
  assert.equal(descriptionAxisTitle({title:'t_0',unit:'s'},'x'),'t_0(s)');
  assert.equal(descriptionAxisTitle({title:'f(t)',unit:''},'x'),'f(t)');
  assert.equal(descriptionAxisTitle({title:'V_C',displayMath:'V_{\\mathrm{C}}',unit:'V'}),'V_{\\mathrm{C}}\n(V)');
});

test('stacked titles stay below x / left of y, clear ticks, fit exports and scale with the graph', () => {
  const geometry = {left:170,right:1050,top:100,axisX:170,axisY:710,viewport:{left:0,right:1280,top:0,bottom:900},width:90,height:100,gap:22,tickClearance:64};
  const x = descriptionTitleLayout({...geometry,which:'x'});
  assert.equal(x.anchor,'middle');
  assert.ok(x.y-geometry.height/2 >= geometry.axisY+geometry.tickClearance);
  assert.ok(x.y+geometry.height/2 <= geometry.viewport.bottom-geometry.gap);
  const y = descriptionTitleLayout({...geometry,which:'y'});
  assert.equal(y.anchor,'middle');
  assert.ok(y.x+geometry.width/2 <= geometry.axisX-geometry.gap);
  assert.ok(y.y-geometry.height/2 >= geometry.viewport.top+geometry.gap);
  const long = descriptionTitleLayout({...geometry,which:'x',width:300});
  assert.ok(long.x-150 >= geometry.viewport.left && long.x+150 <= geometry.viewport.right);
  const wideY = descriptionTitleLayout({...geometry,which:'y',width:300});
  assert.ok(wideY.sizeScale<1);
  assert.ok(wideY.x-150*wideY.sizeScale >= geometry.viewport.left+geometry.gap-1e-12);
  assert.ok(wideY.x+150*wideY.sizeScale <= geometry.axisX-geometry.gap);
  const interior = descriptionTitleLayout({...geometry,which:'x',axisY:420});
  assert.ok(interior.y-geometry.height/2 >= 420+geometry.tickClearance);
  const scaled = {...geometry,viewport:Object.fromEntries(Object.entries(geometry.viewport).map(([k,v])=>[k,v/2]))};
  for (const k of ['left','right','top','axisX','axisY','width','height','gap','tickClearance']) scaled[k] /= 2;
  for (const [which,layout] of [['x',x],['y',y]]) assert.deepEqual(descriptionTitleLayout({...scaled,which}), {...layout,x:layout.x/2,y:layout.y/2});
});

test('creation typography and arrow length survive the exam preset without changing ranges', () => {
  const plane = {w:70,xMin:-2,xMax:10,yMin:-1,yMax:1,graphStyle:{preset:'kice-v1',labelScale:.7,arrowScale:1.45,arrowWidthScale:.72}};
  const styled = examPlaneStyle(plane);
  assert.ok(Math.abs(styled.axisArrowLength - 3.6*1.45)<1e-12);
  assert.equal(styled.axisArrowWidthScale,.72);
  assert.equal(styled.axisLabelSize,4.8*.7);
  for(const k of ['xMin','xMax','yMin','yMax']) assert.equal(styled[k],plane[k]);
  assert.equal(plane.axisArrowLength,undefined);
});

test('physics references are scoped to the described situation, including compound requests', () => {
  assert.equal(physicsFunctionReference('막대 그래프'), '');
  assert.match(physicsFunctionReference('감쇠 진동'), /v0\+beta\*q0/);
  assert.doesNotMatch(physicsFunctionReference('감쇠 진동'), /Vstart/);
  const compound=physicsFunctionReference('RC 충전과 감쇠 강제 진동 공명');
  for(const id of ['damped:','resonance:','rc:']) assert.ok(compound.includes(id));
  assert.match(physicsFunctionReference('광전효과 전류'), /유일한 해석식으로 정해지지/);
});

test('converging series labels separate at peaks while observations and isolated labels survive', () => {
  const curves=[
    {endLabel:'A',points:[{x:0,y:5},{x:4,y:0},{x:10,y:5}]},
    {endLabel:'B',points:[{x:0,y:5},{x:4,y:3},{x:10,y:5.01}]},
    {endLabel:'C',points:[{x:0,y:0},{x:4,y:-4},{x:10,y:-5}]},
  ];
  const before=structuredClone(curves),labels=descriptionSeriesLabelPositions(curves,1);
  assert.equal(labels.length,2);
  assert.ok(Math.abs(labels[0].y-labels[1].y)>=1.6);
  assert.deepEqual(labels.map(l=>l.to),[{x:4,y:0},{x:4,y:3}]);
  assert.deepEqual(curves,before);
});
