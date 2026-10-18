import {normalizeEquationScript} from './typeset-model.js?v=1014-compact-panel';
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
      const width=text?runs.reduce((sum,run)=>sum+run.w,0):0;cache.set(key,width);return width;
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
