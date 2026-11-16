const {test}=require('node:test'),assert=require('node:assert/strict'),H=require('./science-objects-harness.cjs'),L=H.lab;
const base={id:'cart',type:'apparatus',kind:'cart_track',x:-55,y:-18,w:110,h:36,strokeWidth:.18,layerId:1,lockAspect:true};
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`),walk=n=>[n,...n.children.flatMap(walk)],clone=v=>JSON.parse(JSON.stringify(v));
test('resizing and moving the cart keeps rendered wheel contact on the fixed front rail',()=>{
 for(const cartSize of [60,100,140])for(const cartPosition of [0,.8,2]){
  const o={...base,cartSize,cartPosition},l=L.labLayout(o),nodes=walk(H.apparatus.renderApparatus(o));
  const wheels=nodes.filter(n=>n.attrs['data-cart-wheel']==='outer');assert.equal(wheels.length,2);
  for(const n of wheels)near(Number(n.attrs.cy)+Number(n.attrs.r),l.rails.front);
  assert(l.cart.bottom>l.cart.deck);assert(l.cart.deck>l.cart.wallTop);
  assert.deepEqual(clone(l.rails),clone(L.labLayout(base).rails));
 }
});
test('stacked loads rest on the cart or preceding row at every supported size and count',()=>{
 for(const cartSize of [60,100,140])for(let boxCount=0;boxCount<=6;boxCount++){
  const o={...base,cartSize,boxCount},l=L.labLayout(o),c=l.cart;
  const boxes=walk(H.apparatus.renderApparatus(o)).filter(n=>Object.hasOwn(n.attrs,'data-lab-load'));
  assert.equal(boxes.length,boxCount);
  for(const b of c.loads){
   const support=b.index<2?c.deck+c.depth.y*.2:c.loads[b.index-2].y;
   near(b.y+b.h,support);
   assert(b.x>=c.left+c.wallWidth);assert(b.x+b.w<=c.left+c.width-c.wallWidth);
  }
 }
});
test('the gate has two full legs and a visible open window that stays open when moved',()=>{
 for(const gatePosition of [0,1,2]){
  const o={...base,gatePosition},gate=walk(H.apparatus.renderApparatus(o)).find(n=>n.attrs['data-lab-part']==='gate');
  const front=gate.children.find(n=>n.attrs['data-gate-leg']==='front'),back=gate.children.find(n=>n.attrs['data-gate-leg']==='back');
  assert(front&&back);near(Number(front.attrs.height),Number(back.attrs.height));
  assert(Number(back.attrs.x)>Number(front.attrs.x)+Number(front.attrs.width));
  // Between the lower legs, neither beam polygon can fill the open window.
  const lower=Math.min(Number(front.attrs.y)+Number(front.attrs.height),Number(back.attrs.y)+Number(back.attrs.height));
  for(const n of gate.children.filter(n=>n.tagName==='polygon')){
   const ys=n.attrs.points.split(' ').map(p=>Number(p.split(',')[1]));assert(Math.max(...ys)<lower);
  }
 }
});
test('extreme positions, load counts and cart sizes stay inside the dynamic drawing bounds',()=>{
 for(const cartPosition of [0,2])for(const gatePosition of [0,2])for(const sensorPosition of [0,2])for(const cartSize of [60,140])for(const boxCount of [0,6]){
  const o={...base,cartPosition,gatePosition,sensorPosition,cartSize,boxCount},b=L.labBBox(o);
  for(const n of walk(H.apparatus.renderApparatus(o))){
   let points=[];
   if(n.tagName==='polygon')points=n.attrs.points.split(' ').map(p=>p.split(',').map(Number));
   if(n.tagName==='rect')points=[[+n.attrs.x,+n.attrs.y],[+n.attrs.x + +n.attrs.width,+n.attrs.y + +n.attrs.height]];
   if(n.tagName==='circle')points=[[+n.attrs.cx - +n.attrs.r,+n.attrs.cy - +n.attrs.r],[+n.attrs.cx + +n.attrs.r,+n.attrs.cy + +n.attrs.r]];
   for(const[x,y]of points)assert(x>=b.x-1e-8&&x<=b.x+b.w+1e-8&&y>=b.y-1e-8&&y<=b.y+b.h+1e-8,`${n.tagName} exceeds bounds`);
  }
 }
});
test('cart inspector changes, rotated handle movement and real project reopen preserve independent controls',()=>{
 const o={...base,...L.labSettings(base),rotation:25},neighbor={...base,id:'neighbor',x:120},state=H.store([o,neighbor]);
 const section=H.inspector('lab',state),input=H.field(section,'수레 위 상자 수'),old=JSON.stringify(neighbor);
 input.value='6';input.fire('change');assert.equal(o.boxCount,6);assert.equal(state.get().undoStack.length,1);assert.equal(JSON.stringify(neighbor),old);
 const p=L.labHandles(o)[0],world=L.labWorldPoint(o,p),end=L.labWorldPoint(o,{x:p.x+8,y:p.y});
 const moved=L.labHandleChange(o,'cartPosition',L.labLocalPoint(o,world),L.labLocalPoint(o,end));
 assert(moved.cartPosition>o.cartPosition);near(moved.gatePosition,o.gatePosition);near(moved.sensorPosition,o.sensorPosition);
 const io=H.io(),page={id:'cart',objects:[{...o,...moved},neighbor],artboard:{w:300,h:100},layers:[{id:1,visible:true}],guides:[]};
 const d=io.prepareLoadedProject(clone({version:'0.17',pages:[page],activePageId:'cart'})),saved=io.serialize({...d,objects:d.active.objects,artboard:d.active.artboard,layers:d.active.layers,guides:[]}),r=io.prepareLoadedProject(clone(saved));
 assert.deepEqual(clone(L.labSettings(r.active.objects[0])),clone(moved));
});
