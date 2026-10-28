// ExamPool 출제 대화의 실패 경로(대역 하네스·대역 그림 엔진, 실제 AI 아님):
// AI 오류 → 변경안 없음, 그림 엔진 실패 → 그림 칸 그대로, 취소 뒤 늦은 답 무시, 기다리는 동안 문항 삭제,
// 같은 응답 두 번 도착, 그래프 결과(편집 가능한 원본)와 그림 결과(비트맵)의 연결.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
h.withServer(async origin=>{
  for(const [engineName,engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE).filter(([name])=>!process.env.EXAM_ENGINE||name===process.env.EXAM_ENGINE)){
    const browser=await engine.launch({headless:true});
    try{
      const page=await (await browser.newContext({viewport:{width:1440,height:960}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
      await page.evaluate(PNG=>{
        // 대역: 요청을 쌓아 두고 시험이 정한 때에 답한다.
        window.__calls=[];window.__answer=null;
        window.fiveEAuthoringHarness={cancel(){window.__cancelled=(window.__cancelled||0)+1;return true;},request:packet=>new Promise((resolve,reject)=>{window.__calls.push(packet);window.__answer={resolve,reject};})};
        window.__figureCalls=[];
        window.fiveEFigureEngines={
          graph:async({description})=>{window.__figureCalls.push(['graph',description]);if(/실패/.test(description))throw new Error('그래프 검증에 막혔습니다: 시험');return {data:PNG,width:1,height:1,engine:'native-graph',ms:5,graph:{plan:{source:{}},objects:[{type:'coordplane',id:'p'}],source:{width:1,height:1}}};},
          image:async({description})=>{window.__figureCalls.push(['image',description]);return {data:PNG,width:1,height:1,engine:'ai-image',ms:5};},
          editGraph:async()=>null};
      },PNG);
      await page.locator('.app-switch-image [data-app-switch="exam"]').click();
      const sheet=await (await page.waitForSelector('#exampool-sheet-workspace iframe')).contentFrame();
      await sheet.waitForSelector('.side [data-pool="drafting"]');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중',null,{timeout:30000});
      await sheet.evaluate(()=>document.querySelector('.side [data-pool="drafting"]').click());await sheet.click('[data-lv-new]');await sheet.click('#new-dialog .nq-opt[data-step="form"][data-k="combo"]');await sheet.click('#new-dialog .nq-opt[data-step="struct"][data-k="big"]');await sheet.click('#new-dialog [data-nq="go"]');
      await sheet.waitForSelector('#card-view:not([hidden]) .cv-writer');
      const openAi=async()=>{await sheet.click('#card-view [data-cvright="ai"]');await sheet.waitForSelector('#cv-ai-input');};
      const send=async text=>{const n=await page.evaluate(()=>window.__calls.length);await sheet.fill('#cv-ai-input',text);await sheet.click('#card-view [data-cv="ai-send"]');await sheet.waitForSelector('#card-view .msg.ai.pending');await page.waitForFunction(n=>window.__calls.length>n,n,{timeout:10000});};
      await openAi();
      // 1) AI 오류: 오류 말풍선, 변경안·검토 상태 변화 없음.
      await send('초안 만들어 줘');await page.evaluate(()=>window.__answer.reject(new Error('AI 응답 형식이 계약과 맞지 않습니다: 시험')));
      await sheet.waitForSelector('#card-view .msg.ai.err');assert.match(await sheet.locator('#card-view .msg.ai.err').last().textContent(),/계약과 맞지 않습니다/);
      assert.equal(await sheet.locator('#card-view .proposal').count(),0,'a failed answer leaves no proposal');
      assert.match(await sheet.locator('#card-view .au-strip').textContent(),/정답·조건 · 미검토/,'a failed answer never becomes a pass');
      // 2) 취소한 뒤 늦게 온 답은 반영하지 않는다.
      await send('발문 다듬기');await sheet.click('#card-view [data-cv="ai-cancel"]');
      await page.waitForFunction(()=>window.__cancelled===1,null,{timeout:5000});// 취소가 5E 하네스까지 간다
      await page.evaluate(()=>window.__answer.resolve({response:{reply:'늦은 답',proposal:{summary:'늦은 변경',changes:[{path:'ask',value:'늦은 발문'}]}},evidence:[],meta:{live:false}}));
      await sheet.waitForTimeout(400);
      assert.equal(await sheet.locator('#card-view .proposal').count(),0,'a reply after cancel is not stored as a proposal');
      assert.notEqual(await sheet.locator('#cv-ask').inputValue(),'늦은 발문');
      // 3) 그래프 명세 → 그래프(편집 가능), 그림 명세 → 그림(비트맵), 그림 엔진 실패는 칸을 그대로 둔다.
      await send('그래프와 그림 명세를 줘');
      await page.evaluate(()=>window.__answer.resolve({response:{reply:'명세입니다',figures:[{kind:'graph',slot:'new',description:'가로축 시간, 세로축 속도'},{kind:'image',slot:'new',description:'빗면 위 물체 A'},{kind:'graph',slot:'new',description:'실패할 그래프'}]},evidence:[],meta:{live:false}}));
      await sheet.waitForSelector('#card-view [data-cvfig]');
      const figButtons=sheet.locator('#card-view [data-cvfig]');
      await figButtons.nth(0).click();await sheet.waitForFunction(()=>/그래프 · 편집 가능/.test(document.querySelector('#card-view .au-figlist')?.textContent||''),null,{timeout:10000});
      await figButtons.nth(1).click();await sheet.waitForFunction(()=>/그림 · 비트맵/.test(document.querySelector('#card-view .au-figlist')?.textContent||''),null,{timeout:10000});
      const before=await sheet.locator('#card-view .au-figrow').count();
      await figButtons.nth(2).click();await sheet.waitForSelector('#card-view .msg.ai.err >> text=그래프 만들기에 실패했습니다',{timeout:10000});
      assert.equal(await sheet.locator('#card-view .au-figrow').count(),before,'a failed figure keeps the existing figures');
      assert.equal(await sheet.locator('#card-view [data-cvgraphedit]').count(),1,'only the graph offers graph editing');
      // 4) 같은 응답이 두 번 와도 한 번만 반영한다.
      await send('검토해 줘');
      await page.evaluate(()=>window.__answer.resolve({response:{reply:'한 번만',review:{axes:{answer:{status:'unverified'}}}},evidence:[],meta:{live:false}}));
      await sheet.waitForSelector('#card-view .msg.ai >> text=한 번만');
      assert.equal(await sheet.locator('#card-view .msg.ai >> text=한 번만').count(),1);
      // 4-1) M26: 변경안이 온 뒤 교사가 고치고 0.6초 안에 「적용」을 눌러도, 확인 없이 덮어쓰지 않는다.
      await send('발문 고쳐 줘');
      await page.evaluate(()=>window.__answer.resolve({response:{reply:'변경안입니다',proposal:{summary:'발문 변경',changes:[{path:'ask',value:'AI가 고친 발문'}]}},evidence:[],meta:{live:false}}));
      await sheet.waitForSelector('#card-view .proposal [data-act="apply"]');await sheet.waitForTimeout(900);
      const dialogs=[];page.on('dialog',d=>{dialogs.push(d.message());void d.dismiss();});
      await sheet.fill('#cv-ask','교사가 방금 고친 발문');await sheet.click('#card-view .proposal [data-act="apply"]');await sheet.waitForTimeout(400);
      assert.equal(dialogs.length,1,'applying right after a teacher edit asks first');assert.match(dialogs[0],/지난 버전/);
      assert.equal(await sheet.locator('#cv-ask').inputValue(),'교사가 방금 고친 발문','declining keeps the teacher text');
      // 4-2) M18: 탭을 바꿔 카드를 다시 그려도 AI 입력창에 쓰던 초안은 남는다.
      await sheet.fill('#cv-ai-input','쓰다 만 요청');await sheet.click('#card-view [data-cvright="paper"]');await sheet.click('#card-view [data-cvright="ai"]');await sheet.waitForSelector('#cv-ai-input');
      assert.equal(await sheet.locator('#cv-ai-input').inputValue(),'쓰다 만 요청','the AI draft survives a full card re-render');await sheet.fill('#cv-ai-input','');
      // 5) 기다리는 동안 문항을 지우면 답을 버린다.
      await send('검토해 줘');
      const count=await sheet.evaluate(()=>document.querySelectorAll('[data-open-card]').length);
      await sheet.evaluate(()=>document.querySelector('#delete-question').click());await sheet.evaluate(()=>document.querySelector('#delete-confirm').click());
      await sheet.evaluate(()=>{window.__statusLog=[];new MutationObserver(()=>window.__statusLog.push(document.querySelector('#status').textContent)).observe(document.querySelector('#status'),{childList:true,characterData:true,subtree:true});});
      await page.evaluate(()=>window.__answer.resolve({response:{reply:'지운 문항의 답',proposal:{summary:'x',changes:[{path:'ask',value:'x'}]}},evidence:[],meta:{live:false}}));
      await sheet.waitForFunction(()=>window.__statusLog.some(t=>/문항이 없어 반영하지 않았습니다/.test(t)),null,{timeout:10000});
      assert.ok(await sheet.evaluate(()=>document.querySelectorAll('[data-open-card]').length)<=count);
      assert.deepEqual(errors,[]);
      console.log(`${engineName}: authoring failure paths verified (fake harness and engines, not live AI)`);
    }finally{await browser.close();}
  }
});
