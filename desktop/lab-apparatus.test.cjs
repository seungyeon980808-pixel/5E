const {test}=require('node:test'),assert=require('node:assert/strict'),H=require('./science-objects-harness.cjs'),L=H.lab;
const json=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const base=kind=>{const [w,h]=L.LAB_APPARATUS[kind].box;return {id:kind,type:'apparatus',kind,x:-w/2,y:-h/2,w,h,layerId:1,rotation:0,strokeWidth:.22,...L.labSettings({kind,w,h})};};
const walk=n=>[n,...n.children.flatMap(walk)];
test('approved apparatus only: seven new presets and existing digital scale, no unapproved fixture',()=>{
 assert.deepEqual(Object.values(L.LAB_APPARATUS).filter(d=>d.number).map(d=>d.number),[2,5,6,8,9,10,13,18]);
 const t=H.load('templates.js',['TEMPLATES'],{...L,DEFAULT_TEXT_SIZE_MM:3,renderObject:()=>null,getSvgAsset:()=>null}).TEMPLATES;
 for(const kind of Object.keys(L.LAB_APPARATUS).filter(k=>L.LAB_APPARATUS[k].number))assert.equal(t[kind].create.kind,kind);
 for(const kind of ['joule','beam','motor_load','phototube_experiment'])assert(!t[kind]);
});
test('cart loads travel together; gate and rail do not change when cart position/count changes',()=>{
 const o=base('cart_track'),a=walk(H.apparatus.renderApparatus(o)),b=walk(H.apparatus.renderApparatus({...o,cartPosition:1.2,boxCount:6}));
 for(const role of ['rail','gate','sensor'])assert.equal(a.find(n=>n.attrs['data-lab-part']===role).outerHTML,b.find(n=>n.attrs['data-lab-part']===role).outerHTML);
 assert.equal(b.filter(n=>Object.hasOwn(n.attrs,'data-lab-load')).length,6);
 const c=b.find(n=>n.attrs['data-lab-part']==='cart');assert.equal(walk(c).filter(n=>Object.hasOwn(n.attrs,'data-lab-load')).length,6);
 const shortened=L.changeLabApparatus({...o,cartPosition:1.9},'railLength',.5);near(shortened.cartPosition,.5);near(shortened.gatePosition,.5);
});
test('each coil turn count redraws independently and survives mode change',()=>{
 const o=base('transformer'),a=H.apparatus.renderApparatus(o).outerHTML,b=H.apparatus.renderApparatus({...o,primaryTurns:14}).outerHTML;assert.notEqual(a,b);
 const s=L.changeLabApparatus(o,'primaryTurns',14);assert.equal(s.primaryTurns,14);assert.equal(s.secondaryTurns,6);
 assert.equal(L.changeLabApparatus({...o,...s},'coilMode','air').primaryTurns,14);
});
test('pendulum fixed pivot, angle and length are separate; extreme settings have complete dynamic bounds',()=>{
 const o=base('pendulum_rig'),a=L.labLayout(o),b=L.labLayout({...o,stringLength:25});near(a.pivot.x,b.pivot.x);near(a.pivot.y,b.pivot.y);near(a.unit,b.unit);
 near(Math.sqrt((b.bob.x-b.pivot.x)**2+(b.bob.y-b.pivot.y)**2-b.eccentricity**2),25*b.stringUnit);
 for(const angle of [-75,0,75])for(const stringLength of [5,80]){const l=L.labLayout({...o,angle,stringLength});const bb=L.labBBox({...o,angle,stringLength});assert(l.bob.x-l.bobRadius>=bb.x);assert(l.bob.x+l.bobRadius<=bb.x+bb.w);assert(l.bob.y+l.bobRadius<=bb.y+bb.h);}
 // The author chooses support height and string length independently. Export
 // bounds include the resulting bob instead of silently shortening the string.
 const low=L.labSettings({...o,pivotHeight:30,bobSize:10,stringLength:80});assert.equal(low.stringLength,80);
});
test('spring balance reading and extension are independent; weights remain attached at zero and eight',()=>{
 const o=base('spring_balance'),s=L.changeLabApparatus(o,'extension',80);assert.equal(s.reading,10);
 near(L.changeLabApparatus({...o,reading:50},'scaleMax',5).reading,5);
 for(const weightCount of [0,8]){const xml=H.apparatus.renderApparatus({...o,weightCount,extension:100,topString:18,caseHeight:110}).outerHTML;assert(!/NaN|Infinity/.test(xml));}
});
test('scale accepts units and zero, piston keeps exact stable particle count below piston at extremes',()=>{
 const o=base('scale');assert(H.apparatus.renderApparatus({...o,displayText:'0.00 N'}).outerHTML.includes('0.00 N'));
 for(const pistonHeight of [12,92])for(const particleCount of [0,1,100]){
   const p=base('piston_gas'),l=L.labLayout({...p,pistonHeight,particleCount,motionMode:'arrows'});
   assert.equal(l.particles.length,particleCount);assert.deepEqual(json(l.particles),json(L.labLayout({...p,pistonHeight,particleCount}).particles));
   for(const a of l.particles){assert(a.x-a.r>=l.left);assert(a.x+a.r<=l.right);assert(a.y-a.r>=l.top);assert(a.y+a.r<=l.bottom);const ex=a.x+Math.cos(a.angle)*(a.r+a.length),ey=a.y+Math.sin(a.angle)*(a.r+a.length);assert(ex>=l.left&&ex<=l.right&&ey>=l.top&&ey<=l.bottom);}
   const nodes=walk(H.apparatus.renderApparatus({...p,pistonHeight,particleCount,motionMode:'arrows'}));assert.equal(nodes.filter(n=>Object.hasOwn(n.attrs,'data-gas-particle')).length,particleCount);
 }
});
test('ring radius changes around a stable center, and center is a real endpoint snap anchor',()=>{
 const o=base('metal_ring'),next={...o,...L.changeLabApparatus(o,'radius',30)};assert.deepEqual(json(L.labRingCenter(o)),json(L.labRingCenter(next)));near(next.w,60);near(next.h,60);
 const R=H.load('object-types.js',['SHAPE_TYPES','SNAP_EDGE_TARGET_TYPES','SNAP_LINE_LIKE_TYPES']);
 const snap=H.load('snap.js',['collectPrioritySnapPoints','resolveEndpointSnap'],{...R,...L,rotPt:()=>{},singleObjBBox:()=>{}});
 const state={get:()=>({objects:[{...o,rotation:47}],layers:[{id:1,visible:true}]})};const points=snap.collectPrioritySnapPoints(state,[]);assert.equal(points.length,1);assert.equal(points[0].pointKey,'center');near(points[0].x,0);near(points[0].y,0);const attached=snap.resolveEndpointSnap({x:.1,y:.2},[],6,state);assert.equal(attached.attach,true);near(attached.target.x,0);near(attached.target.y,0);assert.equal(snap.resolveEndpointSnap({x:.1,y:.2},[o.id],6,state),null);
 for(const closedAngle of [1,90,180,359,360])assert(!/NaN|Infinity/.test(H.apparatus.renderApparatus({...o,closedAngle}).outerHTML));
});
test('centripetal radius and angle determine string geometry; mass labels and orbit controls are independent',()=>{
 const o=base('circular_motion');for(const angle of [10,30,60,90]){const l=L.labLayout({...o,angle,orbitRadius:30});near(l.stringLength*Math.sin(angle*Math.PI/180),30);near((l.orbit.y-l.pivot.y)/l.unit,30/Math.tan(angle*Math.PI/180));const bb=L.labBBox({...o,angle,orbitRadius:30});assert(l.orbit.x-l.orbit.rx>=bb.x);assert(l.orbit.y+l.orbit.ry<=bb.y+bb.h);}
 assert(!H.apparatus.renderApparatus({...o,showOrbit:false}).outerHTML.includes('data-orbit-line'));
 assert.notEqual(H.apparatus.renderApparatus({...o,orbitDirection:'cw'}).outerHTML,H.apparatus.renderApparatus({...o,orbitDirection:'ccw'}).outerHTML);
 const s=L.changeLabApparatus(o,'lowerMass',200);near(s.upperMass,20);near(s.orbitRadius,30);
});
test('inspector commits one undo, keeps neighbors, clamps counts and refuses locked/blank edits',()=>{
 for(const kind of Object.keys(L.LAB_APPARATUS).filter(k=>L.LAB_APPARATUS[k].number)){
   const o=base(kind),other=base('scale');other.id='untouched';const state=H.store([o,other]),before=JSON.stringify(other),section=H.inspector('lab',state),def=L.LAB_APPARATUS[kind].fields.find(f=>f.type==='number')||L.LAB_APPARATUS[kind].fields[0],input=walk(section).find(n=>n.className==='insp-row'&&n.style.display!=='none'&&n.children[0]?.textContent===def.label).children[1];
   input.value=def.type==='text'?'2.50 N':String(def.value+1);input.fire('change');assert.equal(state.get().undoStack.length,1,kind);assert.equal(JSON.stringify(other),before);
   input.fire('change');assert.equal(state.get().undoStack.length,1,kind);
   o.locked=true;input.value='25';input.fire('change');assert.equal(state.get().undoStack.length,1,kind);
 }
});
test('actual project IO keeps all eight active/inactive pages and export uses native vector geometry',()=>{
 const pages=Object.keys(L.LAB_APPARATUS).filter(k=>L.LAB_APPARATUS[k].number).map(kind=>({id:kind,name:kind,objects:[base(kind)],artboard:{w:180,h:130},layers:[{id:1,visible:true}],guides:[]})),io=H.io(),data=io.prepareLoadedProject(json({version:'0.17',pages,activePageId:pages[0].id}));
 const saved=json(io.serialize({...data,objects:data.active.objects,artboard:data.active.artboard,layers:data.active.layers,guides:[]})),reopened=io.prepareLoadedProject(saved);
 for(let i=0;i<8;i++)assert.deepEqual(json(L.labSettings(reopened.pages[i].objects[0])),json(L.labSettings(pages[i].objects[0])));
 const registry=H.load('object-types.js',['SIZE_TYPES','zOrderObjects']),pick=H.load('pick.js',['getObjectBBox'],registry),scene=H.load('render/scene.js',['renderObject'],{...H.core,...H.styles,...H.apparatus}),ex=H.load('svg-export.js',['buildExportSvg','getContentBounds'],{...registry,...pick,...scene,...H.fills});
 for(const page of pages){const svg=ex.buildExportSvg(page);assert(svg.outerHTML.includes('data-lab-kind'));assert(!svg.outerHTML.includes('data-ui'));assert(!svg.outerHTML.includes('<image'));assert(!/NaN|Infinity/.test(svg.outerHTML));}
});
