import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixture.mjs';
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6N8AAAAASUVORK5CYII=','base64'));
const upload=(f,id,bytes=png,type='image/png')=>f.mf.dispatchFetch('https://memo-test.workers.dev/images/'+id,{method:'PUT',headers:{'content-type':type},body:bytes});
const get=(f,path,token)=>f.mf.dispatchFetch('https://memo-test.workers.dev'+path,{headers:token?{authorization:'Bearer '+token}:{}});
async function use(t){const f=await fixture(request=>{
  if(request.url==='https://example.com/long')return new Response('<meta property="og:image" content="/cover.png">'+ 'x'.repeat(400000),{headers:{'content-type':'text/html'}});
  if(request.url==='https://example.com/page')return new Response('<html><head><meta content="화면 &amp; 디자인" property="og:title"><meta content="/cover.png" property="og:image"></head></html>',{headers:{'content-type':'text/html'}});
  if(request.url==='https://example.com/cover.png')return new Response(png,{headers:{'content-type':'image/png'}});
  if(request.url==='https://example.com/unsafe')return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});
  return new Response('<html><head><meta name="description" content="No image"></head></html>',{headers:{'content-type':'text/html'}});
});t.after(()=>f.close());return f;}
test('binary image upload round-trips across chunks, retries safely and is attached to image-only memos',async t=>{
 const f=await use(t),image=randomUUID(),id=randomUUID(),large=new Uint8Array(700000);large.set(png);
 assert.equal((await upload(f,image,large)).status,200);
 assert.equal((await upload(f,image,large)).status,200);
 assert.equal((await get(f,'/images/'+image)).status,404);
 const created=await f.request('/entries',{id,entry:{body:'',image_ids:[image]}});assert.equal(created.status,200);assert.deepEqual((await created.json()).image_ids,[image]);
 const response=await get(f,'/images/'+image);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),large);
 assert.equal((await f.request('/entries',{id:randomUUID(),entry:{image_ids:[image]}})).status,403);
 const pinned=await f.request('/entries/'+id,{version:1,patch:{kind:'sticky'}},{method:'PATCH'});assert.deepEqual((await pinned.json()).image_ids,[image]);
 await f.request('/entries/'+id,{version:2},{method:'DELETE'});assert.equal((await get(f,'/images/'+image)).status,404);
 assert.equal((await f.db.prepare('SELECT count(*) AS n FROM memo_image_chunks WHERE image_id=?').bind(image).first()).n,0);
});
test('image, preview and thumbnail direct URLs obey the original 24-hour owner boundary',async t=>{
 const f=await use(t),image=randomUUID(),id=randomUUID();await upload(f,image);
 await f.request('/entries',{id,entry:{body:'https://example.com/page',image_ids:[image]}});
 const preview=await (await get(f,'/entries/'+id+'/preview')).json();assert.equal(preview.title,'화면 & 디자인');assert.equal(preview.url,'https://example.com/page');
 assert.deepEqual(new Uint8Array(await (await get(f,'/entries/'+id+'/thumbnail')).arrayBuffer()),png);
 await f.age(id,86400001);const owner=await f.token(),other=await f.token('someone@example.com');
 for(const endpoint of ['/images/'+image,'/entries/'+id+'/preview','/entries/'+id+'/thumbnail']){
  assert.equal((await get(f,endpoint)).status,403);assert.equal((await get(f,endpoint,other)).status,403);assert.equal((await get(f,endpoint,owner)).status,200);
 }
 assert.equal((await upload(f,image)).status,403);
});
test('unsupported and oversized uploads fail, missing upload IDs cannot produce broken memo records',async t=>{
 const f=await use(t);
 assert.equal((await upload(f,randomUUID(),new TextEncoder().encode('<svg></svg>'),'image/svg+xml')).status,415);
 assert.equal((await upload(f,randomUUID(),png,'image/jpeg')).status,415);
 assert.equal((await upload(f,randomUUID(),new Uint8Array(5000001))).status,413);
 assert.equal((await f.request('/entries',{id:randomUUID(),entry:{image_ids:[randomUUID()]}})).status,403);
 assert.equal((await f.request('/entries',{id:randomUUID(),entry:{image_ids:Array.from({length:5},()=>randomUUID())}})).status,400);
 assert.equal((await f.db.prepare('SELECT count(*) AS n FROM memo_entries').first()).n,0);
});
test('links without thumbnails and redirects to private hosts fall back without accepting fabricated previews',async t=>{
 const f=await use(t);
 const long=randomUUID();await f.request('/entries',{id:long,entry:{body:'https://example.com/long'}});assert.equal((await (await get(f,'/entries/'+long+'/preview')).json()).url,'https://example.com/long');
 for(const body of ['https://example.com/no-image','https://example.com/unsafe','http://127.0.0.1/private']){
  const id=randomUUID();await f.request('/entries',{id,entry:{body}});const preview=await get(f,'/entries/'+id+'/preview');assert.equal(preview.status,200);assert.equal(await preview.json(),null);
 }
});
test('adding images preserves the existing memo, creation time and attachments, and retries are idempotent',async t=>{
 const f=await use(t),id=randomUUID(),first=randomUUID(),second=randomUUID();await upload(f,first);await upload(f,second);
 const original=await (await f.request('/entries',{id,entry:{title:'기존 제목',body:'기존 내용',image_ids:[first]}})).json();
 const added=await f.request('/entries/'+id+'/images',{version:original.version,image_ids:[second]});assert.equal(added.status,200);
 const updated=await added.json();assert.deepEqual(updated.image_ids,[first,second]);assert.equal(updated.created_at,original.created_at);assert.equal(updated.title,original.title);assert.equal(updated.body,original.body);assert.equal(updated.version,original.version+1);
 const retry=await f.request('/entries/'+id+'/images',{version:original.version,image_ids:[second]});assert.equal(retry.status,200);assert.deepEqual((await retry.json()).image_ids,[first,second]);
 assert.deepEqual(new Uint8Array(await (await get(f,'/images/'+second)).arrayBuffer()),png);
 await f.request('/entries/'+id,{version:updated.version,patch:{kind:'sticky'}},{method:'PATCH'});
 const third=randomUUID();await upload(f,third);const sticky=await (await f.request('/entries/'+id+'/images',{version:updated.version+1,image_ids:[third]})).json();assert.equal(sticky.kind,'sticky');assert.equal(sticky.created_at,original.created_at);assert.equal(sticky.image_ids.length,3);
});
test('image appends cannot steal attachments, exceed four images, or overwrite a concurrent memo edit',async t=>{
 const f=await use(t),id=randomUUID(),other=randomUUID(),images=Array.from({length:6},()=>randomUUID());for(const image of images)await upload(f,image);
 await f.request('/entries',{id,entry:{body:'keep text',image_ids:images.slice(0,3)}});await f.request('/entries',{id:other,entry:{image_ids:[images[3]]}});
 assert.equal((await f.request('/entries/'+id+'/images',{version:1,image_ids:[images[3]]})).status,400);
 assert.equal((await f.request('/entries/'+id+'/images',{version:1,image_ids:[images[4],images[5]]})).status,400);
 assert.equal((await f.request('/entries/'+id+'/images',{version:1,image_ids:[randomUUID()]})).status,400);
 const race=await Promise.all([f.request('/entries/'+id+'/images',{version:1,image_ids:[images[4]]}),f.request('/entries/'+id,{version:1,patch:{body:'another device'}},{method:'PATCH'})]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
 const current=(await (await f.request()).json()).entries.find(e=>e.id===id);assert.equal(current.version,2);assert.equal(current.created_at.length>0,true);
 if(current.image_ids.length===3)assert.equal((await get(f,'/images/'+images[4])).status,404);
 assert.equal((await f.request('/entries/'+id+'/images',{version:current.version,image_ids:[images[5]]})).status,current.image_ids.length===4?400:200);
});
test('late attachment keeps the original 24-hour cutoff; only the owner can append in the archive',async t=>{
 const f=await use(t),id=randomUUID(),image=randomUUID();await f.seed(id,{kind:'sticky',body:'보관할 내용'},86400001);await upload(f,image);
 assert.equal((await f.request('/entries/'+id+'/images',{version:1,image_ids:[image]})).status,403);
 assert.equal((await f.request('/entries/'+id+'/images',{version:1,image_ids:[image]},{token:await f.token('other@example.com')})).status,403);
 const archived=await (await f.request('/entries/'+id+'/images',{version:1,image_ids:[image]},{token:await f.token()})).json();assert.deepEqual(archived.image_ids,[image]);assert.ok(Date.parse(archived.created_at)<Date.now()-86400000);
 assert.equal((await get(f,'/images/'+image)).status,403);assert.equal((await get(f,'/images/'+image,await f.token())).status,200);
 assert.equal((await f.request('/entries/'+id+'/images',{version:1,image_ids:[image]})).status,403);
});
