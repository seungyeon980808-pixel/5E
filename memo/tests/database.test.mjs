import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,clientId} from './fixture.mjs';
const DAY=86400000;
async function use(t){const f=await fixture();t.after(()=>f.close());return f;}
test('idempotent create, immutable server age, validated payload and atomic version conflicts',async t=>{
 const f=await use(t),id=randomUUID();
 const create=await f.request('/entries',{id,entry:{title:'선택 제목',body:'https://example.com'}});assert.equal(create.status,200);const row=await create.json();
 const again=await (await f.request('/entries',{id,entry:{body:'duplicate'}})).json();assert.deepEqual(again,row);
 assert.ok(Math.abs(Date.parse(row.created_at)-Date.now())<2000);
 for(const patch of [{created_at:'2099-01-01'},{id:randomUUID()},{version:5},{x:2},{z:1.5},{body:100},{title:'a'.repeat(161)}])assert.equal((await f.request('/entries/'+id,{version:1,patch},{method:'PATCH'})).status,400);
 const responses=await Promise.all(['a','b'].map(body=>f.request('/entries/'+id,{version:1,patch:{body}},{method:'PATCH'})));assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const updated=await responses.find(r=>r.status===200).json();assert.equal(updated.created_at,row.created_at);assert.equal(updated.version,2);
 for(const version of [null,1])assert.equal((await f.request('/entries/'+id,{version,patch:{body:'stale'}},{method:'PATCH'})).status,409);
 await assert.rejects(f.db.prepare('UPDATE memo_entries SET created_at=0 WHERE id=?').bind(id).run(),/immutable/);
});
test('24-hour archive is hidden from anonymous snapshots, guessed IDs, updates and deletes',async t=>{
 const f=await use(t),id=randomUUID();await f.seed(id,{body:'private archived body'},DAY+1);
 const snapshot=await (await f.request()).json();assert.deepEqual(snapshot.entries,[]);assert.equal(snapshot.owner,false);
 assert.equal((await f.request('/snapshot',{archive:true})).status,403);
 assert.equal((await f.request('/entries',{id,entry:{body:'guess'}})).status,403);
 for(const method of ['PATCH','DELETE'])assert.equal((await f.request('/entries/'+id,{version:1,...(method==='PATCH'?{patch:{body:'tamper'}}:{})},{method})).status,403);
 const owner=await f.token(),archive=await (await f.request('/snapshot',{archive:true},{token:owner})).json();assert.equal(archive.entries[0].body,'private archived body');
 assert.equal((await f.request('/entries/'+id,{version:1,patch:{body:'owner update'}},{method:'PATCH',token:owner})).status,200);
 assert.equal((await f.request('/entries/'+id,{version:2},{method:'DELETE',token:owner})).status,200);
});
test('Google signature, audience, issuer, expiry and verified owner identity are checked',async t=>{
 const f=await use(t);await f.seed(randomUUID(),{body:'secret'},DAY*2);
 assert.equal((await f.request('/snapshot',{archive:true},{token:await f.token('someone@example.com')})).status,403);
 const now=Math.floor(Date.now()/1000);
 for(const claims of [{aud:'another-client'},{iss:'https://attacker.example'},{exp:now-1},{email_verified:false},{iat:now-4000,exp:now+3600}])assert.equal((await f.request('/snapshot',{archive:true},{token:await f.token('owner@example.com',claims)})).status,401);
 const valid=await f.token(),parts=valid.split('.');const payload=JSON.parse(Buffer.from(parts[1],'base64url'));payload.email='attacker@example.com';parts[1]=Buffer.from(JSON.stringify(payload)).toString('base64url');assert.equal((await f.request('/snapshot',{archive:true},{token:parts.join('.')})).status,401);
 assert.equal((await f.request('/snapshot',{archive:true},{token:valid})).status,200);
 const health=await (await f.request('/health',undefined,{method:'GET'})).json();assert.equal(health.google_client_id,clientId);assert.equal(health.ready,true);
});
test('pinning preserves creation age; page cursor uses stable creation time and ID order',async t=>{
 const f=await use(t),id=randomUUID();const row=await (await f.request('/entries',{id,entry:{body:'pin'}})).json();
 const pin=await (await f.request('/entries/'+id,{version:1,patch:{kind:'sticky',x:.9,y:.2,color:'amber'}},{method:'PATCH'})).json();assert.equal(pin.created_at,row.created_at);
 const time=Date.now();await f.db.batch(Array.from({length:102},()=>f.db.prepare('INSERT INTO memo_entries(id,kind,body,created_at,updated_at) VALUES(?,?,?,?,?)').bind(randomUUID(),'memo','page',time,time)));
 const first=await (await f.request()).json();assert.equal(first.entries.length,101);const cursor=first.entries[99];
 const next=await (await f.request('/snapshot',{archive:false,cursor:{id:cursor.id,created_at:cursor.created_at}})).json();assert.equal(next.entries.length,3);
 assert.equal(new Set([...first.entries.slice(0,100),...next.entries].map(e=>e.id)).size,103);
});
test('browser origin allowlist and no-store prevent cross-origin/cached archive exposure',async t=>{
 const f=await use(t);
 const denied=await f.request('/snapshot',{}, {headers:{origin:'https://unknown.example'}});assert.equal(denied.status,403);assert.equal(denied.headers.get('access-control-allow-origin'),null);
 const allowed=await f.request('/snapshot',{}, {headers:{origin:'https://www.5e.ai.kr'}});assert.equal(allowed.headers.get('access-control-allow-origin'),'https://www.5e.ai.kr');assert.equal(allowed.headers.get('cache-control'),'no-store');
});
