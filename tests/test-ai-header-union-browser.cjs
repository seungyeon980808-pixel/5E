const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {fixture}=require('./fixtures/ai-image-label-workflow.cjs');
const output=process.env.EVIDENCE_DIR || path.resolve(__dirname,'../.omo/evidence/candidate-first-20261010/header-union');

test('combined workflow tabs and header controls remain visible and nonoverlapping',{timeout:60000},async t=>{
  fs.mkdirSync(output,{recursive:true});
  process.env.TASK2_ENGINE='chromium';
  const {page,errors}=await fixture(t,1,output);
  const receipts=[];
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:950});
    await page.evaluate(async()=>{
      await Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{})));
    });
    const controls=await page.evaluate(()=>[...document.querySelectorAll('#ai-image-panel .ai-head button')]
      .filter(button=>button.getBoundingClientRect().width)
      .map(button=>({label:button.getAttribute('aria-label')||button.textContent.trim(),rect:button.getBoundingClientRect().toJSON()})));
    for(let index=0;index<controls.length;index++){
      const current=controls[index];
      assert.ok(current.rect.left>=0&&current.rect.right<=width,current.label+' is within viewport');
      for(const other of controls.slice(index+1)){
        const x=Math.min(current.rect.right,other.rect.right)-Math.max(current.rect.left,other.rect.left);
        const y=Math.min(current.rect.bottom,other.rect.bottom)-Math.max(current.rect.top,other.rect.top);
        assert.ok(x<=0||y<=0,current.label+' overlaps '+other.label);
      }
    }
    receipts.push({width,controls});
    await page.screenshot({path:path.join(output,`header-${width}.png`)});
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({receipts,errors},null,2));
});
