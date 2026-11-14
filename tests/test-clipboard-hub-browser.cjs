// 11-14(시안 clipboard-hub-1114 v4): 5E 클립보드 흐름 — 옛 서랍 자리, ⌘C·⌘X·⌘V, ⇧⌘V 열기·크게 보기, 넣기(캔버스·문항 카드 자료 칸·5E_hwp 커서 자리), 고르기, Esc.
const test=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
const MOD=process.platform==='darwin'?'Meta':'Control';
test('5E clipboard: copy/cut/paste, open, big view, insert into image·exam card·hwp',{timeout:600000},async t=>{
  const {questionFromShape}=await import('../assets/exampool/sheet/templates.js');
  const q=questionFromShape({form:'single',struct:'two'},'1');q.ask='다음 그림에 대한 설명으로 옳은 것은?';q.choices.forEach((c,k)=>c.text=`선지 ${k+1}`);
  await h.withServer(async origin=>{
    const browser=await chromium.launch();t.after(()=>browser.close());
    const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
    await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
    const list=f=>(f||page).evaluate(async()=>{const m=await import('/js/drawer.js?v=1114');return (await m.clipList()).map(i=>({name:i.name,kind:i.kind,source:i.source,moving:i.moving,objects:!!i.objects}));});
    const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=300;c.height=180;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,300,180);x.strokeStyle='#123';x.lineWidth=5;x.strokeRect(20,20,260,140);return c.toDataURL('image/png');});
    // 옛 서랍 단추는 없고 「작업 도구 › 클립보드」가 있다.
    assert.equal(await page.locator('#drawer-btn').count(),0,'top bar drawer button removed');
    assert.equal((await page.locator('#advanced-section .tool-section-header').textContent()).trim().replace(/\s*▾$/,''),'작업 도구');
    assert.equal(await page.locator('#advanced-section #clipboard-open').isVisible(),true);
    // 옛 서랍에 담긴 것(출처 없음)도 그대로 보인다 — 같은 저장소.
    await page.evaluate(async src=>{const d=await new Promise(r=>{const q=indexedDB.open('fivee-drawer',1);q.onupgradeneeded=()=>q.result.createObjectStore('items',{keyPath:'id'});q.onsuccess=()=>r(q.result);});
      await new Promise(r=>{const t=d.transaction('items','readwrite');t.objectStore('items').put({id:'old1',src,name:'옛 서랍 그림',w:300,h:180,at:Date.now()-60000});t.oncomplete=r;});},png);
    assert.deepEqual((await list()).map(i=>[i.name,i.source]),[['옛 서랍 그림','옛 서랍']]);
    // ⌘C: 사각형을 그리고 복사하면 객체 원본과 함께 들어간다. ⌘X는 옮기는 중, ⌘V로 붙이면 빠진다.
    await page.mouse.click(154,196);await page.mouse.move(600,350);await page.mouse.down();await page.mouse.move(760,470,{steps:6});await page.mouse.up();
    await page.mouse.click(35,160);await page.mouse.click(600,350);
    await page.keyboard.press(MOD+'+KeyC');await page.waitForFunction(async()=>{const m=await import('/js/drawer.js?v=1114');return (await m.clipList()).length===2;});
    assert.deepEqual((await list())[0],{name:'사각형',kind:'obj',source:'5E_image',moving:false,objects:true});
    await page.keyboard.press(MOD+'+KeyX');await page.waitForFunction(async()=>{const m=await import('/js/drawer.js?v=1114');return (await m.clipList()).some(i=>i.moving);});
    await page.keyboard.press(MOD+'+KeyV');await page.waitForFunction(async()=>{const m=await import('/js/drawer.js?v=1114');return !(await m.clipList()).some(i=>i.moving);});
    // 글 입력칸에 커서가 있어도 ⇧⌘V로 열린다(11-14: AI 그래프 창은 열자마자 입력칸에 커서가 있어 안 열렸다).
    await page.evaluate(()=>{const i=document.createElement('input');i.id='clip-probe';i.style.cssText='position:fixed;left:300px;top:300px;z-index:5';document.body.append(i);i.focus();});
    await page.keyboard.press(MOD+'+Shift+KeyV');await page.waitForSelector('.clp.show');await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.clp').classList.contains('show'));
    await page.evaluate(()=>document.getElementById('clip-probe').remove());
    // ⇧⌘V 열기 → 한 번 더 = 크게 보기 → Esc = 옆 서랍 → Esc = 닫기
    await page.mouse.click(900,600);await page.keyboard.press(MOD+'+Shift+KeyV');await page.waitForSelector('.clp.show');
    await page.keyboard.press(MOD+'+Shift+KeyV');await page.waitForSelector('.clpb.show');
    // 아무것도 안 골랐을 때는 계속 두기·지우기·선택 해제가 숨어 있고, 고르면 나온다. 뒤 화면은 흐리게.
    assert.equal(await page.locator('.clpb-acts').isHidden(),true);await page.locator('.clpb-i').first().click();assert.equal(await page.locator('.clpb-acts').isVisible(),true);
    assert.match(await page.locator('.clpb').evaluate(n=>getComputedStyle(n).backdropFilter||getComputedStyle(n).webkitBackdropFilter),/blur/);
    await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.clpb').classList.contains('show'));assert.equal(await page.locator('.clp.show').count(),1,'Esc in big view returns to the side drawer');
    await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.clp').classList.contains('show'));
    // 넣기(캔버스)
    await page.click('#clipboard-open');await page.locator('.clp-i',{hasText:'옛 서랍 그림'}).click();
    assert.equal((await page.locator('.clp-go').textContent()).trim(),'캔버스에 넣기');
    const images=()=>page.evaluate(()=>document.querySelectorAll('#canvas image').length);const n0=await images();
    await page.locator('.clp-go').click();await page.waitForFunction(n=>document.querySelectorAll('#canvas image').length>n,n0);
    await page.keyboard.press('Escape');
    // 5E_exam: 왼쪽 메뉴 「클립보드」, 문항 카드 자료 칸에 넣기
    await page.locator('.app-switch-image [data-app-switch="exam"]').evaluate(b=>b.click());const sheet=await (await page.waitForSelector('#exampool-sheet-workspace iframe')).contentFrame();
    await sheet.waitForSelector('.side [data-pool="drafting"]');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중');
    await sheet.setInputFiles('#excel-file',{name:'clip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'5e-question-sheet-v2',questions:[q],documents:[],exams:[]}))});
    await sheet.waitForSelector('#import-dialog[open]');await sheet.click('#apply-import');await sheet.waitForTimeout(1200);
    await sheet.evaluate(()=>document.querySelector('.side [data-pool="drafting"]').click());await sheet.locator('[data-open-card]').first().click();await sheet.waitForSelector('#card-view [data-pane="card"]');
    assert.match(await sheet.locator('[data-nav="drawer"]').getAttribute('title'),/^클립보드/);
    const figs=()=>sheet.evaluate(()=>document.querySelectorAll('#card-view .cv-tile img').length);const f0=await figs();
    await sheet.click('[data-nav="drawer"]');await sheet.locator('.clp-i',{hasText:'옛 서랍 그림'}).click();
    assert.equal((await sheet.locator('.clp-go').textContent()).trim(),'자료 칸에 넣기');
    await sheet.locator('.clp-go').click();await sheet.waitForFunction(n=>document.querySelectorAll('#card-view .cv-tile img').length>n,f0);
    assert.doesNotMatch(await sheet.evaluate(()=>document.querySelector('#status').textContent),/확인하세요/);
    await sheet.locator('.clp [data-clp="close"]').click();
    // 위 문서에서 ⇧⌘V를 눌러도 5E_exam의 클립보드가 열린다.
    await page.keyboard.press(MOD+'+Shift+KeyV');await sheet.waitForSelector('.clp.show');await sheet.locator('.clp [data-clp="close"]').click();
    // 5E_hwp: 「내용 넣기 › 클립보드」, 커서 자리에 넣기
    await page.locator('.app-switch-image [data-app-switch="hwp"]').evaluate(b=>b.click());
    await page.waitForFunction(()=>window.fiveEClipHostHwp?.ready?.(),null,{timeout:120000});
    const svgLen=()=>page.evaluate(()=>window.fiveEHwpPalette.native.bridge().wasm.borrowDocumentHandle().renderPageSvg(0).length);const s0=await svgLen();
    await page.evaluate(()=>document.querySelector('[data-el-act="clip"]').click());await page.waitForSelector('.clp.show');
    await page.locator('.clp-i',{hasText:'옛 서랍 그림'}).click();assert.equal((await page.locator('.clp-go').textContent()).trim(),'커서 자리에 넣기');
    await page.locator('.clp-go').click();await page.waitForFunction(n=>window.fiveEHwpPalette.native.bridge().wasm.borrowDocumentHandle().renderPageSvg(0).length>n+500,s0);
    assert.deepEqual(errors,[]);
  });
});
