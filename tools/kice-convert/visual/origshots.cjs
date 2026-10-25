// 기출 원본 PDF에서 문항 자리(색인 page·box, 글자 좌표로 경계)를 3배로 잘라 PNG로. node origshots.cjs <ids,> <pdf 상대경로> <출력 폴더>
const R=require('path').resolve(__dirname,'../../..');
const fs=require('fs'),path=require('path');const pw=require(R+'/node_modules/playwright');const h=require(R+'/tests/helpers/rhwp-exam.cjs');
const [ids,out]=process.argv.slice(2);const PDF_ROOT=process.env.KICE_PDF_ROOT||'/Users/parkseungyeon/Library/CloudStorage/GoogleDrive-park49174332@gmail.com/내 드라이브/1. 개인작업/5E_공유폴더테스트_0916';fs.mkdirSync(out,{recursive:true});
const corpus=JSON.parse(fs.readFileSync(R+'/tools/kice-convert/corpus.json','utf8')),items=ids.split(',').map(id=>corpus.find(c=>c.id===id));
(async()=>{await h.withServer(async origin=>{
 const b=await pw.chromium.launch();const page=await b.newPage();page.setDefaultTimeout(120000);
 await page.route('**/__pdf/**',r=>{const it=items.find(i=>r.request().url().endsWith('/__pdf/'+encodeURIComponent(i.id)));r.fulfill({body:fs.readFileSync(path.join(PDF_ROOT,it.publicPath)),contentType:'application/pdf'});});
 await page.goto(origin+'/');
 for(const it of items){
  const data=await page.evaluate(async({it})=>{const pdfjs=await import('/assets/exampool/convert/es/vendor/pdfjs/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/assets/exampool/convert/es/pdf-worker.mjs';

    const doc=await pdfjs.getDocument({url:'/__pdf/'+encodeURIComponent(it.id),cMapUrl:'/assets/exampool/convert/es/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/assets/exampool/convert/es/vendor/pdfjs/standard_fonts/'}).promise;
    const p=await doc.getPage(it.page),scale=3,vp=p.getViewport({scale}),content=await p.getTextContent();
    const r=it.box,pad=6,x0=r[0]-pad,y0=r[1]-pad,x1=r[2]+pad,y1=r[3]+pad;
    const c=document.createElement('canvas');c.width=Math.ceil((x1-x0)*scale);c.height=Math.ceil((y1-y0)*scale);const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);
    await p.render({canvasContext:g,viewport:vp,transform:[1,0,0,1,-x0*scale,-y0*scale]}).promise;return c.toDataURL('image/png');},{it});
  fs.writeFileSync(path.join(out,it.id+'.png'),Buffer.from(data.split(',')[1],'base64'));
 }
 console.log('done',items.length);await b.close();});})();
