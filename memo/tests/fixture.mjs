// Isolated workerd + SQLite D1. Google keys/tokens are fixtures, never production bypasses.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {build} from 'esbuild';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import fs from 'node:fs';
import path from 'node:path';
export const clientId='fixture.apps.googleusercontent.com',apiUrl='https://memo-test.workers.dev';
export async function fixture(){
  const {publicKey,privateKey}=await generateKeyPair('RS256'),jwk=await exportJWK(publicKey);jwk.kid='fixture';jwk.alg='RS256';jwk.use='sig';
  const script=(await build({entryPoints:[path.resolve(import.meta.dirname,'../worker/index.js')],bundle:true,write:false,format:'esm',platform:'browser'})).outputFiles[0].text;
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2026-10-09',d1Databases:{DB:'memo-fixture'},bindings:{GOOGLE_CLIENT_ID:clientId,OWNER_EMAIL:'owner@example.com',ALLOWED_ORIGINS:'http://127.0.0.1,https://www.5e.ai.kr'},outboundService:request=>{
    if(request.url!=='https://www.googleapis.com/oauth2/v3/certs')throw Error('Unexpected external fixture request');
    return new Response(JSON.stringify({keys:[jwk]}),{headers:{'content-type':'application/json','cache-control':'public,max-age=3600'}});
  }}));
  const db=await mf.getD1Database('DB');
  try{
    const schema=fs.readFileSync(path.resolve(import.meta.dirname,'../worker/migrations/0001_memo.sql'),'utf8');
    await db.batch(schema.split(/;\n(?=CREATE)/).map(sql=>db.prepare(sql)));
  }catch(error){await mf.dispose();throw error;}
  async function token(email='owner@example.com',claims={}){
    const now=Math.floor(Date.now()/1000);
    return new SignJWT({email,email_verified:true,iat:now,exp:now+3600,sub:'google-'+email,iss:'https://accounts.google.com',aud:clientId,...claims}).setProtectedHeader({alg:'RS256',kid:'fixture'}).sign(privateKey);
  }
  async function request(route='/snapshot',data={archive:false,cursor:null},options={}){
    const headers={'content-type':'application/json',...options.headers};if(options.token)headers.authorization='Bearer '+options.token;
    return mf.dispatchFetch(apiUrl+route,{method:options.method||'POST',headers,body:options.method==='GET'?undefined:JSON.stringify(data)});
  }
  async function seed(id,entry={},age=0){
    await db.prepare('INSERT INTO memo_entries(id,kind,title,body,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(id,entry.kind||'memo',entry.title||'',entry.body||'',Date.now()-age,Date.now()-age).run();
  }
  async function age(id,ms){
    const row=await db.prepare('SELECT * FROM memo_entries WHERE id=?').bind(id).first();row.created_at=Date.now()-ms;
    const keys=Object.keys(row);
    await db.batch([db.prepare('DELETE FROM memo_entries WHERE id=?').bind(id),db.prepare(`INSERT INTO memo_entries(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).bind(...keys.map(k=>row[k]))]);
  }
  return {mf,db,token,request,seed,age,close:()=>mf.dispose()};
}
