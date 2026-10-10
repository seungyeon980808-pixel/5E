const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
const core=path.dirname(require.resolve('playwright-core/package.json',{paths:[path.dirname(require.resolve(process.env.PLAYWRIGHT_MODULE||'playwright'))]}));
const {PNG}=require(path.join(core,'lib/utilsBundle.js'));
const evidence=path.resolve(process.env.EVIDENCE_DIR||'_work/rhwp/verification/image-scale');
const report={checks:[],engines:[],apiRequestsBlocked:0,externalRequestsBlocked:0};
const near=(a,b,message,tolerance=.15)=>assert.ok(Math.abs(a-b)<=tolerance,`${message}: ${a} != ${b}`);
async function guard(context){
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(['blob:','data:'].includes(u.protocol))return route.continue();
  if(u.pathname.startsWith('/api/')){report.apiRequestsBlocked++;return route.abort();}
  if(u.hostname!=='127.0.0.1'){report.externalRequestsBlocked++;return route.abort();}
  if(process.env.BASELINE_RHWP_BRIDGE && u.pathname.endsWith('/js/rhwp-exam-bridge.js?v=1.7.0-four-session-integration'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.BASELINE_RHWP_BRIDGE,'utf8')});
  return route.continue();
 });
}
async function pattern(page,w=600,h=400){return page.evaluate(async({w,h})=>{
 const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
 for(const[col,a,b]of[['#ff0000',0,0],['#00aa00',.5,0],['#0000ff',0,.5],['#ffd000',.5,.5]]){x.fillStyle=col;x.fillRect(w*a,h*b,w/2,h/2);}
 const bytes=new Uint8Array(await(await fetch(c.toDataURL())).arrayBuffer());return{bytes:[...bytes],pixelWidth:w,pixelHeight:h};
 },{w,h});}
async function shown(page,ref,tag,{pixels=true,flipH=false,flipV=false}={}){
 console.log('Checking',tag);
 try { await h.waitForState(page,ref=>{const b=window.scaleBridge,found=b.picturePlacement(ref),img=found?.element?.querySelector('img');return img?.complete&&img.naturalWidth>0;},ref,{timeout:20000}); } catch(e) {
  const state=await page.evaluate(ref=>{const b=scaleBridge,f=b.picturePlacement(ref);return{ref,props:b.properties(ref),found:f&&{op:f.op,element:!!f.element,placement:f.placement},pages:b.wasm.pageCount,html:b.editor.element.contentDocument.querySelector('#scroll-content')?.innerHTML.slice(-5000)};},ref);fs.writeFileSync(path.join(evidence,'failure.json'),JSON.stringify({tag,state},null,2));await page.screenshot({path:path.join(evidence,'failure.png')});throw e;
 }
 const m=await page.evaluate(ref=>{
  const b=window.scaleBridge,f=b.picturePlacement(ref),el=f.element,img=el.querySelector('img'),s=img.ownerDocument.defaultView.getComputedStyle(img),es=img.ownerDocument.defaultView.getComputedStyle(el),r=el.getBoundingClientRect(),frame=b.editor.element.getBoundingClientRect();
  return{props:b.properties(ref),region:b.pictureSourceRegion?.(ref)||null,paint:f.op,bitmap:{w:img.naturalWidth,h:img.naturalHeight},image:{w:parseFloat(s.width),h:parseFloat(s.height),x:parseFloat(s.left),y:parseFloat(s.top)},frame:{w:parseFloat(es.width),h:parseFloat(es.height)},clip:{x:frame.x+r.x,y:frame.y+r.y,width:r.width,height:r.height}};
 },ref);
 fs.writeFileSync(path.join(evidence,'last-check.json'),JSON.stringify({tag,m},null,2));
 near(m.image.w,m.frame.w,tag+' inner image width');near(m.image.h,m.frame.h,tag+' inner image height');near(m.image.x,0,tag+' crop x');near(m.image.y,0,tag+' crop y');
 if(pixels){
  const png=PNG.sync.read(await page.screenshot({clip:m.clip}));
  const colors=[[255,0,0],[0,170,0],[0,0,255],[255,208,0]];
  let sampled=0;
  for(let y=0;y<2;y++)for(let x=0;x<2;x++){
   const px=m.paint.bbox.x+m.paint.bbox.width*(x?.8:.2),py=m.paint.bbox.y+m.paint.bbox.height*(y?.8:.2),clip=m.paint.clip;
   if(clip&&(px<clip.x||py<clip.y||px>clip.x+clip.width||py>clip.y+clip.height))continue;
   sampled++;
   const i=(Math.floor(png.height*(y?.8:.2))*png.width+Math.floor(png.width*(x?.8:.2)))*4;
   const expected=colors[(flipV?1-y:y)*2+(flipH?1-x:x)];
   for(let k=0;k<3;k++)near(png.data[i+k],expected[k],tag+' screenshot quadrant',5);
  }
  assert.ok(sampled,tag+' has visible pixel samples');
 }
 report.checks.push({tag,frame:m.frame,image:m.image,bitmap:m.bitmap,source:m.region});return m;
}
async function standalone(origin,engine,name){
 const context=await engine.newContext({viewport:{width:1440,height:1000}});await guard(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/__image_scale__',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><style>body{margin:0}#host{height:100vh}</style><div id="host"></div><script type="module">import{RhwpExamBridge}from'/js/rhwp-exam-bridge.js?v=1.7.0-four-session-integration';window.scaleBridge=await RhwpExamBridge.create('#host');await scaleBridge.newDocument();window.ready=true;</script>`}));
 await page.goto(origin+'/__image_scale__',{waitUntil:'domcontentloaded'});await h.waitForState(page,()=>window.ready,null,{timeout:60000});
 const cases=[{id:'body',width:60},{id:'upscaled-frame',width:180},{id:'cropped',width:60,crop:true},{id:'table',width:60,table:true},{id:'hwp-import',width:60,importFormat:'hwp'},{id:'hwpx-import',width:60,importFormat:'hwpx'},{id:'hwpx-cropped-import',width:60,importFormat:'hwpx',crop:true},{id:'rotated',width:60,rotation:30,flipH:true},{id:'quarter-turn',width:60,rotation:90,flipV:true}];
 for(const c of cases){
  const initial=await pattern(page);let ref=await page.evaluate(async({c,initial})=>{
   const b=scaleBridge;await b.newDocument();
   if(c.table){const t=b.wasm.createTable(0,0,0,1,1);b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:0,parentParaIndex:t.paraIdx,cellPath:[{controlIndex:t.controlIdx,cellIndex:0,cellParaIndex:0}]});}
   const ref=b.insertFigure({id:c.id,...initial,bytes:new Uint8Array(initial.bytes),widthMm:c.width,heightMm:c.width*2/3});
   if(c.importFormat){await b.load(await(c.importFormat==='hwp'?b.exportHwp():b.exportHwpx()),'import.'+c.importFormat);Object.assign(ref,b.documentPictures()[0].ref);}
   b.transaction('fixture-props',()=>b.setProperties(ref,{rotationAngle:c.rotation||0,horzFlip:!!c.flipH,vertFlip:!!c.flipV,...(c.crop?{cropLeft:1800,cropTop:600,cropRight:1800,cropBottom:600}:{})}));return ref;
  },{c,initial});
  const before=await page.evaluate(ref=>scaleBridge.properties(ref),ref);
  for(const[w,hgt]of[[1200,800],[300,200],[900,300],[600,900]]){
   const image=await pattern(page,w,hgt),id=c.id+'-'+w+'x'+hgt;
   ref=await page.evaluate(({ref,image,id})=>{const b=scaleBridge;const old=b.figureId(ref);b.replaceFigure(old,{...image,bytes:new Uint8Array(image.bytes)},id,ref);return b.findFigure(id);},{ref,image,id});
   const m=await shown(page,ref,name+'/'+id,{pixels:!c.rotation,flipH:!!c.flipH,flipV:!!c.flipV});
   near(m.props.width,before.width,'document width',0);near(m.props.height,Math.round(before.width*hgt/w),'document aspect',0);
   for(const key of ['treatAsChar','horzOffset','vertOffset','rotationAngle','horzFlip','vertFlip','textWrap'])assert.equal(m.props[key],before[key],key);
   assert.equal(m.bitmap.w,w);assert.equal(m.bitmap.h,hgt);assert.equal(!!ref.cellPath?.length,!!c.table);
  }
  const last=await page.evaluate(ref=>scaleBridge.properties(ref),ref);
  await page.evaluate(()=>scaleBridge.input.performUndo());
  let undoRef=await page.evaluate(()=>scaleBridge.documentPictures()[0].ref);const undone=await shown(page,undoRef,name+'/'+c.id+'/undo',{pixels:!c.rotation,flipH:!!c.flipH,flipV:!!c.flipV});assert.notEqual(undone.props.height,last.height);
  await page.evaluate(()=>scaleBridge.input.performRedo());ref=await page.evaluate(()=>scaleBridge.documentPictures()[0].ref);await shown(page,ref,name+'/'+c.id+'/redo',{pixels:!c.rotation,flipH:!!c.flipH,flipV:!!c.flipV});
  for(const format of ['hwp','hwpx']){
   await page.evaluate(async format=>{const b=scaleBridge,data=await(format==='hwp'?b.exportHwp():b.exportHwpx());await b.load(data,'scale.'+format);},format);
   ref=await page.evaluate(()=>scaleBridge.documentPictures()[0].ref);const reopened=await shown(page,ref,name+'/'+c.id+'/'+format,{pixels:!c.rotation,flipH:!!c.flipH,flipV:!!c.flipV});near(reopened.props.width,last.width,'saved width',0);near(reopened.props.height,last.height,'saved height',0);
  }
 }
 assert.deepEqual(errors,[]);await context.close();
}
async function appBridge(page) {
 await page.evaluate(async()=>{const{RhwpExamBridge}=await import('/js/rhwp-exam-bridge.js?v=1.7.0-four-session-integration');const f=document.querySelector('#exam-studio iframe');window.scaleBridge=Object.create(RhwpExamBridge.prototype);scaleBridge.editor={element:f};scaleBridge.deps=f.contentWindow.rhwpStudio.plugins.deps;});
}
async function framePixels(page,ref) {
 await h.waitForState(page,ref=>{const f=scaleBridge.picturePlacement(ref),img=f?.element?.querySelector('img');return img?.complete&&img.naturalWidth>0;},ref);
 const clip=await page.evaluate(ref=>{const f=scaleBridge.picturePlacement(ref),r=f.element.getBoundingClientRect(),b=scaleBridge.editor.element.getBoundingClientRect();return{x:b.x+r.x,y:b.y+r.y,width:r.width,height:r.height};},ref);
 // Compare the document bitmap, excluding the intentional host action toolbar.
 // Screenshot style is temporary and leaves the actual image/layout untouched.
 const png=PNG.sync.read(await page.screenshot({clip,style:'#exam-picture-controls { visibility: hidden !important; }'})),colors=[];
 for(let y=1;y<8;y++)for(let x=1;x<8;x++){
  const i=(Math.floor(png.height*y/8)*png.width+Math.floor(png.width*x/8))*4;colors.push(...png.data.subarray(i,i+3));
 }
 return{clip,colors};
}
async function workflow(origin,browser,name,surface){
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});await guard(context);const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await h.navigate(p,origin+'/'+surface+'?mode=pro&mobile=0&exam=1',{waitUntil:'domcontentloaded'});await h.ready(p);
 const initial=await pattern(p);await p.evaluate(image=>{
  const f=document.querySelector('#exam-studio iframe'),d=f.contentWindow.rhwpStudio.plugins.deps,w=d.wasm;
  d.getInputHandler().executeOperation({kind:'snapshot',operationType:'external-source',operation:()=>{const r=w.insertPicture(0,0,0,'',new Uint8Array(image.bytes),18000,12000,600,400,'png','foreign source',null,null);w.setPictureProperties(0,r.paraIdx,r.controlIdx,{treatAsChar:true,cropLeft:1800,cropTop:600});return{sectionIndex:0,paragraphIndex:r.paraIdx,charOffset:0};}});d.eventBus.emit('document-changed');
 },initial);
 await p.locator('.exam-figure[data-connection="unlinked"]').waitFor();
 const original=await h.pictures(p);
 await appBridge(p);const nativeRef={sec:original[0].control.secIdx,ppi:original[0].control.paraIdx,ci:original[0].control.controlIdx,type:'image'};
 const originalPixels=await framePixels(p,nativeRef);
 await h.originalEdit(p);await p.locator('#exam-edit-bar').waitFor();
 const registered=await h.pictures(p);for(const key of ['width','height','rotationAngle','horzOffset','vertOffset'])assert.equal(registered[0].props[key],original[0].props[key]);
 const stateUrl='/js/state.js?v=1.7.0-four-session-integration';
 const source=await h.drawing(p,stateUrl);near(source.pages.find(x=>x.id===source.activePageId).meta.examRender.bounds.x,-46,'actual native crop left',.001);
 const link=registered[0].figure.link;
 await p.locator('#exam-workspace-open').click();await h.idle(p);
 const registeredPixels=await framePixels(p,nativeRef);
 near(registeredPixels.clip.width,originalPixels.clip.width,'registration display width');near(registeredPixels.clip.height,originalPixels.clip.height,'registration display height');
 for(let i=0;i<originalPixels.colors.length;i++)near(registeredPixels.colors[i],originalPixels.colors[i],'native crop registration pixels',5);
 report.checks.push({tag:name+'/'+surface+'native-crop-registration',pixelSamples:49});
 // Reproduce the old crop-zero reset on an already saved editable PNG.
 await p.evaluate(ref=>scaleBridge.transaction('legacy-crop-reset',()=>scaleBridge.setProperties(ref,{cropLeft:0,cropTop:0,cropRight:0,cropBottom:0})),nativeRef);
 const damaged=await p.evaluate(ref=>scaleBridge.pictureSourceRegion(ref),nativeRef);assert.ok(damaged.r<damaged.w || damaged.b<damaged.h,'legacy enlargement reproduced');
 await h.originalEdit(p);
 const restored=await h.drawing(p,stateUrl);assert.deepEqual(restored.pages.find(x=>x.id===restored.activePageId).meta.examRender.bounds,registered[0].figure.render.bounds,'legacy damage retains the saved crop');
 await p.locator('#exam-send').click();await h.recrop(p);await h.idle(p);
 // Use the actual app's editor for the same inner-image checks.
 await appBridge(p);
 let ref=(await h.pictures(p))[0].control;ref={sec:ref.secIdx,ppi:ref.paraIdx,ci:ref.controlIdx,type:'image'};
 await shown(p,ref,name+'/'+surface+'no-op-apply',{pixels:false});
 const before=(await h.pictures(p))[0];
 await h.originalEdit(p);await p.locator('#exam-edit-bar').waitFor();
 await p.locator('[data-source-recrop]').click();await p.locator('#capture-confirm').waitFor();
 // Explicitly change crop dimensions through the shipped capture dialog.
 const width=p.locator('.capture-overlay [data-dim] input').first();await width.fill('60');await width.press('Tab');
 await p.locator('#capture-confirm').click();await h.idle(p);await p.locator('#exam-send').click();await h.recrop(p);
 let after=(await h.pictures(p))[0];assert.deepEqual(after.figure.link,link);assert.equal((await h.pictures(p)).length,1);near(after.props.width/after.figure.render.bounds.w,before.props.width/before.figure.render.bounds.w,'recrop preserves source output scale',.02);assert.notEqual(after.figure.render.bounds.w,before.figure.render.bounds.w);
 ref={sec:after.control.secIdx,ppi:after.control.paraIdx,ci:after.control.controlIdx,type:'image'};await shown(p,ref,name+'/'+surface+'recrop',{pixels:false});
 // Inline label commit keeps both physical dimensions and returns zoom.
 await h.doubleClick(p);await p.locator('#exam-inline-editor:not([hidden])').waitFor();
 await p.locator('[data-inline-action="add-label"]').click();const box=await p.locator('.exam-inline-canvas').boundingBox();await p.mouse.click(box.x+box.width*.5,box.y+box.height*.35);
 await p.locator('[data-inline-field="text"]').fill('scale check');await p.locator('[data-inline-field="text"]').press('Tab');await p.locator('[data-inline-action="apply"]').click();await h.idle(p);
 const labelled=(await h.pictures(p))[0];assert.equal(labelled.props.width,after.props.width);assert.equal(labelled.props.height,after.props.height);assert.deepEqual(labelled.figure.link,link);await shown(p,ref,name+'/'+surface+'labels',{pixels:false});
 const wait=p.waitForEvent('download');await h.action(p,'save');const file=await wait,target=path.join(evidence,name+'-'+(surface?'preview':'root')+'.5e');await file.saveAs(target);await h.idle(p);
 const fresh=await browser.newContext({viewport:{width:1440,height:1000}});await guard(fresh);const q=await fresh.newPage();await h.navigate(q,origin+'/'+surface+'?mode=pro&mobile=0&exam=1',{waitUntil:'domcontentloaded'});await h.ready(q);await q.locator('#exam-project-file').setInputFiles(target);await h.idle(q);
 const portable=(await h.pictures(q))[0];assert.deepEqual(portable.figure.link,link);assert.equal(portable.props.width,labelled.props.width);assert.equal(portable.props.height,labelled.props.height);assert.equal(portable.figure.source.pages[0].objects.filter(o=>o.type==='labeler').length,1);
 await appBridge(q);
 await shown(q,ref,name+'/'+surface+'project-reopen',{pixels:false});await q.screenshot({path:path.join(evidence,name+'-'+(surface?'preview':'root')+'-fixed.png')});
 assert.deepEqual(errors,[]);await fresh.close();await context.close();
}
async function externalCorpus(origin,browser,name) {
 const directory=process.env.EXAM_EXTERNAL_FIXTURES;
 if(!directory)return;
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await guard(context);
 const p=await context.newPage();await h.navigate(p,origin+'/?mode=pro&mobile=0&exam=1',{waitUntil:'domcontentloaded'});await h.ready(p);await appBridge(p);
 let edited=0;
 for(const file of fs.readdirSync(directory).filter(f=>/\.(hwp|hwpx)$/i.test(f))) {
  await h.nativeOpen(p,path.join(directory,file));
  assert.equal(await p.locator('#exam-status').getAttribute('data-error'),'false',file+' loaded');
  const initial=await p.evaluate(()=>scaleBridge.documentPictures().map(p=>({ref:p.ref,props:p.props})));
  if(!initial.length){report.checks.push({tag:name+'/external/'+file,pictures:0});continue;}
  const ref=initial[0].ref,before=await p.evaluate(ref=>scaleBridge.properties(ref),ref);
  await p.locator('.exam-figure[data-connection="unlinked"]').first().click();await h.action(p,'edit');await p.locator('#exam-edit-bar').waitFor({state:'visible'});
  const registered=await p.evaluate(ref=>scaleBridge.properties(ref),ref);
  for(const key of ['width','height','rotationAngle','horzOffset','vertOffset','textWrap','treatAsChar'])assert.equal(registered[key],before[key],file+' registration '+key);
  await p.locator('#exam-send').click();await h.recrop(p);await h.idle(p);
  assert.equal(await p.locator('#exam-status').getAttribute('data-error'),'false',file+' applied');
  const result=await p.evaluate(ref=>{
   const b=scaleBridge,props=b.properties(ref),region=b.pictureSourceRegion(ref),f=b.picturePlacement(ref),img=f?.element?.querySelector('img');
   return{props,region,dom:!!img,images:b.documentPictures().length};
  },ref);
  assert.equal(result.images,initial.length,file+' image inventory');assert.equal(result.props.width,before.width,file+' physical width');
  assert.equal(result.region.l,0);assert.equal(result.region.t,0);assert.equal(result.region.r,result.region.w);assert.equal(result.region.b,result.region.h);
  if(result.dom)await shown(p,ref,name+'/external/'+file,{pixels:false});
  else report.checks.push({tag:name+'/external/'+file,region:result.region,canvasFallback:true});
  await p.screenshot({path:path.join(evidence,name+'-external-'+file+'.png')});edited++;
 }
 assert.ok(edited,'at least one independent document picture edited');await context.close();
}
h.withServer(async configuredOrigin=>{
 const origin=new URL(configuredOrigin).origin;
 fs.mkdirSync(evidence,{recursive:true});
 for(const[name,engine]of Object.entries({chromium,webkit}).filter(([n])=>!process.env.EXAM_ENGINE||n===process.env.EXAM_ENGINE)){
  const browser=await engine.launch({headless:true});try{report.engines.push({name,version:browser.version()});if(!process.env.SCALE_WORKFLOW_ONLY && !process.env.SCALE_CORPUS_ONLY)await standalone(origin,browser,name);
   if(!process.env.SCALE_ADAPTER_ONLY && !process.env.SCALE_CORPUS_ONLY)for(const surface of ['', 'preview/'])await workflow(origin,browser,name,surface);
   if(!process.env.SCALE_ADAPTER_ONLY)await externalCorpus(origin,browser,name);
  }finally{await browser.close();}
 }
 fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify(report,null,2));console.log(`Image scale PASS: ${report.checks.length} rendered checks in ${report.engines.map(e=>e.name).join('/')}.`);
}).catch(e=>{fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify({...report,error:e.stack},null,2));console.error(e);process.exitCode=1;});
