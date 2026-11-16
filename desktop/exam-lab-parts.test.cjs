const {test}=require('node:test'),assert=require('node:assert/strict');
const H=require('./science-objects-harness.cjs');
const base={id:'part',type:'apparatus',x:0,y:0,w:20,h:30,strokeWidth:0.22};
const nodes=root=>{const out=[];const walk=n=>{out.push(n);n.children.forEach(walk);};walk(root);return out;};
test('six parts are searchable registered presets and their icon settings match placement settings',()=>{
 const calls=[],{TEMPLATES,iconSampleObject,activateTemplate}=H.load('templates.js',['TEMPLATES','iconSampleObject','activateTemplate'],{armSymbol:(...args)=>calls.push(args),CustomEvent:class{constructor(type,init){this.type=type;Object.assign(this,init);}},window:{dispatchEvent:()=>{}}});
 const keys=['lab_stopper','lab_drop_funnel','lab_glass_tube','lab_plate_electrode','lab_stirrer','lab_pipe_valve'];
 for(const id of keys){const def=TEMPLATES[id];assert(!def.hidden);assert(def.keywords.length);const icon=iconSampleObject(id,def);assert.equal(icon.kind,def.create.kind);for(const [key,value]of Object.entries(def.create.props))assert.equal(icon[key],value);activateTemplate(id);const args=calls.at(-1);assert.equal(args[2],def.create.kind);assert.equal(args[3],def.create.props);assert(H.apparatus.renderApparatus({...icon,id}).outerHTML.includes('<path'));}
 const thermo=iconSampleObject('thermometer',TEMPLATES.thermometer);assert.equal(thermo.illustrationStyle,'exam');
});
test('stopper holes are actual transparent apertures, change independently, and respect locks and undo',()=>{
 const o={...base,kind:'rubber_stopper',holeCount:2},other={...o,id:'other'},s=H.store([o,other]),body=H.inspector('apparatus',s);
 const get=r=>nodes(r).filter(n=>n.attrs['data-stopper-hole']);assert.equal(get(H.apparatus.renderApparatus(o)).length,2);assert(H.apparatus.renderApparatus(o).outerHTML.includes('<mask'));
 const holes=H.field(body,'마개 구멍 수');holes.value='3';holes.fire('change');assert.equal(get(H.apparatus.renderApparatus(o)).length,3);assert.equal(other.holeCount,2);assert.equal(s.get().undoStack.length,1);
 o.locked=true;s.update(()=>{});assert.equal(holes.disabled,true);holes.value='0';holes.fire('change');assert.equal(o.holeCount,3);assert.equal(s.get().undoStack.length,1);
 assert.equal(get(H.apparatus.renderApparatus({...o,holeCount:0})).length,0);
});
test('funnel level and valve angle redraw separately without changing a neighboring part',()=>{
 const o={...base,kind:'dropping_funnel',liquid:0,valveAngle:0},other={...base,id:'valve',kind:'pipe_valve'},s=H.store([o,other]),body=H.inspector('apparatus',s);
 const before=H.apparatus.renderApparatus(o).outerHTML,level=H.field(body,'액면 높이(0~1)');level.value='0.8';level.fire('change');assert.notEqual(H.apparatus.renderApparatus(o).outerHTML,before);assert.equal(o.liquid,0.8);assert.equal(other.liquid,undefined);
 const fluid=r=>nodes(r).find(n=>n.attrs['data-liquid-level']);const filled=fluid(H.apparatus.renderApparatus(o)).outerHTML;
 const valve=H.field(body,'밸브 각도(°)');valve.value='90';valve.fire('change');assert.equal(fluid(H.apparatus.renderApparatus(o)).outerHTML,filled);assert.equal(other.valveAngle,undefined);
 const invalid=H.apparatus.renderApparatus({...o,liquid:Infinity,valveAngle:NaN}).outerHTML;assert(!/NaN|Infinity/.test(invalid));
});
test('bend, plate depth and loop controls change their respective part geometry',()=>{
 for(const [kind,label,value,prop]of [['glass_tube','굽힘 높이(비율)',0.6,'bendAt'],['metal_electrode','금속판 두께(비율)',0.2,'depthRatio'],['stirrer','교반 고리 폭(비율)',0.85,'loopRatio']]){
  const o={...base,kind},s=H.store([o]),body=H.inspector('apparatus',s),before=H.apparatus.renderApparatus(o).outerHTML,f=H.field(body,label);assert(f);f.value=String(value);f.fire('change');assert.equal(o[prop],value);assert.notEqual(H.apparatus.renderApparatus(o).outerHTML,before);assert.equal(s.get().undoStack.length,1);
 }
});
test('extended funnel stems and a return leg can pass through a separate stopper without stretching the bulb',()=>{
 const o={...base,kind:'dropping_funnel',h:65,funnelBodyRatio:1,liquid:0.5};
 const s=H.store([o]),body=H.inspector('apparatus',s),previous=H.apparatus.renderApparatus(o).outerHTML,f=H.field(body,'깔때기 본체 높이(비율)');f.value='0.4';f.fire('change');assert.equal(o.funnelBodyRatio,.4);assert.notEqual(H.apparatus.renderApparatus(o).outerHTML,previous);
 const tube={...base,kind:'glass_tube',tubeRoute:'elbow'},ts=H.store([tube]),tb=H.inspector('apparatus',ts),old=H.apparatus.renderApparatus(tube).outerHTML;
 const route=H.field(tb,'관 형태');route.value='bridge';route.fire('change');const inlet=H.field(tb,'입구 쪽 다리 길이(비율)');inlet.value='.6';inlet.fire('change');assert.equal(tube.tubeRoute,'bridge');assert.equal(tube.inletDepth,.6);assert.notEqual(H.apparatus.renderApparatus(tube).outerHTML,old);
});
test('parts use isolated definitions and preserve vessel-free component scope',()=>{
 const ids=[];
 for(const kind of H.labParts.EXAM_LAB_PART_KINDS)for(const index of [0,1]){
  const o={...base,id:kind+index,kind,liquid:0.5,valveAngle:90,holeCount:2},root=H.apparatus.renderApparatus(o),svg=root.outerHTML;
  assert(!/<image|<text|NaN|Infinity/.test(svg));assert.equal(nodes(root).filter(n=>n.tagName==='g'&&n.attrs['data-valve-angle']).length,['dropping_funnel','pipe_valve'].includes(kind)?1:0);
  ids.push(...nodes(root).filter(n=>n.attrs.id).map(n=>n.attrs.id));
 }
 assert.equal(ids.length,new Set(ids).size);
});
test('assembled parts survive real project serialization and can be moved or resized independently',()=>{
 const io=H.io(),objects=Array.from(H.labParts.EXAM_LAB_PART_KINDS,(kind,i)=>({...base,id:'part-'+i,kind,holeCount:3,taper:.22,bendAt:.6,tubeWidthRatio:.12,liquid:.7,valveAngle:85,depthRatio:.18,loopRatio:.8,tubeRoute:'bridge',inletDepth:.5,funnelBodyRatio:.4}));
 const loaded=io.prepareLoadedProject({version:'0.17',objects,layers:[],guides:[],artboard:{w:190,h:260}});
 const saved=JSON.parse(JSON.stringify(io.serialize({...loaded,objects:loaded.active.objects,layers:loaded.active.layers,guides:[],artboard:loaded.active.artboard}))),reopened=io.prepareLoadedProject(saved);
 for(let i=0;i<objects.length;i++)for(const field of ['kind','holeCount','taper','bendAt','tubeWidthRatio','liquid','valveAngle','depthRatio','loopRatio','tubeRoute','inletDepth','funnelBodyRatio'])assert.equal(reopened.active.objects[i][field],objects[i][field]);
 reopened.active.objects[0].x=19;reopened.active.objects[0].w=10;assert.equal(reopened.active.objects[1].x,0);assert.equal(reopened.active.objects[1].w,20);
});
