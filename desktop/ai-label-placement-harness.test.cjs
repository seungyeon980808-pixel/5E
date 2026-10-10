const test=require('node:test'),assert=require('node:assert/strict');
const retained=require('./fixtures/ai-label-placement-retained.json');
const mod=import('../js/ai-label-placement-harness.js');
const box={x:.3,y:.3,w:.04,h:.03};
const label=(id,x=.32)=>({id,text:id,sourceRef:1,scope:'general',mode:'text',contentMode:'plain',position:{x,y:.315},anchor:{x,y:.315},typography:{role:'text',bounds:{...box,x:x-.02}}});
const raster=()=>({width:200,height:200,data:new Uint8ClampedArray(200*200*4).fill(255)});
function fixture(kind='phrase') {
 const labels=[label('a'),label('b',.42)],plan={frozen:true,labels,relationGroups:[{id:'g',kind,labelIds:['a','b']}],sourceAssociations:labels.map(l=>({labelId:l.id,status:'confirmed',objectId:'object',reason:'source'})),geometryLock:{objects:[{id:'object',sourceRef:1}]}};
 return {plan,measurements:labels.map(l=>({id:l.id,glyphBounds:{...l.typography.bounds}})),raster:raster()};
}
test('whole phrase translation keeps glyph sizes, offsets and candidate identities',async()=>{
 const m=await mod,f=fixture(),before=JSON.stringify(f.plan),p=m.buildLabelPlacementCandidates(f);
 assert.equal(p.groups.length,1);assert.equal(p.groups[0].candidates.length,3);
 for(const c of p.groups[0].candidates){assert.ok(Math.abs(c.labels[1].position.x-c.labels[0].position.x-.1)<1e-9);assert.equal(c.labels[0].bounds.w,.04);assert.equal(c.rawInkPixels,0);}
 const row={id:'g',status:'matched',candidateId:p.groups[0].candidates[0].candidateId,identities:[{id:'a',sourceObjectId:'object'},{id:'b',sourceObjectId:'object'}],reason:'direct comparison'};
 assert.equal(m.parseCompactLabelPlacementResponse(JSON.stringify({version:1,groups:[row]}),f.plan,p).length,2);
 for(const mutation of [{...row,candidateId:undefined},{...row,position:{x:.1,y:.1}},{...row,identities:[{id:'a',sourceObjectId:'invented'},{id:'b',sourceObjectId:'object'}]}])assert.throws(()=>m.parseCompactLabelPlacementResponse(JSON.stringify({version:1,groups:[mutation]}),f.plan,p));
 assert.equal(JSON.stringify(f.plan),before);
});
test('reaction and sequence do not migrate away from physical arrows; unsafe member rejects whole group',async()=>{
 const m=await mod;
 for(const kind of ['reaction','sequence']){const f=fixture(kind);let p=m.buildLabelPlacementCandidates(f);assert.equal(p.groups[0].candidates.length,1);assert.equal(p.groups[0].candidates[0].dx,0);
 const offset=(62*200+64)*4;f.raster.data.fill(0,offset,offset+3);p=m.buildLabelPlacementCandidates(f);assert.equal(p.groups[0].candidates.length,0);}
});
test('missing native measurements and unavailable source identities never become confirmed',async()=>{
 const m=await mod,f=fixture();f.measurements[0]={id:'a',actual:box};assert.equal(m.buildLabelPlacementCandidates(f).groups[0].candidates.length,0);
 const g=fixture(),p=m.buildLabelPlacementCandidates(g);g.plan.sourceAssociations[0]={labelId:'a',status:'uncertain',reason:'unknown'};
 assert.throws(()=>m.parseCompactLabelPlacementResponse(JSON.stringify({version:1,groups:[{id:'g',status:'matched',candidateId:p.groups[0].candidates[0].candidateId,identities:[{id:'a',sourceObjectId:'object'},{id:'b',sourceObjectId:'object'}],reason:'guess'}]}),g.plan,p),/identity|Stale/);
});
test('retained soil headline and solenoid footer fallback glyphs are always inspected',async()=>{
 const m=await mod;
 for(const key of ['general-soil-development','general-solenoid-field']){
  const f=retained[key],r=m.assessFinalLabelPlacement({plan:{labels:f.labels.map(l=>({...l,targetReviewRequired:true}))},measurements:f.measurements,raster:raster()});
  assert.ok(r.issues.some(i=>i.code==='clipped-final-glyph'),key);assert.ok(r.issues.some(i=>i.code==='unconfirmed-source-fallback'));assert.equal(r.status,'needs-attention');
 }
});
test('retained plant reaction rejects previously scattered token positions',async()=>{
 const m=await mod,f=retained['general-plant-storage'];
 const plan={labels:f.labels,relationGroups:[{id:'reaction',kind:'reaction',labelIds:f.labels.map(l=>l.id)}]};
 const rows=f.labels.map((l,i)=>({id:l.id,status:'matched',position:{x:l.position.x+i*.01,y:l.position.y},bounds:{...l.typography.bounds,x:l.typography.bounds.x+i*.01}}));
 assert.throws(()=>m.validateGroupedLabelPlacement(plan,rows),/scattered|locked/);
 assert.throws(()=>m.validateGroupedLabelPlacement(plan,rows.map((r,i)=>i?{...r,status:'uncertain'}:r)),/Partial/);
});
test('final check catches overlap, ink occlusion and unchecked RAW independent of target status',async()=>{
 const m=await mod,f=fixture();f.measurements[1].glyphBounds={...f.measurements[0].glyphBounds};f.raster.data.fill(0,(62*200+64)*4,(62*200+64)*4+3);
 const r=m.assessFinalLabelPlacement(f);assert.ok(r.issues.some(i=>i.code==='raw-ink-occlusion'));assert.ok(r.issues.some(i=>i.code==='final-glyph-overlap'));
 assert.ok(m.assessFinalLabelPlacement({...f,raster:null}).issues.some(i=>i.code==='raw-ink-not-checked'));
});
test('native editable objects share a real group and retain separate editable source text',async()=>{
 const {createEditableImageLabelObjects}=await import('../js/ai-editable-image-labels.js'),f=fixture();let i=0;
 const objects=createEditableImageLabelObjects({labels:f.plan.labels,relationGroups:f.plan.relationGroups,image:{id:'i',x:0,y:0,w:100,h:100},idFactory:()=>`object-${++i}`});
 assert.equal(objects[0].groupId,objects[1].groupId);assert.ok(objects[0].groupId);assert.notEqual(objects[0].id,objects[0].groupId);assert.equal(objects[0].text,'a');assert.equal(objects[0].type,'text');assert.equal(objects[0].locked,false);
});
test('explicit source-figure captions confirm without an invented scientific object',async()=>{
 const m=await mod,f=fixture();f.plan.relationGroups=[];f.plan.sourceAssociations=f.plan.labels.map(l=>({labelId:l.id,status:'confirmed',bindingKind:'figure',sourceRef:1,reason:'Observed panel caption'}));f.plan.geometryLock={objects:[]};
 const p=m.buildLabelPlacementCandidates(f),wire={version:1,groups:p.groups.map(g=>({id:g.id,status:'matched',candidateId:g.candidates[0].candidateId,identities:g.labelIds.map(id=>({id,bindingKind:'figure',sourceRef:1})),reason:'Visible source figure caption'}))};
 const rows=m.parseCompactLabelPlacementResponse(JSON.stringify(wire),f.plan,p);assert.equal(rows[0].targetIdentity.bindingKind,'figure');assert.equal(rows[0].targetIdentity.sourceObjectId,undefined);
 const {parseLabelTargetPlacement}=await import('../js/ai-label-target-placement.js');assert.equal(parseLabelTargetPlacement(JSON.stringify({version:1,labels:rows}),f.plan).length,2);
 for(const identity of [{id:'a',bindingKind:'figure',sourceRef:2},{id:'a',sourceObjectId:'invented'},{id:'a',bindingKind:'figure',sourceRef:1,sourceObjectId:'invented'}]){const bad=structuredClone(wire);bad.groups[0].identities[0]=identity;assert.throws(()=>m.parseCompactLabelPlacementResponse(JSON.stringify(bad),f.plan,p),/identity/);}
});
test('non-square RAW ranks clear candidates by physical pixel travel, retaining deterministic ties and immutable input',async()=>{
 const m=await mod;
 for(const [width,height] of [[200,800],[800,200]]){
  const l=label('a',.5);l.typography.role='quantity';l.position.y=.5;l.anchor.y=.5;l.typography.bounds={x:.49,y:.49,w:.02,h:.02};
  const data=new Uint8ClampedArray(width*height*4).fill(255),plan={frozen:true,labels:[l]},measurements=[{id:'a',glyphBounds:{...l.typography.bounds}}];
  // Block original location with one actual pixel. Nearest clear move must prefer the physically shorter axis.
  data.set([0,0,0,255],(Math.floor(height*.5)*width+Math.floor(width*.5))*4);
  const before=Buffer.from(data),args={plan,measurements,raster:{width,height,data}},p=m.buildLabelPlacementCandidates(args),first=p.groups[0].candidates[0];
  if(width<height)assert.ok(Math.abs(first.dx)>Math.abs(first.dy),'tall frame moves horizontally first');
  else assert.ok(Math.abs(first.dy)>Math.abs(first.dx),'wide frame moves vertically first');
  const distances=p.groups[0].candidates.map(c=>Math.hypot(c.dx*width,c.dy*height));assert.deepEqual([...distances].sort((a,b)=>a-b),distances);
  assert.deepEqual(m.buildLabelPlacementCandidates(args),p);assert.deepEqual(Buffer.from(data),before);assert.equal(p.policy.version,3);
  if(process.env.PIXEL_DISTANCE_EVIDENCE)require('node:fs').writeFileSync(`${process.env.PIXEL_DISTANCE_EVIDENCE}/pixel-distance-${width}x${height}.json`,JSON.stringify({width,height,policy:p.policy,candidates:p.groups[0].candidates,pixelDistances:distances,rawUnchanged:true},null,2));
 }
});
test('pixel-distance ranking leaves exam and leader placements locked to zero',async()=>{
 const m=await mod,f=fixture();f.raster={width:200,height:800,data:new Uint8ClampedArray(200*800*4).fill(255)};
 const exam=m.buildLabelPlacementCandidates({...f,imageKind:'exam'});assert.equal(exam.groups[0].candidates.length,1);assert.deepEqual([exam.groups[0].candidates[0].dx,exam.groups[0].candidates[0].dy],[0,0]);
 f.plan.labels.forEach(l=>l.mode='leader');const leader=m.buildLabelPlacementCandidates(f);assert.equal(leader.groups[0].candidates.length,1);assert.deepEqual([leader.groups[0].candidates[0].dx,leader.groups[0].candidates[0].dy],[0,0]);
});

// Same production algorithm, one policy-value control; no second ranking implementation.
const unitWeightControl=mod.then(async()=>{
 const fs=require('node:fs'),source=fs.readFileSync(require('node:path').join(__dirname,'../js/ai-label-placement-harness.js'),'utf8');
 return import('data:text/javascript;base64,'+Buffer.from(source.replace('ordinaryTextVerticalWeight:2','ordinaryTextVerticalWeight:1')).toString('base64'));
});
function rowPreferenceFixture(overrides={}) {
 const l={...label('a',.5),...overrides};l.position={x:.5,y:.5};l.anchor={x:.5,y:.5};l.typography={...l.typography,bounds:{x:.49,y:.48,w:.02,h:.04}};
 const r={width:400,height:200,data:new Uint8ClampedArray(400*200*4).fill(255)};r.data.set([0,0,0,255],(100*400+200)*4);
 return {plan:{frozen:true,labels:[l]},measurements:[{id:l.id,glyphBounds:{...l.typography.bounds}}],raster:r};
}
function recordRowEvidence(name,value) {
 if(process.env.ROW_WEIGHT_EVIDENCE)require('node:fs').writeFileSync(`${process.env.ROW_WEIGHT_EVIDENCE}/${name}.json`,JSON.stringify(value,null,2));
}
test('ordinary plain text on non-square RAW favors the source row with weight two versus unit control',async()=>{
 const m=await mod,control=await unitWeightControl,results=[];
 assert.equal(control.LABEL_PLACEMENT_POLICY.ordinaryTextVerticalWeight,1);
 for(const role of ['text','name']) for(const defaults of [false,true]) {
  const f=rowPreferenceFixture({typography:{role}});if(defaults){delete f.plan.labels[0].scope;delete f.plan.labels[0].contentMode;}
  const before=Buffer.from(f.raster.data),planBefore=JSON.stringify(f.plan),measureBefore=JSON.stringify(f.measurements);
  const actual=m.buildLabelPlacementCandidates(f),baseline=control.buildLabelPlacementCandidates(f),first=actual.groups[0].candidates[0],old=baseline.groups[0].candidates[0];
  assert.equal(first.dy,0);assert.ok(Math.abs(first.dx)>0);assert.equal(old.dx,0);assert.ok(Math.abs(old.dy)>0);
  assert.ok(Math.hypot(first.dx*400,first.dy*200)>Math.hypot(old.dx*400,old.dy*200),'longer physical travel is accepted to retain the source row');
  assert.equal(actual.groups[0].candidates.length,3);assert.deepEqual(actual,m.buildLabelPlacementCandidates(f));
  const ink=m.createLabelInkIndex(f.raster),halo=m.LABEL_PLACEMENT_POLICY.halo;
  for(const c of actual.groups[0].candidates){const b=c.glyphs[0].box;assert.equal(ink.count({x:b.x-halo,y:b.y-halo,w:b.w+2*halo,h:b.h+2*halo}),0);assert.equal(b.w,.02);assert.equal(b.h,.04);assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=1&&b.y+b.h<=1);}
  assert.deepEqual(Buffer.from(f.raster.data),before);assert.equal(JSON.stringify(f.plan),planBefore);assert.equal(JSON.stringify(f.measurements),measureBefore);
  results.push({role,defaults,baseline:baseline.groups,weighted:actual.groups,rawUnchanged:true,planUnchanged:true,measurementsUnchanged:true});
 }
 recordRowEvidence('ordinary-weight-control',results);
});
test('formula, graph, quantity and scientific roles keep unit-distance proposals; leaders and exam stay locked',async()=>{
 const m=await mod,control=await unitWeightControl,results=[];
 const variants=[{name:'formula',patch:{contentMode:'formula'}},{name:'graph',patch:{scope:'graph'}},...['quantity','chemical','unit','number','symbol'].map(role=>({name:role,patch:{typography:{role}}})),{name:'leader',patch:{mode:'leader'}},{name:'exam',patch:{},imageKind:'exam'}];
 for(const v of variants){const f=rowPreferenceFixture(v.patch);if(v.imageKind)f.imageKind=v.imageKind;
  const actual=m.buildLabelPlacementCandidates(f),baseline=control.buildLabelPlacementCandidates(f);assert.deepEqual(actual.groups,baseline.groups,v.name);
  if(!['leader','exam'].includes(v.name)){assert.equal(actual.groups[0].candidates[0].dx,0);assert.notEqual(actual.groups[0].candidates[0].dy,0);}
  else assert.equal(actual.groups[0].candidates.length,0,'blocked locked original cannot move');
  results.push({name:v.name,unchanged:true,groups:actual.groups});
 }
 recordRowEvidence('excluded-weight-control',results);
});
test('phrase, reaction and sequence group proposals do not adopt independent-text row weighting',async()=>{
 const m=await mod,control=await unitWeightControl,results=[];
 for(const kind of ['phrase','reaction','sequence']){const f=rowPreferenceFixture(),b={...label('b',.65),position:{x:.65,y:.5},typography:{role:'text',bounds:{x:.64,y:.48,w:.02,h:.04}}};f.plan.labels.push(b);f.plan.relationGroups=[{id:'g',kind,labelIds:['a','b']}];f.measurements.push({id:'b',glyphBounds:{...b.typography.bounds}});
  const actual=m.buildLabelPlacementCandidates(f),baseline=control.buildLabelPlacementCandidates(f);assert.deepEqual(actual.groups,baseline.groups,kind);
  if(kind==='phrase'){assert.equal(actual.groups[0].candidates[0].dx,0);assert.notEqual(actual.groups[0].candidates[0].dy,0);}else assert.equal(actual.groups[0].candidates.length,0);
  results.push({kind,unchanged:true,groups:actual.groups});
 }
 recordRowEvidence('group-weight-control',results);
});
