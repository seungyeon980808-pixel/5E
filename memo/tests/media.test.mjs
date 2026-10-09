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
