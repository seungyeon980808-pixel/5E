// CSP 초안을 로컬 미리보기 서버 응답에 Report-Only 머리말로 붙여, 편집기 주요 흐름에서 생기는 위반을 모은다.
// 운영 사이트는 건드리지 않는다. 문서: docs/security/CSP_REPORT_ONLY_PROPOSAL.md
// 사용: node scripts/csp-report-only-probe.cjs [정책 파일=docs/security/csp-editor-draft.txt] [결과.json]
const path=require('path'),fs=require('fs');
const root=path.resolve(__dirname,'..');process.chdir(root);
process.env.POLICY_FILE=path.resolve(process.argv[2]||'docs/security/csp-editor-draft.txt');
const OUT=process.argv[3]||null;
const h=require('../tests/helpers/rhwp-exam.cjs');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const POLICY=fs.readFileSync(process.env.POLICY_FILE,'utf8').trim().replace(/\s*\n\s*/g,' ');
(async()=>{const all={};await h.withServer(async origin=>{
 const local=new URL(origin).host;
 for(const [name,engine] of Object.entries({chromium,webkit})){
  const b=await engine.launch();const ctx=await b.newContext({viewport:{width:1440,height:950}});
  const v=[];
  await ctx.addInitScript(()=>{localStorage.setItem('5e.tutorial.bannerSeen','true');localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true');
    document.addEventListener('securitypolicyviolation',e=>{(window.__csp||(window.__csp=[])).push({d:e.effectiveDirective,u:e.blockedURI,s:(e.sourceFile||'').replace(location.origin,'')+':'+e.lineNumber,sample:e.sample});});});
  await ctx.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.host!==local)return route.fallback();
   const res=await route.fetch();const type=res.headers()['content-type']||'';
   if(!type.includes('text/html'))return route.fulfill({response:res});
   return route.fulfill({response:res,headers:{...res.headers(),'content-security-policy-report-only':POLICY.replaceAll('__SELF_LOCAL__',origin)}});
  });
  const page=await ctx.newPage();const steps=[];const step=async(label,fn)=>{try{await fn();steps.push(label+': ok');}catch(e){steps.push(label+': '+String(e.message).slice(0,120));}};
  const logs=[];page.on('console',m=>{const t=m.text();if(/Content.Security.Policy|Report Only|CSP/i.test(t))logs.push(t.slice(0,300));});
  const collect=async label=>{for(const f of page.frames()){const got=await f.evaluate(()=>{const x=window.__csp||[];window.__csp=[];return x;}).catch(()=>[]);for(const g of got)v.push({step:label,frame:f===page.mainFrame()?'main':f.url().replace(origin,''),...g});}
    for(const l of logs.splice(0))v.push({step:label,frame:'console',d:'console',u:l,s:''});};
  await step('load',async()=>{await page.route('**/*',r=>r.fallback());await page.goto(origin+'/?mode=pro&mobile=0',{waitUntil:'domcontentloaded'});await page.waitForSelector('#exam-send',{timeout:60000});const sk=page.getByRole('button',{name:'건너뛰기',exact:true});if(await sk.isVisible())await sk.click();await page.waitForTimeout(3000);});await collect('load');
  const V='?v=1.7.0-four-session-integration';
  await step('tutorial',async()=>{await page.evaluate(async V=>{const t=await import('/js/tutorial.js'+V);t.openPicker();await new Promise(r=>setTimeout(r,500));t.closePicker();},V);});await collect('tutorial');
  await step('exam-preview',async()=>{await page.evaluate(async V=>{const {state}=await import('/js/state.js'+V);const {openExamPreview}=await import('/js/exam-preview.js'+V);state.update(s=>{s.objects=[{id:'l',type:'line',p1:{x:-10,y:-5},p2:{x:10,y:5},strokeWidth:.2,layerId:1}];});openExamPreview({state,dpi:96,options:{}});await new Promise(r=>setTimeout(r,2500));document.querySelector('.modal-overlay:not([hidden]) .modal-btn-primary')?.click();},V);});await collect('exam-preview');
  await step('hwp-workspace',async()=>{await page.locator('#exam-send').click();await page.locator('[data-exam-document-open]').click();await h.idle(page);await page.locator('#rhwp-exam-workspace').waitFor();await page.waitForTimeout(2000);});await collect('hwp-workspace');
  await step('ocr-worker',async()=>{await page.evaluate(async()=>{const m=await import('/vendor/ocr/tesseract.esm.min.js?v=1.6.1-preview-labeler-0917-1111');const t=m.default??m;const base=new URL('/vendor/ocr/',location.href);const w=await t.createWorker(['eng'],1,{workerPath:base+'worker.min.js?v=1.6.1-preview-labeler-0917-1111',corePath:base+'tesseract-core-simd-lstm.wasm.js?v=1.6.1-preview-labeler-0917-1111',langPath:base+'lang/',gzip:true,cacheMethod:'none'});const c=document.createElement('canvas');c.width=120;c.height=40;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,120,40);x.fillStyle='#000';x.font='24px sans-serif';x.fillText('5E',10,30);await w.recognize(c);await w.terminate();});});await collect('ocr-worker');
  all[name]={steps,violations:v};await b.close();
 }
},{isolated:true});
 if(OUT)fs.writeFileSync(OUT,JSON.stringify(all,null,1));
 let bad=0;for(const [engine,r] of Object.entries(all)){
  const real=r.violations.filter(v=>!(v.d==='console'&&/does not specify a 'report-uri'|was delivered in report-only mode|^The Content Security Policy '/.test(v.u)));
  console.log(engine+': '+r.steps.join(', ')+' — 위반 '+real.length+'건');
  for(const v of real.slice(0,30))console.log('  ['+v.step+'] '+(v.frame||'')+' '+v.d+' '+String(v.u).slice(0,140));
  bad+=real.length;}
 process.exitCode=bad?1:0;})().catch(e=>{console.error(e);process.exit(1);});
