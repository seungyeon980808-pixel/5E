const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { installCropFixture } = require('./helpers/crop-loading-fixture.cjs');
const dir = path.resolve(process.env.EVIDENCE_DIR || '.omo/evidence/ai-latest-fixes-0928');
fs.mkdirSync(dir,{recursive:true});
(async () => {
 const browser = await chromium.launch({headless:true});
 const page = await browser.newPage({viewport:{width:1600,height:1000}});
 const report=[];
 try {
  const ui = await installCropFixture(page);
  const stage = ui.locator('[data-unilib-crop-stage]');
  await page.evaluate(()=>{holdCrop('original-2');holdCrop('original-3');window.pdfTransitions=[];const stage=document.querySelector('[data-unilib-crop-stage]');new MutationObserver(()=>pdfTransitions.push({page:document.querySelector('[data-unilib-crop]').dataset.pdfPage,y:stage.scrollTop,state:stage.getAttribute('aria-busy')})).observe(document.querySelector('[data-unilib-crop]'),{subtree:true,attributes:true,attributeFilter:['data-pdf-page','aria-busy']});});
  async function scrollTo(number){ await stage.evaluate((el,n)=>{const root=el.querySelector('.unilib-crop-pages');el.scrollTop=root.querySelector(`[data-page="${n}"]`).offsetTop-root.offsetTop+90;},number);await page.waitForTimeout(120); }
  const snap=()=>page.evaluate(()=>({page:document.querySelector('[data-unilib-crop]').dataset.pdfPage,y:document.querySelector('[data-unilib-crop-stage]').scrollTop,busy:document.querySelector('[data-unilib-crop-stage]').getAttribute('aria-busy'),active:document.querySelector('.unilib-crop-page.is-active')?.dataset.page,events:pdfTransitions}));
  if (process.env.BUTTON) { await ui.locator('[data-unilib-crop-page-next]').click(); await page.waitForTimeout(120); } else await scrollTo(2);report.push({phase:'page2-held',...await snap()});
  await scrollTo(3);report.push({phase:'page3-requested-page2-held',...await snap()});
  await page.evaluate(()=>cropGates['original-3'].release());await page.waitForTimeout(160);report.push({phase:'page3-resolved-first',...await snap()});
  await page.evaluate(()=>cropGates['original-2'].release());await page.waitForTimeout(300);report.push({phase:'obsolete-page2-resolved',...await snap()});
  await page.screenshot({path:path.join(dir,`pdf-${process.env.LABEL||'run'}.png`)});
  fs.writeFileSync(path.join(dir,`pdf-${process.env.LABEL||'run'}.json`),JSON.stringify(report,null,2));
  assert.equal(report[1].page,'3','latest scroll must activate page 3 while page 2 rendering is delayed');
  assert.equal(report[2].busy,'false','page 3 must finish before obsolete page 2');
  assert.equal(report[3].page,'3');assert.ok(Math.abs(report[3].y-report[1].y)<1,'sharp renders must preserve current scroll position');
  console.log('PASS delayed page 2, newer page 3 finishes first, obsolete completion ignored; scroll stable');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
