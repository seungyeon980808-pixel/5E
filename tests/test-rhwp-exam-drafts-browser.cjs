const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const h=require('./helpers/rhwp-exam.cjs');
const fixture=fs.readFileSync('tests/fixtures/rights-clear-smoke.png');
h.withServer(async origin=>{fs.mkdirSync(path.resolve(process.env.EVIDENCE_DIR||'_work/rhwp/verification'),{recursive:true});for(const [name,engine]of Object.entries({chromium,webkit}).filter(([n])=>!process.env.EXAM_ENGINE||n===process.env.EXAM_ENGINE)){const b=await engine.launch();try{for(const surface of ['', 'preview/'].filter(s=>!process.env.EXAM_SURFACE||s===(process.env.EXAM_SURFACE==='preview'?'preview/':''))){
 const ctx=await b.newContext({viewport:{width:1440,height:950},acceptDownloads:true}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{Object.defineProperty(window,'showSaveFilePicker',{configurable:true,value:undefined});Object.defineProperty(window,'showDirectoryPicker',{configurable:true,value:undefined});});
 const url='/js/state.js?v=1.7.0-four-session-integration';
 await h.navigate(p,new URL(surface,origin).href+'?mode=pro&mobile=0&exam=1',{waitUntil:'domcontentloaded'});await h.ready(p);
 {const bar=await p.locator('#rhwp-exam-workspace .exam-topbar').boundingBox();assert.equal((await p.locator('#exam-studio').boundingBox()).y,bar.y+bar.height);}// 10-20: 공통 맨 위 줄 바로 아래
 assert.equal(await p.locator('[data-exam-action="open-document"]').count(),0);
 // Normal drawing-window save retains an opened document before any picture is linked.
 await h.action(p,'close');await p.locator('#file-menu-btn').click();await p.locator('#project-save').click();
 const dialog=p.locator('.modal-overlay:not([hidden])').last();await dialog.locator('.modal-input').fill('그림 없는 시험지');
 const emptyWait=p.waitForEvent('download');await dialog.getByRole('button',{name:/^(저장|다운로드)$/}).click();const emptyDownload=await emptyWait;
 const empty=await p.evaluate(async bytes=>(await import('/js/fivee-project.js?v=1.7.0-four-session-integration')).parseFiveEProject(new Uint8Array(bytes)),[...fs.readFileSync(await emptyDownload.path())]);
 assert.equal(empty.kind,'exam');assert.equal(empty.figures.length,0);assert.ok(empty.documentBytes.length>0);
 // 2026-10-12(b2f85a00)부터 한글 문서는 '5E_hwp'(#exam-send) 메뉴의 '한글 문서로 이동'으로 열고, 편집은 '문서에 반영'으로 되돌린다.
 await p.locator('.app-switch-image [data-app-switch=\"hwp\"]').click();await h.idle(p);
 // Use the fresh-image constructor, whose false recognition flag is omitted
 // until project loading. Insertion and acknowledgment must both be clean.
 await h.action(p,'close');
 await p.evaluate(async ({url,src})=>{
  const {state}=await import(url);const {insertImageFromSrc}=await import('/js/image-paste.js?v=1.7.0-four-session-integration');
  await insertImageFromSrc(state,src);
 },{url,src:'data:image/png;base64,'+fixture.toString('base64')});
 await h.crop(p);await h.place(p);
 assert.equal(await p.locator('.exam-figure span').isVisible(),false,'a newly inserted image has no unapplied change');
 await h.originalEdit(p);
 await p.evaluate(async url=>{const {state}=await import(url);state.update(s=>{s.objects[0].x+=1;});},url);
 await p.locator('#exam-edit-bar .exam-region-actions button:last-child').click();await h.idle(p);
 assert.equal(await p.locator('.exam-figure span').isVisible(),true,'an actual source move remains a draft');
 await h.originalEdit(p);await p.locator('[data-source-apply]').click();await h.idle(p);
 assert.equal(await p.locator('.exam-figure span').isVisible(),false,'applying the source clears the draft marker');
 await h.action(p,'new');await h.idle(p);
 await p.evaluate(bytes=>{const d=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps,w=d.wasm;d.getInputHandler().executeOperation({kind:'snapshot',operationType:'foreign-picture',operation:()=>{const r=w.insertPicture(0,0,0,'',new Uint8Array(bytes),18000,12000,600,400,'png','외부 그림',null,null);w.setPictureProperties(0,r.paraIdx,r.controlIdx,{treatAsChar:true,rotationAngle:10,cropLeft:1800,cropTop:600});return{sectionIndex:0,paragraphIndex:r.paraIdx,charOffset:0};}});d.eventBus.emit('document-changed');},[...fixture]);
 const before=(await h.pictures(p))[0];assert.equal(before.figure,null);
 await h.originalEdit(p);await p.locator('#exam-edit-bar').waitFor({state:'visible'});
 const registered=await h.drawing(p,url);assert.equal(registered.objects.length,1);assert.equal(registered.objects[0].type,'image');
 await p.evaluate(async url=>{const{state}=await import(url);state.update(s=>{s.objects[0].x+=7;});},url);
 const wait=p.waitForEvent('download');await p.keyboard.press('Meta+s');const download=await wait;
 assert.match(download.suggestedFilename(),/\.5e$/);
 const file=path.resolve(process.env.EVIDENCE_DIR||'_work/rhwp/verification',name+(surface?'-preview':'')+'-draft.5e');await download.saveAs(file);await h.idle(p);
 const saved=await p.evaluate(async bytes=>{const{parseExamProject}=await import('/js/rhwp-exam-project.js?v=1.7.0-four-session-integration');return parseExamProject(new Uint8Array(bytes));},[...fs.readFileSync(file)]);
 assert.equal(saved.figures[0].source.pages[0].objects[0].x,registered.objects[0].x);
 assert.equal(saved.workspace.drawing.pages.find(p=>p.id===registered.activePageId).objects[0].x,registered.objects[0].x+7);
 await p.locator('[data-source-recrop]').click();await p.locator('#capture-confirm').waitFor();
 const w=await p.locator('.capture-overlay [data-dim] input').first().inputValue();assert.ok(Number(w)>0,'previous crop shown immediately');
 const handle=await p.locator('.capture-overlay [data-h="e"]').boundingBox();await p.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await p.mouse.down();await p.mouse.move(handle.x+handle.width/2-40,handle.y+handle.height/2);await p.mouse.up();
 assert.notEqual(await p.locator('.capture-overlay [data-dim] input').first().inputValue(),w,'handle resizes previous crop');
 await p.keyboard.press('Escape');await h.idle(p);assert.equal(await p.locator('#exam-edit-bar').isVisible(),true,'cancel retains editor draft');
 await p.locator('[data-source-recrop]').click();await p.locator('#capture-confirm').waitFor();
 const move=await p.locator('.capture-overlay [data-h="n"]').boundingBox(),south=await p.locator('.capture-overlay [data-h="s"]').boundingBox();
 await p.mouse.move(move.x+5,(move.y+south.y)/2);await p.mouse.down();await p.mouse.move(move.x+25,(move.y+south.y)/2+15);await p.mouse.up();
 await p.locator('#capture-confirm').click();await h.idle(p);await p.locator('[data-source-apply]').click();await h.recrop(p);
 const updated=(await h.pictures(p))[0];assert.equal(updated.props.width,before.props.width);assert.equal(updated.props.rotationAngle,before.props.rotationAngle);assert.equal(updated.props.cropLeft,0);assert.equal(updated.props.cropTop,0);assert.ok(updated.props.height>0);
 await h.originalEdit(p);await p.locator('#exam-edit-bar').waitFor({state:'visible'});assert.equal((await h.drawing(p,url)).objects[0].x,registered.objects[0].x+7);await p.locator('#exam-edit-bar .exam-region-actions button:last-child').click();await h.idle(p);
 // Restore in fresh storage: the document stays committed and the draft tab survives.
 const fresh=await b.newContext({viewport:{width:1440,height:950}}),q=await fresh.newPage();await h.navigate(q,new URL(surface,origin).href+'?mode=pro&mobile=0&exam=1',{waitUntil:'domcontentloaded'});await h.ready(q);await q.locator('#exam-project-file').setInputFiles(file);await h.idle(q);
 assert.equal((await h.pictures(q))[0].figure.source.pages[0].objects[0].x,registered.objects[0].x);
 assert.match(await q.locator('.exam-figure span').textContent(),/미반영/);
 await h.originalEdit(q);await q.locator('#exam-edit-bar').waitFor({state:'visible'});assert.equal((await h.drawing(q,url)).objects[0].x,registered.objects[0].x+7);
 await q.locator('#exam-edit-bar .exam-region-actions button:last-child').click();await h.idle(q);await h.action(q,'new');await h.idle(q);await q.locator('#exam-name').fill('두 번째 시험지');
 const second=q.waitForEvent('download');await h.action(q,'save');await second;await h.idle(q);
 const drafts=await q.evaluate(async()=>{const{listExamDrafts}=await import('/js/rhwp-exam-project.js?v=1.7.0-four-session-integration');return listExamDrafts();});assert.ok(drafts.length>=2);assert.ok(drafts.some(d=>d.projectId===saved.projectId));
 await fresh.close();assert.deepEqual(errors,[]);await ctx.close();console.log(name+(surface?'-preview':'')+': foreign registration, crop adjustment/cancel, draft save/reopen, geometry and separate autosaves passed');
 }}finally{await b.close();}}}).catch(e=>{console.error(e);process.exitCode=1;});
