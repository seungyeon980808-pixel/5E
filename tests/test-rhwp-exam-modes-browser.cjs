// 5E_hwp 도구 모드 3개·집중 도구 줄·기호 창·새 조판 기능(10-21). 실제 단추를 눌러 문서가 바뀌는지 본다.
const test = require('node:test'), assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');

// 문서 손잡이·스튜디오 입력·현재 문단 글자를 페이지 안에서 꺼내는 도우미.
const prelude = `const b=window.fiveEHwpPalette.native.bridge(),d=b.wasm.borrowDocumentHandle(),w=b.wasm;
const text=()=>[...Array(d.getParagraphCount(0)).keys()].map(p=>d.getTextRange(0,p,0,d.getParagraphLength(0,p)));
const reset=s=>{const top=JSON.parse(d.getPageControlLayout(0)).controls.filter(c=>!(c.cellPath||[]).length&&['table','image'].includes(c.type)).sort((a,b)=>b.paraIdx-a.paraIdx||(b.controlIdx??b.ci)-(a.controlIdx??a.ci));
  for(const c of top){if(c.type==='table')d.deleteTableControl(0,c.paraIdx,c.controlIdx??c.ci);else d.deletePictureControl(0,c.paraIdx,c.controlIdx??c.ci);}
  while(d.getParagraphCount(0)>1)d.mergeParagraph(0,1);const n=d.getParagraphLength(0,0);if(n)d.deleteText(0,0,0,n);const lines=s.split('\\n');d.insertText(0,0,0,lines[0]);
  for(let i=1;i<lines.length;i++){d.splitParagraph(0,i-1,d.getParagraphLength(0,i-1));d.insertText(0,i,0,lines[i]);}b.deps.eventBus.emit('document-changed');};`;
const inPage = (page, body, arg) => page.evaluate(new Function('arg', `return (async()=>{${prelude}${body}})()`), arg);
const button = (page, title) => page.locator(`.exam-fgroup [data-exam-fi][title^="${title}"]`);

for (const [name, engine] of Object.entries({ chromium, webkit })) test(`${name}: 5E_hwp modes and focus tools change the document`, async t => {
  await h.withServer(async origin => {
    const browser = await engine.launch(); t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await h.navigate(page, origin + '/?mode=pro&mobile=0&exam=1'); await h.ready(page);
    await page.waitForSelector('#exam-palette [data-block]'); await h.idle(page);
    const header = () => page.evaluate(() => getComputedStyle(document.querySelector('#exam-studio iframe').contentDocument.getElementById('studio-header')).display);

    // 1) 모드: 기본은 집중. 기본=리본·팔레트 없음, 없음=왼쪽 칸 없음·도구 보기, ⌘⌥2(Ctrl+Alt+2)로 집중.
    assert.equal(await page.locator('#rhwp-exam-workspace').getAttribute('data-tool-mode'), 'focus');
    assert.equal(await header(), 'none'); assert.ok(await page.locator('.exam-focusbar').isVisible());
    await page.locator('[data-exam-mode="basic"]').click();
    assert.notEqual(await header(), 'none'); assert.equal(await page.locator('.exam-focusbar').isVisible(), false); assert.equal(await page.locator('#exam-palette').isVisible(), false);
    await page.locator('[data-exam-mode="none"]').click();
    assert.equal(await page.locator('.exam-sidebar').isVisible(), false); assert.ok(await page.locator('.exam-peek').isVisible()); assert.equal(await header(), 'none');
    await page.keyboard.press('Control+Alt+Digit2');
    assert.equal(await page.locator('#rhwp-exam-workspace').getAttribute('data-tool-mode'), 'focus'); assert.ok(await page.locator('#exam-palette').isVisible());

    // 2) 글자·문단: 고른 글자에 굵게·형광펜·자간, 줄 간격·문단 위 간격.
    await inPage(page, `reset('가나다라');b.input.cursor.selectRange({sectionIndex:0,paragraphIndex:0,charOffset:0},{sectionIndex:0,paragraphIndex:0,charOffset:4});`);
    await button(page, '굵게').click(); await button(page, '고른 글자에 형광펜').click(); await button(page, '자간 줄이기').click(); await h.idle(page);
    const chars = await inPage(page, `return w.getCharPropertiesAt(0,0,1);`);
    assert.equal(chars.bold, true); assert.equal(chars.shadeColor, '#fff176'); assert.ok(chars.spacings[0] < 0);
    await page.locator('[data-exam-fctl="spacing"]').selectOption('200');
    await inPage(page, `b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:1});`);
    await button(page, '문단 위 간격 2pt 늘리기').click(); await h.idle(page);
    const para = await inPage(page, `return w.getParaPropertiesAt(0,0);`);
    assert.equal(para.lineSpacing, 200); assert.equal(Math.round(para.spacingBefore * 75 / 100) * 100, 400, '2pt = 400 (엔진은 소수 한 자리로 돌려줌)');

    // 2-1) 더 보기: 리본 없이 닿는 기능 — 오른쪽 정렬.
    await button(page, '자주 쓰지 않는 기능').click(); await page.locator('.exam-morepop').waitFor();
    await page.locator('.exam-morelist button', { hasText: '오른쪽 정렬' }).click(); await h.idle(page);
    assert.equal((await inPage(page, `return w.getParaPropertiesAt(0,0);`)).alignment, 'right');

    // 3) 기호 창: 첫 줄 ①, 따옴표 한 쌍(커서 가운데), 조각 「위첨자 ＋」(위 첨자 모양까지).
    await inPage(page, `reset('');b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:0});`);
    await page.locator('[data-exam-fx="symbols"]').click(); await page.locator('.exam-sympop').waitFor();
    await page.locator('.exam-symrow [data-exam-sym="①"]').click(); await h.idle(page);
    await page.locator('.exam-symrow [data-exam-sym="‘’"]').click(); await h.idle(page);
    assert.equal(await inPage(page, `return b.input.getCursorPosition().charOffset;`), 2, 'caret sits inside the quotes');
    await page.locator('[data-exam-symtab="조각"]').click(); await page.locator('[data-exam-sym="위첨자 ＋"]').click(); await h.idle(page);
    const sym = await inPage(page, `return {t:text()[0],sup:w.getCharPropertiesAt(0,0,2).superscript};`);
    assert.equal(sym.t, '①‘＋’'); assert.equal(sym.sup, true);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.exam-pop').isVisible(), false);

    // 4) 문항: 번호 다시 매기기, 선지 1열(발문은 남음) → 5열 표 → 3열 표.
    await inPage(page, `reset('3. 첫 문항\\n7. 발문 ① 가 ② 나 ③ 다 ④ 라 ⑤ 마');`);
    await page.locator('[data-exam-ftab="item"]').click();
    await button(page, '문항 번호 1부터').click(); await h.idle(page);
    assert.deepEqual((await inPage(page, `return text();`)).map(s => s.slice(0, 2)), ['1.', '2.']);
    await inPage(page, `b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:1,charOffset:9});`);
    await button(page, '선지를 한 줄에 하나씩').click(); await h.idle(page);
    assert.deepEqual(await inPage(page, `return text();`), ['1. 첫 문항', '2. 발문', '① 가', '② 나', '③ 다', '④ 라', '⑤ 마']);
    await inPage(page, `b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:3,charOffset:1});`);
    await button(page, '선지 5열').click(); await h.idle(page);
    const tables = () => inPage(page, `return JSON.parse(d.getPageControlLayout(0)).controls.filter(c=>c.type==='table').map(c=>({p:c.paraIdx,ci:c.controlIdx??c.ci,dims:JSON.parse(d.getTableDimensions(0,c.paraIdx,c.controlIdx??c.ci))}));`);
    const five = await tables(); assert.equal(five.length, 1); assert.deepEqual([five[0].dims.rowCount, five[0].dims.colCount], [1, 5]);
    await inPage(page, `b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:arg.p,charOffset:0,parentParaIndex:arg.p,controlIndex:arg.ci,cellIndex:2,cellParaIndex:0,cellPath:[{controlIndex:arg.ci,cellIndex:2,cellParaIndex:0}]});`, five[0]);
    await button(page, '선지 3열').click(); await h.idle(page);
    const three = await tables(); assert.deepEqual([three[0].dims.rowCount, three[0].dims.colCount], [2, 3]);

    // 5) 그림: 한 문단의 그림 둘 → 2×N 표, 칸 안 그림 칸 너비 맞춤, 표 줄 추가.
    await inPage(page, `reset('');const N=await import('/js/hwp-palette/native.js');
      const png=async c=>{const cv=document.createElement('canvas');cv.width=400;cv.height=300;const g=cv.getContext('2d');g.fillStyle=c;g.fillRect(0,0,400,300);return new Uint8Array(await (await new Promise(r=>cv.toBlob(r,'image/png'))).arrayBuffer());};
      const assets=new Map([['a',{bytes:await png('#c33'),widthMm:40,heightMm:30,width:400,height:300,extension:'png',name:'a.png'}],['b',{bytes:await png('#33c'),widthMm:40,heightMm:30,width:400,height:300,extension:'png',name:'b.png'}]]);
      b.transaction('test-pictures',()=>{N.insertValue(d,{sectionIndex:0,paragraphIndex:0,charOffset:0},[{image:'a'},{text:' ',style:null},{image:'b'}],assets);return true;});
      b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:0});`);
    await page.locator('[data-exam-ftab="pic"]').click();
    await button(page, '커서 문단의 그림 여러 개를').click(); await h.idle(page);
    const grid = await tables(); assert.equal(grid.length, 1); assert.deepEqual([grid[0].dims.rowCount, grid[0].dims.colCount], [2, 2]);
    const placed = await inPage(page, `return b.documentPictures().map(p=>p.ref.cellPath?.[0]?.cellIndex);`);
    assert.deepEqual(placed, [0, 1], 'pictures sit in the top row');
    const fit = await inPage(page, `const ref=b.documentPictures()[0].ref;b.input.cursor.getSelectedPictureRef=()=>ref;return 0;`);
    await button(page, '표 칸 안 그림을 칸 너비에').click(); await h.idle(page);
    const widths = await inPage(page, `delete b.input.cursor.getSelectedPictureRef;const ref=b.documentPictures()[0].ref,c=JSON.parse(d.getCellProperties(0,ref.ppi,ref.cellPath[0].controlIndex,0));return {pic:b.properties(ref).width,inner:c.width-c.paddingLeft-c.paddingRight};`);
    assert.equal(fit, 0); assert.equal(widths.pic, widths.inner - Math.round(3 * 7200 / 25.4), 'leaves 3mm');
    await inPage(page, `b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:arg.p,charOffset:0,parentParaIndex:arg.p,controlIndex:arg.ci,cellIndex:2,cellParaIndex:0,cellPath:[{controlIndex:arg.ci,cellIndex:2,cellParaIndex:0}]});`, grid[0]);
    await page.locator('[data-exam-ftab="table"]').click();
    await button(page, '아래에 줄 넣기').click(); await h.idle(page);
    assert.equal((await tables())[0].dims.rowCount, 3);

    // 6) 점검: 빈칸·번호 건너뜀을 찾고, 누르면 그 자리로 간다.
    await inPage(page, `reset('1. 발문 \\\\발문\\\\\\n3. 다음');`);
    await page.locator('[data-exam-fx="check"]').click(); await page.locator('.exam-checkpop').waitFor();
    const issues = await page.locator('.exam-checklist button').allTextContents();
    assert.ok(issues.some(s => s.includes('빈칸')), issues.join(' / ')); assert.ok(issues.some(s => s.includes('1번 다음에 3번')), issues.join(' / '));
    await page.locator('.exam-checklist button', { hasText: '건너뜁니다' }).click(); await h.idle(page);
    assert.equal(await inPage(page, `return b.input.getCursorPosition().paragraphIndex;`), 1);

    // 7) 되돌리기: 도구 줄 동작은 한 단계로 되돌아간다.
    await inPage(page, `reset('5. 하나\\n9. 둘');`);
    await page.locator('[data-exam-ftab="item"]').click(); await button(page, '문항 번호 1부터').click(); await h.idle(page);
    await page.locator('[data-exam-action="undo"]').click(); await h.idle(page);
    assert.deepEqual((await inPage(page, `return text();`)).map(s => s.slice(0, 2)), ['5.', '9.']);
    assert.equal(await page.locator('#exam-status').getAttribute('data-error'), 'false', await page.locator('#exam-status').textContent());
    assert.deepEqual(errors, []);
  });
});
