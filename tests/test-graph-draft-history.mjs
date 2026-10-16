import test from 'node:test';
import assert from 'node:assert/strict';
import {createDraftHistory} from '../js/graph/draft-history.js';
test('drag frames form one history step and redo restores the exact draft', () => {
 let draft = {label:{x:1,y:2,text:'h_0'},range:[0,3]}, buttons;
 const history=createDraftHistory({capture:()=>draft,restore:value=>draft=value,changed:value=>buttons=value});
 history.begin(); for(let x=2;x<=30;x++){draft.label.x=x;history.record();} history.end();
 assert.equal(buttons.canUndo,true);history.travel();assert.deepEqual(draft,{label:{x:1,y:2,text:'h_0'},range:[0,3]});
 assert.equal(buttons.canUndo,false);history.travel(true);assert.equal(draft.label.x,30);
 history.travel();draft.label.text='h_1';history.record();assert.equal(history.travel(true),false);
 assert.deepEqual(draft.range,[0,3]);
});
test('typing is coalesced until focus leaves; a cancelled drag adds no step',()=>{
 let draft={text:'a'};const h=createDraftHistory({capture:()=>draft,restore:v=>draft=v});
 draft.text='ab';h.record('text');draft.text='abc';h.record('text');h.endGroup();
 draft.text='abcd';h.record('text');h.travel();assert.equal(draft.text,'abc');h.travel();assert.equal(draft.text,'a');
 h.begin();draft.text='cancelled';draft.text='a';h.end();assert.equal(h.travel(),false);
});
