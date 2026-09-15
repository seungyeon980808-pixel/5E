import {test} from 'node:test';
import assert from 'node:assert/strict';
import {composeReferenceImages, planReferenceLayout} from '../js/ai-reference-composite.js';
import {normalizeReferenceComposition} from '../js/ai-source-tasking.js';
test('auto chooses aspect-aware rows while preserving source proportions', () => {
  const items = [{sourceId:'a',width:400,height:100},{sourceId:'b',width:400,height:100}];
  const result = planReferenceLayout(items, 'auto');
  assert.equal(result.height, 200);
  assert.equal(result.width, 400);
  assert.ok(result.rects.every(rect => rect.width / rect.height === 4));
});
test('free placement fits aspect and bounds while retaining positions', () => {
  const result = planReferenceLayout([{sourceId:'a',width:400,height:100}], 'free', {width:100,height:100,placements:[{sourceId:'a',x:10,y:20,width:80,height:70}]});
  assert.deepEqual(result.rects[0], {sourceId:'a',order:0,x:10,y:20,width:80,height:20});
});
test('composition snapshots valid free geometry and filters removed source placements', () => {
  const value = {orientation:'free',layout:{width:100,height:100,placements:[{sourceId:'a',x:0,y:0,width:50,height:50},{sourceId:'removed',x:0,y:0,width:50,height:50}]}};
  const result = normalizeReferenceComposition(value,[{id:'a'}]);
  assert.equal(result.orientation,'free');
  assert.equal(result.layout.placements.length,1);
  value.layout.placements[0].x = 20;
  assert.equal(result.layout.placements[0].x,0);
});
test('overlapping transparent free sources blend with the underlying source', async () => {
  const sources = [{id:'a',image:{width:1,height:1,data:new Uint8Array([255,0,0,255])}},{id:'b',image:{width:1,height:1,data:new Uint8Array([0,0,255,128])}}];
  const result = await composeReferenceImages({sources,orientation:'free',layout:{width:1,height:1,placements:sources.map(source=>({sourceId:source.id,x:0,y:0,width:1,height:1}))}});
  assert.deepEqual([...result.pixels],[127,0,128,255]);
});
