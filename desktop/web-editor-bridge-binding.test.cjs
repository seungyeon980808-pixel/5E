const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function harness(){const requests=[],starts=[];const window={fiveEWebRequest:async(action,payload)=>{requests.push({action,payload});if(action==='bridge-send')return new Promise(resolve=>starts.push(resolve));return {ok:true};}};vm.runInNewContext(fs.readFileSync(require.resolve('../preview/experiments/web-codex-auth/editor-bridge.js'),'utf8'),{window,setTimeout:()=>0,clearTimeout(){},AbortController});return{bridge:window.fiveEWebAI,requests,starts};}
test('actual browser adapter forwards current binding, rejects stale binding and preserves unbound cancellation',async()=>{
 const h=harness();const p=h.bridge.send({clientScope:'A'});h.starts[0]({turnId:'old',renderThreadId:'old-thread'});await p;
 const next=h.bridge.send({clientScope:'A'});assert.equal((await h.bridge.interrupt({clientScope:'A',turnId:'old',threadId:'old-thread'})).stale,true);h.starts[1]({turnId:'new',renderThreadId:'new-thread'});await next;
 assert.equal((await h.bridge.interrupt({clientScope:'A',turnId:'old',threadId:'old-thread'})).stale,true);assert.equal(h.requests.filter(x=>x.action==='bridge-interrupt').length,0);
 await h.bridge.interrupt({clientScope:'A',turnId:'new',threadId:'new-thread'});let sent=h.requests.filter(x=>x.action==='bridge-interrupt');assert.equal(sent.length,1);assert.equal(sent[0].payload.turnId,'new');assert.equal(sent[0].payload.threadId,'new-thread');
 await h.bridge.stop({clientScope:'A'});sent=h.requests.filter(x=>x.action==='bridge-interrupt');assert.equal(sent.length,2);assert.equal(sent[1].payload.turnId,undefined);
});
test('late old start result cannot replace newer browser scope owner or cancel another scope',async()=>{
 const h=harness();const old=h.bridge.send({clientScope:'A'}),next=h.bridge.send({clientScope:'A'});h.starts[1]({turnId:'new',threadId:'new-thread'});await next;h.starts[0]({turnId:'old',threadId:'old-thread'});await old;
 assert.equal((await h.bridge.interrupt({clientScope:'A',turnId:'old',threadId:'old-thread'})).stale,true);assert.equal((await h.bridge.interrupt({clientScope:'B',turnId:'new',threadId:'new-thread'})).stale,true);
 await h.bridge.interrupt({clientScope:'A',turnId:'new',threadId:'new-thread'});const sent=h.requests.filter(x=>x.action==='bridge-interrupt');assert.equal(sent.length,1);assert.equal(sent[0].payload.turnId,'new');
});

function pollingHarness(){
 const requests=[],timers=[],polls=[],events=[],states=[];let id=0;
 const window={fiveEWebRequest:async(action,payload)=>{requests.push({action,payload});if(action==='bridge-send')return {turnId:'t'+(++id),renderThreadId:'thread'+id};if(action==='bridge-events')return new Promise((resolve,reject)=>polls.push({resolve,reject}));return {ok:true};}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../preview/experiments/web-codex-auth/editor-bridge.js'),'utf8'),{window,setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},AbortController});
 window.fiveEWebAI.onEvent(e=>events.push(e));window.fiveEWebAI.onState(e=>states.push(e));
 return {bridge:window.fiveEWebAI,requests,timers,polls,events,states};
}
test('an old completed poll cannot stop the next image turn or overwrite its cursor',async()=>{
 const h=pollingHarness();await h.bridge.send({clientScope:'A',purpose:'scene'});
 const old=h.timers.shift().fn();await h.bridge.send({clientScope:'A',purpose:'image'});
 h.polls[0].resolve({cursor:9,events:[{method:'turn/completed',clientScope:'A',params:{turnId:'t1',turn:{status:'completed'}}}]});await old;
 assert.equal(h.events.length,0);
 const next=h.timers.shift().fn();assert.equal(h.requests.at(-1).payload.cursor,0);
 h.polls[1].resolve({cursor:1,events:[{method:'turn/completed',clientScope:'A',params:{turnId:'t2',turn:{status:'completed'}}}]});await next;
 assert.equal(h.events[0].params.turnId,'t2');assert.equal(h.timers.length,0);
 assert.equal(h.requests.filter(r=>r.action==='bridge-send').length,2);
});
test('a temporary event connection failure retries status only, with the original turn binding',async()=>{
 const h=pollingHarness();await h.bridge.send({clientScope:'A'});const first=h.timers.shift().fn();
 h.polls[0].reject(Object.assign(Error('temporary gateway error'),{status:502}));await first;
 assert.equal(h.states.length,0);assert.equal(h.timers[0].ms,750);
 const retry=h.timers.shift().fn();h.polls[1].resolve({cursor:1,events:[{method:'turn/completed',clientScope:'A',params:{turnId:'t1',turn:{status:'completed'}}}]});await retry;
 assert.equal(h.events.length,1);assert.equal(h.requests.filter(r=>r.action==='bridge-send').length,1);
});
test('event polling retries are bounded and authentication failures do not retry',async()=>{
 for(const status of [502,401]){
  const h=pollingHarness();await h.bridge.send({clientScope:'A'});const attempts=status===401?1:3;
  for(let i=0;i<attempts;i++){const pending=h.timers.shift().fn();h.polls[i].reject(Object.assign(Error('connection failure'),{status}));await pending;}
  assert.equal(h.events.at(-1).method,'error');assert.equal(h.events.at(-1).params.turnId,'t1');
  assert.equal(h.states.at(-1).state,'stopped');assert.equal(h.timers.length,0);assert.equal(h.requests.filter(r=>r.action==='bridge-send').length,1);
 }
});
