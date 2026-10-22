// 과학 오브젝트(1.7.0): 물리 「현대물리학」 칸에 에너지 준위·스펙트럼이 보이고, 놓은 뒤 속성 패널의
// 여러 줄 입력칸·조건 단추가 26px 한 줄에 갇혀 잘리지 않는다(2026-10-19 밤 점검에서 찾은 것).
const assert=require('node:assert/strict');const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const h=require('./helpers/rhwp-exam.cjs');
const V='?v=1.7.0-four-session-integration';
h.withServer(async origin=>{for(const[name,engine]of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)){
 const browser=await engine.launch(),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await h.navigate(page,origin+'/?mode=pro&mobile=0&exam=0');await h.ready(page);
  if(!await page.locator('#subject-switch').isVisible())await page.locator('#subject-section > .tool-section-header').click();
  await page.locator('#subject-switch [data-subject="p"]').click();
  const part=page.locator('#subject-parts .subject-part',{has:page.locator('.subject-part-header',{hasText:'현대물리학'})});
  await part.locator('.subject-part-header').click();
  assert.equal(await part.locator('.subject-part-empty').count(),0,'현대물리학 칸은 "준비 중"이 아니다');
  for(const id of ['energy_levels','spectrum'])assert.equal(await part.locator(`[data-symbol="${id}"]`).count(),1,`${id} 단추가 팔레트에 있다`);

  // 팔레트에서 에너지 준위를 골라 끌어 놓는다.
  await part.locator('[data-symbol="energy_levels"]').click();
  const box=await page.locator('#canvas').boundingBox(),x=box.x+box.width*.4,y=box.y+box.height*.35;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+160,y+120,{steps:6});await page.mouse.up();
  const kind=await page.evaluate(async V=>{const{state}=await import('/js/state.js'+V);const s=state.get();return s.objects.find(o=>s.selectedIds.includes(o.id))?.kind;},V);
  assert.equal(kind,'energy_levels');
  const fit=await page.evaluate(()=>[...document.querySelectorAll('#inspector-content [data-lab-action], #inspector-content textarea[data-lab-control]')].filter(e=>e.offsetParent)
   .map(e=>({tag:e.tagName,text:(e.textContent||e.getAttribute('aria-label')).trim(),h:e.clientHeight,sh:e.scrollHeight,w:e.clientWidth,sw:e.scrollWidth})));
  const buttons=fit.filter(f=>f.tag==='BUTTON'),areas=fit.filter(f=>f.tag==='TEXTAREA');
  assert.deepEqual(buttons.map(b=>b.text),['수소 준위 예시','전이로 스펙트럼 만들기']);
  for(const b of buttons)assert.ok(b.sh<=b.h+2&&b.sw<=b.w+2,`단추 글자가 칸 안에 있다: ${JSON.stringify(b)}`);
  assert.equal(areas.length,2);for(const a of areas)assert.ok(a.h>30,`여러 줄 입력칸이 한 줄 높이로 잘리지 않는다: ${JSON.stringify(a)}`);
  // 단추가 실제로 눌린다: 수소 준위 예시 → 값이 바뀌고, 되돌리기로 돌아온다.
  const snap=()=>page.evaluate(async V=>{const{state}=await import('/js/state.js'+V);const s=state.get();return JSON.stringify(s.objects.find(o=>o.kind==='energy_levels'));},V);
  const before=await snap();await page.locator('#inspector-content [data-lab-action="hydrogen"]').click();
  assert.notEqual(await snap(),before,'수소 준위 예시가 값을 바꾼다');
  await page.evaluate(async V=>{const{state}=await import('/js/state.js'+V);state.update(s=>{const prev=s.undoStack.pop();if(prev){s.redoStack.push(JSON.parse(JSON.stringify(s.objects)));s.objects=prev;}});},V);
  assert.equal(await snap(),before,'되돌리기 기록이 남아 있다');
  assert.deepEqual(errors,[]);console.log(`PASS ${name} science objects palette and inspector fit`);
 }finally{await browser.close();}
}}).catch(error=>{console.error(error);process.exitCode=1;});
