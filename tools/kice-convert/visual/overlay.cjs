// 원본(파랑) 위에 우리 조판(빨강)을 같은 배율로 겹친다. 겹치면 검정. 문항 번호 왼쪽·기준선을 맞춘다.
// node overlay.cjs <json 폴더> <원본 사진 폴더> <원본 번호 jsonl> <출력 폴더>
const R=require('path').resolve(__dirname,'../../..');const fs=require('fs'),path=require('path');
const pw=require(R+'/node_modules/playwright');const h=require(R+'/tests/helpers/rhwp-exam.cjs');
const [dir,origDir,numFile,out]=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});
const nums=Object.fromEntries(fs.readFileSync(numFile,'utf8').trim().split('\n').map(l=>JSON.parse(l)).map(d=>[d.id,d]));
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort();
const qs=files.map((f,i)=>{const q=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8')).question;delete q.kice;q.number=String(i+1);q.managementId=f.replace('.json','');return q;});
(async()=>{await h.withServer(async origin=>{const b=await pw.webkit.launch();const page=await (await b.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:2})).newPage();page.setDefaultTimeout(180000);
 await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
 const shotPage=await page.context().newPage();await shotPage.goto(origin+'/vendor/rhwp-studio/index.html').catch(()=>{});await shotPage.waitForTimeout(1500);
 await page.evaluate(()=>document.querySelector('[data-app-switch="exam"]').click());
 const sheet=await (await page.waitForSelector('#exampool-sheet-workspace iframe')).contentFrame();
 await sheet.waitForSelector('#side-new');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중');
 const FORMAT=await sheet.evaluate(async()=>(await import('/assets/exampool/sheet/model.js')).FORMAT);
 await sheet.setInputFiles('#excel-file',{name:'k.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:FORMAT,questions:qs,documents:[]}))});
 await sheet.waitForSelector('#import-dialog[open]');await sheet.evaluate(()=>{const u=document.querySelector('input[name="import-mode"][value="update"]');if(u)u.checked=true;});await sheet.click('#apply-import');
 for(const q of qs){try{
  await sheet.waitForFunction(id=>[...document.querySelectorAll(`[data-open-card="${id}"],[data-cv-open="${id}"]`)].some(n=>n.getClientRects().length),q.id);
  await sheet.evaluate(id=>[...document.querySelectorAll(`[data-open-card="${id}"],[data-cv-open="${id}"]`)].find(n=>n.getClientRects().length).click(),q.id);
  await sheet.waitForFunction(n=>document.querySelector('#typeset-title')?.textContent.startsWith(n+'번')&&document.querySelector('#native-editor')?.dataset.ready==='true'&&document.querySelector('#preview-dialog')?.getAttribute('aria-busy')!=='true',q.number,{timeout:120000});
  await sheet.waitForTimeout(800);
  const editor=await (await sheet.waitForSelector('#native-editor iframe')).contentFrame();
  const svg=await editor.evaluate(()=>window.rhwpStudio.plugins.deps.wasm.borrowDocumentHandle().renderPageSvg(0));
  // 따로 빈 페이지(같은 주소, 확대 없음)에 3배(px→pt 0.75 × 3 = 2.25 = CSS 1.125 × 기기 2)로 그려 찍는다.
  const info=await shotPage.evaluate(svg=>{document.body.style.cssText='margin:0;background:#fff';document.body.innerHTML='<div id="ov-host" style="display:inline-block;background:#fff">'+svg+'</div>';
    const el=document.querySelector('#ov-host svg'),vb=el.getAttribute('viewBox').split(/[ ,]+/).map(Number),W=vb[2],H=vb[3];
    el.setAttribute('width',W*1.125);el.setAttribute('height',H*1.125);
    const ts=[...el.querySelectorAll('text')].map(t=>{const m=(t.getAttribute('transform')||'').match(/translate\(([-\d.]+)[ ,]([-\d.]+)\)/);return m?{x:+m[1],y:+m[2],s:t.textContent}:null;}).filter(Boolean);
    const top=ts.filter(t=>/\S/.test(t.s)).sort((a,b)=>a.y-b.y||a.x-b.x);const n=top.find(t=>/^\d/.test(t.s));
    return {W,H,nx:n?.x,ny:n?.y};},svg);
  await shotPage.setViewportSize({width:Math.ceil(info.W*1.125)+4,height:Math.ceil(info.H*1.125)+4});await shotPage.evaluate(()=>document.fonts.ready);
  const shot=await shotPage.locator('#ov-host').screenshot();
  const orig='data:image/png;base64,'+fs.readFileSync(path.join(origDir,q.managementId+'.png')).toString('base64'),ours='data:image/png;base64,'+shot.toString('base64');
  const o=nums[q.managementId],dx=o.x-info.nx*2.25,dy=o.base-info.ny*2.25;
  const png=await page.evaluate(async({orig,ours,dx,dy})=>{const load=s=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=s;});const a=await load(orig),c=await load(ours);
    const W=a.width,H=a.height,cv=document.createElement('canvas');cv.width=W;cv.height=H;const g=cv.getContext('2d');
    const read=(img,x,y)=>{const t=document.createElement('canvas');t.width=W;t.height=H;const k=t.getContext('2d');k.fillStyle='#fff';k.fillRect(0,0,W,H);k.drawImage(img,x,y,img.width/2*2,img.height/2*2);return k.getImageData(0,0,W,H).data;};
    // ours 사진은 기기 배율 2로 찍혀 이미 3배(1.125×2 = 2.25 px/엔진px)다.
    const A=read(a,0,0),B=read(c,dx,dy),out=g.createImageData(W,H);
    for(let i=0;i<A.length;i+=4){const ia=1-(A[i]+A[i+1]+A[i+2])/765,ib=1-(B[i]+B[i+1]+B[i+2])/765;
      // 원본 = 파랑, 우리 = 빨강, 곱하기(겹치면 검정)
      const r1=1-ia,g1=1-ia*.55,b1=1, r2=1,g2=1-ib,b2=1-ib;out.data[i]=255*r1*r2;out.data[i+1]=255*g1*g2;out.data[i+2]=255*b1*b2;out.data[i+3]=255;}
    g.putImageData(out,0,0);return cv.toDataURL('image/png');},{orig,ours,dx,dy});
  fs.writeFileSync(path.join(out,q.managementId+'.png'),Buffer.from(png.split(',')[1],'base64'));console.log('overlay',q.managementId,Math.round(dx),Math.round(dy));
 }catch(e){console.log('error',q.managementId,e.message.slice(0,150));}}
 await b.close();});})();
