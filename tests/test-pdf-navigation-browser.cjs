const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const playwright = require('playwright');
const { installCropFixture } = require('./helpers/crop-loading-fixture.cjs');
const dir = path.resolve(process.env.EVIDENCE_DIR || '.omo/evidence/ai-latest-fixes-0928');
fs.mkdirSync(dir,{recursive:true});
// Observe the retained preview's unchanged async body. Canonical fixtures already
// record these events. This records completion without changing selection logic.
async function observeRetainedEditor(page) {
 const helper=fs.readFileSync(path.join(__dirname,'helpers/crop-loading-fixture.cjs'),'utf8');
 if(helper.includes('window.__cropRecord')) return;
 let source=fs.readFileSync(path.resolve(__dirname,'../preview/js/unified-library-ui.js'),'utf8');
 const originalSHA256=require('node:crypto').createHash('sha256').update(source).digest('hex');
 const observe=(before,after)=>{assert.equal(source.split(before).length-1,1,'PDF editor observation seam must occur once');source=source.replace(before,after);};
 observe('    cropOpenOptions = { emptyDraft, wholePage, title };',
  '    cropOpenOptions = { emptyDraft, wholePage, title };\n    window.__cropRecord({ phase: "editor-start", number: result.provenance.pageNumber });');
 observe('      const original = await materializeOriginalLibraryPage(result, activeProvider);',
  '      const original = await materializeOriginalLibraryPage(result, activeProvider)\n        .finally(() => window.__cropRecord({ phase: "editor-original-settled", number: session.pageNumber }));');
 observe('      return false;\n    }\n  };\n  overlay.querySelector("[data-unilib-adjust]").addEventListener("click", () => void openCropEditor());',
  '      return false;\n    } finally {\n      window.__cropRecord({ phase: "editor-settled", number: session.pageNumber });\n    }\n  };\n  overlay.querySelector("[data-unilib-adjust]").addEventListener("click", () => void openCropEditor());');
 await page.route('**/preview/js/unified-library-ui.js*',route=>route.fulfill({contentType:'text/javascript',body:source}));
 await page.addInitScript(()=>{window.cropFixtureLog=[];window.__cropRecord=value=>window.cropFixtureLog.push({sequence:window.cropFixtureLog.length+1,...value});});
 fs.writeFileSync(path.join(dir,'retained-source-observation.json'),JSON.stringify({originalSHA256,observationOnly:true,seams:3},null,2));
}
(async () => {
 const engine=process.env.ENGINE||'chromium';assert.ok(['chromium','webkit'].includes(engine));
 const browser = await playwright[engine].launch({headless:true});
 const page = await browser.newPage({viewport:{width:1600,height:1000}});
 const report=[];
 try {
  await observeRetainedEditor(page);
  const ui = await installCropFixture(page);
  const stage = ui.locator('[data-unilib-crop-stage]');
  await page.evaluate(()=>{holdCrop('original-2');holdCrop('original-3');window.pdfTransitions=[];const stage=document.querySelector('[data-unilib-crop-stage]');new MutationObserver(()=>pdfTransitions.push({page:document.querySelector('[data-unilib-crop]').dataset.pdfPage,y:stage.scrollTop,state:stage.getAttribute('aria-busy')})).observe(document.querySelector('[data-unilib-crop]'),{subtree:true,attributes:true,attributeFilter:['data-pdf-page','aria-busy']});});
  const waitEvent=(phase,number)=>page.waitForFunction(({phase,number})=>window.cropFixtureLog.some(row=>row.phase===phase&&row.number===number),{phase,number});
  async function waitPage(number){await page.waitForFunction(number=>document.querySelector('[data-unilib-crop]').dataset.pdfPage===String(number),number);await waitEvent('editor-start',number);}
  async function scrollTo(number){ await stage.evaluate((el,n)=>{const root=el.querySelector('.unilib-crop-pages');el.scrollTop=root.querySelector(`[data-page="${n}"]`).offsetTop-root.offsetTop+90;},number);await waitPage(number); }
  const snap=()=>page.evaluate(()=>({page:document.querySelector('[data-unilib-crop]').dataset.pdfPage,y:document.querySelector('[data-unilib-crop-stage]').scrollTop,busy:document.querySelector('[data-unilib-crop-stage]').getAttribute('aria-busy'),active:document.querySelector('.unilib-crop-page.is-active')?.dataset.page,events:pdfTransitions,editorEvents:cropFixtureLog}));
  if (process.env.BUTTON) { await ui.locator('[data-unilib-crop-page-next]').click(); await waitPage(2); } else await scrollTo(2);report.push({phase:'page2-held',...await snap()});
  await scrollTo(3);report.push({phase:'page3-requested-page2-held',...await snap()});
  assert.ok(!report[1].editorEvents.some(row=>row.phase==='editor-original-settled'&&row.number===2),'obsolete original is still held');
  await page.evaluate(()=>cropGates['original-3'].release());
  await waitEvent('editor-original-settled',3);await waitEvent('editor-settled',3);
  await page.waitForFunction(()=>document.querySelector('[data-unilib-crop-stage]').getAttribute('aria-busy')==='false');
  report.push({phase:'page3-resolved-first',...await snap()});
  await page.evaluate(()=>cropGates['original-2'].release());
  await waitEvent('editor-original-settled',2);await waitEvent('editor-settled',2);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  report.push({phase:'obsolete-page2-resolved',...await snap()});
  await page.screenshot({path:path.join(dir,`pdf-${process.env.LABEL||'run'}.png`)});
  fs.writeFileSync(path.join(dir,`pdf-${process.env.LABEL||'run'}.json`),JSON.stringify(report,null,2));
  assert.equal(report[1].page,'3','latest scroll must activate page 3 while page 2 rendering is delayed');
  assert.equal(report[2].busy,'false','page 3 must finish before obsolete page 2');
  assert.equal(report[3].page,'3');assert.ok(Math.abs(report[3].y-report[1].y)<1,'sharp renders must preserve current scroll position');
  console.log('PASS delayed page 2, newer page 3 finishes first, obsolete completion ignored; scroll stable');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
