import test from 'node:test';
import assert from 'node:assert/strict';

for (const directory of ['js']) {
  const { collectScopedAreaComments, buildScopedEditPrompt } = await import(`../${directory}/ai-scoped-edit-prompt.js`);
  const comments = [
    {type:'area', imageId:'v1', number:2, x:10,y:10,w:30,h:40,text:'  왼쪽 구슬을 오른쪽으로 이동  '},
    {type:'area', imageId:'v1', number:5, x:60,y:10,w:30,h:40,text:'구슬을 두 개 추가'},
  ];
  test(`${directory}: each instruction retains its own box, number and pixel bounds`, () => {
    const before = structuredClone(comments);
    const rectangles = [{x0:10,y0:10,x1:40,y1:50},{x0:60,y0:10,x1:90,y1:50}];
    const prompt = buildScopedEditPrompt({session:{width:100,height:100,rectangles},comments,candidateId:'v1'});
    const paired = JSON.parse(prompt.split('Each instruction belongs only to its paired box:\n')[1].split('\nDo not restyle')[0]);
    assert.deepEqual(paired, comments.map((c,i)=>({box:c.number,allowed_pixels:rectangles[i],instruction:c.text.trim()})));
    assert.match(prompt,/INCLUDING unrequested content inside the boxes/);
    assert.match(prompt,/Outside the union.*change zero pixels/);
    assert.match(prompt,/EDIT_SCOPE_TOO_SMALL/);
    assert.deepEqual(comments,before);
  });
  test(`${directory}: empty, unrelated and invalid scopes cannot produce a request`, () => {
    for (const invalid of [[], [{type:'point',text:'move'}], [{...comments[0],text:' '}], [{...comments[0],imageId:'v2'}], [{...comments[0],w:0}], [{...comments[0],x:90}], [{...comments[0],x:NaN}]]) {
      assert.throws(()=>collectScopedAreaComments(invalid,'v1'));
    }
    assert.throws(()=>buildScopedEditPrompt({session:{rectangles:[]},comments,candidateId:'v1'}));
  });
}

test('partial edits bypass global processing on display, export and insertion', async () => {
  const {resolveImageOutput} = await import('../js/ai-output-processing.js');
  const data = 'data:image/png;base64,exact-composite';
  let calls = 0;
  const transform = () => {calls++;return 'processed';};
  const options = {backgroundPolicy:'transparent',examPalette:true,lineThickness:2};
  assert.equal(await resolveImageOutput({data,reviewState:'scoped-applied'},options,transform),data);
  assert.equal(calls,0);
  assert.equal(await resolveImageOutput({data},options,transform),'processed');
  assert.equal(calls,1);
});
