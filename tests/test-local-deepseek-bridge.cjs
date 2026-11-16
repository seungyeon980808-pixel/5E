// DeepSeek 로컬 연결(가짜 API, 실제 키·네트워크 아님): 글 요청 → 이벤트, JSON 계획 모드, 첨부 그림은 보내지 않고 알림,
// 그림 요청은 그림 연결로 넘김(없으면 실패), 키 없음·중단 처리.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createDeepSeekBridge}=require('../scripts/local-deepseek-bridge.cjs');
const tick=()=>new Promise(r=>setTimeout(r,5));
function fakeFetch(answer='{"reply":"ok"}'){const calls=[];const f=async(url,init)=>{calls.push({url,body:JSON.parse(init.body),auth:init.headers.authorization});if(init.signal?.aborted)throw Object.assign(new Error('aborted'),{name:'AbortError'});return {ok:true,status:200,json:async()=>({choices:[{message:{content:answer}}],usage:{prompt_tokens:3,completion_tokens:4}})};};f.calls=calls;return f;}
async function events(b,scope){for(let i=0;i<50;i++){const r=await b.handle('bridge-events',{clientScope:scope,cursor:0});if(r.events.some(e=>e.method==='turn/completed'))return r.events;await tick();}throw new Error('no completion');}
test('글 요청은 DeepSeek로 보내고 Codex 이벤트 모양으로 돌려준다',async()=>{
  const fetchImpl=fakeFetch('{"reply":"초안"}'),b=createDeepSeekBridge({apiKey:'sk-test',fetchImpl});
  assert.equal((await b.handle('bridge-status')).login.loggedIn,true);
  assert.equal((await b.handle('bridge-models')).data[0].model,'gpt-6.1-sol');
  const r=await b.handle('bridge-send',{clientScope:'exampool:q1',purpose:'chat',text:'문항 만들어 줘',attachments:[{data:'data:image/png;base64,AA'}]});
  assert.equal(r.droppedAttachments,1,'그림을 읽지 못한다고 알린다');
  const ev=await events(b,'exampool:q1');
  assert.equal(ev.find(e=>e.method==='item/completed').params.item.text,'{"reply":"초안"}');
  assert.equal(fetchImpl.calls[0].auth,'Bearer sk-test');assert.match(fetchImpl.calls[0].body.messages.at(-1).content,/첨부 그림을 읽지 못한다/);
  assert.equal(fetchImpl.calls[0].body.response_format,undefined);
});
test('그래프 계획(scene)은 JSON 모드와 스키마 지시를 쓴다',async()=>{
  const fetchImpl=fakeFetch('{"x":1}'),b=createDeepSeekBridge({apiKey:'k',fetchImpl});
  await b.handle('bridge-send',{clientScope:'g',purpose:'scene',text:'그래프',outputSchema:{type:'object'}});await events(b,'g');
  assert.deepEqual(fetchImpl.calls[0].body.response_format,{type:'json_object'});assert.match(fetchImpl.calls[0].body.messages[0].content,/JSON 스키마/);
});
test('그림 요청은 그림 연결로 넘기고, 없으면 분명히 실패한다',async()=>{
  const seen=[];const image={handle:async(a,p)=>{seen.push([a,p.purpose||'']);return a==='bridge-send'?{turnId:'img'}:{cursor:1,events:[{method:'turn/completed'}]};}};
  const b=createDeepSeekBridge({apiKey:'k',fetchImpl:fakeFetch(),imageBridge:image});
  assert.equal((await b.handle('bridge-send',{clientScope:'i',purpose:'image',text:'빗면'})).turnId,'img');
  await b.handle('bridge-events',{clientScope:'i',cursor:0});assert.deepEqual(seen,[['bridge-send','image'],['bridge-events','']],'그림 작업의 이벤트도 그림 연결에서 받는다');
  await assert.rejects(createDeepSeekBridge({apiKey:'k',fetchImpl:fakeFetch()}).handle('bridge-send',{clientScope:'x',purpose:'image',text:'t'}),/그림을 만들지 않습니다/);
});
test('키가 없으면 보내지 않는다',async()=>{
  const fetchImpl=fakeFetch(),b=createDeepSeekBridge({apiKey:'',fetchImpl});
  assert.equal((await b.handle('bridge-status')).login.loggedIn,false);
  await assert.rejects(b.handle('bridge-send',{clientScope:'x',purpose:'chat',text:'t'}),/DEEPSEEK_API_KEY/);assert.equal(fetchImpl.calls.length,0);
});
