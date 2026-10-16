// Measure with the same native font engine that paints and exports the paper.
export function createNativeTextMeasurer(Document){
  const cache=new Map(),escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return (text,fontSize=11)=>{
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
}
