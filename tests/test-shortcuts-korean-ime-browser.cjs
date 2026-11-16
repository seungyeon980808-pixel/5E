// 단축키는 한글 입력 상태와 상관없이 작동(10-24 사용자 요구) + 맥 ⌘+방향키로 표 칸 크기(10-24 지적 25).
// Safari 한글 입력기는 글 입력 칸이 아닌 곳에서도 글자 키를 keyCode 229 · key 「ㅣ」 등으로 보낸다 — 키 자리(code)로 단축키를 실행해야 한다.
// 글 입력 칸 안의 한글 조합은 그대로 글자 입력이어야 한다.
const test=require('node:test'),assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
// 한글 입력기 키: keyCode 229(읽기 전용이라 덮어씀), key는 한글 자모, code는 키 자리.
const imeKey=(target,{key,code,meta=false})=>target.evaluate((node,{key,code,meta})=>{const e=new KeyboardEvent('keydown',{key,code,metaKey:meta,bubbles:true,cancelable:true,composed:true});Object.defineProperty(e,'keyCode',{get:()=>229});Object.defineProperty(e,'which',{get:()=>229});node.dispatchEvent(e);return e.defaultPrevented;},{key,code,meta});
for(const [name,engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) test(`${name}: shortcuts work in Korean input state and ⌘+arrows resize table cells`,async t=>{
 await h.withServer(async origin=>{
  const browser=await engine.launch();t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  // ── 5E_image 그림 도구 ──
  await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
  const tool=()=>page.evaluate(()=>[...document.querySelectorAll('#tool-list [data-tool]')].filter(b=>/is-active/.test(b.className)).map(b=>b.dataset.tool)[0]);
  await page.mouse.click(700,450);
  const canvas=page.locator('svg#canvas');
  await imeKey(canvas,{key:'ㅣ',code:'KeyL'});assert.equal(await tool(),'L','한글 상태 L(ㅣ) → 직선');
  await imeKey(canvas,{key:'ㅐ',code:'KeyO'});assert.equal(await tool(),'O','한글 상태 O(ㅐ) → 타원');
  await imeKey(canvas,{key:'ㅍ',code:'KeyV'});assert.equal(await tool(),'V','한글 상태 V(ㅍ) → 선택');
  // 글 입력 칸 안에서 조합 중인 키는 단축키가 아니다.
  await page.evaluate(()=>{const i=document.createElement('input');i.id='ime-probe';document.body.append(i);i.focus();});
  await imeKey(page.locator('#ime-probe'),{key:'ㅣ',code:'KeyL'});assert.equal(await tool(),'V','입력 칸 안 한글 조합은 도구를 바꾸지 않음');
  await page.evaluate(()=>document.querySelector('#ime-probe').remove());
  // ── 5E_hwp 표 칸: 커서만 둔 상태에서 ⌘+방향키 · Ctrl+방향키 · 한글 상태 ⌘+방향키 ──
  await h.navigate(page,origin+'/?mode=pro&exam=1&mobile=0');await h.ready(page);await h.action(page,'new');await h.idle(page);
  await page.evaluate(()=>{const d=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps,w=d.wasm,t=w.createTable(0,0,0,2,2);window.tableFixture=t;w.resizeTableCells(0,t.paraIdx,t.controlIdx,[0,1,2,3].map(cellIdx=>({cellIdx,heightDelta:3000})));});
  await h.idle(page);
  const height=()=>page.evaluate(()=>{const w=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.wasm,t=window.tableFixture;return w.getCellProperties(0,t.paraIdx,t.controlIdx,0).height;});
  const focusCell=async()=>{const p=await page.evaluate(()=>{const f=document.querySelector('#exam-studio iframe'),d=f.contentWindow.rhwpStudio.plugins.deps,t=window.tableFixture,c=d.wasm.getTableCellBboxes(0,t.paraIdx,t.controlIdx).find(c=>c.cellIdx===0),canvas=[...f.contentDocument.querySelectorAll('#scroll-content canvas')].find(c=>c.width>100),r=canvas.getBoundingClientRect(),b=f.getBoundingClientRect(),scale=r.width/d.wasm.getPageInfo(0).width;return{x:b.x+r.x+(c.x+15)*scale,y:b.y+r.y+(c.y+c.h/2)*scale};});
    await page.mouse.click(p.x,p.y);assert.equal(await page.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().cursor.isInCell()),true);};
  await focusCell();let before=await height();
  await page.keyboard.press('Meta+ArrowDown');assert.equal(await height(),before+300,'⌘+↓ → 칸 높이 +300');
  await page.keyboard.press('Meta+ArrowUp');assert.equal(await height(),before,'⌘+↑ → 되돌림');
  await page.keyboard.press('Control+ArrowDown');assert.equal(await height(),before+300,'Ctrl+↓도 그대로');
  await page.keyboard.press('Control+ArrowUp');
  const textarea=page.frameLocator('#exam-studio iframe').locator('textarea').first();
  await imeKey(textarea,{key:'ArrowDown',code:'ArrowDown',meta:true});assert.equal(await height(),before+300,'한글 상태 ⌘+↓ → 칸 높이 +300');
  assert.deepEqual(errors,[]);
 });
});
