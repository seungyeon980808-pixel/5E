const {test}=require('node:test'),assert=require('node:assert/strict'),H=require('./science-objects-harness.cjs'),P=H.physics,L=H.lab;
const json=v=>JSON.parse(JSON.stringify(v)),near=(a,b,eps=1e-7)=>assert(Math.abs(a-b)<eps,`${a} ≠ ${b}`);
const base=kind=>{const [w,h]=P.PHYSICS_TOOLS[kind].box;return{id:kind,type:'apparatus',kind,x:10,y:10,w,h,rotation:0,layerId:1,strokeWidth:.22,lockAspect:true,...P.physicsSettings({kind})};};
const walk=n=>[n,...n.children.flatMap(walk)];
test('projectile: known range/apex, raised and vertical launch, time stops at impact',()=>{
 const s={...base('projectile_motion'),speed:10,launchAngle:45,gravity:10,time:1,initialHeight:0};const a=P.projectileState(s);near(a.range,10);near(a.apex,2.5);near(a.flight,Math.sqrt(2));near(P.projectileState(s,a.flight).y,0);
 const b=P.projectileState({...s,launchAngle:90,initialHeight:5},100);near(b.x,0);near(b.y,0);near(b.flight,1+Math.sqrt(2));near(b.apex,10);
 near(P.physicsSettings({...s,time:100}).time,a.flight);near(P.projectileState({...s,launchAngle:0}).range,0);
 const x=P.projectileState({...s,launchAngle:135});near(x.range,-10);
 const o={...base('projectile_motion'),speed:100,span:5},box=P.physicsBBox(o),l=P.physicsLayout(o);assert(box.w>o.w);assert(box.y<o.y);assert(l.bob.x<box.x+box.w);
});
test('circular wave spacing and time/phase shift are physically linked',()=>{
 const s={...base('circular_wave'),wavelength:2,frequency:2,waveTime:.125};const a=P.waveRadii(s,0,20);near(a.crest[0],.5);near(a.crest[1]-a.crest[0],2);near(a.trough[0]-a.crest[0],1);
 near(P.waveRadii({...s,waveTime:0},90,20).crest[0],.5);assert.deepEqual(json(P.waveRadii({...s,waveTime:.625},0,20)),json(a));
});
test('ray: Snell law at each parallel interface, emergent direction preserved',()=>{
 const m=[{n:1.5,points:[[30,0],[60,0],[60,100],[30,100]]},{n:1.33,points:[[60,0],[80,0],[80,100],[60,100]]}];
 const result=P.traceRefraction([10,80],[Math.cos(Math.PI/6),-Math.sin(Math.PI/6)],m);assert.equal(result.status,'exit');assert.equal(result.events.length,3);
 for(const e of result.events){assert(!e.tir);near(e.n1*Math.sin(e.incident*Math.PI/180),e.n2*Math.sin(e.refracted*Math.PI/180));}
 near(result.events[0].incident,30);near(result.events[0].refracted,Math.asin(1/3)*180/Math.PI);
 const last=result.segments.at(-1),dx=last.b[0]-last.a[0],dy=last.b[1]-last.a[1];near(Math.atan2(-dy,dx),Math.PI/6);
 const normal=P.traceRefraction([10,50],[1,0],m);for(const e of normal.events){near(e.incident,0);near(e.refracted,0);}
});
test('ray: total internal reflection, critical angle, overlapping-medium priority and vertex ambiguity',()=>{
 const region={n:1.5,points:[[30,0],[80,0],[80,100],[30,100]]};const a=P.traceRefraction([75,30],[.5,Math.sqrt(3)/2],[region]);assert(a.events.some(e=>e.tir));const e=a.events.find(e=>e.tir);near(e.incident,60);assert.equal(e.refracted,null);
 const ca=Math.asin(1/1.5),b=P.traceRefraction([75,30],[Math.cos(ca),Math.sin(ca)],[region]);assert.equal(b.events[0].tir,false);near(b.events[0].refracted,90,1e-5);assert(!JSON.stringify(b).includes('null,"n'));
 const overlay={n:2,points:[[40,10],[70,10],[70,90],[40,90]]},c=P.traceRefraction([10,50],[1,0],[region,overlay]);assert.deepEqual(json(c.events.map(e=>[e.n1,e.n2])),[[1,1.5],[1.5,2],[2,1.5],[1.5,1]]);
 const corner=P.traceRefraction([10,10],[1,1],[{n:1.5,points:[[30,30],[70,30],[70,70],[30,70]]}]);assert.equal(corner.status,'corner');
});
test('polygon edits stay simple, medium controls select the correct region, add/delete/vertex persist',()=>{
 const o=base('refraction_scene'),a={...o,...P.changePhysicsTool(o,'selectedMedium',2)},b=P.changePhysicsTool(a,'mediumN',2);near(b.media[0].n,1.5);near(b.media[1].n,2);
 const c=P.physicsAction({...a,...b},'add-medium').settings;assert.equal(c.media.length,3);assert.equal(c.selectedMedium,3);assert.equal(P.physicsAction({...o,...c},'add-vertex').settings.media[2].points.length,5);
 assert.equal(P.physicsAction({...o,...c},'remove-medium').settings.media.length,2);
 const handle=P.physicsHandles(o).find(h=>h.key==='vertex-0'),m=P.physicsHandleChange(o,handle.key,handle,{x:handle.x+8,y:handle.y+5});assert.equal(m.media[0].shape,'polygon');assert.notDeepEqual(json(m.media[0].points),json(o.media[0].points));
 const invalid=P.physicsSettings({...o,media:[{n:1.5,points:[[0,0],[100,100],[0,100],[100,0]]}]});assert.equal(invalid.media.length,0);
});
test('thin lens: real inverted, virtual enlarged, diverging reduced, at focus infinite',()=>{
 const o=base('lens_model');let r=P.thinLens(o);near(r.distance,30);near(r.magnification,-1);near(r.height,-7);
 r=P.thinLens({...o,objectDistance:10});near(r.distance,-30);near(r.magnification,3);assert.equal(r.real,false);
 r=P.thinLens({...o,lensMode:'diverging'});near(r.distance,-10);near(r.magnification,1/3);
 assert.equal(P.thinLens({...o,objectDistance:15}).infinite,true);
 for(const objectDistance of [14.999,15,15.001])assert(!/NaN|Infinity/.test(H.apparatus.renderApparatus({...o,objectDistance}).outerHTML));
});
test('energy to wavelength and spectrum: emission/absorption sign, exact physical conversion, mixed transitions refused',()=>{
 near(P.HC_EV_NM,1239.8419843320026,1e-8);const o={...base('energy_levels'),levelsText:'-13.6, -3.4, -1.51',transitionsText:'3>2'};const d=P.energyData(o);near(d.transitions[0].wavelength,P.HC_EV_NM/1.89);assert(d.transitions[0].emission);
 const a=P.physicsAction(o,'create-spectrum').created;assert.equal(a.spectrumMode,'emission');near(P.spectrumLines(a)[0],d.transitions[0].wavelength,.001);assert(a.lambdaMin<d.transitions[0].wavelength&&a.lambdaMax>d.transitions[0].wavelength);
 assert.equal(P.physicsAction({...o,transitionsText:'2>3'},'create-spectrum').created.spectrumMode,'absorption');assert(P.physicsAction({...o,transitionsText:'3>2, 2>3'},'create-spectrum').error);
 assert(P.energyData({...o,transitionsText:'9>2, bad'}).invalid);assert.equal(P.physicsAction({...o,transitionsText:'9>2'},'create-spectrum'),null);
});
test('all six tools are added to palette, have native handles and vector export; conditions survive pages/save/reopen',()=>{
 const t=H.load('templates.js',['TEMPLATES'],{...L,DEFAULT_TEXT_SIZE_MM:3,renderObject:()=>null,getSvgAsset:()=>null}).TEMPLATES;
 const pages=Object.keys(P.PHYSICS_TOOLS).map(kind=>({id:kind,name:kind,objects:[base(kind)],artboard:{w:160,h:160},layers:[{id:1,visible:true}],guides:[]}));
 const io=H.io(),data=io.prepareLoadedProject(json({version:'0.17',pages,activePageId:pages[0].id})),saved=json(io.serialize({...data,objects:data.active.objects,artboard:data.active.artboard,layers:data.active.layers,guides:[]})),reopened=io.prepareLoadedProject(saved);
 for(let i=0;i<pages.length;i++){
  const o=pages[i].objects[0];assert.equal(t[o.kind].create.kind,o.kind);assert.deepEqual(json(P.physicsSettings(reopened.pages[i].objects[0])),json(P.physicsSettings(o)));
  const rendered=H.apparatus.renderApparatus(o).outerHTML;assert(rendered.includes('data-physics-kind'));assert(!/NaN|Infinity|<image|data-ui/.test(rendered));assert(P.physicsHandles(o).length>0);
  const handles=new H.Element('g');H.labRender.renderLabApparatusHandles(o,handles,4);assert(walk(handles).some(n=>n.attrs['data-lab-handle']));
 }
});
test('new inspector fields and action make one undo, locked actions do nothing',()=>{
 const o=base('refraction_scene'),state=H.store([o]),section=H.inspector('lab',state),input=H.field(section,'선택 영역 굴절률');input.value='2';input.fire('change');assert.equal(state.get().undoStack.length,1);near(o.media[0].n,2);input.fire('change');assert.equal(state.get().undoStack.length,1);
 const add=walk(section).find(n=>n.dataset.labAction==='add-medium');add.fire('click');assert.equal(o.media.length,3);assert.equal(state.get().undoStack.length,2);o.locked=true;add.fire('click');assert.equal(o.media.length,3);
 const e=base('energy_levels'),es=H.store([e]),sec=H.inspector('lab',es);walk(sec).find(n=>n.dataset.labAction==='create-spectrum').fire('click');assert.equal(es.get().objects.length,2);assert.equal(es.get().undoStack.length,1);assert.equal(es.get().selectedIds[0],es.get().objects[1].id);
});
test('custom handle keyboard and cancelled pointer gesture preserve arrays and undo semantics',()=>{
 const o=base('refraction_scene'),state=H.store([o]);Object.assign(state.get(),{activeTool:'V',viewBox:{},layers:[{id:1,visible:true}]});const svg=new H.Element('svg'),win=new H.Element('window');H.load('tools/lab-apparatus.js',['initLabApparatusEditing'],{...L,window:win,screenToWorld:(_s,_v,x,y)=>({x,y})}).initLabApparatusEditing(svg,state);
 const fire=(node,event,props)=>{for(const f of node.listeners[event]||[])f({button:0,pointerId:7,preventDefault(){},stopImmediatePropagation(){},stopPropagation(){},...props});};const h=P.physicsHandles(o).find(h=>h.key==='vertex-0'),target={dataset:{id:o.id,labHandle:h.key}},before=json(o);
 fire(svg,'pointerdown',{target,clientX:h.x,clientY:h.y});fire(win,'pointermove',{clientX:h.x+5,clientY:h.y+5});assert.notDeepEqual(json(o.media),before.media);fire(win,'pointercancel',{});assert.deepEqual(json(o),before);assert.equal(state.get().undoStack.length,0);
 fire(svg,'keydown',{target,key:'ArrowRight'});assert.equal(state.get().undoStack.length,1);assert.notDeepEqual(json(o.media),before.media);
});
