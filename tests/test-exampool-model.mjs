import test from 'node:test';
import assert from 'node:assert/strict';
import {newQuestion,confirmFigure,questionHandoff,encodePool,decodePool,decodePoolBundle} from '../js/exampool-model.js';
const drawing = {version:1,pages:[{id:'p1',objects:[]}],activePageId:'p1'};
const snapshot = id => ({id,name:'검증용 그림',source:structuredClone(drawing),render:null,
  png:'data:image/png;base64,AA==',capturedAt:'2026-10-13T08:00:00Z',widthMm:40,heightMm:20,pixelWidth:200,pixelHeight:100});
test('new items and individual choices retain independent identities through file roundtrip', () => {
  const one = newQuestion('4'), two = newQuestion('5');
  assert.notEqual(one.id,two.id);assert.equal(new Set(one.choices.map(row => row.id)).size,5);
  const restored = decodePool(encodePool([one,two]));assert.deepEqual(restored,[one,two]);
});
test('handoff blocks a draft and passes only the immutable confirmed snapshot', () => {
  const item = newQuestion('4');item.ask = '검증용 발문';item.asset = {id:'asset1',draft:snapshot('draft1'),confirmed:null};
  assert.throws(() => questionHandoff(item),/확정/);
  const confirmed = confirmFigure(item);confirmed.asset.draft.source.pages[0].objects.push({id:'working'});
  assert.equal(confirmed.asset.confirmed.source.pages[0].objects.length,0);
  confirmed.asset.draft = snapshot('draft2');
  const packet = questionHandoff(confirmed);assert.equal(packet.figure.id,'draft1');assert.equal(packet.figure.assetId,'asset1');
  packet.figure.source.pages[0].objects.push({id:'output'});assert.equal(confirmed.asset.confirmed.source.pages[0].objects.length,0);
});
test('import validates all sources and rejects duplicate IDs without returning partial items', () => {
  const one = newQuestion();one.asset = {id:'asset1',draft:snapshot('draft1'),confirmed:null};
  let checked = 0;decodePool(encodePool([one]), () => {checked++;});assert.equal(checked,1);
  assert.throws(() => decodePool(encodePool([one]),() => {throw new Error('invalid source');}),/invalid source/);
  assert.throws(() => decodePool(encodePool([one,one])),/중복/);
  const bad = structuredClone(one);bad.choices[1].id = bad.choices[0].id;assert.throws(() => encodePool([bad]),/선지/);
});
test('text-only items pass the same existing ExamPool content field names', () => {
  const item = newQuestion('3');item.ask = '검증용 발문';item.passage = '검증용 지문';
  item.bogi_items = [{id:'bogi1',label:'ㄱ',text:'검증용 보기'}];
  const packet = questionHandoff(item);assert.equal(packet.figure,null);assert.equal(packet.question.passage,item.passage);
  assert.equal(packet.question.bogi_items[0].id,'bogi1');assert.equal(packet.question.choices.length,5);
});
test('old question files stay compatible and references roundtrip separately from printed text', () => {
  const old = newQuestion('7');delete old.standard;delete old.standard_code;delete old.intent;delete old.references;
  assert.deepEqual(decodePool(encodePool([old])),[old]);
  const item = newQuestion('8');item.ask='검증용 발문';item.intent='인쇄되지 않는 메모';
  item.standard_code='[9과01-01]';item.standard={code:item.standard_code,text:'검증용 기준',subject:'과학',explain:'검증용 해설',source:'검증용 출처'};
  item.references=[{id:'reference1',resourceId:'resource1',title:'검증용 자료',kind:'교과서',page:1,quote:'검증용 인용',field:'choice-1'}];
  const resource={id:'resource1',title:'검증용 자료',kind:'교과서',mime:'text/plain',base64:'VEVTVA==',pages:['TEST']};
  assert.deepEqual(decodePoolBundle(encodePool([item],undefined,[resource])),{items:[item],resources:[resource]});
  assert.equal(questionHandoff(item).question.intent,undefined);
  const bad=structuredClone(resource);bad.base64='invalid!';assert.throws(()=>encodePool([item],undefined,[bad]),/참고자료/);
  const wrong=structuredClone(item);wrong.standard.code='different';assert.throws(()=>encodePool([wrong]),/성취기준/);
});
