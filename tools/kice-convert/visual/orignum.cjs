// 원본 PDF에서 문항 번호 글자의 왼쪽 x·기준선 y(원본 사진 좌표 = (pt - (box - 6)) × 3). node orignum.cjs <ids,> > out.jsonl
const R=require('path').resolve(__dirname,'../../..');
const fs=require('fs'),path=require('path');const pw=require(R+'/node_modules/playwright');const h=require(R+'/tests/helpers/rhwp-exam.cjs');
const [ids]=process.argv.slice(2);const PDF_ROOT=process.env.KICE_PDF_ROOT||'/Users/parkseungyeon/Library/CloudStorage/GoogleDrive-park49174332@gmail.com/내 드라이브/1. 개인작업/5E_공유폴더테스트_0916';
const corpus=JSON.parse(fs.readFileSync(R+'/tools/kice-convert/corpus.json','utf8')),items=ids.split(',').map(id=>corpus.find(c=>c.id===id));
(async()=>{await h.withServer(async origin=>{
 const b=await pw.chromium.launch();const page=await b.newPage();page.setDefaultTimeout(120000);
 await page.route('**/__pdf/**',r=>{const it=items.find(i=>r.request().url().endsWith('/__pdf/'+encodeURIComponent(i.id)));r.fulfill({body:fs.readFileSync(path.join(PDF_ROOT,it.publicPath)),contentType:'application/pdf'});});
 await page.goto(origin+'/');
 for(const it of items){
  const r=await page.evaluate(async({it})=>{const pdfjs=await import('/assets/exampool/convert/es/vendor/pdfjs/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/assets/exampool/convert/es/pdf-worker.mjs';
    const doc=await pdfjs.getDocument({url:'/__pdf/'+encodeURIComponent(it.id),cMapUrl:'/assets/exampool/convert/es/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/assets/exampool/convert/es/vendor/pdfjs/standard_fonts/'}).promise;
    const p=await doc.getPage(it.page),vp=p.getViewport({scale:1}),content=await p.getTextContent();const box=it.box;
    const items=content.items.filter(t=>t.str.trim()).map(t=>{const [x,y]=vp.convertToViewportPoint(t.transform[4],t.transform[5]);return {s:t.str,x,y};}).filter(t=>t.x>=box[0]-4&&t.x<=box[2]&&t.y>=box[1]-2&&t.y<=box[3]);
    items.sort((a,b)=>a.y-b.y||a.x-b.x);const n=items.find(t=>/^\d/.test(t.s.trim()));
    return n?{x:(n.x-(box[0]-6))*3,base:(n.y-(box[1]-6))*3,s:n.s}:null;},{it});
  console.log(JSON.stringify({id:it.id,...r}));
 }
 await b.close();});})();
