const test=require('node:test'),assert=require('node:assert/strict');
const {PassThrough,Writable}=require('node:stream');const {EventEmitter}=require('node:events');
const {createLocalCodexBridge}=require('../scripts/local-codex-bridge.cjs');
const catalog={data:[{model:'gpt-6.1-sol',supportedReasoningEfforts:['medium','high'],serviceTiers:[],defaultReasoningEffort:'medium'},{model:'gpt-6-luna',supportedReasoningEfforts:['medium'],serviceTiers:[],defaultReasoningEffort:'medium'}]};
test('local bridge validates models and scopes provider events without retry',async()=>{
 let child,thread=0;const calls=[];
 const bridge=createLocalCodexBridge({binary:'fake-never-real',spawnProcess:()=>{child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};child.stdin=new Writable({write(chunk,enc,done){const m=JSON.parse(String(chunk));calls.push(m);if(m.id){const result=m.method==='account/read'?{account:{type:'chatgpt'}}:m.method==='model/list'?catalog:m.method==='thread/start'?{thread:{id:'t'+ ++thread}}:m.method==='turn/start'?{turn:{id:'turn-'+m.params.threadId}}:{};queueMicrotask(()=>child.stdout.write(JSON.stringify({id:m.id,result})+'\n'));}done();}});return child;}});
 const selection={model:'gpt-6.1-sol',effort:'medium',purpose:'scene',sceneKind:'graph',text:'Observe',attachments:[]};
 try{
  assert.equal((await bridge.handle('bridge-status')).login.loggedIn,true);
  await assert.rejects(bridge.handle('bridge-send',{...selection,model:'missing'}));
  await assert.rejects(bridge.handle('bridge-send',{...selection,effort:'high'}));
  assert.equal(calls.filter(m=>m.method==='turn/start').length,0);
  const a=await bridge.handle('bridge-send',{...selection,clientScope:'a'});
  const b=await bridge.handle('bridge-send',{...selection,clientScope:'b'});
  await assert.rejects(bridge.handle('bridge-send',{...selection,clientScope:'a'}),/이미 실행/);
  child.stdout.write(JSON.stringify({method:'item/completed',params:{threadId:a.threadId,turnId:a.turnId,item:{type:'agentMessage',text:'A'}}})+'\n');
  const events=await bridge.handle('bridge-events',{clientScope:'a',cursor:0});assert.equal(events.events[0].clientScope,'a');assert.equal((await bridge.handle('bridge-events',{clientScope:'b',cursor:0})).events.length,0);
  await assert.rejects(bridge.handle('bridge-events',{clientScope:'a',cursor:-1}));
  child.stdout.write(JSON.stringify({method:'turn/completed',params:{threadId:a.threadId,turn:{id:a.turnId,status:'completed'}}})+'\n');
  const next=await bridge.handle('bridge-send',{...selection,clientScope:'a'});assert.notEqual(next.threadId,a.threadId);
  child.stdout.write(JSON.stringify({method:'item/completed',params:{threadId:a.threadId,item:{type:'agentMessage',text:'late'}}})+'\n');
  assert.equal((await bridge.handle('bridge-events',{clientScope:'a',cursor:0})).events.length,0);
  await bridge.handle('bridge-interrupt',{clientScope:'b'});assert(calls.some(m=>m.method==='turn/interrupt'&&m.params.threadId===b.threadId));
  assert.equal(calls.filter(m=>m.method==='turn/start').length,3);
  const schema={type:'object',properties:{labels:{type:'array',items:{type:'string'}}},required:['labels'],additionalProperties:false};
  await bridge.handle('bridge-send',{...selection,sceneKind:'label',model:'gpt-6-luna',clientScope:'labels',outputSchema:schema});
  const labelTurn=calls.filter(m=>m.method==='turn/start').at(-1);
  assert.equal(labelTurn.params.model,'gpt-6-luna');
  assert.deepEqual(labelTurn.params.outputSchema,schema);
  assert.equal(calls.filter(m=>m.method==='thread/start').at(-1).params.outputSchema,undefined);
  assert.equal(calls.filter(m=>m.method==='turn/start').length,4);
  await assert.rejects(bridge.handle('bridge-send',{...selection,clientScope:'invalid-schema',outputSchema:[]}),/스키마/);
  assert.equal(calls.filter(m=>m.method==='turn/start').length,4);
  assert(calls.filter(m=>m.method==='thread/start').every(m=>m.params.environments.length===0&&m.params.selectedCapabilityRoots.length===0));
 }finally{bridge.close();}
});
