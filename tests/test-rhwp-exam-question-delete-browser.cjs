// 1.7.1 R1(D6): 5E_hwp에서 「판 구조」(문항 하나가 표 하나인 학교 시험 틀) 문항을 지우면,
// 지운 문항의 표가 남아 다음 문항 문단에 붙어(한 문단에 표 두 개) 글·그림이 겹쳤다.
// 엔진의 deleteRange는 문단 사이 글만 지우고 표·그림 같은 개체는 남긴다 — 문단째 지워야 한다.
const test = require('node:test'), assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');

const prelude = `const b=window.fiveEHwpPalette.native.bridge(),d=b.wasm.borrowDocumentHandle();
const L=await import('/js/rhwp-exam-layout-tools.js');
const top=()=>{const out=[];for(let pg=0;pg<d.pageCount();pg++)for(const c of JSON.parse(d.getPageControlLayout(pg)).controls||[]){if((c.cellPath||[]).length||Number.isInteger(c.cellIdx)||!['table','image','equation'].includes(c.type))continue;out.push({type:c.type,pg,p:c.paraIdx,ci:c.controlIdx??c.ci,y:c.y,h:c.h});}return out;};
const tables=()=>top().filter(c=>c.type==='table').map(c=>({...c,head:String(d.getTextInCell(0,c.p,c.ci,0,0,0,d.getCellParagraphLength(0,c.p,c.ci,0,0))),body:String(d.getTextInCell(0,c.p,c.ci,1,0,0,d.getCellParagraphLength(0,c.p,c.ci,1,0)))}));
// 판 구조 시험지: 문단마다 1×2 표(왼쪽 칸 「n.」, 오른쪽 칸 문항 글). 2번 문항 표 아래에는 본문 글 한 줄.
const build=()=>{const top0=top().sort((a,b)=>b.p-a.p||b.ci-a.ci);for(const c of top0){if(c.type==='table')d.deleteTableControl(0,c.p,c.ci);else if(c.type==='equation')d.deleteEquationControl(0,c.p,c.ci);else d.deletePictureControl(0,c.p,c.ci);}
  while(d.getParagraphCount(0)>1)d.mergeParagraph(0,1);const n=d.getParagraphLength(0,0);if(n)d.deleteText(0,0,0,n);
  for(let i=0;i<3;i++)d.splitParagraph(0,i,0);
  for(let q=0;q<3;q++){const r=JSON.parse(d.createTable(0,q,0,1,2));d.insertTextInCell(0,r.paraIdx,r.controlIdx,0,0,0,(q+1)+'.');d.insertTextInCell(0,r.paraIdx,r.controlIdx,1,0,0,'문항 '+(q+1)+' 내용');}
  b.deps.eventBus.emit('document-changed');};
const shape=()=>{const t=tables();const paras=t.map(x=>x.p);const sorted=[...t].sort((a,b)=>a.pg-b.pg||a.y-b.y);
  const overlap=sorted.some((x,i)=>i&&x.pg===sorted[i-1].pg&&x.y<sorted[i-1].y+sorted[i-1].h-0.5);
  return {cells:t.map(x=>x.head+'|'+x.body),shared:new Set(paras).size!==paras.length,overlap,blocks:L.allQuestionBlocks(d).map(q=>q.number)};};`;
const inPage = (page, body, arg) => page.evaluate(new Function('arg', `return (async()=>{${prelude}${body}})()`), arg);

for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([k]) => !process.env.BROWSER_ENGINE || k === process.env.BROWSER_ENGINE)) test(`${name}: 판 구조 문항을 지워도 남은 문항이 겹치지 않는다(R1)`, async t => {
  await h.withServer(async origin => {
    const browser = await engine.launch(); t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await h.navigate(page, origin + '/?mode=pro&mobile=0&exam=1'); await h.ready(page);
    await page.waitForSelector('#exam-palette [data-block]'); await h.idle(page);

    const before = await inPage(page, `build();return shape();`);
    assert.deepEqual(before, { cells: ['1.|문항 1 내용', '2.|문항 2 내용', '3.|문항 3 내용'], shared: false, overlap: false, blocks: [1, 2, 3] });

    // 첫 문항(구역 설정이 든 0번 문단)을 지운다: 표가 남아 다음 문항 문단에 붙으면 안 된다.
    const first = await inPage(page, `L.deleteQuestion(b,0);return shape();`);
    assert.deepEqual(first, { cells: ['1.|문항 2 내용', '2.|문항 3 내용'], shared: false, overlap: false, blocks: [1, 2] });
    // 되돌리기 한 번이면 지우기 전으로.
    const undone = await inPage(page, `b.input.performUndo();b.deps.eventBus.emit('document-changed');return shape();`);
    assert.deepEqual(undone, before);

    // 가운데 문항
    const middle = await inPage(page, `build();L.deleteQuestion(b,1);return shape();`);
    assert.deepEqual(middle, { cells: ['1.|문항 1 내용', '2.|문항 3 내용'], shared: false, overlap: false, blocks: [1, 2] });

    // 마지막 문항(문서 끝)
    const last = await inPage(page, `build();L.deleteQuestion(b,2);return shape();`);
    assert.deepEqual(last, { cells: ['1.|문항 1 내용', '2.|문항 2 내용'], shared: false, overlap: false, blocks: [1, 2] });

    // 글 문항은 예전처럼(번호 다시 매김, 구역 설정 문단 유지).
    const plain = await inPage(page, `build();const top0=top().sort((a,b)=>b.p-a.p||b.ci-a.ci);for(const c of top0)d.deleteTableControl(0,c.p,c.ci);
      while(d.getParagraphCount(0)>1)d.mergeParagraph(0,1);d.insertText(0,0,0,'1. 가');d.splitParagraph(0,0,4);d.insertText(0,1,0,'가가');d.splitParagraph(0,1,2);d.insertText(0,2,0,'2. 나');d.splitParagraph(0,2,4);d.insertText(0,3,0,'3. 다');
      L.deleteQuestion(b,0);const a=[...Array(d.getParagraphCount(0)).keys()].map(p=>d.getTextRange(0,p,0,d.getParagraphLength(0,p)));
      L.deleteQuestion(b,1);const c=[...Array(d.getParagraphCount(0)).keys()].map(p=>d.getTextRange(0,p,0,d.getParagraphLength(0,p)));
      return {a,c,secd:JSON.parse(d.getControls()).filter(x=>x.ctrlId==='secd').map(x=>x.para)};`);
    assert.deepEqual(plain, { a: ['1. 나', '2. 다'], c: ['1. 나'], secd: [0] });
    assert.deepEqual(errors, []);
  });
});
