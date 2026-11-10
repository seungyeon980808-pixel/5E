const test=require('node:test'),assert=require('node:assert/strict');
const {PassThrough,Writable}=require('node:stream');const {EventEmitter}=require('node:events');
const {createLocalCodexBridge}=require('../scripts/local-codex-bridge.cjs');
const catalog={data:[{model:'gpt-6.1-sol',supportedReasoningEfforts:['medium','high'],serviceTiers:[],defaultReasoningEffort:'medium'},{model:'gpt-6-luna',supportedReasoningEfforts:['medium'],serviceTiers:[],defaultReasoningEffort:'medium'}]};
test('local bridge validates models, scopes provider events and takes over a stale turn in the same scope',async()=>{
 let child,thread=0;const calls=[];
 const bridge=createLocalCodexBridge({binary:'fake-never-real',takeoverWaitMs:30,spawnProcess:()=>{child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};child.stdin=new Writable({write(chunk,enc,done){const m=JSON.parse(String(chunk));calls.push(m);if(m.id){const result=m.method==='account/read'?{account:{type:'chatgpt'}}:m.method==='model/list'?catalog:m.method==='thread/start'?{thread:{id:'t'+ ++thread}}:m.method==='turn/start'?{turn:{id:'turn-'+m.params.threadId}}:{};queueMicrotask(()=>child.stdout.write(JSON.stringify({id:m.id,result})+'\n'));}done();}});return child;}});
 const selection={model:'gpt-6.1-sol',effort:'medium',purpose:'scene',sceneKind:'graph',text:'Observe',attachments:[]};
 try{
  assert.equal((await bridge.handle('bridge-status')).login.loggedIn,true);
  await assert.rejects(bridge.handle('bridge-send',{...selection,model:'missing'}));
  await assert.rejects(bridge.handle('bridge-send',{...selection,effort:'high'}));
  assert.equal(calls.filter(m=>m.method==='turn/start').length,0);
  const a=await bridge.handle('bridge-send',{...selection,clientScope:'a'});
  const b=await bridge.handle('bridge-send',{...selection,clientScope:'b'});
  child.stdout.write(JSON.stringify({method:'item/completed',params:{threadId:a.threadId,turnId:a.turnId,item:{type:'agentMessage',text:'A'}}})+'\n');
  const events=await bridge.handle('bridge-events',{clientScope:'a',cursor:0});assert.equal(events.events[0].clientScope,'a');assert.equal((await bridge.handle('bridge-events',{clientScope:'b',cursor:0})).events.length,0);
  await assert.rejects(bridge.handle('bridge-events',{clientScope:'a',cursor:-1}));
  child.stdout.write(JSON.stringify({method:'turn/completed',params:{threadId:a.threadId,turn:{id:a.turnId,status:'completed'}}})+'\n');
  const next=await bridge.handle('bridge-send',{...selection,clientScope:'a'});assert.notEqual(next.threadId,a.threadId);
  child.stdout.write(JSON.stringify({method:'item/completed',params:{threadId:a.threadId,item:{type:'agentMessage',text:'late'}}})+'\n');
  assert.equal((await bridge.handle('bridge-events',{clientScope:'a',cursor:0})).events.length,0);
  // 11-09: 같은 칸에서 앞 요청이 끝나기 전에 새 요청이 오면 오류 대신 앞 요청을 끊고 새 요청을 보낸다.
  const takeover=await bridge.handle('bridge-send',{...selection,clientScope:'a'});
  assert(calls.some(m=>m.method==='turn/interrupt'&&m.params.threadId===next.threadId));
  assert.notEqual(takeover.threadId,next.threadId);
  child.stdout.write(JSON.stringify({method:'item/completed',params:{threadId:next.threadId,turnId:next.turnId,item:{type:'agentMessage',text:'stale'}}})+'\n');
  assert.equal((await bridge.handle('bridge-events',{clientScope:'a',cursor:0})).events.length,0);
  await bridge.handle('bridge-interrupt',{clientScope:'b'});assert(calls.some(m=>m.method==='turn/interrupt'&&m.params.threadId===b.threadId));
  assert.equal(calls.filter(m=>m.method==='turn/start').length,4);
  const schema={type:'object',properties:{labels:{type:'array',items:{type:'string'}}},required:['labels'],additionalProperties:false};
  await bridge.handle('bridge-send',{...selection,sceneKind:'label',model:'gpt-6-luna',clientScope:'labels',outputSchema:schema});
  const labelTurn=calls.filter(m=>m.method==='turn/start').at(-1);
  assert.equal(labelTurn.params.model,'gpt-6-luna');
  assert.deepEqual(labelTurn.params.outputSchema,schema);
  assert.equal(calls.filter(m=>m.method==='thread/start').at(-1).params.outputSchema,undefined);
  assert.equal(calls.filter(m=>m.method==='turn/start').length,5);
  await assert.rejects(bridge.handle('bridge-send',{...selection,clientScope:'invalid-schema',outputSchema:[]}),/스키마/);
  assert.equal(calls.filter(m=>m.method==='turn/start').length,5);
  assert(calls.filter(m=>m.method==='thread/start').every(m=>m.params.environments.length===0&&m.params.selectedCapabilityRoots.length===0));
 }finally{bridge.close();}
});

// 11-10: 직접 그림 호출은 보내기 응답을 기다리지 않는다. 생성은 뒤에서 끝나고, 끝나면 같은 turnId로 이벤트가 쌓인다.
const imageSelection={model:'gpt-6-luna',effort:'medium',purpose:'image',text:'그려 줘',attachments:[]};
function fakeCodexSpawn(){
 const calls=[];let child,thread=0;
 const spawnProcess=()=>{child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};child.stdin=new Writable({write(chunk,enc,done){const m=JSON.parse(String(chunk));calls.push(m);if(m.id){const result=m.method==='account/read'?{account:{type:'chatgpt'}}:m.method==='model/list'?catalog:m.method==='thread/start'?{thread:{id:'t'+ ++thread}}:m.method==='turn/start'?{turn:{id:'turn-'+ ++thread}}:{};queueMicrotask(()=>child.stdout.write(JSON.stringify({id:m.id,result})+'\n'));}done();}});return child;};
 return {spawnProcess,calls};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('direct image send returns before the image is finished and pushes the success events afterwards with the same turnId',async()=>{
 const fake=fakeCodexSpawn();let finishImage;
 const directImageClient={precheck(){},readText:async()=>({text:''}),generate:()=>new Promise(resolve=>{finishImage=resolve;})};
 const bridge=createLocalCodexBridge({binary:'fake-never-real',spawnProcess:fake.spawnProcess,directImageClient,log(){}});
 try{
  const sent=await bridge.handle('bridge-send',{...imageSelection,clientScope:'img'});
  assert.match(sent.turnId,/^direct-/);assert.equal(sent.threadId,sent.turnId);
  assert.equal(fake.calls.filter(m=>m.method==='turn/start').length,0);
  assert.equal((await bridge.handle('bridge-events',{clientScope:'img',cursor:0})).events.length,0);
  finishImage({imageDataUrl:'data:image/png;base64,aW1hZ2U='});await tick();
  const events=(await bridge.handle('bridge-events',{clientScope:'img',cursor:0})).events;
  assert.deepEqual(events.map(e=>e.method),['item/completed','turn/completed']);
  assert.equal(events[0].params.turnId,sent.turnId);assert.equal(events[0].params.item.imageDataUrl,'data:image/png;base64,aW1hZ2U=');
  assert.equal(events[1].params.turn.id,sent.turnId);assert.equal(events[1].params.turn.status,'completed');
  assert.equal(events.every(e=>e.clientScope==='img'),true);
 }finally{bridge.close();}
});
test('a background direct image failure ends the turn as failed so the page can retry with another model',async()=>{
 const fake=fakeCodexSpawn();
 const directImageClient={precheck(){},readText:async()=>({text:''}),generate:()=>Promise.reject(Object.assign(new Error('boom'),{code:'DIRECT_HTTP',retryable:false}))};
 const bridge=createLocalCodexBridge({binary:'fake-never-real',spawnProcess:fake.spawnProcess,directImageClient,log(){}});
 try{
  const sent=await bridge.handle('bridge-send',{...imageSelection,clientScope:'fail'});
  await tick();
  const events=(await bridge.handle('bridge-events',{clientScope:'fail',cursor:0})).events;
  assert.deepEqual(events.map(e=>e.method),['turn/completed']);
  assert.equal(events[0].params.turn.id,sent.turnId);assert.equal(events[0].params.turn.status,'failed');
  // 끝난 뒤에는 같은 칸에서 바로 다시 보낼 수 있다(takeover 없이).
  const again=await bridge.handle('bridge-send',{...imageSelection,clientScope:'fail'});
  assert.notEqual(again.turnId,sent.turnId);
  assert.equal(fake.calls.filter(m=>m.method==='turn/interrupt').length,0);
 }finally{bridge.close();}
});
test('interrupting a background direct image aborts the request and ends the turn as interrupted',async()=>{
 const fake=fakeCodexSpawn();let aborted=false;
 const directImageClient={precheck(){},readText:async()=>({text:''}),generate:({signal})=>new Promise((_,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(Object.assign(new Error('취소'),{code:'DIRECT_ABORTED'}));});})};
 const bridge=createLocalCodexBridge({binary:'fake-never-real',spawnProcess:fake.spawnProcess,directImageClient,log(){}});
 try{
  const sent=await bridge.handle('bridge-send',{...imageSelection,clientScope:'stop'});
  await bridge.handle('bridge-interrupt',{clientScope:'stop'});await tick();
  assert.equal(aborted,true);
  const events=(await bridge.handle('bridge-events',{clientScope:'stop',cursor:0})).events;
  assert.equal(events.at(-1).params.turn.id,sent.turnId);assert.equal(events.at(-1).params.turn.status,'interrupted');
 }finally{bridge.close();}
});
test('a direct image precheck failure (no login) falls back to the app-server path synchronously',async()=>{
 const fake=fakeCodexSpawn();let generated=0;
 const directImageClient={precheck(){throw Object.assign(new Error('로그인 없음'),{code:'DIRECT_AUTH'});},readText:async()=>({text:''}),generate:()=>{generated+=1;return new Promise(()=>{});}};
 const bridge=createLocalCodexBridge({binary:'fake-never-real',spawnProcess:fake.spawnProcess,directImageClient,log(){}});
 try{
  const sent=await bridge.handle('bridge-send',{...imageSelection,clientScope:'auth'});
  assert.equal(generated,0);
  assert.equal(fake.calls.filter(m=>m.method==='turn/start').length,1);
  assert.match(sent.turnId,/^turn-/);assert.equal(sent.turnId.startsWith('direct-'),false);
 }finally{bridge.close();}
});
