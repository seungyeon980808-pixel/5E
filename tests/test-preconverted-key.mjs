// 미리 변환한 기출 열쇠(11-03): 앱의 PRECONVERTED_KEY가 지금 변환 엔진 소스의 해시와 같아야 한다.
// 엔진을 고치고 다시 미리 변환·올리기를 안 했으면 이 검사가 알려 준다(그동안 앱은 옛 파일을 쓰지 않고 그 자리에서 바꾸므로 결과는 안전).
import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {PRECONVERTED_KEY,freshIds} from '../assets/exampool/sheet/preconverted.js';
const require=createRequire(import.meta.url);
test('preconverted key matches the conversion engine source',()=>{assert.equal(PRECONVERTED_KEY,require('../exam-pdf/engine-key.cjs')(),'엔진이 바뀌었습니다 — exam-pdf/preconvert.cjs로 다시 미리 변환하고 올린 뒤 열쇠를 바꾸세요');});
test('fresh ids keep links but never reuse ids',()=>{const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
  const q={id:a,blocks:[{id:b,parent:null},{id:'33333333-3333-4333-8333-333333333333',parent:b}],figure:{data:'data:image/png;base64,AAAA'}};
  const x=freshIds(q);assert.notEqual(x.id,a);assert.notEqual(x.blocks[0].id,b);assert.equal(x.blocks[1].parent,x.blocks[0].id);assert.equal(x.figure.data,q.figure.data);});
