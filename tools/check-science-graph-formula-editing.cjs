// Replay first generated plans in an isolated editor. No AI requests or source edits.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out=path.resolve(process.env.SCIENCE_GRAPH_OUTPUT || 'outputs/science-graphs-20261007');
const base=process.env.PREVIEW_URL || 'http://127.0.0.1:8797/preview/';
const summary=JSON.parse(fs.readFileSync(path.join(out,'summary.json')));
const selected=process.env.SCIENCE_GRAPH_EDIT_CASES?.split(',');
const cases=summary.cases.filter(c=>c.nativeResult && c.formulas.length && (!selected || selected.includes(c.id)));
const result={schema:'5e.science-formula-editing/v1',aiCalls:0,source:'First generated plans unchanged; edits are isolated verification only',cases:[]};
const file=path.join(out,selected?'formula-editing-diagnostic.json':'formula-editing.json');
(async()=>{
  for(const [engineName,engine] of Object.entries({chromium,webkit})){
    const browser=await engine.launch({headless:true});
    try{for(const c of cases){
      const page=await browser.newPage({viewport:{width:1600,height:1100}});
      await page.addInitScript(()=>{localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true');localStorage.setItem('5e.tutorial.bannerSeen','true');});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      const snapshot=()=>page.evaluate(async()=>JSON.parse(JSON.stringify((await import('/preview/js/state.js?v=1.7.0-four-session-integration')).state.get().objects)));
      const row={id:c.id,engine:engineName,pass:false,expressions:[]};result.cases.push(row);
      try{
        await page.goto(base,{waitUntil:'networkidle'});
        const skip=page.getByRole('button',{name:'건너뛰기',exact:true});if(await skip.isVisible())await skip.click();
        const plan=JSON.parse(fs.readFileSync(path.join(out,'cases',c.id,'plan.json')));
        const planeId=await page.evaluate(async plan=>{
          const v='?v=1.7.0-four-session-integration',{state}=await import('/preview/js/state.js'+v),{insertNativeGraph}=await import('/preview/js/graph/native-graph.js'+v);
          state.update(s=>{s.objects=[];s.groups=[];s.selectedIds=[];s.undoStack=[];s.redoStack=[];});
          const pb=plan.source.plotBox,r=insertNativeGraph(state,plan,{box:{x:10,y:10,w:70,h:70*pb.h/pb.w}});if(!r.ok)throw Error(r.error);return r.planeId;
        },plan);
        const before=await snapshot(),expressions=before.filter(o=>o.sourceKind==='expression');
        for(const [index,expr] of expressions.entries()){
          await page.evaluate(async id=>(await import('/preview/js/graph/graph-modal.js?v=1.7.0-four-session-integration')).openGraphModal(id),planeId);
          await page.locator('#gm-tab-func-btn').click();await page.locator('#gm-sub-expr').click();
          await page.locator('#gm-chips > button').nth(index).click();
          assert.equal(await page.locator('#gm-expr').inputValue(),expr.expr);
          const editedExpression=`(${expr.expr})+0.005`;
          await page.locator('#gm-expr').fill(editedExpression);await page.locator('#gm-expr').dispatchEvent('input');await page.locator('#gm-confirm').click();
          const after=await snapshot(),changed=after.find(o=>o.id===expr.id);
          assert.equal(changed.expr,editedExpression);assert.notDeepEqual(changed.mathPoints,expr.mathPoints);
          await page.evaluate(async()=>{const v='?v=1.7.0-four-session-integration',{state}=await import('/preview/js/state.js'+v),io=await import('/preview/js/project-io.js'+v);io.applyLoaded(state,JSON.parse(JSON.stringify(io.serialize(state.get()))));});
          const reopened=await snapshot();for(const o of after){const loaded=reopened.find(q=>q.id===o.id);for(const k of Object.keys(o))assert.deepEqual(loaded[k],o[k],`reopened ${o.id}.${k}`);}
          await page.screenshot({path:path.join(out,'cases',c.id,`formula-${index}-${engineName}.png`)});
          // Reset to the untouched first result for the next formula, without writing the delivered .5e file.
          await page.evaluate(async objects=>{const {state}=await import('/preview/js/state.js?v=1.7.0-four-session-integration');state.update(s=>{s.objects=objects;s.undoStack=[];s.redoStack=[];});},before);
          row.expressions.push({seriesId:expr.reconstruction?.seriesId,original:expr.expr,edited:editedExpression,resampled:true,serializedAndReopened:true});
        }
        assert.deepEqual(errors,[]);row.pass=true;
      }catch(e){row.error=e.stack;row.invalidInputs=await page.evaluate(()=>Array.from(document.querySelectorAll('input:invalid,textarea:invalid,select:invalid')).filter(i=>i.id.startsWith('gm-')).map(i=>({id:i.id,value:i.value,min:i.min,max:i.max,step:i.step,message:i.validationMessage}))).catch(()=>[]);await page.screenshot({path:path.join(out,'cases',c.id,`formula-${engineName}-failure.png`)}).catch(()=>{});}
      finally{await page.close();fs.writeFileSync(file,JSON.stringify(result,null,2));console.log(row.pass?'PASS':'FAIL',engineName,c.id,row.error?.split('\n')[0] || '');}
    }}finally{await browser.close();}
  }
  result.pass=result.cases.length===cases.length*2 && result.cases.every(c=>c.pass);fs.writeFileSync(file,JSON.stringify(result,null,2));if(!result.pass)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
