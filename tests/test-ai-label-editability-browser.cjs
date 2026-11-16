// Fixed label source: 6e2c55012461859cdc8afb4d9596d3f08d5409b4; current-contract adaptations retain behavior oracles.
const { installLabelSourcePage } = require('./helpers/label-source-browser.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const evidence = process.env.EVIDENCE_DIR || path.resolve(__dirname, '../.omo/evidence/codex-continuation-20261010/label-current-contracts/ai-label-editability');
const runId = process.env.QA_RUN_ID || new Date().toISOString().replace(/[:.]/g, '-');
const out = path.join(evidence, runId);
fs.mkdirSync(out, { recursive: true });
// Use the parent's running candidate; preserve its query when choosing an entry.
function entryUrl() {
  const supplied = process.env.RELEASE_URL || process.env.EXAM_URL || process.env.PREVIEW_URL;
  assert.ok(supplied, 'RELEASE_URL, EXAM_URL or PREVIEW_URL is required; this test never starts a server');
  const entry = new URL(supplied);
  if (process.env.APP_ENTRY) entry.pathname = process.env.APP_ENTRY;
  return entry.href;
}

const representativePatterns = [
  { id:'hangul', text:'세포 호흡', font:'한글 텍스트(돋움)' },
  { id:'hangul-serif', text:'세포 호흡', font:'라벨' },
  { id:'name', text:'A', font:'라벨' },
  { id:'lowercase', text:'p', font:'라벨' },
  { id:'quantity', text:'v', font:'수식' },
  { id:'coefficient', text:'3m', font:'수식' },
  { id:'subscript', text:'m_B', font:'수식' },
  { id:'switch', text:'S_1', font:'라벨' },
  { id:'chemical', text:'CO_2', font:'라벨' },
  { id:'ion', text:'H^+', font:'라벨' },
  { id:'phase', text:'B(g)', font:'라벨' },
  { id:'phase-math', text:'B(g)', font:'수식' },
  { id:'unit', text:'10 L', font:'라벨' },
  { id:'roman', text:'', palette:'I', font:'한글 텍스트(돋움)' },
  { id:'roman-phrase', text:'마찰 구간 ', palette:'III', font:'한글 텍스트(돋움)' },
  { id:'circled-korean', text:'㉠', font:'한글 텍스트(돋움)' },
  { id:'circled-latin', text:'ⓐ', font:'라벨' },
  { id:'circled-P', text:'Ⓟ', font:'라벨' },
  { id:'mixed-comma', text:'ⓑ, CO_2', font:'라벨' },
  { id:'multiline', text:'최종 분해\n산물', font:'한글 텍스트(돋움)' },
  { id:'rotated-unit', text:'60 m', font:'라벨', rotation:43 },
  { id:'missing-source-word', text:'정지', font:'한글 텍스트(돋움)' },
];
async function makePage(browser) {
  const page = await browser.newPage({ viewport:{width:1500,height:1000} });await installLabelSourcePage(page);
  await page.addInitScript(() => localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true'));
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(entryUrl(),{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#canvas');
  await page.evaluate(async()=>{
    const v='?v=1.7.0-four-session-integration';
    const {state,...fonts}=await import('/js/state.js'+v);
    const {serialize,applyLoaded}=await import('/js/project-io.js'+v);
    const {insertImageFromSrc,prepareImageCandidateRevision}=await import('/js/image-paste.js'+v);
    const {parseEditableImageLabelPlan,createEditableImageLabelObjects,withEditableImageLabelPlan}=await import('/js/ai-editable-image-labels.js'+v);
    const {undo,redo,rebuildGroups}=await import('/js/transform.js'+v);
    const {createCandidateMaterializer}=await import('/js/ai-candidate-materializer.js'+v);
    const materializeCandidate=createCandidateMaterializer(state,{insertImageFromSrc,prepareImageCandidateRevision,rebuildGroups});
    const {prepareEditableLabelFonts}=await import('/js/ai-label-typography.js'+v);
    const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=600;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1000,600);
    window.__editabilityQA={state,materializeCandidate,fonts,serialize,applyLoaded,insertImageFromSrc,parseEditableImageLabelPlan,createEditableImageLabelObjects,withEditableImageLabelPlan,undo,redo,prepareEditableLabelFonts,blank:canvas.toDataURL()};
  });
  return {page,errors};
}
async function cancelEditor(page) {
  const inline=page.locator('.ai-inline-label-editor');
  if(await inline.isVisible()){await inline.focus();await page.keyboard.press('Escape');await inline.waitFor({state:'detached'});}
  const editor=page.locator('.unified-text-editor');
  if(await editor.isVisible()){await editor.getByRole('button',{name:'취소',exact:true}).click();await editor.waitFor({state:'detached'});}
}
async function reset(page) {
  await cancelEditor(page);
  await page.evaluate(()=>{const q=window.__editabilityQA;q.applyLoaded(q.state,{version:'0.17',pages:[{id:'qa',objects:[],artboard:{w:90,h:60}}],activePageId:'qa'});q.state.update(s=>{s.activeTool='V';s.selectedIds=[];s.draft=null;});});
}
async function object(page,id) {
  return page.evaluate(id=>structuredClone(window.__editabilityQA.state.get().objects.find(o=>o.id===id)),id);
}
function canonical(o) { return o.rawSource || o.source || o.text || ''; }
async function glyphs(page,id) {
  return page.evaluate(id=>{
    const root=document.querySelector(`#scene [data-id="${id}"]:not([data-ui])`);
    const texts=root?[...(root.matches('text')?[root]:[]),...root.querySelectorAll('text')]:[];
    const rects=texts.map(e=>e.getBoundingClientRect()).filter(r=>r.width&&r.height);
    if(!rects.length)return null;
    const left=Math.min(...rects.map(r=>r.left)),right=Math.max(...rects.map(r=>r.right)),top=Math.min(...rects.map(r=>r.top)),bottom=Math.max(...rects.map(r=>r.bottom));
    // Both presses must use the real full glyph-block center, including when
    // selection places an endpoint handle there. Do not route around that UI.
    return {point:{x:(left+right)/2,y:(top+bottom)/2},rect:{left,right,top,bottom},fonts:texts.map(e=>({text:e.textContent,family:e.getAttribute('font-family')||getComputedStyle(e).fontFamily,style:e.getAttribute('font-style')||getComputedStyle(e).fontStyle,size:parseFloat(e.getAttribute('font-size')||getComputedStyle(e).fontSize),x:parseFloat(e.getAttribute('x')),y:parseFloat(e.getAttribute('y'))})),svg:root.outerHTML};
  },id);
}
async function openByCenter(page,id,expected) {
  await page.evaluate(()=>window.__editabilityQA.state.update(s=>{s.selectedIds=[];s.targetedId=null;s.activeTool='V';}));
  const render=await glyphs(page,id);assert.ok(render,`Missing rendered glyphs: ${id}`);
  const snapshot=()=>page.evaluate(id=>{const s=window.__editabilityQA.state.get();return{object:structuredClone(s.objects.find(o=>o.id===id)),undo:s.undoStack.length,redo:s.redoStack.length};},id);
  const before=await snapshot(),native=before.object;
  await page.mouse.click(render.point.x,render.point.y);
  await page.waitForFunction(id=>{const ids=window.__editabilityQA.state.get().selectedIds;return ids.length===1&&ids[0]===id;},id);
  const editor=page.locator('.unified-text-editor'),inline=page.locator('.ai-inline-label-editor');
  assert.equal(await inline.count(),0,'first glyph-center click selects');assert.equal(await editor.count(),0);
  assert.deepEqual(await snapshot(),before,'selection must preserve object and history');
  const inlineEligible=native.type==='labeler'||native.aiAutoLabel&&native.aiParentImageId&&['text','formula'].includes(native.type);
  await page.mouse.click(render.point.x,render.point.y);
  if(inlineEligible){
    await inline.waitFor({state:'visible'});
    assert.equal(await inline.inputValue(),expected,'second click edits full canonical source inline, never one styled fragment');
    assert.equal(await editor.count(),0,'click-again does not open the details dialog');
    const bounds=await inline.boundingBox();assert.ok(bounds&&bounds.width>0&&bounds.height>0);
    render.inlineBounds=bounds;
    await inline.fill(expected+' 임시 변경');await page.keyboard.press('Escape');await inline.waitFor({state:'detached'});
    render.interactionContract='selection / inline / cancel / explicit details icon';
  }else{
    // Ordinary manually created text retains its existing full-editor behavior;
    // editable AI labels and every labeler use the inline contract above.
    await editor.waitFor({state:'visible'});assert.equal(await editor.locator('textarea').inputValue(),expected);
    await editor.locator('textarea').fill(expected+' 임시 변경');await page.keyboard.press('Escape');await editor.waitFor({state:'detached'});
    render.interactionContract='ordinary native text: selection / editor / cancel / explicit details icon';
  }
  assert.deepEqual(await snapshot(),before,'cancel must preserve all source/style/bounds/owner fields and history');
  const toggle=page.locator('#drawer-right-toggle');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
  await page.waitForFunction(()=>document.querySelector('.panel-right').getBoundingClientRect().right<=innerWidth+1);
  const detail=page.locator('#inspector [data-text-detail-edit]:visible');assert.equal(await detail.count(),1);assert.equal(await detail.getAttribute('aria-label'),'텍스트 상세 편집');
  await detail.click();await editor.waitFor({state:'visible'});
  assert.equal(await inline.count(),0);assert.equal(await editor.locator('textarea').inputValue(),expected,'Details must open full canonical source, not one styled fragment');
  return {editor,render};
}
async function confirm(editor) { await editor.getByRole('button',{name:'확인',exact:true}).click(); }
function roundtripDiff(before,after,location='$') {
  if(Object.is(before,after))return [];
  if(before===null||after===null||typeof before!=='object'||typeof after!=='object'||Array.isArray(before)!==Array.isArray(after))return [{path:location,kind:'changed',before,after}];
  const differences=[];
  for(const key of new Set([...Object.keys(before),...Object.keys(after)])) {
    const beforePresent=Object.hasOwn(before,key),afterPresent=Object.hasOwn(after,key),at=`${location}[${JSON.stringify(key)}]`;
    if(!beforePresent||!afterPresent)differences.push({path:at,kind:beforePresent?'removed':'added',beforePresent,afterPresent,before:before[key],after:after[key]});
    else differences.push(...roundtripDiff(before[key],after[key],at));
  }
  return differences;
}
let roundtripReceipt=0;
async function roundtrip(page,label='roundtrip',captureAlways=false) {
  const captured=await page.evaluate(captureAlways=>{
    const q=window.__editabilityQA;
    // applyLoaded backfills image.recognized=false on newly inserted images.
    // Compare every native-label field exactly while normalizing that image-only default.
    const normalized=objects=>objects.map(o=>o.type==='image'?{recognized:false,...o}:o);
    const before=structuredClone(q.state.get().objects),serialized=JSON.parse(JSON.stringify(q.serialize(q.state.get())));
    q.applyLoaded(q.state,JSON.parse(JSON.stringify(serialized)));
    const reopened=structuredClone(q.state.get().objects),equal=JSON.stringify(normalized(before))===JSON.stringify(normalized(reopened));
    return equal&&!captureAlways?{equal}:{equal,before,serialized,reopened,normalizedBefore:normalized(before),normalizedReopened:normalized(reopened)};
  },captureAlways);
  if(!captured.equal||captureAlways) {
    const serializedObjects=captured.serialized.pages.find(p=>p.id===captured.serialized.activePageId).objects;
    const byId=objects=>new Map(objects.map(o=>[o.id,o])),beforeById=byId(captured.before),serializedById=byId(serializedObjects),reopenedById=byId(captured.reopened);
    captured.differences={beforeToSerialized:roundtripDiff(captured.before,serializedObjects),beforeToReopened:roundtripDiff(captured.before,captured.reopened),normalizedBeforeToReopened:roundtripDiff(captured.normalizedBefore,captured.normalizedReopened)};
    captured.objectDifferences=[...new Set([...beforeById.keys(),...serializedById.keys(),...reopenedById.keys()])].map(id=>({id,beforeToSerialized:roundtripDiff(beforeById.get(id),serializedById.get(id)),beforeToReopened:roundtripDiff(beforeById.get(id),reopenedById.get(id))}));
    captured.objectOrder={before:captured.before.map(o=>o.id),serialized:serializedObjects.map(o=>o.id),reopened:captured.reopened.map(o=>o.id)};
    captured.normalizedValueDifferences=captured.differences.normalizedBeforeToReopened.length;
    save(`roundtrip-${String(++roundtripReceipt).padStart(3,'0')}-${label.replace(/[^A-Za-z0-9_-]/g,'_')}.json`,captured);
  }
  // Keep the original complete-object oracle, including property order and all
  // foreign-owner fields. Diagnostics must never turn a mismatch into success.
  return captured.equal;
}
async function exercise(page,id,row,screenshot=false) {
  row.before=await object(page,id);const original=canonical(row.before);
  const first=await openByCenter(page,id,original);row.initialCenter=true;row.originalRender=first.render;
  if(screenshot)await first.editor.screenshot({path:path.join(out,row.id.replace(/[^A-Za-z0-9_-]/g,'_')+'-editor.png')});
  const noOpHistory=await page.evaluate(()=>({undo:window.__editabilityQA.state.get().undoStack.length,redo:window.__editabilityQA.state.get().redoStack.length}));
  await confirm(first.editor);row.noop=await object(page,id);
  assert.deepEqual(row.noop,row.before,'No-op must preserve the entire object');
  assert.deepEqual(await page.evaluate(()=>({undo:window.__editabilityQA.state.get().undoStack.length,redo:window.__editabilityQA.state.get().redoStack.length})),noOpHistory,'No-op must not consume history');
  assert.deepEqual(row.noop.labelRuns,row.before.labelRuns,'No-op must preserve semantic runs');
  assert.deepEqual(row.noop.labelScriptStyles,row.before.labelScriptStyles,'No-op must preserve script styles');
  const sized=await openByCenter(page,id,original);await sized.editor.locator('.unified-style-size').selectOption('14');await confirm(sized.editor);
  row.resized=await object(page,id);assert.ok(Math.abs((row.resized.fontSize||row.resized.labelSize)-14*25.4/72)<1e-8,'UI size edit must update object');
  assert.deepEqual(row.resized.labelRuns,row.before.labelRuns,'Size-only edit must preserve semantic runs');
  assert.deepEqual(row.resized.labelScriptStyles,row.before.labelScriptStyles,'Size-only edit must preserve script styles');
  const changed=original+(row.resized.type==='formula'||row.resized.contentMode==='formula'?' + 1':' 검수');
  const edit=await openByCenter(page,id,original);await edit.editor.locator('textarea').fill(changed);await confirm(edit.editor);row.edited=await object(page,id);assert.equal(canonical(row.edited),changed);
  row.undoRedo=await page.evaluate(({id,original,changed})=>{const q=window.__editabilityQA;const content=()=>{const o=q.state.get().objects.find(x=>x.id===id);return o&&(o.rawSource||o.source||o.text||'');};q.undo(q.state);const undone=content()===original;q.redo(q.state);return undone&&content()===changed;},{id,original,changed});assert.ok(row.undoRedo,'Edit undo/redo must preserve whole canonical source');
  row.roundtrip=await roundtrip(page);assert.ok(row.roundtrip,'Project serialization must preserve object metadata');
  const reload=await openByCenter(page,id,changed);row.reloadedCenter=true;await confirm(reload.editor);
  row.pass=true;
}
async function captureFailure(page,row,e) {
  row.pass=false;row.error=e.stack;
  try {
    if(row.before?.id)row.failureRender=await glyphs(page,row.before.id);
    row.failureControls=await page.evaluate(({id,point})=>{
      const s=window.__editabilityQA.state.get(),target=point?document.elementFromPoint(point.x,point.y):null;
      const shown=selector=>[...document.querySelectorAll(selector)].map(el=>({visible:el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0,source:el.matches('textarea')?el.value:el.querySelector('textarea')?.value}));
      return {activeTool:s.activeTool,selectedIds:s.selectedIds,targetedId:s.targetedId,object:s.objects.find(o=>o.id===id),undoCount:s.undoStack.length,redoCount:s.redoStack.length,
        center:point,targetAtCenter:target?.outerHTML.slice(0,3000),handleAtCenter:target?.closest('[data-handle]')?.dataset.handle,
        inlineEditors:shown('.ai-inline-label-editor'),detailsEditors:shown('.unified-text-editor'),draftText:s.draftText};
    },{id:row.before?.id,point:row.failureRender?.point});
  } catch(error) { row.controlCaptureError=error.stack; }
  try{await page.screenshot({path:path.join(out,row.id.replace(/[^A-Za-z0-9_-]/g,'_')+'-failure.png')});}catch(error){row.screenshotCaptureError=error.stack;}
}
function save(name,data) { fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2)); }

// Fixtures are copied from visually corrected 123-occurrence inventory and existing generation plans.
// Positions below are isolated at the canvas center for pointer checks. Bounds remain estimates.
// No image-generation tool or remote generation endpoint is called by this suite.
const SOURCE_LABELS = [
  {"text":"㉠","evidence":"㉠","sourceKind":"reference","sourceRef":1,"mode":"leader","labelType":"label","contentMode":"plain","anchor":{"x":0.471,"y":0.278},"position":{"x":0.079,"y":0.097},"typography":{"role":"symbol","bounds":{"x":0.035,"y":0.064,"w":0.088,"h":0.067},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b1_2023_06_05:1"},
  {"text":"㉡","evidence":"㉡","sourceKind":"reference","sourceRef":1,"mode":"leader","labelType":"label","contentMode":"plain","anchor":{"x":0.43,"y":0.626},"position":{"x":0.078,"y":0.419},"typography":{"role":"symbol","bounds":{"x":0.033,"y":0.386,"w":0.089,"h":0.066},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b1_2023_06_05:2"},
  {"text":"㉢","evidence":"㉢","sourceKind":"reference","sourceRef":1,"mode":"leader","labelType":"label","contentMode":"plain","anchor":{"x":0.515,"y":0.819},"position":{"x":0.078,"y":0.801},"typography":{"role":"symbol","bounds":{"x":0.033,"y":0.768,"w":0.089,"h":0.067},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b1_2023_06_05:3"},
  {"text":"ⓐ","evidence":"ⓐ","sourceKind":"reference","sourceRef":1,"mode":"leader","labelType":"label","contentMode":"plain","anchor":{"x":0.185,"y":0.238},"position":{"x":0.058,"y":0.196},"typography":{"role":"symbol","bounds":{"x":0.033,"y":0.153,"w":0.049,"h":0.087},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b1_2023_06_02:1"},
  {"text":"포도당","evidence":"포도당","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.187,"y":0.073},"position":{"x":0.187,"y":0.073},"typography":{"role":"text","bounds":{"x":0.124,"y":0.035,"w":0.128,"h":0.074},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b1_2023_06_02:2"},
  {"text":"세포 호흡","evidence":"세포 호흡","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.184,"y":0.413},"position":{"x":0.184,"y":0.413},"typography":{"role":"text","bounds":{"x":0.091,"y":0.375,"w":0.186,"h":0.078},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b1_2023_06_02:3"},
  {"text":"에너지","evidence":"에너지","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.394,"y":0.349},"position":{"x":0.394,"y":0.349},"typography":{"role":"text","bounds":{"x":0.331,"y":0.311,"w":0.126,"h":0.077},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b1_2023_06_02:4"},
  {"text":"열","evidence":"열","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.543,"y":0.148},"position":{"x":0.543,"y":0.148},"typography":{"role":"text","bounds":{"x":0.524,"y":0.111,"w":0.038,"h":0.074},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b1_2023_06_02:5"},
  {"text":"Ⓟ","evidence":"Ⓟ","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.545,"y":0.52},"position":{"x":0.545,"y":0.52},"typography":{"role":"name","bounds":{"x":0.521,"y":0.476,"w":0.047,"h":0.085},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b1_2023_06_02:6"},
  {"text":"㉠","evidence":"㉠","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.686,"y":0.237},"position":{"x":0.686,"y":0.237},"typography":{"role":"symbol","bounds":{"x":0.66,"y":0.193,"w":0.052,"h":0.089},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b1_2023_06_02:7"},
  {"text":"㉡","evidence":"㉡","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.688,"y":0.591},"position":{"x":0.688,"y":0.591},"typography":{"role":"symbol","bounds":{"x":0.661,"y":0.548,"w":0.053,"h":0.089},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b1_2023_06_02:8"},
  {"text":"Ⓟ","evidence":"Ⓟ","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.827,"y":0.515},"position":{"x":0.827,"y":0.515},"typography":{"role":"name","bounds":{"x":0.803,"y":0.472,"w":0.048,"h":0.085},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b1_2023_06_02:9"},
  {"text":"생명\n활동","evidence":"생명\n활동","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.937,"y":0.412},"position":{"x":0.937,"y":0.412},"typography":{"role":"text","bounds":{"x":0.918,"y":0.231,"w":0.038,"h":0.359},"orientation":"vertical","rotation":0},"scope":"non_graph_vertical_deferred","owner":"diagram","inventoryId":"b1_2023_06_02:10"},
  {"text":"최종 분해 산물","evidence":"최종 분해 산물","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.185,"y":0.746},"position":{"x":0.185,"y":0.746},"typography":{"role":"text","bounds":{"x":0.041,"y":0.704,"w":0.288,"h":0.084},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b1_2023_06_02:11"},
  {"text":"ⓑ","evidence":"ⓑ","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.128,"y":0.888},"position":{"x":0.128,"y":0.888},"typography":{"role":"symbol","bounds":{"x":0.103,"y":0.845,"w":0.05,"h":0.086},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b1_2023_06_02:12"},
  {"text":"CO_2","evidence":"CO_2","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"formula","anchor":{"x":0.231,"y":0.89},"position":{"x":0.231,"y":0.89},"typography":{"role":"chemical","bounds":{"x":0.195,"y":0.852,"w":0.073,"h":0.076},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b1_2023_06_02:13"},
  {"text":"n","evidence":"n","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.572,"y":0.23},"position":{"x":0.572,"y":0.23},"typography":{"role":"name","bounds":{"x":0.549,"y":0.19,"w":0.047,"h":0.08},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_16:1"},
  {"text":"p","evidence":"p","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.572,"y":0.337},"position":{"x":0.572,"y":0.337},"typography":{"role":"name","bounds":{"x":0.55,"y":0.298,"w":0.046,"h":0.078},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_16:2"},
  {"text":"a","evidence":"a","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.35,"y":0.347},"position":{"x":0.35,"y":0.347},"typography":{"role":"name","bounds":{"x":0.329,"y":0.31,"w":0.043,"h":0.073},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_16:3"},
  {"text":"S_1","evidence":"S_1","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"formula","anchor":{"x":0.458,"y":0.456},"position":{"x":0.458,"y":0.456},"typography":{"role":"quantity","bounds":{"x":0.421,"y":0.414,"w":0.075,"h":0.085},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_16:4"},
  {"text":"G","evidence":"G","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.728,"y":0.515},"position":{"x":0.728,"y":0.515},"typography":{"role":"name","bounds":{"x":0.701,"y":0.48,"w":0.054,"h":0.07},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_16:5"},
  {"text":"검류계","evidence":"검류계","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.891,"y":0.517},"position":{"x":0.891,"y":0.517},"typography":{"role":"text","bounds":{"x":0.797,"y":0.483,"w":0.188,"h":0.068},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_16:6"},
  {"text":"b","evidence":"b","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.349,"y":0.686},"position":{"x":0.349,"y":0.686},"typography":{"role":"name","bounds":{"x":0.329,"y":0.648,"w":0.04,"h":0.076},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_16:7"},
  {"text":"X","evidence":"X","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.092,"y":0.798},"position":{"x":0.092,"y":0.798},"typography":{"role":"name","bounds":{"x":0.061,"y":0.757,"w":0.061,"h":0.082},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_16:8"},
  {"text":"S_2","evidence":"S_2","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"formula","anchor":{"x":0.297,"y":0.875},"position":{"x":0.297,"y":0.875},"typography":{"role":"quantity","bounds":{"x":0.253,"y":0.833,"w":0.087,"h":0.084},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_16:9"},
  {"text":"실","evidence":"실","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.139,"y":0.313},"position":{"x":0.139,"y":0.313},"typography":{"role":"text","bounds":{"x":0.126,"y":0.286,"w":0.026,"h":0.054},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:1"},
  {"text":"A","evidence":"A","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.103,"y":0.576},"position":{"x":0.103,"y":0.576},"typography":{"role":"name","bounds":{"x":0.089,"y":0.548,"w":0.028,"h":0.056},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:2"},
  {"text":"3m","evidence":"3m","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"formula","anchor":{"x":0.163,"y":0.577},"position":{"x":0.163,"y":0.577},"typography":{"role":"quantity","bounds":{"x":0.136,"y":0.548,"w":0.054,"h":0.058},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:3"},
  {"text":"S","evidence":"S","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.232,"y":0.555},"position":{"x":0.232,"y":0.555},"typography":{"role":"name","bounds":{"x":0.22,"y":0.529,"w":0.024,"h":0.052},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:4"},
  {"text":"m_B","evidence":"m_B","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"formula","anchor":{"x":0.273,"y":0.334},"position":{"x":0.273,"y":0.334},"typography":{"role":"quantity","bounds":{"x":0.24,"y":0.302,"w":0.066,"h":0.064},"rotation":0,"scriptStyles":[{"start":2,"end":3,"kind":"sub","role":"name"}]},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:5"},
  {"text":"B","evidence":"B","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.337,"y":0.347},"position":{"x":0.337,"y":0.347},"typography":{"role":"name","bounds":{"x":0.323,"y":0.319,"w":0.028,"h":0.056},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:6"},
  {"text":"d","evidence":"d","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"formula","anchor":{"x":0.376,"y":0.474},"position":{"x":0.376,"y":0.474},"typography":{"role":"quantity","bounds":{"x":0.363,"y":0.446,"w":0.026,"h":0.056},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:7"},
  {"text":"m_C","evidence":"m_C","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"formula","anchor":{"x":0.273,"y":0.744},"position":{"x":0.273,"y":0.744},"typography":{"role":"quantity","bounds":{"x":0.24,"y":0.712,"w":0.066,"h":0.064},"rotation":0,"scriptStyles":[{"start":2,"end":3,"kind":"sub","role":"name"}]},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:8"},
  {"text":"C","evidence":"C","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.338,"y":0.76},"position":{"x":0.338,"y":0.76},"typography":{"role":"name","bounds":{"x":0.324,"y":0.732,"w":0.028,"h":0.056},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:9"},
  {"text":"수평면","evidence":"수평면","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.365,"y":0.833},"position":{"x":0.365,"y":0.833},"typography":{"role":"text","bounds":{"x":0.309,"y":0.8,"w":0.112,"h":0.066},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:10"},
  {"text":"(가)","evidence":"(가)","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.221,"y":0.949},"position":{"x":0.221,"y":0.949},"typography":{"role":"symbol","bounds":{"x":0.179,"y":0.914,"w":0.084,"h":0.07},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:11"},
  {"text":"실","evidence":"실","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.701,"y":0.313},"position":{"x":0.701,"y":0.313},"typography":{"role":"text","bounds":{"x":0.688,"y":0.286,"w":0.026,"h":0.054},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:12"},
  {"text":"C","evidence":"C","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.665,"y":0.502},"position":{"x":0.665,"y":0.502},"typography":{"role":"name","bounds":{"x":0.651,"y":0.474,"w":0.028,"h":0.056},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:13"},
  {"text":"m_C","evidence":"m_C","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"formula","anchor":{"x":0.727,"y":0.502},"position":{"x":0.727,"y":0.502},"typography":{"role":"quantity","bounds":{"x":0.694,"y":0.47,"w":0.066,"h":0.064},"rotation":0,"scriptStyles":[{"start":2,"end":3,"kind":"sub","role":"name"}]},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:14"},
  {"text":"S","evidence":"S","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.79,"y":0.586},"position":{"x":0.79,"y":0.586},"typography":{"role":"name","bounds":{"x":0.778,"y":0.56,"w":0.024,"h":0.052},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:15"},
  {"text":"3m","evidence":"3m","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"formula","anchor":{"x":0.831,"y":0.419},"position":{"x":0.831,"y":0.419},"typography":{"role":"quantity","bounds":{"x":0.804,"y":0.39,"w":0.054,"h":0.058},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:16"},
  {"text":"A","evidence":"A","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.897,"y":0.335},"position":{"x":0.897,"y":0.335},"typography":{"role":"name","bounds":{"x":0.883,"y":0.307,"w":0.028,"h":0.056},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:17"},
  {"text":"d","evidence":"d","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"formula","anchor":{"x":0.934,"y":0.515},"position":{"x":0.934,"y":0.515},"typography":{"role":"quantity","bounds":{"x":0.921,"y":0.487,"w":0.026,"h":0.056},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:18"},
  {"text":"m_B","evidence":"m_B","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"formula","anchor":{"x":0.831,"y":0.744},"position":{"x":0.831,"y":0.744},"typography":{"role":"quantity","bounds":{"x":0.798,"y":0.712,"w":0.066,"h":0.064},"rotation":0,"scriptStyles":[{"start":2,"end":3,"kind":"sub","role":"name"}]},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:19"},
  {"text":"B","evidence":"B","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.895,"y":0.76},"position":{"x":0.895,"y":0.76},"typography":{"role":"name","bounds":{"x":0.881,"y":0.732,"w":0.028,"h":0.056},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:20"},
  {"text":"수평면","evidence":"수평면","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.923,"y":0.833},"position":{"x":0.923,"y":0.833},"typography":{"role":"text","bounds":{"x":0.867,"y":0.8,"w":0.112,"h":0.066},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:21"},
  {"text":"(나)","evidence":"(나)","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.779,"y":0.949},"position":{"x":0.779,"y":0.949},"typography":{"role":"symbol","bounds":{"x":0.737,"y":0.914,"w":0.084,"h":0.07},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p1_2027_06_10:22"},
  {"text":"p","evidence":"p","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.083,"y":0.205},"position":{"x":0.083,"y":0.205},"typography":{"role":"name","bounds":{"x":0.075,"y":0.151,"w":0.018,"h":0.083},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p2_2027_06_13:1"},
  {"text":"v","evidence":"v","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"plain","anchor":{"x":0.137,"y":0.126},"position":{"x":0.137,"y":0.126},"typography":{"role":"quantity","bounds":{"x":0.128,"y":0.083,"w":0.019,"h":0.068},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p2_2027_06_13:2"},
  {"text":"5h","evidence":"5h","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"plain","anchor":{"x":0.062,"y":0.457},"position":{"x":0.062,"y":0.457},"typography":{"role":"quantity","bounds":{"x":0.043,"y":0.407,"w":0.038,"h":0.083},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p2_2027_06_13:3"},
  {"text":"h","evidence":"h","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"plain","anchor":{"x":0.13,"y":0.472},"position":{"x":0.13,"y":0.472},"typography":{"role":"quantity","bounds":{"x":0.121,"y":0.426,"w":0.018,"h":0.083},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p2_2027_06_13:4"},
  {"text":"마찰 구간 I","evidence":"마찰 구간 I","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.209,"y":0.709},"position":{"x":0.209,"y":0.709},"typography":{"role":"text","bounds":{"x":0.142,"y":0.657,"w":0.136,"h":0.083},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p2_2027_06_13:5"},
  {"text":"q","evidence":"q","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.389,"y":0.843},"position":{"x":0.389,"y":0.843},"typography":{"role":"name","bounds":{"x":0.381,"y":0.79,"w":0.018,"h":0.08},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p2_2027_06_13:6"},
  {"text":"마찰 구간 II","evidence":"마찰 구간 II","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.482,"y":0.91},"position":{"x":0.482,"y":0.91},"typography":{"role":"text","bounds":{"x":0.414,"y":0.858,"w":0.139,"h":0.083},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p2_2027_06_13:7"},
  {"text":"정지","evidence":"정지","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.777,"y":0.315},"position":{"x":0.777,"y":0.315},"typography":{"role":"text","bounds":{"x":0.751,"y":0.265,"w":0.052,"h":0.083},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p2_2027_06_13:8"},
  {"text":"d","evidence":"d","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"plain","anchor":{"x":0.742,"y":0.602},"position":{"x":0.742,"y":0.602},"typography":{"role":"quantity","bounds":{"x":0.733,"y":0.552,"w":0.019,"h":0.08},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p2_2027_06_13:9"},
  {"text":"마찰 구간 III","evidence":"마찰 구간 III","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.779,"y":0.709},"position":{"x":0.779,"y":0.709},"typography":{"role":"text","bounds":{"x":0.708,"y":0.657,"w":0.145,"h":0.083},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p2_2027_06_13:10"},
  {"text":"2h","evidence":"2h","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"plain","anchor":{"x":0.943,"y":0.633},"position":{"x":0.943,"y":0.633},"typography":{"role":"quantity","bounds":{"x":0.927,"y":0.58,"w":0.033,"h":0.083},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p2_2027_06_13:11"},
  {"text":"수평면","evidence":"수평면","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.95,"y":0.852},"position":{"x":0.95,"y":0.852},"typography":{"role":"text","bounds":{"x":0.911,"y":0.799,"w":0.077,"h":0.083},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"p2_2027_06_13:12"},
  {"text":"피스톤","evidence":"피스톤","sourceKind":"reference","sourceRef":1,"mode":"leader","labelType":"label","contentMode":"plain","anchor":{"x":0.728,"y":0.246},"position":{"x":0.773,"y":0.091},"typography":{"role":"text","bounds":{"x":0.719,"y":0.049,"w":0.109,"h":0.079},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"c2_2027_06_14:1"},
  {"text":"B(g)","evidence":"B(g)","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"formula","anchor":{"x":0.202,"y":0.432},"position":{"x":0.202,"y":0.432},"typography":{"role":"chemical","bounds":{"x":0.155,"y":0.374,"w":0.094,"h":0.104},"rotation":0,"runs":[{"text":"B(","role":"chemical","contentMode":"plain"},{"text":"g","role":"quantity","contentMode":"plain"},{"text":")","role":"unit","contentMode":"plain"}]},"scope":"general","owner":"diagram","inventoryId":"c2_2027_06_14:2"},
  {"text":"C(g)","evidence":"C(g)","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"formula","anchor":{"x":0.314,"y":0.432},"position":{"x":0.314,"y":0.432},"typography":{"role":"chemical","bounds":{"x":0.266,"y":0.374,"w":0.096,"h":0.104},"rotation":0,"runs":[{"text":"C(","role":"chemical","contentMode":"plain"},{"text":"g","role":"quantity","contentMode":"plain"},{"text":")","role":"unit","contentMode":"plain"}]},"scope":"general","owner":"diagram","inventoryId":"c2_2027_06_14:3"},
  {"text":"10 L","evidence":"10 L","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.258,"y":0.581},"position":{"x":0.258,"y":0.581},"typography":{"role":"number","bounds":{"x":0.221,"y":0.531,"w":0.074,"h":0.085},"rotation":0,"runs":[{"text":"10","role":"number","contentMode":"plain"},{"text":" L","role":"unit","contentMode":"plain"}]},"scope":"general","owner":"diagram","inventoryId":"c2_2027_06_14:4"},
  {"text":"A(s)","evidence":"A(s)","sourceKind":"reference","sourceRef":1,"mode":"leader","labelType":"quantity","contentMode":"formula","anchor":{"x":0.264,"y":0.8},"position":{"x":0.065,"y":0.648},"typography":{"role":"chemical","bounds":{"x":0.019,"y":0.596,"w":0.093,"h":0.091},"rotation":0,"runs":[{"text":"A(","role":"chemical","contentMode":"plain"},{"text":"s","role":"quantity","contentMode":"plain"},{"text":")","role":"unit","contentMode":"plain"}]},"scope":"general","owner":"diagram","inventoryId":"c2_2027_06_14:5"},
  {"text":"꼭지","evidence":"꼭지","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.438,"y":0.642},"position":{"x":0.438,"y":0.642},"typography":{"role":"text","bounds":{"x":0.399,"y":0.592,"w":0.078,"h":0.088},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"c2_2027_06_14:6"},
  {"text":"진공","evidence":"진공","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.602,"y":0.5},"position":{"x":0.602,"y":0.5},"typography":{"role":"text","bounds":{"x":0.562,"y":0.448,"w":0.081,"h":0.088},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"c2_2027_06_14:7"},
  {"text":"1 atm","evidence":"1 atm","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.857,"y":0.496},"position":{"x":0.857,"y":0.496},"typography":{"role":"number","bounds":{"x":0.8,"y":0.447,"w":0.114,"h":0.085},"rotation":0,"runs":[{"text":"1","role":"number","contentMode":"plain"},{"text":" atm","role":"unit","contentMode":"plain"}]},"scope":"general","owner":"diagram","inventoryId":"c2_2027_06_14:8"},
  {"text":"고정 장치","evidence":"고정 장치","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.738,"y":0.921},"position":{"x":0.738,"y":0.921},"typography":{"role":"text","bounds":{"x":0.637,"y":0.865,"w":0.202,"h":0.101},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"c2_2027_06_14:9"},
  {"text":"Na^+의\n몰 농도(M)","evidence":"Na^+의\n몰 농도(M)","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.184,"y":0.162},"position":{"x":0.184,"y":0.162},"typography":{"role":"text","bounds":{"x":0.031,"y":0.04,"w":0.306,"h":0.23},"rotation":0,"runs":[{"text":"Na^+","role":"chemical","contentMode":"formula"},{"text":"의\n몰 농도","role":"text","contentMode":"plain"},{"text":"(M)","role":"unit","contentMode":"plain"}]},"scope":"graph","owner":"coordinate_graph","inventoryId":"c1_2027_06_15:1"},
  {"text":"0.6","evidence":"0.6","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.305,"y":0.347},"position":{"x":0.305,"y":0.347},"typography":{"role":"number","bounds":{"x":0.253,"y":0.308,"w":0.103,"h":0.078},"rotation":0},"scope":"graph","owner":"coordinate_graph","inventoryId":"c1_2027_06_15:2"},
  {"text":"0","evidence":"0","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.333,"y":0.611},"position":{"x":0.333,"y":0.611},"typography":{"role":"number","bounds":{"x":0.311,"y":0.576,"w":0.043,"h":0.072},"rotation":0},"scope":"graph","owner":"coordinate_graph","inventoryId":"c1_2027_06_15:3"},
  {"text":"40","evidence":"40","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.486,"y":0.683},"position":{"x":0.486,"y":0.683},"typography":{"role":"number","bounds":{"x":0.445,"y":0.644,"w":0.082,"h":0.078},"rotation":0},"scope":"graph","owner":"coordinate_graph","inventoryId":"c1_2027_06_15:4"},
  {"text":"100","evidence":"100","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.828,"y":0.683},"position":{"x":0.828,"y":0.683},"typography":{"role":"number","bounds":{"x":0.775,"y":0.644,"w":0.107,"h":0.078},"rotation":0},"scope":"graph","owner":"coordinate_graph","inventoryId":"c1_2027_06_15:5"},
  {"text":"삼각 플라스크 속\n수용액의 부피(mL)","evidence":"삼각 플라스크 속\n수용액의 부피(mL)","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.674,"y":0.855},"position":{"x":0.674,"y":0.855},"typography":{"role":"text","bounds":{"x":0.381,"y":0.752,"w":0.586,"h":0.211},"rotation":0,"runs":[{"text":"삼각 플라스크 속\n수용액의 부피","role":"text","contentMode":"plain"},{"text":"(mL)","role":"unit","contentMode":"plain"}]},"scope":"graph","owner":"coordinate_graph","inventoryId":"c1_2027_06_15:6"},
  {"text":"Ⅰ","evidence":"Ⅰ","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.034,"y":0.244},"position":{"x":0.034,"y":0.244},"typography":{"role":"symbol","bounds":{"x":0.021,"y":0.205,"w":0.025,"h":0.078},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b2_2027_06_10:1"},
  {"text":"㉠","evidence":"㉠","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.116,"y":0.201},"position":{"x":0.116,"y":0.201},"typography":{"role":"symbol","bounds":{"x":0.092,"y":0.15,"w":0.048,"h":0.102},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b2_2027_06_10:2"},
  {"text":"H^+","evidence":"H^+","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"formula","anchor":{"x":0.221,"y":0.108},"position":{"x":0.221,"y":0.108},"typography":{"role":"chemical","bounds":{"x":0.192,"y":0.068,"w":0.058,"h":0.079},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b2_2027_06_10:3"},
  {"text":"?","evidence":"?","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.252,"y":0.267},"position":{"x":0.252,"y":0.267},"typography":{"role":"symbol","bounds":{"x":0.241,"y":0.231,"w":0.021,"h":0.072},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b2_2027_06_10:4"},
  {"text":"㉡","evidence":"㉡","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.326,"y":0.202},"position":{"x":0.326,"y":0.202},"typography":{"role":"symbol","bounds":{"x":0.303,"y":0.15,"w":0.048,"h":0.103},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b2_2027_06_10:5"},
  {"text":"?","evidence":"?","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.461,"y":0.267},"position":{"x":0.461,"y":0.267},"typography":{"role":"symbol","bounds":{"x":0.45,"y":0.231,"w":0.021,"h":0.072},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b2_2027_06_10:6"},
  {"text":"H^+","evidence":"H^+","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"formula","anchor":{"x":0.559,"y":0.108},"position":{"x":0.559,"y":0.108},"typography":{"role":"chemical","bounds":{"x":0.53,"y":0.068,"w":0.058,"h":0.079},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b2_2027_06_10:7"},
  {"text":"H^+","evidence":"H^+","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"formula","anchor":{"x":0.802,"y":0.108},"position":{"x":0.802,"y":0.108},"typography":{"role":"chemical","bounds":{"x":0.773,"y":0.068,"w":0.058,"h":0.079},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b2_2027_06_10:8"},
  {"text":"?","evidence":"?","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.933,"y":0.128},"position":{"x":0.933,"y":0.128},"typography":{"role":"symbol","bounds":{"x":0.922,"y":0.093,"w":0.021,"h":0.07},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b2_2027_06_10:9"},
  {"text":"?","evidence":"?","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.933,"y":0.322},"position":{"x":0.933,"y":0.322},"typography":{"role":"symbol","bounds":{"x":0.922,"y":0.286,"w":0.021,"h":0.071},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b2_2027_06_10:10"},
  {"text":"Ⅱ","evidence":"Ⅱ","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.034,"y":0.792},"position":{"x":0.034,"y":0.792},"typography":{"role":"symbol","bounds":{"x":0.019,"y":0.751,"w":0.03,"h":0.08},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b2_2027_06_10:11"},
  {"text":"H^+","evidence":"H^+","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"formula","anchor":{"x":0.22,"y":0.86},"position":{"x":0.22,"y":0.86},"typography":{"role":"chemical","bounds":{"x":0.191,"y":0.817,"w":0.058,"h":0.08},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b2_2027_06_10:12"},
  {"text":"H^+","evidence":"H^+","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"formula","anchor":{"x":0.557,"y":0.86},"position":{"x":0.557,"y":0.86},"typography":{"role":"chemical","bounds":{"x":0.528,"y":0.817,"w":0.058,"h":0.08},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b2_2027_06_10:13"},
  {"text":"H^+","evidence":"H^+","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"formula","anchor":{"x":0.799,"y":0.86},"position":{"x":0.799,"y":0.86},"typography":{"role":"chemical","bounds":{"x":0.77,"y":0.817,"w":0.058,"h":0.08},"rotation":0},"scope":"general","owner":"diagram","inventoryId":"b2_2027_06_10:14"},
  {"text":"수증기 수송량","evidence":"수증기 수송량","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.115,"y":0.414},"position":{"x":0.115,"y":0.414},"typography":{"role":"text","bounds":{"x":0.097,"y":0.145,"w":0.036,"h":0.402},"orientation":"vertical","rotation":0},"scope":"graph","owner":"coordinate_graph","inventoryId":"e1_2027_06_13:1"},
  {"text":"(10^3 km^3/년)","evidence":"(10^3 km^3/년)","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"formula","anchor":{"x":0.115,"y":0.706},"position":{"x":0.115,"y":0.706},"typography":{"role":"unit","bounds":{"x":0.011,"y":0.665,"w":0.207,"h":0.077},"rotation":0},"scope":"graph","owner":"coordinate_graph","inventoryId":"e1_2027_06_13:2"},
  {"text":"+40","evidence":"+40","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.257,"y":0.119},"position":{"x":0.257,"y":0.119},"typography":{"role":"number","bounds":{"x":0.223,"y":0.086,"w":0.067,"h":0.065},"rotation":0},"scope":"graph","owner":"coordinate_graph","inventoryId":"e1_2027_06_13:3"},
  {"text":"+20","evidence":"+20","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.257,"y":0.282},"position":{"x":0.257,"y":0.282},"typography":{"role":"number","bounds":{"x":0.223,"y":0.25,"w":0.067,"h":0.065},"rotation":0},"scope":"graph","owner":"coordinate_graph","inventoryId":"e1_2027_06_13:4"},
  {"text":"0","evidence":"0","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.28,"y":0.447},"position":{"x":0.28,"y":0.447},"typography":{"role":"number","bounds":{"x":0.268,"y":0.414,"w":0.023,"h":0.065},"rotation":0},"scope":"graph","owner":"coordinate_graph","inventoryId":"e1_2027_06_13:5"},
  {"text":"−20","evidence":"−20","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.257,"y":0.618},"position":{"x":0.257,"y":0.618},"typography":{"role":"number","bounds":{"x":0.223,"y":0.586,"w":0.067,"h":0.065},"rotation":0},"scope":"graph","owner":"coordinate_graph","inventoryId":"e1_2027_06_13:6"},
  {"text":"−40","evidence":"−40","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.257,"y":0.784},"position":{"x":0.257,"y":0.784},"typography":{"role":"number","bounds":{"x":0.223,"y":0.752,"w":0.067,"h":0.065},"rotation":0},"scope":"graph","owner":"coordinate_graph","inventoryId":"e1_2027_06_13:7"},
  {"text":"A","evidence":"A","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.437,"y":0.071},"position":{"x":0.437,"y":0.071},"typography":{"role":"name","bounds":{"x":0.421,"y":0.032,"w":0.032,"h":0.067},"rotation":0},"scope":"graph","owner":"coordinate_graph","inventoryId":"e1_2027_06_13:8"},
  {"text":"B","evidence":"B","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.724,"y":0.071},"position":{"x":0.724,"y":0.071},"typography":{"role":"name","bounds":{"x":0.709,"y":0.032,"w":0.03,"h":0.067},"rotation":0},"scope":"graph","owner":"coordinate_graph","inventoryId":"e1_2027_06_13:9"},
  {"text":"C","evidence":"C","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.834,"y":0.071},"position":{"x":0.834,"y":0.071},"typography":{"role":"name","bounds":{"x":0.819,"y":0.032,"w":0.032,"h":0.067},"rotation":0},"scope":"graph","owner":"coordinate_graph","inventoryId":"e1_2027_06_13:10"},
  {"text":"60°","evidence":"60°","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.371,"y":0.851},"position":{"x":0.371,"y":0.851},"typography":{"role":"number","bounds":{"x":0.343,"y":0.817,"w":0.057,"h":0.065},"rotation":0},"scope":"graph","owner":"coordinate_graph","inventoryId":"e1_2027_06_13:11"},
  {"text":"30°","evidence":"30°","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.503,"y":0.851},"position":{"x":0.503,"y":0.851},"typography":{"role":"number","bounds":{"x":0.475,"y":0.817,"w":0.057,"h":0.065},"rotation":0},"scope":"graph","owner":"coordinate_graph","inventoryId":"e1_2027_06_13:12"},
  {"text":"0°","evidence":"0°","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.635,"y":0.851},"position":{"x":0.635,"y":0.851},"typography":{"role":"number","bounds":{"x":0.616,"y":0.817,"w":0.038,"h":0.065},"rotation":0},"scope":"graph","owner":"coordinate_graph","inventoryId":"e1_2027_06_13:13"},
  {"text":"30°","evidence":"30°","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.768,"y":0.851},"position":{"x":0.768,"y":0.851},"typography":{"role":"number","bounds":{"x":0.74,"y":0.817,"w":0.057,"h":0.065},"rotation":0},"scope":"graph","owner":"coordinate_graph","inventoryId":"e1_2027_06_13:14"},
  {"text":"60°","evidence":"60°","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.899,"y":0.851},"position":{"x":0.899,"y":0.851},"typography":{"role":"number","bounds":{"x":0.871,"y":0.817,"w":0.057,"h":0.065},"rotation":0},"scope":"graph","owner":"coordinate_graph","inventoryId":"e1_2027_06_13:15"},
  {"text":"위도","evidence":"위도","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.636,"y":0.941},"position":{"x":0.636,"y":0.941},"typography":{"role":"text","bounds":{"x":0.603,"y":0.907,"w":0.066,"h":0.066},"rotation":0},"scope":"graph","owner":"coordinate_graph","inventoryId":"e1_2027_06_13:16"},
  {"text":"50 m","evidence":"50 m","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"plain","anchor":{"x":0.663,"y":0.094},"position":{"x":0.663,"y":0.094},"typography":{"role":"quantity","bounds":{"x":0.61,"y":0.073,"w":0.106,"h":0.042},"rotation":0,"runs":[{"text":"50","role":"number","contentMode":"plain"},{"text":" m","role":"unit","contentMode":"plain"}]},"scope":"general","owner":"map_annotation","inventoryId":"e2_2027_06_08:1"},
  {"text":"60 m","evidence":"60 m","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"plain","anchor":{"x":0.677,"y":0.2},"position":{"x":0.677,"y":0.2},"typography":{"role":"quantity","bounds":{"x":0.632,"y":0.178,"w":0.095,"h":0.044},"rotation":0,"runs":[{"text":"60","role":"number","contentMode":"plain"},{"text":" m","role":"unit","contentMode":"plain"}]},"scope":"general","owner":"map_annotation","inventoryId":"e2_2027_06_08:2"},
  {"text":"70 m","evidence":"70 m","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"plain","anchor":{"x":0.73,"y":0.306},"position":{"x":0.73,"y":0.306},"typography":{"role":"quantity","bounds":{"x":0.679,"y":0.282,"w":0.103,"h":0.045},"rotation":0,"runs":[{"text":"70","role":"number","contentMode":"plain"},{"text":" m","role":"unit","contentMode":"plain"}]},"scope":"general","owner":"map_annotation","inventoryId":"e2_2027_06_08:3"},
  {"text":"80m","evidence":"80m","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"plain","anchor":{"x":0.743,"y":0.444},"position":{"x":0.743,"y":0.444},"typography":{"role":"quantity","bounds":{"x":0.704,"y":0.42,"w":0.078,"h":0.045},"rotation":0,"runs":[{"text":"80","role":"number","contentMode":"plain"},{"text":"m","role":"unit","contentMode":"plain"}]},"scope":"general","owner":"map_annotation","inventoryId":"e2_2027_06_08:4"},
  {"text":"60m","evidence":"60m","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"plain","anchor":{"x":0.08,"y":0.441},"position":{"x":0.08,"y":0.441},"typography":{"role":"quantity","bounds":{"x":0.03,"y":0.409,"w":0.101,"h":0.064},"rotation":43,"runs":[{"text":"60","role":"number","contentMode":"plain"},{"text":"m","role":"unit","contentMode":"plain"}]},"scope":"general","owner":"map_annotation","inventoryId":"e2_2027_06_08:5"},
  {"text":"50 m","evidence":"50 m","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"plain","anchor":{"x":0.139,"y":0.606},"position":{"x":0.139,"y":0.606},"typography":{"role":"quantity","bounds":{"x":0.084,"y":0.579,"w":0.11,"h":0.054},"rotation":26,"runs":[{"text":"50","role":"number","contentMode":"plain"},{"text":" m","role":"unit","contentMode":"plain"}]},"scope":"general","owner":"map_annotation","inventoryId":"e2_2027_06_08:6"},
  {"text":"40m","evidence":"40m","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"quantity","contentMode":"plain","anchor":{"x":0.125,"y":0.708},"position":{"x":0.125,"y":0.708},"typography":{"role":"quantity","bounds":{"x":0.084,"y":0.686,"w":0.083,"h":0.045},"rotation":20,"runs":[{"text":"40","role":"number","contentMode":"plain"},{"text":"m","role":"unit","contentMode":"plain"}]},"scope":"general","owner":"map_annotation","inventoryId":"e2_2027_06_08:7"},
  {"text":"A","evidence":"A","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.148,"y":0.371},"position":{"x":0.148,"y":0.371},"typography":{"role":"name","bounds":{"x":0.13,"y":0.342,"w":0.036,"h":0.055},"rotation":0},"scope":"general","owner":"map_annotation","inventoryId":"e2_2027_06_08:8"},
  {"text":"B","evidence":"B","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.315,"y":0.41},"position":{"x":0.315,"y":0.41},"typography":{"role":"name","bounds":{"x":0.298,"y":0.38,"w":0.035,"h":0.056},"rotation":0},"scope":"general","owner":"map_annotation","inventoryId":"e2_2027_06_08:9"},
  {"text":"A","evidence":"A","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.617,"y":0.253},"position":{"x":0.617,"y":0.253},"typography":{"role":"name","bounds":{"x":0.599,"y":0.224,"w":0.036,"h":0.055},"rotation":0},"scope":"general","owner":"map_annotation","inventoryId":"e2_2027_06_08:10"},
  {"text":"B","evidence":"B","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.885,"y":0.212},"position":{"x":0.885,"y":0.212},"typography":{"role":"name","bounds":{"x":0.867,"y":0.183,"w":0.036,"h":0.055},"rotation":0},"scope":"general","owner":"map_annotation","inventoryId":"e2_2027_06_08:11"},
  {"text":"C","evidence":"C","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.679,"y":0.489},"position":{"x":0.679,"y":0.489},"typography":{"role":"name","bounds":{"x":0.659,"y":0.459,"w":0.04,"h":0.056},"rotation":0},"scope":"general","owner":"map_annotation","inventoryId":"e2_2027_06_08:12"},
  {"text":"이암","evidence":"이암","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.161,"y":0.855},"position":{"x":0.161,"y":0.855},"typography":{"role":"text","bounds":{"x":0.12,"y":0.829,"w":0.082,"h":0.052},"rotation":0},"scope":"general","owner":"map_annotation","inventoryId":"e2_2027_06_08:13"},
  {"text":"사암","evidence":"사암","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.394,"y":0.855},"position":{"x":0.394,"y":0.855},"typography":{"role":"text","bounds":{"x":0.353,"y":0.829,"w":0.082,"h":0.052},"rotation":0},"scope":"general","owner":"map_annotation","inventoryId":"e2_2027_06_08:14"},
  {"text":"역암","evidence":"역암","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.633,"y":0.855},"position":{"x":0.633,"y":0.855},"typography":{"role":"text","bounds":{"x":0.592,"y":0.829,"w":0.082,"h":0.052},"rotation":0},"scope":"general","owner":"map_annotation","inventoryId":"e2_2027_06_08:15"},
  {"text":"석회암","evidence":"석회암","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.893,"y":0.855},"position":{"x":0.893,"y":0.855},"typography":{"role":"text","bounds":{"x":0.84,"y":0.829,"w":0.106,"h":0.052},"rotation":0},"scope":"general","owner":"map_annotation","inventoryId":"e2_2027_06_08:16"},
  {"text":"등고선","evidence":"등고선","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.19,"y":0.955},"position":{"x":0.19,"y":0.955},"typography":{"role":"text","bounds":{"x":0.119,"y":0.929,"w":0.142,"h":0.052},"rotation":0},"scope":"general","owner":"map_annotation","inventoryId":"e2_2027_06_08:17"},
  {"text":"지층 경계선","evidence":"지층 경계선","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.518,"y":0.955},"position":{"x":0.518,"y":0.955},"typography":{"role":"text","bounds":{"x":0.416,"y":0.929,"w":0.204,"h":0.052},"rotation":0},"scope":"general","owner":"map_annotation","inventoryId":"e2_2027_06_08:18"},
  {"text":"단층선","evidence":"단층선","sourceKind":"reference","sourceRef":1,"mode":"text","labelType":"label","contentMode":"plain","anchor":{"x":0.888,"y":0.955},"position":{"x":0.888,"y":0.955},"typography":{"role":"text","bounds":{"x":0.817,"y":0.929,"w":0.142,"h":0.052},"rotation":0},"scope":"general","owner":"map_annotation","inventoryId":"e2_2027_06_08:19"}
];

test('100 general source occurrences retain canonical source through selection, inline edit and explicit details', {timeout:600000}, async()=>{
  assert.equal(SOURCE_LABELS.filter(l=>l.scope==='general').length,100);
  assert.equal(SOURCE_LABELS.filter(l=>l.scope==='graph').length,22);
  assert.equal(SOURCE_LABELS.filter(l=>l.scope==='non_graph_vertical_deferred').length,1);
  assert.equal(SOURCE_LABELS.filter(l=>l.scope==='general'&&l.text==='정지'&&l.inventoryId.startsWith('p2_')).length,1,'Exactly one source 정지 occurrence, no duplicate audit item');
  const requested=(process.env.QA_GENERAL_IDS||'').split(',').filter(Boolean);const selected=SOURCE_LABELS.filter(l=>l.scope==='general'&&(!requested.length||requested.includes(l.inventoryId)));assert.ok(selected.length);
  const browser=await chromium.launch({headless:true});const rows=[];
  try{
    const {page,errors}=await makePage(browser);
    for(const source of selected){
      const row={id:source.inventoryId,sourceText:source.text,scope:source.scope,fixtureSource:'corrected inventory + retained plan',sourcePositionTest:false};rows.push(row);
      try{
        await reset(page);
        const id=await page.evaluate(async source=>{
          const q=window.__editabilityQA,label=structuredClone(source);label.position={x:.5,y:.5};label.anchor=label.mode==='leader'?{x:.2,y:.65}:{x:.5,y:.5};
          if(label.typography?.bounds){const {w,h}=label.typography.bounds;label.typography.bounds={x:.5-w/2,y:.5-h/2,w,h};}
          const plan=q.parseEditableImageLabelPlan(`<5e-editable-labels>${JSON.stringify({version:2,reviewRequired:true,labels:[label]})}</5e-editable-labels>`,{preserveSourceLabels:true,referenceCount:1});
          if(plan.labels.length!==1)throw Error('Source fixture rejected by production parser: '+label.text);
          const imageId=await q.insertImageFromSrc(q.state,q.blank,{preserveBytes:true,centerArtboard:true,aiTaskId:'qa',aiCandidateId:source.inventoryId,editableLabelPlan:plan});
          const objects=q.state.get().objects.filter(o=>o.aiAutoLabel&&o.aiParentImageId===imageId);if(objects.length!==1)throw Error('One source label must produce exactly one native object');
          q.state.update(s=>{s.selectedIds=[];s.activeTool='V';});await document.fonts.ready;return objects[0].id;
        },source);
        const created=await object(page,id);assert.equal(created.type,source.mode==='leader'?'labeler':source.contentMode==='formula'?'formula':'text');
        assert.equal(canonical(created),source.text);
        assert.equal(created.fontSize||created.labelSize,3.7);
        if(source.typography?.bounds){const {w,h}=source.typography.bounds;assert.deepEqual(created.aiLabelSourceBounds,{x:.5-w/2,y:.5-h/2,w,h},'isolated pointer fixture retains every source extent');}
        assert.equal(created.aiTaskId,'qa');assert.equal(created.aiCandidateId,source.inventoryId);
        await exercise(page,id,row,['m_B','B(g)','CO_2','정지'].includes(source.text));
      }catch(e){await captureFailure(page,row,e);}
      save('general-occurrences.json',{count:selected.length,aiGenerationCalls:0,method:'Production parse + insert; real first center selection, click-again inline cancellation, explicit details icon and real dialog edits; production undo/redo and project roundtrip',rows,errors});
    }
    save('general-summary.json',{count:rows.length,passed:rows.filter(r=>r.pass).length,failed:rows.filter(r=>!r.pass).map(r=>({id:r.id,text:r.sourceText,error:r.error})),aiGenerationCalls:0,errors});
    assert.deepEqual(errors,[]);assert.equal(rows.filter(r=>r.pass).length,selected.length,JSON.stringify(rows.filter(r=>!r.pass).map(r=>({id:r.id,error:r.error?.split('\n')[0]}))));
  }finally{await browser.close();}
});

test('22 native UI patterns and 22 existing labeler patterns remain editable across edits and save/load', {timeout:600000}, async()=>{
  const browser=await chromium.launch({headless:true}),rows=[];
  try{
    const {page,errors}=await makePage(browser);
    for(const tool of ['text','labeler'])for(const spec of representativePatterns){
      const row={id:tool+'-'+spec.id,tool,spec,creation:'actual keyboard tool and canvas pointer'};rows.push(row);
      try{
        await reset(page);const box=await page.locator('#canvas').boundingBox();const cx=box.x+box.width/2,cy=box.y+box.height/2;
        await page.keyboard.press(tool==='text'?'t':'Shift+T');
        if(tool==='text')await page.mouse.click(cx,cy);
        else{await page.mouse.click(cx-120,cy+50);await page.mouse.move(cx-60,cy);await page.mouse.click(cx-60,cy);await page.mouse.move(cx,cy);await page.mouse.click(cx,cy);}
        const editor=page.locator('.unified-text-editor');await editor.waitFor({state:'visible',timeout:3000});
        await editor.locator('.unified-style-select').selectOption({label:spec.font});await editor.locator('.unified-style-size').selectOption('12');await editor.locator('textarea').fill(spec.text);
        if(spec.palette)await editor.getByRole('button',{name:spec.palette,exact:true}).click();await confirm(editor);
        let created=await page.evaluate(()=>structuredClone(window.__editabilityQA.state.get().objects.at(-1)));assert.ok(created);
        if(spec.rotation){row.rotationSetup='stored native rotation; isolated pointer test (rotation interaction is separate graph/transform scope)';await page.evaluate(({id,rotation})=>window.__editabilityQA.state.update(s=>{const o=s.objects.find(x=>x.id===id);if(o.type==='labeler')o.textRotation=rotation;else o.rotation=rotation;}),{id:created.id,rotation:spec.rotation});}
        await exercise(page,created.id,row,['subscript','phase','mixed-comma','multiline','rotated-unit'].includes(spec.id));
        const beforeFont=await object(page,created.id);const fontEdit=await openByCenter(page,created.id,canonical(beforeFont));await fontEdit.editor.locator('.unified-style-select').selectOption({label:spec.font==='라벨'?'한글 텍스트(돋움)':'라벨'});await confirm(fontEdit.editor);row.fontEdited=await object(page,created.id);assert.notEqual(row.fontEdited.fontFamily,beforeFont.fontFamily,'User font selection must apply');
        const reopen=await openByCenter(page,created.id,canonical(row.fontEdited));await confirm(reopen.editor);assert.ok(await roundtrip(page));row.fontEdit=true;
      }catch(e){await captureFailure(page,row,e);}
      save('native-patterns.json',{patterns:22,objects:44,method:'Native tools created by keyboard/pointer, fonts/palette/size chosen in editor. Stored rotation probe explicitly records non-UI setup.',rows,errors});
    }
    save('native-summary.json',{count:rows.length,passed:rows.filter(r=>r.pass).length,failed:rows.filter(r=>!r.pass).map(r=>({id:r.id,error:r.error})),errors});assert.deepEqual(errors,[]);assert.equal(rows.filter(r=>r.pass).length,44,JSON.stringify(rows.filter(r=>!r.pass).map(r=>({id:r.id,error:r.error?.split('\n')[0]}))));
  }finally{await browser.close();}
});

test('scope exclusions, comma preservation, selected-script style, mixed-run editing and image replacement', {timeout:120000}, async()=>{
  const browser=await chromium.launch({headless:true}),result={aiGenerationCalls:0};
  try{
    const {page,errors}=await makePage(browser);await reset(page);
    result.scope=await page.evaluate(async labels=>{
      const q=window.__editabilityQA,plan=q.parseEditableImageLabelPlan(`<5e-editable-labels>${JSON.stringify({version:2,reviewRequired:true,labels})}</5e-editable-labels>`,{preserveSourceLabels:true,referenceCount:1});
      const image={id:'scope-image',x:0,y:0,w:90,h:60};let n=0;const objects=q.createEditableImageLabelObjects({labels:plan.labels,image,idFactory:()=>`scope-${++n}`});return {parsed:plan.labels.length,created:objects.length,texts:objects.map(o=>o.rawSource||o.source||o.text),plan};
    },SOURCE_LABELS);
    assert.equal(result.scope.created,100,'22 graph labels and 1 deferred vertical label must not be restored by general labeler');
    assert.ok(result.scope.texts.includes('정지'));
    for(const punctuation of ['ⓑ, CO_2','B(g), C(g)']){
      await reset(page);
      const id=await page.evaluate(async text=>{const q=window.__editabilityQA,formula=text.includes('_'),label={text,sourceKind:'reference',sourceRef:1,scope:'general',mode:'text',contentMode:formula?'formula':'plain',position:{x:.5,y:.5},anchor:{x:.5,y:.5},typography:{role:'chemical'}};const plan=q.parseEditableImageLabelPlan(`<5e-editable-labels>${JSON.stringify({version:2,reviewRequired:true,labels:[label]})}</5e-editable-labels>`,{preserveSourceLabels:true,referenceCount:1});await q.insertImageFromSrc(q.state,q.blank,{preserveBytes:true,centerArtboard:true,editableLabelPlan:plan});return q.state.get().objects.find(o=>o.aiAutoLabel).id;},punctuation);
      const e=await openByCenter(page,id,punctuation);await confirm(e.editor);assert.equal(canonical(await object(page,id)),punctuation);assert.ok((await glyphs(page,id)).fonts.some(f=>f.text.includes(',')),'Comma must render as a glyph');
    }
    result.styles=[];
    for(const text of ['m_B','B(g)']){
      await reset(page);const source=SOURCE_LABELS.find(l=>l.scope==='general'&&l.text===text);
      const id=await page.evaluate(async label=>{const q=window.__editabilityQA;label=structuredClone(label);label.position={x:.5,y:.5};label.anchor={x:.5,y:.5};delete label.typography.bounds;await q.prepareEditableLabelFonts([label]);let n=0;const objects=q.createEditableImageLabelObjects({labels:[label],image:{id:'style-image',x:0,y:0,w:90,h:60},idFactory:()=>`style-${++n}`});q.state.update(s=>{s.objects.push(...objects);s.selectedIds=[];});return objects[0].id;},source);
      const row={text,id,before:await object(page,id),render:await glyphs(page,id)};result.styles.push(row);
      if(text==='m_B'){assert.ok(row.render.fonts.some(f=>f.text==='m'&&f.style==='italic'));assert.ok(row.render.fonts.some(f=>f.text==='B'&&f.style==='normal'),'Name subscript B must be upright');}
      else{assert.ok(row.render.fonts.some(f=>f.text.includes('B')&&f.style==='normal'));assert.ok(row.render.fonts.some(f=>f.text==='g'&&f.style==='italic'),'Phase g must be italic in one object');}
      const ed=await openByCenter(page,id,text);await ed.editor.locator('textarea').fill(text==='m_B'?'m_B + m':'B(g) 검수');await confirm(ed.editor);row.edited=await object(page,id);row.afterRender=await glyphs(page,id);
      if(text==='m_B')assert.ok(row.afterRender.fonts.some(f=>f.text==='B'&&f.style==='normal'),'Unchanged script must retain upright style');
      else {
        assert.ok(row.afterRender.fonts.some(f=>f.text==='g'&&f.style==='italic'),'Unchanged semantic g run must retain italic style');
        const renamed=await openByCenter(page,id,'B(g) 검수');await renamed.editor.locator('textarea').fill('C(g) 검수');await confirm(renamed.editor);row.nameRenamed=await object(page,id);row.renamedRender=await glyphs(page,id);
        assert.ok(row.renamedRender.fonts.some(f=>f.text.includes('C')&&f.style==='normal'),'Replacement name C must retain upright style');
        assert.ok(row.renamedRender.fonts.some(f=>f.text==='g'&&f.style==='italic'),'Changing B to C must preserve the separate italic phase run');
      }
      if(text==='m_B'){const renamed=await openByCenter(page,id,'m_B + m');await renamed.editor.locator('textarea').fill('m_C + m');await confirm(renamed.editor);row.scriptRenamed=await object(page,id);row.renamedRender=await glyphs(page,id);assert.ok(row.renamedRender.fonts.some(f=>f.text==='C'&&f.style==='normal'),'Replacement inside subscript must inherit role');}
      const current=await object(page,id),font=await openByCenter(page,id,canonical(current));await font.editor.locator('.unified-style-select').selectOption({label:'한글 텍스트(돋움)'});await confirm(font.editor);row.fontOverride=await object(page,id);row.overrideRender=await glyphs(page,id);assert.ok(row.overrideRender.fonts.every(f=>f.style!=='italic'),'Explicit whole-font override must win over automatic styles');
      assert.ok(await roundtrip(page));const re=await openByCenter(page,id,canonical(row.fontOverride));await confirm(re.editor);
    }
    await reset(page);
    result.replacement=await page.evaluate(async()=>{
      const q=window.__editabilityQA;
      // The production parser freezes JS observations but does not set the
      // workflow's frozen RAW flag. This explicit fixture models a locked RAW
      // candidate; it grants no quality approval and keeps reviewRequired.
      const make=text=>({...structuredClone(q.parseEditableImageLabelPlan(`<5e-editable-labels>${JSON.stringify({version:2,reviewRequired:false,labels:[{text,scope:'general',sourceKind:'reference',sourceRef:1,mode:'text',position:{x:.5,y:.5},typography:{role:'text'}}]})}</5e-editable-labels>`,{preserveSourceLabels:true,referenceCount:1})),frozen:true});
      const a=await q.insertImageFromSrc(q.state,q.blank,{preserveBytes:true,at:{x:15,y:20},aiTaskId:'task-a',aiCandidateId:'a1',editableLabelPlan:make('첫 이미지')});
      const b=await q.insertImageFromSrc(q.state,q.blank,{preserveBytes:true,at:{x:70,y:20},aiTaskId:'task-b',aiCandidateId:'b1',editableLabelPlan:make('둘째 이미지')});
      q.state.update(s=>{s.objects.push({id:'manual-text',type:'text',x:45,y:40,text:'사용자 글자',fontSize:4,fontFamily:q.fonts.DEFAULT_TEXT_FONT,positionLocked:false,italic:false});s.selectedIds=[a];});
      // Same parent alone is insufficient ownership: preserve another task's
      // label and an earlier candidate's label alongside unrelated manual text.
      const owned=q.state.get().objects.find(o=>o.aiParentImageId===a);
      q.state.update(s=>{s.objects.push({...structuredClone(owned),id:'foreign-task-label',aiTaskId:'other-task'},
        {...structuredClone(owned),id:'foreign-candidate-label',aiCandidateId:'older-candidate'});});
      const before=structuredClone(q.state.get().objects),bLabel=before.find(o=>o.aiParentImageId===b),bImage=before.find(o=>o.id===b);
      const snapshot=()=>JSON.stringify({objects:q.state.get().objects,selected:q.state.get().selectedIds,undo:q.state.get().undoStack,redo:q.state.get().redoStack});
      async function rejected(action,expected){const prior=snapshot();let message;try{await action();}catch(error){if(!expected.test(error.message))throw error;message=error.message;}if(!message)throw Error('Expected replacement rejection');if(snapshot()!==prior)throw Error('Rejected replacement changed source/history');return true;}
      const genericRejected=await rejected(()=>q.insertImageFromSrc(q.state,q.blank,{preserveBytes:true,replaceId:a,aiTaskId:'task-a',aiCandidateId:'a2',editableLabelPlan:make('교체 이미지')}),/잠긴 이미지는 교체할 수 없습니다/);
      const wrongOwnerRejected=await rejected(()=>q.materializeCandidate({id:'a2',data:q.blank,labelPlan:make('교체 이미지')},{taskId:'task-b',replaceId:a}),/소유한 편집 원본/);
      const undoCount=q.state.get().undoStack.length;
      await q.materializeCandidate({id:'a2',data:q.blank,labelPlan:make('교체 이미지')},{taskId:'task-a',replaceId:a,isCurrent:()=>true});
      const oneCommit=q.state.get().undoStack.length===undoCount+1;
      const replaced=structuredClone(q.state.get().objects),parentA=replaced.filter(o=>o.aiParentImageId===a&&o.aiTaskId==='task-a'&&o.aiCandidateId==='a2');
      const unchanged=id=>JSON.stringify(before.find(o=>o.id===id))===JSON.stringify(replaced.find(o=>o.id===id));
      const bPreserved=unchanged(bLabel.id)&&unchanged(bImage.id),foreignTaskPreserved=unchanged('foreign-task-label'),foreignCandidatePreserved=unchanged('foreign-candidate-label');
      const aBefore=before.find(o=>o.id===a),aAfter=replaced.find(o=>o.id===a);
      const rawGeometryPreserved=['src','x','y','w','h','rotation'].every(key=>aBefore[key]===aAfter[key]);
      q.undo(q.state);const undo=JSON.stringify(q.state.get().objects)===JSON.stringify(before);q.redo(q.state);const redo=JSON.stringify(q.state.get().objects)===JSON.stringify(replaced);
      return {lockedBackground:aBefore.imageSelectionLocked===true&&aBefore.aiLabelEditingBackground===true,parentACount:parentA.length,parentAText:parentA[0]?.text,manualPreserved:unchanged('manual-text'),bPreserved,foreignTaskPreserved,foreignCandidatePreserved,genericRejected,wrongOwnerRejected,rawGeometryPreserved,oneCommit,undo,redo};
    });
    assert.deepEqual(result.replacement,{lockedBackground:true,parentACount:1,parentAText:'교체 이미지',manualPreserved:true,bPreserved:true,foreignTaskPreserved:true,foreignCandidatePreserved:true,genericRejected:true,wrongOwnerRejected:true,rawGeometryPreserved:true,oneCommit:true,undo:true,redo:true});assert.ok(await roundtrip(page,'exact-owner-replacement',true),'Exact-owner replacement survives serialization with foreign labels intact');assert.deepEqual(errors,[]);result.pass=true;result.errors=errors;
  }catch(e){result.pass=false;result.error=e.stack;throw e;}
  finally{save('scope-styles-replacement.json',result);await browser.close();}
});

test('editing mixed chemical syntax renders scripts and rotated text-to-formula conversion preserves center', {timeout:60000}, async()=>{
  const browser=await chromium.launch({headless:true}),result={aiGenerationCalls:0};
  try{
    const {page,errors}=await makePage(browser);await reset(page);
    const fixture=SOURCE_LABELS.find(l=>l.text==='B(g)');
    const id=await page.evaluate(async label=>{const q=window.__editabilityQA;label=structuredClone(label);label.position={x:.5,y:.5};label.anchor={x:.5,y:.5};delete label.typography.bounds;await q.prepareEditableLabelFonts([label]);let n=0;const objects=q.createEditableImageLabelObjects({labels:[label],image:{id:'mixed-image',x:0,y:0,w:90,h:60},idFactory:()=>`mixed-${++n}`});q.state.update(s=>{s.objects.push(...objects);s.selectedIds=[];});return objects[0].id;},fixture);
    const phase=await openByCenter(page,id,'B(g)');await phase.editor.locator('textarea').fill('B_2(g)');await confirm(phase.editor);
    result.mixedObject=await object(page,id);result.mixedRender=await glyphs(page,id);assert.ok(!result.mixedRender.fonts.some(f=>f.text.includes('_')),'New subscript syntax must be rendered, not printed literally');assert.ok(result.mixedRender.fonts.some(f=>f.text==='2'),'New subscript 2 must render');assert.ok(result.mixedRender.fonts.some(f=>f.text==='g'&&f.style==='italic'),'New chemical subscript must preserve italic phase run');
    const phaseAgain=await openByCenter(page,id,'B_2(g)');await confirm(phaseAgain.editor);assert.ok(await roundtrip(page));
    await reset(page);
    const rotated=SOURCE_LABELS.find(l=>l.text==='60m'&&l.typography.rotation);
    const rotationId=await page.evaluate(async label=>{const q=window.__editabilityQA;label=structuredClone(label);label.position={x:.5,y:.5};label.anchor={x:.5,y:.5};delete label.typography.bounds;label.typography.rotation=90;await q.prepareEditableLabelFonts([label]);let n=0;const objects=q.createEditableImageLabelObjects({labels:[label],image:{id:'rotation-image',x:0,y:0,w:90,h:60},idFactory:()=>`rotated-${++n}`});q.state.update(s=>{s.objects.push(...objects);s.selectedIds=[];});return objects[0].id;},rotated);
    const center=async()=>page.evaluate(async id=>{const {nativeLabelCenter}=await import('/js/ai-label-typography.js?v=1.7.0-four-session-integration');const o=window.__editabilityQA.state.get().objects.find(o=>o.id===id);return nativeLabelCenter(o);},rotationId);
    result.centerBefore=await center();result.rotationBefore=await object(page,rotationId);const conversion=await openByCenter(page,rotationId,'60m');await conversion.editor.locator('textarea').fill('60_m');await confirm(conversion.editor);result.rotationAfter=await object(page,rotationId);result.centerAfter=await center();result.rotationRender=await glyphs(page,rotationId);
    assert.ok(!result.rotationRender.fonts.some(f=>f.text.includes('_')),'Cross-run subscript marker must not be printed literally');
    const digits=result.rotationRender.fonts.find(f=>f.text.includes('60')),script=result.rotationRender.fonts.find(f=>f.text==='m');assert.ok(digits&&script,'60_m must render a numeric base and attached script');assert.ok(script.size<digits.size,'Attached subscript m must be smaller than base 60');assert.ok(script.y>digits.y,'Attached subscript m must have lower baseline');
    assert.equal(result.rotationAfter.type,'formula');assert.equal(result.rotationAfter.rotation,result.rotationBefore.rotation);assert.ok(Math.hypot(result.centerAfter.x-result.centerBefore.x,result.centerAfter.y-result.centerBefore.y)<1e-8,'Changing native coordinate convention must preserve rotated glyph center');
    const rotationAgain=await openByCenter(page,rotationId,'60_m');await confirm(rotationAgain.editor);assert.ok(await roundtrip(page));
    await reset(page);
    const blankLineId=await page.evaluate(async()=>{const q=window.__editabilityQA,label={text:'m_B\n\nm_C',contentMode:'formula',mode:'text',scope:'general',anchor:{x:.5,y:.5},position:{x:.5,y:.5},typography:{role:'quantity',scriptStyles:[{start:2,end:3,kind:'sub',role:'name'},{start:7,end:8,kind:'sub',role:'name'}]}};await q.prepareEditableLabelFonts([label]);const objects=q.createEditableImageLabelObjects({labels:[label],image:{id:'blankline-image',x:0,y:0,w:90,h:60},idFactory:()=> 'blankline-formula'});q.state.update(s=>{s.objects.push(...objects);s.selectedIds=[];});return objects[0].id;});
    result.blankLine={before:await object(page,blankLineId),render:await glyphs(page,blankLineId)};
    assert.ok(result.blankLine.render.fonts.some(f=>f.text==='B'&&f.style==='normal'),'First-line script must be upright');
    assert.ok(result.blankLine.render.fonts.some(f=>f.text==='C'&&f.style==='normal'),'Script after empty line must use global UTF-16 source offset');
    const blankEdit=await openByCenter(page,blankLineId,'m_B\n\nm_C');await blankEdit.editor.locator('textarea').fill('m_B\n\nm_C + 1');await confirm(blankEdit.editor);result.blankLine.after=await object(page,blankLineId);result.blankLine.afterRender=await glyphs(page,blankLineId);assert.ok(result.blankLine.afterRender.fonts.some(f=>f.text==='C'&&f.style==='normal'));assert.ok(await roundtrip(page));
    assert.deepEqual(errors,[]);result.pass=true;
  }catch(e){result.pass=false;result.error=e.stack;throw e;}
  finally{save('mixed-syntax-rotation.json',result);await browser.close();}
});
