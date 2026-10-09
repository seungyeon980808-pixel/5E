const LIMIT=5000000,CHUNK=262144,DAY=86400000,CLOCK="CAST(unixepoch('subsec')*1000 AS INTEGER)";
export function linkUrl(text){
  const candidate=text.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[),.;!?\]}]+$/,'');
  return candidate ? publicUrl(candidate) : null;
}
function publicUrl(value,base){
  if(typeof value!=='string'||!value.trim())return null;
  try {
    const u=new URL(value,base),h=u.hostname.toLowerCase();
    if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port||u.href.length>2048
      ||!h.includes('.')||h.startsWith('[')||/^\d+(\.\d+){3}$/.test(h)
      ||/(^|\.)(localhost|local|internal|test|invalid)$/.test(h))return null;
    u.hash='';return u.href;
  } catch{return null;}
}
function decoded(value){
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|quot|apos|lt|gt|nbsp);/gi,(entity,key)=>{
    const named={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};
    if(key[0]!=='#')return named[key.toLowerCase()]||entity;
    const code=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));
    return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):entity;
  });
}
async function limitedBytes(response,limit){
  const reader=response.body?.getReader();if(!reader)throw Error('Empty image');
  const parts=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;
    if(size>limit){await reader.cancel();throw Error('Media too large');}parts.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}return bytes;
}
function imageType(bytes){
  if(bytes.length<12)return null;
  const s=new TextDecoder().decode(bytes.slice(0,12));
  if(bytes[0]===137&&s.slice(1,4)==='PNG'&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10)return 'image/png';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(s.startsWith('GIF87a')||s.startsWith('GIF89a'))return 'image/gif';
  if(s.startsWith('RIFF')&&s.slice(8,12)==='WEBP')return 'image/webp';return null;
}
async function remote(url,accept,signal){
  for(let i=0;i<4;i++){
    if(!publicUrl(url))throw Error('Invalid media URL');
    const response=await fetch(url,{redirect:'manual',signal,headers:{accept,'user-agent':'5E-Memo-LinkPreview/1.0'}});
    if([301,302,303,307,308].includes(response.status)){
      const next=publicUrl(response.headers.get('location'),url);await response.body?.cancel();if(!next)throw Error('Invalid redirect');url=next;continue;}
    if(!response.ok)throw Error('Preview unavailable');return {response,url};
  }throw Error('Too many redirects');
}
async function visible(db,id,owner,ApiError){
  const row=await db.prepare(`SELECT id,body,image_ids,created_at,${CLOCK} AS clock FROM memo_entries WHERE id=?`).bind(id).first();
  if(!row)throw new ApiError(404,'P0002','Memo was deleted');
  if(!owner&&row.created_at<=row.clock-DAY)throw new ApiError(403,'42501','Memo moved to owner archive');return row;
}
async function preview(db,row){
  const source=linkUrl(row.body);if(!source)return null;
  const cached=await db.prepare('SELECT * FROM memo_link_previews WHERE entry_id=?').bind(row.id).first();
  if(cached?.source_url===source&&cached.checked_at>Date.now()-3600000)return cached;
  let title='',image='';
  try{
    const {response,url}=await remote(source,'text/html',AbortSignal.timeout(5000));
    if(!response.headers.get('content-type')?.includes('text/html'))return null;
    const bytes=await limitedBytes(response,262144),meta=new Map();
    const parser=new HTMLRewriter().on('meta',{element(e){const key=(e.getAttribute('property')||e.getAttribute('name')||'').toLowerCase(),value=e.getAttribute('content');if(value&&!meta.has(key))meta.set(key,decoded(value));}});
    await parser.transform(new Response(bytes,{headers:{'content-type':'text/html;charset=utf-8'}})).text();
    title=(meta.get('og:title')||meta.get('twitter:title')||'').slice(0,200);
    image=publicUrl(meta.get('og:image:secure_url')||meta.get('og:image')||meta.get('twitter:image')||meta.get('twitter:image:src'),url)||'';
  }catch{/* A link remains usable when its preview provider is unavailable. */}
  await db.prepare(`INSERT INTO memo_link_previews(entry_id,source_url,title,image_url) VALUES(?,?,?,?) ON CONFLICT(entry_id) DO UPDATE SET source_url=excluded.source_url,title=excluded.title,image_url=excluded.image_url,checked_at=${CLOCK}`).bind(row.id,source,title,image).run();
  return {source_url:source,title,image_url:image};
}
export async function mediaRoute(request,env,url,auth,ApiError,uuid){
  const db=env.DB,imageId=url.pathname.match(/^\/images\/([^/]+)$/)?.[1];
  if(imageId&&['GET','PUT'].includes(request.method)){
    if(!uuid.test(imageId))throw new ApiError(400,'22023','Invalid image ID');
    const old=await db.prepare('SELECT id,entry_id,type,size,created_at FROM memo_images WHERE id=?').bind(imageId).first();
    if(request.method==='GET'){
      if(!old?.entry_id)throw new ApiError(404,'P0002','Image not found');
      const row=await visible(db,old.entry_id,auth.owner,ApiError);
      if(!JSON.parse(row.image_ids).includes(imageId))throw new ApiError(404,'P0002','Image not attached');
      const chunks=await db.prepare('SELECT data FROM memo_image_chunks WHERE image_id=? ORDER BY part').bind(imageId).all();
      const bytes=new Uint8Array(old.size);let at=0;for(const {data} of chunks.results){const chunk=new Uint8Array(data);bytes.set(chunk,at);at+=chunk.length;}
      if(at!==old.size)throw Error('Incomplete image');return new Response(bytes,{headers:{'content-type':old.type,'content-disposition':'inline'}});
    }
    if(old?.entry_id){await visible(db,old.entry_id,auth.owner,ApiError);return {id:old.id,type:old.type,size:old.size};}
    if(old&&old.created_at>Date.now()-DAY)return {id:old.id,type:old.type,size:old.size};
    if(Number(request.headers.get('content-length'))>LIMIT)throw new ApiError(413,'IMAGE_TOO_LARGE','Images must be 5 MB or smaller');
    let bytes;try{bytes=await limitedBytes(request,LIMIT);}catch{throw new ApiError(413,'IMAGE_TOO_LARGE','Images must be 5 MB or smaller');}
    const type=imageType(bytes);if(!type||request.headers.get('content-type')?.split(';')[0]!==type)throw new ApiError(415,'IMAGE_TYPE','Use PNG, JPEG, WebP or GIF images');
    const key=crypto.randomUUID(),statements=[db.prepare(`DELETE FROM memo_images WHERE entry_id IS NULL AND created_at<=${CLOCK}-${DAY}`),
      db.prepare('INSERT INTO memo_images(id,type,size,upload_key) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(imageId,type,bytes.length,key)];
    for(let at=0,part=0;at<bytes.length;at+=CHUNK,part++)statements.push(db.prepare('INSERT INTO memo_image_chunks(image_id,part,data) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM memo_images WHERE id=? AND upload_key=?) ON CONFLICT(image_id,part) DO NOTHING').bind(imageId,part,bytes.slice(at,at+CHUNK).buffer,imageId,key));
    await db.batch(statements);const saved=await db.prepare('SELECT id,type,size FROM memo_images WHERE id=?').bind(imageId).first();return saved;
  }
  const match=url.pathname.match(/^\/entries\/([^/]+)\/(preview|thumbnail)$/);
  if(match&&request.method==='GET'){
    if(!uuid.test(match[1]))throw new ApiError(400,'22023','Invalid memo ID');
    const row=await visible(db,match[1],auth.owner,ApiError),info=await preview(db,row);
    const latest=await visible(db,row.id,auth.owner,ApiError);
    if(!info||linkUrl(latest.body)!==info.source_url||!info.image_url){
      if(match[2]==='preview')return null;throw new ApiError(404,'P0002','No thumbnail');}
    if(match[2]==='preview')return {url:info.source_url,title:info.title};
    try{
      const {response}=await remote(info.image_url,'image/*',AbortSignal.timeout(5000));
      const bytes=await limitedBytes(response,LIMIT),type=imageType(bytes);if(!type)throw Error('Not an image');
      await visible(db,row.id,auth.owner,ApiError);return new Response(bytes,{headers:{'content-type':type}});
    }catch(error){if(error instanceof ApiError)throw error;throw new ApiError(404,'P0002','Thumbnail unavailable');}
  }
  return undefined;
}
