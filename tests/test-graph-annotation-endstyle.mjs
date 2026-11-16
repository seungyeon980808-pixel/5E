// 순환 과정 그래프: 모델이 화살 표기에 endStyle:'arrow'를 적어도 막히지 않고 none으로 정리된다(넘겨받은 알려진 문제 3).
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGraphPlan} from '../js/graph/reconstruction-contract.js';
import {graphDescriptionSource} from '../js/graph/description-contract.js';
test('점이 아닌 표기의 모르는 endStyle은 none으로 정리, 점 표기는 그대로 검사',async()=>{
  const source=await graphDescriptionSource('순환');
  const plan={source:{...source,plotBox:{x:0,y:0,w:source.width,h:source.height}},coordinateMode:'exact',axes:{x:{title:'V',min:0,max:3},y:{title:'P',min:0,max:5}},
    series:[{id:'s',kind:'polyline',points:[{x:1,y:4},{x:2,y:2},{x:2,y:4},{x:1,y:4}]}],
    annotations:[{id:'d',kind:'arrow',text:'',x:1.5,y:3,to:{x:1.6,y:2.8},axis:'y',coordinateSpace:'data',orientation:'horizontal',endStyle:'arrow'}]};
  const r=validateGraphPlan(plan,{source:plan.source});
  assert.ok(!r.errors?.some(e=>e.path==='annotations.0.endStyle'),JSON.stringify(r.errors));
  assert.equal(r.plan.annotations[0].endStyle,'none');assert.equal(plan.annotations[0].endStyle,'arrow','입력은 바꾸지 않는다');assert.ok(r.review.some(x=>x.path==='annotations.0.endStyle'));
  const point=structuredClone(plan);point.annotations[0]={id:'p',kind:'point',text:'A',x:1,y:4,axis:'y',coordinateSpace:'data',orientation:'horizontal',endStyle:'arrow'};
  assert.ok(validateGraphPlan(point,{source:plan.source}).errors.some(e=>e.path==='annotations.0.endStyle'),'점 표기의 잘못된 값은 그대로 오류');
});
