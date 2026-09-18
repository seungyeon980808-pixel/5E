import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import http from 'node:http';
import { createSharingDocument, parseSharingDocument, receiveSharingDocument } from '../js/ai-sharing-document.mjs';
const require = createRequire(import.meta.url);
const { createSharingStore, TTL } = require('../experiments/web-codex-auth/sharing-store.cjs');
const { createGateway } = require('../experiments/web-codex-auth/editor-gateway.cjs');
const { createTrialProxy } = require('../experiments/web-codex-auth/remote-trial.cjs');
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=';
const fixture = () => [{key:'workspace',activeTaskTabId:'task-a',taskTabSerial:2,imageSerial:4,tabs:[{id:'task-a',title:'여러 PDF 크롭',input:'두 그림을 비교하세요',model:'recipient-model',effort:'high',serviceTier:'priority',conversationId:'private-thread',auth:{token:'private-token'},workState:'busy',attachments:[{id:'a',data:image,sourceKind:'pdf-crop',source:{path:'/Users/private/paper-a.pdf',page:3,crop:{x:12,y:30,width:100,height:80}}},{id:'b',data:image,sourceKind:'pdf-crop',source:{path:'/Users/private/paper-b.pdf',page:9}}],generated:[{id:'v1',data:image,rendererPrompt:'첫 버전'},{id:'v2',data:image,rendererPrompt:'수정 버전',sentConversationId:'private-thread'}],selectedCandidateId:'v1',referenceComposition:{orientation:'free',sourceOrder:['b','a'],freeLayout:{width:600,height:400,placements:[{sourceId:'a',x:120,y:50,width:100,height:100}]}},workbenchViewState:{layout:'side-by-side',selectedSourceId:'b',selectedCandidateId:'v1',zoom:{source:2,result:1.5}}}]}];
function wire(url, options={}) {
  return new Promise((resolve,reject)=>{
    const req=http.request(url,{method:options.method||'GET',headers:{...options.headers,...(options.body ? {'Content-Length':Buffer.byteLength(options.body)} : {})}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:{get:key=>res.headers[key]||null},json:async()=>JSON.parse(Buffer.concat(chunks).toString())}));
    });req.on('error',reject);req.end(options.body);
  });
}

test('multiple source crops, versions, layout and settings survive an independent document snapshot',async()=>{
  const original=fixture();
  const doc=await createSharingDocument(original,{mode:'edit'});
  const restored=await parseSharingDocument(doc);
  assert.equal(restored.workspaces[0].tabs[0].attachments[1].data,image);
  assert.equal(restored.workspaces[0].tabs[0].attachments[1].source.page,9);
  assert.deepEqual(restored.workspaces[0].tabs[0].referenceComposition,original[0].tabs[0].referenceComposition);
  assert.deepEqual(restored.workspaces[0].tabs[0].workbenchViewState,original[0].tabs[0].workbenchViewState);
  assert.equal(restored.workspaces[0].tabs[0].generated.length,2);
  restored.workspaces[0].tabs[0].input='receiver edit';
  assert.equal(original[0].tabs[0].input,'두 그림을 비교하세요');
});
test('authentication, provider sessions and original local paths are excluded',async()=>{
  const doc=await createSharingDocument(fixture());
  const serialized=JSON.stringify(doc);
  for(const sensitive of ['private-token','private-thread','/Users/private','auth','conversationId','sentConversationId'])assert.equal(serialized.includes(sensitive),false);
  assert.equal(doc.workspaces[0].tabs[0].workState,'interrupted');
});
test('remote image references must be replaced by bytes and missing bytes fail explicitly',async()=>{
  const source=fixture();source[0].tabs[0].attachments[0].data='https://example.invalid/output.png';
  const doc=await createSharingDocument(source,{embedImage:async()=>image});
  assert.equal(doc.workspaces[0].tabs[0].attachments[0].data,image);
  await assert.rejects(createSharingDocument(source));
});
test('untrusted extra authentication data and invalid permissions are rejected at receive boundary',async()=>{
  const doc=await createSharingDocument(fixture());doc.workspaces[0].tabs[0].token='secret';
  await assert.rejects(parseSharingDocument(doc));
  await assert.rejects(createSharingDocument(fixture(),{mode:'owner'}));
});
test('TTL denies reads at exactly one hour and deletes all document and image bytes',async()=>{
  let clock=1000;const store=createSharingStore({now:()=>clock});
  try{
    const doc=await createSharingDocument(fixture());const link=await store.create(doc);
    clock+=TTL-1;assert.deepEqual(store.get(link.id),doc);
    clock+=1;assert.throws(()=>store.get(link.id),{status:410});
    assert.deepEqual(readdirSync(store.root),[]);
  }finally{store.close();}
});
test('revocation requires its separate secret and leaves already received browser copy intact',async()=>{
  const store=createSharingStore();const memory=new Map();
  try{
    const doc=await createSharingDocument(fixture());const link=await store.create(doc);
    const browser={get:async id=>memory.get(id),set:async(id,value)=>memory.set(id,value)};
    await receiveSharingDocument(link.id,async()=>store.get(link.id),browser);
    assert.throws(()=>store.revoke(link.id,'wrong'),{status:403});
    store.revoke(link.id,link.revokeKey);
    const cached=await receiveSharingDocument(link.id,async()=>store.get(link.id),browser);
    assert.equal(cached.cached,true);assert.equal(cached.document.workspaces[0].tabs[0].generated[1].data,image);
  }finally{store.close();}
});
test('receiver storage failure is propagated rather than falsely reporting completion',async()=>{
  const doc=await createSharingDocument(fixture());
  await assert.rejects(receiveSharingDocument('id',async()=>doc,{get:async()=>null,set:async()=>{throw new Error('QuotaExceededError');}}),/QuotaExceededError/);
});
test('temporary storage explicitly has no one-hour availability guarantee and close deletes it',async()=>{
  const store=createSharingStore();const link=await store.create(await createSharingDocument(fixture()));
  assert.equal(link.availabilityGuaranteed,false);assert.equal(link.storage,'temporary');
  store.close();assert.equal(existsSync(store.root),false);
});
test('anonymous share HTTP endpoints enforce origin, isolate AI auth, and support expiration',async()=>{
  let clock=0;const store=createSharingStore({now:()=>clock});const server=createGateway({sharingStore:store});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const headers={Origin:origin,'X-5E-Request':'1','Content-Type':'application/json'};
  try{
    const doc=await createSharingDocument(fixture(),{mode:'edit'});
    const denied=await fetch(origin+'/api/shares',{method:'POST',headers:{...headers,Origin:'https://evil.invalid'},body:JSON.stringify(doc)});assert.equal(denied.status,403);
    const response=await fetch(origin+'/api/shares',{method:'POST',headers,body:JSON.stringify(doc)});assert.equal(response.status,201);assert.equal(response.headers.get('set-cookie'),null);
    const link=await response.json();const read=await fetch(origin+'/api/shares/'+link.id);assert.equal(read.status,200);assert.deepEqual(await read.json(),doc);
    clock=TTL;assert.equal((await fetch(origin+'/api/shares/'+link.id)).status,410);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('Render proxy forwards credential-free share CORS without exposing private trial editor',async()=>{
  const gateway=createGateway();await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
  const proxy=createTrialProxy({gatewayPort:gateway.address().port,publicOrigin:'https://sharing.example',accessKey:'a'.repeat(64),webEditorOrigin:'https://www.5e.ai.kr'});
  await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${proxy.address().port}`;
  const headers={Host:'sharing.example',Origin:'https://www.5e.ai.kr','X-5E-Request':'1','Content-Type':'application/json'};
  try{
    const preflight=await wire(origin+'/api/shares',{method:'OPTIONS',headers:{...headers,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-5e-request'}});assert.equal(preflight.status,204);
    const response=await wire(origin+'/api/shares',{method:'POST',headers,body:JSON.stringify(await createSharingDocument(fixture()))});assert.equal(response.status,201);assert.equal(response.headers.get('access-control-allow-origin'),'https://www.5e.ai.kr');assert.equal(response.headers.get('set-cookie'),null);
    const link=await response.json();assert.equal((await wire(origin+'/api/shares/'+link.id,{headers})).status,200);
    assert.equal((await wire(origin+'/api/shares/'+link.id,{method:'DELETE',headers,body:JSON.stringify({revokeKey:link.revokeKey})})).status,200);
    assert.equal((await wire(origin+'/editor/',{headers:{Host:'sharing.example'}})).status,401);
  }finally{await new Promise(resolve=>proxy.close(resolve));await new Promise(resolve=>gateway.close(resolve));}
});

test('shared generation timing retains elapsed time while anonymizing and freezing provider state',async()=>{
  const source=fixture();source[0].tabs[0].generationTiming={turnId:'private-provider-turn',phase:'generating',lastElapsedMs:12345,postprocessPending:true};
  const doc=await createSharingDocument(source);const timing=(await parseSharingDocument(doc)).workspaces[0].tabs[0].generationTiming;
  assert.equal(timing.lastElapsedMs,12345);assert.equal(timing.phase,'terminal');assert.equal(timing.outcome,'interrupted');assert.equal(timing.postprocessPending,false);assert.equal(JSON.stringify(doc).includes('private-provider-turn'),false);
});
