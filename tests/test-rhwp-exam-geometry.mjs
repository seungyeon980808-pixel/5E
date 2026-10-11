import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { RhwpExamBridge } from '../js/rhwp-exam-bridge.js';
const {waitForState}=createRequire(import.meta.url)('./helpers/rhwp-exam.cjs');

const near = (actual, expected, tolerance = 0.00001) => assert.ok(Math.abs(actual-expected) <= tolerance, `${actual} != ${expected}`);
const ref = {sec:0,ppi:2,ci:3,type:'image'};
function fixture({rotation=0,flipH=false,flipV=false,page=0,zoom=1,cellPath,clip=null,emit=()=>{},onBeforeReplace} = {}) {
  const box = {x:113.387,y:132.267,width:226.773,height:113.387};
  const control = {type:'image',secIdx:0,paraIdx:2,controlIdx:3,x:113.4,y:132.3,w:226.8,h:113.4,plane:2,stableIndex:[0,2,3],...(cellPath ? {cellPath} : {})};
  const props = {description:'5e-exam:actual',rotationAngle:rotation,horzFlip:flipH,vertFlip:flipV,cropLeft:300,cropBottom:400};
  const op = {bbox:box,clip,transform:{rotation,horzFlip:flipH,vertFlip:flipV}};
  const target = {closest:() => null};
  const plane = {style:{width:`${800*zoom}px`,top:`${page*1100}px`},dataset:{rhwpRenderedZoom:String(zoom)},getBoundingClientRect:() => ({left:50,top:100,width:800*zoom,height:1100*zoom})};
  const content = {contains:node => node === target,getClientRects:() => [1],getBoundingClientRect:() => ({left:10,top:20}),
    querySelector:selector => selector === `[data-rhwp-overlay-page="${page}"]` ? plane : null,querySelectorAll:() => [plane]};
  const input = {container:{querySelector:() => content,getClientRects:() => [1],getBoundingClientRect:() => ({left:10,top:70}),clientLeft:1,clientTop:2,clientWidth:900,clientHeight:600},viewportManager:{getZoom:() => zoom},virtualScroll:{getPageOffset:n => n*1100},
    cursor:{getSelectedPictureRef:() => ({...ref,ci:999})},pagePointFromClientPoint:(x,y) => ({pageIdx:page,pageX:(x-50)/zoom,pageY:(y-100)/zoom}),
    findPictureAtClick:() => ref,pictureObjectRenderer:{getHandleAtPoint:() => null},tableObjectRenderer:{getHandleAtPoint:() => null}};
  const wasm = {pageCount:page+1,getPageInfo:() => ({width:800,height:1100}),getPageControlLayout:n => ({controls:n === page ? [control] : []}),
    getPictureProperties:() => props,getCellPicturePropertiesByPath:() => props,getPageFlowImageOps:() => JSON.stringify({cacheable:true,images:[op]}),
    getPageLayerTreeObject:() => ({root:{children:[]}})};
  const deps = {wasm,getInputHandler:() => input,eventBus:{on:() => {},emit}};
  const doc = {addEventListener:() => {}};
  const frame = {offsetWidth:1000,offsetHeight:800,clientWidth:996,clientHeight:794,clientLeft:2,clientTop:3,contentDocument:doc,contentWindow:{rhwpStudio:{plugins:{deps}}},
    getBoundingClientRect:() => ({left:200,top:150,width:1000,height:800})};
  const edits = [], bridge = new RhwpExamBridge({element:frame},null,(id,ref) => edits.push({id,ref}),null,onBeforeReplace);
  const eventAt = (x,y) => ({button:0,clientX:50+x*zoom,clientY:100+y*zoom,target,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}});
  return {bridge,edits,input,wasm,frame,content,plane,box,control,props,op,target,eventAt,ref:{...ref,...(cellPath ? {cellPath} : {})}};
}

test('native page status receives current and total page arguments through the host bridge', () => {
  let status;
  const f=fixture({emit:(name,current,total)=>{if(name==='current-page-changed')status=`${current+1} / ${total}`;return 'native-result';}});
  assert.equal(f.bridge.deps.eventBus.emit('current-page-changed',2,5),'native-result');
  assert.equal(status,'3 / 5');
});

test('guarded native document replacement forwards all arguments after saving finishes', async () => {
  let saved=false,finish;
  const delivered=[],payload={fileName:'시험지.hwp'};
  const f=fixture({emit:(...args)=>{assert.ok(saved);delivered.push(args);},onBeforeReplace:()=>new Promise(resolve=>{finish=()=>{saved=true;resolve();};})});
  f.bridge.deps.eventBus.emit('open-document-bytes',payload,'native-extra');
  assert.deepEqual(delivered,[]);finish();await Promise.resolve();
  assert.deepEqual(delivered,[['open-document-bytes',payload,'native-extra']]);
});

test('geometry uses precise paint placement, parent viewport pixels and native transforms, leaving crop to the workspace', () => {
  const f = fixture({rotation:30,flipH:true,page:3,zoom:1.5});
  const g = f.bridge.figureGeometry(f.ref);
  near(g.x,200+2+50+f.box.x*1.5); near(g.y,150+3+100+f.box.y*1.5);
  near(g.w,f.box.width*1.5); near(g.h,f.box.height*1.5);
  assert.equal(g.rotation,30); assert.equal(g.flipH,true); assert.equal(g.flipV,false);
  assert.deepEqual(Object.keys(g).sort(),['x','y','w','h','rotation','flipH','flipV'].sort());
  f.props.cropLeft=9999; assert.deepEqual(f.bridge.figureGeometry(f.ref),g);
  f.props.horzOffset=100000; assert.deepEqual(f.bridge.figureGeometry(f.ref),g);
});

test('quarter turns return the pre-rotation CSS frame; figureRect retains the legacy layout box', () => {
  for (const rotation of [90,-90,270,450]) {
    const f = fixture({rotation,flipV:true}), g = f.bridge.figureGeometry(f.ref);
    near(g.w,f.box.height); near(g.h,f.box.width);
    near(g.x,252+f.box.x+(f.box.width-f.box.height)/2);
    near(g.y,253+f.box.y+(f.box.height-f.box.width)/2);
    assert.equal(g.rotation,rotation); assert.equal(g.flipV,true);
    const r=f.bridge.figureRect(f.ref);near(r.x,252+f.box.x);near(r.y,253+f.box.y);near(r.w,f.box.width);near(r.h,f.box.height);
  }
});

test('nested cell identity is independent of object key order and normalized native aliases', () => {
  const cellPath=[{controlIndex:1,cellIndex:2,cellParaIndex:0},{controlIndex:4,cellIndex:3,cellParaIndex:2}];
  const f=fixture({cellPath});
  assert.ok(f.bridge.figureGeometry({...ref,cellPath:cellPath.map(s=>({cellParaIdx:s.cellParaIndex,cellIdx:s.cellIndex,controlIdx:s.controlIndex}))}));
  assert.equal(f.bridge.figureGeometry({...ref,cellPath:[{controlIndex:1,cellIndex:3,cellParaIndex:0}]}),null);
  assert.equal(f.bridge.figureGeometry(ref),null);
});

test('page placement uses the tagged surface across virtualization, scroll and preview zoom', () => {
  const f=fixture({page:7,zoom:2});
  f.content.querySelectorAll=() => [{...f.plane,style:{top:'0px'},dataset:{rhwpRenderedZoom:'1'}},f.plane];
  const before=f.bridge.figureGeometry({...f.ref,pageIndex:0}); assert.ok(before,'a stale page hint is searched again after reflow');
  f.plane.getBoundingClientRect=() => ({left:-60,top:-200,width:2000,height:2750});
  const after=f.bridge.figureGeometry(f.ref);near(after.w,f.box.width*2.5);near(after.x,142+f.box.x*2.5);
  f.content.querySelector=() => null;f.content.querySelectorAll=() => [];
  assert.equal(f.bridge.figureGeometry(f.ref),null,'no fabricated geometry for an unrendered page');
});

test('camera follows document coordinates when the target page has no rendered surface', () => {
  const f=fixture({page:7,zoom:2});
  f.content.querySelector=() => null;f.content.querySelectorAll=() => [];
  Object.assign(f.input.viewportManager,{getViewportSize:()=>({width:900,height:600}),getScrollX:()=>80,getScrollY:()=>7200});
  Object.assign(f.input.virtualScroll,{getTotalWidth:()=>1600,getPageLeftResolved:()=>10});
  assert.equal(f.bridge.figureGeometry(f.ref),null,'overlays still require a real paint surface');
  const g=f.bridge.cameraFigureGeometry(f.ref);
  near(g.x,200+2+10+1+10+f.box.x*2-80);
  near(g.y,150+3+70+2+7700+f.box.y*2-7200);
  near(g.w,f.box.width*2);near(g.h,f.box.height*2);
  assert.equal(f.bridge.cameraFigureGeometry({...f.ref,ci:999}),null,'missing identities do not produce a camera target');
});

test('iframe borders and uniform parent CSS scaling are converted once', () => {
  const f=fixture();f.frame.getBoundingClientRect=() => ({left:200,top:150,width:1500,height:1200});
  const g=f.bridge.figureGeometry(f.ref);near(g.x,200+(2+50+f.box.x)*1.5);near(g.y,150+(3+100+f.box.y)*1.5);near(g.w,f.box.width*1.5);
});

test('figureViewport excludes chrome/scrollbars and optionally intersects page and full ancestor clipping', () => {
  const f=fixture({clip:{x:130,y:140,width:60,height:30}});
  assert.deepEqual(f.bridge.figureViewport(),{x:213,y:225,w:900,h:600});
  const clip=f.bridge.figureViewport(f.ref);near(clip.x,252+130);near(clip.y,253+140);near(clip.w,60);near(clip.h,30);
  f.input.container.getBoundingClientRect=() => ({left:10,top:430});
  assert.equal(f.bridge.pictureAtEvent(f.eventAt(180,180)),null,'a canvas scrolled under the toolbar is not an event hit');
  f.input.container.getClientRects=() => [];assert.equal(f.bridge.figureViewport(),null);
});

test('non-flow native paint trees provide frame geometry and inherited clipping', () => {
  const f=fixture({rotation:30});f.wasm.getPageFlowImageOps=() => null;
  f.wasm.getPageLayerTreeObject=() => ({root:{kind:'clipRect',clip:{x:150,y:150,width:70,height:60},children:[{ops:[{...f.op,type:'image'}]}]}});
  assert.ok(f.bridge.figureGeometry(f.ref));
  assert.equal(f.bridge.pictureAtEvent(f.eventAt(140,150)),null);
  assert.ok(f.bridge.pictureAtEvent(f.eventAt(180,180)));
});

test('double click edits the picture at the event point and ignores a stale selected ref', () => {
  const f=fixture(),event=f.eventAt(180,180);f.bridge.doubleClick(event);
  assert.equal(f.edits.length,1);assert.equal(f.edits[0].id,'actual');assert.equal(f.edits[0].ref.ci,3);
  assert.equal(event.prevented,true);assert.equal(event.stopped,true);
  const text=f.eventAt(500,400);f.bridge.doubleClick(text);assert.equal(f.edits.length,1);assert.equal(text.prevented,undefined);
});

test('hit test rejects rotated empty corners and accepts the visible extension outside the layout box', () => {
  const f=fixture({rotation:45});f.input.findPictureAtClick=() => null;
  assert.equal(f.bridge.pictureAtEvent(f.eventAt(f.box.x+1,f.box.y+1)),null);
  const cx=f.box.x+f.box.width/2,cy=f.box.y+f.box.height/2;
  assert.ok(f.bridge.pictureAtEvent(f.eventAt(cx+80/Math.sqrt(2),cy+80/Math.sqrt(2))));
});

test('UI, native handles, other objects, missing images, ancestor clipping and page gutters are not edit hits', () => {
  const f=fixture(),event=f.eventAt(180,180);
  for (const selector of ['button','input','textarea','select','a','[role="dialog"]','.table-object-layer']) {
    f.target.closest=() => selector;assert.equal(f.bridge.pictureAtEvent(event),null);
  }
  f.target.closest=() => null;f.input.pictureObjectRenderer.getHandleAtPoint=() => 'rotate';assert.equal(f.bridge.pictureAtEvent(event),null);
  f.input.pictureObjectRenderer.getHandleAtPoint=() => null;f.input.findPictureAtClick=() => ({...ref,type:'shape'});assert.equal(f.bridge.pictureAtEvent(event),null);
  f.input.findPictureAtClick=() => ref;f.control.missing=true;assert.equal(f.bridge.pictureAtEvent(event),null);delete f.control.missing;
  f.op.clip={x:220,y:150,width:20,height:20};assert.equal(f.bridge.pictureAtEvent(event),null);f.op.clip=null;
  assert.equal(f.bridge.pictureAtEvent(f.eventAt(-5,180)),null);
  assert.equal(f.bridge.pictureAtEvent({...event,button:2}),null);
  assert.equal(f.bridge.pictureAtEvent({...event,target:{closest:() => null}}),null);
  f.control.wrap='behindText';f.input.findPictureAtClick=() => null;assert.equal(f.bridge.pictureAtEvent(event),null,'text above a behind-text picture');
});

test('overlapping picture hits use native paint order rather than selected ref', () => {
  const f=fixture(),top={...f.control,controlIdx:8,zOrder:3};
  f.wasm.getPageControlLayout=() => ({controls:[top,f.control]});
  assert.equal(f.bridge.pictureAtEvent(f.eventAt(180,180)).ci,8);
});

test('unavailable, hidden and replaced document geometry fails closed', () => {
  const f=fixture();assert.equal(f.bridge.figureGeometry(null),null);assert.equal(f.bridge.figureGeometry({...ref,type:'shape'}),null);
  f.content.getClientRects=() => [];assert.equal(f.bridge.figureGeometry(ref),null);
  f.wasm.getPageControlLayout=() => {throw Error('document released');};assert.equal(f.bridge.figureRect(ref),null);
  assert.equal(f.bridge.pictureAtEvent(f.eventAt(180,180)),null);
});

// Optional real pinned Studio verification, with no workspace/vendor edits or
// fixture files. Example: RHWP_GEOMETRY_BROWSER=1 PLAYWRIGHT_MODULE=/path/to/playwright node --test tests/test-rhwp-exam-geometry.mjs
const browserEnabled=process.env.RHWP_GEOMETRY_BROWSER === '1';
test('pinned Studio geometry and event hits in real browser engines', {skip:!browserEnabled,timeout:120000}, async t => {
  const require=createRequire(import.meta.url),playwright=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const root=fileURLToPath(new URL('../',import.meta.url));
  const html=`<!doctype html><style>body{margin:0}#host{position:absolute;left:37px;top:43px;width:1100px;height:760px}</style><div id="host"></div><script type="module">
    import {RhwpExamBridge} from '/js/rhwp-exam-bridge.js?v=1.7.0-four-session-integration';
    window.edits=[];window.bridge=await RhwpExamBridge.create('#host',{onEdit:(id,ref)=>window.edits.push({id,ref})});
    await bridge.newDocument();window.ready=true;
  </script>`;
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.woff2':'font/woff2'};
  const server=createServer(async (req,res) => {
    try {
      if(req.url === '/__geometry__'){res.setHeader('Content-Type','text/html');res.end(html);return;}
      const filename=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
      if(!filename.startsWith(root)){res.writeHead(403).end();return;}
      res.setHeader('Content-Type',types[path.extname(filename)] || 'application/octet-stream');res.end(await readFile(filename));
    } catch {res.writeHead(404).end();}
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try {
    for (const engine of (process.env.RHWP_GEOMETRY_ENGINES || 'chromium,webkit').split(',')) {
      await t.test(engine,{timeout:55000},async () => {
        const browser=await playwright[engine].launch({headless:true});
        try {
          const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:2});
          const errors=[];page.on('pageerror',error => errors.push(error.message));
          await page.goto(origin+'/__geometry__');await waitForState(page,() => window.ready);
          async function insert({table=false,rotation=0,flipH=false,flipV=false}={}) {
            await page.evaluate(async ({table,rotation,flipH,flipV}) => {
              await bridge.newDocument();
              const canvas=document.createElement('canvas');canvas.width=200;canvas.height=100;const ctx=canvas.getContext('2d');
              ctx.fillStyle='#ff0000';ctx.fillRect(0,0,200,100);ctx.fillStyle='#0000ff';ctx.fillRect(0,0,100,50);
              const bytes=new Uint8Array(await(await fetch(canvas.toDataURL())).arrayBuffer());
              if(table){const result=bridge.wasm.createTable(0,0,0,1,1);bridge.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:0,parentParaIndex:result.paraIdx,cellPath:[{controlIndex:result.controlIdx,cellIndex:0,cellParaIndex:0}]});}
              window.ref=bridge.insertFigure({id:'runtime',bytes,widthMm:60,heightMm:30,pixelWidth:200,pixelHeight:100});
              bridge.setProperties(ref,{rotationAngle:rotation,horzFlip:flipH,vertFlip:flipV});bridge.deps.eventBus.emit('document-changed');
            },{table,rotation,flipH,flipV});
            await waitForState(page,() => bridge.figureGeometry(ref) && bridge.editor.element.contentDocument.querySelector('[data-rhwp-flow-image-page] img'));
          }
          async function measure() {
            return page.evaluate(() => {
              const frame=bridge.editor.element,doc=frame.contentDocument,plane=doc.querySelector('[data-rhwp-flow-image-page]');
              const node=plane.querySelector('img').parentElement,r=node.getBoundingClientRect(),root=frame.getBoundingClientRect();
              return {g:bridge.figureGeometry(ref),props:bridge.properties(ref),dom:{x:root.left+frame.clientLeft+r.left,y:root.top+frame.clientTop+r.top,w:r.width,h:r.height},rotation:node.style.transform};
            });
          }
          function check({g,dom}) {
            assert.ok(g);const angle=g.rotation*Math.PI/180;
            const w=Math.abs(g.w*Math.cos(angle))+Math.abs(g.h*Math.sin(angle)),h=Math.abs(g.w*Math.sin(angle))+Math.abs(g.h*Math.cos(angle));
            near(g.x+(g.w-w)/2,dom.x,0.08);near(g.y+(g.h-h)/2,dom.y,0.08);near(w,dom.w,0.08);near(h,dom.h,0.08);
          }
          for (const rotation of [0,30,90,-90,180,270]) {
            await insert({rotation,flipH:true,flipV:true});const m=await measure();check(m);
            assert.equal(m.g.rotation,rotation);assert.equal(m.g.flipH,true);assert.equal(m.g.flipV,true);
            if(Math.abs(rotation)%180===90)assert.ok(m.g.w>m.g.h,'quarter-turn dimensions are restored before CSS rotation');
          }
          await insert({rotation:30,flipH:true});
          for (const zoom of [0.75,1.3,2]) {
            await page.evaluate(zoom => bridge.input.viewportManager.setZoom(zoom),zoom);
            await waitForState(page,zoom => bridge.editor.element.contentDocument.querySelector('.document-page-canvas')?.dataset.rhwpRenderedZoom === String(zoom),zoom);
            check(await measure());
            await page.evaluate(() => {bridge.input.viewportManager.setScrollTop(75);bridge.input.viewportManager.setScrollLeft(40);});
            check(await measure());
            const viewport=await page.evaluate(() => {
              const f=bridge.editor.element,root=f.getBoundingClientRect(),container=bridge.input.container,r=container.getBoundingClientRect();
              return {v:bridge.figureViewport(),clip:bridge.figureViewport(ref),expected:{x:root.x+f.clientLeft+r.x+container.clientLeft,y:root.y+f.clientTop+r.y+container.clientTop,w:container.clientWidth,h:container.clientHeight}};
            });
            for(const key of ['x','y','w','h'])near(viewport.v[key],viewport.expected[key],0.001);
            assert.ok(viewport.clip.y>=viewport.v.y,'picture clip never extends over RHWP toolbar');
          }
          await insert({rotation:45});await page.evaluate(() => bridge.input.viewportManager.setZoom(1));
          await waitForState(page,() => bridge.editor.element.contentDocument.querySelector('.document-page-canvas')?.dataset.rhwpRenderedZoom === '1');
          const hits=await page.evaluate(() => {
            const br=bridge,f=br.editor.element,doc=f.contentDocument,op=JSON.parse(br.wasm.getPageFlowImageOps(0)).images[0],box=op.bbox,p=br.pagePlacement(0);
            br.input.cursor.enterPictureObjectSelectionDirect(0,0,999,'image');
            function click(x,y,target){const clientX=p.x+x*p.scale,clientY=p.y+y*p.scale;
              (target || doc.elementFromPoint(clientX,clientY)).dispatchEvent(new f.contentWindow.MouseEvent('dblclick',{bubbles:true,cancelable:true,button:0,clientX,clientY}));}
            const before=edits.length;click(box.x+1,box.y+1);const corner=edits.length;
            click(box.x+box.width/2+box.width*.32/Math.sqrt(2),box.y+box.height/2+box.width*.32/Math.sqrt(2));const picture=edits.at(-1);
            const textBefore=edits.length;click(600,550);const textAfter=edits.length;
            const button=doc.createElement('button');doc.querySelector('#scroll-content').appendChild(button);click(box.x+box.width/2,box.y+box.height/2,button);button.remove();
            return{before,corner,picture,textBefore,textAfter,after:edits.length};
          });
          assert.equal(hits.corner,hits.before);assert.equal(hits.picture.id,'runtime');assert.notEqual(hits.picture.ref.ci,999);
          assert.equal(hits.textBefore,hits.before+1);assert.equal(hits.textAfter,hits.textBefore);assert.equal(hits.after,hits.textBefore);
          await insert({table:true,rotation:90,flipH:true});check(await measure());
          const clipped=await page.evaluate(() => {
            const op=JSON.parse(bridge.wasm.getPageFlowImageOps(0)).images[0],p=bridge.pagePlacement(0),box=op.bbox,clip=op.clip,doc=bridge.editor.element.contentDocument;
            const eventAt=(x,y)=>({button:0,clientX:p.x+x*p.scale,clientY:p.y+y*p.scale,target:doc.querySelector('.document-page-canvas')});
            return {path:ref.cellPath,visible:bridge.pictureAtEvent(eventAt(box.x+box.width/2,Math.min(box.y+10,clip.y+clip.height-1))),
              clipped:bridge.pictureAtEvent(eventAt(box.x+box.width/2,box.y+box.height-1)),viewport:bridge.figureViewport(),figureViewport:bridge.figureViewport(ref),clipHeight:clip.height*p.scale};
          });
          assert.equal(clipped.path.length,1);assert.ok(clipped.visible);assert.equal(clipped.clipped,null);
          assert.ok(clipped.figureViewport.h<=clipped.clipHeight+0.1,'table ancestor clips the overlay');
          assert.ok(clipped.figureViewport.y>=clipped.viewport.y);
          const editCount=await page.evaluate(() => edits.length);
          // RHWP's native quarter-turn selection handles can cross the clipped
          // picture's centre. Hit the painted interior, clear of those controls.
          await page.mouse.dblclick(clipped.figureViewport.x+clipped.figureViewport.w*.3,clipped.figureViewport.y+clipped.figureViewport.h*.25);
          assert.equal(await page.evaluate(() => edits.length),editCount+1,'a real native table-picture double click edits once');
          await insert();
          await page.evaluate(() => {const original=ref,bytes=bridge.wasm.getControlImageData(original.sec,original.ppi,original.ci,'[]');
            const p=bridge.input.getCursorPosition();let para=p.paragraphIndex;for(let n=0;n<4;n++){const r=JSON.parse(bridge.wasm.insertPageBreak(0,para,bridge.wasm.getParagraphLength(0,para)));para=r.paraIdx;}
            bridge.input.cursor.moveTo({sectionIndex:0,paragraphIndex:para,charOffset:0});
            window.ref=bridge.insertFigure({id:'last-page',bytes,widthMm:60,heightMm:30,pixelWidth:200,pixelHeight:100});bridge.deps.eventBus.emit('document-changed');
          });
          await waitForState(page,() => bridge.input.virtualScroll.pageCount === bridge.wasm.pageCount);
          await page.evaluate(() => bridge.input.viewportManager.setScrollTop(bridge.input.virtualScroll.getPageOffset(bridge.wasm.pageCount-1)));
          await waitForState(page,() => bridge.figureGeometry(ref));
          const last=await page.evaluate(() => {
            const g=bridge.figureGeometry(ref),doc=bridge.editor.element.contentDocument,planes=[...doc.querySelectorAll('[data-rhwp-flow-image-page]')];
            const plane=planes.find(p=>Number(p.dataset.rhwpFlowImagePage) === bridge.wasm.pageCount-1),r=plane.querySelectorAll('img')[bridge.picturePlacement(ref).op.flowIndex].parentElement.getBoundingClientRect(),root=bridge.editor.element.getBoundingClientRect();
            return {g,dom:{x:root.x+r.x,y:root.y+r.y,w:r.width,h:r.height},pages:bridge.wasm.pageCount,firstRenderedPage:planes[0].dataset.rhwpFlowImagePage};
          });
          assert.ok(last.pages>=5);assert.notEqual(last.firstRenderedPage,'0');check(last);
          assert.deepEqual(errors,[]);
        } finally {await browser.close();}
      });
    }
  } finally {await new Promise(resolve => server.close(resolve));}
});
