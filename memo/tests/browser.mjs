// The real UI talks to isolated workerd + D1; Google RSA keys are fixtures.
// Google identity is a fixture; this does not claim a live OAuth/provider test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {fixture,clientId,apiUrl} from './fixture.mjs';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.MEMO_PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(import.meta.dirname,'../..');
const evidence=path.join(root,'_work/memo-review');fs.mkdirSync(evidence,{recursive:true});
const f=await fixture();
const db={query:async(sql,values=[])=>({rows:(await f.db.prepare(sql.replaceAll('public.memo_entries','memo_entries').replace(/\$[0-9]+/g,'?').replace('count(*)::integer','count(*)').replace("created_at>now()-interval '24 hours'","created_at>CAST(unixepoch('subsec')*1000 AS INTEGER)-86400000")).bind(...values).all()).results})};
const owner='google-owner@example.com',old='22222222-2222-4222-8222-222222222222';
await f.seed(old,{kind:'sticky',body:'24시간 지난 주인장 메모'},25*3600000);
const ownerToken=await f.token();
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/memo/config.js'){res.setHeader('content-type','text/javascript');res.end('window.MEMO_CONFIG='+JSON.stringify({apiUrl,googleClientId:clientId}));return;}
  const file=path.join(root,pathname.endsWith('/')?pathname+'index.html':pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('content-type',({'html':'text/html','js':'text/javascript','css':'text/css','woff2':'font/woff2'})[file.split('.').at(-1)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port+'/memo/';
let failures=0,heldResolve,holdNext=false,holdCreateNext=false,heldStarted=()=>{},snapshotFailures=0,holdArchiveNext=false,archiveStarted=()=>{},releaseArchive;
async function capture(page,file){if(process.env.MEMO_SKIP_CAPTURE!=='1')await page.screenshot({path:path.join(evidence,file),fullPage:true});}
const errors=[], requests=[];
async function setup(context,authenticated=false){
  if(authenticated)await context.addInitScript(({ownerToken,apiUrl})=>{if(location.protocol!=='http:')return;sessionStorage.setItem('5e-memo-google:'+apiUrl,ownerToken);},{ownerToken,apiUrl});
  await context.route('https://accounts.google.com/gsi/client',route=>route.fulfill({contentType:'text/javascript',body:`window.google={accounts:{id:{initialize(options){window.fixtureGoogle=options;},renderButton(element){const button=document.createElement('button');button.textContent='Google로 로그인';button.onclick=()=>window.fixtureGoogle.callback({credential:${JSON.stringify(ownerToken)}});element.append(button);},disableAutoSelect(){}}}};`}));
  await context.route(apiUrl+'/**',async route=>{
    const req=route.request(),url=new URL(req.url()),args=req.method()==='GET'?null:req.postDataJSON();
    if(req.method()==='GET'){const response=await f.mf.dispatchFetch(req.url(),{headers:req.headers().authorization?{authorization:req.headers().authorization}:{}});await route.fulfill({status:response.status,headers:{'access-control-allow-origin':new URL(base).origin,'content-type':response.headers.get('content-type')},body:Buffer.from(await response.arrayBuffer())});return;}
    const name=url.pathname==='/snapshot'?'memo_snapshot':req.method()==='POST'?'memo_create':req.method()==='PATCH'?'memo_update':'memo_delete';requests.push({name,args});
    if(snapshotFailures&&name==='memo_snapshot'){snapshotFailures--;await route.fulfill({status:503,json:{message:'snapshot outage'}});return;}
    if(holdCreateNext&&name==='memo_create'){holdCreateNext=false;await new Promise(resolve=>{heldResolve=resolve;heldStarted();});}
    if(failures&&name==='memo_create'){failures--;await route.fulfill({status:503,json:{message:'temporary outage'}});return;}
    if(holdNext&&name==='memo_update'){holdNext=false;await new Promise(resolve=>heldResolve=resolve);}
    const response=await f.request(url.pathname,args,{method:req.method(),headers:req.headers().authorization?{authorization:req.headers().authorization}:{}});
    const data=await response.json();
    if(holdArchiveNext&&args.archive){holdArchiveNext=false;await new Promise(resolve=>{releaseArchive=resolve;archiveStarted();});}
    await route.fulfill({status:response.status,headers:{'access-control-allow-origin':new URL(base).origin,'content-type':'application/json'},body:JSON.stringify(data)});
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
  await f.age(id,86400001);
  await pa.evaluate(()=>window.dispatchEvent(new Event('focus')));await pa.waitForFunction(()=>!document.querySelector('.sticky'));
  await pa.locator('#archive-toggle').click();assert.equal(await pa.locator('#archive-notes').isVisible(),false);
  console.log('phase:archive');const c=await browser.newContext({viewport:{width:1440,height:900}});await setup(c,true);const pc=await c.newPage();await pc.goto(base);await pc.getByText('모든 기기에서 같은 메모').waitFor();await pc.locator('#archive-toggle').click();
  await pc.getByText('24시간 지난 주인장 메모',{exact:true}).waitFor();await pc.getByText('그 다음 쓴 내용',{exact:true}).waitFor();await capture(pc,'owner-archive.png');
  holdArchiveNext=true;const archivePending=new Promise(resolve=>archiveStarted=resolve);await pc.evaluate(()=>window.dispatchEvent(new Event('focus')));await archivePending;
  await pc.locator('#logout-button').click();await pc.getByRole('button',{name:'Google로 로그인'}).waitFor();releaseArchive();
  await pc.getByText('모든 기기에서 같은 메모').waitFor();assert.equal(await pc.locator('#archive-notes').textContent(),'');assert.equal(await pc.locator('#archive-notes').isVisible(),false);
  console.log('phase:google');await pa.locator('#google-button button').click();await pa.getByText('그 다음 쓴 내용',{exact:true}).waitFor();
  assert.equal(await pa.evaluate(()=>window.fixtureGoogle.client_id),clientId);
  assert.equal(await pa.evaluate(()=>window.fixtureGoogle.auto_select),false);
  // An expired Google token clears archived content and leaves public memo available.
  const expired=await f.token('owner@example.com',{exp:Math.floor(Date.now()/1000)-1});
  const d=await browser.newContext();await setup(d);await d.addInitScript(({expired,apiUrl})=>{if(location.protocol==='http:')sessionStorage.setItem('5e-memo-google:'+apiUrl,expired);},{expired,apiUrl});
  const pd=await d.newPage();await pd.goto(base);await pd.getByText('모든 기기에서 같은 메모').waitFor();await pd.locator('#archive-toggle').click();assert.equal(await pd.locator('#archive-notes').isVisible(),false);
  console.log('phase:webkit');const wk=await webkit.launch();const w=await wk.newContext({viewport:{width:1440,height:900}});await setup(w);const pw=await w.newPage();await pw.goto(base);await pw.getByText('모든 기기에서 같은 메모').waitFor();await capture(pw,'webkit.png');assert.equal(await pw.locator('.sticky').count(),0);await wk.close();
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(evidence,'checks.json'),JSON.stringify({status:'passed',engines:['Chromium','WebKit'],cases:['two-device memo transfer','optional title','clipboard','pin preserves creation time','sticky text/color/position sync','failed save retains draft','queued edits while saving','concurrent edit conflict and deliberate retry','new draft preserved while saving','failed retry retains connection error','server clock visibility','owner archive','logout clears archive including late responses','Google signed identity contract','expired login clears archive'],liveCloudflare:false,liveGoogle:false},null,2));
  console.log('Browser + D1 checks passed; evidence: '+evidence);
}catch(e){
  console.log('FAILED',e.message,requests.slice(-15));
  for(const context of browser.contexts())for(const page of context.pages())console.log(await page.evaluate(()=>({status:document.querySelector('#status')?.textContent,connection:document.querySelector('#connection-text')?.textContent,drafts:Object.keys(localStorage).filter(k=>k.startsWith('5e-memo-drafts')).map(k=>localStorage.getItem(k))})));
  throw e;
}finally{await browser.close();await f.close();await new Promise(resolve=>server.close(resolve));}
