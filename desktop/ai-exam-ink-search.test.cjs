const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const api=import('../js/ai-exam-label-removal.js');
const fixture=()=>{
 const width=80,height=60,data=new Uint8ClampedArray(width*height*4).fill(255),dark=(x,y)=>data.set([0,0,0,255],(y*width+x)*4);
 // Synthetic ownership fixture: text T, leader, hollow circle, separate scientific wall.
 for(let x=10;x<=16;x++)dark(x,10);for(let y=10;y<=18;y++)dark(13,y);
 for(let x=22;x<=42;x++)dark(x,24);
 for(const [dx,dy] of [[-1,-2],[0,-2],[1,-2],[-2,-1],[2,-1],[-2,0],[2,0],[-2,1],[2,1],[-1,2],[0,2],[1,2]])dark(44+dx,24+dy);
 for(let y=5;y<55;y++)dark(65,y);
 const base={sourceRef:1,labelId:'a',ownership:'confirmed',background:[255,255,255,255]};
 const plan={labels:[{id:'a',sourceRef:1,scope:'general',mode:'leader'}],uncertainties:[],protectedRegions:[],preservedMarks:[],removalRegions:[],inkSearchRegions:[
  {...base,id:'text',component:'text',bounds:{x:8/80,y:8/60,w:12/80,h:13/60}},
  {...base,id:'leader',component:'leader',kind:'path',points:[{x:22.5/80,y:24.5/60},{x:44.5/80,y:24.5/60}],width:3/60,bounds:{x:20/80,y:22/60,w:27/80,h:5/60}},
  {...base,id:'endpoint',component:'endpoint',kind:'ellipse',bounds:{x:40/80,y:20/60,w:9/80,h:9/60}}
 ]};return {width,height,data,plan,dark};
};
function capture(name,f,r){
 if(!process.env.SOURCE_WORKER_EVIDENCE)return;
 const dir=process.env.SOURCE_WORKER_EVIDENCE;fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify({synthetic:true,width:f.width,height:f.height,plan:f.plan,sourceRGBA:Array.from(f.data),outputRGBA:Array.from(r.data),mask:Array.from(r.mask),report:r.report,calls:r.calls},null,2));
}
test('confirmed searches derive actual text, leader and endpoint ink only with exact outside RGBA',async()=>{
 const {removeExamLabelPixels}=await api,f=fixture(),r=removeExamLabelPixels(f);
 assert.equal(r.report.status,'complete');assert.equal(r.report.derivedInkRegions,3);assert.equal(r.report.removalReadiness,'pixel-verified');
 assert.equal(r.data[(10*80+13)*4],255);assert.equal(r.data[(24*80+30)*4],255);assert.equal(r.data[(22*80+44)*4],255);assert.equal(r.data[(24*80+65)*4],0);
 let changed=0;for(let i=0;i<r.mask.length;i++){if(!r.mask[i])assert.deepEqual(r.data.slice(i*4,i*4+4),f.data.slice(i*4,i*4+4));else{assert.equal(f.data[i*4],0);changed++;}}
 assert.ok(changed>20);assert.deepEqual(r.calls,{localRestore:0,fullGeneration:0});capture('isolated-ink-success',f,r);
});
test('scientific crossing beyond declared owned corridor defers whole label without erasing',async()=>{
 const {removeExamLabelPixels}=await api,f=fixture();for(let y=18;y<=32;y++)f.dark(31,y);
 const r=removeExamLabelPixels(f);assert.equal(r.report.status,'review');assert.deepEqual(r.data,f.data);assert.ok(r.report.issues.some(x=>x.code==='ink-connected-outside-search'));capture('connected-crossing-deferred',f,r);
});
test('protected endpoint or uncertainty prevents deterministic erasure even inside confirmed search',async()=>{
 const {removeExamLabelPixels}=await api;
 for(const field of ['protectedRegions','uncertainties']){const f=fixture();f.plan[field]=[{sourceRef:1,bounds:{x:41/80,y:21/60,w:7/80,h:7/60},reason:'possible physical contact'}];const r=removeExamLabelPixels(f);assert.equal(r.report.status,'review');assert.deepEqual(r.data,f.data);assert.ok(r.report.issues.some(x=>x.code==='protected-or-uncertain-ink'));capture(field+'-deferred',f,r);}
});
test('empty or bounding-box-only coverage remains explicit needs-attention and pixel-identical',async()=>{
 const {removeExamLabelPixels}=await api,f=fixture();f.plan.inkSearchRegions=[];f.plan.labels[0].typography={bounds:{x:.1,y:.1,w:.5,h:.5}};
 const r=removeExamLabelPixels(f);assert.equal(r.report.status,'review');assert.equal(r.report.removalReadiness,'needs-review');assert.equal(r.mask.some(Boolean),false);assert.deepEqual(r.data,f.data);capture('empty-coverage-deferred',f,r);
});
test('nonuniform background, edge clipping and invalid owner do not grant removal authority',async()=>{
 const {removeExamLabelPixels}=await api;
 for(const variant of ['background','clipped','ownership']){const f=fixture();
  if(variant==='background')for(let x=0;x<80;x++)f.data.set([250,250,250,255],(10*80+x)*4);
  if(variant==='clipped'){f.plan.inkSearchRegions[0].bounds.x=0;for(let x=0;x<=13;x++)f.dark(x,10);}
  if(variant==='ownership')f.plan.inkSearchRegions.forEach(r=>r.ownership='uncertain');
  const r=removeExamLabelPixels(f);assert.equal(r.report.status,'review');assert.deepEqual(r.data,f.data);capture(variant+'-deferred',f,r);
 }
});

const sampledFixture=()=>{
 const f=fixture();f.plan.labels[0].mode='text';f.plan.inkSearchRegions=f.plan.inkSearchRegions.slice(0,1);
 f.plan.inkSearchRegions[0].backgroundMode='sample-flat';f.plan.inkSearchRegions[0].background=[207,207,207,255];
 for(let i=0;i<f.width*f.height;i++)if(f.data[i*4]===255){const v=207+i%7-3;f.data.set([v,v,v,255],i*4);}
 return f;
};
test('explicit sampled text search removes strong isolated glyphs on noisy grey while outside stays exact',async()=>{
 const {removeExamLabelPixels}=await api,f=sampledFixture(),r=removeExamLabelPixels(f);
 assert.equal(r.report.status,'complete');assert.equal(r.report.derivedInkRegions,1);assert.ok(r.appliedMask.some(Boolean));
 for(let i=0;i<r.mask.length;i++)if(r.appliedMask[i]){assert.equal(f.data[i*4],0);assert.ok(r.data[i*4]>=204&&r.data[i*4]<=210);}else assert.deepEqual(r.data.slice(i*4,i*4+4),f.data.slice(i*4,i*4+4));
 assert.deepEqual(r.calls,{localRestore:0,fullGeneration:0});capture('sampled-grey-ink',f,r);
});
test('sampled text still defers gradients, foreground reaching border, transparent pixels and protected contact',async()=>{
 const {removeExamLabelPixels}=await api;
 for(const variant of ['gradient','contact','alpha','protected','wrong-mode']){
  const f=sampledFixture();
  if(variant==='gradient')for(let y=0;y<60;y++)for(let x=0;x<80;x++)if(f.data[(y*80+x)*4]!==0){const v=120+x*2;f.data.set([v,v,v,255],(y*80+x)*4);}
  if(variant==='contact')for(let x=0;x<=13;x++)f.dark(x,10);
  if(variant==='alpha')f.data[(8*80+8)*4+3]=0;
  if(variant==='protected')f.plan.protectedRegions=[{sourceRef:1,bounds:{x:12/80,y:9/60,w:3/80,h:4/60},reason:'physical contact'}];
  if(variant==='wrong-mode')f.plan.inkSearchRegions[0].backgroundMode='anything';
  const r=removeExamLabelPixels(f);assert.equal(r.report.status,'review',variant);assert.deepEqual(r.data,f.data,variant);capture('sampled-'+variant+'-deferred',f,r);
 }
});
test('sampled mode never promotes typography bounds without explicit confirmed search',async()=>{
 const {removeExamLabelPixels}=await api,f=sampledFixture();f.plan.inkSearchRegions=[];f.plan.labels[0].typography={bounds:{x:.1,y:.1,w:.15,h:.2}};
 const r=removeExamLabelPixels(f);assert.deepEqual(r.data,f.data);assert.equal(r.report.status,'review');
});
test('measured noise envelope includes faint glyph cores and antialiased edges without painting the grey box',async()=>{
 const {removeExamLabelPixels}=await api,f=sampledFixture();
 // A physical grey panel and its outline are not annotation ink.
 for(let y=5;y<=24;y++)for(let x=5;x<=23;x++){
  const edge=x===5||x===23||y===5||y===24;
  f.data.set(edge?[0,0,0,255]:[207,207,207,255],(y*80+x)*4);
 }
 const ink=[];
 for(let y=10;y<=18;y++){
  for(const [x,v] of [[12,195],[13,171],[14,195]]){
   const i=y*80+x;f.data.set([v,v,v,255],i*4);ink.push(i);
  }
 }
 const r=removeExamLabelPixels(f);
 assert.equal(r.report.status,'complete');assert.equal(r.report.changedPixels,ink.length);
 assert.deepEqual(r.removedLabelIds,['a']);assert.deepEqual(r.deferredLabels,[]);
 for(let i=0;i<r.mask.length;i++){
  assert.equal(Boolean(r.mask[i]),ink.includes(i));
  assert.deepEqual(r.data.slice(i*4,i*4+4),ink.includes(i)?Uint8ClampedArray.of(207,207,207,255):f.data.slice(i*4,i*4+4));
 }
 capture('faint-antialias-grey-panel',f,r);
});
test('empty owned endpoint rolls back derived text and leader components',async()=>{
 const {removeExamLabelPixels}=await api,f=fixture();
 for(let y=21;y<=27;y++)for(let x=41;x<=47;x++)f.data.set([255,255,255,255],(y*80+x)*4);
 for(let x=22;x<=42;x++)f.dark(x,24);
 f.plan.inkSearchRegions[2].bounds={x:48/80,y:20/60,w:9/80,h:9/60};
 const r=removeExamLabelPixels(f);
 assert.equal(r.report.status,'review');assert.deepEqual(r.data,f.data);
 assert.deepEqual(r.removedLabelIds,[]);assert.equal(r.deferredLabels[0].labelId,'a');
 assert.ok(r.deferredLabels[0].reasons.some(i=>i.code==='empty-annotation-component'));
 assert.equal(r.appliedMask.some(Boolean),false);
});
