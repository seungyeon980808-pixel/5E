// 보안 점검 M1: 접속 주소별 쓰기 제한과 하루 전체 생성 상한. 주인장은 제외.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixture.mjs';
async function use(t,options){const f=await fixture(options);t.after(()=>f.close());return f;}
const from=ip=>({headers:{'cf-connecting-ip':ip}});
test('rate limit bindings cap creates and edits/deletes per address, not for the owner',async t=>{
 const f=await use(t,{ratelimits:{MEMO_CREATE_LIMITER:{namespace_id:'5101',simple:{limit:2,period:60}},MEMO_WRITE_LIMITER:{namespace_id:'5102',simple:{limit:3,period:60}}}});
 const ids=[randomUUID(),randomUUID(),randomUUID()];
 assert.equal((await f.request('/entries',{id:ids[0],entry:{body:'a'}},from('1.1.1.1'))).status,200);
 assert.equal((await f.request('/entries',{id:ids[1],entry:{body:'b'}},from('1.1.1.1'))).status,200);
 const limited=await f.request('/entries',{id:ids[2],entry:{body:'c'}},from('1.1.1.1'));
 assert.equal(limited.status,429);assert.equal((await limited.json()).code,'RATE_LIMITED');
 assert.equal((await f.request('/entries',{id:ids[2],entry:{body:'c'}},from('2.2.2.2'))).status,200,'other addresses keep working');
 // 한 주소에서 남의 메모를 연달아 지우는 것도 분당 횟수로 막힌다
 const snapshot=await (await f.request()).json();
 const statuses=[];
 for(const e of snapshot.entries)statuses.push((await f.request('/entries/'+e.id,{version:e.version},{method:'DELETE',...from('3.3.3.3')})).status);
 const extra=randomUUID();await f.seed(extra,{body:'d'});
 statuses.push((await f.request('/entries/'+extra,{version:1},{method:'DELETE',...from('3.3.3.3')})).status);
 assert.deepEqual(statuses,[200,200,200,429]);
 const owner=await f.token();
 assert.equal((await f.request('/entries/'+extra,{version:1},{method:'DELETE',token:owner,...from('3.3.3.3')})).status,200,'owner is not throttled');
});
test('daily creation cap counts the last 24 hours, allows idempotent resends and the owner',async t=>{
 const f=await use(t,{bindings:{MEMO_DAILY_CREATE_LIMIT:'3'}});
 const id=randomUUID();
 assert.equal((await f.request('/entries',{id,entry:{body:'1'}})).status,200);
 await f.seed(randomUUID(),{body:'2'});await f.seed(randomUUID(),{body:'3'});await f.seed(randomUUID(),{body:'old'},86400001);
 const full=await f.request('/entries',{id:randomUUID(),entry:{body:'4'}});
 assert.equal(full.status,429);assert.equal((await full.json()).code,'DAILY_LIMIT');
 assert.equal((await f.request('/entries',{id,entry:{body:'1'}})).status,200,'resending an existing memo is not a new memo');
 assert.equal((await f.request('/entries',{id:randomUUID(),entry:{body:'owner'}},{token:await f.token()})).status,200);
});
test('without rate limit bindings the worker keeps working (local and tests)',async t=>{
 const f=await use(t);
 for(let i=0;i<12;i++)assert.equal((await f.request('/entries',{id:randomUUID(),entry:{body:String(i)}})).status,200);
});
