import { createRemoteJWKSet, jwtVerify } from 'jose';
import { mediaRoute } from './media.js';

const DAY=86400000, CLOCK="CAST(unixepoch('subsec')*1000 AS INTEGER)";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields=['kind','title','body','color','x','y','tilt','z','image_ids'];
const defaults={kind:'memo',title:'',body:'',color:'lilac',x:.1,y:.1,tilt:0,z:0,image_ids:[]};
const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
class ApiError extends Error { constructor(status,code,message){super(message);this.status=status;this.code=code;} }
function invalid(message='Invalid memo request'){throw new ApiError(400,'22023',message);}
function record(value,partial=false){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!fields.includes(k)))invalid();
  const result=partial?{...value}:{...defaults,...value};
  for(const [k,v] of Object.entries(result)){
    if(k==='image_ids'){if(partial||!Array.isArray(v)||v.length>4||new Set(v).size!==v.length||v.some(id=>!uuid.test(id)))invalid();result[k]=JSON.stringify(v);}
    if(k==='kind'&&!['memo','sticky'].includes(v)||k==='color'&&!['lilac','amber','slate','rose'].includes(v))invalid();
    if(['title','body'].includes(k)&&(typeof v!=='string'||v.length>(k==='title'?160:100000)))invalid();
    if(['x','y','tilt','z'].includes(k)&&(!Number.isFinite(v)||v<(k==='tilt'?-4:0)||v>(k==='tilt'?4:k==='z'?2147483647:1)||(k==='z'&&!Number.isInteger(v))))invalid();
  }
  if(partial&&!Object.keys(result).length)invalid();
  return result;
}
async function body(request){
  if(!request.headers.get('content-type')?.startsWith('application/json'))invalid('JSON required');
  const reader=request.body?.getReader();if(!reader)invalid();
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>512000){await reader.cancel();throw new ApiError(413,'22023','Memo is too large');}chunks.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.byteLength;}
  try{const data=JSON.parse(new TextDecoder().decode(bytes));if(!data||typeof data!=='object'||Array.isArray(data))invalid();return data;}catch{invalid('Invalid JSON');}
}
function serialize(row){return {...row,image_ids:JSON.parse(row.image_ids||'[]'),created_at:new Date(row.created_at).toISOString(),updated_at:new Date(row.updated_at).toISOString()};}
function configured(env){return !!env.GOOGLE_CLIENT_ID?.match(/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/)&&!!env.OWNER_EMAIL?.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);}
async function identity(request,env){
  const header=request.headers.get('authorization');if(!header)return {owner:false,user:null};
  if(!configured(env))throw new ApiError(503,'AUTH_CONFIG','Owner login is not configured');
  if(!header.startsWith('Bearer ')||header.length>8192)throw new ApiError(401,'AUTH_EXPIRED','Google login required');
  let payload;
  try{({payload}=await jwtVerify(header.slice(7),googleKeys,{audience:env.GOOGLE_CLIENT_ID,issuer:['https://accounts.google.com','accounts.google.com'],algorithms:['RS256'],requiredClaims:['sub','iat','exp','email','email_verified'],maxTokenAge:'1h',clockTolerance:0}));}
  catch{throw new ApiError(401,'AUTH_EXPIRED','Google login expired or invalid');}
  if(payload.email_verified!==true||typeof payload.email!=='string'||typeof payload.sub!=='string')throw new ApiError(401,'AUTH_EXPIRED','Verified Google account required');
  return {owner:payload.email.toLowerCase()===env.OWNER_EMAIL.toLowerCase(),user:{id:payload.sub,email:payload.email,expires_at:payload.exp}};
}
async function inaccessible(db,id,owner){
  const row=await db.prepare(`SELECT version,created_at,${CLOCK} AS clock FROM memo_entries WHERE id=?`).bind(id).first();
  if(!row)throw new ApiError(404,'P0002','Memo was deleted');
  if(!owner&&row.created_at<=row.clock-DAY)throw new ApiError(403,'42501','Memo moved to owner archive');
  throw new ApiError(409,'40001','Memo changed on another device');
}
async function route(request,env,url){
  if(url.pathname==='/health'&&request.method==='GET'){
    await env.DB.prepare('SELECT id FROM memo_entries LIMIT 1').all();
    return {service:'5e-memo',schema:1,ready:configured(env),google_client_id:env.GOOGLE_CLIENT_ID||''};
  }
  const auth=await identity(request,env);
  const media=await mediaRoute(request,env,url,auth,ApiError,uuid);if(media!==undefined)return media;
  if(url.pathname==='/snapshot'&&request.method==='POST'){
    const data=await body(request);if(Object.keys(data).some(k=>!['archive','cursor'].includes(k))||data.archive!==undefined&&typeof data.archive!=='boolean')invalid();
    const archive=data.archive===true;
    if(archive&&!auth.owner)throw new ApiError(403,'42501','Owner archive requires the designated Google account');
    const cursor=data.cursor;let cursorWhere='',params=[];
    if(cursor){if(!uuid.test(cursor.id)||!Number.isFinite(Date.parse(cursor.created_at)))invalid('Invalid cursor');cursorWhere=' AND (created_at<? OR (created_at=? AND id<?))';const time=Date.parse(cursor.created_at);params=[time,time,cursor.id];}
    const results=await env.DB.batch([
      env.DB.prepare(`SELECT ${CLOCK} AS clock`),
      env.DB.prepare(`SELECT * FROM memo_entries WHERE created_at${archive?'<=':'>'}${CLOCK}-${DAY}${cursorWhere} ORDER BY created_at DESC,id DESC LIMIT 101`).bind(...params)
    ]);
    return {server_time:new Date(results[0].results[0].clock).toISOString(),owner:auth.owner,user:auth.user,owner_configured:configured(env),entries:results[1].results.map(serialize)};
  }
  if(url.pathname==='/entries'&&request.method==='POST'){
    const data=await body(request);if(!uuid.test(data.id)||Object.keys(data).some(k=>!['id','entry'].includes(k)))invalid();
    const entry=record(data.entry),images=JSON.parse(entry.image_ids);
    const imageGuard=images.length?` WHERE (SELECT count(*) FROM memo_images WHERE id IN (${images.map(()=>'?').join(',')}) AND (entry_id=? OR (entry_id IS NULL AND created_at>${CLOCK}-${DAY})))=?`:'';
    const results=await env.DB.batch([
      env.DB.prepare(`INSERT INTO memo_entries(id,${fields.join(',')}) SELECT ?,${fields.map(()=>'?').join(',')}${imageGuard} ON CONFLICT(id) DO NOTHING`).bind(data.id,...fields.map(k=>entry[k]),...(images.length?[...images,data.id,images.length]:[])),
      ...images.map(id=>env.DB.prepare('UPDATE memo_images SET entry_id=? WHERE id=? AND entry_id IS NULL AND EXISTS(SELECT 1 FROM memo_entries WHERE id=? AND image_ids=?)').bind(data.id,id,data.id,entry.image_ids)),
      env.DB.prepare(`SELECT * FROM memo_entries WHERE id=? AND (created_at>${CLOCK}-${DAY} OR ?=1)`).bind(data.id,Number(auth.owner))
    ]);
    const row=results.at(-1).results[0];if(!row)throw new ApiError(403,'42501','Memo moved to owner archive');
    return serialize(row);
  }
  const attachmentId=url.pathname.match(/^\/entries\/([^/]+)\/images$/)?.[1];
  if(attachmentId&&request.method==='POST'){
    if(!uuid.test(attachmentId))invalid();
    const data=await body(request),images=data.image_ids;
    if(Object.keys(data).some(k=>!['version','image_ids'].includes(k))||!Array.isArray(images)||!images.length||images.length>4||new Set(images).size!==images.length||images.some(id=>!uuid.test(id)))invalid();
    if(!Number.isInteger(data.version)||data.version<1)throw new ApiError(409,'40001','Valid memo version required');
    const current=await env.DB.prepare(`SELECT *,${CLOCK} AS clock FROM memo_entries WHERE id=?`).bind(attachmentId).first();
    if(!current||!auth.owner&&current.created_at<=current.clock-DAY)await inaccessible(env.DB,attachmentId,auth.owner);
    const attached=JSON.parse(current.image_ids),added=images.filter(id=>!attached.includes(id));
    delete current.clock;
    // A lost response can be retried with the same image IDs without duplicating them.
    if(!added.length)return serialize(current);
    if(current.version!==data.version)await inaccessible(env.DB,attachmentId,auth.owner);
    if(attached.length+added.length>4)throw new ApiError(400,'IMAGE_LIMIT','A memo supports at most four images');
    const combined=JSON.stringify([...attached,...added]);
    const results=await env.DB.batch([
      env.DB.prepare(`UPDATE memo_entries SET image_ids=?,updated_at=${CLOCK},version=version+1 WHERE id=? AND version=? AND (created_at>${CLOCK}-${DAY} OR ?=1) AND (SELECT count(*) FROM memo_images WHERE id IN (${added.map(()=>'?').join(',')}) AND entry_id IS NULL AND created_at>${CLOCK}-${DAY})=? RETURNING *`).bind(combined,attachmentId,data.version,Number(auth.owner),...added,added.length),
      ...added.map(id=>env.DB.prepare('UPDATE memo_images SET entry_id=? WHERE id=? AND entry_id IS NULL AND EXISTS(SELECT 1 FROM memo_entries WHERE id=? AND version=? AND image_ids=?)').bind(attachmentId,id,attachmentId,data.version+1,combined))
    ]);
    const row=results[0].results[0];
    if(!row){const latest=await env.DB.prepare(`SELECT version,created_at,${CLOCK} AS clock FROM memo_entries WHERE id=?`).bind(attachmentId).first();if(!latest||latest.version!==data.version||!auth.owner&&latest.created_at<=latest.clock-DAY)await inaccessible(env.DB,attachmentId,auth.owner);invalid('Images are missing or already attached elsewhere');}
    return serialize(row);
  }
  const id=url.pathname.match(/^\/entries\/([^/]+)$/)?.[1];
  if(id&&['PATCH','DELETE'].includes(request.method)){
    if(!uuid.test(id))invalid();const data=await body(request);
    if(!Number.isInteger(data.version)||data.version<1)throw new ApiError(409,'40001','Valid memo version required');
    if(Object.keys(data).some(k=>!['version',...(request.method==='PATCH'?['patch']:[])].includes(k)))invalid();
    if(request.method==='PATCH'){
      const patch=record(data.patch,true),keys=Object.keys(patch);
      const row=await env.DB.prepare(`UPDATE memo_entries SET ${keys.map(k=>k+'=?').join(',')},updated_at=${CLOCK},version=version+1 WHERE id=? AND version=? AND (created_at>${CLOCK}-${DAY} OR ?=1) RETURNING *`).bind(...keys.map(k=>patch[k]),id,data.version,Number(auth.owner)).first();
      if(!row)await inaccessible(env.DB,id,auth.owner);return serialize(row);
    }
    const row=await env.DB.prepare(`DELETE FROM memo_entries WHERE id=? AND version=? AND (created_at>${CLOCK}-${DAY} OR ?=1) RETURNING id`).bind(id,data.version,Number(auth.owner)).first();
    if(!row)await inaccessible(env.DB,id,auth.owner);return {deleted:true};
  }
  throw new ApiError(404,'NOT_FOUND','Endpoint not found');
}
export default {
  async fetch(request,env){
    const origin=request.headers.get('origin'),allowed=(env.ALLOWED_ORIGINS||'https://www.5e.ai.kr,https://5e.ai.kr').split(',').map(s=>s.trim());
    const headers={'content-type':'application/json;charset=utf-8','cache-control':'no-store','vary':'Origin','x-content-type-options':'nosniff'};
    if(origin&&!allowed.includes(origin))return Response.json({code:'ORIGIN_DENIED',message:'Origin not allowed'},{status:403,headers});
    if(origin)headers['access-control-allow-origin']=origin;
    headers['access-control-allow-methods']='GET,POST,PUT,PATCH,DELETE,OPTIONS';headers['access-control-allow-headers']='Content-Type,Authorization';
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    try{const result=await route(request,env,new URL(request.url));if(result instanceof Response){const merged=new Headers(headers);for(const [key,value] of result.headers)merged.set(key,value);return new Response(result.body,{status:result.status,headers:merged});}return Response.json(result,{headers});}
    catch(error){return Response.json({code:error instanceof ApiError?error.code:'UNAVAILABLE',message:error instanceof ApiError?error.message:'Memo service is temporarily unavailable'},{status:error instanceof ApiError?error.status:503,headers});}
  }
};
