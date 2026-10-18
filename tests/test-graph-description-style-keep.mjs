// 설명 그래프 부분 수정: 요청에 없는 스타일(화살 길이·선 굵기)은 모델이 숫자를 다시 적어도 바꾸지 않는다(넘겨받은 알려진 문제 2).
import test from 'node:test';
import assert from 'node:assert/strict';
import {preserveDescriptionPresentation} from '../js/graph/description-presentation.js';
import {EXAM_STYLE} from '../js/graph/exam-style.js';
function fixture(){
  const style={descriptionLayout:true,labelScale:.7,arrowScale:1.45,arrowWidthScale:.72,strokeScale:1};
  const previous={plan:{frame:{arrowLength:3.6},style:{},axes:{x:{},y:{}},series:[{id:'s1',strokeWidth:.357}]},objects:[{type:'coordplane',graphStyle:{...style}},{type:'funcgraph',reconstruction:{seriesId:'s1'}}]};
  const objects=[{type:'coordplane',w:50,graphStyle:{...style,arrowScale:1}},{type:'funcgraph',reconstruction:{seriesId:'s1'}}];
  const plan={frame:{arrowLength:5.2},style:{},axes:{x:{},y:{}},series:[{id:'s1',strokeWidth:.35}]};
  return {previous,objects,plan};
}
test('요청에 화살·굵기가 없으면 이전 스타일을 지킨다',()=>{
  const {previous,objects,plan}=fixture();preserveDescriptionPresentation(objects,plan,previous,'감쇠 포락선을 추가해줘');
  assert.equal(objects[0].graphStyle.arrowScale,1.45);assert.equal(objects[1].styleOverrides,undefined);
});
test('요청이 말한 스타일은 바꾼다',()=>{
  const {previous,objects,plan}=fixture();preserveDescriptionPresentation(objects,plan,previous,'화살표를 더 크게, 선을 얇게');
  assert.equal(objects[0].graphStyle.arrowScale,5.2/EXAM_STYLE.arrowLength);assert.equal(objects[1].styleOverrides.strokeWidth.value,.35);
});
test('요청 글이 없으면 예전처럼 계획의 값을 따른다',()=>{
  const {previous,objects,plan}=fixture();preserveDescriptionPresentation(objects,plan,previous);
  assert.equal(objects[0].graphStyle.arrowScale,5.2/EXAM_STYLE.arrowLength);
});
