// Local end-to-end contract test: the real UI + SDK talk to an isolated PostgreSQL engine.
// Google identity is a fixture; this does not claim a live OAuth/provider test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.MEMO_PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(import.meta.dirname,'../..');
const evidence=path.join(root,'_work/memo-review');fs.mkdirSync(evidence,{recursive:true});
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;
create table auth.identities(user_id uuid,provider text,identity_data jsonb);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261009010000_memo.sql'),'utf8'));
const owner='11111111-1111-4111-8111-111111111111',old='22222222-2222-4222-8222-222222222222';
await db.query("insert into private.memo_owners values ('owner@example.com')");
await db.query(`insert into auth.identities values ($1,'google','{"email":"owner@example.com","email_verified":true}')`,[owner]);
await db.query("insert into public.memo_entries(id,kind,body,created_at) values ($1,'sticky','24시간 지난 주인장 메모',now()-interval '25 hours')",[old]);
const token=payload=>Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify(payload)).toString('base64url')+'.signature';
const publicKey=token({role:'anon',exp:4102444800});
const ownerToken=token({role:'authenticated',sub:owner,exp:Math.floor(Date.now()/1000)+3600});
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/memo/config.js'){res.setHeader('content-type','text/javascript');res.end('window.MEMO_CONFIG='+JSON.stringify({url:'https://memo-test.supabase.co',publishableKey:publicKey}));return;}
  const file=path.join(root,pathname.endsWith('/')?pathname+'index.html':pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('content-type',({'html':'text/html','js':'text/javascript','css':'text/css','woff2':'font/woff2'})[file.split('.').at(-1)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port+'/memo/';
let failures=0,heldResolve,holdNext=false,holdCreateNext=false,heldStarted=()=>{},snapshotFailures=0;
async function capture(page,file){if(process.env.MEMO_SKIP_CAPTURE!=='1')await page.screenshot({path:path.join(evidence,file),fullPage:true});}
const errors=[], requests=[];
async function setup(context,authenticated=false){
  if(authenticated)await context.addInitScript(({owner,ownerToken})=>{if(location.protocol!=='http:')return;localStorage.setItem('sb-memo-test-auth-token',JSON.stringify({access_token:ownerToken,refresh_token:'test',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:owner,email:'owner@example.com',app_metadata:{provider:'google'},user_metadata:{}}}));},{owner,ownerToken});
  await context.route('https://memo-test.supabase.co/**',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.pathname==='/auth/v1/user'){await route.fulfill({json:{id:owner,email:'owner@example.com',app_metadata:{provider:'google'},user_metadata:{}}});return;}
    if(url.pathname==='/auth/v1/authorize'){await route.fulfill({contentType:'text/html',body:'OAuth request verified'});return;}
    if(url.pathname==='/auth/v1/logout'){await route.fulfill({json:{}});return;}
    const name=url.pathname.split('/').at(-1),args=req.postDataJSON();requests.push({name,args});
    if(snapshotFailures && name==='memo_snapshot'){snapshotFailures--;await route.fulfill({status:503,json:{message:'snapshot outage'}});return;}
    if(holdCreateNext&&name==='memo_create'){holdCreateNext=false;await new Promise(resolve=>{heldResolve=resolve;heldStarted();});}
    if(failures&&name==='memo_create'){failures--;await route.fulfill({status:503,json:{message:'temporary outage'}});return;}
    if(holdNext&&name==='memo_update'){holdNext=false;await new Promise(resolve=>heldResolve=resolve);}
    const identity=req.headers().authorization==='Bearer '+ownerToken?owner:null;
    try{
      const data=await db.transaction(async tx=>{
        await tx.exec('set local role '+(identity?'authenticated':'anon'));
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[identity||'']);
        const fields=Object.keys(args);const result=await tx.query(`select public.${name}(${fields.map((f,i)=>f+' => $'+(i+1)).join(',')}) as result`,Object.values(args));
        return result.rows[0].result;
      });await route.fulfill({json:data});
    }catch(e){requests.push({error:e.message,code:e.code});await route.fulfill({status:e.code==='42501'?403:e.code==='40001'?409:400,json:{message:e.message,code:e.code}});}
  });
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
}
const browser=await chromium.launch();
try{
  const a=await browser.newContext({viewport:{width:1440,height:900},permissions:['clipboard-read','clipboard-write']});
  const b=await browser.newContext({viewport:{width:390,height:844},permissions:['clipboard-read','clipboard-write']});
  await setup(a);await setup(b);
  const pa=await a.newPage(),pb=await b.newPage();await Promise.all([pa.goto(base),pb.goto(base)]);
  await pa.getByText('모든 기기에서 같은 메모').waitFor();await pb.getByText('모든 기기에서 같은 메모').waitFor();
  assert.equal(await pa.locator('.note').count(),0);assert.equal(await pa.locator('.sticky').count(),0);
  console.log('phase:create');await pa.locator('#title-toggle').click();await pa.locator('#memo-title').fill('컴퓨터 → 휴대폰');await pa.locator('#memo-input').fill('https://example.com/한글');
  await pa.locator('#save-button').click();await pa.locator('.note-title').filter({hasText:'컴퓨터 → 휴대폰'}).waitFor();
  await pb.evaluate(()=>window.dispatchEvent(new Event('focus')));await pb.getByText('컴퓨터 → 휴대폰',{exact:true}).waitFor();
  await pb.locator('.copy').click();assert.match(await pb.evaluate(()=>navigator.clipboard.readText()),/^컴퓨터 → 휴대폰\nhttps:/);
  console.log('phase:pin');await pa.locator('.pin-note').click();await pa.locator('.sticky').waitFor();
  const id=await pa.locator('.sticky').getAttribute('data-id');
  assert.equal((await db.query('select count(*)::integer as n from public.memo_entries where created_at>now()-interval \'24 hours\'')).rows[0].n,1);
  await pa.locator('.sticky-body').fill('휴대폰에서도 바로 확인 🪐');await pa.getByText('모든 기기에서 같은 메모').waitFor();
  await pb.evaluate(()=>window.dispatchEvent(new Event('focus')));await pb.locator('.sticky-body').waitFor();
  await pb.waitForFunction(()=>document.querySelector('.sticky-body')?.value==='휴대폰에서도 바로 확인 🪐');
  const handle=pa.locator('.drag-handle');await handle.focus();const before=(await db.query('select x from public.memo_entries where id=$1',[id])).rows[0].x;
  await handle.press('ArrowRight');await pa.getByText('모든 기기에서 같은 메모').waitFor();const after=(await db.query('select x from public.memo_entries where id=$1',[id])).rows[0].x;assert.ok(after>before);
  await pa.locator('[aria-label="포스트잇 색상 바꾸기"]').click();await pa.getByText('모든 기기에서 같은 메모').waitFor();
  await pb.evaluate(()=>window.dispatchEvent(new Event('focus')));await pb.waitForFunction(()=>document.querySelector('.sticky')?.dataset.color==='amber');
  console.log('phase:failure');
  // A dropped save retains the draft and a retry cannot duplicate a committed create.
  failures=1;await pa.locator('#memo-input').fill('실패해도 남는 메모');await pa.locator('#save-button').click();await pa.getByText('메모를 저장하지 못했어요. 입력 내용은 남아 있어요.').waitFor();
  assert.equal(await pa.locator('#memo-input').inputValue(),'실패해도 남는 메모');await pa.locator('#save-button').click();await pa.getByText('실패해도 남는 메모',{exact:true}).waitFor();
  console.log('phase:queued');
  // Save text typed while an earlier autosave is still in flight.
  holdNext=true;await pa.locator('.sticky-body').fill('먼저 쓴 내용');
  await pa.waitForFunction(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('5e-memo-drafts')))).pending[0]?.[1]?.patch.body==='먼저 쓴 내용');
  await new Promise(resolve=>setTimeout(resolve,550));
  await pa.locator('.sticky-body').fill('그 다음 쓴 내용');heldResolve();await pa.getByText('모든 기기에서 같은 메모').waitFor();
  assert.equal((await db.query('select body from public.memo_entries where id=$1',[id])).rows[0].body,'그 다음 쓴 내용');
  await capture(pa,'desktop.png');await capture(pb,'mobile.png');
  // A concurrent remote write cannot be silently overwritten by an autosave.
  holdNext=true;await pa.locator('.sticky-body').fill('충돌 후 내 수정');
  await new Promise(resolve=>setTimeout(resolve,550));
  await db.query("update public.memo_entries set body='다른 기기의 수정',version=version+1 where id=$1",[id]);
  heldResolve();await pa.getByText('저장하지 못한 포스트잇 수정이 있어요.').waitFor();
  assert.equal((await db.query('select body from public.memo_entries where id=$1',[id])).rows[0].body,'다른 기기의 수정');
  await pa.locator('#retry-button').click();await pa.getByText('모든 기기에서 같은 메모').waitFor();
  assert.equal((await db.query('select body from public.memo_entries where id=$1',[id])).rows[0].body,'충돌 후 내 수정');
  await pa.locator('.sticky-body').fill('그 다음 쓴 내용');await pa.getByText('모든 기기에서 같은 메모').waitFor();
  // F1: a successful earlier save must preserve text typed while its response was pending.
  holdCreateNext=true;const started=new Promise(resolve=>heldStarted=resolve);
  await pa.locator('#memo-input').fill('지금 저장할 글');await pa.locator('#save-button').click();await started;
  await pa.locator('#title-toggle').click();await pa.locator('#memo-title').fill('다음 메모 제목');await pa.locator('#memo-input').fill('저장 중에 새로 적은 글');
  heldResolve();await pa.getByText('지금 저장할 글',{exact:true}).waitFor();
  await pa.waitForFunction(()=>!document.querySelector('#save-button').disabled);
  assert.equal(await pa.locator('#memo-input').inputValue(),'저장 중에 새로 적은 글');
  assert.equal(await pa.locator('#memo-title').inputValue(),'다음 메모 제목');
  const savedDraft=await pa.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('5e-memo-drafts')))));
  assert.equal(savedDraft.draft,'저장 중에 새로 적은 글');assert.equal(savedDraft.title,'다음 메모 제목');
  assert.equal(await pa.locator('.note-meta').filter({hasText:'25시간 남음'}).count(),0);
  await capture(pa,'draft-preserved.png');
  // F2: retrying an outage must keep the error and Retry until a refresh succeeds.
  snapshotFailures=100;await pa.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await pa.getByText('연결이 끊겼어요. 작성 중인 내용은 남아 있어요.').waitFor();await pa.locator('#retry-button').click();
  await pa.waitForFunction(()=>!document.querySelector('#retry-button').disabled);
  assert.equal(await pa.locator('#connection-text').textContent(),'연결이 끊겼어요. 작성 중인 내용은 남아 있어요.');
  assert.equal(await pa.locator('#retry-button').isVisible(),true);await capture(pa,'retry-failed.png');
  snapshotFailures=0;await pa.locator('#retry-button').click();await pa.getByText('모든 기기에서 같은 메모').waitFor();
  assert.equal(await pa.locator('#retry-button').isVisible(),false);
  fs.writeFileSync(path.join(evidence,'reviewer-fixes.json'),JSON.stringify({F1:{submitted:'지금 저장할 글',afterResponseBody:await pa.locator('#memo-input').inputValue(),afterResponseTitle:await pa.locator('#memo-title').inputValue(),storedDraft:savedDraft.draft},F2:{failedRetryKeepsError:true,failedRetryKeepsButton:true,successfulRetryClearsError:true}},null,2));
  console.log('phase:clock');
  // Server time, not a modified computer clock, controls public visibility.
  await pa.evaluate(()=>{Date.now=()=>4102444800000;window.dispatchEvent(new Event('focus'));});
  await pa.getByText('모든 기기에서 같은 메모').waitFor();assert.equal(await pa.locator('.sticky').count(),1);
  await db.query("update public.memo_entries set created_at=now()-interval '24 hours' where id=$1",[id]);
  await pa.evaluate(()=>window.dispatchEvent(new Event('focus')));await pa.waitForFunction(()=>!document.querySelector('.sticky'));
  await pa.locator('#archive-toggle').click();assert.equal(await pa.locator('#archive-notes').isVisible(),false);
  console.log('phase:archive');const c=await browser.newContext({viewport:{width:1440,height:900}});await setup(c,true);const pc=await c.newPage();await pc.goto(base);await pc.getByText('모든 기기에서 같은 메모').waitFor();await pc.locator('#archive-toggle').click();
  await pc.getByText('24시간 지난 주인장 메모',{exact:true}).waitFor();await pc.getByText('그 다음 쓴 내용',{exact:true}).waitFor();await capture(pc,'owner-archive.png');
  await pc.locator('#logout-button').click();await pc.getByRole('button',{name:'Google로 로그인'}).waitFor();assert.equal(await pc.locator('#archive-notes').textContent(),'');
  console.log('phase:oauth');await pa.locator('#google-button').click();await pa.waitForURL(/supabase\.co\/auth\/v1\/authorize/);const auth=new URL(pa.url());assert.equal(auth.searchParams.get('provider'),'google');assert.equal(auth.searchParams.get('redirect_to'),new URL(base).origin+'/memo/');assert.ok(auth.searchParams.get('code_challenge'));
  console.log('phase:webkit');const wk=await webkit.launch();const w=await wk.newContext({viewport:{width:1440,height:900}});await setup(w);const pw=await w.newPage();await pw.goto(base);await pw.getByText('모든 기기에서 같은 메모').waitFor();await capture(pw,'webkit.png');assert.equal(await pw.locator('.sticky').count(),0);await wk.close();
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(evidence,'checks.json'),JSON.stringify({status:'passed',engines:['Chromium','WebKit'],cases:['two-device memo transfer','optional title','clipboard','pin preserves creation time','sticky text/color/position sync','failed save retains draft','queued edits while saving','concurrent edit conflict and deliberate retry','new draft preserved while saving','failed retry retains connection error','server clock visibility','owner archive','logout clears archive','Google PKCE redirect contract'],liveSupabase:false,liveGoogle:false},null,2));
  console.log('Browser + PostgreSQL checks passed; evidence: '+evidence);
}catch(e){
  console.log('FAILED',e.message,requests.slice(-15));
  for(const context of browser.contexts())for(const page of context.pages())console.log(await page.evaluate(()=>({status:document.querySelector('#status')?.textContent,connection:document.querySelector('#connection-text')?.textContent,drafts:Object.keys(localStorage).filter(k=>k.startsWith('5e-memo-drafts')).map(k=>localStorage.getItem(k))})));
  throw e;
}finally{await browser.close();await db.close();await new Promise(resolve=>server.close(resolve));}
