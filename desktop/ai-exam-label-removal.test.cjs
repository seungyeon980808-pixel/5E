const test=require('node:test');
const assert=require('node:assert/strict');
const api=import('../js/ai-exam-label-removal.js');
const fixture=()=>{
 const width=20,height=20,data=new Uint8ClampedArray(width*height*4).fill(255);
 const dark=i=>data.set([0,0,0,255],i*4);
 // Separate actual structure, text stroke, and hollow endpoint.
 for(let y=2;y<18;y++)dark(y*width+18);
 for(let y=4;y<7;y++)dark(y*width+4);
 for(const [x,y] of [[11,10],[12,10],[10,11],[13,11],[10,12],[13,12],[11,13],[12,13]])dark(y*width+x);
 const rect=(id,x,y,w,h)=>({id,labelId:'a',sourceRef:1,ownership:'confirmed',component:'text',kind:'polygon',points:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]});
 const plan={labels:[{id:'a',scope:'general',sourceRef:1}],uncertainties:[],removalRegions:[rect('text',.15,.15,.15,.25),{...rect('endpoint',.45,.45,.3,.3),component:'endpoint'}]};
 return {data,width,height,plan};
};
test('confirmed text and hollow endpoint removed; scientific line and every outside pixel remain exact',async()=>{
 const {removeExamLabelPixels}=await api,f=fixture(),original=new Uint8ClampedArray(f.data),r=removeExamLabelPixels(f);
 assert.equal(r.report.status,'complete');assert.equal(r.data[(4*20+4)*4],255);assert.equal(r.data[(10*20+11)*4],255);assert.equal(r.data[(10*20+18)*4],0);
 for(let i=0;i<r.mask.length;i++)if(!r.mask[i])assert.deepEqual(r.data.slice(i*4,i*4+4),original.slice(i*4,i*4+4));
 assert.deepEqual(f.data,original);assert.deepEqual(r.calls,{localRestore:0,fullGeneration:0});
});
test('bbox without explicit shape never authorizes a white rectangle',async()=>{
 const {removeExamLabelPixels}=await api,f=fixture();delete f.plan.removalRegions;f.plan.labels[0].typography={bounds:{x:0,y:0,w:1,h:1}};
 const r=removeExamLabelPixels(f);assert.deepEqual(r.data,f.data);assert.equal(r.report.status,'review');assert.equal(r.mask.some(Boolean),false);
});
test('uncertain overlap blocks removal; protected vessel overlap cannot flat fill',async()=>{
 const {removeExamLabelPixels}=await api;
 for(const field of ['uncertainties','protectedRegions']) {
  const f=fixture();f.plan[field]=[{sourceRef:1,bounds:{x:.45,y:.45,w:.3,h:.3}}];const r=removeExamLabelPixels(f);
  assert.equal(r.report.status,'review');assert.deepEqual(r.data,f.data);assert.equal(r.data[(10*20+11)*4],0);
 }
});
test('one crop-only verified callback composes only mask; callback mutation cannot expand mask',async()=>{
 const {restoreExamLabelPixels}=await api,f=fixture();f.plan.protectedRegions=[{sourceRef:1,bounds:{x:.45,y:.45,w:.3,h:.3}}];let calls=0;
 const r=await restoreExamLabelPixels({...f,localRestore:async input=>{
  calls++;assert.ok(input.width<f.width);assert.ok(input.height<f.height);input.mask.fill(1);
  return {data:new Uint8ClampedArray(input.data.length).fill(128),width:input.width,height:input.height,verified:true};
 }});
 assert.equal(calls,1);assert.equal(r.report.status,'complete');assert.equal(r.calls.fullGeneration,0);
 for(let i=0;i<r.mask.length;i++)if(!r.mask[i])assert.deepEqual(r.data.slice(i*4,i*4+4),f.data.slice(i*4,i*4+4));
});
test('failed, wrong-size, unverified local callbacks leave pending original pixels and no global fallback',async()=>{
 const {restoreExamLabelPixels}=await api;
 for(const callback of [()=>{throw Error('failed');},input=>({data:input.data,width:999,height:999,verified:true}),input=>({...input})]) {
  const f=fixture();f.plan.removalRegions.forEach(r=>r.method='local-restore');let count=0;
  const r=await restoreExamLabelPixels({...f,localRestore:async input=>{count++;return callback(input);}});
  assert.equal(count,1);assert.deepEqual(r.data,f.data);assert.equal(r.report.status,'review');assert.equal(r.calls.fullGeneration,0);
 }
});
test('pre-abort and abort during callback never apply a late result',async()=>{
 const {restoreExamLabelPixels}=await api,f=fixture(),controller=new AbortController();controller.abort();
 await assert.rejects(restoreExamLabelPixels({...f,signal:controller.signal}),{name:'AbortError'});
 const next=new AbortController();f.plan.removalRegions.forEach(r=>r.method='local-restore');
 await assert.rejects(restoreExamLabelPixels({...f,signal:next.signal,localRestore:async input=>{next.abort();return {...input,verified:true};}}),{name:'AbortError'});
});
test('path and ellipse rasterization only accepts confirmed owner and source',async()=>{
 const {buildExamLabelRemovalMasks}=await api,f=fixture();
 f.plan.removalRegions=[{id:'path',labelId:'a',sourceRef:1,ownership:'confirmed',kind:'path',points:[{x:.2,y:.2},{x:.4,y:.3}],width:.08},{id:'circle',labelId:'a',sourceRef:1,ownership:'confirmed',kind:'ellipse',bounds:{x:.5,y:.5,w:.2,h:.2}},{id:'unknown',labelId:'a',ownership:'unknown',kind:'ellipse',bounds:{x:0,y:0,w:1,h:1}}];
 const r=buildExamLabelRemovalMasks(f.plan,f.width,f.height);assert.equal(r.regions.length,2);assert.ok(r.mask.some(Boolean));assert.ok(r.issues.some(i=>i.code==='unconfirmed-removal-region'));assert.equal(r.mask[0],0);
});
test('white hollow endpoint over a vessel requires local restoration, with exact outside pixels',async()=>{
 const {removeExamLabelPixels,restoreExamLabelPixels}=await api;
 const f=fixture();f.plan.removalRegions=[f.plan.removalRegions[1]];
 for(let y=9;y<15;y++)for(let x=9;x<15;x++)f.data.set([0,0,0,255],(y*20+x)*4);
 for(let y=11;y<13;y++)for(let x=11;x<13;x++)f.data.set([255,255,255,255],(y*20+x)*4);
 f.plan.protectedRegions=[{sourceRef:1,bounds:{x:.45,y:.45,w:.3,h:.3}}];
 const deferred=removeExamLabelPixels(f);assert.equal(deferred.report.status,'review');assert.equal(deferred.data[(11*20+11)*4],255);
 const r=await restoreExamLabelPixels({...f,localRestore:async input=>{
  const data=new Uint8ClampedArray(input.data);for(let i=0;i<input.mask.length;i++)if(input.mask[i])data.set([0,0,0,255],i*4);
  return {data,width:input.width,height:input.height,verified:true};
 }});
 assert.equal(r.data[(11*20+11)*4],0);assert.equal(r.calls.localRestore,1);
 for(let i=0;i<r.mask.length;i++)if(!r.mask[i])assert.deepEqual(r.data.slice(i*4,i*4+4),f.data.slice(i*4,i*4+4));
});
test('leader body and endpoint are mandatory for a complete label removal',async()=>{
 const {removeExamLabelPixels}=await api,f=fixture();f.plan.labels[0].mode='leader';
 const r=removeExamLabelPixels(f);assert.equal(r.report.status,'review');assert.deepEqual(r.data,f.data);assert.ok(r.report.issues.some(i=>i.component==='leader'));
});
test('cancellation rejects a hanging callback without waiting for its completion',async()=>{
 const {restoreExamLabelPixels}=await api,f=fixture(),controller=new AbortController();f.plan.removalRegions.forEach(r=>r.method='local-restore');
 const operation=restoreExamLabelPixels({...f,signal:controller.signal,localRestore:()=>new Promise(()=>{})});
 controller.abort();await assert.rejects(operation,{name:'AbortError'});
});
test('auxiliary and scientific-arrow removal are independent; label regions always active',async()=>{
 const {removeExamLabelPixels}=await api;
 for(const auxiliaryMarks of ['keep','remove'])for(const scientificArrows of ['keep','remove']) {
  const f=fixture(),shape=f.plan.removalRegions[0];
  f.plan.labels=[];f.plan.removalRegions=[{...shape,labelId:undefined,id:'aux',owner:'auxiliary',component:'mark'},{...f.plan.removalRegions[1],labelId:undefined,id:'arrow',owner:'scientific-arrow',component:'mark'}];
  const r=removeExamLabelPixels({...f,workflow:{imageKind:'exam',labelResult:'remove',auxiliaryMarks,scientificArrows}});
  assert.equal(r.data[(4*20+4)*4],auxiliaryMarks==='remove'?255:0);assert.equal(r.data[(10*20+11)*4],scientificArrows==='remove'?255:0);assert.equal(r.report.status,'complete');
 }
});
test('distant corner masks cannot dispatch a full-frame local restoration or consume its budget',async()=>{
 const {restoreExamLabelPixels}=await api,f=fixture();
 f.plan.removalRegions=[{x:0,y:0,w:.1,h:.1},{x:.9,y:.9,w:.1,h:.1}].map((bounds,i)=>({id:`corner-${i}`,labelId:'a',sourceRef:1,ownership:'confirmed',kind:'ellipse',bounds,component:'endpoint',method:'local-restore'}));
 const dispatched=[];
 const r=await restoreExamLabelPixels({...f,localRestore:async input=>{dispatched.push({width:input.width,height:input.height});return {...input,verified:true};}});
 assert.deepEqual(dispatched,[]);assert.deepEqual(r.calls,{localRestore:0,fullGeneration:0});assert.deepEqual(r.data,f.data);assert.equal(r.report.status,'review');
 const issue=r.report.issues.find(i=>i.code==='local-restore-region-too-large');assert.equal(issue.crop.width,f.width);assert.equal(issue.crop.height,f.height);assert.equal(issue.areaRatio,1);assert.ok(issue.reason);
});
test('local crop area at fifty percent is deferred before dispatch; smaller crops remain usable',async()=>{
 const {restoreExamLabelPixels,EXAM_LOCAL_RESTORE_AREA_LIMIT}=await api;assert.equal(EXAM_LOCAL_RESTORE_AREA_LIMIT,.5);
 for(const endX of [.5,.45]) {
  const f=fixture();f.plan.removalRegions=[{id:'half',labelId:'a',sourceRef:1,ownership:'confirmed',kind:'polygon',points:[{x:0,y:0},{x:endX,y:0},{x:endX,y:1},{x:0,y:1}],component:'text',method:'local-restore'}];
  const dispatched=[];
  const r=await restoreExamLabelPixels({...f,localRestore:async input=>{dispatched.push({width:input.width,height:input.height});return {...input,verified:true};}});
  if(endX===.5) {assert.deepEqual(dispatched,[]);assert.equal(r.calls.localRestore,0);assert.equal(r.report.status,'review');assert.equal(r.report.issues.find(i=>i.code==='local-restore-region-too-large').areaRatio,.5);}
  else {assert.deepEqual(dispatched,[{width:9,height:20}]);assert.equal(r.calls.localRestore,1);}
 }
});
