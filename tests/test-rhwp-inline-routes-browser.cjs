const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {fixture}=require('./fixtures/ai-image-label-workflow.cjs');
const output=process.env.EVIDENCE_DIR || path.resolve(__dirname,'../.omo/evidence/candidate-first-20261010/inline-routes');

test('RHWP inline routed handles change rendered geometry and survive undo and portable reopening',{timeout:90000},async t=>{
  fs.mkdirSync(output,{recursive:true});
  process.env.TASK2_ENGINE='chromium';
  const {page,errors}=await fixture(t,1,output);
  await page.locator('#ai-image-panel [data-ai-close]').click();
  await page.locator('#ai-image-panel').waitFor({state:'hidden'});
  await page.evaluate(async()=>{
    const {ExamInlineEditor}=await import('/js/rhwp-exam-inline-editor.js?v=1.7.0-four-session-integration');
    const host=document.createElement('div');host.id='inline-route-test';document.body.append(host);
    const editor=new ExamInlineEditor(host,{onChange:labels=>{
      window.__inlineSaved=structuredClone(labels);window.dispatchEvent(new Event('qa:inline-changed'));
    },onAction:async()=>{}});
    const bridge={editor:{element:document.body},figureGeometry:()=>({x:80,y:80,w:900,h:640}),
      figureViewport:()=>({x:0,y:0,w:1440,h:1000}),watchView:()=>()=>{}};
    window.__inlineQA={editor,bridge};
  });
  const host=page.locator('#inline-route-test');
  const inspect=()=>page.evaluate(()=>{
    const editor=__inlineQA.editor,label=editor.snapshot()[0];
    const paths=[...editor.svg.querySelectorAll('[data-label-leader-route]')].map(p=>p.getAttribute('d'));
    const glyph=editor.svg.querySelector('[data-annotation-id] text')?.getBoundingClientRect();
    return {label,paths,glyph:glyph?{x:glyph.x,y:glyph.y}:null,saved:__inlineSaved};
  });
  async function drag(handle,dx,dy) {
    const locator=host.locator(`[data-inline-handle="${handle}"]`),box=await locator.boundingBox();
    assert.ok(box,'native inline handle is visible');
    await page.evaluate(()=>{
      window.__inlineChanged=new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>{window.removeEventListener('qa:inline-changed',changed);reject(new Error('Inline change was not published'));},5000);
        function changed(){clearTimeout(timeout);resolve();}
        window.addEventListener('qa:inline-changed',changed,{once:true});
      });
    });
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width/2+dx,box.y+box.height/2+dy);
    await page.mouse.up();
    await page.evaluate(()=>__inlineChanged);
  }
  const cases=[
    {kind:'straight',controls:[]},
    {kind:'polyline',controls:[{x:45,y:20},{x:45,y:55}]},
    {kind:'quadratic',controls:[{x:40,y:10}]},
    {kind:'cubic',controls:[{x:55,y:10},{x:25,y:40}]},
    {kind:'multi',controls:[]},
    {kind:'legacy',controls:[]},
  ];
  for(const entry of cases){
    await page.evaluate(entry=>{
      const label={id:'route-label',type:'labeler',p1:{x:20,y:55},p2:{x:70,y:20},text:'전자',labelSize:3.7,strokeWidth:.2,layerId:1,
        labelTypographyVersion:1,labelRuns:[{text:'전자',role:'text',contentMode:'plain'}]};
      if(entry.kind!=='legacy'){
        label.leaderRoutes=[{kind:entry.kind==='multi'?'straight':entry.kind,attachment:'label',start:{x:65,y:20},target:{...label.p1},controls:entry.controls,end:'circle'}];
        if(entry.kind==='multi')label.leaderRoutes.push({kind:'straight',attachment:'frame',start:{x:10,y:15},target:{x:15,y:60},controls:[],end:'none'});
      } else label.elbow={x:20,y:20};
      __inlineSaved=null;
      __inlineQA.editor.open({labels:[label],bounds:{x:0,y:0,w:100,h:80},baseUrl:__task2.modified,bridge:__inlineQA.bridge,ref:{},layers:[{id:1,visible:true}],layerId:1});
    },entry);
    const before=await inspect();
    await drag('p1',36,24);
    const endpoint=await inspect();
    assert.notDeepEqual(endpoint.label.p1,before.label.p1,entry.kind);
    assert.deepEqual(endpoint.saved[0],endpoint.label);
    if(entry.kind!=='legacy'){
      assert.deepEqual(endpoint.label.leaderRoutes[0].target,endpoint.label.p1);
      const numbers=endpoint.paths[0].match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
      assert.deepEqual(numbers.slice(-2),[endpoint.label.p1.x,endpoint.label.p1.y],'visible endpoint follows persisted route');
      assert.notEqual(endpoint.paths[0],before.paths[0]);
    } else assert.deepEqual(endpoint.label.elbow,before.label.elbow);
    await host.locator('[data-inline-action="undo"]').click();
    assert.deepEqual((await inspect()).label,before.label);
    await host.locator('[data-inline-action="redo"]').click();
    assert.deepEqual((await inspect()).label,endpoint.label);
    await drag('p2',45,16);
    const caption=await inspect();
    assert.notDeepEqual(caption.label.p2,endpoint.label.p2);
    assert.notDeepEqual(caption.glyph,endpoint.glyph,'visible caption moves');
    if(entry.kind!=='legacy'){
      const dx=caption.label.p2.x-endpoint.label.p2.x,dy=caption.label.p2.y-endpoint.label.p2.y;
      assert.deepEqual(caption.label.leaderRoutes[0].start,{x:endpoint.label.leaderRoutes[0].start.x+dx,y:endpoint.label.leaderRoutes[0].start.y+dy});
      assert.deepEqual(caption.label.leaderRoutes[0].target,endpoint.label.leaderRoutes[0].target);
      if(entry.controls.length){
        await drag('route-0-control-0',27,16);
        const controlled=await inspect(),point=controlled.label.leaderRoutes[0].controls[0];
        assert.notDeepEqual(point,caption.label.leaderRoutes[0].controls[0]);
        assert.ok(controlled.paths[0].includes(`${point.x} ${point.y}`));
      }
      if(entry.kind==='multi'){
        assert.deepEqual(caption.label.leaderRoutes[1],endpoint.label.leaderRoutes[1],'frame route does not follow caption');
        await drag('route-1-start-0',18,16);
        const framed=await inspect(),point=framed.label.leaderRoutes[1].start;
        assert.ok(framed.paths[1].startsWith(`M ${point.x} ${point.y} `));
        await drag('route-1-target-0',18,-16);
        const extra=await inspect();
        assert.notDeepEqual(extra.label.leaderRoutes[1].target,framed.label.leaderRoutes[1].target);
        assert.deepEqual(extra.label.p1,extra.label.leaderRoutes[0].target);
      }
    }
    await host.locator('[data-inline-field="text"]').fill('전류 센서');
    await host.locator('[data-inline-field="text"]').press('Tab');
    const edited=await inspect();
    assert.equal(edited.label.labelRuns.map(run=>run.text).join(''),'전류 센서');
    const reopened=await page.evaluate(async()=>{
      const {buildFiveEProject,parseFiveEProject}=await import('/js/fivee-project.js?v=1.7.0-four-session-integration');
      const labels=__inlineQA.editor.snapshot();
      const drawing={version:'0.17',activePageId:'inline',pages:[{id:'inline',name:'inline',objects:labels}]};
      const blob=buildFiveEProject({drawing}),bytes=new Uint8Array(await blob.arrayBuffer());
      const restored=parseFiveEProject(bytes).drawing.pages[0].objects;
      __inlineQA.editor.setLabels(restored);
      return restored;
    });
    assert.deepEqual(reopened,[edited.label]);
    assert.deepEqual((await inspect()).paths,edited.paths);
    await page.screenshot({path:path.join(output,entry.kind+'.png')});
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({cases:cases.map(c=>c.kind),renderedEndpoints:true,captionAttachment:true,controls:true,undoRedo:true,portableReopen:true,errors},null,2));
});
