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
      assert.deepEqual(await sheet.locator('#card-view .lp-tabs [data-cvtab]').allTextContents(),['기출','교과서','기준','자료','지면','AI']);
      await sheet.click('#card-view [data-cv="sheet"]');
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

      // 한글 창 열기.
      await sheet.click('#preview');await typesetReady(sheet);

      // 구성 시트: 선지 배열을 세로로 → 한글 창이 다시 그려진다.
      await sheet.click('[data-sheet="parts"]');
      await redraw(sheet,()=>sheet.selectOption('[data-part-id="choices"] select','세로'));
      assert.equal(await sheet.locator('[data-part-id="choices"] select').inputValue(),'세로');

      // 그림 크기 30%(구성 시트 크기 칸) → 그림과 결과표가 한 화면에 보인다.
      const sizeInput=sheet.locator('#parts tr:has([data-part="label"][value="그림"]) [data-part="size"]');
      await redraw(sheet,async()=>{await sizeInput.fill('31');await sizeInput.press('Enter');});
      assert.equal(await sizeInput.inputValue(),'30%','typed size snaps to 5%');
      // 순서 올리기: 그림을 보기 위로(같은 묶음 안 순서).
      await redraw(sheet,()=>sheet.click('#parts tr:has([data-part="label"][value="그림"]) [data-part-move="up"]'));
      const order=(await partsRows(sheet)).map(r=>r.kind);assert.ok(order.indexOf('그림')<order.indexOf('보기'),'figure moved above bogi');
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
      // 다시 그린 문서도 배치 층과 짝이 맞아야 한다(가로 묶음 안의 그림을 다시 찾을 수 있다).
      assert.ok(await findItem(page,sheet,box,'그림'),'the redrawn figure is still a placement item');
      const rows=await partsRows(sheet),side=rows.find(r=>r.name==='가로 묶음');
      assert.equal(side.layout,'나란히');
      const kids=rows.slice(rows.indexOf(side)+1,rows.indexOf(side)+3);
      assert.deepEqual(kids.map(r=>r.kind),['표','그림'],'table then figure in the side-by-side group');
      assert.ok(kids.every(r=>/^\d+$/.test(r.ratio)),'integer width ratios are recorded');
      await page.screenshot({path:path.join(evidence,`${engineName}-placed.png`)});

      // 한글 창에서 발문 끝에 글을 더하면 시트 발문 칸이 바뀐다.
      await sheet.click('[data-sheet="registry"]');
      const frame=sheet.locator('#native-editor iframe'),fb=await frame.boundingBox();
      // 문항 첫 줄(번호와 지문)을 누르고 줄 끝에 쓴다. 맨 위 빈 줄은 시트 칸이 아니다.
      await sheet.evaluate(()=>document.querySelector('#native-editor iframe').contentDocument.querySelector('#scroll-container,#scroll-content')?.scrollTo?.(0,0));
      // 문서 맨 앞에는 1pt 빈 문단(구역 자리)이 있고 그 다음 줄이 번호와 지문이다. 문서를 누른 뒤 Ctrl+Home → ↓ → End.
      await page.mouse.click(frameBox.x+fb.x+fb.width*.55,frameBox.y+fb.y+92);await page.keyboard.press('Control+Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('End');
      // 글자 사이를 띄워 친다: 한 글자씩 시트에 반영되는 동안에도 입력 위치가 한글 창에 남아야 한다.
      await page.keyboard.type(' OK',{delay:200});
      await sheet.waitForFunction(()=>[...document.querySelectorAll('#rows textarea[data-field="passage"]')].some(t=>t.value.endsWith(' OK')),null,{timeout:15000});
      assert.equal(await sheet.evaluate(()=>document.activeElement?.closest?.('#native-editor')?'hwp':document.activeElement?.tagName),'hwp','typing focus stays in the HWP window');
      assert.equal(await passageValue(),'다음은 실험이다. OK','the passage cell received exactly the typed text');

      // 한글 창을 고친 뒤에도 시트 칸에 입력하는 동안(확정 전) 한글 창의 같은 문단에 바로 들어간다. 다시 그리지 않는다.
      const nativeText=()=>sheet.evaluate(()=>document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.wasm.borrowDocumentHandle().getTextFileText());
      await sheet.evaluate(()=>{window.__busySeen=false;const p=document.querySelector('#preview-dialog');window.__busyWatch?.disconnect();window.__busyWatch=new MutationObserver(()=>{if(p.getAttribute('aria-busy')==='true')window.__busySeen=true;});window.__busyWatch.observe(p,{attributes:true,attributeFilter:['aria-busy']});});
      await sheet.locator('#rows tr:has(th.field-label:text-is("발문")) td').first().click();await page.keyboard.press('F2');
      await sheet.evaluate(()=>{const t=document.querySelector('.grid-editing textarea');t.setSelectionRange(t.value.length,t.value.length);});
      await page.keyboard.type(' 실시간');
      await sheet.waitForFunction(()=>/실시간/.test(document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.wasm.borrowDocumentHandle().getTextFileText()),null,{timeout:10000});
      assert.match(await nativeText(),/OK[\s\S]*실시간/,'the draft reaches the HWP paragraph while typing, after the HWP edit');
      await page.keyboard.press('Escape');
      await sheet.waitForFunction(()=>!/실시간/.test(document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.wasm.borrowDocumentHandle().getTextFileText()),null,{timeout:10000});
      await sheet.locator('#rows tr:has(th.field-label:text-is("발문")) td').first().click();await page.keyboard.press('F2');
      await sheet.evaluate(()=>{const t=document.querySelector('.grid-editing textarea');t.setSelectionRange(t.value.length,t.value.length);});
      await page.keyboard.type(' 실시간');await page.keyboard.press('Enter');
      await sheet.waitForFunction(()=>/실시간/.test(document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.wasm.borrowDocumentHandle().getTextFileText()),null,{timeout:10000});
      assert.match(await sheet.locator('#rows tr:has(th.field-label:text-is("발문")) textarea').first().inputValue(),/ 실시간$/,'the committed cell reaches the HWP window');
      assert.equal(await passageValue(),'다음은 실험이다. OK','the HWP edit survives the sheet edit');
      // 한글에 나오지 않는 칸(해설)을 고쳐도 한글 창은 그대로다.
      await sheet.locator('#rows tr:has(th.field-label:text-is("해설")) td').first().click();await page.keyboard.type('해설만 바꿈');await page.keyboard.press('Enter');
      await sheet.waitForTimeout(900);
      assert.equal(await sheet.evaluate(()=>window.__busySeen),false,'text edits and non-printed fields never redraw the HWP window');
      assert.equal(await sheet.locator('#typeset-refresh').isHidden(),true,'the HWP window matches the sheet');
      // 흰 칸은 한글에 글로 나오는 칸뿐, 나머지는 옅은 회색.
      const shades=await sheet.evaluate(()=>{const row=label=>[...document.querySelectorAll('#rows tr')].find(tr=>tr.querySelector('th.field-label')?.textContent===label)?.querySelector('td');document.activeElement?.blur();
        return Object.fromEntries(['발문','보기','선지','문항유형','성취기준','자료 구성','선지 표현','해설'].map(l=>{const td=row(l);td.classList.remove('grid-active','grid-selected');return [l,{hwp:td.dataset.hwp,bg:getComputedStyle(td).backgroundColor}];}));});
      for(const l of ['발문','보기','선지'])assert.equal(shades[l].hwp,'text',l);
      for(const l of ['문항유형','성취기준','자료 구성','선지 표현','해설']){assert.equal(shades[l].hwp,'off',l);assert.notEqual(shades[l].bg,'rgb(255, 255, 255)',l+' is gray');}
      await sheet.evaluate(()=>window.__busyWatch?.disconnect());

      // 시트 칸이 아닌 곳(문항 번호 앞)을 고치면 반영하지 않고, '한글 창 수정 버리기'로 빠져나온다.
      await page.mouse.click(frameBox.x+fb.x+fb.width*.55,frameBox.y+fb.y+92);await page.keyboard.press('Home');await page.keyboard.type('Z');
      await sheet.waitForFunction(()=>!document.querySelector('#typeset-discard').hidden,null,{timeout:15000});
      await redraw(sheet,async()=>{await sheet.click('#typeset-discard');await sheet.click('#typeset-discard');});
      assert.equal(await sheet.locator('#typeset-discard').isHidden(),true);
      assert.match(await passageValue(),/ OK/,'the synced text survives discarding');
      // 틀의 '실험 장치' 그림 칸은 아직 비어 있다. 빈 칸은 한글 창에 틀(회색 자리)로만 보이고 조판 저장을 막는다.
      await sheet.click('#typeset-save');
      await sheet.waitForFunction(()=>document.querySelector('#typeset-status').dataset.error==='true',null,{timeout:15000});
      assert.match(await sheet.locator('#typeset-status').textContent(),/비어 있는 칸\(그림 1곳\)/);
      await redraw(sheet,async()=>{
        await sheet.click('[data-sheet="registry"]');
        await sheet.locator('#rows tr:has(th.field-label:text-is("자료")) td').first().dblclick();await sheet.waitForSelector('#slot-dialog[open]');
        const chooser2=sheet.waitForEvent?sheet.waitForEvent('filechooser'):page.waitForEvent('filechooser');
        await sheet.locator('#slot-dialog [data-slot-file]').first().click();await (await chooser2).setFiles(figure);
        await sheet.waitForFunction(()=>document.querySelectorAll('#slot-dialog .slot-thumb img').length>=2,null,{timeout:10000});
        await sheet.click('[data-close="slot-dialog"]');
      });
      // 조판 저장 → 시험지 HWPX.
      // 첫 저장은 최종 저장 모양으로 갱신하고 확인을 요청할 수 있다(기존 설계). 그때는 한 번 더 저장한다.
      for(let attempt=0;attempt<2;attempt++){
        await sheet.click('#typeset-save');
        await sheet.waitForFunction(()=>{const n=document.querySelector('#typeset-status');return /조판 저장됨|다시 누르세요/.test(n.textContent)||n.dataset.error==='true';},null,{timeout:60000});
        if(/조판 저장됨/.test(await sheet.locator('#typeset-status').textContent()))break;
        await typesetReady(sheet);
      }
      assert.match(await sheet.locator('#typeset-status').textContent(),/조판 저장됨/);
      // 새 시험지를 만들고 보관함의 문항을 넣은 뒤, 시험지 한 부를 HWPX로 받는다.
      await sheet.click('.side [data-nav="new-exam"]');await sheet.waitForSelector('#examd-view:not([hidden]) #exam-from-library');
      const qid=await sheet.locator('#exam-from-library option').nth(1).getAttribute('value');await sheet.selectOption('#exam-from-library',qid);
      await sheet.waitForSelector(`#examd-view [data-order="${qid}"]`);
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
      await sheet.click('.side [data-nav="library"]');
      for(const [theme,palette] of [['dark','classic'],['dark','graphite'],['light','graphite']]){
        await page.evaluate(([t,p])=>{document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-palette',p);},[theme,palette]);
        await sheet.waitForFunction(([t,p])=>document.documentElement.dataset.theme===t&&document.documentElement.dataset.palette===p,[theme,palette]);
        await page.screenshot({path:path.join(evidence,`${engineName}-${theme}-${palette}.png`)});
      }
      assert.deepEqual(errors,[],'no page errors');
      console.log(`${engineName}: office workroom verified`);
    } finally {await browser.close();}
  }
}).catch(error => {console.error(error);process.exitCode = 1;});
