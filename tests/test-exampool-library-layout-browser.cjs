// ExamPool 문항 카드 왼쪽 라이브러리 칸 정리(2026-10-19, 시안 5e-design-mockups/library-layout.html 안 B)와
// 5E 라이브러리 창 「보내기」(이미지 객체화 자리)를 두 엔진으로 확인한다.
//  - 탭 줄이 머리 줄(44) · 도구 한 줄(모두 30, 윗선 같음) · 기출 카드는 5E 라이브러리 모양으로 한 줄에 2개 · 줄 단위로 멈춤
//  - 「근거 N」을 누르면 이 문항의 근거가 겹쳐 펼쳐짐
//  - 자료 PDF는 한 쪽이 통째로 보이고, 상태 문장은 아래 상태 막대로 · 빨간 오류 글은 6초 뒤 사라짐
//  (5E 라이브러리 창 「보내기」는 test-teacher-flow-library-send-browser.cjs)
const assert = require('node:assert/strict');
const fs = require('node:fs');const path = require('node:path');
const {chromium,webkit} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/exampool/library-layout');

// 글 한 줄과 상자 몇 개가 있는 A4 한 쪽 PDF(외부 파일 없이 만든다).
function a4Pdf(){
  const content='0 0 0 RG 2 w 60 60 475 722 re S BT /F1 28 Tf 90 740 Td (EXAMPOOL PDF PAGE) Tj ET 90 600 200 120 re S 320 600 200 120 re S 90 120 430 60 re S';
  const objs=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out='%PDF-1.4\n';const offsets=[];
  objs.forEach((o,i)=>{offsets.push(out.length);out+=`${i+1} 0 obj\n${o}\nendobj\n`;});
  const xref=out.length;out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out,'latin1');
}

h.withServer(async origin => {
  fs.mkdirSync(evidence,{recursive:true});
  const pdfPath=path.join(evidence,'a4-fixture.pdf');fs.writeFileSync(pdfPath,a4Pdf());
  for (const [engineName,engine] of Object.entries({chromium,webkit}).filter(([name]) => !process.env.EXAM_ENGINE || name === process.env.EXAM_ENGINE)) {
    const browser = await engine.launch({headless:true});
    try {
      const context = await browser.newContext({viewport:{width:1512,height:900}});
      const page = await context.newPage(), errors = [];page.on('pageerror',error => errors.push(error.message));
      await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
      await page.addStyleTag({content:'.tut-pointout,.tut-pointout-ring{display:none!important}'});
      await page.locator('#exam-pool-open').click();
      const frameHandle=await page.waitForSelector('#exampool-sheet-workspace iframe');const sheet=await frameHandle.contentFrame();
      sheet.on?.('pageerror',e=>errors.push(e.message));
      await sheet.waitForSelector('#side-new');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중',null,{timeout:30000});
      await sheet.click('#side-new');await sheet.click('#new-dialog .nq-opt[data-step="form"][data-k="combo"]');await sheet.click('#new-dialog .nq-opt[data-step="struct"][data-k="experiment"]');await sheet.click('#new-dialog [data-nq="go"]');
      await sheet.waitForSelector('#card-view:not([hidden]) .cv-writer');

      // 1. 머리 한 줄(시안 library-one-row.html): [검색 범위 ▾][검색창][상세검색][5E 라이브러리][근거 N] — 높이 44, 칸 맨 위, 가운데 머리 줄과 같은 줄.
      await sheet.selectOption('#card-view [data-cvscope]','past');
      await sheet.waitForSelector('#card-view .past-list figure.past',{timeout:30000});
      const head=await sheet.evaluate(()=>{const lib=document.querySelector('#card-view .cv-left'),row=lib.querySelector('.lp-one'),r=row.getBoundingClientRect(),bar=document.querySelector('#card-view .cv-center .cv-bar').getBoundingClientRect();
        return {old:!!lib.querySelector('.cv-ph,.lp-tabs,.lp-tools,.lib5e,.lib-builtin'),h:Math.round(r.height),top:Math.round(r.top-lib.getBoundingClientRect().top),barTop:Math.round(bar.top-r.top),
          kids:[...row.children].map(n=>{const k=n.matches('.lp-slot')?n.firstElementChild:n,b=k.getBoundingClientRect();return {k:n.matches('select')?'scope':n.matches('.lp-slot')?'search':n.dataset.cvadv!==undefined?'adv':n.dataset.cvlib?'lib':n.dataset.cvlinked!==undefined?'refs':n.className,top:Math.round(b.top),h:Math.round(b.height)};}),
          scopes:[...row.querySelectorAll('[data-cvscope] option')].map(o=>o.textContent)};});
      assert.equal(head.old,false,'no title row, tab row, second tool row or guide box');
      assert.equal(head.h,44,'one 44px head row');assert.equal(head.top,0,'at the top of the pane');assert.equal(head.barTop,0,'on the same line as the card head row');
      assert.deepEqual(head.kids.map(k=>k.k),['scope','search','adv','lib','refs'],'scope · search · detail search · library · evidence');
      assert.ok(head.kids.every(k=>k.h===30)&&new Set(head.kids.map(k=>k.top)).size===1,'all 30px on one line: '+JSON.stringify(head.kids));
      assert.deepEqual(head.scopes,['기출문제','교과서','성취기준·교육과정','자료']);
      assert.equal(await sheet.locator('#card-view .lp-pick').getAttribute('aria-label'),'5E 라이브러리에서 고르기','the library icon keeps its name');

      // 2. 상세검색: 과목·단원·연도는 단추 아래 작은 창에서. 고른 개수는 단추 숫자, 바깥을 누르면 닫힘.
      await sheet.click('#card-view [data-cvadv]');
      assert.equal(await sheet.locator('#card-view .lp-adv-pop').isVisible(),true);
      assert.deepEqual(await sheet.locator('#card-view .lp-adv-pop select').evaluateAll(l=>l.map(s=>s.getAttribute('aria-label'))),['과목','단원','연도']);
      const allPast=Number((await sheet.locator('#card-view .lp-search .lp-n').textContent()).replace(/[^0-9]/g,''));
      await sheet.selectOption('#card-view .lp-adv-pop [data-cvpast="subject"]','물리학Ⅰ');
      await sheet.waitForFunction(()=>document.querySelector('#card-view [data-cvslot="advn"]').textContent==='1');
      assert.equal(await sheet.locator('#card-view .lp-adv-pop').isVisible(),true,'stays open while choosing');
      assert.ok(Number((await sheet.locator('#card-view .lp-search .lp-n').textContent()).replace(/[^0-9]/g,''))<allPast,'subject narrows the list');
      await sheet.click('#card-view .lp-adv-pop [data-cvadvclear]');await sheet.waitForFunction(()=>document.querySelector('#card-view [data-cvslot="advn"]').hidden);
      await sheet.click('#card-view .cv-center',{position:{x:200,y:300}});
      assert.equal(await sheet.locator('#card-view .lp-adv-pop').isVisible(),false,'closes on outside click');
      await sheet.waitForSelector('#card-view .past-list figure.past',{timeout:30000});

      // 3. 기출 문항 카드는 5E 라이브러리 「문항」 탭 카드 모양으로 한 줄에 2개(시안 library-two-col.html 안 C):
      //    두 칸 폭이 같고 윗선이 같으며, 그림 칸은 정사각(그림은 칸 폭에 맞춰 위에 붙고, 긴 문항은 아래만 잘림), 같은 줄 제목 줄이 맞고, 한 화면에 4개 이상 온전히 보이고 줄 단위로 멈춘다.
      const grid=await sheet.evaluate(()=>{const list=document.querySelector('#card-view .past-list'),cs=getComputedStyle(list),lr=list.getBoundingClientRect();
        const cards=[...list.querySelectorAll('figure.past')],rects=cards.map(c=>c.getBoundingClientRect()),img=cards[0].querySelector('img').getBoundingClientRect(),pic=cards[0].querySelector('.past-pic')?.getBoundingClientRect();
        const inner=list.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
        const full=rects.filter(r=>r.top>=lr.top-0.5&&r.bottom<=lr.bottom-parseFloat(cs.paddingBottom)+0.5).length;
        return {w:[rects[0].width,rects[1].width],want:(inner-12)/2,tops:[rects[0].top,rects[1].top,rects[2]?.top],ratio:pic?pic.width/pic.height:0,inside:cards.slice(0,8).every(c=>{const p=c.querySelector('.past-pic')?.getBoundingClientRect(),i=c.querySelector('.past-pic img,.past-pic .past-text')?.getBoundingClientRect();return !p||!i||i.bottom<=p.bottom+0.5;}),capRows:[0,2,4].filter(k=>cards[k+1]).map(k=>[cards[k],cards[k+1]].map(c=>Math.round(c.querySelector('figcaption').getBoundingClientRect().top))),imgTop:pic?Math.round(img.top-pic.top):-1,imgW:pic?Math.round(img.width-pic.width):-1,full,count:cards.length,
          title:cards[0].querySelector('figcaption b').textContent,full_title:cards[0].querySelector('figcaption b').title,snap:cs.scrollSnapType,align:getComputedStyle(cards[0]).scrollSnapAlign};});
      assert.ok(grid.w.every(v=>Math.abs(v-grid.want)<=1),`two equal columns: ${grid.w} vs ${grid.want}`);
      assert.equal(Math.round(grid.tops[0]),Math.round(grid.tops[1]),'two cards share one row');assert.ok(grid.tops[2]>grid.tops[0],'the third card starts the next row');
      assert.ok(Math.abs(grid.ratio-1)<0.02,'the picture box is square like the 5E library: '+grid.ratio);
      assert.ok(grid.capRows.every(([a,b])=>a===b),'captions in one row line up: '+JSON.stringify(grid.capRows));
      assert.deepEqual([grid.imgTop,grid.imgW],[0,0],'the picture fills the box width from the top');
      assert.ok(grid.full>=2,'at least one full row of two question cards is visible: '+grid.full);
      assert.match(grid.title,/^[가-힣]+[12] \d{2}년 (\d+평|수능) \d+번$/,'short title like the 5E library: '+grid.title);
      assert.match(grid.full_title,/학년도/,'the full title stays in the tooltip');
      assert.match(grid.snap,/y mandatory/);assert.equal(grid.align,'start');
      if(grid.count>=5){
        await sheet.locator('#card-view .past-list').hover();await page.mouse.wheel(0,250);await sheet.waitForTimeout(1200);
        const snapped=await sheet.evaluate(()=>{const list=document.querySelector('#card-view .past-list'),lr=list.getBoundingClientRect();return [...list.querySelectorAll('figure.past')].some(c=>Math.abs(c.getBoundingClientRect().top-lr.top)<=1)&&list.scrollTop>0;});
        assert.ok(snapped,'a wheel scroll stops on a row edge');
      }
      // 「근거로 연결」·「변형」은 카드 아래 한 줄에 그대로.
      assert.equal(await sheet.locator('#card-view figure.past').first().locator('[data-cvlink]').count(),1);
      assert.equal(await sheet.locator('#card-view figure.past').first().locator('[data-cvconvert]').count(),1);

      // 3b. 그림은 좌우가 잘리지 않는다: 그림 폭 = 그림 칸 폭 = 카드 안쪽 폭(긴 문항은 아래만 칸에서 잘림).
      const wide=await sheet.evaluate(()=>[...document.querySelectorAll('#card-view figure.past')].slice(0,6).every(c=>{const p=c.querySelector('.past-pic').getBoundingClientRect(),i=c.querySelector('.past-pic img,.past-pic .past-text').getBoundingClientRect();return Math.abs(i.left-p.left)<=0.5&&Math.abs(i.width-p.width)<=0.5&&Math.abs(p.height-p.width)<=1;}));
      assert.ok(wide,'pictures fill the square box width without horizontal cropping');
      // 3c. 검색 색인(5e.ai.kr/examlibrary와 같은 규칙): 단어 + Enter → 조각, 최대 3개, ×·Backspace로 지움, 띄어쓰기 무시.
      const query=sheet.locator('#card-view [data-cvpast="query"]'),tokens=()=>sheet.locator('#card-view .lp-token').allTextContents(),count=async()=>Number((await sheet.locator('#card-view .lp-search .lp-n').textContent()).replace(/[^0-9]/g,''));
      const all=await count();
      await query.click();await page.keyboard.type('자기장');await page.keyboard.press('Enter');
      await sheet.waitForFunction(()=>document.querySelectorAll('#card-view .lp-token').length===1);
      assert.deepEqual(await tokens(),['자기장×']);const one=await count();assert.ok(one>0&&one<all,'one index word narrows the list');
      await query.click();await page.keyboard.type('유도 전류');await page.keyboard.press('Enter');
      await sheet.waitForFunction(()=>document.querySelectorAll('#card-view .lp-token').length===3);
      const three=await count();assert.ok(three<=one,'every index word must match');
      await query.click();await page.keyboard.type('간섭');await page.keyboard.press('Enter');
      assert.equal((await tokens()).length,3,'at most three index words');
      await sheet.fill('#card-view [data-cvpast="query"]','');await query.click();await page.keyboard.press('Backspace');
      await sheet.waitForFunction(()=>document.querySelectorAll('#card-view .lp-token').length===2);
      await sheet.click('#card-view .lp-token');await sheet.waitForFunction(()=>document.querySelectorAll('#card-view .lp-token').length===1);
      assert.equal(await sheet.evaluate(()=>document.activeElement?.dataset?.cvpast),'query','focus stays in the search box');
      await sheet.click('#card-view .lp-token');await sheet.waitForFunction(()=>document.querySelectorAll('#card-view .lp-token').length===0);
      assert.equal(await count(),all);
      await query.click();await page.keyboard.type('자 기 장');await page.keyboard.press('Enter');
      await sheet.waitForFunction(()=>document.querySelectorAll('#card-view .lp-token').length===3);
      await sheet.click('#card-view .lp-token');await sheet.click('#card-view .lp-token');await sheet.click('#card-view .lp-token');
      await query.click();await page.keyboard.type('자기 장');await sheet.waitForTimeout(400);
      assert.equal(await sheet.evaluate(()=>document.querySelector('#card-view [data-cvpast="query"]').value),'자기 장');
      await sheet.fill('#card-view [data-cvpast="query"]','');await sheet.waitForTimeout(400);

      // 3d. 한글 입력: 조합 중에는 입력 칸을 다시 그리지 않고, 조합 중 Enter는 마지막 글자까지 확정된 단어로 조각을 만든다(두 순서 모두).
      for(const [word,order] of [['질량','keydown-first'],['자석','compositionend-first']]){
        const r=await sheet.evaluate(async([word,order])=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));const n=document.querySelector('#card-view [data-cvpast="query"]');n.focus();
          n.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
          for(let k=1;k<=word.length;k++){n.value=word.slice(0,k);n.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:word[k-1]}));await sleep(300);}
          const same=n===document.querySelector('#card-view [data-cvpast="query"]');
          const enter=init=>n.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,keyCode:229,...init}));
          if(order==='keydown-first'){enter({isComposing:true});n.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:word}));}
          else{n.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:word}));enter({});}
          await sleep(800);return {same,tokens:[...document.querySelectorAll('#card-view .lp-token')].map(t=>t.textContent.replace('×',''))};},[word,order]);
        assert.equal(r.same,true,'the search box is not rebuilt while composing Hangul');assert.ok(r.tokens.includes(word),`${order}: the whole word becomes an index word: ${r.tokens}`);
      }
      while(await sheet.locator('#card-view .lp-token').count())await sheet.click('#card-view .lp-token');

      // 3e. 문항 더블클릭 → 라이브러리 칸 안(머리 줄 아래)에서 크게 보기, ← → 넘기기, Esc 닫기.
      await sheet.dblclick('#card-view .past-list figure.past:nth-child(2) .past-pic');
      const zoom=await sheet.evaluate(()=>{const z=document.querySelector('#card-view .lp-zoom'),l=document.querySelector('#card-view .cv-left').getBoundingClientRect(),r=z.getBoundingClientRect();
        return {inLib:r.left>=l.left-0.5&&r.right<=l.right+0.5&&r.bottom<=l.bottom+0.5,top:Math.round(r.top-l.top),pos:z.querySelector('.pos').textContent,acts:z.querySelectorAll('.lp-zoom-foot [data-cvlink],.lp-zoom-foot [data-cvconvert]').length};});
      assert.ok(zoom.inLib,'the zoom stays inside the library pane');assert.equal(zoom.top,44,'below the head row');assert.match(zoom.pos,/^2 \/ \d+$/);assert.equal(zoom.acts,2,'link and convert are available in the zoom');
      await page.keyboard.press('ArrowRight');assert.match(await sheet.locator('#card-view .lp-zoom .pos').textContent(),/^3 \//);
      // 확대 창에서 근거로 연결하거나 화면 색을 바꿔도(카드 화면이 다시 그려져도) 같은 문항 확대가 남는다.
      const zt=await sheet.locator('#card-view .lp-zoom-head b').textContent();
      await sheet.click('#card-view .lp-zoom [data-cvlink]');await sheet.waitForTimeout(600);
      assert.equal(await sheet.locator('#card-view .lp-zoom-head b').textContent(),zt,'zoom survives linking evidence');
      await page.evaluate(()=>{document.documentElement.setAttribute('data-theme','light');document.documentElement.setAttribute('data-palette','graphite');});await sheet.waitForTimeout(600);
      assert.equal(await sheet.locator('#card-view .lp-zoom').isVisible(),true,'zoom survives a theme change');
      await page.evaluate(()=>{document.documentElement.setAttribute('data-theme','dark');document.documentElement.setAttribute('data-palette','classic');});await sheet.waitForTimeout(300);
      await page.keyboard.press('Escape');assert.equal(await sheet.locator('#card-view .lp-zoom').count(),0);

      // 4. 「근거 N」은 겹쳐 펼쳐진다(목록 높이는 그대로).
      const listH=await sheet.evaluate(()=>document.querySelector('#card-view .past-list').clientHeight);
      await sheet.click('#card-view [data-cvlinked]');
      assert.equal(await sheet.locator('#card-view .lp-linked').isVisible(),true,'evidence list opens');
      assert.equal(await sheet.evaluate(()=>document.querySelector('#card-view .past-list').clientHeight),listH,'opening the evidence list does not move the cards');
      await sheet.click('#card-view [data-cvlinked]');assert.equal(await sheet.locator('#card-view .lp-linked').isVisible(),false);

      // 5. 교과서 탭도 같은 틀(도구 한 줄 + 5E 라이브러리 단추).
      await sheet.selectOption('#card-view [data-cvscope]','textbooks');
      await sheet.waitForSelector('#card-view .past-list figure.book',{timeout:30000});
      assert.equal(await sheet.locator('#card-view .lp-one [data-cvlib="textbook"]').count(),1);
      assert.equal(await sheet.locator('#card-view figure.book b').first().textContent(),'교과서_중2 1쪽','5E shared textbook pages are listed');
      await sheet.fill('#card-view [data-cvpast="query"]','120');await sheet.press('#card-view [data-cvpast="query"]','Enter');
      await sheet.waitForFunction(()=>document.querySelector('#card-view figure.book b')?.textContent==='교과서_중2 120쪽');
      await sheet.fill('#card-view [data-cvpast="query"]','');await sheet.press('#card-view [data-cvpast="query"]','Enter');
      await page.screenshot({path:path.join(evidence,`${engineName}-past.png`)});

      // 6. 자료 PDF: 한 쪽이 통째로 보이고, 상태 문장은 아래 상태 막대로.
      // 기준 검색어는 기준에만: 자료로 가서 새 PDF를 열면 지난 검색어에 걸러지지 않고 보인다.
      await sheet.selectOption('#card-view [data-cvscope]','standards');await sheet.waitForTimeout(600);
      await sheet.fill('#card-view [data-cvsrc]','에너지');await sheet.waitForTimeout(400);
      await sheet.selectOption('#card-view [data-cvscope]','references');
      assert.equal(await sheet.locator('#card-view [data-cvsrc]').inputValue(),'','each scope keeps its own search');
      await sheet.waitForSelector('#card-view #sources #add-doc');
      assert.equal(await sheet.locator('#card-view #sources .source-controls').isVisible(),false,'the document search moves to the head row');
      await sheet.evaluate(()=>{window.__statusSeen=[];new MutationObserver(()=>window.__statusSeen.push(document.querySelector('#status').textContent)).observe(document.querySelector('#status'),{childList:true,characterData:true,subtree:true});});
      await sheet.setInputFiles('#source-file',pdfPath);
      await sheet.waitForSelector('#card-view #doc-view img',{timeout:60000});
      await sheet.waitForFunction(()=>{const i=document.querySelector('#card-view #doc-view img');return i.complete&&i.naturalWidth>0;});
      const pdf=await sheet.evaluate(()=>{const body=document.querySelector('#card-view [data-cvbody="docked"]'),img=body.querySelector('#doc-view img'),b=body.getBoundingClientRect(),r=img.getBoundingClientRect();
        const rows=[...body.querySelectorAll('.doc-bar>*,.doc-nav>:is(button,input,select)')].map(n=>{const x=n.getBoundingClientRect();return {id:n.id,top:Math.round(x.top),h:Math.round(x.height)};});
        return {inside:r.top>=b.top-0.5&&r.bottom<=b.bottom+0.5&&r.left>=b.left-0.5&&r.right<=b.right+0.5,ratio:r.width/r.height,rows,status:window.__statusSeen,
          panelStatus:getComputedStyle(document.querySelector('#source-status')).display};});
      assert.ok(pdf.inside,'the whole PDF page is inside the pane');assert.ok(Math.abs(pdf.ratio-595/842)<0.01,'the page keeps its A4 shape: '+pdf.ratio);
      const bar=pdf.rows.filter(r=>['doc-pick','add-doc','download-doc'].includes(r.id)),nav=pdf.rows.filter(r=>['prev-page','doc-page','next-page','quote','attach-ref'].includes(r.id));
      assert.equal(bar.length,3);assert.equal(nav.length,5);
      for(const group of [bar,nav])assert.ok(group.every(r=>r.h===30)&&new Set(group.map(r=>r.top)).size===1,'each row is one 30px line: '+JSON.stringify(group));
      assert.ok(pdf.status.includes('자료 원문을 열었습니다.'),'the source status goes to the status bar: '+pdf.status);assert.equal(pdf.panelStatus,'none');
      await page.screenshot({path:path.join(evidence,`${engineName}-pdf.png`)});

      // 7. 빨간 상태 글은 6초 뒤 사라진다(엑셀 열기 실패와 같은 길).
      await sheet.evaluate(()=>{const f=document.querySelector('#excel-file');const dt=new DataTransfer();dt.items.add(new File(['x'],'broken.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));f.files=dt.files;f.dispatchEvent(new Event('change'));});
      await sheet.waitForFunction(()=>document.querySelector('#status').dataset.error==='true',null,{timeout:10000});
      const red=await sheet.evaluate(()=>document.querySelector('#status').textContent);assert.ok(red,'an error is shown in red');
      await sheet.waitForTimeout(5000);assert.equal(await sheet.evaluate(()=>document.querySelector('#status').textContent),red,'still shown before 6 seconds');
      await sheet.waitForFunction(()=>document.querySelector('#status').textContent===''&&document.querySelector('#status').dataset.error==='false',null,{timeout:3000});

      // 라이브러리 칸을 끌기 최소(240)까지 줄여도 머리 줄이 칸 밖으로 넘치지 않고 검색창이 남는다.
      await sheet.selectOption('#card-view [data-cvscope]','past');await sheet.waitForSelector('#card-view .past-list figure.past',{timeout:30000});
      for(const w of [240,300,380,545]){
        await sheet.evaluate(w=>document.querySelector('#card-view').style.setProperty('--cv-lw',w+'px'),w);await sheet.waitForTimeout(150);
        const r=await sheet.evaluate(()=>{const l=document.querySelector('#card-view .cv-left').getBoundingClientRect(),s=document.querySelector('#card-view .lp-one .lp-search').getBoundingClientRect();return {over:[...document.querySelectorAll('#card-view .lp-one>*')].some(n=>n.getBoundingClientRect().right>l.right+0.5),sw:s.width,cut:[...document.querySelectorAll('#card-view figure.past b')].slice(0,4).some(b=>b.scrollWidth>b.clientWidth)};});
        assert.ok(!r.over&&r.sw>=60&&!r.cut,`library pane ${w}px: ${JSON.stringify(r)}`);
      }
      assert.deepEqual(errors,[],'no page errors');
      console.log(`${engineName}: ok`);
    } finally {await browser.close();}
  }
});
