'use strict';
// Actual product closures and DOM; controlled scheduling is a contract stimulus,
// exercising callback ownership independently of naturally occurring race frequency.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const fileIdentity=p=>{const bytes=fs.readFileSync(p);return {path:p,bytes:bytes.length,sha256:sha(bytes)};};
const productFile=path.join(root,'js/rhwp-exam-workspace.js');
const source=fileIdentity(productFile),expected=source.sha256;
const corePaths=[
  'index.html','js/main.js','js/state.js','js/rhwp-exam-workspace.js',
  'js/rhwp-exam-bridge.js','js/rhwp-exam-picture-controls.js',
  'tests/helpers/rhwp-exam.cjs','tests/helpers/four-session-entry.cjs',
  'tests/test-rhwp-exam-workspace-browser.cjs','tests/test-rhwp-exam-file-menu-browser.cjs',
  'scripts/preview-local-server.cjs'
];
function vendorFiles(directory){
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const name=path.join(directory,entry.name);
    assert(!entry.isSymbolicLink(),'SDK fixture must not traverse symlinks: '+name);
    return entry.isDirectory()?vendorFiles(name):entry.isFile()?[name]:[];
  });
}
function sourceInventory(){
  return [...new Set([...corePaths.map(name=>path.join(root,name)),__filename,
    ...vendorFiles(path.join(root,'vendor/rhwp-editor')),
    ...vendorFiles(path.join(root,'vendor/rhwp-studio'))])].sort().map(fileIdentity);
}
const sourcePins=sourceInventory();
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h=require('./helpers/rhwp-exam.cjs');
const {entryConfiguration,mainModuleUrl,runtimeConfiguration}=require('./helpers/four-session-entry.cjs');
const output=path.join(path.resolve(process.env.EVIDENCE_DIR || path.join(root,'_work/rhwp/verification')),'rhwp-menu-focus-contract');
fs.mkdirSync(output,{recursive:true});
const reportPath=path.join(output,'contract-report.json');
// Claim before registering any exit writer: an existing report is never replaced.
fs.writeFileSync(reportPath,JSON.stringify({status:'STARTING'})+'\n',{flag:'wx'});
const report={qualification:'Actual product closure and real DOM with deliberately controlled callback scheduling. Root-only component contracts, independent of natural race frequency and full workflow coverage.',
  source,sourcePins,startedAt:new Date().toISOString(),cases:[],engines:[],rootCause:'UNKNOWN',
  invocation:{execPath:process.execPath,execArgv:process.execArgv,argv:process.argv,
    playwrightModule:process.env.PLAYWRIGHT_MODULE || 'playwright'},
  server:{owner:process.env.EXAM_URL || process.env.RELEASE_URL?'external':'rhwp-exam.withServer',withServerSettled:false}};
const persist=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
process.on('exit',code=>{report.childExit=code;report.finishedAt=new Date().toISOString();persist();});
persist();

function installGate(){
  'use strict';
  const native=window.queueMicrotask;let armed=false,next=0;
  const held=new Map(),events=[];
  const wrapped=function(...args){
    const callback=args[0],text=typeof callback==='function'?String(callback):'';
    const stack=new Error().stack || '';
    if(armed && stack.includes('/js/rhwp-exam-workspace.js') &&
      text.includes("open.getAttribute('aria-expanded')") && text.includes('target.focus(')){
      const id=++next;held.set(id,{receiver:this,args});
      events.push({kind:'held',id,text,stack,t:performance.now()});return undefined;
    }
    return Reflect.apply(native,this,args);
  };
  window.queueMicrotask=wrapped;
  Object.defineProperty(window,'__workspaceMenuContract',{value:{
    arm(){armed=true;},
    snapshot(){return {pending:[...held.keys()],events:[...events],armed};},
    release(ids){
      if(new Set(ids).size!==ids.length || ids.some(id=>!held.has(id)))throw new Error('Invalid exact held batch');
      // Forward each SAME callback object and original this/argument references
      // to the native queue; no replacement implementation and no callback skip.
      for(const id of ids){const call=held.get(id);held.delete(id);
        events.push({kind:'released-to-native',id,t:performance.now()});
        Reflect.apply(native,call.receiver,call.args);
      }
      // Native FIFO sentinel observes completion checkpoint, not a sleep/frame delay.
      return new Promise(resolve=>Reflect.apply(native,window,[resolve]));
    }
  },configurable:true});
}
async function state(page){return page.evaluate(()=>{
  const panel=document.querySelector('#rhwp-exam-workspace'),frame=document.querySelector('#exam-studio iframe');
  const input=frame?.contentWindow?.rhwpStudio?.plugins?.deps?.getInputHandler();
  const node=document.activeElement;
  return {active:{id:node?.id,tag:node?.tagName,menu:node?.getAttribute('data-exam-menu'),action:node?.getAttribute('data-exam-action')},
    panelHidden:panel.hidden,panelConnected:panel.isConnected,expanded:document.querySelector('[data-exam-menu="file"]').getAttribute('aria-expanded'),
    parentFrameFocused:node===frame,nativeInputFocused:frame?.contentDocument?.activeElement===input?.textarea,
    gate:window.__workspaceMenuContract.snapshot()};
});}
async function nativeFocus(page){
  // Actual Studio method, not a mocked focus result. Programmatic component
  // stimulus: an iframe pointer click would close the menu via existing code.
  await page.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().focus());
  const value=await state(page);assert.equal(value.parentFrameFocused,true);assert.equal(value.nativeInputFocused,true);
  return value;
}
const batch=value=>{assert(value.gate.pending.length>0,'Actual preserve callback must be captured');return [...value.gate.pending];};
async function release(page,ids){await page.evaluate(ids=>window.__workspaceMenuContract.release(ids),ids);}
async function keyboardOpen(page){
  await page.locator('[data-exam-menu="file"]').focus();await page.keyboard.press('ArrowDown');
  assert.equal((await state(page)).active.action,'new','Original ArrowDown precondition must actually work');
}
async function arm(page){await page.evaluate(()=>window.__workspaceMenuContract.arm());}
const cases=[
  ['newer-arrowdown-item-wins',async(page,capture)=>{
    await keyboardOpen(page);await arm(page);const old=batch(await nativeFocus(page));await capture('held-old-new-item');
    await page.locator('[data-exam-action="new"]').focus();await page.keyboard.press('ArrowDown');
    assert.equal((await capture('explicit-next-item')).active.action,'open-hwp');
    await release(page,old);assert.equal((await capture('after-old-delivery')).active.action,'open-hwp');
  }],
  ['reopened-file-menu-keeps-new-item',async(page,capture)=>{
    await page.locator('[data-exam-menu="file"]').click();await arm(page);const old=batch(await nativeFocus(page));
    await capture('old-trigger-held');await keyboardOpen(page);await capture('reopened-explicit-new');
    await release(page,old);assert.equal((await capture('after-old-delivery')).active.action,'new');
  }],
  ['old-menu-lifetime-cannot-restore-in-new-lifetime',async(page,capture)=>{
    await page.locator('[data-exam-menu="file"]').click();await arm(page);const old=batch(await nativeFocus(page));
    await keyboardOpen(page);const current=await nativeFocus(page);const fresh=current.gate.pending.filter(id=>!old.includes(id));
    assert(fresh.length>0);await capture('two-lifetimes-held');
    await release(page,old);const after=await capture('after-only-old-lifetime');
    assert.equal(after.parentFrameFocused,true,'Old lifetime must not take focus before the current lifetime callback');
    assert.deepEqual(after.gate.pending,fresh);
    await release(page,fresh);assert.equal((await capture('current-lifetime-restores')).active.action,'new');
  }],
  ['latest-target-read-at-delivery',async(page,capture)=>{
    await keyboardOpen(page);await arm(page);const old=batch(await nativeFocus(page));
    await page.locator('[data-exam-action="new"]').focus();await page.keyboard.press('ArrowDown');
    assert.equal((await state(page)).active.action,'open-hwp');
    const again=await nativeFocus(page);const fresh=again.gate.pending.filter(id=>!old.includes(id));assert(fresh.length>0);
    await capture('same-lifetime-new-preferred-target');await release(page,old);
    assert.equal((await capture('first-delivery-must-use-latest-target')).active.action,'open-hwp');
    await release(page,fresh);assert.equal((await capture('second-delivery')).active.action,'open-hwp');
  }],
  ['same-live-menu-still-restores-from-iframe',async(page,capture)=>{
    await keyboardOpen(page);await arm(page);const held=batch(await nativeFocus(page));await capture('native-iframe-focused');
    await release(page,held);assert.equal((await capture('restored')).active.action,'new','No-op fixes must fail this positive contract');
  }],
  ['public-close-keeps-workspace-inactive',async(page,capture)=>{
    await keyboardOpen(page);await arm(page);const held=batch(await nativeFocus(page));
    await h.action(page,'close');const before=await capture('actual-public-close');
    // 10-24 개편으로 따로 있던 여는 단추(#exam-workspace-open)는 없어지고 맨 위 앱 전환 단추가 그 자리다 — 닫은 뒤 초점은 5E_hwp 창 밖(메뉴·작업 단추가 아님)에 있어야 한다.
    assert.equal(before.panelHidden,true);assert.equal(before.active.menu,null);assert.equal(before.active.action,null);
    await release(page,held);const after=await capture('old-callback-after-close');
    assert.equal(after.panelHidden,true);assert.deepEqual(after.active,before.active);
  }]
];
test('root real DOM menu-focus scheduler contracts',async t=>{
  try{await h.withServer(async origin=>{
    const entryUrl=origin+'/?mode=pro&mobile=0&exam=1';
    const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
    const mainSource=fs.readFileSync(path.join(root,'js/main.js'),'utf8');
    const runtime=runtimeConfiguration(entryConfiguration({...process.env,APP_ENTRY:'/'}),entryUrl,mainModuleUrl(html,entryUrl),mainSource);
    // Derive the query from the same root entry/environment as h.navigate.
    const imports=[...mainSource.matchAll(/\bfrom\s*["']([^"']*\/rhwp-exam-workspace\.js(?:\?[^"']*)?)["']/g)];
    assert.equal(imports.length,1);
    const workspaceUrl=new URL(imports[0][1],runtime.mainUrl);
    assert.equal(workspaceUrl.pathname,'/js/rhwp-exam-workspace.js');
    assert.equal(workspaceUrl.search,runtime.moduleQuery);
    assert.equal(workspaceUrl.origin,origin);
    report.runtime={...runtime,workspaceUrl:workspaceUrl.href};report.server.origin=origin;persist();
    const servedPins=new Map(sourcePins.map(pin=>['/'+path.relative(root,pin.path).split(path.sep).join('/'),pin]));
    const studioHtml=fs.readFileSync(path.join(root,'vendor/rhwp-studio/index.html'),'utf8');
    const studioModules=[...studioHtml.matchAll(/<script\b(?=[^>]*\btype=["']module["'])[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)]
      .map(match=>new URL(match[1],origin+'/vendor/rhwp-studio/index.html').pathname);
    assert.equal(studioModules.length,1,'Actual Studio module identity');
    const requiredServed=['/index.html',new URL(runtime.mainUrl).pathname,new URL(runtime.stateUrl).pathname,
      workspaceUrl.pathname,'/vendor/rhwp-editor/index.js','/vendor/rhwp-studio/index.html',...studioModules];
    for(const [engineName,type] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE))await t.test(engineName+' real DOM menu-focus scheduler contracts',async t=>{
      const browser=await type.launch({headless:true});const engine={name:engineName,version:browser.version(),closeResolved:false,disconnected:false};report.engines.push(engine);
      browser.on('disconnected',()=>{engine.disconnected=true;persist();});
      try{for(const [name,scenario] of cases)await t.test(name,async()=>{
        const context=await browser.newContext({viewport:{width:1440,height:950},acceptDownloads:true});
        const row={engine:engineName,name,steps:[],errors:[],responses:[],loadedResponses:[],contextClosed:false,passed:false};report.cases.push(row);
        context.on('close',()=>{row.contextClosed=true;persist();});
        const pending=new Set();let page,recordResponse;
        try{
          await context.addInitScript(installGate);page=await context.newPage();page.on('pageerror',error=>row.errors.push(String(error)));
          recordResponse=response=>{
            const url=new URL(response.url());if(url.origin!==origin)return;
            const pathname=url.pathname==='/'?'/index.html':url.pathname;
            const pin=servedPins.get(pathname);if(!pin)return;
            const job=(async()=>{try{
              // 미리보기 서버는 index.html의 개발 배지(data-change-summary) 한 칸에 기준 커밋을 끼워 보낸다(scripts/preview-local-server.cjs revisionBadge).
              // 그 칸만 디스크 파일의 원래 칸으로 되돌린 뒤 바이트를 비교한다 — 나머지 글자는 그대로 같아야 한다.
              let bytes=await response.body();
              if(pathname==='/index.html'){const disk=fs.readFileSync(pin.path,'utf8'),badge=/<span\b[^>]*\bdata-change-summary\b[^>]*>[^<]*<\/span>/;const original=disk.match(badge)?.[0];
                if(original)bytes=Buffer.from(bytes.toString('utf8').replace(badge,original),'utf8');}
              const entry={url:response.url(),pathname,status:response.status(),bytes:bytes.length,sha256:sha(bytes),expectedSha256:pin.sha256};
              row.loadedResponses.push(entry);
              if(url.pathname===workspaceUrl.pathname)row.responses.push(entry);
            }catch(error){row.errors.push('response: '+String(error));}})();pending.add(job);job.finally(()=>pending.delete(job));
          };
          page.on('response',recordResponse);
          await h.navigate(page,entryUrl,{waitUntil:'domcontentloaded'});await h.ready(page);
          await Promise.all([...pending]);assert.equal(row.responses.length,1);
          assert.equal(row.responses[0].status,200);assert.equal(row.responses[0].sha256,expected);
          assert.equal(new URL(row.responses[0].url).search,runtime.moduleQuery);
          assert.equal(row.responses[0].url,workspaceUrl.href);
          const capture=async label=>{const value=await state(page);row.steps.push({label,value});persist();return value;};
          await scenario(page,capture);assert.deepEqual(row.errors,[]);
          const final=await capture('case-finished');assert.deepEqual(final.gate.pending,[]);
          const held=final.gate.events.filter(x=>x.kind==='held').map(x=>x.id);
          const released=final.gate.events.filter(x=>x.kind==='released-to-native').map(x=>x.id);
          assert.deepEqual([...released].sort((a,b)=>a-b),[...held].sort((a,b)=>a-b),'Every held original callback released exactly once');
          row.contractSatisfied=true;
        }catch(error){row.failure=String(error.stack||error);throw error;}
        finally{
          if(page && !page.isClosed())try{row.finalState=await state(page);}catch(error){row.finalObservationError=String(error);}
          // Stop collecting before context teardown; settle already observed bodies.
          if(page && recordResponse)page.off('response',recordResponse);
          try{await Promise.allSettled([...pending]);}finally{await context.close();}
          row.sourceAfter=fileIdentity(productFile);
          row.fixturePinsAfter=sourceInventory();
          row.loadedIdentityValid=requiredServed.every(name=>row.loadedResponses.some(entry=>entry.pathname===name)) &&
            row.loadedResponses.every(entry=>entry.status===200 && entry.sha256===entry.expectedSha256);
          row.passed=!!row.contractSatisfied && row.contextClosed && row.errors.length===0 && row.sourceAfter.sha256===expected &&
            row.loadedIdentityValid && JSON.stringify(row.fixturePinsAfter)===JSON.stringify(sourcePins);
          persist();assert.equal(row.sourceAfter.sha256,expected);assert.deepEqual(row.errors,[]);
          assert.deepEqual(row.fixturePinsAfter,sourcePins,'Actual source, helper, test, frame and SDK bytes/inventory unchanged');
          assert.equal(row.loadedIdentityValid,true,'Required root/frame/SDK resources loaded with actual filesystem bytes');
        }
      });}finally{await browser.close();engine.closeResolved=true;persist();}
    });
  });}finally{
    report.server.withServerSettled=true;report.sourcePinsAfter=sourceInventory();
    report.sourcePreserved=JSON.stringify(report.sourcePinsAfter)===JSON.stringify(sourcePins);
    report.cleanup=report.engines.length===2 && report.engines.every(engine=>engine.closeResolved && engine.disconnected) &&
      report.cases.length===12 && report.cases.every(row=>row.contextClosed);
    report.complete=report.cleanup && report.sourcePreserved && report.cases.every(row=>row.passed);
    persist();assert.deepEqual(report.sourcePinsAfter,sourcePins);assert.equal(report.cleanup,true);
  }
});
