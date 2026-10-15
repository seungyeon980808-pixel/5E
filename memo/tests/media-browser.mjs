import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium,webkit} from 'playwright';
import {fixture,clientId,apiUrl} from './fixture.mjs';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'_work/memo-media-review');fs.mkdirSync(out,{recursive:true});
const png=process.env.MEMO_IMAGE_FIXTURE?fs.readFileSync(process.env.MEMO_IMAGE_FIXTURE):Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6N8AAAAASUVORK5CYII=','base64');
const f=await fixture(request=>request.url.endsWith('/cover.png')?new Response(png,{headers:{'content-type':'image/png'}}):new Response(request.url.endsWith('/page')?'<meta property="og:title" content="이미지와 링크를, 한곳에."><meta property="og:image" content="/cover.png">':'<title>No thumbnail</title>',{headers:{'content-type':'text/html'}}));
const server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname.startsWith('/api/')){
  const route=pathname.slice(4);if(req.method==='PUT'&&uploadFailures){uploadFailures--;res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({message:'upload outage'}));return;}
  const parts=[];for await(const part of req)parts.push(part);const headers={};for(const key of ['authorization','content-type'])if(req.headers[key])headers[key]=req.headers[key];
  if(route.endsWith('/images')&&req.method==='POST'&&appendDelay)await new Promise(resolve=>setTimeout(resolve,appendDelay));
  const response=await f.mf.dispatchFetch(apiUrl+route,{method:req.method,headers,body:req.method==='GET'?undefined:Buffer.concat(parts)});trace.push({path:route,method:req.method,status:response.status});
  if(route.endsWith('/images')&&req.method==='POST'&&response.ok&&lostAppendResponse){lostAppendResponse--;res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({message:'lost response'}));return;}
  res.writeHead(response.status,{'content-type':response.headers.get('content-type')});res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 if(pathname==='/memo/config.js'){res.setHeader('content-type','text/javascript');res.end('window.MEMO_CONFIG='+JSON.stringify({apiUrl,googleClientId:clientId}));return;}
 const file=path.join(root,pathname.endsWith('/')?pathname+'index.html':pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');let content=fs.readFileSync(file);if(pathname==='/memo/cloud.js')content=Buffer.from(content.toString().replaceAll('fetch(this.url+',"fetch('/api'+"));res.end(content);
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port+'/memo/';
let uploadFailures=0,lostAppendResponse=0,appendDelay=0;const errors=[],trace=[];
async function pasteImage(target){await target.evaluate((element,bytes)=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(bytes)],'clipboard.png',{type:'image/png'}));const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:dt});element.dispatchEvent(event);},Array.from(png));}
async function chooseImage(page,button){const [chooser]=await Promise.all([page.waitForEvent('filechooser'),button.click()]);await chooser.setFiles({name:'added.png',mimeType:'image/png',buffer:png});}
async function setup(context){
 await context.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'text/javascript',body:'window.google={accounts:{id:{initialize(){},renderButton(){},disableAutoSelect(){}}}}'}));
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
}
const results=[];
try{
 for(const [name,engine] of [['Chromium',chromium],['WebKit',webkit]]){
  await f.db.prepare('DELETE FROM memo_entries').run();
  const browser=await engine.launch();try{
   const a=await browser.newContext({viewport:{width:1440,height:900}}),b=await browser.newContext({viewport:{width:390,height:844}});await setup(a);await setup(b);
   const pa=await a.newPage(),pb=await b.newPage();await pa.goto(base);await pb.goto(base);await pa.getByText('모든 기기에서 같은 메모').waitFor();await pa.locator('#attach-image').waitFor({state:'visible'});
   await pa.waitForFunction(()=>!document.querySelector('#attach-image').disabled);
   await pa.locator('#memo-input').evaluate((element,bytes)=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(bytes)],'clipboard.png',{type:'image/png'}));let event=new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true});if(!event.clipboardData?.items.length){event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:dt});}element.dispatchEvent(event);},Array.from(png));
   await pa.locator('.draft-image').waitFor();assert.equal(await pa.locator('#save-button').isEnabled(),true);
   await pa.waitForFunction(async()=>{const db=await new Promise(r=>{const request=indexedDB.open('5e-memo-image-drafts');request.onsuccess=()=>r(request.result);});const rows=await new Promise(r=>{const request=db.transaction('drafts').objectStore('drafts').getAll();request.onsuccess=()=>r(request.result);});return rows.some(row=>row.length===1);});
   await pa.reload();await pa.locator('.draft-image').waitFor();uploadFailures=1;await pa.locator('#save-button').click();await pa.getByText('메모를 저장하지 못했어요. 입력 내용은 남아 있어요.').waitFor();assert.equal(await pa.locator('.draft-image').count(),1);
   await pa.locator('#save-button').click();await pa.locator('.image-attachment img').first().waitFor();await pa.waitForFunction(()=>document.querySelector('.image-attachment img')?.naturalWidth>0);assert.equal(await pa.locator('.draft-image').count(),0);
   await pb.evaluate(()=>window.dispatchEvent(new Event('focus')));await pb.locator('.image-attachment img').first().waitFor();await pa.locator('.image-attachment').first().click();assert.equal(await pa.locator('#media-viewer').isVisible(),true);await pa.locator('#close-media').click();
   const originalId=await pa.locator('.note').filter({has:pa.locator('.image-attachment')}).first().getAttribute('data-id'),original=await f.db.prepare('SELECT * FROM memo_entries WHERE id=?').bind(originalId).first();
   let originalNote=pa.locator('.note[data-id="'+originalId+'"]');uploadFailures=1;await chooseImage(pa,originalNote.getByRole('button',{name:'메모에 이미지 추가',exact:true}));await originalNote.getByRole('button',{name:'다시 저장',exact:true}).waitFor();
   await pa.waitForFunction(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('5e-memo-image-drafts');q.onsuccess=()=>r(q.result);});return new Promise(r=>{const q=db.transaction('drafts').objectStore('drafts').getAllKeys();q.onsuccess=()=>r(q.result.some(key=>key.includes(':entry:')));});});
   await pa.reload();originalNote=pa.locator('.note[data-id="'+originalId+'"]');await originalNote.getByRole('button',{name:'다시 저장',exact:true}).click();await pa.waitForFunction(id=>document.querySelector('.note[data-id="'+id+'"]')?.querySelectorAll('.image-attachment img').length===2,originalId);
   const afterNote=await f.db.prepare('SELECT * FROM memo_entries WHERE id=?').bind(originalId).first();assert.equal(afterNote.created_at,original.created_at);assert.equal(afterNote.body,original.body);
   await pa.locator('#memo-input').fill('https://example.com/page');await pa.locator('#save-button').click();await pa.locator('.link-preview').filter({hasText:'이미지와 링크를, 한곳에.'}).waitFor();
   await pb.evaluate(()=>window.dispatchEvent(new Event('focus')));await pb.locator('.link-preview').filter({hasText:'이미지와 링크를, 한곳에.'}).waitFor();
   await pa.locator('.note[data-id="'+originalId+'"]').locator('.pin-note').click();await pa.locator('.sticky .image-attachment img').first().waitFor();
   const sticky=pa.locator('.sticky[data-id="'+originalId+'"]');appendDelay=350;await pasteImage(sticky.locator('.sticky-body'));await pa.waitForFunction(()=>document.querySelector('.sticky .entry-image-status')?.textContent.includes('저장 중'));
   await sticky.locator('.sticky-body').fill('https://example.com/page');await pa.waitForFunction(id=>document.querySelector('.sticky[data-id="'+id+'"]')?.querySelectorAll('.image-attachment img').length===3,originalId);await sticky.locator('.link-preview').waitFor();appendDelay=0;
   const afterSticky=await f.db.prepare('SELECT * FROM memo_entries WHERE id=?').bind(originalId).first();assert.equal(afterSticky.body,'https://example.com/page');assert.equal(afterSticky.created_at,original.created_at);
   lostAppendResponse=1;await chooseImage(pa,sticky.getByRole('button',{name:'포스트잇에 이미지 추가',exact:true}));await sticky.getByRole('button',{name:'다시 저장',exact:true}).waitFor();await sticky.getByRole('button',{name:'다시 저장',exact:true}).click();await pa.waitForFunction(id=>document.querySelector('.sticky[data-id="'+id+'"]')?.querySelectorAll('.image-attachment img').length===4,originalId);await pa.waitForFunction(()=>!document.querySelector('.sticky .entry-image-drafts .draft-image'));
   await pasteImage(sticky.locator('.sticky-body'));await pa.getByText('한 메모에 이미지는 4장까지 넣을 수 있어요.',{exact:true}).waitFor();assert.equal(JSON.parse((await f.db.prepare('SELECT image_ids FROM memo_entries WHERE id=?').bind(originalId).first()).image_ids).length,4);
   await pb.evaluate(()=>window.dispatchEvent(new Event('focus')));await pb.waitForFunction(id=>document.querySelector('.sticky[data-id="'+id+'"]')?.querySelectorAll('.image-attachment img').length===4,originalId);
   const mobileNote=pb.locator('.note').filter({hasText:'https://example.com/page'}).first(),mobileId=await mobileNote.getAttribute('data-id');await pasteImage(mobileNote);await mobileNote.locator('.image-attachment img').waitFor();
   await mobileNote.evaluate((element,bytes)=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(bytes)],'drop.png',{type:'image/png'}));const event=new Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:dt});element.dispatchEvent(event);},Array.from(png));await pb.waitForFunction(id=>document.querySelector('.note[data-id="'+id+'"]')?.querySelectorAll('.image-attachment img').length===2,mobileId);
   await mobileNote.locator('.note-meta').click();await pb.evaluate(()=>window.dispatchEvent(new Event('focus')));await pb.waitForFunction(id=>document.activeElement?.dataset.id===id,mobileId);await pasteImage(mobileNote);await pb.waitForFunction(id=>document.querySelector('.note[data-id="'+id+'"]')?.querySelectorAll('.image-attachment img').length===3,mobileId);
   await pa.locator('#memo-input').fill('https://example.com/no-image');await pa.locator('#save-button').click();await pa.getByRole('link',{name:'https://example.com/no-image',exact:true}).waitFor();
   await pa.screenshot({path:path.join(out,name.toLowerCase()+'-desktop.png'),fullPage:true});await pb.screenshot({path:path.join(out,name.toLowerCase()+'-mobile.png'),fullPage:true});
   await f.age(mobileId,86400001);const ownerContext=await browser.newContext({viewport:{width:1440,height:900}});await setup(ownerContext);const token=await f.token();await ownerContext.addInitScript(({key,token,origin})=>{if(location.origin===origin)sessionStorage.setItem(key,token);},{key:'5e-memo-google:'+apiUrl,token,origin:new URL(base).origin});const ownerPage=await ownerContext.newPage();await ownerPage.goto(base);await ownerPage.getByRole('button',{name:'보관함',exact:true}).click();const archived=ownerPage.locator('#archive-notes .note[data-id="'+mobileId+'"]');await archived.waitFor();await chooseImage(ownerPage,archived.getByRole('button',{name:'메모에 이미지 추가',exact:true}));await ownerPage.waitForFunction(id=>document.querySelector('#archive-notes .note[data-id="'+id+'"]')?.querySelectorAll('.image-attachment img').length===4,mobileId);assert.ok((await f.db.prepare('SELECT created_at FROM memo_entries WHERE id=?').bind(mobileId).first()).created_at<Date.now()-86400000);await ownerContext.close();
   results.push({engine:name,clipboardImage:true,imageOnlySave:true,draftRestored:true,failedUploadRetained:true,sharedImage:true,fullImageViewer:true,linkThumbnail:true,noThumbnailFallback:true,stickyImage:true,existingNotePicker:true,existingImageDraftRestored:true,stickyPaste:true,stickyPicker:true,mobileNotePasteAndDrop:true,lostAppendRetry:true,originalAgePreserved:true,imageLimit:true,stickyEditWhileAttaching:true,selectedNoteSurvivesRefresh:true,ownerArchiveAttachment:true});console.log(name+' media checks passed');
  }catch(error){for(const c of browser.contexts())for(const page of c.pages())console.log(await page.evaluate(()=>({status:document.querySelector('#status')?.textContent,notes:document.querySelector('#notes')?.textContent,drafts:document.querySelectorAll('.draft-image').length,stickies:[...document.querySelectorAll('.sticky')].map(e=>({images:e.querySelectorAll('.image-attachment img').length,status:e.querySelector('.entry-image-status')?.textContent})),pending:localStorage.getItem(Object.keys(localStorage).find(key=>key.startsWith('5e-memo-drafts-v1:')))})));console.log('errors',errors,'requests',trace.slice(-35));throw error;}finally{await browser.close();}
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({status:'passed',results,liveGoogle:false},null,2));
}finally{await f.close();await new Promise(resolve=>server.close(resolve));}
