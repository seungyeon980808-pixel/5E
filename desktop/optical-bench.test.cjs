const {test}=require('node:test'), assert=require('node:assert/strict');
const H=require('./science-objects-harness.cjs'), B=H.bench;
const json=x=>JSON.parse(JSON.stringify(x));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const base={id:'bench-a',type:'apparatus',kind:'optical_bench',x:-70,y:-20,w:140,h:40,strokeWidth:.22,...B.OPTICAL_BENCH_DEFAULTS};
test('physical positions are independent, clamped, and unaffected by printed resizing',()=>{
 const a=B.changeOpticalBench(base,'elementPosition',1.4);
 near(a.sourcePosition,.38);near(a.screenPosition,2.96);near(a.elementPosition,1.4);
 const b=B.changeOpticalBench({...base,...a},'elementScreenDistance',.8);near(b.screenPosition,2.2);
 near(B.changeOpticalBench(base,'screenPosition',100).screenPosition,3.2);
 near(B.changeOpticalBench(base,'railLength',.5).screenPosition,.5);
 assert.deepEqual(json(B.changeOpticalBench(base,'railLength',NaN)),json(B.opticalBenchSettings(base)));
 assert.deepEqual(json(B.opticalBenchSettings({...base,w:280,h:80})),json(B.opticalBenchSettings(base)));
 const p=B.opticalBenchLayout(base).parts[1],q=B.opticalBenchLayout({...base,w:280,h:80}).parts[1];near(q.x-base.x,2*(p.x-base.x));
});
test('part moves with its complete foot/stand/body while the rail and other parts remain unchanged',()=>{
 const render=o=>H.apparatus.renderApparatus(o);
 const all=n=>[n,...n.children.flatMap(all)];
 const a=all(render(base)),b=all(render({...base,elementPosition:1.8}));
 for(const id of ['source','screen'])assert.equal(a.find(n=>n.attrs['data-bench-part']===id).outerHTML,b.find(n=>n.attrs['data-bench-part']===id).outerHTML);
 assert.equal(a.find(n=>n.attrs['data-bench-rail']).outerHTML,b.find(n=>n.attrs['data-bench-rail']).outerHTML);
 const pa=a.find(n=>n.attrs['data-bench-part']==='element'),pb=b.find(n=>n.attrs['data-bench-part']==='element');
 const dx=140*.78*(1.8-.96)/3.2;
 const coord=n=>n.attrs.points.split(' ').map(p=>p.split(',').map(Number));
 pa.children.filter(n=>n.tagName==='polygon').forEach((n,i)=>coord(n).forEach((p,j)=>{const q=coord(pb.children.filter(x=>x.tagName==='polygon')[i])[j];near(q[0]-p[0],dx);near(q[1],p[1]);}));
});
test('rotation maps dragging back to the physical rail coordinate',()=>{
 for(const rotation of [0,35,90,180,-90]){const o={...base,rotation},l=B.opticalBenchLayout(o);for(const value of [0,.38,1.6,3.2]){const p={x:l.axisStart+(l.axisEnd-l.axisStart)*value/3.2,y:19};const world=B.opticalBenchWorldPoint(o,p),local=B.opticalBenchLocalPoint(o,world);near(local.x,p.x);near(local.y,p.y);near(B.opticalBenchPositionAtPoint(o,world),value);}}
});
test('actual project IO preserves both modes and position edits on active/inactive pages',()=>{
 const io=H.io(),pages=[{id:'a',name:'슬릿',objects:[base],guides:[],layers:[{id:1,visible:true}],artboard:{w:160,h:80}},{id:'b',name:'렌즈',objects:[{...base,id:'bench-b',benchMode:'lens',elementPosition:1.5,screenPosition:2.5}],guides:[],layers:[{id:1,visible:true}],artboard:{w:160,h:80}}];
 const loaded=io.prepareLoadedProject(json({version:'0.17',pages,activePageId:'a'}));loaded.active.objects[0].screenPosition=2.4;
 const saved=json(io.serialize({...loaded,objects:loaded.active.objects,guides:[],layers:loaded.active.layers,artboard:loaded.active.artboard}));
 const reopened=io.prepareLoadedProject(saved);near(reopened.pages[0].objects[0].screenPosition,2.4);near(reopened.pages[1].objects[0].elementPosition,1.5);assert.equal(reopened.pages[1].objects[0].benchMode,'lens');
 const old=io.prepareLoadedProject(json({version:'0.17',objects:[{...base,screenPosition:Infinity}],artboard:{w:160,h:80}}));near(old.active.objects[0].screenPosition,2.96);
});
test('inspector creates one undo per committed edit and reflects clamps; locked and blank edits do nothing',()=>{
 const o={...base},s=H.store([o]),section=H.inspector('optical-bench',s),screen=H.field(section,'스크린 위치(m)');
 screen.value='20';screen.fire('change');near(o.screenPosition,3.2);near(Number(screen.value),3.2);assert.equal(s.get().undoStack.length,1);
 screen.value='';screen.fire('change');near(o.screenPosition,3.2);assert.equal(s.get().undoStack.length,1);
 o.locked=true;screen.value='1';screen.fire('change');near(o.screenPosition,3.2);assert.equal(s.get().undoStack.length,1);
 o.locked=false;s.update(x=>x.selectedIds=[]);screen.value='1';screen.fire('change');near(o.screenPosition,3.2);
});
test('edge positions remain inside object bounds and slit mask IDs do not collide',()=>{
 const walk=n=>[n,...n.children.flatMap(walk)];
 for(const benchMode of ['slit','lens'])for(const pos of [0,3.2]){const o={...base,benchMode,sourcePosition:pos,elementPosition:pos,screenPosition:pos},nodes=walk(H.apparatus.renderApparatus(o));assert(!/NaN|Infinity/.test(nodes[0].outerHTML));for(const n of nodes.filter(x=>x.tagName==='polygon'))for(const p of n.attrs.points.split(' ').map(p=>p.split(',').map(Number))){assert(p[0]>=o.x&&p[0]<=o.x+o.w);assert(p[1]>=o.y&&p[1]<=o.y+o.h);}}
 const a=walk(H.apparatus.renderApparatus(base)).find(n=>n.tagName==='mask').attrs.id,b=walk(H.apparatus.renderApparatus({...base,id:'bench-b'})).find(n=>n.tagName==='mask').attrs.id;assert.notEqual(a,b);
});
test('a rotated drag is one undo gesture; cancellation restores the part, and locked objects cannot drag',()=>{
 const o={...base,rotation:90},s=H.store([o]);s.get().activeTool='V';s.get().viewBox={};
 const svg=new H.Element('svg'),win=new H.Element('window');svg.querySelector=()=>null;
 H.load('tools/optical-bench.js',['initOpticalBenchEditing'],{...B,window:win,screenToWorld:(_svg,_vb,x,y)=>({x,y})}).initOpticalBenchEditing(svg,s);
 const fire=(node,name,extra={})=>{const event={button:0,pointerId:7,preventDefault(){},stopImmediatePropagation(){},stopPropagation(){},...extra};for(const f of node.listeners[name]||[])f(event);};
 const start=B.opticalBenchWorldPoint(o,{x:B.opticalBenchLayout(o).parts[1].x,y:18});
 const down=()=>fire(svg,'pointerdown',{target:{dataset:{id:o.id,benchHandle:'elementPosition'}},clientX:start.x,clientY:start.y});
 down();for(let n=1;n<=20;n++)fire(win,'pointermove',{clientX:start.x,clientY:start.y+n});
 const moved=o.elementPosition;assert(moved>.96);assert.equal(s.get().undoStack.length,0);fire(win,'pointerup');assert.equal(s.get().undoStack.length,1);near(s.get().undoStack[0][0].elementPosition,.96);
 down();fire(win,'pointermove',{clientX:start.x,clientY:start.y+10});fire(win,'pointercancel');near(o.elementPosition,moved);assert.equal(s.get().undoStack.length,1);
 o.locked=true;down();fire(win,'pointermove',{clientX:start.x,clientY:start.y+30});fire(win,'pointerup');near(o.elementPosition,moved);assert.equal(s.get().undoStack.length,1);
});
test('real scene/export pipeline emits only apparatus geometry, with bounded content-fit region',()=>{
 const registry=H.load('object-types.js',['SIZE_TYPES','zOrderObjects']);
 const pick=H.load('pick.js',['getObjectBBox'],registry);
 const scene=H.load('render/scene.js',['renderObject'],{...H.core,...H.styles,...H.apparatus});
 const exporter=H.load('svg-export.js',['buildExportSvg','getContentBounds'],{...registry,...pick,...scene,...H.fills});
 const s={objects:[base],layers:[],artboard:{w:160,h:80},selectedIds:[base.id]};
 const svg=exporter.buildExportSvg(s),xml=svg.outerHTML;
 assert.equal(svg.attrs.viewBox,'-80 -40 160 80');assert(!xml.includes('data-bench-handle'));assert(!xml.includes('tabindex'));assert(xml.includes('data-bench-part'));
 for(const rotation of [0,45,90]){const o={...base,rotation},bounds=exporter.getContentBounds({...s,objects:[o]});const cx=o.x+o.w/2,cy=o.y+o.h/2;for(const [x,y] of [[o.x,o.y],[o.x+o.w,o.y],[o.x,o.y+o.h],[o.x+o.w,o.y+o.h]]){const p=B.opticalBenchWorldPoint(o,{x,y});assert(p.x>=bounds.x&&p.x<=bounds.x+bounds.w);assert(p.y>=bounds.y&&p.y<=bounds.y+bounds.h);}}
});
