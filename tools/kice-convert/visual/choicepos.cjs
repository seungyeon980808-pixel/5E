// 원본 PDF에서 문항마다 ①~⑤ 글자 위치(pt)를 뽑는다. node choicepos.cjs <개수> > out.jsonl
const R=require('path').resolve(__dirname,'../../..');const fs=require('fs'),path=require('path');
const pw=require(R+'/node_modules/playwright');const h=require(R+'/tests/helpers/rhwp-exam.cjs');
const PDF_ROOT=process.env.KICE_PDF_ROOT||'/Users/parkseungyeon/Library/CloudStorage/GoogleDrive-park49174332@gmail.com/내 드라이브/1. 개인작업/5E_공유폴더테스트_0916';
const corpus=JSON.parse(fs.readFileSync(R+'/tools/kice-convert/corpus.json','utf8'));const n=+process.argv[2]||200,step=corpus.length/n;
const items=Array.from({length:n},(_,k)=>corpus[Math.floor(k*step)]);
(async()=>{await h.withServer(async origin=>{const b=await pw.chromium.launch();const ctx=await b.newContext();
 await ctx.route('**/__blank',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset=utf-8>'}));
 await ctx.route('**/__pdf/**',r=>{const name=decodeURIComponent(new URL(r.request().url()).pathname.split('/__pdf/')[1]);const it=corpus.find(i=>i.pdfFile===name);r.fulfill({body:fs.readFileSync(path.join(PDF_ROOT,it.publicPath)),contentType:'application/pdf'});});
 const page=await ctx.newPage();await page.goto(origin+'/__blank');
 await page.evaluate(async()=>{const pdfjs=await import('/assets/exampool/convert/es/vendor/pdfjs/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/assets/exampool/convert/es/pdf-worker.mjs';window.__pdfjs=pdfjs;window.__docs={};});
 for(const it of items){
  const r=await page.evaluate(async it=>{const pdfjs=window.__pdfjs;let doc=window.__docs[it.pdfFile];if(!doc)doc=window.__docs[it.pdfFile]=await pdfjs.getDocument({url:'/__pdf/'+encodeURIComponent(it.pdfFile),cMapUrl:'/assets/exampool/convert/es/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/assets/exampool/convert/es/vendor/pdfjs/standard_fonts/'}).promise;
    const p=await doc.getPage(it.page),H=p.view[3],tc=await p.getTextContent(),out=[];
    for(const t of tc.items){const x=t.transform[4],y=H-t.transform[5];if(x<it.box[0]-2||x>it.box[2]+2||y<it.box[1]-2||y>it.box[3]+2)continue;
      const str=t.str;for(let i=0;i<str.length;i++){const c=str[i];if('①②③④⑤'.includes(c))out.push({c,x:x+(t.width*i/str.length),y:Math.round(y*10)/10,str:str.slice(0,40),w:t.width});}}
    return out;},it);
  console.log(JSON.stringify({id:it.id,box:it.box,marks:r}));}
 await b.close();});})();
