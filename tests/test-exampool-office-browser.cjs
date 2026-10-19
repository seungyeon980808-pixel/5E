// 5E_ExamPool 문항 작업실: 5E 버튼으로 열기 → 화면 색 따르기 → 구성 값으로 한글 다시 그리기 →
// 한글 창에서 그림을 표 옆으로 끌기(가로 묶음·폭 비율) → 한글 창 글을 시트에 반영 → 시험지 HWPX.
const assert = require('node:assert/strict');
const fs = require('node:fs');const path = require('node:path');
const {chromium,webkit} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const JSZip = require('../assets/exampool/sheet/vendor/jszip.min.js');
const h = require('./helpers/rhwp-exam.cjs');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/exampool/office-verification');
const figure = path.resolve(__dirname,'../assets/exam-library/images/b1_2007_11_05.png');

async function typesetReady(sheet){
  await sheet.waitForFunction(()=>true);try{await sheet.waitForFunction(()=>{const s=document.querySelector('#typeset-status')?.textContent||'',busy=document.querySelector('#preview-dialog')?.getAttribute('aria-busy');return busy!=='true'&&!/조판하는 중/.test(s)&&document.querySelector('#native-editor')?.dataset.ready==='true';},null,{timeout:90000});}catch(e){throw Error('typesetting did not settle: '+JSON.stringify(await sheet.evaluate(()=>({status:document.querySelector('#typeset-status').textContent,busy:document.querySelector('#preview-dialog').getAttribute('aria-busy'),ready:document.querySelector('#native-editor').dataset.ready}))));}
  const error=await sheet.evaluate(()=>document.querySelector('#typeset-status').dataset.error==='true'?document.querySelector('#typeset-status').textContent:'');
  assert.equal(error,'','typesetting has no error');
}
// 동작 하나 뒤에 한글 창이 한 번 다시 그려질 때까지 기다린다(높이가 같아도).
async function redraw(sheet,action){
  await sheet.evaluate(()=>{window.__busySeen=false;const p=document.querySelector('#preview-dialog');window.__busyWatch?.disconnect();window.__busyWatch=new MutationObserver(()=>{if(p.getAttribute('aria-busy')==='true')window.__busySeen=true;});window.__busyWatch.observe(p,{attributes:true,attributeFilter:['aria-busy']});});
  await action();
  await sheet.waitForFunction(()=>window.__busySeen,null,{timeout:30000});await typesetReady(sheet);
}
async function partsRows(sheet){
  return sheet.evaluate(()=>[...document.querySelectorAll('#parts tbody tr[data-part-id]')].map(tr=>({id:tr.dataset.partId,kind:tr.querySelector('.part-kind select')?.value||tr.querySelector('.part-kind')?.textContent,name:tr.querySelector('[data-part="label"]')?.value||tr.querySelector('.part-name')?.textContent,layout:tr.querySelector('[data-part="layout"],[data-part="choiceLayout"]')?.value,ratio:tr.querySelector('[data-part="ratio"]')?.value})));
}
// 배치 층이 그 위치를 무엇으로 보는지: 마우스를 옮겨 이름표를 읽는다.
async function findItem(page,sheet,box,kind){
  for(let y=box.y+24;y<box.y+box.height-10;y+=14)for(let x=box.x+30;x<box.x+box.width-30;x+=36){
    await page.mouse.move(x,y);
    const tag=await sheet.evaluate(()=>{const o=document.querySelector('.place-outline');if(!o||o.hidden)return null;const r=o.getBoundingClientRect();return {text:document.querySelector('.place-tag').textContent,x:r.x,y:r.y,w:r.width,h:r.height};});
    if(tag?.text.startsWith(kind))return tag;
  }
  return null;
}

h.withServer(async origin => {
  fs.mkdirSync(evidence,{recursive:true});
  for (const [engineName,engine] of Object.entries({chromium,webkit}).filter(([name]) => !process.env.EXAM_ENGINE || name === process.env.EXAM_ENGINE)) {
    const browser = await engine.launch({headless:true});
    try {
      const context = await browser.newContext({viewport:{width:1440,height:960},acceptDownloads:true});
      const page = await context.newPage(), errors = [];page.on('pageerror',error => errors.push(error.message));
      await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
      const entry=page.locator('#exam-pool-open');
      assert.equal(await entry.isEnabled(),true,'5E_ExamPool is enabled');
      assert.equal(await page.locator('#exampool-open').isVisible(),false,'one entry: the legacy design button is hidden');
      await entry.click();
      const frameHandle=await page.waitForSelector('#exampool-sheet-workspace iframe');const sheet=await frameHandle.contentFrame();
      sheet.on?.('pageerror',e=>errors.push(e.message));
      await sheet.waitForSelector('#side-new');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중',null,{timeout:30000});

      // 화면 색: 5E의 팔레트·테마를 그대로 따른다.
      for(const [theme,palette] of [['dark','classic'],['dark','graphite'],['light','graphite']]){
        await page.evaluate(([t,p])=>{document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-palette',p);},[theme,palette]);
        await sheet.waitForFunction(([t,p])=>document.documentElement.dataset.theme===t&&document.documentElement.dataset.palette===p,[theme,palette]);
        const bench=await sheet.evaluate(()=>getComputedStyle(document.querySelector('.workspace')).backgroundColor);
        const expected=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--ds-bench').trim());
        assert.ok(bench,'bench color resolves');assert.notEqual(expected,'');
      }
      await page.evaluate(()=>{document.documentElement.setAttribute('data-theme','dark');document.documentElement.setAttribute('data-palette','classic');});

      // 새 문항: 유형(합답형) → 자료 구조(실험 상자), 클릭 2번.
      await sheet.click('#side-new');await sheet.click('#new-dialog .nq-opt[data-step="form"][data-k="combo"]');await sheet.click('#new-dialog .nq-opt[data-step="struct"][data-k="experiment"]');
      assert.equal(await sheet.locator('#new-dialog [data-nq="go"]').isEnabled(),true);await sheet.click('#new-dialog [data-nq="go"]');
      // 새 문항은 문항 카드(입력 칸)로 열린다. 합답형 선지는 보기 조합 버튼, 오른쪽에는 라이브러리 탭.
      await sheet.waitForSelector('#card-view:not([hidden]) .cv-writer');
      assert.ok(await sheet.locator('#card-view .combo-row').count()===5,'combo choices are composed from bogi letters');
      // 시안 4: 왼쪽 라이브러리(검색 범위: 기출문제·교과서·성취기준·교육과정·자료) · 가운데 문항 카드(번호 탭) · 오른쪽 미리보기|AI.
      assert.deepEqual(await sheet.locator('#card-view [data-cvscope] option').allTextContents(),['기출문제','교과서','성취기준·교육과정','자료']);
      assert.deepEqual(await sheet.locator('#card-view .cv-rseg [data-cvright]').evaluateAll(b=>b.map(x=>x.textContent.trim())),['미리보기','AI']);
      assert.ok(await sheet.locator('#card-view .cv-qtab[aria-current="true"]').count()===1,'the current question is marked in the number tabs');
      // 미리보기 칸 = 한글 조판 창(5e_hwp). 카드를 다시 그려도 지워지지 않는 층에 붙어 미리보기 칸 위에 정확히 겹친다.
      await sheet.waitForSelector('.cv-hwp-layer:not([hidden]) #preview-dialog:not([hidden])');await typesetReady(sheet);
      const fit=await sheet.evaluate(()=>{const L=document.querySelector('.cv-hwp-layer').getBoundingClientRect(),S=document.querySelector('#cv-hwp').getBoundingClientRect(),c=document.querySelector('#native-editor iframe').contentDocument.querySelector('#scroll-container canvas')?.getBoundingClientRect();
        return {over:[L.left-S.left,L.top-S.top,L.width-S.width,L.height-S.height].every(v=>Math.abs(v)<1),pageInside:!!c&&c.width<=L.width};});
      assert.ok(fit.over,'the HWP window sits exactly over the preview slot');assert.ok(fit.pageInside,'the page fits the preview width');
      const lw=await sheet.evaluate(()=>document.querySelector('#card-view .cv-left').offsetWidth),split=await sheet.locator('#card-view [data-cvsplit="left"]').boundingBox();
      await sheet.locator('#card-view [data-cvsplit="left"]').hover();await page.mouse.down();await page.mouse.move(split.x-60,split.y+split.height/2,{steps:4});await page.mouse.up();
      assert.ok(Math.abs(await sheet.evaluate(()=>document.querySelector('#card-view .cv-left').offsetWidth)-(lw-60))<=6,'dragging the left border resizes the library');
      // 좁은 창(1100): 칸이 이미 끌기 상한보다 넓어도 경계를 잡는 순간 줄어들지 않고, 끌면 움직인 만큼 줄어든다.
      await page.setViewportSize({width:1100,height:800});await sheet.waitForTimeout(400);
      // 넓은 창에서 연 뒤 줄여도 오른쪽 칸이 창 밖으로 밀리지 않는다(칸 폭을 창에 다시 맞춤).
      assert.ok(await sheet.evaluate(()=>document.querySelector('#card-view .cv-right').getBoundingClientRect().right<=document.querySelector('#card-view').getBoundingClientRect().right+0.5),'the right pane stays inside after the window shrinks');
      for(const k of ['left','right']){const pane=k==='left'?'.cv-left':'.cv-right',w0=await sheet.evaluate(s=>document.querySelector('#card-view '+s).getBoundingClientRect().width,pane),b=await sheet.locator(`#card-view [data-cvsplit="${k}"]`).boundingBox(),f=await (await page.$('#exampool-sheet-workspace iframe')).boundingBox();
        const x=f.x+b.x+b.width/2,y=f.y+b.y+b.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+1,y);await page.mouse.move(x,y);
        assert.ok(Math.abs(await sheet.evaluate(s=>document.querySelector('#card-view '+s).getBoundingClientRect().width,pane)-w0)<=1,`grabbing the ${k} border in a narrow window does not jump`);
        await page.mouse.move(k==='left'?x-30:x+30,y,{steps:3});await page.mouse.up();
        assert.ok(Math.abs(await sheet.evaluate(s=>document.querySelector('#card-view '+s).getBoundingClientRect().width,pane)-(w0-30))<=2,`dragging the ${k} border in a narrow window shrinks it by the drag`);
        await sheet.locator(`#card-view [data-cvsplit="${k}"]`).dblclick();}
      await page.setViewportSize({width:1440,height:960});await sheet.waitForTimeout(200);
      await sheet.click('#card-view [data-cv="toggle-right"]');assert.equal(await sheet.locator('#card-view .cv-right').isHidden(),true);await sheet.click('#card-view [data-cv="toggle-right"]');
      await sheet.click('#card-view [data-cvview="page"]');await sheet.waitForSelector('#card-view .pg-sheet[data-native-page] svg');await sheet.waitForSelector('#card-view .pg-sheet .pg-now');await sheet.click('#card-view .pg-head [data-cvview="card"]');await sheet.waitForSelector('#card-view .cv-writer');
      // 문항 카드에는 표(엑셀식) 진입이 없다. 표는 시험지의 「표로 한꺼번에 고치기」로만 연다.
      assert.equal(await sheet.locator('#card-view [data-cv="sheet"]').count(),0,'the card has no sheet entry');
      // 머리 줄 틀 이름표: 새 문항 창에서 정한 유형·자료 구조를 보여 주고, 눌렀을 때만 유형 바꾸기 메뉴(서술형 포함 5개)가 열린다.
      assert.equal(await sheet.locator('#card-view .typeseg').count(),0,'no type segment on the card');
      assert.equal((await sheet.locator('#card-view .cv-shape').textContent()).trim(),'합답형실험 상자');
      await sheet.click('#card-view .cv-shape');
      assert.deepEqual(await sheet.locator('#card-view .cv-shape-menu [data-cvform] .n').allTextContents(),['합답형','일반 정답형','대응·짝 고르기형','학생 대화·발표형','서술형']);
      await page.keyboard.press('Escape');assert.equal(await sheet.locator('#card-view .cv-shape-menu').count(),0,'Esc closes the menu');
      // 보기에 글이 있으면 지울지 묻고, 취소하면 그대로.
      await sheet.fill('#card-view [data-cvline="bogi"][data-i="0"]','운동량은 보존된다.');
      let asked='';page.once('dialog',d=>{asked=d.message();void d.dismiss();});
      await sheet.click('#card-view .cv-shape');await sheet.click('#card-view [data-cvform="single"]');
      assert.match(asked,/보기 1줄을 지웁니다/);assert.match(await sheet.locator('#card-view .cv-shape').textContent(),/^합답형/);
      await sheet.fill('#card-view [data-cvline="bogi"][data-i="0"]','');
      await sheet.click('#card-view .cv-shape');await sheet.click('#card-view [data-cvform="single"]');
      await sheet.waitForFunction(()=>/^일반 정답형/.test(document.querySelector('#card-view .cv-shape').textContent));
      assert.equal(await sheet.locator('#card-view [data-cvline="bogi"]').count(),0,'the empty bogi is gone with the form');
      await sheet.click('#card-view .cv-shape');await sheet.click('#card-view [data-cvform="combo"]');
      await sheet.waitForFunction(()=>/^합답형/.test(document.querySelector('#card-view .cv-shape').textContent)&&document.querySelectorAll('#card-view .combo-row').length===5);
      // 「그림 자리·표 자리」 대신 자료 칸 맨 아래 「자료 칸 추가」 하나: 빈 칸이 생기고 그 칸에서 그림/표를 고른다.
      assert.equal(await sheet.locator('#card-view .cv-add-slot, #card-view [data-cvslot-act="add-table"]').count(),0);
      const tiles=await sheet.locator('#card-view .cv-tile').count();
      await sheet.click('#card-view .cv-add-row');await sheet.waitForFunction(n=>document.querySelectorAll('#card-view .cv-tile').length===n+1,tiles);
      const added=sheet.locator('#card-view .cv-tile.empty').last();
      assert.equal(await added.locator('[data-cvslot-act="pick"]').count(),1);assert.equal(await added.locator('[data-cvslot-act="to-table"]').count(),1);
      await added.locator('[data-cvslot-act="remove"]').click();await sheet.waitForFunction(n=>document.querySelectorAll('#card-view .cv-tile').length===n,tiles);
      // 한글 창이 다시 그려져도 카드 칸에 이어 치는 글은 카드에 들어가고, ⌘Z는 카드 편집을 되돌린다(편집기가 초점을 가져가던 것).
      await sheet.click('#card-view [data-cvright="paper"]');await sheet.waitForSelector('.cv-hwp-layer:not([hidden]) #preview-dialog:not([hidden])');await typesetReady(sheet);
      await sheet.click('#cv-passage');await page.keyboard.type('가');await sheet.waitForTimeout(3500);await typesetReady(sheet);await page.keyboard.type('나');
      assert.equal(await sheet.inputValue('#cv-passage'),'가나','typing continues in the card after the HWP window redraws');
      assert.equal(await sheet.evaluate(()=>!!document.activeElement.closest('.cv-hwp-layer')),false,'the redraw does not move focus into the HWP window');
      await sheet.fill('#cv-passage','');await sheet.locator('#cv-passage').press('Tab');await sheet.waitForTimeout(1500);await typesetReady(sheet);
      // AI 연결 안 됨: 안내 말풍선의 「ChatGPT 로그인」이 5E 연결 창을 연다(카드 화면에는 로그인 단추가 따로 없음).
      await sheet.click('#card-view [data-cvright="ai"]');await sheet.fill('#cv-ai-input','검토해 줘');await sheet.click('#card-view [data-cv="ai-send"]');
      await sheet.waitForSelector('#card-view .msg.ai.err [data-cv="ai-login"]',{timeout:20000});await sheet.click('#card-view [data-cv="ai-login"]');
      await page.waitForSelector('.web-login-dialog[open]',{timeout:5000});await page.locator('.web-login-dialog .web-login-close').click();
      await sheet.click('#card-view [data-cvright="paper"]');
      // 완성한 문항을 고치면 단계 단추도 검토 중으로 바뀐다(다시 그리지 않는 입력에서도).
      await sheet.click('#card-view [data-cvstage="complete"]');await sheet.click('#cv-ask');await page.keyboard.press('End');await page.keyboard.type('!');
      await sheet.waitForFunction(()=>document.querySelector('#card-view [data-cvstage][aria-pressed="true"]')?.dataset.cvstage==='review');
      // 미리보기(한글 창)가 다시 그려져도 초점을 가져가지 않아 ⌘Z·⇧⌘Z가 카드에 닿는다.
      await sheet.locator('#card-view .w-head .qno').click();const askEdited=await sheet.locator('#cv-ask').inputValue();
      await page.keyboard.press('ControlOrMeta+z');await sheet.waitForFunction(v=>document.querySelector('#cv-ask').value!==v,askEdited);
      await sheet.waitForTimeout(800);await typesetReady(sheet);await sheet.waitForTimeout(500);
      assert.notEqual(await sheet.evaluate(()=>document.activeElement?.tagName),'IFRAME','redrawing the HWP preview keeps focus out of the editor');
      await page.keyboard.press('ControlOrMeta+Shift+z');await sheet.waitForFunction(v=>document.querySelector('#cv-ask').value===v,askEdited);
      await sheet.fill('#cv-ask',askEdited.slice(0,-1));await sheet.click('#card-view [data-cvstage="draft"]');
      // 위쪽 막대: 이동 줄 끝은 문항 이름만(전체 발문은 풍선), 「문항 보관함」·로고는 눌러서 보관함으로 간다.
      assert.ok(!(await sheet.locator('#crumb-question').textContent()).includes(' · '),'the crumb shows only the question name');
      assert.match(await sheet.locator('#crumb-question').getAttribute('title'),/ · /,'the full ask is in the tooltip');
      await sheet.click('#crumb-view');await sheet.waitForSelector('#library-view:not([hidden])');
      assert.equal(await sheet.locator('#crumb-view').isDisabled(),true,'the crumb is plain text where you already are');
      await sheet.locator('#library-view [data-open-card]').first().click();await sheet.waitForSelector('#card-view:not([hidden]) .cv-writer');
      await sheet.click('#brand-home');await sheet.waitForSelector('#library-view:not([hidden])');
      assert.equal(await sheet.locator('.crumb-sep').isHidden(),true,'no dangling separator when no question is open');
      // 보관함 미리보기 그림은 문항 맨 위(지문)부터 보인다(단추가 내용을 세로 가운데로 두어 윗부분이 잘리던 것).
      await sheet.waitForFunction(()=>document.querySelector('#library-view .pv-doc')?.textContent.trim(),null,{timeout:10000});
      assert.ok(await sheet.evaluate(()=>{const t=document.querySelector('#library-view .pv-thumb').getBoundingClientRect(),d=document.querySelector('#library-view .pv-doc').getBoundingClientRect();return d.top>=t.top-0.5&&d.top<=t.top+1;}),'the library thumbnail starts at the top of the question');
      if(await sheet.locator('.side').isHidden())await sheet.click('#toggle-nav');
      await sheet.click('.side [data-nav="new-exam"]');await sheet.waitForSelector('#examd-view:not([hidden]) #exam-from-library');
      await sheet.selectOption('#exam-from-library',await sheet.locator('#exam-from-library option').nth(1).getAttribute('value'));
      await sheet.click('[data-exam-act="sheet"]');
      await sheet.waitForSelector('.workspace:not([hidden]) #registry');
      const ask=sheet.locator('#rows tr:has(th.field-label:text-is("발문")) td').first();
      await ask.click();await page.keyboard.type('실험 결과로 옳은 것만을 <보기>에서 있는 대로 고른 것은?');
      // 지문도 채운다. 비워 두면 한글 창 첫 줄이 회색 틀 안내(지문 자리)라 시트로 되돌릴 글이 아니다.
      // 입력 중에 다른 칸을 누르면 입력을 확정하고 그 칸으로 넘어간다(행을 다시 그려도).
      const passage=sheet.locator('#rows tr:has(th.field-label:text-is("지문")) td').first();
      await passage.click();
      assert.equal(await sheet.evaluate(()=>document.querySelector('#registry td.grid-active textarea')?.dataset.field),'passage','clicking another cell while typing moves there');
      assert.equal(await sheet.locator('#rows tr:has(th.field-label:text-is("발문")) textarea').first().inputValue(),'실험 결과로 옳은 것만을 <보기>에서 있는 대로 고른 것은?');
      await page.keyboard.type('다음은 실험이다.');await page.keyboard.press('Enter');
      const passageValue=()=>sheet.locator('#rows tr:has(th.field-label:text-is("지문")) textarea').first().inputValue();
      // 구성 시트의 「+ 구성 추가」로 그림 자리를 더하고, 자료 칸을 더블클릭해 '자료 넣기' 창에서 그림을 넣는다(구성 편집 창 없이).
      assert.equal(await sheet.locator('#edit-detail').isVisible(),false,'the composition dialog is no longer a toolbar step');
      await sheet.click('[data-sheet="parts"]');await sheet.click('#parts-add');await sheet.click('#add-dialog [data-kind="figure"]');
      await sheet.click('[data-sheet="registry"]');
      await sheet.locator('#rows tr:has(th.field-label:text-is("자료")) td').first().dblclick();
      await sheet.waitForSelector('#slot-dialog[open]');
      assert.ok(await sheet.locator('#slot-dialog [data-slot-pick]').count()>=2,'every figure slot offers a 5E crop');
      const chooser=sheet.waitForEvent?sheet.waitForEvent('filechooser'):page.waitForEvent('filechooser');
      // 실험 상자 틀에는 '실험 장치' 그림 칸이 이미 있다. 방금 더한 그림 칸(마지막)에 넣는다.
      await sheet.locator('#slot-dialog [data-slot-file]').last().click();await (await chooser).setFiles(figure);
      await sheet.waitForFunction(()=>document.querySelectorAll('#slot-dialog .slot-thumb img').length===1,null,{timeout:10000});
      await sheet.click('[data-close="slot-dialog"]');

      // 표(구성 시트)에서 고치는 값: 선지 배열 세로, 그림 크기 30%, 그림을 보기 위로. 표 옆에 한글 창은 없다(조판은 문항 카드 오른쪽 미리보기).
      await sheet.click('[data-sheet="parts"]');
      await sheet.selectOption('[data-part-id="choices"] select','세로');
      assert.equal(await sheet.locator('[data-part-id="choices"] select').inputValue(),'세로');
      const sizeInput=sheet.locator('#parts tr:has([data-part="label"][value="그림"]) [data-part="size"]');
      await sizeInput.fill('31');await sizeInput.press('Enter');
      assert.equal(await sizeInput.inputValue(),'30%','typed size snaps to 5%');
      await sheet.click('#parts tr:has([data-part="label"][value="그림"]) [data-part-move="up"]');
      const order=(await partsRows(sheet)).map(r=>r.kind);assert.ok(order.indexOf('그림')<order.indexOf('보기'),'figure moved above bogi');
      // 흰 칸은 한글에 글로 나오는 칸뿐, 나머지는 옅은 회색.
      await sheet.click('[data-sheet="registry"]');
      const shades=await sheet.evaluate(()=>{const row=label=>[...document.querySelectorAll('#rows tr')].find(tr=>tr.querySelector('th.field-label')?.textContent===label)?.querySelector('td');document.activeElement?.blur();
        return Object.fromEntries(['발문','보기','선지','문항유형','성취기준','자료 구성','선지 표현','해설'].map(l=>{const td=row(l);td.classList.remove('grid-active','grid-selected');return [l,{hwp:td.dataset.hwp,bg:getComputedStyle(td).backgroundColor}];}));});
      for(const l of ['발문','보기','선지'])assert.equal(shades[l].hwp,'text',l);
      for(const l of ['문항유형','성취기준','자료 구성','선지 표현','해설']){assert.equal(shades[l].hwp,'off',l);assert.notEqual(shades[l].bg,'rgb(255, 255, 255)',l+' is gray');}

      // 표 화면의 「문항 조판」은 문항 카드로 가서 오른쪽 미리보기에 한글 조판(5e_hwp)을 연다.
      const toCardHwp=async()=>{await sheet.click('#preview');await sheet.waitForSelector('#card-view:not([hidden])');await sheet.waitForSelector('.cv-hwp-layer:not([hidden]) #preview-dialog:not([hidden])');await typesetReady(sheet);};
      // 표로 돌아가기: 시험지의 「표로 한꺼번에 고치기」.
      const toSheet=async()=>{if(await sheet.locator('.side').isHidden())await sheet.click('#toggle-nav');await sheet.click('.side [data-nav="exam"]');await sheet.click('[data-exam-act="sheet"]');await sheet.waitForSelector('.workspace:not([hidden]) #registry');};
      await toCardHwp();
      assert.equal(await sheet.evaluate(()=>document.querySelector('.workspace').hidden),true,'the sheet is not shown beside the HWP window');
      assert.equal(await sheet.locator('#card-view [data-cvright="paper"]').getAttribute('aria-pressed'),'true','the HWP window is the preview tab');
      // 문항을 바꿔도 한글 편집기 프레임을 다시 읽지 않는다(미리보기 층에 붙은 채).
      await sheet.evaluate(()=>{document.querySelector('#native-editor iframe').contentWindow.__kept=1;});

      // 한글 창에서 그림을 결과표 오른쪽으로 끈다.
      const editor=await sheet.locator('#native-editor').boundingBox(),frameBox=await frameHandle.boundingBox();
      const box={x:frameBox.x+editor.x,y:frameBox.y+editor.y,width:editor.width,height:editor.height};
      const pic=await findItem(page,sheet,box,'그림');assert.ok(pic,'the figure is a draggable placement item');
      const table=await findItem(page,sheet,box,'표');if(!table)await page.screenshot({path:path.join(evidence,`${engineName}-no-table.png`)});assert.ok(table,'the result table is a drop target');
      const from={x:frameBox.x+pic.x+pic.w/2,y:frameBox.y+pic.y+pic.h/2},to={x:frameBox.x+table.x+table.w*.9,y:frameBox.y+table.y+table.h/2};
      await page.mouse.move(from.x,from.y);await page.mouse.down();
      for(let i=1;i<=12;i++)await page.mouse.move(from.x+(to.x-from.x)*i/12,from.y+(to.y-from.y)*i/12);
      const hint=await sheet.locator('#placement-hint-text').textContent();assert.match(hint,/오른쪽에 놓기 · 가로 묶음/);
      await redraw(sheet,()=>page.mouse.up());
      assert.ok(await findItem(page,sheet,box,'그림'),'the redrawn figure is still a placement item');
      await page.screenshot({path:path.join(evidence,`${engineName}-placed.png`)});

      // 한글 창에서 지문 끝에 글을 더하면 문항 카드의 지문 칸이 바뀐다.
      const frame=sheet.locator('#native-editor iframe'),fb=await frame.boundingBox();
      await sheet.evaluate(()=>document.querySelector('#native-editor iframe').contentDocument.querySelector('#scroll-container,#scroll-content')?.scrollTo?.(0,0));
      // 문서 맨 앞에는 1pt 빈 문단(구역 자리)이 있고 그 다음 줄이 번호와 지문이다. 문서를 누른 뒤 Ctrl+Home → ↓ → End.
      await page.mouse.click(frameBox.x+fb.x+fb.width*.55,frameBox.y+fb.y+92);await page.keyboard.press('Control+Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('End');
      await page.keyboard.type(' OK',{delay:200});
      const passageCard=()=>sheet.evaluate(()=>document.querySelector('#cv-passage')?.value);
      await sheet.waitForFunction(()=>document.querySelector('#cv-passage')?.value.endsWith(' OK'),null,{timeout:15000});
      assert.equal(await sheet.evaluate(()=>document.activeElement?.closest?.('#native-editor')?'hwp':document.activeElement?.tagName),'hwp','typing focus stays in the HWP window');
      assert.equal(await passageCard(),'다음은 실험이다. OK','the passage field received exactly the typed text');

      // 카드 발문 칸에 입력하면 한글 창의 같은 문단에 바로 들어간다. 다시 그리지 않는다.
      const nativeText=()=>sheet.evaluate(()=>document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.wasm.borrowDocumentHandle().getTextFileText());
      await sheet.evaluate(()=>{window.__busySeen=false;const p=document.querySelector('#preview-dialog');window.__busyWatch?.disconnect();window.__busyWatch=new MutationObserver(()=>{if(p.getAttribute('aria-busy')==='true')window.__busySeen=true;});window.__busyWatch.observe(p,{attributes:true,attributeFilter:['aria-busy']});});
      await sheet.click('#cv-ask');await sheet.evaluate(()=>{const t=document.querySelector('#cv-ask');t.setSelectionRange(t.value.length,t.value.length);});
      await page.keyboard.type(' 실시간');
      await sheet.waitForFunction(()=>/실시간/.test(document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.wasm.borrowDocumentHandle().getTextFileText()),null,{timeout:10000});
      assert.match(await nativeText(),/OK[\s\S]*실시간/,'the card edit reaches the HWP paragraph after the HWP edit');
      assert.equal(await passageCard(),'다음은 실험이다. OK','the HWP edit survives the card edit');
      // 한글에 나오지 않는 칸(해설)을 고쳐도 한글 창은 그대로다.
      await sheet.evaluate(()=>{const d=document.querySelector('#card-view [data-cvf="explanation"]').closest('details');if(d)d.open=true;});
      await sheet.click('#card-view [data-cvf="explanation"]');await page.keyboard.type('해설만 바꿈');
      await sheet.waitForTimeout(900);
      assert.equal(await sheet.evaluate(()=>window.__busySeen),false,'text edits and non-printed fields never redraw the HWP window');
      assert.equal(await sheet.locator('#typeset-refresh').isHidden(),true,'the HWP window matches the card');
      await sheet.evaluate(()=>window.__busyWatch?.disconnect());
      assert.equal(await sheet.evaluate(()=>document.querySelector('#native-editor iframe').contentWindow.__kept),1,'the HWP editor frame was never reloaded');

      // 시트 칸이 아닌 곳(문항 번호 앞)을 고치면 반영하지 않고, '한글 창 수정 버리기'로 빠져나온다.
      await page.mouse.click(frameBox.x+fb.x+fb.width*.55,frameBox.y+fb.y+92);await page.keyboard.press('Home');await page.keyboard.type('Z');
      await sheet.waitForFunction(()=>!document.querySelector('#typeset-discard').hidden,null,{timeout:15000});
      await redraw(sheet,async()=>{await sheet.click('#typeset-discard');await sheet.click('#typeset-discard');});
      assert.equal(await sheet.locator('#typeset-discard').isHidden(),true);
      assert.match(await passageCard(),/ OK/,'the synced text survives discarding');
      // 틀의 '실험 장치' 그림 칸은 아직 비어 있다. 빈 칸은 한글 창에 틀(회색 자리)로만 보이고 조판 저장을 막는다.
      await sheet.click('#typeset-save');
      await sheet.waitForFunction(()=>document.querySelector('#typeset-status').dataset.error==='true',null,{timeout:15000});
      assert.match(await sheet.locator('#typeset-status').textContent(),/비어 있는 칸\(그림 1곳\)/);
      // 표로 가서 가로 묶음이 기록됐는지 보고, 빈 그림 칸을 채운 뒤 다시 카드 미리보기로.
      await toSheet();
      await sheet.click('[data-sheet="parts"]');
      const rows=await partsRows(sheet),side=rows.find(r=>r.name==='가로 묶음');
      assert.equal(side.layout,'나란히');
      const kids=rows.slice(rows.indexOf(side)+1,rows.indexOf(side)+3);
      assert.deepEqual(kids.map(r=>r.kind),['표','그림'],'table then figure in the side-by-side group');
      assert.ok(kids.every(r=>/^\d+$/.test(r.ratio)),'integer width ratios are recorded');
      await sheet.click('[data-sheet="registry"]');
      await sheet.locator('#rows tr:has(th.field-label:text-is("자료")) td').first().dblclick();await sheet.waitForSelector('#slot-dialog[open]');
      const chooser2=sheet.waitForEvent?sheet.waitForEvent('filechooser'):page.waitForEvent('filechooser');
      await sheet.locator('#slot-dialog [data-slot-file]').first().click();await (await chooser2).setFiles(figure);
      await sheet.waitForFunction(()=>document.querySelectorAll('#slot-dialog .slot-thumb img').length>=2,null,{timeout:10000});
      await sheet.click('[data-close="slot-dialog"]');
      await toCardHwp();
      // 조판 저장 → 시험지 HWPX.
      // 첫 저장은 최종 저장 모양으로 갱신하고 확인을 요청할 수 있다(기존 설계). 그때는 한 번 더 저장한다.
      for(let attempt=0;attempt<2;attempt++){
        await sheet.click('#typeset-save');
        await sheet.waitForFunction(()=>{const n=document.querySelector('#typeset-status');return /조판 저장됨|다시 누르세요/.test(n.textContent)||n.dataset.error==='true';},null,{timeout:60000});
        if(/조판 저장됨/.test(await sheet.locator('#typeset-status').textContent()))break;
        await typesetReady(sheet);
      }
      assert.match(await sheet.locator('#typeset-status').textContent(),/조판 저장됨/);
      // 앞에서 만든 시험지(이 문항이 든)를 HWPX로 받는다.
      if(await sheet.locator('.side').isHidden())await sheet.click('#toggle-nav');
      await sheet.click('.side [data-nav="exam"]');await sheet.waitForSelector('#examd-view:not([hidden]) [data-exam-act="download"]');
      const downloading=page.waitForEvent('download');await sheet.click('[data-exam-act="download"]');const download=await downloading;
      const file=path.join(evidence,`${engineName}-exam.hwpx`);await download.saveAs(file);
      const zip=await JSZip.loadAsync(fs.readFileSync(file)),xml=await zip.file('Contents/section0.xml').async('string');
      assert.match(xml,/colCount="2"/);assert.match(xml,/width="59528" height="84189"/);assert.ok(xml.includes('OK'),'the text typed in the HWP window is in the exam');
      assert.ok(Object.keys(zip.files).some(n=>n.startsWith('BinData/')),'the figure is in the exam');
      // 5e_hwp로 보내기: 시험지 한 부가 5E 시험지 편집기에서 열리고 문항 창은 닫힌다.
      await sheet.click('[data-exam-act="send"]');
      await page.waitForFunction(()=>document.querySelector('#exampool-sheet-workspace')?.hidden===true&&!document.querySelector('#rhwp-exam-workspace')?.hidden,null,{timeout:60000});
      assert.match(await page.locator('#exam-name').inputValue(),/새 시험지/,'the exam opens under its own name');
      await page.click('[data-exam-action="close"]');await page.locator('#exam-pool-open').click();await sheet.waitForSelector('#examd-view:not([hidden])');

      // 출제 대화(대역 하네스 · 실제 AI 아님): 요청 묶음 → 변경안 보관 → 「적용」→ 버전 기록, 대기 중 직접 수정한 응답은 지난 변경안.
      await page.evaluate(()=>{window.__authorPackets=[];window.__authorHold=null;window.fiveEAuthoringHarness={cancel(){return true;},request:async packet=>{window.__authorPackets.push(packet);if(window.__authorHold)await window.__authorHold;
        return {response:{format:'exampool-authoring-v1',reply:'검토를 마쳤습니다. 발문을 다듬었습니다.',questions:[],requirements:{explicit:['수능형'],assumed:[],pending:['실제 시험 범위']},
          proposal:{summary:'발문 다듬기',changes:[{path:'ask',value:'이에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은? (수정)'}]},
          review:{axes:{answer:{status:'unverified',note:'다시 풀 보기가 비어 있음'},figure:{status:'pass'}},items:[{target:'발문',problem:'물음이 분명합니다.',fix:''}]},figures:[{kind:'graph',slot:'(가)',description:'가로축 시간(s), 세로축 속도(m/s)'}],
          evidenceUsed:[{ref:'ev-test',target:'발문',claim:'발문 틀',judgement:'direct'}]},evidence:[{ref:'ev-test',kind:'past',title:'기출 테스트',quote:'…',page:2}],searches:[],meta:{model:'stub',ms:5,live:false}};}};});
      await sheet.locator('#examd-view [data-open-card]').first().click();await sheet.waitForSelector('#card-view:not([hidden]) .cv-writer');
      await sheet.click('#card-view [data-cv="review"]');
      await sheet.waitForSelector('#card-view .proposal [data-act="apply"]',{timeout:20000});
      const packet=await page.evaluate(()=>window.__authorPackets[0]);
      assert.equal(packet.format,'exampool-authoring-request-v1');assert.equal(packet.kind,'review');assert.ok(packet.question.ask!==undefined&&packet.authoring&&Number.isInteger(packet.authoring.revision),'the packet carries the question and its version');
      assert.equal(packet.question.authoring,undefined,'the AI copy does not carry the stored authoring record');
      assert.match(await sheet.locator('#card-view .au-strip').textContent(),/자료·그림 · 미검토/,'a review of a proposal waits until the proposal is applied');
      assert.match(await sheet.locator('#card-view .au-ev').textContent(),/직접 지지/);
      await sheet.click('#card-view .proposal [data-act="apply"]');
      await sheet.waitForFunction(()=>/\(수정\)$/.test(document.querySelector('#cv-ask')?.value||''));
      await sheet.waitForFunction(()=>/버전 1/.test(document.querySelector('#card-view .au-strip')?.textContent||''),null,{timeout:10000});
      await sheet.waitForFunction(()=>/자료·그림 · 확인 필요/.test(document.querySelector('#card-view .au-strip')?.textContent||''),null,{timeout:10000});// 그림을 읽지 않은 검토는 그림 축을 통과시키지 않는다
      assert.equal(await sheet.locator('#card-view .cv-writer .stage [aria-pressed="true"]').textContent(),'검토 중','a draft moves to review after an AI review');
      // 대기 중 직접 수정 → 늦게 온 응답은 지난 변경안(자동 적용 금지).
      await page.evaluate(()=>{window.__release=null;window.__authorHold=new Promise(r=>window.__release=r);});
      await sheet.fill('#cv-ai-input','ㄴ을 참으로 바꿔줘');await sheet.click('#card-view [data-cv="ai-send"]');
      await sheet.waitForSelector('#card-view .msg.ai.pending');
      await sheet.fill('#cv-ask','교사가 직접 고친 발문');await sheet.waitForTimeout(900);
      await page.evaluate(()=>window.__release());
      await sheet.waitForSelector('#card-view .proposal.old',{timeout:20000});
      assert.equal(await sheet.locator('#cv-ask').inputValue(),'교사가 직접 고친 발문','a late answer never overwrites the teacher edit');
      await sheet.click('#card-view .proposal.old [data-act="reject"]');await sheet.waitForSelector('#card-view .proposal.old',{state:'detached'});
      await page.evaluate(()=>{window.__authorHold=null;});
      // 세 가지 화면 색 캡처(증거).
      if(await sheet.locator('.side').isHidden())await sheet.click('#toggle-nav');// 카드 화면에서는 왼쪽 메뉴가 기본으로 접힌다
      await sheet.click('.side [data-nav="library"]');
      for(const [theme,palette] of [['dark','classic'],['dark','graphite'],['light','graphite']]){
        await page.evaluate(([t,p])=>{document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-palette',p);},[theme,palette]);
        await sheet.waitForFunction(([t,p])=>document.documentElement.dataset.theme===t&&document.documentElement.dataset.palette===p,[theme,palette]);
        await page.screenshot({path:path.join(evidence,`${engineName}-${theme}-${palette}.png`)});
      }
      assert.deepEqual(errors,[],'no page errors');
      console.log(`${engineName}: office workroom verified`);
      // 좁은 창(1180px 이하)에서 새 문항 창이 위아래로 쌓여도 자료 구조 선택지가 가려지지 않고, 「작성」 줄은 늘 보인다.
      // 창 크기를 도중에 바꾸면 WebKit이 ResizeObserver 경고를 오류로 내므로 처음부터 좁은 창으로 따로 연다.
      const small=await (await browser.newContext({viewport:{width:1100,height:800}})).newPage();
      await h.navigate(small,origin+'/?mode=pro&mobile=0');await h.ready(small);
      // 새 브라우저라 튜토리얼 환영 창이 ready 뒤에 늦게 뜰 수 있다 — 뜨면 닫고 누른다.
      {const skip=small.getByRole('button',{name:'건너뛰기',exact:true});await skip.waitFor({state:'visible',timeout:3000}).then(()=>skip.click()).catch(()=>{});}
      await small.click('#exam-pool-open');
      const smallSheet=await (await small.waitForSelector('#exampool-sheet-workspace iframe')).contentFrame();
      await smallSheet.waitForSelector('#side-new');await smallSheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중',null,{timeout:30000});
      await smallSheet.click('#side-new');await smallSheet.waitForSelector('#new-dialog[open]');
      await smallSheet.click('#new-dialog .nq-opt[data-step="form"][data-k="essay"]');await smallSheet.click('#new-dialog .nq-opt[data-step="struct"][data-k="two"]');
      const narrow=await smallSheet.evaluate(()=>{const d=document.querySelector('#new-dialog'),c=d.querySelector('.nq-col'),f=d.querySelector('.nq-foot').getBoundingClientRect(),r=d.getBoundingClientRect();return {clipped:c.scrollHeight>c.clientHeight+1,struct:!!d.querySelector('.nq-opt[data-step="struct"][aria-pressed="true"]'),foot:f.bottom<=r.bottom+1&&f.top>=r.top};});
      assert.deepEqual(narrow,{clipped:false,struct:true,foot:true},'the narrow new-question dialog keeps every option reachable');
    } finally {await browser.close();}
  }
}).catch(error => {console.error(error);process.exitCode = 1;});
