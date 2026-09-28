const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const playwright = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const evidence = process.env.COMPARISON_EVIDENCE || path.join(root, '.omo/evidence/ai-workbench-polish-0928/task3');
const realSource = process.env.COMPARISON_REAL_SOURCE;
const sourceFiles = realSource ? ['original.png', 'generated.png'].map(name => path.resolve(realSource, name)) : [];
const sourceHashes = () => sourceFiles.map(file => ({ file, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') }));
const svg = (width, height, label) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><rect x="2" y="2" width="${width-4}" height="${height-4}" fill="none" stroke="#64748b" stroke-width="4"/><path d="M${width/2-60} ${height/2}h120M${width/2} ${height/2-60}v120" stroke="#1769d2" stroke-width="4"/><circle cx="${width/2}" cy="${height/2}" r="40" fill="none" stroke="#111" stroke-width="3"/><text x="10" y="24" font-size="16">${label}</text></svg>`;
const fixture = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comparison QA</title><link rel="stylesheet" href="/preview/css/ai-comparison.css"><style>html{font-family:Arial,sans-serif;background:#f4f5f7}html.dark{--text-primary:#e5e7eb;--text-secondary:#b5bcc6;--bg-panel:#161b22;--bg-input:#222a34;--bg-canvas:#303640;--border:#596474;--accent:#79b8ff}</style><button id="open">비교 열기</button><script type="module">
import {openRevisionComparison} from '/preview/js/ai-comparison.js';
window.revisions=[{id:'original',label:'원본 · 기준 그림',src:'/image/original.svg',kind:'original'},...Array.from({length:4},(_,i)=>({id:'r'+(i+1),label:'수정본 '+(i+1)+' · 비교 그림',src:'/image/r'+(i+1)+'.svg'}))];
window.before=JSON.stringify(window.revisions);window.comparisonCloseCount=0;
window.openCompare=(selectedRevisionId='r2')=>{window.compare=openRevisionComparison({revisions:window.revisions,selectedRevisionId,onClose:()=>window.comparisonCloseCount++});return window.compare.ready;};
document.querySelector('#open').onclick=()=>window.openCompare();window.fixtureReady=true;
</script></html>`;
for (const engine of ['chromium', 'webkit']) test(`${engine}: revision wipe, coordinate alignment, independent selection, async races and disposal`, { timeout: 90000 }, async t => {
  fs.mkdirSync(evidence, { recursive: true });
  const beforeHashes = sourceHashes();
  let failures = 0;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/fixture') { response.writeHead(200, {'Content-Type':'text/html'}); response.end(fixture); return; }
    if (url.pathname.startsWith('/image/')) {
      if (url.pathname === '/image/resolution-original.png' || url.pathname === '/image/resolution-generated.png') {
        const original = url.pathname.includes('original');
        response.writeHead(200, {'Content-Type': realSource ? 'image/png' : 'image/svg+xml'});
        response.end(realSource ? fs.readFileSync(sourceFiles[original ? 0 : 1]) : svg(original ? 1005 : 1991, original ? 399 : 790, original ? 'Original' : 'Generated'));
        return;
      }
      if (url.pathname.includes('retry') && failures++ === 0) { response.writeHead(500).end(); return; }
      const portrait = url.pathname.includes('r2');
      const body = svg(portrait ? 200 : 400, portrait ? 400 : 200, url.pathname.split('/').at(-1));
      const send = () => { if (!response.destroyed) { response.writeHead(200, {'Content-Type':'image/svg+xml','Cache-Control':'no-store'}); response.end(body); } };
      if (url.pathname.includes('slow')) setTimeout(send, 600); else send();
      return;
    }
    const file = path.resolve(root, `.${url.pathname}`);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    fs.readFile(file, (error, bytes) => { if (error) response.writeHead(404).end(); else { response.writeHead(200, {'Content-Type':file.endsWith('.css')?'text/css':'text/javascript'}); response.end(bytes); } });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(() => {
    fs.writeFileSync(path.join(evidence, `${engine}-server-cleanup.json`), JSON.stringify({listening:server.listening})); resolve();
  })));
  const browser = await playwright[engine].launch({headless:true}); t.after(async () => {
    await browser.close();
    fs.writeFileSync(path.join(evidence, `${engine}-browser-cleanup.json`), JSON.stringify({connected:browser.isConnected()}));
  });
  const context = await browser.newContext({viewport:{width:1280,height:900}, deviceScaleFactor:2});
  await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const actions = [];
  const state = () => page.evaluate(() => window.compare.getState());
  const capture = async name => { const file = path.join(evidence, `${engine}-${name}.png`); await page.screenshot({path:file}); actions.push({name,state:await state(),screenshot:file}); };
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);
    await page.waitForFunction(() => window.fixtureReady);
    await page.focus('#open'); await page.keyboard.press('Enter'); await page.evaluate(() => window.compare.ready);
    await page.waitForFunction(() => document.querySelector('.ai-comparison-pane svg').getAttribute('viewBox').split(' ')[2] > 100);
    assert.deepEqual((await state()).states, ['ready','ready']);
    assert.equal((await state()).rightRevisionId, 'r2'); assert.equal((await state()).leftRevisionId, 'r1');
    await capture('center');
    const bar = page.getByRole('slider');
    const stage = page.locator('.ai-comparison-stage');
    for (const ratio of [0.2, 0.8]) {
      const rect = await stage.boundingBox(), handle = await bar.boundingBox();
      await page.mouse.move(handle.x+handle.width/2, handle.y+handle.height/2); await page.mouse.down();
      await page.mouse.move(rect.x+rect.width*ratio,rect.y+rect.height/2,{steps:12}); await page.mouse.up();
      assert.ok(Math.abs((await state()).ratio-ratio)<0.01);
      await capture(`wipe-${Math.round(ratio*100)}`);
    }
    await page.selectOption('[aria-label="왼쪽 비교 버전"]','original');
    await page.selectOption('[aria-label="오른쪽 비교 버전"]','r4');
    await page.selectOption('[aria-label="오른쪽 비교 버전"]','r2');
    await page.evaluate(() => window.compare.ready);
    assert.equal((await state()).leftRevisionId,'original'); assert.equal((await state()).rightRevisionId,'r2');
    await page.getByRole('button',{name:'비교 확대',exact:true}).click();
    await page.getByRole('button',{name:'비교 확대',exact:true}).click();
    await page.getByRole('button',{name:'비교 확대',exact:true}).click();
    await page.getByRole('button',{name:'비교 확대',exact:true}).click();
    const rect = await stage.boundingBox();
    await page.mouse.move(rect.x+rect.width*.3,rect.y+rect.height*.4); await page.mouse.down();
    await page.mouse.move(rect.x+rect.width*.3+65,rect.y+rect.height*.4+35,{steps:8}); await page.mouse.up();
    assert.ok((await state()).panX !== 0); assert.equal((await state()).zoom,2);
    const geometry = await page.locator('.ai-comparison-pane svg').evaluateAll(nodes => nodes.map(svg => ({viewBox:svg.getAttribute('viewBox'),image:[...svg.querySelector('image').attributes].reduce((r,a)=>(r[a.name]=a.value,r),{})})));
    assert.equal(geometry[0].viewBox, geometry[1].viewBox);
    assert.equal(geometry[0].image.width / geometry[0].image.height, 2);
    assert.equal(geometry[1].image.width / geometry[1].image.height, .5);
    assert.equal(Number(geometry[0].image.x)+Number(geometry[0].image.width)/2,Number(geometry[1].image.x)+Number(geometry[1].image.width)/2);
    assert.equal(Number(geometry[0].image.y)+Number(geometry[0].image.height)/2,Number(geometry[1].image.y)+Number(geometry[1].image.height)/2);
    await bar.focus(); await page.keyboard.press('Home');
    for(let i=0;i<5;i++) await page.keyboard.press('Shift+ArrowRight');
    await capture('zoom-pan-aligned');
    await bar.focus(); await page.keyboard.press('Home'); assert.equal((await state()).ratio,0);
    await page.keyboard.press('ArrowRight'); assert.equal((await state()).ratio,.01);
    await page.keyboard.press('End'); assert.equal((await state()).ratio,1);
    await page.keyboard.press('Shift+ArrowLeft'); assert.equal((await state()).ratio,.9);
    await page.getByRole('button',{name:'나란히 비교',exact:true}).click();
    assert.equal((await state()).mode,'side-by-side'); assert.equal(await bar.isVisible(),false);
    await capture('side-by-side');
    await stage.focus(); const beforePan = (await state()).panX; await page.keyboard.press('ArrowRight'); assert.notEqual((await state()).panX,beforePan);
    await page.evaluate(() => { window.oldCompare=window.compare; window.oldZoom=window.compare.element.querySelector('[aria-label="비교 확대"]'); });
    await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(),0);
    const disposedZoom=await page.evaluate(() => { const before=window.oldCompare.getState().zoom; window.oldZoom.click(); return window.oldCompare.getState().zoom===before; }); assert.equal(disposedZoom,true);
    assert.equal(await page.locator('#open').evaluate(el => el===document.activeElement),true);
    assert.equal((await state()).disposed,true);
    await page.focus('#open'); await page.keyboard.press('Enter'); await page.evaluate(() => window.compare.ready);
    assert.equal((await state()).ratio,.5); assert.equal((await state()).zoom,1);
    await page.evaluate(() => {
      window.compare.update({revisions:[...window.revisions,{id:'slow',label:'수정본 지연',src:'/image/slow.svg'},{id:'retry',label:'수정본 실패',src:'/image/retry.svg'}],rightRevisionId:'slow'});
    });
    for(const id of ['r4','slow','r1','slow','r2']) await page.selectOption('[aria-label="오른쪽 비교 버전"]',id);
    await page.evaluate(() => window.compare.ready);
    await page.waitForTimeout(700);
    assert.equal((await state()).rightRevisionId,'r2');
    assert.ok(await page.locator('.ai-comparison-right image').getAttribute('href').then(src=>src.endsWith('r2.svg')));
    await page.selectOption('[aria-label="오른쪽 비교 버전"]','retry'); await page.evaluate(() => window.compare.ready);
    assert.equal((await state()).states[1],'error'); assert.equal(await page.locator('.ai-comparison-right image').getAttribute('href'),null);
    await capture('failed-image');
    await page.getByRole('button',{name:'다시 시도',exact:true}).click(); await page.evaluate(() => window.compare.ready);
    assert.equal((await state()).states[1],'ready');
    await page.selectOption('[aria-label="오른쪽 비교 버전"]','slow');
    await page.getByRole('button',{name:'비교 닫기',exact:true}).click(); await page.waitForTimeout(700);
    assert.equal(await page.getByRole('dialog').count(),0); assert.equal((await state()).disposed,true);
    await page.focus('#open'); await page.keyboard.press('Enter'); await page.evaluate(() => window.compare.ready);
    const unchanged = await page.evaluate(() => JSON.stringify(window.revisions)===window.before); assert.equal(unchanged,true);
    await page.evaluate(() => window.compare.update({revisions:window.revisions.slice(0,2),selectedRevisionId:'r1'})); await page.evaluate(() => window.compare.ready);
    assert.equal((await state()).leftRevisionId,'original'); assert.equal((await state()).rightRevisionId,'r1');
    const malformed = await page.evaluate(() => {try { window.compare.update({revisions:[{id:'bad',label:'잘못된 크기',src:'/image/r1.svg',width:0,height:1}]}); return false;} catch(e){return e instanceof RangeError;}}); assert.equal(malformed,true);
    assert.equal((await state()).rightRevisionId,'r1');
    await page.getByRole('button',{name:'비교 닫기',exact:true}).click();
    await page.evaluate(() => {
      window.revisions = [
        {id:'original',label:'원본 · 1005 × 399',src:'/image/resolution-original.png',kind:'original'},
        {id:'generated',label:'수정본 · 1991 × 790',src:'/image/resolution-generated.png'},
      ];
      window.resolutionBefore = JSON.stringify(window.revisions);
    });
    await page.getByRole('button',{name:'비교 열기',exact:true}).click(); await page.evaluate(() => window.compare.ready);
    const imageBounds = () => page.locator('.ai-comparison-pane image').evaluateAll(nodes => nodes.map(image => {
      const rect = image.getBoundingClientRect();
      return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,href:image.getAttribute('href'),viewBox:image.parentElement.getAttribute('viewBox')};
    }));
    const fitted = await imageBounds();
    actions.push({name:'resolution-bounds',sources:beforeHashes,bounds:fitted});
    await capture('resolution-fit');
    assert.ok(Math.abs(fitted[0].width-fitted[1].width)<0.01);
    assert.ok(Math.abs(fitted[0].height-fitted[1].height)<1);
    assert.equal(fitted[0].viewBox,fitted[1].viewBox);
    assert.deepEqual((await state()).sizes,[{width:1005,height:399},{width:1991,height:790}]);
    await bar.focus(); await page.keyboard.press('Home'); await page.keyboard.press('Shift+ArrowRight');
    assert.equal((await state()).ratio,.1); await capture('resolution-wipe-10');
    await page.keyboard.press('End'); await page.keyboard.press('Shift+ArrowLeft');
    assert.equal((await state()).ratio,.9); await capture('resolution-wipe-90');
    await page.getByRole('button',{name:'전체 맞춤',exact:true}).click();
    await page.getByRole('button',{name:'비교 확대',exact:true}).click();
    await stage.focus(); await page.keyboard.press('ArrowRight');
    const moved = await imageBounds();
    assert.equal((await state()).zoom,1.25); assert.notEqual((await state()).panX,0);
    assert.equal(moved[0].viewBox,moved[1].viewBox);
    assert.ok(Math.abs(moved[0].width/moved[1].width-1)<1e-10);
    await capture('resolution-pan-zoom');
    await page.getByRole('button',{name:'전체 맞춤',exact:true}).click();
    await page.selectOption('[aria-label="왼쪽 비교 버전"]','generated');
    await page.selectOption('[aria-label="오른쪽 비교 버전"]','original');
    await page.evaluate(() => window.compare.ready);
    const swapped = await imageBounds();
    assert.ok(Math.abs(swapped[0].width-fitted[1].width)<0.01);
    assert.ok(Math.abs(swapped[1].height-fitted[0].height)<0.01);
    assert.ok(swapped[0].href.endsWith('generated.png') && swapped[1].href.endsWith('original.png'));
    await capture('resolution-swapped');
    await page.getByRole('button',{name:'나란히 비교',exact:true}).click();
    assert.equal((await state()).mode,'side-by-side');
    const adjacent = await imageBounds();
    assert.ok(Math.abs(adjacent[0].width-adjacent[1].width)<0.01);
    await capture('resolution-side-by-side');
    const history = await page.evaluate(() => ({before:window.resolutionBefore,after:JSON.stringify(window.revisions)}));
    assert.equal(history.before,history.after);
    assert.deepEqual(sourceHashes(),beforeHashes);
    actions.push({name:'resolution-history-and-bytes-unchanged',pass:true,sources:sourceHashes(),historyHashes:Object.fromEntries(Object.entries(history).map(([name,value])=>[name,createHash('sha256').update(value).digest('hex')]))});
    await page.getByRole('button',{name:'겹쳐 비교',exact:true}).click();
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.getByRole('button',{name:'비교 닫기',exact:true}).hover();
    assert.equal(await page.getByRole('button',{name:'비교 닫기',exact:true}).evaluate(el => getComputedStyle(el).color === getComputedStyle(el).backgroundColor),false);
    for (const width of [1280,768,375]) {
      await page.setViewportSize({width,height:900});
      await capture(`dark-reduced-${width}`);
      if(width===375) assert.ok((await page.locator('select').first().boundingBox()).height>=44);
      const overflow = await page.getByRole('dialog').evaluate(el => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight); assert.equal(overflow,false);
    }
    await page.setViewportSize({width:1280,height:900});
    await page.evaluate(() => {
      const make = (width,height,opaque) => {
        const canvas = document.createElement('canvas'); canvas.width=width; canvas.height=height;
        const ctx=canvas.getContext('2d');
        if(opaque) { ctx.fillStyle='#d00000'; ctx.fillRect(0,0,width,height); }
        return canvas.toDataURL();
      };
      window.compare.update({revisions:[
        {id:'wide',label:'2050 × 957',kind:'original',src:make(2050,957,true)},
        {id:'transparent',label:'1448 × 1086 투명',src:make(1448,1086,false),comments:[{number:1,type:'point',x:25,y:25}]},
      ],leftRevisionId:'wide',rightRevisionId:'transparent'});
    });
    await page.evaluate(() => window.compare.ready);
    await page.getByRole('button',{name:'전체 맞춤',exact:true}).click();
    const frames = await page.locator('.ai-comparison-frame').evaluateAll(nodes => nodes.map(node => {
      const r=node.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height};
    }));
    const imageFrames = await page.locator('.ai-comparison-pane image').evaluateAll(nodes => nodes.map(node => {
      const r=node.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height};
    }));
    assert.deepEqual(frames,imageFrames, 'checkerboards cover image bounds only, never aspect-ratio padding');
    const viewBoxes = await page.locator('.ai-comparison-pane svg').evaluateAll(nodes => nodes.map(node => node.getAttribute('viewBox')));
    assert.equal(viewBoxes[0],viewBoxes[1], 'wipe layers still share the same camera');
    const divergent = await imageBounds();
    assert.ok(Math.abs(divergent[0].width/divergent[0].height-2050/957)<1e-5);
    assert.ok(Math.abs(divergent[1].width/divergent[1].height-1448/1086)<1e-5);
    const marker = await page.locator('.ai-comparison-right').evaluate(pane => {
      const image=pane.querySelector('image'),circle=pane.querySelector('.ai-comparison-markers circle');
      return {x:+circle.getAttribute('cx'),y:+circle.getAttribute('cy'),expectedX:+image.getAttribute('x')+.25*image.getAttribute('width'),expectedY:+image.getAttribute('y')+.25*image.getAttribute('height')};
    });
    assert.equal(marker.x,marker.expectedX); assert.equal(marker.y,marker.expectedY);
    for(const theme of ['light','dark']) {
      await page.evaluate(theme => document.documentElement.classList.toggle('dark',theme==='dark'),theme);
      const shot=await page.screenshot();
      const colors=await page.evaluate(async ({png,frame}) => {
        const image=new Image(); image.src='data:image/png;base64,'+png; await image.decode();
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
        return [...ctx.getImageData(Math.floor((frame.x+frame.width*.75)*devicePixelRatio),Math.floor((frame.y+frame.height*.5)*devicePixelRatio),40,1).data].filter((_,i)=>i%4!==3);
      },{png:shot.toString('base64'),frame:frames[1]});
      assert.ok(colors.includes(184)&&colors.includes(159),'transparent revised image displays both medium-gray checker colors');
      assert.ok(colors.every((value,index)=>value >= [159,167,178][index%3]-1 && value <= [184,190,198][index%3]+1),'transparent revision contains only checker tones including antialiased tile edges, never dark canvas or red original');
      await capture(`divergent-transparent-${theme}`);
    }
    assert.deepEqual(errors,[]);
    actions.push({name:'immutable-history',pass:unchanged},{name:'malformed-dimensions-rejected',pass:malformed},{name:'no-page-errors',errors});
  } finally {
    fs.writeFileSync(path.join(evidence, `${engine}-actions.json`), JSON.stringify({engine,version:browser.version(),deviceScaleFactor:2,actions},null,2));
    await context.tracing.stop({path:path.join(evidence,`${engine}-trace.zip`)});
    await context.close();
  }
});
