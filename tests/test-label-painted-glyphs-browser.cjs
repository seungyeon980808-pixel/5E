// Fixed label source: 6e2c55012461859cdc8afb4d9596d3f08d5409b4; current-contract adaptations retain behavior oracles.
const { installLabelSourcePage } = require('./helpers/label-source-browser.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright'),fixture=require('../desktop/fixtures/ai-label-painted-pilot-v3.json');
const evidence=process.env.EVIDENCE_DIR||path.resolve(__dirname,'../.omo/evidence/codex-continuation-20261010/label-current-contracts/label-painted-glyphs');
// Use the parent's running candidate; preserve its query when choosing an entry.
function entryUrl() {
  const supplied = process.env.RELEASE_URL || process.env.EXAM_URL || process.env.PREVIEW_URL;
  assert.ok(supplied, 'RELEASE_URL, EXAM_URL or PREVIEW_URL is required; this test never starts a server');
  const entry = new URL(supplied);
  if (process.env.APP_ENTRY) entry.pathname = process.env.APP_ENTRY;
  return entry.href;
}

test('native painted bounds exclude empty font em space and retain outside-canvas fallback ink',{timeout:60000},async()=>{
 fs.mkdirSync(evidence,{recursive:true});const browser=await chromium.launch({headless:true});
 try {const page=await browser.newPage();await installLabelSourcePage(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(entryUrl(),{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async fixture=>{
  const {createEditableLabelComposite}=await import('/js/ai-label-composite.js?v=1.7.0-four-session-integration');
  const c=document.createElement('canvas');c.width=1024;c.height=768;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
  const plan={version:4,frozen:true,labels:fixture.labels.map(l=>({...l,targetReviewRequired:true})),uncertainties:[]};
  const before=JSON.stringify(plan),composite=await createEditableLabelComposite({plan,candidateDataUrl:c.toDataURL(),artboard:{w:210,h:297}});
  // Keep the retained pilot byte-for-byte; force outside-canvas ink in a
  // separate adversarial plan instead of requiring an old source-fit artifact.
  const clippedPlan=structuredClone(plan);
  const clippedCaption=clippedPlan.labels.find(l=>l.id==='label-caption');
  clippedCaption.position.x=.001;
  clippedCaption.anchor.x=.001;
  const clippedBefore=JSON.stringify(clippedPlan);
  const clippedComposite=await createEditableLabelComposite({plan:clippedPlan,candidateDataUrl:c.toDataURL(),artboard:{w:210,h:297}});
  const raster=new Image();raster.src=composite.attachment.data;await raster.decode();ctx.drawImage(raster,0,0);
  const pixels=ctx.getImageData(0,0,c.width,c.height).data,counts={};
  for(const m of composite.report.measurements){const b=m.glyphBounds;if(!b)continue;let outside=0,inside=0;const source=plan.labels.find(l=>l.id===m.id);for(let y=Math.max(0,Math.floor((source.position.y-.1)*c.height));y<Math.min(c.height,Math.ceil((source.position.y+.1)*c.height));y++)for(let x=Math.max(0,Math.floor((source.position.x-.08)*c.width));x<Math.min(c.width,Math.ceil((source.position.x+.08)*c.width));x++){const i=(y*c.width+x)*4;if(pixels[i]<100&&pixels[i+1]<100&&pixels[i+2]<100){if(x<b.x*c.width-1||x>(b.x+b.w)*c.width+1||y<b.y*c.height-1||y>(b.y+b.h)*c.height+1)outside++;else inside++;}}counts[m.id]={inside,outside};}
  const leaders={version:4,frozen:true,labels:[
   {id:'translated-leader',text:'온도',scope:'general',mode:'leader',contentMode:'plain',position:{x:.7,y:.5},anchor:{x:.2,y:.8},typography:{role:'text',bounds:{x:.65,y:.47,w:.1,h:.06}},leaderArrowHead:'target'},
   {id:'rotated-formula-leader',text:'\\frac{m_B}{v}',scope:'general',mode:'leader',contentMode:'formula',position:{x:.65,y:.25},anchor:{x:.2,y:.75},typography:{role:'quantity',rotation:35,bounds:{x:.575,y:.175,w:.15,h:.15}},leaderArrowHead:'none'}
  ],uncertainties:[]};
  ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
  const leaderComposite=await createEditableLabelComposite({plan:leaders,candidateDataUrl:c.toDataURL(),artboard:{w:210,h:297}});
  return {composite,leaderComposite,clippedComposite,clippedPlan,counts,sourceUnchanged:before===JSON.stringify(plan),clippedSourceUnchanged:clippedBefore===JSON.stringify(clippedPlan)};
 },fixture);
 fs.writeFileSync(path.join(evidence,'painted-glyph-native.png'),Buffer.from(result.composite.attachment.data.split(',')[1],'base64'));delete result.composite.attachment;
 fs.writeFileSync(path.join(evidence,'painted-leader-native.png'),Buffer.from(result.leaderComposite.attachment.data.split(',')[1],'base64'));delete result.leaderComposite.attachment;
 fs.writeFileSync(path.join(evidence,'painted-clipped-native.png'),Buffer.from(result.clippedComposite.attachment.data.split(',')[1],'base64'));delete result.clippedComposite.attachment;
 fs.writeFileSync(path.join(evidence,'painted-glyph-result.json'),JSON.stringify(result,null,2));
 assert.equal(result.sourceUnchanged,true);assert.equal(result.composite.report.measurements.length,3);
 for(const m of result.composite.report.measurements){assert.equal(m.paintedGlyphMeasurement.method,'native-svg-alpha-raster-v1');assert.ok(m.paintedGlyphMeasurement.paintedPixels>0);assert.ok(m.glyphBounds.w>0);assert.equal(m.presentation.fontSizeMm,3.7);assert.deepEqual(m.planned,fixture.labels.find(l=>l.id===m.id).typography.bounds);}
 const minus=result.composite.report.measurements.find(m=>m.id==='label-minus');assert.ok(minus.glyphBounds.h<minus.emBounds.h*.6,JSON.stringify(minus));assert.ok(result.counts['label-minus'].inside>0);assert.equal(result.counts['label-minus'].outside,0);
 const caption=result.composite.report.measurements.find(m=>m.id==='label-caption');
 assert.ok(Math.abs(caption.layoutBounds.x+caption.layoutBounds.w/2-fixture.labels[0].position.x)<1e-8,'retained source center is not silently repaired');
 assert.equal(result.composite.report.finalPlacement.checkedLabelIds.length,3);
 assert.equal(result.clippedSourceUnchanged,true);
 assert.equal(result.clippedComposite.report.measurements.length,3);
 for(const m of result.clippedComposite.report.measurements){assert.equal(m.paintedGlyphMeasurement.method,'native-svg-alpha-raster-v1');assert.ok(m.paintedGlyphMeasurement.paintedPixels>0);assert.ok(m.glyphBounds?.w>0);assert.equal(m.presentation.fontSizeMm,3.7);}
 const clipped=result.clippedComposite.report.measurements.find(m=>m.id==='label-caption');
 assert.ok(clipped.glyphBounds.x<0,'out-of-canvas native ink stays measurable without clamping');
 assert.ok(Math.abs(clipped.layoutBounds.x+clipped.layoutBounds.w/2-.001)<1e-8);
 assert.deepEqual(clipped.planned,caption.planned,'the adversarial position does not rewrite source bounds');
 assert.ok(result.clippedComposite.report.finalPlacement.issues.some(i=>i.code==='clipped-final-glyph'&&i.id==='label-caption'));
 assert.equal(result.clippedComposite.report.finalPlacement.checkedLabelIds.length,3);
 for(const m of result.leaderComposite.report.measurements){assert.ok(m.glyphBounds,JSON.stringify(m.paintedGlyphMeasurement));assert.ok(m.glyphBounds.x>.45,'measurement excludes leader route to x=.2');assert.ok(m.glyphBounds.y<.6);assert.ok(m.paintedGlyphMeasurement.paintedPixels>0);assert.ok(Math.abs(m.glyphBounds.x+m.glyphBounds.w/2-m.plannedLeader.position.x)<.04);}
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(evidence,'errors.json'),JSON.stringify(errors));
 } finally {await browser.close();}
});
