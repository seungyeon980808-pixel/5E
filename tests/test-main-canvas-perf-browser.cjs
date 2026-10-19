// 메인 편집기 성능(2026-10-19 밤 점검): 오브젝트 120개 캔버스에서 끌기 한 걸음마다 그리기가 오브젝트 수만큼
// 레이아웃을 다시 계산하지 않고(getScreenCTM 호출 수로 확인 — 시간과 달리 컴퓨터 빠르기와 무관), 오브젝트 검색 창이
// 아이콘마다 레이아웃을 다시 계산하지 않는다(getBBox 사이에 쓰기 없음). 시간은 참고로만 찍는다.
const assert=require('node:assert/strict');const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const h=require('./helpers/rhwp-exam.cjs');
const V='?v=1.7.0-four-session-integration';
h.withServer(async origin=>{for(const[name,engine]of Object.entries({chromium,webkit})){
 const browser=await engine.launch(),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await h.navigate(page,origin+'/?mode=pro&mobile=0&exam=0');await h.ready(page);
  await page.evaluate(async V=>{const{state}=await import('/js/state.js'+V);state.update(s=>{for(let i=0;i<120;i++){const x=-40+(i%12)*7,y=-25+Math.floor(i/12)*5,id='perf_'+i,k=i%4;
   s.objects.push(k===0?{id,type:'rect',x,y,w:5,h:3.5,strokeWidth:0.2}:k===1?{id,type:'line',p1:{x,y},p2:{x:x+5,y:y+3},strokeWidth:0.2}:k===2?{id,type:'ellipse',x,y,w:4,h:3,strokeWidth:0.2}:{id,type:'text',x,y,text:'가'+i,fontSize:3});}s.selectedIds=[];});},V);
  // 레이아웃을 강제하는 호출 수를 센다.
  await page.evaluate(()=>{window.__ctm=0;const o=SVGGraphicsElement.prototype.getScreenCTM;SVGGraphicsElement.prototype.getScreenCTM=function(){window.__ctm++;return o.call(this);};
   window.__bbox=[];const b=SVGGraphicsElement.prototype.getBBox;SVGGraphicsElement.prototype.getBBox=function(...a){window.__bbox.push(this.closest('.object-search-results')?1:0);return b.apply(this,a);};});
  const pt=await page.evaluate(async V=>{const{state}=await import('/js/state.js'+V);const{worldToScreen}=await import('/js/viewport.js'+V);const o=state.get().objects.find(o=>o.id==='perf_1');return worldToScreen(document.querySelector('#canvas'),state.get().viewBox,o.p1.x+2.5,o.p1.y+1.5);},V);
  await page.mouse.click(pt.x,pt.y);
  const selected=await page.evaluate(async V=>{const{state}=await import('/js/state.js'+V);return state.get().selectedIds;},V);assert.deepEqual(selected,['perf_1'],'선을 눌러 고른다');
  await page.evaluate(()=>{window.__ctm=0;});const t0=Date.now();
  await page.mouse.move(pt.x,pt.y);await page.mouse.down();for(let i=1;i<=20;i++)await page.mouse.move(pt.x+i*4,pt.y+i*2);await page.mouse.up();
  const ms=Date.now()-t0,ctm=await page.evaluate(()=>window.__ctm);
  // 고치기 전: 걸음마다 선·글 오브젝트 수(60개+)만큼 → 20걸음에 2,000번 넘게. 지금은 걸음마다 10번 안팎.
  assert.ok(ctm<20*30,`끌기 20걸음의 getScreenCTM 호출 ${ctm}번 — 오브젝트마다 배율을 다시 읽으면 안 된다`);
  const moved=await page.evaluate(async V=>{const{state}=await import('/js/state.js'+V);return state.get().objects.find(o=>o.id==='perf_1').p1.x;},V);assert.ok(moved>-33+5,'선이 실제로 옮겨졌다');
  // 오브젝트 검색 창: 아이콘 크기를 모두 읽은 뒤에 고친다.
  await page.keyboard.press('Escape');
  const open=await page.evaluate(()=>{window.__bbox=[];const t=performance.now();document.dispatchEvent(new KeyboardEvent('keydown',{key:'f',code:'KeyF',ctrlKey:true,metaKey:true,bubbles:true}));return performance.now()-t;});
  await page.locator('.modal-overlay:not([hidden]) .object-search-row').first().waitFor();
  const icons=await page.locator('.modal-overlay:not([hidden]) .object-search-icon svg').count();
  assert.ok(icons>100,'검색 창에 오브젝트 아이콘이 다 나온다');
  const sized=await page.evaluate(()=>[...document.querySelectorAll('.modal-overlay:not([hidden]) .object-search-icon svg')].filter(s=>s.getAttribute('viewBox')).length);
  assert.ok(sized>=icons-5,`아이콘 viewBox가 맞춰졌다(${sized}/${icons})`);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);console.log(`PASS ${name} main canvas perf — drag 20 steps ${ms}ms, getScreenCTM ${ctm}, search open ${Math.round(open)}ms (${icons} icons)`);
 }finally{await browser.close();}
}}).catch(error=>{console.error(error);process.exitCode=1;});
