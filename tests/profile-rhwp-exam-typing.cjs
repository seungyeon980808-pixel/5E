const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');

// Synthetic DOM composition in Playwright WebKit, NOT macOS Safari's IME.
// All CPU spans share the top frame's clock. Nested exclusive spans are
// disjoint; async wall spans include waiting and must not be summed as CPU.
async function instrument(page) {
  await page.addInitScript(() => {
    const metrics = {}, stack = [];
    window.__rhwpPerf = {
      metrics, active:false, host:null,
      reset() { for (const key of Object.keys(metrics)) delete metrics[key]; },
      wrap(name, fn) {
        return function(...args) {
          if (!window.__rhwpPerf.active) return fn.apply(this,args);
          const start = performance.now(), span = {child:0};
          const row = metrics[name] ||= {calls:0,cpu:0,self:0,max:0,wall:0,composingCalls:0};
          row.calls++;
          if (document.querySelector('#exam-studio iframe')?.contentWindow.rhwpStudio?.plugins.deps.getInputHandler()?.isComposing) row.composingCalls++;
          stack.push(span);
          let result;
          try { result = fn.apply(this,args); return result; }
          finally {
            const elapsed = performance.now()-start;
            stack.pop(); if (stack.length) stack.at(-1).child += elapsed;
            row.cpu += elapsed; row.self += elapsed-span.child; row.max = Math.max(row.max,elapsed);
            if (result?.then) result.then(() => {row.wall += performance.now()-start;}, () => {row.wall += performance.now()-start;});
          }
        };
      },
    };
  });
  await page.route('**/js/rhwp-exam-workspace.js*', async route => {
    const response = await route.fetch(), source = await response.text();
    // 작업 공간의 마지막 return { … getAutosaveSnapshot: … } 줄 앞에 잰다(ExamPool이 앞에 receiveQuestion 등을 더함).
    const marker = source.match(/^  return \{[^\n]*getAutosaveSnapshot:/m)?.[0];
    assert.ok(marker,'instrument the exact workspace entry');
    const probes = `
  renderFigures = window.__rhwpPerf.wrap('5E.list',renderFigures);
  repairLinks = window.__rhwpPerf.wrap('5E.links',repairLinks);
  captureWorkspace = window.__rhwpPerf.wrap('5E.sources',captureWorkspace);
  flushFigureNames = window.__rhwpPerf.wrap('5E.names',flushFigureNames);
  saveNow = window.__rhwpPerf.wrap('5E.save',saveNow);
  window.__rhwpPerf.host = {save:() => stableSave()};
`;
    await route.fulfill({response,body:source.replace(marker,probes+marker)});
  });
}

async function attach(page) {
  return page.evaluate(async () => {
    const p = window.__rhwpPerf, f = document.querySelector('#exam-studio iframe');
    const d = f.contentWindow.rhwpStudio.plugins.deps, input = d.getInputHandler();
    const { RhwpExamBridge } = await import('/js/rhwp-exam-bridge.js?v=1.7.0-four-session-integration');
    const hook = (object,key,name) => {
      if (typeof object?.[key] === 'function') object[key] = p.wrap(name,object[key]);
    };
    hook(RhwpExamBridge.prototype,'documentPictures','5E.pictures');
    hook(RhwpExamBridge.prototype,'exportHwpx','5E.export');
    // DOM listeners already captured the bound onInput function at startup.
    // eventTimes measures dispatch; these probes cover dynamically called work.
    for (const key of ['afterTextInputEdit','refreshAfterOperation','afterPageLocalEdit','afterEdit','updateCaret','updateSelection','executeOperation','flushDeferredPaginationIfNeeded'])
      hook(input,key,'RHWP.'+key);
    for (const key of ['updateRect','getRect']) hook(input.cursor,key,'RHWP.cursor.'+key);
    for (const key of ['render','renderVisiblePages','renderPage','refresh']) hook(input.virtualScroll,key,'RHWP.viewport.'+key);
    for (const key of ['replaceBodyTextLocal','replaceTextInCellDeferredPagination','replaceTextInCellByPath','beginDeferredPagination','stepDeferredPagination','flushDeferredPagination','getPageControlLayout','refreshLayout','getCursorRect','getCursorRectInCell','getCursorRectByPath','getCursorRectByPathNear','renderPageToCanvas','renderPageToCanvasFiltered','renderPagePatchToCanvasFiltered','getPageLayerTreeObject','getPageFlowImageOps','getControlImageData'])
      hook(d.wasm,key,'WASM.'+key);
    return {pages:d.wasm.pageCount,zoom:input.viewportManager.getZoom(),fields:d.wasm.getFieldList()};
  });
}

async function runInput(page,position,kind) {
  return page.evaluate(async ({position,kind}) => {
    const p = window.__rhwpPerf, view = document.querySelector('#exam-studio iframe').contentWindow;
    const d = view.rhwpStudio.plugins.deps, input = d.getInputHandler(), area = input.textarea;
    input.cursor.moveTo(position); input.updateCaret(); area.focus();
    const frame = () => new Promise(resolve => view.requestAnimationFrame(resolve));
    await frame(); await frame(); p.reset(); p.active = true;
    const intervals = [], eventTimes = [];
    const fire = (name,data,isComposing = false) => {
      const start = performance.now();
      if (name === 'input') {area.value = data;area.dispatchEvent(new view.InputEvent(name,{bubbles:true,data,inputType:isComposing?'insertCompositionText':'insertText',isComposing}));}
      else area.dispatchEvent(new view.CompositionEvent(name,{bubbles:true,data}));
      eventTimes.push(performance.now()-start);
    };
    const start = performance.now();
    for (let index=0;index<20;index++) {
      const tick = performance.now();
      if (kind === 'korean') {
        fire('compositionstart','');
        for (const fragment of ['ㅎ','하','한']) {
          fire('input',fragment,true);
          area.dispatchEvent(new view.KeyboardEvent('keyup',{key:'Process',keyCode:229,bubbles:true,isComposing:true}));
          await frame();
        }
        fire('compositionend','한');
      } else if (kind === 'english') {
        fire('input','a');
        area.dispatchEvent(new view.KeyboardEvent('keyup',{key:'a',bubbles:true}));
      } else {
        const t = performance.now();
        area.dispatchEvent(new view.KeyboardEvent('keydown',{key:'Backspace',code:'Backspace',keyCode:8,bubbles:true,cancelable:true}));
        eventTimes.push(performance.now()-t);
        area.dispatchEvent(new view.KeyboardEvent('keyup',{key:'Backspace',code:'Backspace',keyCode:8,bubbles:true}));
      }
      await frame(); await frame(); intervals.push(performance.now()-tick);
    }
    const elapsed = performance.now()-start, metrics = structuredClone(p.metrics);
    p.active = false;
    return {elapsed,eventTimes,intervals,metrics,position:input.getCursorPosition()};
  },{position,kind});
}

if (require.main === module) h.withServer(async origin => {
  const browser = await webkit.launch({headless:true});
  const report = {
    phase:process.env.MEASURE_PHASE || 'baseline',
    engine:'Playwright WebKit; synthetic DOM input, no physical IME',
    viewport:{width:1440,height:950}, repetitions:Number(process.env.REPETITIONS || 5),
    document:process.env.RHWP_DOCUMENT ? {
      name:path.basename(process.env.RHWP_DOCUMENT).normalize('NFC'),
      sha256:createHash('sha256').update(fs.readFileSync(process.env.RHWP_DOCUMENT)).digest('hex'),
    } : {name:'built-in integration demo'}, runs:[],
  };
  try {
    for (let repetition=0;repetition<report.repetitions;repetition++) {
      const context = await browser.newContext({viewport:report.viewport});
      try {
        const page = await context.newPage(); await instrument(page);
        await page.goto(origin+'/?mode=pro&mobile=0&exam=1'); await h.ready(page);
        assert.equal(await page.evaluate(()=>!!window.__rhwpPerf.host),true,'host profiling route was applied');
        if (process.env.RHWP_DOCUMENT) await h.nativeOpen(page,process.env.RHWP_DOCUMENT);
        else {await h.action(page,'demo');await h.idle(page);}
        const environment = await attach(page);
        const positions = await page.evaluate(() => {
          const d = document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps;
          const table = d.wasm.getPageControlLayout(0).controls.find(c=>c.type==='table' && c.paraIdx===5) ||
            d.wasm.getPageControlLayout(0).controls.find(c=>c.type==='table');
          const header = d.wasm.getPageControlLayout(0).controls.find(c=>c.type==='table' && c.paraIdx===0);
          return {
            body:d.getInputHandler().getCursorPosition(),
            table:{sectionIndex:table.secIdx,paragraphIndex:0,charOffset:0,parentParaIndex:table.paraIdx,
              cellPath:[{controlIndex:table.controlIdx,cellIndex:0,cellParaIndex:0}]},
            ...(header ? {headerCell:{sectionIndex:header.secIdx,paragraphIndex:0,charOffset:0,parentParaIndex:header.paraIdx,
              controlIndex:header.controlIdx,cellIndex:6,cellParaIndex:0,
              cellPath:[{controlIndex:header.controlIdx,cellIndex:6,cellParaIndex:0}]}} : {}),
          };
        });
        for (const [location,position] of Object.entries(positions).filter(([location])=>!process.env.LOCATIONS || process.env.LOCATIONS.split(',').includes(location))) {
          for (const kind of ['korean','english','delete']) {
            const target = kind === 'delete' ? await page.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().getCursorPosition()) : position;
            const result = await runInput(page,target,kind);
            assert.equal(result.position.charOffset,kind==='delete'?target.charOffset-20:position.charOffset+20,'all 20 input/deletion operations changed text');
            report.runs.push({repetition,location,kind,environment,position,...result});
            console.log(`${report.phase} ${repetition} ${location} ${kind}: ${result.elapsed.toFixed(1)}ms, list=${result.metrics['5E.list']?.calls||0}, links=${result.metrics['5E.links']?.calls||0}, layout=${result.metrics['WASM.getPageControlLayout']?.calls||0}`);
          }
        }
        const saved = await page.evaluate(async () => {
          const p = window.__rhwpPerf; p.reset(); p.active = true;
          const start = performance.now(); const blob = await p.host.save();
          p.active = false; return {elapsed:performance.now()-start,bytes:blob?.size,metrics:structuredClone(p.metrics)};
        });
        report.runs.push({repetition,kind:'save',...saved});
        assert.ok(saved.bytes>0,'autosave produces the complete project');
        if (repetition===0) {
          const dir = path.resolve(process.env.EVIDENCE_DIR||'_work/rhwp/typing-performance');fs.mkdirSync(dir,{recursive:true});
          await page.screenshot({path:path.join(dir,report.phase+'.png')});
        }
      } finally {await context.close();}
    }
  } finally {await browser.close();}
  const output = path.resolve(process.env.EVIDENCE_DIR||'_work/rhwp/typing-performance',report.phase+'.json');
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));
  console.log('MEASUREMENT_COMPLETE '+output);
}).catch(error=>{console.error(error);process.exitCode=1;});

module.exports = {instrument,attach,runInput};
