// Isolated workerd + SQLite D1. Google keys/tokens are fixtures, never production bypasses.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {build} from 'esbuild';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import fs from 'node:fs';
import path from 'node:path';
export const clientId='fixture.apps.googleusercontent.com',apiUrl='https://memo-test.workers.dev';
export async function fixture(outbound){
  const {publicKey,privateKey}=await generateKeyPair('RS256'),jwk=await exportJWK(publicKey);jwk.kid='fixture';jwk.alg='RS256';jwk.use='sig';
  const script=(await build({entryPoints:[path.resolve(import.meta.dirname,'../worker/index.js')],bundle:true,write:false,format:'esm',platform:'browser'})).outputFiles[0].text;
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2026-10-09',d1Databases:{DB:'memo-fixture'},bindings:{GOOGLE_CLIENT_ID:clientId,OWNER_EMAIL:'owner@example.com',ALLOWED_ORIGINS:'http://127.0.0.1,https://www.5e.ai.kr'},outboundService:request=>{
    if(request.url!=='https://www.googleapis.com/oauth2/v3/certs'){if(outbound)return outbound(request);throw Error('Unexpected external fixture request');}
    return new Response(JSON.stringify({keys:[jwk]}),{headers:{'content-type':'application/json','cache-control':'public,max-age=3600'}});
  }}));
  const db=await mf.getD1Database('DB');
  try{
    for(const file of fs.readdirSync(path.resolve(import.meta.dirname,'../worker/migrations')).filter(f=>f.endsWith('.sql')).sort()){
      const schema=fs.readFileSync(path.resolve(import.meta.dirname,'../worker/migrations',file),'utf8');
      await db.batch(schema.split(/;\n(?=CREATE|ALTER)/).map(sql=>db.prepare(sql)));
    }
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
    await db.batch([
      db.prepare('DROP TRIGGER memo_immutable_age'),
      db.prepare('UPDATE memo_entries SET created_at=? WHERE id=?').bind(Date.now()-ms,id),
      db.prepare("CREATE TRIGGER memo_immutable_age BEFORE UPDATE OF id,created_at ON memo_entries WHEN NEW.id<>OLD.id OR NEW.created_at<>OLD.created_at BEGIN SELECT RAISE(ABORT,'Memo identity and creation time are immutable'); END")
    ]);
  }
  return {mf,db,token,request,seed,age,close:()=>mf.dispose()};
}
