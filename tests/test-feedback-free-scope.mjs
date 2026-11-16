import test from 'node:test';import assert from 'node:assert/strict';
import {encodeScopedPng,decodeScopedPng} from '../js/ai-scoped-edit-png.js';
import {createScopedEditSession,confirmScopedEditSession,prepareScopedEditProposal} from '../js/ai-scoped-edit-session.js';
import {prepareScopedEditContext,restoreScopedEditContext} from '../js/ai-scoped-edit-context.js';
import {collectScopedAreaComments} from '../js/ai-scoped-edit-prompt.js';
test('free comment permissions retain pixels outside the polygon in direct and padded edits',async()=>{
 const source={width:8,height:8,data:new Uint8Array(8*8*4).fill(255)},png=await encodeScopedPng(source);
 const polygon=[{x:0,y:0},{x:8,y:0},{x:0,y:8}],rect={x0:0,y0:0,x1:8,y1:8,coordinateSpace:'selected-result-pixels',polygon};
 const current={taskId:'task',candidateId:'candidate',sourcePng:png,epoch:1,selectionRevision:1};
 const session=await createScopedEditSession({...current,rectangles:[rect]});confirmScopedEditSession(session,()=>current);
 assert.equal(session.allowedPixelCount,28);polygon[0].x=7;assert.equal(session.rectangles[0].polygon[0].x,0,'captured polygon cannot mutate');
 const changed={...source,data:new Uint8Array(source.data)};for(let i=0;i<64;i++){changed.data[i*4]=0;changed.data[i*4+1]=0;changed.data[i*4+2]=0;}
 const proposal=await prepareScopedEditProposal(session,await encodeScopedPng(changed),()=>current),decoded=await decodeScopedPng(proposal.previewPng);
 assert.equal(decoded.data[0],0);assert.deepEqual(decoded.data.slice(63*4),source.data.slice(63*4));assert.equal(proposal.changedPixelCount,28);
 const context=await prepareScopedEditContext(png,session.rectangles),input=await decodeScopedPng(context.inputPng);
 for(let i=0;i<input.data.length;i+=4){input.data[i]=0;input.data[i+1]=0;input.data[i+2]=0;}
 const restored=await decodeScopedPng(await restoreScopedEditContext(context,await encodeScopedPng(input)));
 assert.deepEqual(restored.data,decoded.data,'padded context has the same exact permission mask');
 assert.throws(()=>collectScopedAreaComments([{type:'area',x:0,y:0,w:50,h:50,text:'edit',polygon:[{x:0,y:0},{x:90,y:0},{x:0,y:40}]}],'candidate'),/自由|자유/);
});
