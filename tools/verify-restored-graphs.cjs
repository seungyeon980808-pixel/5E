/** Re-render, edit, download and reopen saved automatic results; AI calls forbidden. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {webkit}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [manifestFile,candidateRoot,output]=process.argv.slice(2);
assert(manifestFile && candidateRoot && output,'Usage: node tools/verify-restored-graphs.cjs manifest.json candidate-directory output-directory');
const manifest=JSON.parse(fs.readFileSync(manifestFile));
const base=process.env.PREVIEW_URL || 'http://127.0.0.1:8797/preview/';
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2));
const report={schema:'5e.restored-graph-edit-check/v1',browser:'WebKit',nativeSafari:false,modelCalls:0,manualFidelityCorrections:0,cases:[]};
(async()=>{
  const browser=await webkit.launch({headless:true});
  try {
    for(const c of manifest.cases) {
      const file=path.join(candidateRoot,c.id,'candidate.json');
      if(!fs.existsSync(file)){report.cases.push({id:c.id,generated:false,editingPass:false,saveReopenPass:false,reason:'No automatic candidate'});continue;}
      const candidate=JSON.parse(fs.readFileSync(file)),plan=candidate.graphResult?.plan || candidate.graphPlan;
      const dir=path.join(output,c.id);fs.mkdirSync(dir,{recursive:true});
      fs.copyFileSync(c.sourcePath,path.join(dir,'source.png'));
      const record={id:c.id,title:c.title,generated:true,editingPass:false,saveReopenPass:false,requestCount:0,errors:[]};report.cases.push(record);
      const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,serviceWorkers:'block'});
      await context.addInitScript(()=>{
        localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true');localStorage.setItem('5e.tutorial.bannerSeen','true');localStorage.setItem('5e.preview:5e.mode','pro');
        window.showSaveFilePicker=undefined;
      });
      const page=await context.newPage();
      await page.route('**/api/bridge-send',route=>{record.requestCount++;return route.abort();});
      page.on('pageerror',error=>record.errors.push(error.message));
      // Undo and .5e both preserve JSON fields; absent optional JS properties
      // are not saved data. Compare the same serialization boundary throughout.
      const snapshot=()=>page.evaluate(async()=>JSON.parse(JSON.stringify((await import('./js/state.js?v=1.7.0-four-session-integration')).state.get().objects)));
      const save=async name=>{
        await page.locator('#file-menu-btn').click();await page.locator('#project-save').click();
        const downloading=page.waitForEvent('download',{timeout:15000});
        const direct=page.locator('#project-save-download');
        if(await direct.isVisible())await direct.click();else await page.getByRole('button',{name:'저장',exact:true}).click();
        const destination=path.join(dir,name+'.5e');await(await downloading).saveAs(destination);return destination;
      };
      try {
        await page.goto(base+'?mode=pro',{waitUntil:'domcontentloaded'});
        await page.locator('#file-menu-btn').waitFor();
        const result=await page.evaluate(async plan=>{
          const v='?v=1.7.0-four-session-integration';
          const {buildWorkbenchGraph,workbenchGraphDataUrl,insertWorkbenchGraph}=await import('./js/graph/workbench-result.js'+v);
          const {state}=await import('./js/state.js'+v);
          const built=buildWorkbenchGraph(plan,plan.source),data=await workbenchGraphDataUrl(built);
          insertWorkbenchGraph(state,built);
          const img=new Image();img.src=data;await img.decode();
          const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
          canvas.getContext('2d').drawImage(img,0,0);
          return {data,png:canvas.toDataURL('image/png'),result:built};
        },plan);
        fs.writeFileSync(path.join(dir,'native.svg'),Buffer.from(result.data.split(',')[1],'base64'));
        fs.writeFileSync(path.join(dir,'native.png'),Buffer.from(result.png.split(',')[1],'base64'));
        write(path.join(dir,'candidate.json'),{graphResult:result.result,data:result.data});
        const before=await snapshot(),plane=before.find(o=>o.type==='coordplane');
        assert(plane);assert(before.some(o=>o.type==='funcgraph'));assert(!before.some(o=>o.type==='image'));
        record.formulas=before.filter(o=>o.sourceKind==='expression').map(o=>({seriesId:o.reconstruction.seriesId,expression:o.expr,domain:[o.domainMin,o.domainMax]}));
        record.quality=result.result.quality;
        await page.evaluate(async id=>(await import('./js/graph/graph-modal.js?v=1.7.0-four-session-integration')).openGraphModal(id),plane.id);
        await page.locator('#gm-confirm').click();assert.deepEqual(await snapshot(),before,'No-op edit preserves all native fields');
        const automatic=await save('automatic');
        await page.evaluate(async id=>(await import('./js/graph/graph-modal.js?v=1.7.0-four-session-integration')).openGraphModal(id),plane.id);
        await page.locator('#gm-labelx').fill((plane.labelX || 'x')+' (편집 검증)');
        await page.locator('#gm-tab-func-btn').click();await page.locator('#gm-sub-expr').click();
        const expr=page.locator('#gm-expr');
        if(await expr.isVisible() && await expr.inputValue()){
          record.originalExpression=await expr.inputValue();record.testExpression='1.01*('+record.originalExpression+')';
          await expr.fill(record.testExpression);await expr.dispatchEvent('input');await expr.dispatchEvent('change');
        }
        await page.locator('#gm-confirm').click();
        const edited=await snapshot();assert.notDeepEqual(edited,before);
        if(record.testExpression)assert(edited.some(o=>o.expr===record.testExpression),'Function expression edit is applied');
        await page.screenshot({path:path.join(dir,'edit-test.png')});
        await save('manual-edit-test');
        for(const action of ['undo','redo'])await page.evaluate(async action=>{const {state}=await import('./js/state.js?v=1.7.0-four-session-integration');(await import('./js/transform.js?v=1.7.0-four-session-integration'))[action](state);},action);
        assert.deepEqual(await snapshot(),edited);
        record.editingPass=true;
        await page.reload({waitUntil:'domcontentloaded'});await page.locator('#file-menu-btn').click();
        const choosing=page.waitForEvent('filechooser',{timeout:15000});await page.locator('#project-open').click();await(await choosing).setFiles(automatic);
        await page.getByRole('button',{name:'열기',exact:true}).click();
        await page.waitForFunction(async()=> (await import('./js/state.js?v=1.7.0-four-session-integration')).state.get().objects.some(o=>o.type==='funcgraph'),null,{timeout:15000});
        const loaded=await snapshot();
        for(const o of before){const saved=loaded.find(s=>s.id===o.id);for(const k of Object.keys(o))assert.deepEqual(saved[k],o[k],`Reopened ${o.type}.${k}`);}
        assert.equal(record.requestCount,0);assert.deepEqual(record.errors,[]);
        record.saveReopenPass=true;
        await page.screenshot({path:path.join(dir,'reopened.png')});
      } catch(error){record.error=error.message;await page.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});}
      finally {write(path.join(dir,'verification.json'),record);write(path.join(output,'results.json'),report);await context.close();}
      console.log(JSON.stringify({id:c.id,editingPass:record.editingPass,saveReopenPass:record.saveReopenPass,error:record.error}));
    }
  } finally {await browser.close();}
  report.pass=report.cases.every(c=>c.editingPass && c.saveReopenPass);
  write(path.join(output,'results.json'),report);
  assert(report.pass,'One or more saved automatic results failed editor/download/reopen verification');
})().catch(error=>{console.error(error);process.exitCode=1;});
