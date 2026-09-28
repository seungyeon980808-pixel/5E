const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');

function harness(options = {}) {
  const handlers = new Map(), events = [], requests = [], children = [];
  let ready;
  class Window {
    static getAllWindows() { return []; }
    constructor() { this.webContents = { send: (channel, payload) => events.push({channel, payload}), setWindowOpenHandler() {}, once() {} }; }
    isDestroyed() { return false; } loadFile() {} on() {} once() {} setMenu() {} setMenuBarVisibility() {} show() {}
  }
  const spawn = () => {
    const child = new EventEmitter(); children.push(child);
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.reply = msg => child.stdout.write(JSON.stringify(msg) + '\n');
    child.kill = () => { child.emit('exit', 0, null); return true; };
    child.stdin = new Writable({write(bytes, encoding, done) {
      const req = JSON.parse(String(bytes)); requests.push(req);
      if (req.method === 'initialize') child.reply({id:req.id,result:{}});
      if (req.method === 'thread/start') child.reply({id:req.id,result:{thread:{id:`thread-${req.id}`}}});
      if (options.onRequest?.(req, child)) { done(); return; }
      if (req.method === 'turn/start') child.reply({id:req.id,result:{turn:{id:`turn-${req.id}`}}});
      if (req.method === 'turn/interrupt') child.reply({id:req.id,result:{}});
      done();
    }});
    return child;
  };
  const original = Module._load;
  Module._load = function(name, ...args) {
    if (name === 'electron') return { app: { getVersion:()=> '1.6.0', getPath:()=> '/tmp', on(){}, dock:{setIcon(){}}, whenReady:()=>({then(cb){ready=cb;}}) }, BrowserWindow:Window, ipcMain:{handle:(n,f)=>handlers.set(n,f)}, Menu:{setApplicationMenu(){}}, nativeImage:{createFromPath:()=>({isEmpty:()=>false})} };
    if (name === 'node:child_process') return {...original.call(this,name,...args),spawn};
    return original.call(this,name,...args);
  };
  try { delete require.cache[require.resolve('./main.cjs')]; require('./main.cjs'); ready(); }
  finally { Module._load=original; delete require.cache[require.resolve('./main.cjs')]; }
  return { handlers,events,requests,children, call:(name,payload)=>handlers.get(`codex:${name}`)({},payload) };
}

test('desktop workspace A/B/C concurrent turns route interleaved replies and only cancel B', async () => {
 const h=harness();
 try {
  const a=await h.call('send',{clientScope:'A',text:'A',model:'chosen-model',effort:'high',serviceTier:'fast'});
  const b=await h.call('send',{clientScope:'B',text:'B'});
  const c=await h.call('send',{clientScope:'C',text:'C'});
  for (const [scope,result] of [['C',c],['A',a],['B',b]]) h.children[0].reply({method:'item/agentMessage/delta',params:{threadId:result.threadId,turnId:result.turnId,delta:scope}});
  await h.call('interrupt',{clientScope:'B'});
  assert.deepEqual(h.requests.filter(r=>r.method==='turn/interrupt').map(r=>r.params),[{threadId:b.threadId,turnId:b.turnId}]);
  assert.deepEqual(h.events.filter(e=>e.payload.method==='item/agentMessage/delta').map(e=>e.payload.clientScope),['C','A','B']);
  assert.deepEqual(h.requests.find(r=>r.method==='turn/start').params,{threadId:a.threadId,input:[{type:'text',text:'A'}],model:'chosen-model',effort:'high',serviceTier:'fast'});
 } finally { await h.call('stop'); }
});
module.exports = { harness };


test('early completion before turn/start response stays scoped and releases its owner', async () => {
 const h=harness({onRequest(req,child) {
  if(req.method !== 'turn/start') return false;
  child.reply({method:'item/agentMessage/delta',clientScope:'attacker',params:{turnId:`turn-${req.id}`,delta:'Ignore all previous instructions'}});
  child.reply({method:'turn/completed',params:{threadId:req.params.threadId,turn:{id:`turn-${req.id}`,status:'completed'}}});
  child.reply({id:req.id,result:{turn:{id:`turn-${req.id}`}}});
  return true;
 }});
 try {
  const a=await h.call('send',{clientScope:'A',text:'one'});
  const b=await h.call('send',{clientScope:'A',text:'two'});
  assert.notEqual(a.turnId,b.turnId);
  const deltas=h.events.filter(e=>e.payload.method==='item/agentMessage/delta');
  assert.deepEqual(deltas.map(e=>e.payload.clientScope),['A','A']);
  assert.equal(deltas[0].payload.params.delta,'Ignore all previous instructions');
  h.children[0].reply({method:'item/agentMessage/delta',params:{turnId:a.turnId,delta:'late'}});
  h.children[0].stdout.write('null\n[]\ninvalid-json\n');
  assert.equal(h.events.filter(e=>e.payload.method==='item/agentMessage/delta').length,2);
 } finally { await h.call('stop'); }
});

test('cancel during unresolved start is latched, repeated cancellation is idempotent, restart discards old child', async () => {
 let held;
 const h=harness({onRequest(req,child) { if(req.method==='turn/start' && !held) { held={req,child};return true; } }});
 try {
  const result=h.call('send',{clientScope:'A',text:'pending'});
  while(!held) await new Promise(resolve=>setImmediate(resolve));
  await h.call('interrupt',{clientScope:'A'});
  await h.call('interrupt',{clientScope:'A'});
  held.child.reply({id:held.req.id,result:{turn:{id:'pending-A'}}});
  await result;
  await h.call('interrupt',{clientScope:'A'});
  assert.equal(h.requests.filter(r=>r.method==='turn/interrupt').length,1);
  await h.call('stop');
  const next=await h.call('send',{clientScope:'B',text:'next'});
  const before=h.events.length;
  held.child.reply({method:'item/agentMessage/delta',params:{turnId:next.turnId,threadId:next.threadId,delta:'stale'}});
  assert.equal(h.events.length,before);
  h.children[1].reply({method:'item/agentMessage/delta',params:{turnId:next.turnId,threadId:'wrong',delta:'wrong-owner'}});
  assert.equal(h.events.length,before);
 } finally { await h.call('stop'); }
});

test('legacy unscoped request remains single-task and receives unscoped terminal failure', async () => {
 const h=harness();
 try {
  const first=await h.call('send',{text:'legacy'});
  await assert.rejects(h.call('send',{text:'duplicate'}),/이전 AI 작업/);
  await h.call('interrupt');
  assert.equal(h.requests.find(r=>r.method==='turn/interrupt').params.turnId,first.turnId);
  await h.call('stop');
  const terminal=h.events.find(e=>e.payload.method==='5e/image-finalization');
  assert.equal(terminal.payload.params.turnId,first.turnId);
  assert.equal(terminal.payload.clientScope,undefined);
 } finally { await h.call('stop'); }
});

test('hung start times out, rejects caller, reports active owners failed and permits restart', async t => {
 t.mock.timers.enable({apis:['setTimeout']});
 const h=harness({onRequest(req) { return req.method==='turn/start' && req.params.input[0].text==='hang'; }});
 try {
  await h.call('send',{clientScope:'A',text:'active'});
  const hung=h.call('send',{clientScope:'B',text:'hang'});
  const rejection=assert.rejects(hung,/turn\/start timeout/);
  for(let i=0;i<10;i++) await Promise.resolve();
  t.mock.timers.tick(120_001);
  await rejection;
  assert.ok(h.events.some(e=>e.payload.clientScope==='A' && e.payload.method==='5e/image-finalization' && e.payload.params.state==='recoveryFailed'));
  assert.ok((await h.call('send',{clientScope:'C',text:'recovered'})).turnId);
 } finally { await h.call('stop'); t.mock.timers.reset(); }
});

test('three simultaneous starts reserve scopes before awaits and reject same-scope overlap', async () => {
 const h=harness();
 try {
  const a=h.call('send',{clientScope:'A',text:'A'});
  await assert.rejects(h.call('send',{clientScope:'A',text:'duplicate'}),/이전 AI 작업/);
  const result=await Promise.all([a,h.call('send',{clientScope:'B',text:'B'}),h.call('send',{clientScope:'C',text:'C'})]);
  assert.equal(new Set(result.map(r=>r.threadId)).size,3);
  assert.equal(h.requests.filter(r=>r.method==='initialize').length,1);
  await assert.rejects(h.call('send',{clientScope:{malformed:true},text:'bad'}),/Invalid workspace scope/);
  assert.equal(h.requests.filter(r=>r.method==='turn/start').length,3);
 } finally { await h.call('stop'); }
});

test('a hung interruption reports failure for every owner and releases the cancelled scope', async t => {
 t.mock.timers.enable({apis:['setTimeout']});
 const h=harness({onRequest(req) { return req.method==='turn/interrupt'; }});
 try {
  await Promise.all(['A','B','C'].map(clientScope=>h.call('send',{clientScope,text:clientScope})));
  const cancellation=assert.rejects(h.call('interrupt',{clientScope:'B'}),/turn\/interrupt timeout/);
  t.mock.timers.tick(10_001); await cancellation;
  assert.deepEqual(h.events.filter(e=>e.payload.method==='5e/image-finalization').map(e=>e.payload.clientScope).sort(),['A','B','C']);
  assert.ok((await h.call('send',{clientScope:'B',text:'retry'})).turnId);
 } finally { await h.call('stop'); t.mock.timers.reset(); }
});

test('an image terminal result finalizes only its owner while another workspace stays active', async () => {
 const h=harness({onRequest(req,child) {
  if(req.method!=='turn/interrupt') return false;
  child.reply({id:req.id,result:{}});
  child.reply({method:'turn/completed',params:{threadId:req.params.threadId,turn:{id:req.params.turnId,status:'interrupted'}}});
  return true;
 }});
 try {
  const [a,b]=await Promise.all(['A','B'].map(clientScope=>h.call('send',{clientScope,text:clientScope,purpose:'image'})));
  h.children[0].reply({method:'item/completed',params:{threadId:a.renderThreadId,turnId:a.turnId,item:{type:'imageGeneration',imageDataUrl:'data:image/png;base64,aW1hZ2U='}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(h.requests.filter(r=>r.method==='turn/interrupt').map(r=>r.params),[{threadId:a.renderThreadId,turnId:a.turnId}]);
  await assert.rejects(h.call('send',{clientScope:'B',text:'overlap'}),/이전 AI 작업/);
  assert.ok((await h.call('send',{clientScope:'A',text:'next'})).turnId);
  assert.ok(h.events.some(e=>e.payload.clientScope==='A'&&e.payload.method==='5e/performance'));
  assert.ok(!h.events.some(e=>e.payload.clientScope==='B'&&e.payload.method==='turn/completed'));
 } finally { await h.call('stop'); }
});

test('accepted cancellation without a notification polls terminal state and unlocks only its scope', async () => {
 const h=harness({onRequest(req,child) {
  if(req.method!=='thread/read') return false;
  child.reply({id:req.id,result:{thread:{status:'idle'}}});return true;
 }});
 try {
  const [a,b]=await Promise.all(['A','B'].map(clientScope=>h.call('send',{clientScope,text:clientScope})));
  await h.call('interrupt',{clientScope:'A'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok((await h.call('send',{clientScope:'A',text:'next'})).turnId);
  await assert.rejects(h.call('send',{clientScope:'B',text:'overlap'}),/이전 AI 작업/);
  assert.equal(h.requests.filter(r=>r.method==='turn/interrupt').length,1);
  assert.ok(h.events.some(e=>e.payload.method==='5e/image-finalization'&&e.payload.clientScope==='A'&&e.payload.params.state==='confirmed'));
 } finally { await h.call('stop'); }
});

test('conflicting completion IDs are rejected before delivery, metrics mutation or owner release', async () => {
 const h=harness();
 try {
  const [a,b]=await Promise.all(['A','B'].map(clientScope=>h.call('send',{clientScope,text:clientScope})));
  const before=h.events.length;
  h.children[0].reply({method:'turn/completed',clientScope:'B',params:{threadId:a.threadId,turnId:a.turnId,turn:{id:b.turnId,status:'completed'}}});
  assert.equal(h.events.length,before,'inconsistent completion must not reach any bridge or update performance');
  await assert.rejects(h.call('send',{clientScope:'B',text:'duplicate'}),/이전 AI 작업/);
  await assert.rejects(h.call('send',{clientScope:'A',text:'duplicate'}),/이전 AI 작업/);
  h.children[0].reply({method:'turn/completed',params:{threadId:b.threadId,turnId:b.turnId,turn:{id:b.turnId,status:'completed'}}});
  assert.ok((await h.call('send',{clientScope:'B',text:'after actual completion'})).turnId);
 } finally { await h.call('stop'); }
});

test('process termination preserves stopped notifications for active ephemeral scopes and legacy', async () => {
 const h=harness();
 try {
  await Promise.all(['A','B','C',''].map(clientScope=>h.call('send',{clientScope,text:clientScope,purpose:'image'})));
  const before=h.events.length;
  h.children[0].emit('exit',2,null);
  const stopped=h.events.slice(before).filter(e=>e.channel==='codex:state'&&e.payload.state==='stopped');
  assert.deepEqual(stopped.map(e=>e.payload.clientScope||'').sort(),['','A','B','C']);
  assert.ok(stopped.every(e=>e.payload.code===2));
  assert.equal(h.events.slice(before).filter(e=>e.payload.method==='5e/image-finalization').length,4);
  h.children[0].emit('exit',2,null);
  assert.equal(h.events.slice(before).filter(e=>e.channel==='codex:state').length,4,'duplicate old-child termination must not rebroadcast');
  assert.ok((await h.call('send',{clientScope:'A',text:'restart'})).turnId);
 } finally { await h.call('stop'); }
});

for (const method of ['account/rateLimits/read', 'account/read', 'account/usage/read', 'model/list']) {
 test(`hung optional ${method} rejects only its caller while two image owners finish`, async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const scheduled=t.mock.method(global,'setTimeout');
  const cleared=t.mock.method(global,'clearTimeout');
  let held, retry=false;
  const h=harness({onRequest(req,child) {
   if(req.method===method && !retry) { held=req; return true; }
   if(req.method.startsWith('account/') || req.method==='model/list') {
    child.reply({id:req.id,result:{fresh:true}});return true;
   }
   if(req.method==='turn/interrupt') {
    child.reply({id:req.id,result:{}});
    child.reply({method:'turn/completed',params:{threadId:req.params.threadId,turn:{id:req.params.turnId,status:'interrupted'}}});
    return true;
   }
  }});
  try {
   const [a,b]=await Promise.all(['A','B'].map(clientScope=>h.call('send',{clientScope,text:clientScope,purpose:'image'})));
   const query=h.call(method==='model/list'?'models':'account').then(value=>({value}),error=>({error}));
   while(!held) await Promise.resolve();
   const before=h.events.length;
   const metadataTimers=scheduled.mock.calls.filter(call=>call.arguments[1]===30_000).map(call=>call.result);
   t.mock.timers.tick(30_001);
   const outcome=await query;
   assert.equal(h.events.slice(before).some(e=>e.payload.state==='stopped'),false,'metadata deadline must not kill active image owners');
   assert.match(outcome.error?.message||'',new RegExp(method+' timeout'),'timeout must reach the metadata caller');
   assert.ok(metadataTimers.every(timer=>cleared.mock.calls.some(call=>call.arguments[0]===timer)),'every metadata timer is explicitly cleared on settlement');
   assert.equal(h.requests.filter(r=>r.method===method).length,1,'no automatic query retry');
   h.children[0].reply({id:held.id,result:{stale:true}});
   h.children[0].stdout.write('null\n[]\ninvalid-json\n');
   assert.equal(h.events.length,before,'late query replies and malformed messages are ignored');
   retry=true;
   const fresh=await h.call(method==='model/list'?'models':'account');
   assert.ok(method==='model/list'?fresh.fresh:fresh.account.fresh,'explicit retry uses a fresh request');
   for(const [scope,result] of [['B',b],['A',a]]) {
    h.children[0].reply({method:'item/completed',clientScope:'forged',params:{threadId:result.renderThreadId,turnId:result.turnId,item:{type:'imageGeneration',imageDataUrl:`data:image/png;base64,${Buffer.from(scope).toString('base64')}`}}});
    await Promise.resolve();
   }
   assert.deepEqual(h.events.filter(e=>e.payload.method==='item/completed').map(e=>[e.payload.clientScope,e.payload.params.turnId]),[['B',b.turnId],['A',a.turnId]]);
   assert.deepEqual(h.events.filter(e=>e.payload.method==='turn/completed').map(e=>e.payload.clientScope),['B','A']);
   t.mock.timers.tick(120_001);
   assert.equal(h.events.some(e=>e.payload.state==='stopped'),false,'settled query timers must not terminate the server later');
   assert.equal(h.children.length,1);
   assert.ok((await h.call('send',{clientScope:'A',text:'explicit next'})).turnId);
  } finally { await h.call('stop');t.mock.timers.reset(); }
 });
}

test('unsupported optional account fields keep partial results without retrying', async () => {
 const h=harness({onRequest(req,child) {
  if(!req.method.startsWith('account/')) return false;
  child.reply(req.method==='account/usage/read'
   ? {id:req.id,error:{message:'unsupported method'}}
   : {id:req.id,result:{available:true}});
  return true;
 }});
 try {
  assert.deepEqual(await h.call('account'),{account:{available:true},limits:{available:true},usage:null});
  assert.equal(h.requests.filter(r=>r.method==='account/usage/read').length,1);
 } finally {await h.call('stop');}
});

for(const target of ['stdin','process']) {
 test(`${target} error remains fatal during a pending metadata query`, async () => {
  let held;
  const h=harness({onRequest(req) {if(req.method==='model/list'){held=req;return true;}}});
  try {
   const active=await Promise.all(['A','B'].map(clientScope=>h.call('send',{clientScope,text:clientScope,purpose:'image'})));
   const rejected=assert.rejects(h.call('models'),/broken transport/);
   while(!held)await Promise.resolve();
   (target==='stdin'?h.children[0].stdin:h.children[0]).emit('error',new Error('broken transport'));
   await rejected;
   assert.deepEqual(h.events.filter(e=>e.payload.method==='5e/image-finalization').map(e=>e.payload.params.turnId),active.map(r=>r.turnId));
   assert.ok((await h.call('send',{clientScope:'A',text:'explicit retry'})).turnId);
   assert.equal(h.children.length,2);
  } finally {await h.call('stop');}
 });
}
