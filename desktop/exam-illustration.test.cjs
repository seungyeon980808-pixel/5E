const {test}=require('node:test'),assert=require('node:assert/strict');
const H=require('./science-objects-harness.cjs');
const vessel={id:'glass',type:'vessel',kind:'beaker',x:0,y:0,w:28,h:34,liquid:0.4,hasPiston:false,strokeWidth:0.22};
const nodes=root=>{const out=[];const visit=n=>{out.push(n);n.children.forEach(visit);};visit(root);return out;};
test('illustration selection retains old drawings, is undoable, and respects object locks',()=>{
 const o={...vessel},s=H.store([o]),body=H.inspector('vessel',s),old=H.vessel.renderVessel(o).outerHTML;
 const select=H.field(body,'그림 표현');select.value='exam';select.fire('change');assert.notEqual(H.vessel.renderVessel(o).outerHTML,old);assert.equal(s.get().undoStack.length,1);
 assert.equal(H.vessel.renderVessel({...o,illustrationStyle:'diagram'}).outerHTML,old);
 const previous=s.get().undoStack[0][0];assert.equal(H.vessel.renderVessel(previous).outerHTML,old);
 o.locked=true;s.update(()=>{});assert.equal(select.disabled,true);select.value='diagram';select.fire('change');assert.equal(o.illustrationStyle,'exam');
});
test('all illustrated glassware regenerates bounded vector geometry at empty, partial and full volumes',()=>{
 for(const kind of H.illustration.EXAM_VESSEL_KINDS){
  for(const amount of [0,80,200]){
   const o={...vessel,id:'glass-'+kind,kind,illustrationStyle:'exam',fillMode:'volume',capacityMl:200,volumeMl:amount,hasTicks:true,tickStepMl:0.001,showTickNumbers:true,liquid:amount/200};
   const root=H.vessel.renderVessel(o),svg=root.outerHTML;assert(!/NaN|Infinity|<image/.test(svg));
   assert(nodes(root).filter(n=>n.tagName==='text').length<=26);
   assert(nodes(root).filter(n=>n.tagName==='line').length<155);
   const ids=nodes(root).filter(n=>n.attrs.id).map(n=>n.attrs.id);assert.equal(ids.length,new Set(ids).size);
   if(!['u_tube','tank'].includes(kind)){const fluid=nodes(root).filter(n=>n.attrs['data-liquid-volume']!==undefined);assert.equal(fluid.length,amount===0?0:1);}
  }
 }
});
test('illustrated U tube levels and colors are independent and its membrane is an explicit part',()=>{
 const o={...vessel,kind:'u_tube',illustrationStyle:'exam',leftLiquid:0.2,rightLiquid:0.8,rightLiquidColor:'#b7b7b7',hasMembrane:true};
 const get=r=>nodes(r).find(n=>n.attrs['data-liquid-side']==='right');const before=get(H.vessel.renderVessel(o)).outerHTML;
 o.leftLiquid=0.6;assert.equal(get(H.vessel.renderVessel(o)).outerHTML,before);
 const root=H.vessel.renderVessel(o);assert.equal(nodes(root).filter(n=>n.attrs['data-membrane']).length,1);
});
test('tank perspective and partition position redraw separate faces and include the raised handle in bounds',()=>{
 const o={...vessel,kind:'tank',illustrationStyle:'exam',hasPartition:true,partitionAt:0.3,leftLiquid:0.4,rightLiquid:0.6};
 const s=H.store([o]),body=H.inspector('vessel',s),other={...o,id:'other'};s.get().objects.push(other);
 const before=H.vessel.renderVessel(o).outerHTML,depth=H.field(body,'입체 깊이(비율)');depth.value='0.25';depth.fire('change');assert.notEqual(H.vessel.renderVessel(o).outerHTML,before);assert.equal(other.depthRatio,undefined);
 const old=H.vessel.renderVessel(o).outerHTML,pos=H.field(body,'칸막이 위치');pos.value='0.7';pos.fire('change');assert.notEqual(H.vessel.renderVessel(o).outerHTML,old);
 const root=H.vessel.renderVessel(o),handle=nodes(root).find(n=>n.attrs['data-partition-handle']);const b=H.vessel.vesselBBox(o);assert(b.y<=Number(handle.attrs.y));
});
test('rotating the burette valve changes its drawing and the sweep fits its export box',()=>{
 const o={...vessel,kind:'burette',illustrationStyle:'exam',w:10,h:45};const before=H.vessel.renderVessel(o).outerHTML;
 const s=H.store([o]),body=H.inspector('vessel',s),angle=H.field(body,'꼭지 각도');angle.value='90';angle.fire('change');assert.notEqual(H.vessel.renderVessel(o).outerHTML,before);
 const b=H.vessel.vesselBBox(o),cy=o.y+o.h*0.847;assert(b.y<=cy-o.w*0.4);assert(b.y+b.h>=cy+o.w*0.4);
});
test('glass thermometer value and height modes both work after switching back from a stored temperature',()=>{
 const o={id:'thermo',type:'apparatus',kind:'thermometer',x:0,y:0,w:7,h:45,illustrationStyle:'exam',temperatureMode:'value',temperature:80,level:0.2};
 const s=H.store([o]),body=H.inspector('apparatus',s),before=H.apparatus.renderApparatus(o).outerHTML;
 const mode=H.field(body,'온도계 설정');mode.value='height';mode.fire('change');assert.notEqual(H.apparatus.renderApparatus(o).outerHTML,before);
 assert.equal(H.apparatus.renderApparatus(o).outerHTML,H.apparatus.renderApparatus({...o,temperature:undefined}).outerHTML);
 const level=H.field(body,'눈금 높이(0~1)');level.value='0.7';level.fire('change');assert.notEqual(H.apparatus.renderApparatus(o).outerHTML,before);
});
test('chromosome forms and arm angles preserve replication semantics and use the real fill resolver',()=>{
 const o={id:'chr',type:'chromosome',p1:{x:0,y:0},p2:{x:0,y:25},showLabels:false,fillStyle:'black'};
 const s=H.store([o]),body=H.inspector('chromosome',s),form=H.field(body,'염색체 형태');form.value='spread';form.fire('change');
 const root=H.chromosome.renderChromosome(o);assert(root.outerHTML.includes('#0f0f0f'));
 const signs=r=>new Set(nodes(r).filter(n=>n.attrs['data-chromatid']!==undefined).map(n=>n.attrs['data-chromatid']));assert.equal(signs(root).size,2);
 const old=H.chromosome.chromosomeBBox(o),angle=H.field(body,'염색분체 벌림(°)');angle.value='40';angle.fire('change');assert(H.chromosome.chromosomeBBox(o).w>old.w);
 const replica=H.field(body,'복제된 염색체');replica.checked=false;replica.fire('change');assert.equal(signs(H.chromosome.renderChromosome(o)).size,1);
});
test('organic neuron branches redraw without moving endpoints and their control hull is selectable',()=>{
 const o={id:'n',type:'neuron',p1:{x:4,y:6},p2:{x:34,y:26},somaRadius:1.1,dendrites:5,terminals:4};const s=H.store([o]),body=H.inspector('neuron',s);
 const style=H.field(body,'그림 표현');style.value='exam';style.fire('change');const old=H.neuron.renderNeuron(o).outerHTML;
 const count=H.field(body,'가지돌기 수');count.value='9';count.fire('change');assert.notEqual(H.neuron.renderNeuron(o).outerHTML,old);assert.deepEqual(o.p1,{x:4,y:6});assert.deepEqual(o.p2,{x:34,y:26});
 const data=H.illustration.examNeuronGeometry(o,H.neuron.neuronGeometry(o)),b=H.neuron.neuronBBox(o);
 for(const p of data.points)assert(p.x>=b.x-1e-9&&p.x<=b.x+b.w+1e-9&&p.y>=b.y-1e-9&&p.y<=b.y+b.h+1e-9);
});
test('project serialization preserves illustration, depth, chromosome angle and per-object independence',()=>{
 const io=H.io(),objects=[{...vessel,illustrationStyle:'exam'},{...vessel,id:'tank',kind:'tank',illustrationStyle:'exam',depthRatio:0.22,hasPartition:true,partitionAt:0.7,leftLiquid:0.3,rightLiquid:0.8},{id:'c',type:'chromosome',chromosomeForm:'spread',spreadAngle:33,fillStyle:'black',replicated:true,p1:{x:0,y:0},p2:{x:0,y:22}}];
 const loaded=io.prepareLoadedProject({version:'0.17',objects,layers:[],guides:[],artboard:{w:190,h:260}});
 const saved=JSON.parse(JSON.stringify(io.serialize({...loaded,objects:loaded.active.objects,layers:loaded.active.layers,guides:[],artboard:loaded.active.artboard})));
 const reopened=io.prepareLoadedProject(saved);assert.equal(reopened.active.objects[1].depthRatio,0.22);assert.equal(reopened.active.objects[2].spreadAngle,33);assert.equal(reopened.active.objects[0].illustrationStyle,'exam');
 reopened.active.objects[0].x+=8;assert.equal(reopened.active.objects[1].x,0);
});
