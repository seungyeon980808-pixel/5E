import {normalizeEquationScript,TEXT_WIDTH} from './typeset-model.js?v=1014-compact-panel';
// Measure with the same native font engine that paints and exports the paper.
export function createNativeTextMeasurer(Document){
  const cache=new Map(),escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const measure=(text,fontSize=11)=>{
    const key=JSON.stringify([text,fontSize]);if(cache.has(key))return cache.get(key)*measure.factor;
    const d=Document.createEmpty();
    try{
      d.createBlankDocument();const page=JSON.parse(d.getPageDef(0));
      Object.assign(page,{width:2000000,marginLeft:0,marginRight:0});d.setPageDef(0,JSON.stringify(page));
      d.pasteHtml(0,0,0,`<p><span style="font-family:함초롬바탕;font-size:${fontSize}pt">${escape(text||' ')}</span></p>`);
      const runs=JSON.parse(d.getPageTextLayout(0)).runs;
      // 들여온 문서의 글자 모양(장평·자간)만큼 줄인다. 수식은 따로 잰다.
      // 기호만 든 조각(㉠ · ⓐ · ◦ 등 다른 글꼴로 그려짐)은 장평·자간이 걸리지 않아 0.9배로 줄이면 실제보다 좁게 잰다 — 줄 끝 어절이 넘쳐 한 어절만 남는 줄이 생겼다(10-24 15번).
      // 동그라미 영문자(ⓐ·ⓑ, U+24B6–24E9)도 장평·자간이 걸린다(10-25 엔진 실측: ⓐ 15.3px → 14px = × 0.92). 기호로 재면 ⓐ가 넷인 줄을 5px 넓게 재 한 낱말 일찍 넘겼다.
      const plain=t=>/[\uac00-\ud7a3\u3131-\u318eA-Za-z0-9\u24b6-\u24e9]/.test(t); // 한글 자모(ㄱ·ㄴ·ㄷ)도 본문 글꼴
      // 본문 글꼴 조각과 기호 조각을 따로 담아 두고, 장평 + 자간 배율(measure.factor, 틀 값)은 꺼낼 때 곱한다.
      // 10-25 엔진 실측: 장평·자간은 기호(㉠ ① Ⅰ ○ ～ ×)·문장 부호·띄어쓰기까지 모든 글자에 걸린다(실제 = 잰 값 × 0.92).
      // 예전처럼 기호를 그대로 재면 기호마다 1.2px씩 넓게 재 원본보다 한 낱말 일찍 넘어갔다. 장평 + 자간 배율은 꺼낼 때 곱한다(measure.factor, 틀 값).
      // 캐시는 한 편집 세션 내내 남는다 — 2만 개를 넘으면 비운다(코드 점검 10-21 하: 끝없이 쌓였음).
      void plain;const raw=text?runs.reduce((sum,run)=>sum+run.w,0):0;if(cache.size>20000)cache.clear();cache.set(key,raw);return raw*measure.factor;
    }finally{d.free();}
  };
  // 한글 수식 개체의 실제 폭·높이(px). 표 칸 안 줄 나눔과 칸 높이를 수식 크기로 잰다(수식 자리표시 글자로 재면 수식마다 줄이 바뀐다).
  measure.equation=(script,fontSize=11)=>{
    const key=JSON.stringify(['eq',script,fontSize]);if(cache.has(key))return cache.get(key);
    const d=Document.createEmpty();
    try{
      d.createBlankDocument();const result=JSON.parse(d.insertEquation(0,0,0,normalizeEquationScript(script),Math.round(fontSize*100),0));
      const control=result.ok?(JSON.parse(d.getPageControlLayout(0)).controls||[]).find(c=>c.type==='equation'):null;
      const size=control?{w:control.w,h:control.h}:null;if(cache.size>20000)cache.clear();cache.set(key,size);return size;
    }finally{d.free();}
  };
  measure.factor=TEXT_WIDTH;
  return measure;
}
