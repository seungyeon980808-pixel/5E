const test=require('node:test'),assert=require('node:assert/strict');
const api=import('../js/ai-exam-label-removal.js');
const png=import('../js/ai-scoped-edit-png.js');
function fixture(){
 const width=100,height=60,data=new Uint8ClampedArray(width*height*4).fill(255);
 const labels=[],inkSearchRegions=[];
 const dark=(x,y)=>data.set([0,0,0,255],(y*width+x)*4);
 for(const [id,x] of [['first',10],['second',35],['contact',65]]){
  labels.push({id,text:id,sourceRef:1,scope:'general',mode:'text'});
  for(let y=10;y<=18;y++)dark(x,y);for(let dx=0;dx<7;dx++)dark(x+dx,10);
  inkSearchRegions.push({id:id+'-text',labelId:id,sourceRef:1,ownership:'confirmed',component:'text',background:[255,255,255,255],bounds:{x:(x-3)/width,y:7/height,w:13/width,h:15/height}});
 }
 for(let y=5;y<50;y++)dark(70,y); // Contact touches the third glyph.
 const plan={labels,inkSearchRegions,protectedRegions:[],uncertainties:[],preservedMarks:[],excludedLabels:[]};
 return {width,height,data,plan,dark};
}
test('two isolated labels survive a structure-touching deferral with decoded outside-mask equality',async()=>{
 const {removeExamLabelPixels}=await api,{encodeScopedPng,decodeScopedPng}=await png,f=fixture(),r=removeExamLabelPixels(f);
 assert.equal(r.report.status,'partial');assert.equal(r.report.removalReadiness,'needs-review');
 assert.deepEqual(r.removedLabelIds,['first','second']);assert.deepEqual(r.report.removedLabelIds,r.removedLabelIds);
 assert.deepEqual(r.deferredLabels.map(l=>l.labelId),['contact']);assert.deepEqual(r.report.deferredLabels,r.deferredLabels);
 assert.equal(r.report.removalMasks.coordinateSpace,'source-pixels');assert.equal(r.report.removalMasks.width,100);assert.equal(r.report.removalMasks.height,60);
 assert.deepEqual(r.report.removalMasks.regions.map(region=>region.labelId),['first','second']);
 assert.ok(r.report.removalMasks.regions.every(region=>region.component==='text'&&region.pixels.every(i=>r.mask[i]===1)));
 assert.ok(r.deferredLabels[0].reasons.some(i=>i.code==='ink-connected-outside-search'));
 assert.equal(r.report.changedPixels,30);
 const decoded=await decodeScopedPng(await encodeScopedPng({...r,data:new Uint8Array(r.data)}));
 let changed=0;
 for(let i=0;i<r.mask.length;i++){
  assert.equal(r.mask[i],r.appliedMask[i]);
  if(!r.mask[i])assert.deepEqual(decoded.data.slice(i*4,i*4+4),new Uint8Array(f.data.slice(i*4,i*4+4)));
  else {assert.equal(f.data[i*4],0);assert.equal(decoded.data[i*4],255);changed++;}
 }
 assert.equal(changed,30);assert.equal(r.data[(10*100+65)*4],0);assert.equal(r.data[(25*100+70)*4],0);
 assert.deepEqual(r.calls,{localRestore:0,fullGeneration:0});
});
function leaderFixture(){
 const f=fixture();f.plan.labels=f.plan.labels.slice(0,2);f.plan.inkSearchRegions=f.plan.inkSearchRegions.slice(0,2);
 f.plan.labels[1].mode='leader';
 const leader=[],endpoint=[];
 for(let x=40;x<=49;x++){f.dark(x,30);leader.push(30*100+x);}
 for(const [x,y] of [[55,30],[54,29],[54,31],[53,30]]){f.dark(x,y);endpoint.push(y*100+x);}
 f.plan.removalMasks={version:1,coordinateSpace:'source-pixels',width:f.width,height:f.height,regions:[
  {id:'second-leader',labelId:'second',sourceRef:1,ownership:'confirmed',component:'leader',pixels:leader},
  {id:'second-endpoint',labelId:'second',sourceRef:1,ownership:'confirmed',component:'endpoint',pixels:endpoint,method:'local-restore'}
 ]};
 return f;
}
test('flat text and leader are not committed when the endpoint requires restoration',async()=>{
 const {removeExamLabelPixels,restoreExamLabelPixels}=await api,f=leaderFixture(),r=removeExamLabelPixels(f);
 assert.equal(r.report.status,'partial');assert.deepEqual(r.removedLabelIds,['first']);
 assert.equal(r.pending.length,3);
 for(const i of [10*100+35,30*100+45,30*100+55])assert.equal(r.data[i*4],0);
 let calls=0;
 const failed=await restoreExamLabelPixels({...f,localRestore:async()=>{calls++;throw Error('endpoint unavailable');}});
 assert.equal(calls,1);assert.equal(failed.report.status,'partial');assert.deepEqual(failed.removedLabelIds,['first']);
 assert.ok(failed.deferredLabels[0].reasons.some(i=>i.code==='local-restore-failed'&&i.message==='endpoint unavailable'));
 assert.deepEqual(failed.data,r.data);assert.equal(failed.calls.localRestore,1);assert.equal(failed.calls.fullGeneration,0);
 const success=await restoreExamLabelPixels({...f,localRestore:async input=>({width:input.width,height:input.height,data:new Uint8ClampedArray(input.data.length).fill(255),verified:true})});
 assert.equal(success.report.status,'complete');assert.deepEqual(success.removedLabelIds,['first','second']);assert.deepEqual(success.deferredLabels,[]);
 assert.deepEqual(success.report.removalMasks.regions.filter(r=>r.labelId==='second').map(r=>r.component).sort(),['endpoint','leader','text']);
 for(const i of [10*100+35,30*100+45,30*100+55])assert.equal(success.data[i*4],255);
 for(let i=0;i<success.mask.length;i++)if(!success.mask[i])assert.deepEqual(success.data.slice(i*4,i*4+4),f.data.slice(i*4,i*4+4));
});
test('missing leader or endpoint authorization defers the entire label before optional restoration',async()=>{
 const {restoreExamLabelPixels}=await api;
 for(const component of ['leader','endpoint']){
  const f=leaderFixture();f.plan.removalMasks.regions=f.plan.removalMasks.regions.filter(r=>r.component!==component);
  let calls=0;const r=await restoreExamLabelPixels({...f,localRestore:async()=>{calls++;throw Error('must not dispatch');}});
  assert.equal(calls,0);assert.equal(r.report.status,'partial');assert.deepEqual(r.removedLabelIds,['first']);
  assert.equal(r.data[(10*100+35)*4],0);assert.equal(r.data[(30*100+45)*4],0);
  assert.ok(r.deferredLabels[0].reasons.some(i=>i.code==='label-removal-component-missing'&&i.component===component));
 }
});
test('invalid source-pixel frames never permit shape removal or local dispatch',async()=>{
 const {restoreExamLabelPixels}=await api,f=leaderFixture();f.plan.removalMasks.width++;
 let calls=0;const r=await restoreExamLabelPixels({...f,localRestore:async()=>{calls++;throw Error('must not dispatch');}});
 assert.equal(calls,0);assert.equal(r.report.status,'review');assert.deepEqual(r.data,f.data);assert.deepEqual(r.removedLabelIds,[]);
 assert.ok(r.deferredLabels.every(l=>l.reasons.some(i=>i.code==='invalid-pixel-mask-frame')));
});
test('overlapping owned glyph masks cannot erase a deferred owner through another label',async()=>{
 const {removeExamLabelPixels}=await api,f=fixture();
 f.plan.labels=f.plan.labels.slice(0,2);f.plan.labels[1].mode='leader';
 f.plan.inkSearchRegions=[f.plan.inkSearchRegions[0],{...f.plan.inkSearchRegions[0],id:'shared',labelId:'second'}];
 const r=removeExamLabelPixels(f);
 assert.equal(r.report.status,'review');assert.deepEqual(r.data,f.data);assert.deepEqual(r.removedLabelIds,[]);
 assert.ok(r.deferredLabels.every(l=>l.reasons.some(i=>i.code==='overlapping-removal-owners')));
});
test('graph ink stays protected while independently safe general labels are committed',async()=>{
 const {removeExamLabelPixels}=await api,f=fixture();
 f.plan.excludedLabels=[{scope:'graph',sourceRef:1,bounds:f.plan.inkSearchRegions[2].bounds}];
 const r=removeExamLabelPixels(f);
 assert.equal(r.report.status,'partial');assert.deepEqual(r.removedLabelIds,['first','second']);
 assert.equal(r.data[(10*100+65)*4],0);assert.equal(r.data[(35*100+70)*4],0);
 assert.ok(r.deferredLabels[0].reasons.some(i=>i.code==='protected-or-uncertain-ink'));
});
test('a protected failed extraction retains ownership against an overlapping safe search',async()=>{
 const {removeExamLabelPixels}=await api,f=fixture();
 f.plan.labels=f.plan.labels.slice(0,2);
 f.plan.inkSearchRegions=[f.plan.inkSearchRegions[0],{...f.plan.inkSearchRegions[0],id:'shared',labelId:'second',bounds:{x:.07,y:7/60,w:.4,h:15/60}}];
 f.plan.protectedRegions=[{sourceRef:1,bounds:{x:.34,y:.15,w:.03,h:.2}}];
 const r=removeExamLabelPixels(f);
 assert.equal(r.report.status,'review');assert.deepEqual(r.data,f.data);assert.deepEqual(r.removedLabelIds,[]);
 assert.ok(r.deferredLabels.find(l=>l.labelId==='first').reasons.some(i=>i.code==='overlapping-removal-owners'));
 assert.ok(r.deferredLabels.find(l=>l.labelId==='second').reasons.some(i=>i.code==='protected-or-uncertain-ink'));
});
test('data URL boundary returns partial identities and actual source-pixel masks after PNG decoding',async t=>{
 const {removeExamLabelPixels,removeExamLabelsFromDataUrl}=await api,{encodeScopedPng,decodeScopedPng}=await png,f=fixture();
 const expected=removeExamLabelPixels(f);
 const sourceUrl='data:image/png;base64,'+Buffer.from(await encodeScopedPng({...f,data:new Uint8Array(f.data)})).toString('base64');
 const outputUrl='data:image/png;base64,'+Buffer.from(await encodeScopedPng({...expected,data:new Uint8Array(expected.data)})).toString('base64');
 // Canvas is the browser boundary; both input and output are real decoded PNGs.
 class Image {
  set src(url){
   decodeScopedPng(new Uint8Array(Buffer.from(url.split(',')[1],'base64'))).then(decoded=>{
    this.naturalWidth=decoded.width;this.naturalHeight=decoded.height;this.pixels=decoded.data;this.onload();
   },error=>this.onerror(error));
  }
 }
 let pixels;
 const ctx={
  drawImage(image){pixels=new Uint8ClampedArray(image.pixels);},
  getImageData(){return {data:new Uint8ClampedArray(pixels)};},
  putImageData(image){pixels=new Uint8ClampedArray(image.data);},
  clearRect(){pixels.fill(0);}
 };
 const globals={Image,ImageData:class {constructor(data){this.data=data;}},document:{createElement:()=>({
  getContext:()=>ctx,
  toDataURL:()=>{assert.deepEqual(pixels,expected.data);return outputUrl;}
 })}};
 for(const [name,value] of Object.entries(globals)){
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,name);
  t.after(()=>{if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);});
  Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});
 }
 const r=await removeExamLabelsFromDataUrl({dataUrl:sourceUrl,plan:f.plan,workflow:{imageKind:'exam',labelResult:'remove'}});
 assert.equal(r.report.status,'partial');assert.equal(r.report.outsideMaskChanged,0);
 assert.deepEqual(r.removedLabelIds,['first','second']);assert.deepEqual(r.deferredLabels.map(l=>l.labelId),['contact']);
 assert.deepEqual(r.mask,expected.mask);assert.deepEqual(r.appliedMask,expected.appliedMask);
 assert.deepEqual(r.report.removalMasks,expected.report.removalMasks);
 assert.equal(r.dataUrl,outputUrl);assert.equal(r.width,100);assert.equal(r.height,60);
});
