// 5E_hwp 도구 모드 3개·집중 도구 줄·기호 창·새 조판 기능(10-21). 실제 단추를 눌러 문서가 바뀌는지 본다.
const test = require('node:test'), assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');

// 문서 손잡이·스튜디오 입력·현재 문단 글자를 페이지 안에서 꺼내는 도우미.
const prelude = `const b=window.fiveEHwpPalette.native.bridge(),d=b.wasm.borrowDocumentHandle(),w=b.wasm;
const text=()=>[...Array(d.getParagraphCount(0)).keys()].map(p=>d.getTextRange(0,p,0,d.getParagraphLength(0,p)));
const reset=s=>{const top=JSON.parse(d.getPageControlLayout(0)).controls.filter(c=>!(c.cellPath||[]).length&&!Number.isInteger(c.cellIdx)&&['table','image','equation'].includes(c.type)).sort((a,b)=>b.paraIdx-a.paraIdx||(b.controlIdx??b.ci)-(a.controlIdx??a.ci));
  for(const c of top){if(c.type==='table')d.deleteTableControl(0,c.paraIdx,c.controlIdx??c.ci);else if(c.type==='equation')d.deleteEquationControl(0,c.paraIdx,c.controlIdx??c.ci);else d.deletePictureControl(0,c.paraIdx,c.controlIdx??c.ci);}
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
    await page.locator('[data-exam-ftab="para"]').click();
    await page.locator('[data-exam-fctl="spacing"]').selectOption('200');
    await inPage(page, `b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:1});`);
    await button(page, '문단 위 간격 2pt 늘리기').click(); await h.idle(page);
    const para = await inPage(page, `return w.getParaPropertiesAt(0,0);`);
    assert.equal(para.lineSpacing, 200); assert.equal(Math.round(para.spacingBefore * 75 / 100) * 100, 400, '2pt = 400 (엔진은 소수 한 자리로 돌려줌)');

    // 2-1) 더 보기: 리본 없이 닿는 기능 — 오른쪽 정렬.
    await page.locator('[data-exam-ftab="text"]').click();
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

    // 8) 학습지: 빈칸 표시 → 학생용 사본(지금 문서는 그대로) → 정답 모아 넣기, 시험지 머리, 정답표 칸, 문항 간격, 배점 합계 점검.
    await inPage(page, `reset('1. 식물은 광합성으로 포도당을 만든다. [3점]\\n2. 엽록체에서 일어난다. [4점]');`);
    await page.locator('[data-exam-ftab="sheet"]').click();
    for (const [para, from, to] of [[0, 7, 10], [1, 3, 6]]) {
      await inPage(page, `b.input.cursor.selectRange({sectionIndex:0,paragraphIndex:arg[0],charOffset:arg[1]},{sectionIndex:0,paragraphIndex:arg[0],charOffset:arg[2]});`, [para, from, to]);
      await button(page, '고른 낱말을 빈칸으로').click(); await h.idle(page);
    }
    const download = page.waitForEvent('download');
    await button(page, '빈칸을 「').click(); const file = await download;
    assert.match(file.suggestedFilename().normalize("NFC"), /학생용\.hwpx$/);
    const student = await inPage(page, `const {studentCopy}=await import('/js/rhwp-exam-worksheet.js');const D=d.constructor,x=new D(studentCopy(b).bytes);try{return [0,1].map(p=>x.getTextRange(0,p,0,x.getParagraphLength(0,p)));}finally{x.free();}`);
    assert.match(student[0], /^1\. 식물은 \(\u3000+\)으로/); assert.match(student[1], /^2\. \(\u3000+\)에서/);
    assert.deepEqual((await inPage(page, `return text();`)).slice(0, 2), ['1. 식물은 광합성으로 포도당을 만든다. [3점]', '2. 엽록체에서 일어난다. [4점]'], 'teacher copy keeps answers');
    await button(page, '빈칸 정답을').click(); await h.idle(page);
    assert.equal((await inPage(page, `return text();`)).at(-1), '[빈칸 정답] 1. 광합성   2. 엽록체');
    await page.locator('[data-exam-ftab="layout"]').click();
    await button(page, '문서 맨 앞에 제목').click();
    await page.locator('[data-exam-form="subject"]').fill('통합과학'); await page.locator('[data-exam-form="grade"]').fill('1');
    await page.locator('[data-exam-form-submit]').click(); await h.idle(page);
    assert.match((await inPage(page, `return text();`))[0], /— 통합과학$/);
    await button(page, '찾은 문항 번호로').click(); await h.idle(page);
    assert.equal((await tables()).length, 2, 'header table + answer grid');
    await button(page, '두 번째 문항부터').click(); await page.locator('[data-exam-spacing="14"]').click(); await h.idle(page);
    const second = await inPage(page, `for(let p=0;p<d.getParagraphCount(0);p++){const t=d.getTextRange(0,p,0,d.getParagraphLength(0,p));if(t.startsWith('2.'))return Math.round(w.getParaPropertiesAt(0,p).spacingBefore*75/100)*100;}`);
    assert.equal(second, 2800, '14pt');
    await page.locator('[data-exam-fx="check"]').click(); await page.locator('.exam-checkpop').waitFor();
    assert.ok((await page.locator('.exam-checklist button').allTextContents()).some(s => s.includes('배점 합계가 7점')));
    await page.keyboard.press('Escape');

    // 9) 왼쪽 문항 목록: 마지막 문항 위로·첫 문항 아래로(번호 다시 매김), 누르면 그 문항으로. 쪽 경계에서 나뉜 문항 점검.
    await inPage(page, `reset('1. 첫 문항\\n가나\\n2. 둘째 문항\\n다라\\n3. 셋째 문항');`);
    await page.locator('.exam-q').nth(2).waitFor();
    await page.locator('[data-exam-qmove="2:-1"]').click(); await h.idle(page);
    assert.deepEqual(await inPage(page, `return text();`), ['1. 첫 문항', '가나', '2. 셋째 문항', '3. 둘째 문항', '다라']);
    await page.locator('[data-exam-qmove="0:1"]').click(); await h.idle(page);
    assert.deepEqual(await inPage(page, `return text();`), ['1. 셋째 문항', '2. 첫 문항', '가나', '3. 둘째 문항', '다라']);
    await page.waitForFunction(() => document.querySelector('.exam-q')?.textContent.includes('셋째'));
    await page.locator('.exam-q').nth(2).click(); await h.idle(page);
    assert.equal(await inPage(page, `return b.input.getCursorPosition().paragraphIndex;`), 3);
    await inPage(page, `reset(['1. 짧은 문항', '2. 긴 문항', ...Array.from({length:70},(_,i)=>'줄 '+i)].join('\\n'));`);
    await page.locator('[data-exam-fx="check"]').click(); await page.locator('.exam-checkpop').waitFor();
    assert.ok((await page.locator('.exam-checklist button').allTextContents()).some(s => /2번 문항이 쪽.*경계에서 나뉩니다/.test(s)));
    await page.keyboard.press('Escape');

    // 10) 수업 자료 틀: 상자(제목 음영)·답란 3줄·평가 기준표를 커서 문단 뒤에 넣는다.
    await inPage(page, `reset('광합성 학습지');b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:3});`);
    await page.locator('[data-exam-ftab="sheet"]').click();
    await button(page, '개념 정리').click(); await page.locator('[data-exam-box="탐구 활동"]').click(); await h.idle(page);
    await inPage(page, `b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:0});`);
    await button(page, '서술형 답을').click(); await page.locator('[data-exam-lines="3"]').click(); await h.idle(page);
    await inPage(page, `b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:0});`);
    await button(page, '평가 요소').click(); await h.idle(page);
    const shapes = await tables();
    assert.deepEqual(shapes.map(t => [t.dims.rowCount, t.dims.colCount]), [[4, 4], [3, 1], [2, 1]]);
    const boxCell = await inPage(page, `const c=JSON.parse(d.getCellProperties(0,arg.p,arg.ci,0));return [c.fillType,c.fillColor,d.getTextInCell(0,arg.p,arg.ci,0,0,0,5)];`, shapes[2]);
    assert.deepEqual(boxCell, ['solid', '#eef6ee', '탐구 활동']);
    assert.equal((await inPage(page, `return text();`))[0], '광합성 학습지', 'the cursor paragraph is not split');

    // 11) 판짜기: 2단·B4, 가·나형(나형 사본은 문항째 섞이고 번호 다시 매김, 교사용 끝에 대응표).
    await inPage(page, `reset('1. 가\\n가가\\n2. 나\\n3. 다\\n다다\\n4. 라');`);
    await page.locator('[data-exam-ftab="layout"]').click();
    await button(page, '모든 쪽을 2단').click(); await h.idle(page);
    assert.equal((await inPage(page, `return JSON.parse(d.getColumnDef(0));`)).columnCount, 2);
    await button(page, '용지 크기').click(); await page.locator('[data-exam-paper="B4"]').click(); await h.idle(page);
    assert.equal((await inPage(page, `return JSON.parse(d.getPageDef(0));`)).width, Math.round(257 * 7200 / 25.4));
    const variantDownload = page.waitForEvent('download');
    await button(page, '문항 순서를 섞은').click(); await page.locator('[data-exam-variant="order"]').click(); const variantFile = await variantDownload; await h.idle(page);
    assert.match(variantFile.suggestedFilename().normalize('NFC'), /나형\.hwpx$/);
    const teacher = await inPage(page, `return text();`);
    assert.deepEqual(teacher.slice(0, 6), ['1. 가', '가가', '2. 나', '3. 다', '다다', '4. 라'], 'teacher order is unchanged');
    const mapping = /^\[나형 대응\] (.+)$/.exec(teacher.at(-1)); assert.ok(mapping, teacher.at(-1));
    const pairs = mapping[1].split(/\s+/).map(x => /^나(\d+)=가(\d+)$/.exec(x).slice(1).map(Number));
    assert.deepEqual(pairs.map(p => p[0]), [1, 2, 3, 4]); assert.deepEqual([...pairs.map(p => p[1])].sort(), [1, 2, 3, 4]);
    assert.ok(pairs.some(([v, o]) => v !== o), 'order actually changes');

    // 12) 정답지(빈칸 자리에 빨간 정답)·자주 쓰는 발문·표 머리 줄 음영.
    await inPage(page, `reset('1. 식물은 광합성으로 포도당을 만든다.');b.input.cursor.selectRange({sectionIndex:0,paragraphIndex:0,charOffset:7},{sectionIndex:0,paragraphIndex:0,charOffset:10});`);
    await page.locator('[data-exam-ftab="sheet"]').click();
    await button(page, '고른 낱말을 빈칸으로').click(); await h.idle(page);
    const keyDownload = page.waitForEvent('download'); await button(page, '빈칸 자리에 정답을').click(); await keyDownload;
    const key = await inPage(page, `const {answerKeyCopy}=await import('/js/rhwp-exam-worksheet.js');const D=d.constructor,x=new D(answerKeyCopy(b).bytes);try{return [x.getTextRange(0,0,0,x.getParagraphLength(0,0)),JSON.parse(x.getCharPropertiesAt(0,0,9)).textColor];}finally{x.free();}`);
    assert.deepEqual(key, ['1. 식물은 ( 광합성 )으로 포도당을 만든다.', '#d0021b']);
    await inPage(page, `reset('2. ');b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:3});`);
    await page.locator('[data-exam-ftab="item"]').click(); await button(page, '자주 쓰는 발문').click();
    await page.locator('[data-exam-stem="0"]').click(); await h.idle(page);
    assert.equal((await inPage(page, `return text();`))[0], '2. 이에 대한 설명으로 옳은 것만을 〈보기〉에서 있는 대로 고른 것은?');
    await inPage(page, `reset('');const r=JSON.parse(d.createTable(0,0,0,2,2));b.deps.eventBus.emit('document-changed');b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:r.paraIdx,charOffset:0,parentParaIndex:r.paraIdx,controlIndex:r.controlIdx,cellIndex:3,cellParaIndex:0,cellPath:[{controlIndex:r.controlIdx,cellIndex:3,cellParaIndex:0}]});window.__t=r;`);
    await page.locator('[data-exam-ftab="table"]').click(); await button(page, '커서가 있는 표의 첫 줄').click(); await h.idle(page);
    const fills = await inPage(page, `const r=window.__t;return [0,1,2,3].map(c=>JSON.parse(d.getCellProperties(0,r.paraIdx,r.controlIdx,c)).fillType);`);
    assert.deepEqual(fills, ['solid', 'solid', 'none', 'none']);

    // 13) 문항 복제·지우기(확인 창), 넓은 그림을 점검 창에서 한 번에 맞추기, 학습지 틀.
    await inPage(page, `reset('1. 가\\n가가\\n2. 나');`);
    await page.locator('[data-exam-qdup="0"]').waitFor(); await page.locator('[data-exam-qdup="0"]').click(); await h.idle(page);
    assert.deepEqual(await inPage(page, `return text();`), ['1. 가', '가가', '2. 가', '가가', '3. 나']);
    await page.waitForFunction(() => document.querySelectorAll('.exam-q').length === 3);
    await page.locator('[data-exam-qdel="1"]').click();
    await page.getByRole('button', { name: '지우기', exact: true }).click(); await h.idle(page);
    assert.deepEqual(await inPage(page, `return text();`), ['1. 가', '가가', '2. 나']);
    await inPage(page, `reset('');const N=await import('/js/hwp-palette/native.js');
      const cv=document.createElement('canvas');cv.width=800;cv.height=300;cv.getContext('2d').fillRect(0,0,800,300);
      const bytes=new Uint8Array(await (await new Promise(r=>cv.toBlob(r,'image/png'))).arrayBuffer());
      b.transaction('wide',()=>{N.insertValue(d,{sectionIndex:0,paragraphIndex:0,charOffset:0},[{image:'w'}],new Map([['w',{bytes,widthMm:120,heightMm:45,width:800,height:300,extension:'png',name:'w.png'}]]));return true;});
      const ref=b.documentPictures()[0].ref;b.setProperties(ref,{width:Math.round(250*7200/25.4),height:Math.round(94*7200/25.4)});b.deps.eventBus.emit('document-changed');`);
    await page.locator('[data-exam-fx="check"]').click(); await page.locator('[data-exam-fixwide]').click(); await h.idle(page);
    const fitted = await inPage(page, `const {columnWidth}=await import('/js/rhwp-exam-layout-tools.js');return [b.properties(b.documentPictures()[0].ref).width,columnWidth(d,0)];`);
    assert.ok(fitted[0] <= fitted[1], JSON.stringify(fitted));
    await inPage(page, `reset('');`);
    await page.locator('[data-exam-ftab="sheet"]').click(); await button(page, '제목·이름 칸과 상자').click(); await page.locator('[data-exam-frame="lesson"]').click(); await h.idle(page);
    const frame = await tables();
    assert.deepEqual(frame.map(t => [t.dims.rowCount, t.dims.colCount]), [[1, 4], [2, 1], [2, 1], [2, 1], [2, 1]]);

    // 14) 2단에서 단 경계에 걸린 문항을 점검 창에서 다음 단으로 넘긴다(빈 줄 없이, 글은 그대로).
    await inPage(page, `reset(['1. 짧은', ...Array.from({length:30},(_,i)=>'가 '+i), '2. 긴 문항', ...Array.from({length:30},(_,i)=>'나 '+i)].join('\\n'));d.setColumnDef(0,2,0,true,2268);
      for(let p=0;p<d.getParagraphCount(0);p++){d.applyParaFormat(0,p,JSON.stringify({lineSpacing:160,spacingBefore:0,spacingAfter:0}));d.applyCharFormat(0,p,0,d.getParagraphLength(0,p),JSON.stringify({fontSize:1000,bold:false,spacings:[0,0,0,0,0,0,0]}));}b.deps.eventBus.emit('document-changed');`);
    const beforeWhole = await inPage(page, `return text();`);
    await page.locator('[data-exam-fx="check"]').click(); await page.locator('[data-exam-keepwhole]').click(); await h.idle(page);
    assert.match(await page.locator('#exam-status').textContent(), /문항 1개를 다음 단/);
    assert.deepEqual(await inPage(page, `return text();`), beforeWhole, 'no text or empty line added');
    assert.deepEqual(await inPage(page, `const {splitQuestions}=await import('/js/rhwp-exam-layout-tools.js');return splitQuestions(d).map(x=>x.text);`), []);

    // 16) 단 채우기: 한 단의 문항 3개 사이에 남는 공간을 고르게 나누고(글은 그대로), 다시 눌러도 같은 간격.
    await page.locator('[data-exam-qmove]').first().waitFor();
    await inPage(page, `reset('1. 가\\n가가\\n2. 나\\n3. 다\\n다다');d.setColumnDef(0,2,0,true,2268);
      for(let p=0;p<d.getParagraphCount(0);p++){d.applyParaFormat(0,p,JSON.stringify({lineSpacing:160,spacingBefore:0,spacingAfter:0}));d.applyCharFormat(0,p,0,d.getParagraphLength(0,p),JSON.stringify({fontSize:1000,bold:false,spacings:[0,0,0,0,0,0,0]}));}b.deps.eventBus.emit('document-changed');`);
    const beforeFill = await inPage(page, `return text();`);
    const gaps = `const runs=JSON.parse(d.getPageTextLayout(0)).runs.filter(r=>r.secIdx===0),top=p=>Math.min(...runs.filter(r=>r.paraIdx===p).map(r=>r.y)),low=Math.max(...runs.map(r=>r.y+r.h)),info=JSON.parse(d.getPageInfo(0));
      return {sp:[2,3].map(p=>Math.round(w.getParaPropertiesAt(0,p).spacingBefore*75)),q2:top(2)-top(1),q3:top(3)-top(2),room:info.footerArea.y-low,pages:d.pageCount()};`;
    await page.locator('[data-exam-ftab="layout"]').click(); await button(page, '단마다 남는 빈 공간').click(); await h.idle(page);
    const filled = await inPage(page, gaps);
    assert.match(await page.locator('#exam-status').textContent(), /단 1곳/);
    assert.deepEqual(await inPage(page, `return text();`), beforeFill);
    assert.ok(filled.sp[0] > 0 && filled.sp[0] === filled.sp[1], JSON.stringify(filled));
    assert.ok(filled.q2 > 200 && filled.room > 150 && filled.room < filled.q2, JSON.stringify(filled));
    assert.equal(filled.pages, 1);
    await button(page, '단마다 남는 빈 공간').click(); await h.idle(page);
    assert.deepEqual((await inPage(page, gaps)).sp, filled.sp, 'same result when pressed again');
    // 18) 배점: 커서 문항의 발문 끝(「?」 문단)에 넣고, 다시 고르면 바꾸고(겹치지 않음), 합계를 알린다.
    await inPage(page, `reset('1. 그림은 실험이다.\\n이에 대한 설명으로 옳은 것은?\\n① ㄱ ② ㄴ\\n2. 다음 중 옳은 것은? [2점]');b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:2,charOffset:1});`);
    await page.locator('[data-exam-ftab="item"]').click();
    await button(page, '커서가 있는 문항의 배점').click(); await page.locator('[data-exam-score="3"]').click(); await h.idle(page);
    assert.deepEqual(await inPage(page, `return text();`), ['1. 그림은 실험이다.', '이에 대한 설명으로 옳은 것은? [3점]', '① ㄱ ② ㄴ', '2. 다음 중 옳은 것은? [2점]']);
    assert.match(await page.locator('#exam-status').textContent(), /1번 3점 — 배점 2곳 합계 5점/);
    await inPage(page, `b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:0});`);
    await button(page, '커서가 있는 문항의 배점').click(); await page.locator('[data-exam-score="2.5"]').click(); await h.idle(page);
    assert.equal((await inPage(page, `return text();`))[1], '이에 대한 설명으로 옳은 것은? [2.5점]');
    await inPage(page, `b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:3,charOffset:0});`);
    await button(page, '커서가 있는 문항의 배점').click(); await page.locator('[data-exam-score=""]').click(); await h.idle(page);
    assert.equal((await inPage(page, `return text();`))[3], '2. 다음 중 옳은 것은?');
    // 학교 시험 「(3점)」: 그 모양을 알아보고, 새로 넣을 때도 문서가 쓰는 둥근 괄호로.
    await inPage(page, `reset('1. 옳은 것은? (3점)\\n2. 다른 것은?');b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:1,charOffset:0});`);
    await button(page, '커서가 있는 문항의 배점').click(); await page.locator('[data-exam-score="4"]').click(); await h.idle(page);
    assert.deepEqual(await inPage(page, `return text();`), ['1. 옳은 것은? (3점)', '2. 다른 것은? (4점)']);
    assert.match(await page.locator('#exam-status').textContent(), /배점 2곳 합계 7점/);
    // 19) 묶음 문항 [1~2]: 머리·지문은 묶음 첫 문항에 붙고(앞 문항과 바꿔도 따라가지 않음), 묶음 문항은 ↑↓가 막히고, 번호를 다시 매기면 [a~b] 범위도 따라간다.
    await inPage(page, `reset('1. 첫 문항\\n[2~3] 다음 글을 읽고 물음에 답하시오.\\n지문\\n2. 둘째\\n3. 셋째\\n4. 넷째\\n5. 다섯째');`);
    await page.waitForFunction(() => document.querySelectorAll('.exam-q').length === 5 && document.querySelector('.exam-qgroup'));
    const blocks = await inPage(page, `const {questionBlocks}=await import('/js/rhwp-exam-layout-tools.js');return questionBlocks(d).map(q=>[q.number,q.start,q.head,q.end,!!q.group]);`);
    assert.deepEqual(blocks, [[1, 0, 0, 1, false], [2, 1, 3, 4, true], [3, 4, 4, 5, true], [4, 5, 5, 6, false], [5, 6, 6, 7, false]]);
    for (const [at, disabled] of [['0:1', true], ['1:-1', true], ['2:1', true], ['3:-1', true], ['3:1', false]]) assert.equal(await page.locator(`[data-exam-qmove="${at}"]`).isDisabled(), disabled, at);
    await page.locator('[data-exam-qdel="0"]').click(); await page.getByRole('button', { name: '지우기', exact: true }).click(); await h.idle(page);
    assert.deepEqual(await inPage(page, `return text();`), ['[1~2] 다음 글을 읽고 물음에 답하시오.', '지문', '1. 둘째', '2. 셋째', '3. 넷째', '4. 다섯째']);
    const variant = await inPage(page, `const W=await import('/js/rhwp-exam-worksheet.js');let k=0;const r=W.makeVariant(b,()=>(k++%2)?0:.99);const c=new d.constructor(r.bytes);try{c.convertToEditable?.();return [r.mapping.map(m=>m.original),[...Array(c.getParagraphCount(0)).keys()].map(p=>c.getTextRange(0,p,0,c.getParagraphLength(0,p)))];}finally{c.free();}`);
    assert.deepEqual(variant[0], [1, 2, 4, 3]);
    assert.deepEqual(variant[1], ['[1~2] 다음 글을 읽고 물음에 답하시오.', '지문', '1. 둘째', '2. 셋째', '3. 다섯째', '4. 넷째']);
    // 20) QR 코드: 주소를 쓰고 크기를 고르면 커서 문단 뒤에 테두리 없는 1×2 칸(왼쪽 QR 그림 25mm, 오른쪽 안내 글·주소). 같은 주소면 같은 그림.
    await inPage(page, `reset('학습지');b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:0});`);
    await page.locator('[data-exam-ftab="sheet"]').click(); await button(page, '영상·자료 주소를 QR 코드로').click();
    await page.locator('[data-exam-qr-size="25"]').click();
    assert.match(await page.locator('#exam-status').textContent(), /주소를 쓰세요/);
    await page.locator('[data-exam-qr="url"]').fill('https://youtu.be/5e-science'); await page.locator('[data-exam-qr="label"]').fill('실험 영상 보기');
    await page.locator('[data-exam-qr-size="25"]').click(); await h.idle(page);
    assert.match(await page.locator('#exam-status').textContent(), /QR 코드\(「실험 영상 보기」\)/);
    const qr = await tables();
    assert.equal(qr.length, 1); assert.deepEqual([qr[0].dims.rowCount, qr[0].dims.colCount], [1, 2]);
    const qrCell = await inPage(page, `const c=JSON.parse(d.getPageControlLayout(0)).controls,t=c.find(x=>x.type==='table'),img=c.find(x=>x.type==='image'&&x.cellPath?.length);
      const ci=t.controlIdx??t.ci;
      return {img:img&&[img.cellPath[0].cellIndex,Math.round(img.w/96*25.4)],border:JSON.parse(d.getCellProperties(0,t.paraIdx,ci,0)).borderLeft.type,
        text:[...Array(d.getCellParagraphCount(0,t.paraIdx,ci,1)).keys()].map(p=>d.getTextInCell(0,t.paraIdx,ci,1,p,0,d.getCellParagraphLength(0,t.paraIdx,ci,1,p)))};`);
    assert.deepEqual(qrCell.img, [0, 25]); assert.equal(qrCell.border, 0); assert.deepEqual(qrCell.text, ['실험 영상 보기', 'https://youtu.be/5e-science']);
    await inPage(page, `reset('1. 가\\n[정답] ③\\n2. 나\\n[정답] ①');b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:3,charOffset:0});`);
    await button(page, '영상·자료 주소를 QR 코드로').click(); await page.locator('[data-exam-qr-answers]').click(); await h.idle(page);
    assert.match(await page.locator('#exam-status').textContent(), /정답 2개를 담은 QR/);
    assert.ok((await inPage(page, `const t=JSON.parse(d.getPageControlLayout(0)).controls.find(c=>c.type==='table'&&!c.cellPath?.length);return [0,1].map(p=>d.getTextInCell(0,t.paraIdx,t.controlIdx,1,p,0,d.getCellParagraphLength(0,t.paraIdx,t.controlIdx,1,p)));`))[1] === '1-③ 2-①');
    // 21) 첨자 자동: 본문과 표 칸의 화학식·이온·단위에 첨자 모양만 입히고 글자는 그대로.
    await inPage(page, `reset('반응식 2H2 + O2 → 2H2O\\n이온 Fe3+ 와 SO42-');const r=JSON.parse(d.createTable(0,1,0,1,1));d.insertTextInCell(0,r.paraIdx,r.controlIdx,0,0,0,'가속도 2 m/s2');b.deps.eventBus.emit('document-changed');window.__t=r;`);
    const plain = await inPage(page, `return text();`);
    await page.locator('[data-exam-ftab="text"]').click(); await button(page, '문서 전체 화학식').click(); await h.idle(page);
    assert.match(await page.locator('#exam-status').textContent(), /첨자 7곳/);
    assert.deepEqual(await inPage(page, `return text();`), plain);
    const scripted = await inPage(page, `const at=(p,o)=>{const c=w.getCharPropertiesAt(0,p,o);return c.subscript?'_':c.superscript?'^':'.';};
      const ion=text().findIndex(t=>t.startsWith('이온'));return [[5,6,7,8,9].map(o=>at(0,o)).join(''),[3,4,5,6,7].map(o=>at(ion,o)).join('')];`);
    assert.deepEqual(scripted, ['._...', '..^^.']);
    // 22) 점검 「문항 글꼴 맞추기」: 다른 글꼴·크기로 붙여 온 문항을 대부분 문항에 맞추고, 일부러 작게 둔 줄의 크기는 그대로.
    await inPage(page, `reset('1. 가\\n2. 나\\n3. 다른 글꼴\\nㄱ. 작은 보기');for(let p=0;p<4;p++)d.applyCharFormat(0,p,0,d.getParagraphLength(0,p),JSON.stringify({fontFamily:'함초롬바탕',fontSize:1000}));
      d.applyCharFormat(0,2,0,d.getParagraphLength(0,2),JSON.stringify({fontFamily:'함초롬돋움',fontSize:1200}));d.applyCharFormat(0,3,0,d.getParagraphLength(0,3),JSON.stringify({fontFamily:'함초롬돋움',fontSize:900}));b.deps.eventBus.emit('document-changed');`);
    await page.locator('[data-exam-fx="check"]').click();
    assert.match(await page.locator('.exam-checklist').textContent(), /글꼴이 다릅니다/);
    await page.locator('[data-exam-fixfont]').click(); await h.idle(page);
    assert.match(await page.locator('#exam-status').textContent(), /문항 1개의 글꼴/);
    assert.deepEqual(await inPage(page, `return [2,3].map(p=>{const c=w.getCharPropertiesAt(0,p,1);return [c.fontFamily,c.fontSize];});`), [['함초롬바탕', 1000], ['함초롬바탕', 900]]);
    // 23) 학생용 사본은 교사용 줄([정답]·해설:·[빈칸 정답])을 문단째 빼고, 「정답은 …」 같은 본문은 그대로 둔다. 빈칸이 없어도 된다.
    await inPage(page, `reset('1. 문항\\n[정답] ③\\n해설: 설명\\n2. 문항\\n정답은 ③이다\\n【풀이】 끝');`);
    await page.locator('[data-exam-ftab="sheet"]').click();
    const studentDownload = page.waitForEvent('download'); await button(page, '빈칸을 「').click(); await studentDownload; await h.idle(page);
    assert.match(await page.locator('#exam-status').textContent(), /\[정답\]·\[해설\] 줄 3개를 뺀 학생용/);
    assert.deepEqual(await inPage(page, `const {studentCopy}=await import('/js/rhwp-exam-worksheet.js');const x=new d.constructor(studentCopy(b).bytes);try{return [...Array(x.getParagraphCount(0)).keys()].map(p=>x.getTextRange(0,p,0,x.getParagraphLength(0,p)));}finally{x.free();}`), ['1. 문항', '2. 문항', '정답은 ③이다']);
    assert.equal((await inPage(page, `return text();`)).length, 6, 'teacher document unchanged');
    // 24) 가·나형 「문항+선지 순서 섞기」: 한 줄에 하나씩인 선지만 문단째 섞고 ①부터 다시 붙이며, [정답]을 따라 고친다. 한 줄 선지는 그대로. 교사용 끝에 나형 정답.
    await inPage(page, `reset('1. 첫째\\n① 가\\n② 나\\n③ 다\\n④ 라\\n⑤ 마\\n[정답] ③\\n2. 둘째\\n① ㄱ ② ㄴ ③ ㄷ\\n[정답] ②');`);
    const shuffledChoices = await inPage(page, `const W=await import('/js/rhwp-exam-worksheet.js');const seq=[.1,.9,.3,.7,.5,.2,.8];let k=0;const r=W.makeVariant(b,()=>seq[k++%seq.length],{choices:true});
      const c=new d.constructor(r.bytes);try{c.convertToEditable?.();return {shuffled:r.shuffled,mapping:r.mapping,text:[...Array(c.getParagraphCount(0)).keys()].map(p=>c.getTextRange(0,p,0,c.getParagraphLength(0,p)))};}finally{c.free();}`);
    assert.equal(shuffledChoices.shuffled, 1);
    const vt = shuffledChoices.text, q2 = vt.indexOf('2. 첫째');
    assert.deepEqual(vt.slice(0, 3), ['1. 둘째', '① ㄱ ② ㄴ ③ ㄷ', '[정답] ②']);
    const choiceLines = vt.slice(q2 + 1, q2 + 6);
    assert.deepEqual(choiceLines.map(t => t[0]), ['①', '②', '③', '④', '⑤']);
    assert.deepEqual(choiceLines.map(t => t.slice(2)).sort(), ['가', '나', '다', '라', '마']);
    assert.notDeepEqual(choiceLines.map(t => t.slice(2)), ['가', '나', '다', '라', '마']);
    const newAnswer = vt[q2 + 6].slice(-1);
    assert.equal(choiceLines.find(t => t[0] === newAnswer).slice(2), '다', 'answer follows the moved choice');
    assert.deepEqual(shuffledChoices.mapping, [{ variant: 1, original: 2, answer: '②' }, { variant: 2, original: 1, answer: newAnswer }]);
    await page.locator('[data-exam-ftab="layout"]').click();
    const bothDownload = page.waitForEvent('download'); await button(page, '문항 순서를 섞은').click(); await page.locator('[data-exam-variant="choices"]').click(); await bothDownload; await h.idle(page);
    assert.match(await page.locator('#exam-status').textContent(), /선지도 섞은 문항 1개/);
    assert.match((await inPage(page, `return text();`)).at(-1), /^\[나형 정답\] 1-② {2}2-[①-⑤]$/);
    // 25) 정답표 칸은 문항 안 「[정답] ③」으로 정답 줄을 채우고, 학생용 사본은 그 정답표와 [정답] 줄을 모두 뺀다.
    await inPage(page, `reset('1. 가\\n[정답] ③\\n2. 나\\n정답: ①');`);
    await button(page, '찾은 문항 번호로').click(); await h.idle(page);
    const filledGrid = await inPage(page, `const t=JSON.parse(d.getPageControlLayout(0)).controls.find(c=>c.type==='table'&&!c.cellPath?.length),ci=t.controlIdx??t.ci;
      return [0,1,10,11,12].map(c=>d.getTextInCell(0,t.paraIdx,ci,c,0,0,d.getCellParagraphLength(0,t.paraIdx,ci,c,0)));`);
    assert.deepEqual(filledGrid, ['1', '2', '③', '①', '']);
    assert.deepEqual(await inPage(page, `const {studentCopy}=await import('/js/rhwp-exam-worksheet.js');const x=new d.constructor(studentCopy(b).bytes);try{return [[...Array(x.getParagraphCount(0)).keys()].map(p=>x.getTextRange(0,p,0,x.getParagraphLength(0,p))),JSON.parse(x.getPageControlLayout(0)).controls.filter(c=>c.type==='table').length];}finally{x.free();}`), [['1. 가', '2. 나'], 0]);
    // 26) 굵은 글씨 → 빈칸: 굵은 낱말만(앞 띄어쓰기 빼고) 빈칸 표시, 줄 전체가 굵은 제목은 그대로.
    await inPage(page, `reset('개념 정리\\n물은 수소와 산소로 이루어진 화합물이다.');for(let p=0;p<2;p++)d.applyCharFormat(0,p,0,d.getParagraphLength(0,p),JSON.stringify({bold:false,shadeColor:'#ffffff',underline:false}));
      d.applyCharFormat(0,0,0,d.getParagraphLength(0,0),JSON.stringify({bold:true}));d.applyCharFormat(0,1,3,5,JSON.stringify({bold:true}));d.applyCharFormat(0,1,6,9,JSON.stringify({bold:true}));b.deps.eventBus.emit('document-changed');`);
    await page.locator('[data-exam-ftab="sheet"]').click(); await button(page, '문서의 굵은 낱말을').click(); await h.idle(page);
    assert.match(await page.locator('#exam-status').textContent(), /굵은 낱말 2개/);
    assert.deepEqual(await inPage(page, `const {collectBlanks}=await import('/js/rhwp-exam-worksheet.js');return collectBlanks(d).map(x=>[x.where.para,x.start,x.text]);`), [[1, 3, '수소'], [1, 7, '산소']]);
    const labeledDownload = page.waitForEvent('download');
    await button(page, '자주 쓰지 않는 기능').click(); await page.locator('.exam-morelist button', { hasText: '학생용(㉠㉡ 빈칸)' }).click(); await labeledDownload; await h.idle(page);
    assert.match(await page.locator('#exam-status').textContent(), /빈칸 정답: ㉠ 수소, ㉡ 산소/);
    assert.match(await inPage(page, `const {studentCopy}=await import('/js/rhwp-exam-worksheet.js');const x=new d.constructor(studentCopy(b,{labeled:true}).bytes);try{return x.getTextRange(0,1,0,x.getParagraphLength(0,1));}finally{x.free();}`), /^물은 \(　㉠　+\)와 \(　㉡　+\)로 이루어진/);
    // 27) ㄱㄴㄷ 조합 선지: 발문 줄 뒤에 다섯 조합을 5열 선지 표로.
    await inPage(page, `reset('1. 옳은 것만을 〈보기〉에서 있는 대로 고른 것은?');b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:3});`);
    await page.locator('[data-exam-ftab="item"]').click(); await button(page, '〈보기〉 ㄱㄴㄷ').click(); await page.locator('[data-exam-combo="0"]').click(); await h.idle(page);
    const combo = await inPage(page, `const t=JSON.parse(d.getPageControlLayout(0)).controls.find(c=>c.type==='table'&&!c.cellPath?.length),ci=t.controlIdx??t.ci,n=JSON.parse(d.getTableDimensions(0,t.paraIdx,ci)).cellCount;
      return [text()[0],[...Array(n).keys()].map(c=>d.getTextInCell(0,t.paraIdx,ci,c,0,0,d.getCellParagraphLength(0,t.paraIdx,ci,c,0)))];`);
    assert.deepEqual(combo, ['1. 옳은 것만을 〈보기〉에서 있는 대로 고른 것은?', ['① ㄱ', '② ㄷ', '③ ㄱ, ㄴ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ']]);
    // 28) 실험 보고서 틀: 제목·이름 칸 + 탐구 주제·가설·준비물·실험 과정·결과·결론 상자.
    await inPage(page, `reset('');`);
    await page.locator('[data-exam-ftab="sheet"]').click(); await button(page, '제목·이름 칸과 상자').click(); await page.locator('[data-exam-frame="lab"]').click(); await h.idle(page);
    assert.match(await page.locator('#exam-status').textContent(), /실험 보고서 틀\(상자 6개\)/);
    assert.equal((await tables()).length, 7);
    // 29) 이원목적분류표: 문항 번호·배점·정답을 채운 새 한글 파일(머리 줄·합계 줄), 지금 문서는 그대로.
    await inPage(page, `reset('1. 가는? [2점]\\n[정답] ③\\n[성취기준] [10통과1-01]\\n[난이도] 중\\n2. 나는? [3점]\\n3. 다는?\\n정답: ⑤\\n[출처] 2023 모의');`);
    await page.locator('[data-exam-ftab="layout"]').click();
    const bpDownload = page.waitForEvent('download'); await button(page, '이원목적분류표:').click(); const bpFile = await bpDownload; await h.idle(page);
    assert.match(bpFile.suggestedFilename().normalize('NFC'), /이원목적분류표\.hwpx$/);
    assert.match(await page.locator('#exam-status').textContent(), /문항 3개\(배점 합계 5점\)/);
    const bp = await inPage(page, `const {blueprintCopy}=await import('/js/rhwp-exam-worksheet.js');const x=new d.constructor(blueprintCopy(b,'1학기 중간').bytes);try{x.convertToEditable?.();
      const t=JSON.parse(x.getPageControlLayout(0)).controls.find(c=>c.type==='table'&&!c.cellPath?.length),ci=t.controlIdx??t.ci,cell=c=>x.getTextInCell(0,t.paraIdx,ci,c,0,0,x.getCellParagraphLength(0,t.paraIdx,ci,c,0));
      return [x.getTextRange(0,0,0,x.getParagraphLength(0,0)),JSON.parse(x.getTableDimensions(0,t.paraIdx,ci)),[...Array(35).keys()].map(cell),[0,2].map(c=>JSON.parse(x.getCellProperties(0,t.paraIdx,ci,c)).width)];}finally{x.free();}`);
    assert.equal(bp[0], '1학기 중간 이원목적분류표');
    assert.deepEqual([bp[1].rowCount, bp[1].colCount], [5, 7]);
    assert.deepEqual(bp[2], ['문항', '내용 영역', '성취기준', '난이도', '배점', '정답', '비고', '1', '', '[10통과1-01]', '중', '2', '③', '', '2', '', '', '', '3', '', '', '3', '', '', '', '', '⑤', '', '합계', '', '', '', '5', '', '']);
    assert.ok(bp[3][1] > bp[3][0] * 3, 'standard column is wide');
    assert.equal((await inPage(page, `return text();`)).length, 8);
    assert.deepEqual(await inPage(page, `const {studentCopy}=await import('/js/rhwp-exam-worksheet.js');const x=new d.constructor(studentCopy(b).bytes);try{return [...Array(x.getParagraphCount(0)).keys()].map(p=>x.getTextRange(0,p,0,x.getParagraphLength(0,p)));}finally{x.free();}`), ['1. 가는? [2점]', '2. 나는? [3점]', '3. 다는?']);
    // 30) 서술형: 「[서술형 3]」「서술형 5.」를 따로 문항으로 보고(앞 선택형에 붙지 않음), 번호를 따로 매기고, 선택형과는 순서를 바꾸지 않는다.
    await inPage(page, `reset('1. 가\\n2. 나\\n[서술형 3] 서술 하나\\n답란\\n서술형 5. 서술 둘');`);
    await page.waitForFunction(() => document.querySelectorAll('.exam-q b')[3]?.textContent === '서술형 5', null, { timeout: 5000 }).catch(() => {});
    assert.deepEqual(await page.locator('.exam-q b').allTextContents(), ['1.', '2.', '서술형 3', '서술형 5']);
    assert.equal(await page.locator('[data-exam-qmove="1:1"]').isDisabled(), true);
    assert.equal(await page.locator('[data-exam-qmove="2:1"]').isDisabled(), false);
    await page.locator('[data-exam-ftab="item"]').click(); await button(page, '문항 번호 1부터').click(); await h.idle(page);
    assert.deepEqual(await inPage(page, `return text();`), ['1. 가', '2. 나', '[서술형 1] 서술 하나', '답란', '서술형 2. 서술 둘']);
    await page.waitForFunction(() => document.querySelectorAll('.exam-q b')[2]?.textContent === '서술형 1');
    await page.locator('[data-exam-qmove="2:1"]').click(); await h.idle(page);
    assert.deepEqual(await inPage(page, `return text();`), ['1. 가', '2. 나', '서술형 1. 서술 둘', '[서술형 2] 서술 하나', '답란']);
    // 31) 「유의 사항」 상자는 시험 유의 사항 네 줄을 미리 채운다.
    await inPage(page, `reset('제목');b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:0});`);
    await page.locator('[data-exam-ftab="sheet"]').click(); await button(page, '개념 정리·탐구 활동').click(); await page.locator('[data-exam-box="유의 사항"]').click(); await h.idle(page);
    assert.deepEqual(await inPage(page, `const t=JSON.parse(d.getPageControlLayout(0)).controls.find(c=>c.type==='table'&&!c.cellPath?.length),ci=t.controlIdx??t.ci;
      return [0,1].map(c=>[...Array(d.getCellParagraphCount(0,t.paraIdx,ci,c)).keys()].map(p=>d.getTextInCell(0,t.paraIdx,ci,c,p,0,d.getCellParagraphLength(0,t.paraIdx,ci,c,p)).slice(0,6)));`), [['유의 사항'], ['1. 답안지', '2. 선택형', '3. 서술형', '4. 문항에']]);
    // 32) 점검: 배점 빠진 문항, 같은 정답 세 번 연속, 정답 분포 치우침.
    await inPage(page, `reset(['1. 가 [2점]','[정답] ③','2. 나 [2점]','[정답] ③','3. 다 [2점]','[정답] ③','4. 라','[정답] ③','5. 마 [2점]','[정답] ①','6. 바 [2점]','[정답] ③'].join('\\n'));`);
    await page.locator('[data-exam-fx="check"]').click();
    const checks = await page.locator('.exam-checklist li').allTextContents();
    assert.ok(checks.includes('4번 문항에 배점(n점)이 없습니다.'), checks.join(' / '));
    assert.equal(await page.locator('.exam-check-summary').textContent(), '문항 6 · 1쪽 · 배점 10점 · 정답 ①1 ②0 ③5 ④0 ⑤0');
    assert.ok(checks.includes('같은 정답 ③이 1~4번에 잇달아 나옵니다.'), checks.join(' / '));
    assert.ok(checks.some(t => t.startsWith('정답 분포가 고르지 않습니다(①1 ②0 ③5 ④0 ⑤0)')), checks.join(' / '));
    await page.keyboard.press('Escape');
    // 33) 정답 넣기: 커서 문항 끝에 「[정답] ③」, 다시 고르면 바꾸고, 지우기로 뺀다. 목록에 정답이 보인다.
    await inPage(page, `reset('1. 가\\n① 가 ② 나\\n2. 나');b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:1,charOffset:0});`);
    await page.locator('[data-exam-ftab="item"]').click();
    await button(page, '커서가 있는 문항 끝에 「[정답]').click(); await page.locator('[data-exam-answer="③"]').click(); await h.idle(page);
    assert.deepEqual(await inPage(page, `return text();`), ['1. 가', '① 가 ② 나', '[정답] ③', '2. 나']);
    await page.waitForFunction(() => document.querySelector('.exam-qans')?.textContent === '③');
    await inPage(page, `b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:0});`);
    await button(page, '커서가 있는 문항 끝에 「[정답]').click(); await page.locator('[data-exam-answer="⑤"]').click(); await h.idle(page);
    assert.deepEqual(await inPage(page, `return text();`), ['1. 가', '① 가 ② 나', '[정답] ⑤', '2. 나']);
    await inPage(page, `b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:3,charOffset:0});`);
    await button(page, '커서가 있는 문항 끝에 「[정답]').click(); await page.locator('[data-exam-answer="①"]').click(); await h.idle(page);
    assert.deepEqual(await inPage(page, `return text();`), ['1. 가', '① 가 ② 나', '[정답] ⑤', '2. 나', '[정답] ①']);
    await inPage(page, `b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:0});`);
    await button(page, '커서가 있는 문항 끝에 「[정답]').click(); await page.locator('[data-exam-answer=""]').click(); await h.idle(page);
    assert.deepEqual(await inPage(page, `return text();`), ['1. 가', '① 가 ② 나', '2. 나', '[정답] ①']);
    // 34) 선지 자동(1단 문서): 짧으면 5열, 중간이면 3열, 길면 1열. 2단이면 같은 선지도 칸이 좁아 더 적은 열이 된다.
    await page.locator('[data-exam-ftab="item"]').click();
    for (const [choices, want] of [['① ㄱ ② ㄴ ③ ㄷ ④ ㄹ ⑤ ㅁ', 5], ['① 산소의 양이 늘어난다 ② 질소의 양이 줄어든다 ③ 변화가 없다 ④ 모두 늘어난다 ⑤ 모두 줄어든다', 3], ['① 물체에 작용하는 알짜힘의 크기는 시간에 따라 증가한다 ② 나 ③ 다 ④ 라 ⑤ 마', 1]]) {
      await inPage(page, `reset('1. 발문\\n'+arg);d.setColumnDef(0,1,0,true,0);b.deps.eventBus.emit('document-changed');b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:1,charOffset:0});`, choices);
      await button(page, '선지 길이를 보고').click(); await h.idle(page);
      assert.match(await page.locator('#exam-status').textContent(), new RegExp(`선지를 ${want}열로`), choices);
    }
    // 더 보기의 팔레트 도구(마크다운 → 문항)도 오류 없이 연다.
    await page.locator('.exam-fgroup [data-exam-fi]').last().click();
    await page.locator('.exam-morelist button', { hasText: '마크다운 → 문항' }).click(); await h.idle(page);
    assert.equal(await page.locator('#exam-status').getAttribute('data-error'), 'false', await page.locator('#exam-status').textContent());
    // 35) 정답·해설지: 「번호. 정답」과 [해설]·풀이: 줄을 모은 새 한글 파일. 서술형은 이름만.
    await inPage(page, `reset('1. 가\\n[정답] ③\\n[해설] 셋째가 맞다.\\n2. 나\\n정답: ①\\n풀이: 첫째.\\n[서술형 1] 쓰시오');`);
    await page.locator('[data-exam-ftab="layout"]').click();
    const exDownload = page.waitForEvent('download'); await button(page, '문항마다 「번호. 정답」').click(); const exFile = await exDownload; await h.idle(page);
    assert.match(exFile.suggestedFilename().normalize('NFC'), /정답과해설\.hwpx$/);
    assert.match(await page.locator('#exam-status').textContent(), /문항 3개\(해설 2개\)/);
    assert.deepEqual(await inPage(page, `const {explanationCopy}=await import('/js/rhwp-exam-worksheet.js');const x=new d.constructor(explanationCopy(b,'중간').bytes);try{x.convertToEditable?.();return [...Array(x.getParagraphCount(0)).keys()].map(p=>x.getTextRange(0,p,0,x.getParagraphLength(0,p)));}finally{x.free();}`),
      ['중간 정답과 해설', '1. ③', '셋째가 맞다.', '2. ①', '첫째.', '서술형 1']);
    // 36) 해설 줄: 커서 문항 끝에 「[해설] 」을 만들고 커서를 그 끝에 둔다(이미 있으면 그 줄로).
    await inPage(page, `reset('1. 가\\n[정답] ③\\n2. 나');b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:0});`);
    await page.locator('[data-exam-ftab="item"]').click(); await button(page, '커서 문항 끝에 「[해설]').click(); await h.idle(page);
    await page.keyboard.type('셋째'); await h.idle(page);
    assert.deepEqual(await inPage(page, `return text();`), ['1. 가', '[정답] ③', '[해설] 셋째', '2. 나']);
    await inPage(page, `b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:0});`);
    await button(page, '커서 문항 끝에 「[해설]').click(); await h.idle(page);
    assert.equal((await inPage(page, `return text();`)).length, 4, 'no second line');
    assert.deepEqual(await inPage(page, `const p=b.input.cursor.getPosition();return [p.paragraphIndex,p.charOffset];`), [2, 7]);
    // 37) 선지 섞기 — 5열 선지 표: 칸 글을 섞고 ①부터 다시, [정답]을 따라 고침. ㄱㄴㄷ 조합 표는 그대로.
    const tableVariant = await inPage(page, `reset('1. 첫째\\n① 가 ② 나 ③ 다 ④ 라 ⑤ 마\\n[정답] ②\\n2. 둘째\\n① ㄱ ② ㄷ ③ ㄱ, ㄴ ④ ㄴ, ㄷ ⑤ ㄱ, ㄴ, ㄷ');d.setColumnDef(0,1,0,true,0);
      for(let p=0;p<d.getParagraphCount(0);p++)d.applyCharFormat(0,p,0,d.getParagraphLength(0,p),JSON.stringify({bold:false,textColor:'#000000',subscript:false,superscript:false}));
      const L=await import('/js/rhwp-exam-layout-tools.js'),W=await import('/js/rhwp-exam-worksheet.js');
      b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:4,charOffset:0});L.relayoutChoices(b,5);
      b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:1,charOffset:0});L.relayoutChoices(b,5);
      const seq=[.1,.9,.3,.7,.5,.2,.8,.4];let k=0;const r=W.makeVariant(b,()=>seq[k++%seq.length],{choices:true});
      const c=new d.constructor(r.bytes);try{c.convertToEditable?.();
        const tables=JSON.parse(c.getPageControlLayout(0)).controls.filter(x=>x.type==='table'&&!x.cellPath?.length).map(t=>{const ci=t.controlIdx??t.ci;return [t.paraIdx,[0,1,2,3,4].map(cell=>c.getTextInCell(0,t.paraIdx,ci,cell,0,0,c.getCellParagraphLength(0,t.paraIdx,ci,cell,0)))];});
        return {shuffled:r.shuffled,mapping:r.mapping,text:[...Array(c.getParagraphCount(0)).keys()].map(p=>c.getTextRange(0,p,0,c.getParagraphLength(0,p))),tables};}finally{c.free();}`);
    assert.equal(tableVariant.shuffled, 1, JSON.stringify(tableVariant));
    const [combo5, plain5] = tableVariant.tables.map(t => t[1]).sort((a, b) => (a[0].includes('ㄱ') ? -1 : 1));
    assert.deepEqual(combo5, ['① ㄱ', '② ㄷ', '③ ㄱ, ㄴ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ']);
    assert.deepEqual(plain5.map(t => t[0]), ['①', '②', '③', '④', '⑤']);
    assert.notDeepEqual(plain5.map(t => t.slice(2)), ['가', '나', '다', '라', '마']);
    assert.deepEqual(plain5.map(t => t.slice(2)).sort(), ['가', '나', '다', '라', '마']);
    const tableAnswer = tableVariant.mapping.find(m => m.original === 1).answer;
    assert.equal(plain5.find(t => t[0] === tableAnswer).slice(2), '나', JSON.stringify(tableVariant));
    // 38) 만드는 순서: 펼쳐서 단계를 누르면 그 묶음이 열리고 해당 단추가 밝혀진다. 학습지 순서로 바꿀 수 있다.
    await page.locator('.exam-guide summary').click();
    await page.locator('[data-exam-guide="2"]').click();
    assert.equal(await page.locator('[data-exam-ftab="item"]').getAttribute('aria-selected'), 'true');
    assert.equal(await button(page, '커서가 있는 문항 끝에 「[정답]').evaluate(el => el.classList.contains('is-hint')), true);
    await page.locator('[data-exam-guide-kind="sheet"]').click(); await page.locator('[data-exam-guide="2"]').click();
    assert.equal(await page.locator('[data-exam-ftab="sheet"]').getAttribute('aria-selected'), 'true');
    assert.equal(await button(page, '문서의 굵은 낱말을').evaluate(el => el.classList.contains('is-hint')), true);
    // 39) 점검 「수식 크기 맞추기」: 본문 수식은 그 문단 글자 크기, 표 칸 수식은 본문 크기로.
    await inPage(page, `reset('1. 식은');for(let p=0;p<d.getParagraphCount(0);p++)d.applyCharFormat(0,p,0,d.getParagraphLength(0,p),JSON.stringify({fontSize:1000}));
      d.insertEquation(0,0,d.getParagraphLength(0,0),'a over b',1600,0);const N=await import('/js/hwp-palette/native.js');
      d.splitParagraph(0,0,d.getParagraphLength(0,0));const t=JSON.parse(d.createTable(0,1,0,1,1));
      N.insertValue(d,{sectionIndex:0,paragraphIndex:t.paraIdx,charOffset:0,parentParaIndex:t.paraIdx,controlIndex:t.controlIdx,cellIndex:0,cellParaIndex:0,cellPath:[{controlIndex:t.controlIdx,cellIndex:0,cellParaIndex:0}]},[{formula:'x^2'}],new Map());
      const ce=JSON.parse(d.getPageControlLayout(0)).controls.find(c=>c.type==='equation'&&Number.isInteger(c.cellIdx));d.setEquationProperties(0,ce.paraIdx,ce.controlIdx,ce.cellIdx,ce.cellParaIdx,JSON.stringify({fontSize:1800}));b.deps.eventBus.emit('document-changed');`);
    const eqSizes = `const {equationSizeIssues}=await import('/js/rhwp-exam-worksheet.js');return JSON.parse(d.getPageControlLayout(0)).controls.filter(c=>c.type==='equation').map(c=>JSON.parse(d.getEquationProperties(0,c.paraIdx,c.controlIdx,Number.isInteger(c.cellIdx)?c.cellIdx:-1,Number.isInteger(c.cellIdx)?c.cellParaIdx:-1)).fontSize);`;
    const eqBefore = await inPage(page, eqSizes);
    assert.ok(eqBefore.length === 2 && eqBefore.every(s => s !== 1000), JSON.stringify(eqBefore));
    await page.locator('[data-exam-fx="check"]').click();
    assert.match(await page.locator('.exam-checklist').textContent(), /수식 2개의 크기가/);
    await page.locator('[data-exam-fixeq]').click(); await h.idle(page);
    assert.match(await page.locator('#exam-status').textContent(), /수식 2개의 크기를/);
    assert.deepEqual(await inPage(page, eqSizes), [1000, 1000]);
    // 40) 점검 「숫자·단위 띄어 쓰기」: 본문·표 칸의 10m → 10 m, 오비탈 2s는 그대로.
    await inPage(page, `reset('1. 높이 10m에서 2kg 물체, 2s 오비탈');const t=JSON.parse(d.createTable(0,0,0,1,1));d.insertTextInCell(0,t.paraIdx,t.controlIdx,0,0,0,'질량 5g');b.deps.eventBus.emit('document-changed');window.__u=t;`);
    await page.locator('[data-exam-fx="check"]').click();
    assert.match(await page.locator('.exam-checklist').textContent(), /띄어쓰기가 빠진 곳이 3곳/);
    await page.locator('[data-exam-fixunit]').click(); await h.idle(page);
    assert.match(await page.locator('#exam-status').textContent(), /3곳을 띄어 썼습니다/);
    assert.ok((await inPage(page, `return text();`)).includes('1. 높이 10 m에서 2 kg 물체, 2s 오비탈'));
    assert.equal(await inPage(page, `const t=window.__u;return d.getTextInCell(0,t.paraIdx,t.controlIdx,0,0,0,d.getCellParagraphLength(0,t.paraIdx,t.controlIdx,0,0));`), '질량 5 g');
    // 41) 점검: 선지 번호가 겹치거나 빠진 문항(본문 줄·선지 표), [정답] 줄은 세지 않음.
    await inPage(page, `reset('1. 가\\n① 가 ② 나 ③ 다 ③ 라 ⑤ 마\\n2. 나\\n① 가 ② 나 ③ 다 ④ 라 ⑤ 마\\n[정답] ②\\n3. 다\\n① 가 ② 나 ③ 다 ④ 라 ⑤ 마');const L=await import('/js/rhwp-exam-layout-tools.js');
      b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:6,charOffset:0});L.relayoutChoices(b,5);
      const t=JSON.parse(d.getPageControlLayout(0)).controls.find(c=>c.type==='table');d.deleteTextInCell(0,t.paraIdx,t.controlIdx,3,0,0,1);b.deps.eventBus.emit('document-changed');`);
    await page.locator('[data-exam-fx="check"]').click();
    const choiceChecks = (await page.locator('.exam-checklist li').allTextContents()).filter(t => t.includes('선지 번호'));
    assert.deepEqual(choiceChecks, ['1번 선지 번호가 차례대로가 아닙니다(①②③③⑤).', '3번 선지 번호가 차례대로가 아닙니다(①②③⑤).']);
    await page.keyboard.press('Escape');
    // 42) 학생용 사본의 판 다시 맞추기: 교사용은 2번이 2단 맨 위에서 시작하지만, [해설] 두 줄이 빠지면 2번이 단 경계에 걸린다 → 학생용에서 다음 단으로 넘긴다.
    const relay = await inPage(page, `const fmt=()=>{for(let p=0;p<d.getParagraphCount(0);p++){d.applyParaFormat(0,p,JSON.stringify({lineSpacing:160,spacingBefore:0,spacingAfter:0}));d.applyCharFormat(0,p,0,d.getParagraphLength(0,p),JSON.stringify({fontSize:1000,bold:false,textColor:'#000000',spacings:[0,0,0,0,0,0,0]}));}};
      reset(Array.from({length:120},(_,i)=>'가 '+i).join('\\n'));d.setColumnDef(0,2,0,true,2268);fmt();
      const runs=JSON.parse(d.getPageTextLayout(0)).runs.filter(r=>!r.cellPath?.length),left=Math.min(...runs.map(r=>r.x)),L=new Set(runs.filter(r=>r.x<left+50).map(r=>r.paraIdx)).size;
      reset(['1. 첫째',...Array.from({length:L-3},(_,i)=>'가 '+i),'[해설] 하나','[해설] 둘','2. 둘째','나 1','나 2'].join('\\n'));d.setColumnDef(0,2,0,true,2268);fmt();b.deps.eventBus.emit('document-changed');
      const W=await import('/js/rhwp-exam-worksheet.js'),T=await import('/js/rhwp-exam-layout-tools.js');const before=T.splitQuestions(d).length;
      const r=W.studentCopy(b),x=new d.constructor(r.bytes);try{x.convertToEditable?.();return {L,before,relaid:r.relaid,after:T.splitQuestions(x).length};}finally{x.free();}`);
    assert.ok(relay.L > 10, JSON.stringify(relay));
    assert.deepEqual([relay.before, relay.relaid, relay.after], [0, 1, 0], JSON.stringify(relay));
    // 43) 점검 「부정 표현에 밑줄」: 「?」로 끝나는 발문의 않은·아닌 것에 밑줄, 선지·지문은 그대로.
    await inPage(page, `reset('1. 이에 대한 설명으로 옳지 않은 것은? [2점]\\n① 변하지 않은 것\\n2. 산이 아닌 것은?\\n3. 옳은 것은?');for(let p=0;p<d.getParagraphCount(0);p++)d.applyCharFormat(0,p,0,d.getParagraphLength(0,p),JSON.stringify({underline:false}));b.deps.eventBus.emit('document-changed');`);
    await page.locator('[data-exam-fx="check"]').click();
    assert.equal((await page.locator('.exam-checklist li').allTextContents()).filter(t => t.includes('부정 표현')).length, 2);
    await page.locator('[data-exam-fixneg]').click(); await h.idle(page);
    assert.match(await page.locator('#exam-status').textContent(), /부정 표현 2곳에 밑줄/);
    assert.deepEqual(await inPage(page, `const u=(p,o)=>w.getCharPropertiesAt(0,p,o).underline?'_':'.';return [[16,17,18,19].map(o=>u(0,o)).join(''),[5,6].map(o=>u(1,o)).join(''),[5,6,7,8].map(o=>u(2,o)).join('')];`), ['.__.', '..', '.__.']);
    // 44) 점검 〈보기〉: 항목 차례(ㄱ ㄷ ㄷ), 선지에 〈보기〉에 없는 ㄹ. 표 칸 안 〈보기〉도 본다.
    await inPage(page, `reset('1. 옳은 것만을 〈보기〉에서 있는 대로 고른 것은?\\n① ㄱ ② ㄷ ③ ㄱ, ㄴ ④ ㄴ, ㄹ ⑤ ㄱ, ㄴ, ㄷ');const t=JSON.parse(d.createTable(0,0,0,1,1));
      d.insertTextInCell(0,t.paraIdx,t.controlIdx,0,0,0,'ㄱ. 첫째');d.splitParagraphInCell?d.splitParagraphInCell(0,t.paraIdx,t.controlIdx,0,0,d.getCellParagraphLength(0,t.paraIdx,t.controlIdx,0,0)):0;
      b.deps.eventBus.emit('document-changed');return d.getCellParagraphCount(0,t.paraIdx,t.controlIdx,0);`);
    await page.locator('[data-exam-fx="check"]').click();
    const bogi = (await page.locator('.exam-checklist li').allTextContents()).filter(t => t.includes('〈보기〉'));
    assert.deepEqual(bogi, ['1번 선지에 〈보기〉에 없는 ㄴ·ㄷ·ㄹ이 있습니다.']);
    await page.keyboard.press('Escape');
    await inPage(page, `reset('1. 고른 것은?\\nㄱ. 가\\nㄷ. 나\\n① ㄱ ② ㄷ ③ ㄱ, ㄷ ④ ㄱ ⑤ ㄷ');`);
    await page.locator('[data-exam-fx="check"]').click();
    assert.deepEqual((await page.locator('.exam-checklist li').allTextContents()).filter(t => t.includes('〈보기〉')), ['1번 〈보기〉 항목이 차례대로가 아닙니다(ㄱㄷ).']);
    await page.keyboard.press('Escape');
    // 45) 표 하나로 된 학교 시험 문항(첫 칸 「1.」, 둘째 칸 발문 「(3점)」, 아래 칸 선지): 목록·번호 다시·배점·부정 표현·정답·요약이 모두 칸 글을 읽는다.
    await inPage(page, `reset('\\n');d.setColumnDef(0,1,0,true,0);const T=[];for(const [p,n,stem] of [[0,'1.','다음 중 옳지 않은 것은? (3점)'],[1,'5.','옳은 것은? (4점)']]){const t=JSON.parse(d.createTable(0,p,0,2,2));T.push(t);
        d.insertTextInCell(0,t.paraIdx,t.controlIdx,0,0,0,n);d.insertTextInCell(0,t.paraIdx,t.controlIdx,1,0,0,stem);d.insertTextInCell(0,t.paraIdx,t.controlIdx,3,0,0,'① 가 ② 나 ③ 다 ④ 라 ⑤ 마');}
      b.deps.eventBus.emit('document-changed');window.__qt=T;return T;`);
    await page.waitForFunction(() => document.querySelectorAll('.exam-q').length === 2 && /옳지 않은/.test(document.querySelector('.exam-q')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
    assert.deepEqual(await page.locator('.exam-q').allTextContents(), ['1. 다음 중 옳지 않은 것은? (3점)', '5. 옳은 것은? (4점)']);
    const cellOf = (q, cell) => `(()=>{const t=window.__qt[${q}],c=JSON.parse(d.getPageControlLayout(0)).controls.filter(x=>x.type==='table'&&!x.cellPath?.length)[${q}];return d.getTextInCell(0,c.paraIdx,c.controlIdx,${cell},0,0,d.getCellParagraphLength(0,c.paraIdx,c.controlIdx,${cell},0));})()`;
    await page.locator('[data-exam-ftab="item"]').click(); await button(page, '문항 번호 1부터').click(); await h.idle(page);
    assert.equal(await inPage(page, `return ${cellOf(1, 0)};`), '2.');
    await inPage(page, `const c=JSON.parse(d.getPageControlLayout(0)).controls.filter(x=>x.type==='table'&&!x.cellPath?.length)[0];b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:c.paraIdx,charOffset:0,parentParaIndex:c.paraIdx,controlIndex:c.controlIdx,cellIndex:1,cellParaIndex:0,cellPath:[{controlIndex:c.controlIdx,cellIndex:1,cellParaIndex:0}]});`);
    await button(page, '커서가 있는 문항의 배점').click(); await page.locator('[data-exam-score="5"]').click(); await h.idle(page);
    assert.equal(await inPage(page, `return ${cellOf(0, 1)};`), '다음 중 옳지 않은 것은? (5점)');
    assert.match(await page.locator('#exam-status').textContent(), /1번 5점 — 배점 2곳 합계 9점/);
    await page.locator('[data-exam-fx="check"]').click();
    assert.equal(await page.locator('.exam-check-summary').textContent(), '문항 2 · 1쪽 · 배점 9점');
    assert.ok((await page.locator('.exam-checklist li').allTextContents()).includes('1번 발문의 부정 표현 「않은」에 밑줄이 없습니다(평가원 발문 규칙).'));
    await page.locator('[data-exam-fixneg]').click(); await h.idle(page);
    assert.equal(await inPage(page, `const c=JSON.parse(d.getPageControlLayout(0)).controls.filter(x=>x.type==='table'&&!x.cellPath?.length)[0];return JSON.parse(d.getCellCharPropertiesAt(0,c.paraIdx,c.controlIdx,1,0,8)).underline;`), true);
    await page.waitForFunction(() => document.querySelectorAll('.exam-q').length === 2);
    await page.locator('[data-exam-qmove="1:-1"]').click(); await h.idle(page);
    assert.deepEqual([await inPage(page, `return ${cellOf(0, 0)}+' '+${cellOf(0, 1)};`), await inPage(page, `return ${cellOf(1, 0)}+' '+${cellOf(1, 1)};`)], ['1. 옳은 것은? (4점)', '2. 다음 중 옳지 않은 것은? (5점)']);
    // 46) 문항을 그림으로(더 보기): 커서 문항 영역만 3배 PNG로, [정답] 줄은 빼고. 그림에 글자가 실제로 그려졌는지 픽셀로 본다.
    await inPage(page, `reset('1. 첫째 문항의 발문은 이것이다.\\n① 가 ② 나 ③ 다 ④ 라 ⑤ 마\\n[정답] ③\\n2. 둘째');d.setColumnDef(0,1,0,true,0);b.deps.eventBus.emit('document-changed');b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:2});`);
    const region = await inPage(page, `const T=await import('/js/rhwp-exam-layout-tools.js');const q=T.allQuestionBlocks(d)[0];return [T.questionRegion(d,q),T.questionRegion(d,{...q,end:q.end}).h];`);
    await page.locator('[data-exam-ftab="item"]').click();
    const imgDownload = page.waitForEvent('download');
    await button(page, '자주 쓰지 않는 기능').click(); await page.locator('.exam-morelist button', { hasText: '문항을 그림으로' }).click();
    const imgFile = await imgDownload; await h.idle(page);
    assert.match(imgFile.suggestedFilename().normalize('NFC'), /1번\.png$/);
    const png = require('node:fs').readFileSync(await imgFile.path());
    const [pw, ph] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    assert.ok(pw > 1000 && ph > 60 && ph < pw / 3, JSON.stringify([pw, ph, region]));
    const ink = await page.evaluate(async b64 => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const px = g.getImageData(0, 0, c.width, c.height).data; let dark = 0; for (let i = 0; i < px.length; i += 4) if (px[i] < 100) dark++; return dark; }, png.toString('base64'));
    assert.ok(ink > 500, `text pixels ${ink}`);
    const zipDownload = page.waitForEvent('download');
    await button(page, '자주 쓰지 않는 기능').click(); await page.locator('.exam-morelist button', { hasText: '모든 문항 그림' }).click();
    const zipFile = await zipDownload; await h.idle(page);
    assert.match(zipFile.suggestedFilename().normalize('NFC'), /문항그림\.zip$/);
    const zipNames = await page.evaluate(async b64 => { const { unzipSync } = await import('/vendor/fflate/index.js'); return Object.keys(unzipSync(Uint8Array.from(atob(b64), c => c.charCodeAt(0)))); }, require('node:fs').readFileSync(await zipFile.path()).toString('base64'));
    assert.deepEqual(zipNames.map(n => n.normalize('NFC')), ['01-1번.png', '02-2번.png']);
    // 47) 점검 「정답 분포 고르게」: 정답이 모두 ③인 6문항 → 선지 두 개씩 맞바꿔 고르게, [정답]은 원래 정답 내용을 계속 가리킨다.
    await inPage(page, `const L=[];for(let q=1;q<=6;q++){L.push(q+'. 문항'+q,'① 가'+q,'② 나'+q,'③ 정답'+q,'④ 라'+q,'⑤ 마'+q,'[정답] ③');}reset(L.join('\\n'));`);
    await page.locator('[data-exam-fx="check"]').click();
    await page.locator('[data-exam-fixanswers]').click(); await h.idle(page);
    assert.match(await page.locator('#exam-status').textContent(), /선지를 맞바꿔 정답 분포를/);
    const balanced = await inPage(page, `const t=text(),out=[];for(let i=0;i<t.length;i++){const m=/^\\[정답\\] (.)$/.exec(t[i]);if(!m)continue;const choice=t.slice(i-5,i).find(x=>x[0]===m[1]);out.push([m[1],choice.slice(2)]);}return out;`);
    assert.deepEqual(balanced.map(([, c]) => c), ['정답1', '정답2', '정답3', '정답4', '정답5', '정답6']);
    const marks = balanced.map(([m]) => m);
    assert.ok(new Set(marks).size >= 4, marks.join(''));
    assert.ok(!marks.some((m, i) => i >= 2 && m === marks[i - 1] && m === marks[i - 2]), marks.join(''));
    // 48) 분류 정보: 커서 문항에 [내용 영역]·[성취기준]·[난이도] 줄을 넣고, 다시 열면 지금 값이 채워져 있고, 비우면 그 줄을 뺀다.
    await inPage(page, `reset('1. 가\\n[정답] ③\\n2. 나');b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:0});`);
    await page.locator('[data-exam-ftab="item"]').click(); await button(page, '커서 문항의 내용 영역').click();
    await page.locator('[data-exam-meta="area"]').fill('물질과 규칙성'); await page.locator('[data-exam-meta="standard"]').fill('[10통과1-01]');
    await page.locator('[data-exam-meta-level="중"]').click(); await page.locator('[data-exam-meta-submit]').click(); await h.idle(page);
    assert.deepEqual(await inPage(page, `return text();`), ['1. 가', '[정답] ③', '[내용 영역] 물질과 규칙성', '[성취기준] [10통과1-01]', '[난이도] 중', '2. 나']);
    await inPage(page, `b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:0});`);
    await button(page, '커서 문항의 내용 영역').click();
    assert.equal(await page.locator('[data-exam-meta="standard"]').inputValue(), '[10통과1-01]');
    assert.equal(await page.locator('[data-exam-meta-level="중"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-exam-meta="area"]').fill(''); await page.locator('[data-exam-meta-level="상"]').click(); await page.locator('[data-exam-meta-submit]').click(); await h.idle(page);
    assert.deepEqual(await inPage(page, `return text();`), ['1. 가', '[정답] ③', '[성취기준] [10통과1-01]', '[난이도] 상', '2. 나']);
    // 49) 고른 문항만 새 파일로(더 보기): 「2, 4-5」 → 그 문항만 남긴 사본(번호 다시), 지금 문서는 그대로. Enter로도 내려받는다.
    await inPage(page, `reset('시험 머리\\n1. 가\\n[정답] ①\\n2. 나\\n3. 다\\n4. 라\\n5. 마');`);
    await page.locator('[data-exam-ftab="item"]').click();
    await button(page, '자주 쓰지 않는 기능').click(); await page.locator('.exam-morelist button', { hasText: '고른 문항만 새 파일로' }).click();
    await page.locator('[data-exam-pick]').fill('2, 4-5');
    const pickDownload = page.waitForEvent('download'); await page.locator('[data-exam-pick]').press('Enter'); const pickFile = await pickDownload; await h.idle(page);
    assert.match(pickFile.suggestedFilename().normalize('NFC'), /3문항\.hwpx$/);
    const picked = await page.evaluate(async b64 => { const b = window.fiveEHwpPalette.native.bridge(), d = b.wasm.borrowDocumentHandle(), x = new d.constructor(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); try { x.convertToEditable?.(); return [...Array(x.getParagraphCount(0)).keys()].map(p => x.getTextRange(0, p, 0, x.getParagraphLength(0, p))); } finally { x.free(); } }, require('node:fs').readFileSync(await pickFile.path()).toString('base64'));
    assert.deepEqual(picked, ['시험 머리', '1. 나', '2. 라', '3. 마']);
    assert.equal((await inPage(page, `return text();`)).length, 7);
    // 50) 표 틀: 상자 창의 「실험 결과 표」 → 4줄×5칸, 머리 줄 음영.
    await inPage(page, `reset('실험');b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:0});`);
    await page.locator('[data-exam-ftab="sheet"]').click(); await button(page, '개념 정리·탐구 활동').click(); await page.locator('[data-exam-tpreset="실험 결과 표"]').click(); await h.idle(page);
    const preset = await tables();
    assert.deepEqual([preset[0].dims.rowCount, preset[0].dims.colCount], [4, 5]);
    assert.equal(await inPage(page, `const t=JSON.parse(d.getPageControlLayout(0)).controls.find(c=>c.type==='table');return JSON.parse(d.getCellProperties(0,t.paraIdx,t.controlIdx,4)).fillType+'/'+d.getTextInCell(0,t.paraIdx,t.controlIdx,4,0,0,2);`), 'solid/평균');
    // 51) 선지 섞기 — 서식이 섞인 표 선지(H₂O의 아래 첨자)도 서식째 옮긴다.
    const formatted = await inPage(page, `reset('1. 첫째\\n① 가 ② 나 ③ 다 ④ H2O ⑤ 마\\n[정답] ④\\n2. 둘째\\n① 바 ② 사 ③ 아 ④ 자 ⑤ 차');d.setColumnDef(0,1,0,true,0);
      for(let p=0;p<d.getParagraphCount(0);p++)d.applyCharFormat(0,p,0,d.getParagraphLength(0,p),JSON.stringify({subscript:false,superscript:false}));
      const L=await import('/js/rhwp-exam-layout-tools.js'),W=await import('/js/rhwp-exam-worksheet.js');
      b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:1,charOffset:0});L.relayoutChoices(b,5);
      const t0=JSON.parse(d.getPageControlLayout(0)).controls.find(c=>c.type==='table'&&!c.cellPath?.length);d.applyCharFormatInCell(0,t0.paraIdx,t0.controlIdx,3,0,3,4,JSON.stringify({subscript:true}));
      const seq=[.1,.9,.3,.7,.5,.2,.8,.4];let k=0;const r=W.makeVariant(b,()=>seq[k++%seq.length],{choices:true});
      const c=new d.constructor(r.bytes);try{c.convertToEditable?.();
        const t=JSON.parse(c.getPageControlLayout(0)).controls.find(x=>x.type==='table'&&!x.cellPath?.length),ci=t.controlIdx;
        const cells=[0,1,2,3,4].map(cell=>c.getTextInCell(0,t.paraIdx,ci,cell,0,0,c.getCellParagraphLength(0,t.paraIdx,ci,cell,0)));
        const h=cells.findIndex(x=>x.includes('H2O')),sub=JSON.parse(c.getCellCharPropertiesAt(0,t.paraIdx,ci,h,0,cells[h].indexOf('2'))).subscript;
        return {shuffled:r.shuffled,cells,sub,answer:r.mapping.find(m=>m.original===1).answer};}finally{c.free();}`);
    assert.ok(formatted.shuffled >= 1, JSON.stringify(formatted));
    assert.deepEqual(formatted.cells.map(t => t[0]), ['①', '②', '③', '④', '⑤']);
    assert.deepEqual(formatted.cells.map(t => t.slice(2)).sort(), ['H2O', '가', '나', '다', '마']);
    assert.equal(formatted.sub, true, 'subscript kept');
    assert.equal(formatted.cells.find(t => t[0] === formatted.answer).slice(2), 'H2O', 'answer follows H2O');
    // 52) 선지 섞기 — 한 줄에 탭으로 늘어선 선지(3+2 두 줄, 평가원 틀 꼴)도 서식째 섞고 [정답]을 따라 고친다.
    const inline = await inPage(page, `reset('1. 첫째\\n① 가\\t② 나\\t③ 다\\n④ H2O\\t⑤ 마\\n[정답] ④\\n2. 둘째\\n① 바\\t② 사\\t③ 아\\t④ 자\\t⑤ 차');
      for(let p=0;p<d.getParagraphCount(0);p++)d.applyCharFormat(0,p,0,d.getParagraphLength(0,p),JSON.stringify({subscript:false,superscript:false}));
      d.applyCharFormat(0,2,3,4,JSON.stringify({subscript:true}));
      const W=await import('/js/rhwp-exam-worksheet.js');const seq=[.1,.9,.3,.7,.5,.2,.8,.4];let k=0;const r=W.makeVariant(b,()=>seq[k++%seq.length],{choices:true});
      const c=new d.constructor(r.bytes);try{c.convertToEditable?.();const t=[...Array(c.getParagraphCount(0)).keys()].map(p=>c.getTextRange(0,p,0,c.getParagraphLength(0,p)));
        const q=t.findIndex(x=>x==='2. 첫째'),lines=[t[q+1],t[q+2]],hp=q+1+lines.findIndex(x=>x.includes('H2O')),ho=t[hp].indexOf('H2O')+1;
        return {shuffled:r.shuffled,lines,ans:t[q+3],sub:JSON.parse(c.getCharPropertiesAt(0,hp,ho)).subscript,other:[t[1],t[2]]};}finally{c.free();}`);
    assert.equal(inline.shuffled, 2, JSON.stringify(inline));
    const items = inline.lines.join('\t').split('\t');
    assert.deepEqual(items.map(x => x[0]), ['①', '②', '③', '④', '⑤'], JSON.stringify(inline));
    assert.deepEqual(items.map(x => x.slice(2)).sort(), ['H2O', '가', '나', '다', '마']);
    assert.equal(inline.sub, true, 'subscript kept');
    assert.equal(items.find(x => x[0] === inline.ans.slice(-1)).slice(2), 'H2O', 'answer follows H2O');
    // 53) 수식이 든 선지: 1·3·5열 바꾸기는 멈추고 알리며(수식이 떨어지지 않게), 가·나형 선지 섞기는 그 문항만 그대로 둔다.
    const eqGuard = await inPage(page, `reset('1. 첫째\\n① 가\\t② \\t③ 다\\t④ 라\\t⑤ 마\\n2. 둘째\\n① 바\\t② 사\\t③ 아\\t④ 자\\t⑤ 차');d.insertEquation(0,1,6,'a over b',1000,0);b.deps.eventBus.emit('document-changed');
      const L=await import('/js/rhwp-exam-layout-tools.js'),W=await import('/js/rhwp-exam-worksheet.js');b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:1,charOffset:0});
      let err='';try{L.relayoutChoices(b,1);}catch(e){err=e.message;}
      const r=W.makeVariant(b,Math.random,{choices:true});return {err,shuffled:r.shuffled,eq:JSON.parse(d.getPageControlLayout(0)).controls.filter(c=>c.type==='equation').length,line:text()[1]};`);
    assert.match(eqGuard.err, /수식·그림이 든 선지는/);
    assert.equal(eqGuard.shuffled, 1, JSON.stringify(eqGuard));
    assert.equal(eqGuard.eq, 1);
    // 54) 정답 한 번에: 「3 2 ④」 → 선택형 차례대로 넣거나 바꾸고(서술형은 건너뜀), Enter로도 된다.
    await inPage(page, `reset('1. 가\\n2. 나\\n[정답] ①\\n[서술형 1] 쓰\\n3. 다');b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:0});`);
    await page.locator('[data-exam-ftab="item"]').click(); await button(page, '커서가 있는 문항 끝에 「[정답]').click();
    await page.locator('[data-exam-allanswers]').fill('3 2 ④'); await page.locator('[data-exam-allanswers]').press('Enter'); await h.idle(page);
    assert.match(await page.locator('#exam-status').textContent(), /선택형 3문항 중 3문항에 정답/);
    assert.deepEqual(await inPage(page, `return text();`), ['1. 가', '[정답] ③', '2. 나', '[정답] ②', '[서술형 1] 쓰', '3. 다', '[정답] ④']);
    // 55) 배점 한 번에: 「2 3.5 4」 → 문항 차례대로(서술형 포함) 넣거나 바꾸고, 문항에 있던 괄호 모양을 따른다.
    await inPage(page, `reset('1. 가는?\\n2. 나는? (3점)\\n[서술형 1] 쓰시오.');b.input.cursor.moveTo({sectionIndex:0,paragraphIndex:0,charOffset:0});`);
    await page.locator('[data-exam-ftab="item"]').click(); await button(page, '커서가 있는 문항의 배점').click();
    await page.locator('[data-exam-allscores]').fill('2 3.5 4'); await page.locator('[data-exam-allscores]').press('Enter'); await h.idle(page);
    assert.match(await page.locator('#exam-status').textContent(), /3문항 중 3문항에 배점.*합계 9\.5점/);
    assert.deepEqual(await inPage(page, `return text();`), ['1. 가는? (2점)', '2. 나는? (3.5점)', '[서술형 1] 쓰시오. (4점)']);
    // 15) 구역이 둘인 시험지(0구역=머리·1번, 1구역=2단 본문): 문항 목록이 두 구역을 다 보이고, 구역을 넘는 ↑↓는 막고, 1구역 안 이동·복제·나뉜 문항 점검은 된다.
    const twoSections = await inPage(page, `const {unzipSync,zipSync}=await import('/vendor/fflate/index.js');
      reset('시험 머리\\n1. 가');const first=unzipSync(d.exportHwpx());reset('2. 나\\n나나\\n3. 다');const second=unzipSync(d.exportHwpx());
      const enc=new TextEncoder(),dec=new TextDecoder(),xml=t=>new DOMParser().parseFromString(dec.decode(t),'application/xml'),ser=x=>enc.encode(new XMLSerializer().serializeToString(x));
      first['Contents/section1.xml']=second['Contents/section0.xml'];
      const meta=xml(first['Contents/header.xml']);meta.documentElement.setAttribute('secCnt','2');first['Contents/header.xml']=ser(meta);
      const c=xml(first['Contents/content.hpf']),man=c.getElementsByTagNameNS('*','manifest')[0],spine=c.getElementsByTagNameNS('*','spine')[0];
      const it=c.createElementNS(man.namespaceURI,'opf:item');it.setAttribute('id','section1');it.setAttribute('href','Contents/section1.xml');it.setAttribute('media-type','application/xml');man.append(it);
      const ref=c.createElementNS(spine.namespaceURI,'opf:itemref');ref.setAttribute('idref','section1');ref.setAttribute('linear','yes');spine.append(ref);first['Contents/content.hpf']=ser(c);
      return [...zipSync(first)];`);
    const twoFile = require('node:path').join(require('node:os').tmpdir(), `5e-two-sections-${name}.hwpx`);
    require('node:fs').writeFileSync(twoFile, Buffer.from(twoSections)); t.after(() => require('node:fs').rmSync(twoFile, { force: true }));
    await h.nativeOpen(page, twoFile);
    const allText = `const all=[];for(let s=0;s<d.getSectionCount();s++)for(let p=0;p<d.getParagraphCount(s);p++)all.push(s+':'+d.getTextRange(s,p,0,d.getParagraphLength(s,p)));return all;`;
    assert.deepEqual(await inPage(page, allText), ['0:시험 머리', '0:1. 가', '1:2. 나', '1:나나', '1:3. 다']);
    await inPage(page, `d.setColumnDef(1,2,0,true,2268);b.deps.eventBus.emit('document-changed');`);
    await page.waitForFunction(() => document.querySelectorAll('.exam-q').length === 3 && document.querySelector('[data-exam-qmove="0:1"]')?.disabled, null, { timeout: 5000 }).catch(() => {});
    assert.equal(await page.locator('[data-exam-qmove="0:1"]').isDisabled(), true, 'no move across sections');
    assert.equal(await page.locator('[data-exam-qmove="1:-1"]').isDisabled(), true);
    await page.locator('[data-exam-qmove="1:1"]').click(); await h.idle(page);
    assert.deepEqual(await inPage(page, allText), ['0:시험 머리', '0:1. 가', '1:2. 다', '1:3. 나', '1:나나']);
    await page.locator('[data-exam-q="2"]').click(); await h.idle(page);
    assert.equal(await inPage(page, `return b.input.cursor.getPosition().sectionIndex;`), 1);
    await page.locator('[data-exam-qdup="2"]').click(); await h.idle(page);
    assert.deepEqual(await inPage(page, allText), ['0:시험 머리', '0:1. 가', '1:2. 다', '1:3. 나', '1:나나', '1:4. 나', '1:나나']);
    assert.deepEqual(await inPage(page, `const {splitQuestions}=await import('/js/rhwp-exam-layout-tools.js');return splitQuestions(d).map(x=>x.text);`), []);


    // 17) 쪽 번호: 모든 구역 꼬리말에 넣고, 다시 고르면 모양만 바뀐다(겹치지 않음). 그려진 쪽에 실제 숫자가 찍힌다.
    const footers = `return [...Array(d.getSectionCount()).keys()].map(s=>JSON.parse(d.getHeaderFooter(s,false,0)).text);`;
    await page.locator('[data-exam-ftab="layout"]').click(); await button(page, '모든 쪽 아래 가운데에 쪽 번호').click(); await page.locator('[data-exam-pagenum="dash"]').click(); await h.idle(page);
    assert.deepEqual(await inPage(page, footers), ['- \u0015 -', '- \u0015 -']);
    await button(page, '모든 쪽 아래 가운데에 쪽 번호').click(); await page.locator('[data-exam-pagenum="dashTotal"]').click(); await h.idle(page);
    assert.deepEqual(await inPage(page, footers), ['- \u0015 / \u0016 -', '- \u0015 / \u0016 -']);
    const drawn = await inPage(page, `const n=d.pageCount(),svg=String(d.renderPageSvg(n-1));return [n,[...svg.matchAll(/<text[^>]*>([^<]*)<\\/text>/g)].map(m=>m[1]).slice(-5).join('')];`);
    assert.equal(drawn[1], `-${drawn[0]}/${drawn[0]}-`);
    await button(page, '모든 쪽 아래 가운데에 쪽 번호').click(); await page.locator('[data-exam-runhead]').fill('2026 1학기 중간 통합과학'); await page.locator('[data-exam-runhead-submit]').click(); await h.idle(page);
    assert.deepEqual(await inPage(page, `return [...Array(d.getSectionCount()).keys()].map(s=>JSON.parse(d.getHeaderFooter(s,true,0)).text);`), ['2026 1학기 중간 통합과학', '2026 1학기 중간 통합과학']);
    assert.match(await inPage(page, `return [...String(d.renderPageSvg(0)).matchAll(/<text[^>]*>([^<]*)<\\/text>/g)].map(m=>m[1]).join('');`), /2026.*통합과학/);
    for (const format of ['exportHwpx', 'exportHwp']) assert.equal(await inPage(page, `const c=new d.constructor(d[arg]());try{c.convertToEditable?.();const n=c.pageCount();return [...String(c.renderPageSvg(n-1)).matchAll(/<text[^>]*>([^<]*)<\\/text>/g)].map(m=>m[1]).slice(-5).join('')===\`-\${n}/\${n}-\`;}finally{c.free();}`, format), true, `page numbers kept after ${format}`);
    assert.equal(await page.locator('#exam-status').getAttribute('data-error'), 'false', await page.locator('#exam-status').textContent());
    assert.deepEqual(errors, []);
  });
});
