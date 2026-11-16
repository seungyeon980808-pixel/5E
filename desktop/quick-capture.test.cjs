const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
function clipboardFixture({ unsupported = false, encodeFails = false } = {}) {
  const source = fs.readFileSync(require.resolve('../js/svg-export.js'), 'utf8');
  const code = source.slice(source.indexOf('export async function copyPngToClipboard('), source.indexOf('\nexport async function exportPng(')).replace('export async function', 'async function');
  const font = deferred(), calls = [], original = { objects: [{ text: '원래 라벨' }] };
  let rasterSnapshot;
  const ctx = vm.createContext({ structuredClone, navigator: { clipboard: unsupported ? null : { write(items) { calls.push('write'); return items[0].png.then(() => {}); } } }, ClipboardItem: class { constructor(data) { this.png = data['image/png']; assert.equal(typeof this.png.then, 'function'); } },
    ensureEmbeddedFonts: () => font.promise,
    rasterizeExportCanvas: async snapshot => { calls.push('raster'); rasterSnapshot = snapshot; return { canvas: { toBlob(fn) { fn(encodeFails ? null : { type: 'image/png' }); } } }; },
    pngBlobWithDpi: async blob => blob,
  });
  vm.runInContext(code, ctx);
  return { copy: () => ctx.copyPngToClipboard({ get: () => original }), font, calls, original, snapshot: () => rasterSnapshot };
}
test('PNG write begins in the gesture before fonts finish; copied labels use the release snapshot', {timeout:5000}, async () => {
  const f = clipboardFixture(), result = f.copy();
  assert.deepEqual(f.calls, ['write']);
  f.original.objects[0].text = '복사 후 편집';
  f.font.resolve();
  assert.equal(await result, true);
  assert.equal(f.snapshot().objects[0].text, '원래 라벨');
});
test('unsupported clipboard returns false without rendering', {timeout:5000}, async () => {
  const f = clipboardFixture({ unsupported: true });
  assert.equal(await f.copy(), false); assert.deepEqual(f.calls, []);
});
test('failed PNG encoding rejects rather than reporting a copied image', {timeout:5000}, async () => {
  const f = clipboardFixture({ encodeFails: true }), result = f.copy();
  f.font.resolve(); await assert.rejects(result, /PNG encoding failed/);
});

class Element {
  constructor() { this.events = new Map(); this.dataset = {}; this.style = {}; this.attrs = {}; this.hidden = false; this.children = []; this.classList = { toggle() {} }; }
  addEventListener(name, fn) { const list=this.events.get(name)||[]; list.push(fn); this.events.set(name,list); }
  removeEventListener(name, fn) { this.events.set(name,(this.events.get(name)||[]).filter(x=>x!==fn)); }
  setAttribute(key,value) { this.attrs[key]=value; }
  removeAttribute(key) { delete this.attrs[key]; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); }
  remove() { this.removed=true; }
  setPointerCapture() {}
  releasePointerCapture() {}
  emit(name, values = {}) { const event={ button:0,pointerId:1,preventDefault(){},stopImmediatePropagation(){}, ...values }; for(const fn of [...(this.events.get(name)||[])])fn(event); }
}
function captureFixture() {
  const code=fs.readFileSync(require.resolve('../js/quick-capture.js'),'utf8').replace(/^import .*;\n/gm,'').replace('export function','function');
  const body=new Element(),button=new Element(),win=new Element(),copied=[],result=deferred(),settled=deferred();
  const removeAttribute=button.removeAttribute.bind(button);
  button.removeAttribute=key=>{removeAttribute(key);if(key==='aria-busy')settled.resolve();};
  const ctx=vm.createContext({document:{body,getElementById:()=>button,createElement:()=>new Element()},window:win,navigator:{clipboard:{write(){}}},ClipboardItem:class {},setTimeout:()=>1,clearTimeout(){},
    hasBlockingModal:()=>false,blocksCanvasShortcut:event=>!!event.blocked,keyLabel:()=> '⌥C',shortcutKey:event=>(event.code||'').replace('Key','').toLowerCase(),
    screenToWorld:(_svg,_vb,x,y)=>({x:(x-100)/10,y:(y-60)/10}),copyPngToClipboard:(_state,dpi,bounds,options)=>{copied.push({dpi,bounds,options});return result.promise;},
  });
  vm.runInContext(code,ctx);ctx.initQuickCapture({get:()=>({viewBox:{}})},{getBoundingClientRect:()=>({left:100,top:60,right:500,bottom:360,width:400,height:300})});
  return {button,win,body,copied,result,settled:settled.promise,overlay:()=>body.children.find(node=>node.className==='modal-overlay quick-capture-overlay'&&!node.removed)};
}
test('reverse drag clamps to canvas and copies immediately without confirmation', {timeout:5000}, async () => {
  const f=captureFixture();f.button.emit('click');const overlay=f.overlay();
  overlay.emit('pointerdown',{clientX:400,clientY:300});overlay.emit('pointerup',{clientX:50,clientY:100});
  assert.equal(overlay.removed,true);assert.equal(f.button.attrs['aria-pressed'],'false');assert.equal(f.copied.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(f.copied[0])),{dpi:300,bounds:{x:0,y:4,w:30,h:20},options:{includeReferenceImages:true}});
  f.result.resolve(true);await f.settled;assert.equal(f.body.children[0].textContent,'클립보드에 복사됨');assert.equal(f.button.disabled,false);
});
test('tiny clicks and drags starting outside the canvas do not copy; Escape cancels', () => {
  const f=captureFixture();f.button.emit('click');const overlay=f.overlay();
  overlay.emit('pointerdown',{clientX:20,clientY:20});overlay.emit('pointerup',{clientX:350,clientY:220});
  overlay.emit('pointerdown',{clientX:200,clientY:200});overlay.emit('pointerup',{clientX:201,clientY:201});
  assert.equal(f.copied.length,0);assert.equal(overlay.removed,undefined);
  f.win.emit('keydown',{key:'Escape'});assert.equal(overlay.removed,true);assert.equal(f.button.attrs['aria-pressed'],'false');
});
test('Option+C uses the physical key even when its character is ç and respects typing/modal blocks', () => {
  const f=captureFixture();const shortcut={altKey:true,code:'KeyC',key:'ç'};
  f.win.emit('keydown',{...shortcut,blocked:true});assert.equal(f.overlay(),undefined);
  f.win.emit('keydown',shortcut);assert.ok(f.overlay());assert.equal(f.button.dataset.shellTip,'빠른 캡처 · ⌥C');
  f.win.emit('keydown',{key:'Escape'});assert.equal(f.copied.length,0);
});
test('clipboard rejection produces a failure status and enables retry', {timeout:5000}, async () => {
  const f=captureFixture();f.button.emit('click');const overlay=f.overlay();
  overlay.emit('pointerdown',{clientX:200,clientY:150});overlay.emit('pointerup',{clientX:350,clientY:250});
  f.result.reject(new Error('NotAllowedError'));await f.settled;
  assert.match(f.body.children[0].textContent,/복사하지 못했습니다/);assert.equal(f.button.disabled,false);
});
