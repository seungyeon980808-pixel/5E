const test = require('node:test');
const assert = require('node:assert/strict');
const route=(kind='quadratic',end='circle')=>({kind,attachment:'frame',start:{x:.1,y:.2},target:{x:.8,y:.7},controls:kind==='straight'?[]:kind==='cubic'?[{x:.2,y:.8},{x:.6,y:.1}]:[{x:.2,y:.8}],end});

test('v4 parser refuses invalid route instead of downgrading and native factory retains world routes',async()=>{const {parseEditableImageLabelPlan,createEditableImageLabelObjects}=await import('../js/ai-editable-image-labels.js');const label={text:'콩팥',mode:'leader',sourceKind:'reference',sourceRef:1,anchor:{x:.8,y:.7},position:{x:.1,y:.1},leaderRoutes:[route()],typography:{role:'text',bounds:{x:.05,y:.05,w:.1,h:.1}}};const parse=l=>parseEditableImageLabelPlan('<5e-editable-labels>'+JSON.stringify({version:4,labels:[l],reviewRequired:false})+'</5e-editable-labels>',{preserveSourceLabels:true,referenceCount:1});const plan=parse(label);assert.equal(plan.labels.length,1);const [obj]=createEditableImageLabelObjects({labels:plan.labels,image:{id:'im',x:0,y:0,w:100,h:100},idFactory:()=> 'l'});assert.deepEqual(obj.leaderRoutes[0].controls,[{x:20,y:80}]);assert.equal(parse({...label,leaderRoutes:[{...route(),kind:'unsupported'}]}).labels.length,0);});

test('general scope filtering keeps excluded source text in the review plan', async () => {
  const { parseEditableImageLabelPlan, createEditableImageLabelObjects, withEditableImageLabelPlan } = await import('../js/ai-editable-image-labels.js');
  const labels = [
    { text: 'A', scope: 'general' }, { text: '눈금', scope: 'graph' },
    { text: '세로 문구', scope: 'non_graph_vertical_deferred' }, { text: '불명', scope: 'unsupported' },
  ].map(label => ({ ...label, sourceKind: 'reference', sourceRef: 1, mode: 'text', position: { x: 0.5, y: 0.5 } }));
  const evidence = { preserveSourceLabels: true, referenceCount: 1 };
  const plan = parseEditableImageLabelPlan(`<5e-editable-labels>${JSON.stringify({ version: 2, labels, reviewRequired: false })}</5e-editable-labels>`, evidence);
  assert.deepEqual(plan.labels.map(l => l.text), ['A']);
  assert.deepEqual(plan.excludedLabels.map(l => l.text), ['눈금', '세로 문구', '불명']);
  assert.equal(plan.reviewRequired, true);
  assert.equal(createEditableImageLabelObjects({ labels: plan.excludedLabels, image: { id: 'i', x: 0, y: 0, w: 10, h: 10 }, idFactory: () => 'l' }).length, 0);
  const prompt = withEditableImageLabelPlan('변환', evidence);
  assert.match(prompt, /제외된 graph와 non_graph_vertical_deferred 항목은 제거하지 않는다/);
  assert.match(prompt, /쉼표·구분점도 원문의 구성 요소/);
});
