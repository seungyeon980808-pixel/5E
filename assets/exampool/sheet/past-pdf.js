// 기출 원본 PDF 보기(10-20 시안 17·18): 5e.ai.kr/examlibrary와 같은 공개 게이트웨이에서 로그인 없이 시험지 PDF를 받아
// ① 문항 그림 위에 검색어 형광펜을 칠하고 ② 시험지 쪽을 통째로(형광펜 포함) 그린다.
// 형광펜 자리는 PDF 글자 좌표(getTextContent)로 정하고, 같은 캔버스에 문항과 함께 그린 뒤 자른다 — 그림과 형광펜이 어긋날 수 없다.
// 「변형」(pdf-viewer.mjs)은 PDF 출처를 한 문항용으로 바꿔 두므로 그 모듈과 섞지 않고 여기서 따로 연다(같은 pdf.js).
import '../convert/es/stream-iterator-polyfill.mjs';
import * as pdfjs from '../convert/es/vendor/pdfjs/pdf.mjs';
import {downloadDriveFile,driveLink} from '../convert/es/drive-source.mjs';
import {pastCropRect} from './past-crop.js';
import {norm} from './past-search.js';

pdfjs.GlobalWorkerOptions.workerSrc||=new URL('../convert/es/pdf-worker.mjs',import.meta.url).href;
const OPTIONS={cMapUrl:new URL('../convert/es/vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,
  standardFontDataUrl:new URL('../convert/es/vendor/pdfjs/standard_fonts/',import.meta.url).href,wasmUrl:new URL('../../../vendor/pdfjs/wasm/',import.meta.url).href};
// 검색어 조각마다 다른 색(시안 18): 노랑·초록·하늘.
export const MARK_COLORS=['rgba(255,214,0,.55)','rgba(120,220,90,.5)','rgba(90,190,255,.5)'];

// 받은 시험지는 최근 6개만 열어 둔다(한 개 약 1MB).
const docs=new Map();
function openDoc(path){
  let p=docs.get(path);
  if(p){docs.delete(path);docs.set(path,p);return p;}
  p=Promise.resolve(downloadDriveFile(path)).then(bytes=>pdfjs.getDocument({data:new Uint8Array(bytes),...OPTIONS}).promise);
  docs.set(path,p);p.catch(()=>{if(docs.get(path)===p)docs.delete(path);});
  while(docs.size>6){const [k,v]=docs.entries().next().value;docs.delete(k);v.then(d=>d.destroy()).catch(()=>{});}
  return p;
}
export const pdfHref=(path,page)=>{try{return driveLink(path)+(page?`#page=${page}`:'');}catch{return '';}};
export async function pageCount(path){return (await openDoc(path)).numPages;}

// 글자 폭 비율(글꼴이 달라도 한글·숫자·영문의 상대 폭은 비슷하다) — 한 줄 글자 묶음 안에서 낱말 위치를 나눌 때 쓴다.
let measure=null;
const charWidth=c=>{measure||=document.createElement('canvas').getContext('2d');measure.font='100px "Apple SD Gothic Neo","Noto Sans KR",sans-serif';return measure.measureText(c).width||50;};
// 검색어 자리(뷰포트 좌표의 사각형들). 띄어쓰기·대소문자는 무시한다(검색 규칙과 같음). 가로 글자만.
export function findMarks(content,viewport,words){
  const terms=words.map(w=>norm(w).replace(/\s+/gu,'')).filter(Boolean),out=[];if(!terms.length)return out;
  for(const it of content.items){
    if(!it.str||!it.width)continue;
    const tx=pdfjs.Util.transform(viewport.transform,it.transform),fh=Math.hypot(tx[2],tx[3]);
    if(!fh||Math.abs(tx[1])>0.01*Math.abs(tx[0]))continue;
    const chars=[...it.str],widths=chars.map(c=>/\s/u.test(c)?charWidth(' '):charWidth(c)),total=widths.reduce((a,b)=>a+b,0)||1,start=[0];
    for(const w of widths)start.push(start.at(-1)+w);
    let flat='';const at=[];chars.forEach((c,i)=>{for(const k of norm(c)){if(/\s/u.test(k))continue;flat+=k;at.push(i);}});
    const len=it.width*viewport.scale;
    terms.forEach((t,ti)=>{for(let k=flat.indexOf(t);k>=0;k=flat.indexOf(t,k+t.length)){const a=at[k],b=at[k+t.length-1]+1;
      const x0=tx[4]+len*start[a]/total,x1=tx[4]+len*start[b]/total;out.push({term:ti%MARK_COLORS.length,x:x0,y:tx[5]-fh*0.9,w:x1-x0,h:fh*1.15});}});
  }
  return out;
}
function paint(ctx,marks,dx=0,dy=0){
  ctx.save();ctx.globalCompositeOperation='multiply';
  for(const m of marks){ctx.fillStyle=MARK_COLORS[m.term];const r=Math.min(3,m.h/5);ctx.beginPath();ctx.roundRect?ctx.roundRect(m.x-dx-1,m.y-dy,m.w+2,m.h,r):ctx.rect(m.x-dx-1,m.y-dy,m.w+2,m.h);ctx.fill();}
  ctx.restore();
}
const toUrl=canvas=>new Promise((res,rej)=>canvas.toBlob(b=>b?res(URL.createObjectURL(b)):rej(Error('그림을 만들지 못했습니다.')),'image/png'));

// ① 문항 그림 + 형광펜. 칠할 자리가 없으면 null(카드는 원래 그림을 그대로 쓴다).
const qCache=new Map();
export function markedQuestion(item,words){
  const key=JSON.stringify([item.id,words]);if(qCache.has(key))return qCache.get(key);
  const job=(async()=>{
    const doc=await openDoc(item.publicPath),page=await doc.getPage(item.page),scale=3,vp=page.getViewport({scale});
    const [x0,y0,x1,y1]=item.box,content=await page.getTextContent();
    const marks=findMarks(content,vp,words).filter(m=>m.x>=x0*scale-2&&m.x+m.w<=x1*scale+2&&m.y>=y0*scale-4&&m.y+m.h<=y1*scale+4);
    if(!marks.length)return null;
    const c=document.createElement('canvas');c.width=Math.ceil((x1-x0)*scale);c.height=Math.ceil((y1-y0)*scale);
    const g=c.getContext('2d',{willReadFrequently:true});g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);
    await page.render({canvasContext:g,viewport:vp,transform:[1,0,0,1,-x0*scale,-y0*scale]}).promise;
    paint(g,marks,x0*scale,y0*scale);
    // 카드와 같은 규칙으로 문항 번호~선지 줄만 남긴다(형광 바탕은 옅어서 글자로 치지 않음).
    const r=pastCropRect(g.getImageData(0,0,c.width,c.height));if(!r)return {url:await toUrl(c),count:marks.length};
    const out=document.createElement('canvas');out.width=r.width;out.height=r.height;out.getContext('2d').drawImage(c,r.x,r.y,r.width,r.height,0,0,r.width,r.height);
    return {url:await toUrl(out),count:marks.length};
  })();
  qCache.set(key,job);job.catch(()=>qCache.delete(key));
  while(qCache.size>120){const [k,v]=qCache.entries().next().value;qCache.delete(k);v.then(x=>x&&URL.revokeObjectURL(x.url)).catch(()=>{});}
  return job;
}

// ② 시험지 한 쪽(폭 cssWidth에 맞춤, 화면 배율 반영) + 형광펜. 쪽 안 문항 자리(박스)도 돌려준다.
export async function renderPage(path,pageNo,words,cssWidth){
  const doc=await openDoc(path),page=await doc.getPage(pageNo),base=page.getViewport({scale:1});
  const scale=Math.min(4,cssWidth/base.width*Math.min(window.devicePixelRatio||1,2)),vp=page.getViewport({scale});
  const c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);c.style.aspectRatio=`${base.width}/${base.height}`;
  const g=c.getContext('2d',{alpha:false});g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);
  await page.render({canvasContext:g,viewport:vp}).promise;
  const marks=words.length?findMarks(await page.getTextContent(),vp,words):[];paint(g,marks);
  return {canvas:c,pages:doc.numPages,count:marks.length,width:base.width,height:base.height};
}
