import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureAiPasteTarget,
  isAiPasteTargetCurrent,
  pastedImageBlob,
  readAiClipboardImage,
  shouldHandleAiImagePaste,
} from '../js/ai-panel.js';

test('AI image paste prefers the image exposed by the paste event', async () => {
  const file = {name:'event.png'};
  const clipboard = {read:()=>{ throw new Error('native clipboard should not be queried'); }};
  const result = await pastedImageBlob({clipboardData:{items:[{type:'image/png',getAsFile:()=>file}]}},clipboard);
  assert.equal(result,file);
});

test('AI image paste reads the system clipboard when Chromium omits paste-event files', async () => {
  const blob = {type:'image/png'};
  const result = await pastedImageBlob({clipboardData:{items:[]}}, {
    read: async () => [{types:['text/plain','image/png'],getType:async type => type === 'image/png' ? blob : null}],
  });
  assert.equal(result,blob);
});

test('AI image paste ignores a clipboard with no image representation', async () => {
  const result = await pastedImageBlob({}, {read:async()=>[{types:['text/plain'],getType:async()=>null}]});
  assert.equal(result,null);
});

test('image paste attaches while the prompt textarea is focused', () => {
  const target={closest:selector=>selector.includes('textarea') ? target : null};
  const event={target,clipboardData:{types:['Files'],items:[{type:'image/png'}]}};
  assert.equal(shouldHandleAiImagePaste(event,true),true);
});

test('plain text paste remains native while the prompt textarea is focused', () => {
  const target={closest:selector=>selector.includes('textarea') ? target : null};
  const event={target,clipboardData:{types:['text/plain'],items:[{type:'text/plain'}]}};
  assert.equal(shouldHandleAiImagePaste(event,true),false);
  assert.equal(shouldHandleAiImagePaste({target,clipboardData:{items:[],getData:()=> '문장'}},true),false);
});

test('plain text outside an input does not trigger image clipboard fallback', () => {
  const event={target:{},clipboardData:{types:['text/plain'],items:[{type:'text/plain'}]}};
  assert.equal(shouldHandleAiImagePaste(event,true),false);
});

test('mixed image and text clipboard data still attaches the image', () => {
  const event={target:{},clipboardData:{types:['text/plain','Files'],items:[{type:'text/plain'},{type:'image/png'}]}};
  assert.equal(shouldHandleAiImagePaste(event,true),true);
});

test('paste decision tolerates a Document target without closest', () => {
  assert.equal(shouldHandleAiImagePaste({target:{},clipboardData:{types:[],items:[]}},false),false);
});

test('denied web clipboard read falls back to the Electron native image bridge', async () => {
  const result=await readAiClipboardImage({}, {
    clipboard:{read:async()=>{throw new Error('NotAllowedError');}},
    readNative:async()=> 'data:image/png;base64,TkFUSVZF',
  });
  assert.deepEqual(result,{blob:null,dataUrl:'data:image/png;base64,TkFUSVZF'});
});

test('clipboard read reports both failures when web and Electron paths fail', async () => {
  await assert.rejects(()=>readAiClipboardImage({}, {
    clipboard:{read:async()=>{throw new Error('NotAllowedError');}},
    readNative:async()=>{throw new Error('native unavailable');},
  }),/NotAllowedError.*native unavailable/);
});

test('a delayed clipboard image remains bound to the exact task and source revision captured before read', () => {
  const task = {id:'task-1'};
  const source = {id:'source-1',data:'data:image/png;base64,ONE',referenceRole:'INPUT_SOURCE'};
  const target = captureAiPasteTarget({taskId:task.id,task,sources:[source]});
  assert.equal(isAiPasteTargetCurrent(target,{taskId:task.id,task,sources:[source]}),true);
  assert.equal(isAiPasteTargetCurrent(target,{taskId:'task-2',task:{id:'task-2'},sources:[]}),false,'tab switch must invalidate');
  assert.equal(isAiPasteTargetCurrent(target,{taskId:task.id,task:{id:'task-1'},sources:[source]}),false,'deleted and recreated task must invalidate');
  assert.equal(isAiPasteTargetCurrent(target,{taskId:task.id,task,sources:[]}),false,'removed source must invalidate');
  assert.equal(isAiPasteTargetCurrent(target,{taskId:task.id,task,sources:[{...source,data:'data:image/png;base64,TWO'}]}),false,'changed source must invalidate');
  assert.equal(isAiPasteTargetCurrent(target,{taskId:task.id,task,sources:[{...source,referenceRole:'STYLE_REFERENCE'}]}),false,'changed source role must invalidate');
});
