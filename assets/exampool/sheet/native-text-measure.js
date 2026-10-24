import {normalizeEquationScript,TEXT_WIDTH} from './typeset-model.js?v=1014-compact-panel';
// Measure with the same native font engine that paints and exports the paper.
export function createNativeTextMeasurer(Document){
  const cache=new Map(),escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const measure=(text,fontSize=11)=>{
    const key=JSON.stringify([text,fontSize]);if(cache.has(key))return cache.get(key);
    const d=Document.createEmpty();
    try{
      d.createBlankDocument();const page=JSON.parse(d.getPageDef(0));
      Object.assign(page,{width:2000000,marginLeft:0,marginRight:0});d.setPageDef(0,JSON.stringify(page));
      d.pasteHtml(0,0,0,`<p><span style="font-family:함초롬바탕;font-size:${fontSize}pt">${escape(text||' ')}</span></p>`);
      const runs=JSON.parse(d.getPageTextLayout(0)).runs;
      // 들여온 문서의 글자 모양(장평·자간)만큼 줄인다. 수식은 따로 잰다.
      // 기호만 든 조각(㉠ · ⓐ · ◦ 등 다른 글꼴로 그려짐)은 장평·자간이 걸리지 않아 0.9배로 줄이면 실제보다 좁게 잰다 — 줄 끝 어절이 넘쳐 한 어절만 남는 줄이 생겼다(10-24 15번).
      const plain=t=>/[\uac00-\ud7a3A-Za-z0-9]/.test(t);
      const width=text?runs.reduce((sum,run)=>sum+run.w*(plain(run.text)?TEXT_WIDTH:1),0):0;cache.set(key,width);return width;
    }finally{d.free();}
  };
  // 한글 수식 개체의 실제 폭·높이(px). 표 칸 안 줄 나눔과 칸 높이를 수식 크기로 잰다(수식 자리표시 글자로 재면 수식마다 줄이 바뀐다).
  measure.equation=(script,fontSize=11)=>{
    const key=JSON.stringify(['eq',script,fontSize]);if(cache.has(key))return cache.get(key);
    const d=Document.createEmpty();
    try{
      d.createBlankDocument();const result=JSON.parse(d.insertEquation(0,0,0,normalizeEquationScript(script),Math.round(fontSize*100),0));
      const control=result.ok?(JSON.parse(d.getPageControlLayout(0)).controls||[]).find(c=>c.type==='equation'):null;
      const size=control?{w:control.w,h:control.h}:null;cache.set(key,size);return size;
    }finally{d.free();}
  };
  return measure;
}
