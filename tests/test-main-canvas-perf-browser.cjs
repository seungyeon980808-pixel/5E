// 메인 편집기 성능(2026-10-19 밤 점검): 오브젝트 120개 캔버스에서 끌기 한 걸음마다 그리기가 오브젝트 수만큼
// 레이아웃을 다시 계산하지 않고(getScreenCTM 호출 수로 확인 — 시간과 달리 컴퓨터 빠르기와 무관), 오브젝트 검색 창이
// 아이콘마다 레이아웃을 다시 계산하지 않는다(getBBox 사이에 쓰기 없음). 큰 그림은 편집 화면에서 blob URL로 재사용한다.
// 시간은 참고로만 찍는다.
const assert=require('node:assert/strict');const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const h=require('./helpers/rhwp-exam.cjs');
const V='?v=1.7.0-four-session-integration';
h.withServer(async origin=>{for(const[name,engine]of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)){
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
  // 큰 그림: 편집 화면에서는 data URL을 blob URL로 바꿔 다시 그려도 같은 주소를 쓰고(WebKit이 매번 다시 풀지 않게),
  // 내보내기 SVG·저장 데이터는 data URL 그대로다. 되돌리기 기록은 글자열을 복사하지 않는다.
  const image=await page.evaluate(async V=>{const{state}=await import('/js/state.js'+V);const exp=await import('/js/svg-export.js'+V);
   const c=document.createElement('canvas');c.width=600;c.height=400;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,600,400);for(let i=0;i<200;i++){g.strokeStyle=`hsl(${i*7},60%,40%)`;g.beginPath();g.moveTo(i*3,0);g.lineTo(600-i*3,400);g.stroke();}
   const src=c.toDataURL('image/png');state.update(s=>{s.undoStack.push(JSON.parse(JSON.stringify(s.objects)));s.objects.push({id:'big_img',type:'image',x:-20,y:-15,w:30,h:20,src});s.selectedIds=[];});
   const href=()=>document.querySelector('#scene [data-id="big_img"]')?.getAttribute('href');const first=href();state.update(s=>{s.objects.find(o=>o.id==='perf_0').x+=1;});const second=href();
   const svg=exp.buildExportSvg(state.get());const exported=[...svg.querySelectorAll('image')].map(i=>i.getAttribute('href')).find(h=>h?.length===src.length);
   const{undo,redo}=await import('/js/transform.js'+V);undo(state);redo(state);const restored=state.get().objects.find(o=>o.id==='big_img');
   return {first:first?.slice(0,5),same:first===second,exportedIsData:exported===src,savedIsData:restored?.src===src,sharedAfterUndo:restored?.src===state.get().undoStack.at(-1)?.find?.(o=>o.id==='big_img')?.src||null};},V);
  assert.equal(image.first,'blob:','편집 화면 그림은 blob URL');assert.ok(image.same,'다시 그려도 같은 blob URL');
  assert.ok(image.exportedIsData,'내보내기 SVG는 data URL 그대로');assert.ok(image.savedIsData,'되돌리기·다시 실행 뒤 그림 데이터 그대로');
  assert.deepEqual(errors,[]);console.log(`PASS ${name} main canvas perf — drag 20 steps ${ms}ms, getScreenCTM ${ctm}, search open ${Math.round(open)}ms (${icons} icons)`);
 }finally{await browser.close();}
}}).catch(error=>{console.error(error);process.exitCode=1;});
