// 원본 PDF 문항 영역의 글 조각(글자·x·폭·글자 크기) — 글자당 폭 비교용. node origwords.cjs <id>
const R=require('path').resolve(__dirname,'../../..');
const fs=require('fs'),path=require('path');const pw=require(R+'/node_modules/playwright');const h=require(R+'/tests/helpers/rhwp-exam.cjs');
const [id]=process.argv.slice(2);const PDF_ROOT=process.env.KICE_PDF_ROOT||'/Users/parkseungyeon/Library/CloudStorage/GoogleDrive-park49174332@gmail.com/내 드라이브/1. 개인작업/5E_공유폴더테스트_0916';
const corpus=JSON.parse(fs.readFileSync(R+'/tools/kice-convert/corpus.json','utf8')),it=corpus.find(c=>c.id===id);
(async()=>{await h.withServer(async origin=>{
 const b=await pw.chromium.launch();const page=await b.newPage();page.setDefaultTimeout(120000);
 await page.route('**/__pdf/**',r=>r.fulfill({body:fs.readFileSync(path.join(PDF_ROOT,it.publicPath)),contentType:'application/pdf'}));
 await page.goto(origin+'/');
 const r=await page.evaluate(async({it})=>{const pdfjs=await import('/assets/exampool/convert/es/vendor/pdfjs/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/assets/exampool/convert/es/pdf-worker.mjs';
    const doc=await pdfjs.getDocument({url:'/__pdf/'+encodeURIComponent(it.id),cMapUrl:'/assets/exampool/convert/es/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/assets/exampool/convert/es/vendor/pdfjs/standard_fonts/'}).promise;
    const p=await doc.getPage(it.page),vp=p.getViewport({scale:1}),content=await p.getTextContent();const box=it.box;
    return content.items.filter(t=>t.str.trim()).map(t=>{const [x,y]=vp.convertToViewportPoint(t.transform[4],t.transform[5]);return {s:t.str,x:+x.toFixed(2),y:+y.toFixed(1),w:+t.width.toFixed(2),fs:+Math.hypot(t.transform[2],t.transform[3]).toFixed(2),sx:+(t.transform[0]).toFixed(2),font:content.styles[t.fontName]?.fontFamily};}).filter(t=>t.x>=box[0]-4&&t.x<=box[2]&&t.y>=box[1]-2&&t.y<=box[3]);},{it});
 for(const t of r)console.log(JSON.stringify(t));
 await b.close();});})();
