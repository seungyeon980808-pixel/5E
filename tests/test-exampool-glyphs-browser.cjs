// ExamPool → 한글 조판 특수 글자 왕복: 평가원 과탐 기출 원문(tools/kice-convert/reference.json)에 나오는
// 한글·영문·숫자·공백이 아닌 글자를 모두 실제 한글 엔진(rhwp)에 넣었다 꺼내 본다.
// 한글 엔진은 완성형 밖 글자(◦ ≳ ⇄ ․ — 등)를 문서에는 그대로 두고 getTextFileText로 꺼낼 때만 &#9702; 로 바꾼다.
// 이 때문에 조판 검사가 「한글에서 일부 글을 읽지 못했습니다」로 문항을 통째로 버리던 회귀(2026-10-19)를 막는다.
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium,webkit} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const reference = require('../tools/kice-convert/reference.json');

const set = new Set();
for (const id in reference) for (const c of reference[id].body) if (!/[\p{Script=Hangul}A-Za-z0-9\s]/u.test(c)) set.add(c);
// 문항 카드에 사람이 직접 넣을 만한 기호도 함께 본다.
for (const c of '〔〕「」·…℃㎝㎏μαβγΔλπθ°±×÷≤≥≒≠∝√∞ㄱㄴㄷ㉠㉡㉢ⓐⓑ①②③④⑤□■△▲○●◎☆★→←↔⇌⇄⇒※‘’“”′″・≲≈∠∥〈〉<>&"\'') set.add(c);
const chars = [...set];

h.withServer(async origin => {
  for (const [engineName,engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE).filter(([name]) => !process.env.EXAM_ENGINE || name === process.env.EXAM_ENGINE)) {
    const browser = await engine.launch({headless:true});
    try {
      const context = await browser.newContext({viewport:{width:1440,height:960}});
      const page = await context.newPage(), errors = [];page.on('pageerror',error => errors.push(error.message));
      await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
      await page.click('.app-switch-image [data-app-switch="exam"]');
      const frameHandle = await page.waitForSelector('#exampool-sheet-workspace iframe');const sheet = await frameHandle.contentFrame();
      await sheet.waitForSelector('#side-new');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중',null,{timeout:60000});

      // 1) 문항 카드에 직접 넣은 글: 발문·지문에 평가원 글머리표 ◦와 ≳가 있어도 조판이 끝까지 된다.
      const FORMAT = await sheet.evaluate(async()=>(await import('/assets/exampool/sheet/model.js')).FORMAT);
      const question = await sheet.evaluate(async()=>{
        const m = await import('/assets/exampool/sheet/model.js'),q = m.newQuestion('1');
        q.ask = '이에 대한 설명으로 옳은 것은? (단, Δx Δp ≳ h이다.)';q.choices.forEach((c,i)=>c.text='보기'+(i+1));
        q.blocks = [{id:'b1',parent:null,kind:'text',label:'지문',text:'〔실험 결과〕\n◦ 가설에 어긋나는 분자가 있다.\n◦ A ⇄ B, 2․3 ― 끝',layout:'세로'}];
        return q;
      });
      await sheet.setInputFiles('#excel-file',{name:'glyphs.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:FORMAT,questions:[question],documents:[]}))});
      await sheet.waitForSelector('#import-dialog[open]');await sheet.click('#apply-import');
      await sheet.waitForFunction(()=>document.querySelectorAll('[data-open-card]').length>=1);
      await sheet.evaluate(()=>document.querySelector('[data-open-card]').click());
      await sheet.waitForFunction(()=>{const s=document.querySelector('#typeset-status');return document.querySelector('#native-editor')?.dataset.ready==='true'||s?.dataset.error==='true';},null,{timeout:90000});
      const status = await sheet.evaluate(()=>({error:document.querySelector('#typeset-status').dataset.error==='true',text:document.querySelector('#typeset-status').textContent}));
      assert.ok(!/읽지 못했습니다/.test(status.text),`${engineName}: card text with ◦ ≳ ⇄ typesets (${status.text})`);
      const stored = await sheet.evaluate(async()=>{
        const w=document.querySelector('#native-editor iframe').contentWindow,doc=w.rhwpStudio.plugins.deps.wasm.borrowDocumentHandle();
        const zip=await window.JSZip.loadAsync(new Uint8Array(doc.exportHwpx()));return zip.file('Contents/section0.xml').async('string');
      });
      for (const c of ['◦','≳','⇄','․','―']) assert.ok(stored.includes(c),`${engineName}: the HWP document keeps ${c} itself`);

      // 2) 기출 원문의 특수 글자 전부: 조판과 같은 순서(HTML → 한글 → HWPX 정리 → 다시 열기 → 보기 들여쓰기)로 넣고 검사한다.
      const results = await sheet.evaluate(async chars=>{
        const w=document.querySelector('#native-editor iframe').contentWindow,Document=w.rhwpStudio.plugins.deps.wasm.borrowDocumentHandle().constructor;
        const H=await import('/assets/exampool/sheet/handoff.js'),T=await import('/assets/exampool/sheet/typeset-model.js?v=1014-compact-panel'),N=await import('/assets/exampool/sheet/native-text-measure.js'),M=await import('/assets/exampool/sheet/model.js');
        const measure=N.createNativeTextMeasurer(Document),JSZip=window.JSZip,out=[];
        for(const c of chars){
          const q=M.newQuestion('1');q.ask='옳은 것은? '+c;q.choices.forEach((x,i)=>x.text='가'+i);
          q.blocks=[{id:'b1',parent:null,kind:'text',label:'지문',text:'가'+c+'나 '+c,layout:'세로'}];
          const r={c};
          try{
            const plan=await H.buildQuestionHtml(q,async f=>f,500,{native:true,measureText:measure}),d=Document.createEmpty();
            let bytes;try{d.createBlankDocument();if(!JSON.parse(d.pasteHtml(0,0,0,plan.html)).ok)throw Error('paste');
              bytes=await T.materializeEquations(Document,JSZip,await T.normalizeQuestionImport(d.exportHwpx(),JSZip),plan.equations);}finally{d.free();}
            const checked=new Document(bytes);let styled;
            try{styled=new Document(await T.applyReferenceBogiIndent(checked,JSZip));H.verifyNativeQuestion(styled,plan);
              const xml=await (await JSZip.loadAsync(new Uint8Array(styled.exportHwpx()))).file('Contents/section0.xml').async('string');
              const body=new DOMParser().parseFromString(xml,'application/xml').documentElement.textContent;r.kept=body.includes('가'+c+'나');r.angle=body.includes('가'+({'〈':'<','〉':'>'}[c]||c)+'나');r.ok=true;}
            finally{styled?.free();checked.free();}
          }catch(e){r.ok=false;r.error=String(e.message||e).slice(0,120);}
          out.push(r);
        }
        return out;
      },chars);
      const failed = results.filter(r=>!r.ok).map(r=>`${r.c} U+${r.c.codePointAt(0).toString(16)}: ${r.error}`);
      assert.deepEqual(failed,[],`${engineName}: every KICE special character survives the HWP round trip`);
      // 10-23 사용자 결정(1번): 꺾쇠 〈 〉는 한글 엔진이 반 폭으로 재 겹치므로 조판할 때 평가원 표기 < >로 바꿔 넣는다. 나머지는 글자 그대로.
      const ANGLE = ['〈', '〉'];
      assert.deepEqual(results.filter(r=>ANGLE.includes(r.c)&&!r.angle).map(r=>r.c),[],`${engineName}: 〈 〉 are stored as < > (KICE notation)`);
      const lost = results.filter(r=>!ANGLE.includes(r.c)&&!r.kept).map(r=>r.c);
      assert.deepEqual(lost,[],`${engineName}: the HWP document stores each character itself`);
      assert.deepEqual(errors,[],`${engineName}: no page errors`);
      console.log(`${engineName}: ${results.length} special characters round-trip through HWP`);
    } finally {await browser.close();}
  }
});
