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
    const list=f=>(f||page).evaluate(async()=>{const m=await import('/js/drawer.js?v=1.7.0-four-session-integration');return (await m.clipList()).map(i=>({name:i.name,kind:i.kind,source:i.source,moving:i.moving,objects:!!i.objects}));});
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
    await page.keyboard.press(MOD+'+KeyC');await page.waitForFunction(async()=>{const m=await import('/js/drawer.js?v=1.7.0-four-session-integration');return (await m.clipList()).length===2;});
    { const all=await list(); assert.deepEqual(all.find(i=>i.source==='5E_image'),{name:'사각형',kind:'obj',source:'5E_image',moving:false,objects:true},JSON.stringify(all)); }
    await page.keyboard.press(MOD+'+KeyX');await page.waitForFunction(async()=>{const m=await import('/js/drawer.js?v=1.7.0-four-session-integration');return (await m.clipList()).some(i=>i.moving);});
    await page.keyboard.press(MOD+'+KeyV');await page.waitForFunction(async()=>{const m=await import('/js/drawer.js?v=1.7.0-four-session-integration');return !(await m.clipList()).some(i=>i.moving);});
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
    // 더블클릭으로도 넣는다(11-14: 고를 때 목록을 다시 그려 더블클릭이 안 되던 것).
    // 11-14(지적 7, 40c785b4): 넣으면 클립보드는 닫힌다 — 다시 열고 두 번 누른다.
    const n1=await images();await page.click('#clipboard-open');await page.locator('.clp-i',{hasText:'옛 서랍 그림'}).locator('.clp-t').dblclick();await page.waitForFunction(n=>document.querySelectorAll('#canvas image').length>n,n1);
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
    // 11-14(지적 7, 40c785b4): 넣으면 클립보드는 저절로 닫힌다 — 닫힌 것을 확인한다(닫기 단추는 미끄러져 사라지는 중).
    await sheet.waitForFunction(()=>!document.querySelector('.clp')?.classList.contains('show'));
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

// 11-14 사용자: 「이미지 변환에도 끌어서 들어가져야」 — 그림을 받는 창마다 클립보드 「넣기」가 그 창으로 가고, 클립보드 항목을 끌어 놓을 수 있어야 한다.
test('5E clipboard: every image-accepting window takes insert and drag (AI image, objectify, hwp)',{timeout:600000},async t=>{
  await h.withServer(async origin=>{
    const browser=await chromium.launch();t.after(()=>browser.close());
    const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
    await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
    const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=300;c.height=200;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,300,200);x.strokeRect(20,20,260,160);return c.toDataURL('image/png');});
    const id=await page.evaluate(async src=>{const m=await import('/js/drawer.js?v=1.7.0-four-session-integration');return (await m.clipAdd({src,name:'시험 그림',w:300,h:200,source:'라이브러리'})).id;},png);
    const dropOn=(frame,selector,pt)=>frame.evaluate(({selector,id,pt})=>{const el=selector?document.querySelector(selector):document.elementFromPoint(pt.x,pt.y);const r=el.getBoundingClientRect();
      const dt=new DataTransfer();dt.setData('application/x-5e-drawer',id);const o={bubbles:true,cancelable:true,composed:true,clientX:pt?pt.x:r.left+r.width/2,clientY:pt?pt.y:r.top+r.height/2,dataTransfer:dt};
      const over=new DragEvent('dragover',o);el.dispatchEvent(over);el.dispatchEvent(new DragEvent('drop',o));return over.defaultPrevented;},{selector,id,pt});
    const label=async()=>{await page.evaluate(()=>window.fiveEClipboard.open());await page.locator('.clp-i').first().click();const v=(await page.locator('.clp-go').textContent()).trim();await page.evaluate(()=>window.fiveEClipboard.close());return v;};
    // AI 이미지: 넣기 = 원본으로 쓰기, 끌어 놓기도 원본
    await page.click('#ai-image-install-open');await page.waitForSelector('#ai-image-panel:not([hidden])');
    assert.equal(await label(),'원본으로 쓰기');assert.equal(await dropOn(page.mainFrame(),'#ai-image-panel'),true);
    await page.waitForFunction(()=>/클립보드 그림을 원본으로/.test(document.querySelector('[data-ai-status]')?.textContent||''));
    await page.evaluate(()=>{const x=document.getElementById('ai-image-panel');x.querySelector('[data-ai-close], .ai-close, [aria-label="닫기"]')?.click();});await page.waitForFunction(()=>document.getElementById('ai-image-panel').hidden);
    // 이미지 객체화: 넣기 = 원본으로 쓰기, 끌어 놓으면 원본이 읽힌다
    await page.evaluate(()=>document.getElementById('image-objectify-open').click());await page.waitForFunction(()=>window.fiveEObjectifyClip?.open());
    assert.equal(await label(),'원본으로 쓰기');assert.equal(await dropOn(page.mainFrame(),'#objectify-stage'),true);
    await page.waitForFunction(()=>!document.getElementById('objectify-tools').hidden);
    // 창을 열어 둔 채 다른 프로그램으로 가도 그쪽 자리로 넣는다(5E_image일 때만 객체화 창이 받는다).

    // 5E_hwp: 넣기 = 커서 자리에 넣기, 문서로 끌어 놓으면 그림이 들어간다
    await page.locator('.app-switch-image [data-app-switch="hwp"]').evaluate(b=>b.click());await page.waitForFunction(()=>window.fiveEClipHostHwp?.ready?.(),null,{timeout:120000});
    assert.equal(await label(),'커서 자리에 넣기');
    const len=()=>page.evaluate(()=>window.fiveEHwpPalette.native.bridge().wasm.borrowDocumentHandle().renderPageSvg(0).length);const l0=await len();
    const editor=page.frames().find(f=>f!==page.mainFrame()&&/rhwp|studio/i.test(f.url()));assert.ok(editor,'hwp editor frame');
    assert.equal(await dropOn(editor,null,{x:400,y:300}),true);await page.waitForFunction(n=>window.fiveEHwpPalette.native.bridge().wasm.borrowDocumentHandle().renderPageSvg(0).length>n+300,l0);
    assert.deepEqual(errors,[]);
  });
});
