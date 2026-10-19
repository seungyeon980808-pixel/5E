const {test}=require('node:test'), assert=require('node:assert/strict');
const H=require('./science-objects-harness.cjs'), G=H.geometry;
const json=x=>JSON.parse(JSON.stringify(x)), near=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<eps,`${a} ≠ ${b}`);
const base={id:'v',type:'vessel',kind:'beaker',x:0,y:0,w:30,h:40,liquid:0.4};
test('glassware volume calibration matches cylinder and analytical conical-frustum volume',()=>{
 near(G.heightAtVolumeFraction('beaker',0.4),0.4);
 // ∫ width(z)^2 dz, bottom to z=13, versus complete flask (26 units).
 const expected=((23**3-(23-15*13/18)**3)/2.5)/5174;
 near(G.volumeFractionAtHeight('flask',0.5),expected,2e-6);
 assert(G.heightAtVolumeFraction('flask',0.5)<0.4);
 for(const kind of G.VOLUME_KINDS){let previous=-1;for(let i=0;i<=100;i++){const f=i/100,h=G.heightAtVolumeFraction(kind,f);assert(h>=previous);near(G.volumeFractionAtHeight(kind,h),f,1e-9);previous=h;}}
});
test('empty/full and impossible stored values remain bounded, without ghost liquid',()=>{
 for(const volumeMl of [0,200,-10,900]){const o={...base,fillMode:'volume',capacityMl:200,volumeMl};const f=G.vesselFill(o);assert(f.height>=0&&f.height<=1);const svg=H.vessel.renderVessel(o).outerHTML;assert(!/NaN|Infinity/.test(svg));if(volumeMl<=0)assert(!svg.includes('fill="#d9dcdf"'));}
 const marks=G.scaleMarks(-20,100,0.00001,12);assert(marks.length<=13);assert.equal(marks[0],-20);assert.equal(marks.at(-1),100);
});
test('U tube and tank have genuinely independent liquid geometry and colors',()=>{
 for(const kind of ['u_tube','tank']){const o={...base,kind,hasPartition:true,leftLiquid:0.2,rightLiquid:0.8,rightLiquidColor:'#abc123'};const a=H.vessel.renderVessel(o),rects=a.children.filter(x=>x.attrs['data-liquid-side']);assert.equal(rects.length,2);assert(Number(rects[0].attrs.y)>Number(rects[1].attrs.y));assert.equal(rects[1].attrs.fill,'#abc123');const old=rects[1].outerHTML;o.leftLiquid=0.5;const b=H.vessel.renderVessel(o);assert.equal(b.children.find(x=>x.attrs['data-liquid-side']==='right').outerHTML,old);}
});
test('calibrated burette numbers increase downwards; new shapes and attachments have bounds',()=>{
 const o={...base,kind:'burette',capacityMl:50,tickStepMl:10,hasTicks:true,showTickNumbers:true};const n=H.vessel.renderVessel(o).children.filter(x=>x.tagName==='text');assert.equal(n[0].textContent,'0');assert.equal(n.at(-1).textContent,'50');assert(Number(n[0].attrs.y)<Number(n.at(-1).attrs.y));
 for(const kind of H.vessel.VESSEL_KINDS){const obj={...base,kind,hasStopcock:true,valveAngle:90,hasPiston:true,hasWeight:true,pistonAt:1};const b=H.vessel.vesselBBox(obj);assert(b.y<obj.y);assert(b.h>obj.h);assert(!/NaN|Infinity/.test(H.vessel.renderVessel(obj).outerHTML));}
});
test('vessel inspector edits are undoable, clamp capacity, keep another object, and respect locks',()=>{
 const state=H.store([{...base}, {...base,id:'other'}]);const body=H.inspector('vessel',state);
 const mode=H.field(body,'액체 설정');mode.value='volume';mode.fire('change');near(state.get().objects[0].volumeMl,80);
 const amount=H.field(body,'액체량');amount.value='150';amount.fire('change');const capacity=H.field(body,'전체 용량');capacity.value='100';capacity.fire('change');assert.equal(state.get().objects[0].volumeMl,100);assert.equal(state.get().objects[1].volumeMl,undefined);assert.equal(state.get().undoStack.length,3);
 const old=H.vessel.renderVessel(state.get().objects[0]).outerHTML;state.get().objects=state.get().undoStack.pop();assert.notEqual(H.vessel.renderVessel(state.get().objects[0]).outerHTML,old);
 state.get().objects[0].locked=true;const before=json(state.get().objects);amount.value='0';amount.fire('change');assert.deepEqual(json(state.get().objects),before);
});
test('pendulum length/angle hold pivot fixed, survive dragging, and have one undo per edit',()=>{
 const o={id:'p',type:'pendulum',p1:{x:3,y:4},p2:{x:3,y:24},showLengthLabel:false};const s=H.store([o]),body=H.inspector('pendulum',s);
 const angle=H.field(body,'각도(수직 기준 °)');angle.value='30';angle.fire('change');near(o.p2.x,13);near(G.endpointSettings(o,true).length,20);assert.deepEqual(o.p1,{x:3,y:4});
 const length=H.field(body,'길이(mm)');length.value='40';length.fire('change');near(G.endpointSettings(o,true).angle,30);near(G.endpointSettings(o,true).length,40);assert.equal(s.get().undoStack.length,2);
 s.update(()=>{o.p2={x:3,y:14};});assert.equal(Number(length.value),10);assert.equal(Number(angle.value),0);
});
test('spring numeric length changes coil spacing without changing radius/count and respects lock',()=>{
 const o={id:'s',type:'spring',p1:{x:0,y:0},p2:{x:30,y:0},turns:12,radius:2};const s=H.store([o]),body=H.inspector('spring',s),old=H.spring.renderSpring(o).outerHTML;
 const length=H.field(body,'길이(mm)');length.value='12';length.fire('change');assert.notEqual(H.spring.renderSpring(o).outerHTML,old);assert.equal(H.spring.springGeometry(o).turns,12);assert.equal(H.spring.springGeometry(o).radius,2);
 o.locked=true;length.value='60';length.fire('change');near(G.endpointSettings(o).length,12);
});
test('thermometer real value and range redraw column, clamp invalid ranges, and preserve legacy',()=>{
 const o={id:'t',type:'apparatus',kind:'thermometer',x:0,y:0,w:12,h:40,level:0.3};const s=H.store([o]),body=H.inspector('apparatus',s);
 const before=H.apparatus.renderApparatus(o).outerHTML,mode=H.field(body,'온도계 설정');mode.value='value';mode.fire('change');near(G.thermometerScale(o).value,30);
 const t=H.field(body,'온도(°C)');t.value='80';t.fire('change');assert.notEqual(H.apparatus.renderApparatus(o).outerHTML,before);near(G.thermometerScale(o).level,0.8);
 const max=H.field(body,'최댓값(°C)');max.value='50';max.fire('change');assert.equal(o.temperature,50);max.value='-10';max.fire('change');assert.equal(o.temperatureMax,50);
 const legacy={...o,temperature:undefined,temperatureMode:'height',level:0.3};assert.equal(H.apparatus.renderApparatus(legacy).outerHTML,before);
});
test('chromosome replication changes chromatid count and bounds, preserving old files',()=>{
 const o={id:'c',type:'chromosome',p1:{x:0,y:0},p2:{x:0,y:20},showLabels:false};const old=H.chromosome.renderChromosome(o);const count=n=>n.children.find(x=>x.attrs.transform).children.filter(x=>x.tagName==='rect').length;
 assert.equal(count(old),2);const state=H.store([o]),body=H.inspector('chromosome',state),cb=H.field(body,'복제된 염색체');cb.checked=false;cb.fire('change');assert.equal(count(H.chromosome.renderChromosome(o)),1);assert.equal(H.chromosome.chromosomeBBox(o).w,3);o.homologPair=true;assert.equal(count(H.chromosome.renderChromosome(o)),2);
});
test('existing membrane and neuron are native parameter redraws, not stretched bitmaps',()=>{
 for(const [renderer,o,change] of [[H.bilayer.renderBilayer,{id:'b',p1:{x:0,y:0},p2:{x:40,y:0},unitCount:10,proteins:[]},x=>{x.unitCount=18;x.thickness=9;}],[H.neuron.renderNeuron,{id:'n',p1:{x:0,y:0},p2:{x:40,y:0},dendrites:3,terminals:3},x=>{x.dendrites=7;x.terminals=6;}]] ) {const before=renderer(o).outerHTML;change(o);const after=renderer(o).outerHTML;assert.notEqual(before,after);assert(!after.includes('<image'));assert(!/NaN|Infinity/.test(after));}
});
test('actual project loader/serializer retain parameters, independent moves/resizes and inactive pages',()=>{
 const io=H.io(),objs=[{...base,fillMode:'volume',capacityMl:200,volumeMl:80,tickStepMl:20,showTickNumbers:true},{...base,id:'u',kind:'u_tube',leftLiquid:0.3,rightLiquid:0.8,hasMembrane:true},{id:'c',type:'chromosome',replicated:false,p1:{x:0,y:0},p2:{x:0,y:20}},{id:'p',type:'pendulum',p1:{x:0,y:0},p2:{x:10,y:30}},{id:'t',type:'apparatus',kind:'thermometer',x:0,y:0,w:10,h:40,temperatureMode:'value',temperature:25,temperatureMin:-20,temperatureMax:100}];
 const pages=[{id:'a',name:'A',objects:objs,layers:[{id:1,visible:true}],guides:[],artboard:{w:190,h:260}},{id:'b',name:'B',objects:[{...base,id:'inactive',kind:'tank',hasPartition:true,partitionAt:0.7}],layers:[{id:1,visible:true}],guides:[],artboard:{w:190,h:260}}];
 const data=io.prepareLoadedProject(json({version:'0.17',pages,activePageId:'a'}));const untouched=json(data.pages[0].objects.slice(1));data.active.objects[0].x+=8;data.active.objects[0].w*=1.3;data.active.objects[0].volumeMl=120;
 const saved=json(io.serialize({...data,objects:data.active.objects,guides:[],layers:data.active.layers,artboard:data.active.artboard}));const loaded=io.prepareLoadedProject(saved);assert.deepEqual(json(loaded.pages),json(data.pages));assert.deepEqual(json(loaded.pages[0].objects.slice(1)),untouched);assert.equal(loaded.pages[0].objects[0].volumeMl,120);assert.equal(loaded.pages[1].objects[0].partitionAt,0.7);
});
test('real selection and content-fit export include vessel attachments, including rotated vessels',()=>{
 const registry=H.load('object-types.js',['SIZE_TYPES']);
 const pick=H.load('pick.js',['getObjectBBox'],{...registry,vesselBBox:H.vessel.vesselBBox});
 const exporter=H.load('svg-export.js',['getContentBounds'],{getObjectBBox:pick.getObjectBBox,vesselLayout:H.vessel.vesselLayout});
 const o={...base,x:10,y:20,strokeWidth:0.3,hasStopcock:true,valveAngle:90,hasTicks:true,showTickNumbers:true,capacityMl:200};
 const b=pick.getObjectBBox(o);assert(b.x<10);assert(b.y<20);
 const s={objects:[o],layers:[]},plain=exporter.getContentBounds(s);assert(plain.y<=b.y);
 o.rotation=90;const rotated=exporter.getContentBounds(s);
 const cx=o.x+o.w/2,cy=o.y+o.h/2;
 near(rotated.x,cx-(b.y+b.h-cy)-0.15);near(rotated.y,cy+(b.x-cx)-0.15);
 near(rotated.w,b.h+0.3);near(rotated.h,b.w+0.3);
});
