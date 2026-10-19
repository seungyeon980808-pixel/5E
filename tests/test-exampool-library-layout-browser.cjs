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

      // 1. 탭 줄이 머리 줄 — 「라이브러리 · 읽고 근거로 연결」 줄·안내 상자·접기 줄은 없다.
      await sheet.click('#card-view [data-cvtab="past"]');
      await sheet.waitForSelector('#card-view .past-list figure.past',{timeout:30000});
      const head=await sheet.evaluate(()=>{const lib=document.querySelector('#card-view .cv-left'),tabs=lib.querySelector('.lp-tabs');
        return {ph:!!lib.querySelector('.cv-ph'),guide:!!lib.querySelector('.lib5e,.lib-builtin'),tabsH:Math.round(tabs.getBoundingClientRect().height),tabsTop:Math.round(tabs.getBoundingClientRect().top-lib.getBoundingClientRect().top),
          names:[...tabs.querySelectorAll('button')].map(b=>b.textContent.trim()),btnH:[...tabs.querySelectorAll('button')].map(b=>Math.round(b.getBoundingClientRect().height))};});
      assert.equal(head.ph,false,'the left pane has no separate title row');assert.equal(head.guide,false,'the guide box and the fold row are gone');
      assert.equal(head.tabsH,44,'the tab row is the 44px head row');assert.equal(head.tabsTop,0,'the tab row is at the top of the pane');
      assert.deepEqual(head.names.slice(0,4),['기출','교과서','기준','자료']);assert.match(head.names[4],/^근거 \d+$/,'the evidence count sits at the right end of the tab row');
      assert.ok(head.btnH.every(v=>v===30),'tab buttons are 30px: '+head.btnH);

      // 2. 도구는 한 줄: 검색·과목·단원·연도·5E 라이브러리, 모두 30px이고 윗선이 같다.
      const tools=await sheet.evaluate(()=>{const row=document.querySelector('#card-view .lp-tools .lp-row');return [...row.children].map(n=>{const r=n.getBoundingClientRect();return {k:n.matches('.lp-search')?'search':n.tagName==='SELECT'?n.getAttribute('aria-label'):n.dataset.cvlib?'lib':n.className,top:Math.round(r.top),h:Math.round(r.height)};});});
      assert.deepEqual(tools.map(t=>t.k),['search','과목','단원','연도','lib'],'one tool row in this order');
      assert.ok(tools.every(t=>t.h===30)&&new Set(tools.map(t=>t.top)).size===1,'all tools are 30px on one line: '+JSON.stringify(tools));
      assert.equal(await sheet.locator('#card-view .lp-pick').getAttribute('aria-label'),'5E 라이브러리에서 고르기','the library icon keeps its name');

      // 3. 기출 문항 카드는 5E 라이브러리 「문항」 탭 카드 모양으로 한 줄에 2개(시안 library-two-col.html 안 C):
      //    두 칸 폭이 같고 윗선이 같으며, 그림 칸은 최소 정사각(그림은 칸 폭에 맞춰 위에 붙고, 긴 문항은 칸이 늘어남), 같은 줄 제목 줄이 맞고, 한 화면에 4개 이상 온전히 보이고 줄 단위로 멈춘다.
      const grid=await sheet.evaluate(()=>{const list=document.querySelector('#card-view .past-list'),cs=getComputedStyle(list),lr=list.getBoundingClientRect();
        const cards=[...list.querySelectorAll('figure.past')],rects=cards.map(c=>c.getBoundingClientRect()),img=cards[0].querySelector('img').getBoundingClientRect(),pic=cards[0].querySelector('.past-pic')?.getBoundingClientRect();
        const inner=list.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
        const full=rects.filter(r=>r.top>=lr.top-0.5&&r.bottom<=lr.bottom-parseFloat(cs.paddingBottom)+0.5).length;
        return {w:[rects[0].width,rects[1].width],want:(inner-12)/2,tops:[rects[0].top,rects[1].top,rects[2]?.top],ratio:pic?pic.width/pic.height:0,inside:cards.slice(0,8).every(c=>{const p=c.querySelector('.past-pic')?.getBoundingClientRect(),i=c.querySelector('.past-pic img,.past-pic .past-text')?.getBoundingClientRect();return !p||!i||i.bottom<=p.bottom+0.5;}),capRows:[0,2,4].filter(k=>cards[k+1]).map(k=>[cards[k],cards[k+1]].map(c=>Math.round(c.querySelector('figcaption').getBoundingClientRect().top))),imgTop:pic?Math.round(img.top-pic.top):-1,imgW:pic?Math.round(img.width-pic.width):-1,full,count:cards.length,
          title:cards[0].querySelector('figcaption b').textContent,full_title:cards[0].querySelector('figcaption b').title,snap:cs.scrollSnapType,align:getComputedStyle(cards[0]).scrollSnapAlign};});
      assert.ok(grid.w.every(v=>Math.abs(v-grid.want)<=1),`two equal columns: ${grid.w} vs ${grid.want}`);
      assert.equal(Math.round(grid.tops[0]),Math.round(grid.tops[1]),'two cards share one row');assert.ok(grid.tops[2]>grid.tops[0],'the third card starts the next row');
      assert.ok(grid.ratio<=1.02,'the picture box is at least square like the 5E library: '+grid.ratio);
      assert.ok(grid.inside,'long questions grow the box so the choices line is never cut');
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

      // 4. 「근거 N」은 겹쳐 펼쳐진다(목록 높이는 그대로).
      const listH=await sheet.evaluate(()=>document.querySelector('#card-view .past-list').clientHeight);
      await sheet.click('#card-view [data-cvlinked]');
      assert.equal(await sheet.locator('#card-view .lp-linked').isVisible(),true,'evidence list opens');
      assert.equal(await sheet.evaluate(()=>document.querySelector('#card-view .past-list').clientHeight),listH,'opening the evidence list does not move the cards');
      await sheet.click('#card-view [data-cvlinked]');assert.equal(await sheet.locator('#card-view .lp-linked').isVisible(),false);

      // 5. 교과서 탭도 같은 틀(도구 한 줄 + 5E 라이브러리 단추).
      await sheet.click('#card-view [data-cvtab="textbooks"]');
      assert.equal(await sheet.locator('#card-view [data-cvbody="past"] .lp-tools [data-cvlib="textbook"]').count(),1);
      await page.screenshot({path:path.join(evidence,`${engineName}-past.png`)});

      // 6. 자료 PDF: 한 쪽이 통째로 보이고, 상태 문장은 아래 상태 막대로.
      await sheet.click('#card-view [data-cvtab="references"]');
      await sheet.waitForSelector('#card-view #sources #add-doc');
      assert.equal(await sheet.locator('#card-view #sources .source-controls').isVisible(),false,'the document search row is folded into the document picker');
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

      assert.deepEqual(errors,[],'no page errors');
      console.log(`${engineName}: ok`);
    } finally {await browser.close();}
  }
});
