// 기출·교과서 원본 PDF 보기(10-20 시안 17·18·28·30·31): 5e.ai.kr/examlibrary와 같은 공개 게이트웨이에서 로그인 없이 PDF를 받아
// ① 문항만 잘라 그리고(PDF 글자 좌표로 경계) 검색어 형광펜을 칠하고 ② 쪽을 통째로 그리며 글을 끌어 고를 수 있는 글자 층을 얹는다.
// 형광펜·경계는 PDF 글자 좌표(getTextContent)로 정하고 같은 캔버스에 함께 그린다 — 그림과 어긋날 수 없다.
// 「변형」(pdf-viewer.mjs)은 PDF 출처를 한 문항용으로 바꿔 두므로 그 모듈과 섞지 않고 여기서 따로 연다(같은 pdf.js).
import '../convert/es/stream-iterator-polyfill.mjs';
import * as pdfjs from '../convert/es/vendor/pdfjs/pdf.mjs';
import {downloadDriveFile,driveLink} from '../convert/es/drive-source.mjs';
import {norm} from './past-search.js';

pdfjs.GlobalWorkerOptions.workerSrc||=new URL('../convert/es/pdf-worker.mjs',import.meta.url).href;
const OPTIONS={cMapUrl:new URL('../convert/es/vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,
  standardFontDataUrl:new URL('../convert/es/vendor/pdfjs/standard_fonts/',import.meta.url).href,wasmUrl:new URL('../../../vendor/pdfjs/wasm/',import.meta.url).href};
// 검색어 조각마다 다른 색(시안 18): 노랑·초록·하늘.
export const MARK_COLORS=['rgba(255,214,0,.55)','rgba(120,220,90,.5)','rgba(90,190,255,.5)'];

// 받은 PDF는 브라우저 저장소(Cache Storage)에 남긴다 — 5E 라이브러리와 같은 저장소·같은 열쇠(주소 + 체크섬)라
// 라이브러리에서 한 번 연 교과서는 ExamPool에서도 서버 없이 바로 열리고, 시험지 서버가 잠시 멈춰도 이미 본 PDF는 계속 열린다.
// 서버에는 한 번에 둘까지만 받으러 간다(여러 카드가 한꺼번에 형광펜·크롭을 요청해도 서버에 몰리지 않게).
const CACHE='5e-pdf-library-v1';
const cacheKey=(path,sha)=>{let u;try{u=new URL(driveLink(path));}catch{return '';}u.searchParams.set('__5e_sha256',sha||'exampool-past-v1');return u.href;};
async function cachedBytes(path,sha){try{const r=await (await caches.open(CACHE)).match(cacheKey(path,sha));return r?.ok?await r.arrayBuffer():null;}catch{return null;}}
async function keepBytes(path,sha,bytes){try{await (await caches.open(CACHE)).put(cacheKey(path,sha),new Response(bytes,{status:200,headers:{'content-type':'application/pdf','content-length':String(bytes.byteLength)}}));}catch{}}
const waiting=[];let active=0;
function queued(job){return new Promise((res,rej)=>{waiting.push({job,res,rej});pump();});}
function pump(){while(active<2&&waiting.length){const w=waiting.shift();active++;Promise.resolve().then(w.job).then(w.res,w.rej).finally(()=>{active--;pump();});}}
async function fileBytes(path,sha){const hit=await cachedBytes(path,sha);if(hit)return hit;const bytes=await queued(()=>downloadDriveFile(path));await keepBytes(path,sha,bytes.slice(0));return bytes;}
// 받은 PDF는 최근 6개만 열어 둔다. 원본 지문(SHA-256 앞 16자리)은 근거에 함께 남겨 「어느 판」인지 증명한다.
const docs=new Map();
async function hex(bytes){try{const d=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(d)].slice(0,8).map(b=>b.toString(16).padStart(2,'0')).join('');}catch{return '';}}
function openFile(path,{sha=''}={}){
  let p=docs.get(path);
  if(p){docs.delete(path);docs.set(path,p);return p;}
  p=fileBytes(path,sha).then(async bytes=>{const own=sha?sha.slice(0,16):await hex(bytes.slice(0));const doc=await pdfjs.getDocument({data:new Uint8Array(bytes),...OPTIONS}).promise;return {doc,sha:own,fp:doc.fingerprints?.[0]||''};});
  docs.set(path,p);p.catch(()=>{if(docs.get(path)===p)docs.delete(path);});
  while(docs.size>6){const [k,v]=docs.entries().next().value;docs.delete(k);v.then(r=>r.doc.destroy()).catch(()=>{});}
  return p;
}
const openDoc=path=>openFile(path).then(r=>r.doc);
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
function paint(ctx,marks,dx=0,dy=0,color){
  ctx.save();ctx.globalCompositeOperation='multiply';
  for(const m of marks){ctx.fillStyle=color||MARK_COLORS[m.term];const r=Math.min(3,m.h/5);ctx.beginPath();ctx.roundRect?ctx.roundRect(m.x-dx-1,m.y-dy,m.w+2,m.h,r):ctx.rect(m.x-dx-1,m.y-dy,m.w+2,m.h);ctx.fill();}
  ctx.restore();
}
const toUrl=canvas=>new Promise((res,rej)=>canvas.toBlob(b=>b?res(URL.createObjectURL(b)):rej(Error('그림을 만들지 못했습니다.')),'image/png'));

// 문항 경계(시안 28): 픽셀 추측 대신 PDF 글자 좌표로. 위 = 문항 번호 줄, 아래 = ①~⑤ 선지 줄(없으면 쪽 번호·저작권 줄 위),
// 좌우 = 그 단에서 글자가 있는 폭(〈보기〉 테두리가 잘리지 않게 오른쪽은 조금 넉넉히). 쪽 번호·저작권·확인 사항은 경계 밖.
const FOOT=/저작권|확인 사항|^\s*\d+\s*$|^\s*\d+\s*\/\s*\d+\s*$/;
export function questionRect(content,vp1,box){
  const [bx0,by0,bx1,by1]=box,lines=[];
  for(const t of content.items){if(!t.str?.trim())continue;const tx=pdfjs.Util.transform(vp1.transform,t.transform),fh=Math.hypot(tx[2],tx[3]),x=tx[4],y=tx[5]-fh;
    if(x<bx0-2||x>bx1||y<by0-4||y>by1)continue;lines.push({s:t.str,x,y,w:t.width,h:fh*1.2});}
  const body=lines.filter(l=>!FOOT.test(l.s));if(!body.length)return null;
  const top=Math.min(...body.map(l=>l.y)),ch=body.filter(l=>/[①②③④⑤]/.test(l.s));
  const footTop=Math.min(by1,...lines.filter(l=>FOOT.test(l.s)).map(l=>l.y));
  const bottom=ch.length?Math.max(...ch.map(l=>l.y+l.h)):footTop-2;
  const used=body.filter(l=>l.y>=top-1&&l.y<=bottom);if(!used.length||bottom-top<10)return null;
  return [Math.max(bx0,Math.min(...used.map(l=>l.x))-4),top,Math.min(bx1-4,Math.max(...used.map(l=>l.x+l.w))+14),bottom];
}
// 문항 그림(+형광펜). 형광펜을 원하는데 칠할 자리가 없으면 null(카드는 원래 그림을 그대로 쓴다).
async function drawQuestion(item,words,needMarks){
  const doc=await openDoc(item.publicPath),page=await doc.getPage(item.page),scale=3,vp=page.getViewport({scale}),content=await page.getTextContent();
  const r=questionRect(content,page.getViewport({scale:1}),item.box)||item.box,pad=6,x0=r[0]-pad,y0=r[1]-pad,x1=r[2]+pad,y1=r[3]+pad;
  const marks=words.length?findMarks(content,vp,words).filter(m=>m.x>=x0*scale-2&&m.x+m.w<=x1*scale+2&&m.y>=y0*scale-4&&m.y+m.h<=y1*scale+4):[];
  if(needMarks&&!marks.length)return null;
  const c=document.createElement('canvas');c.width=Math.ceil((x1-x0)*scale);c.height=Math.ceil((y1-y0)*scale);
  const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);
  await page.render({canvasContext:g,viewport:vp,transform:[1,0,0,1,-x0*scale,-y0*scale]}).promise;
  paint(g,marks,x0*scale,y0*scale);
  return {url:await toUrl(c),count:marks.length};
}
const qCache=new Map();
function cached(key,make){
  if(qCache.has(key)){const hit=qCache.get(key);qCache.delete(key);qCache.set(key,hit);return hit;}
  const job=make();qCache.set(key,job);job.catch(()=>qCache.delete(key));
  while(qCache.size>120){const [k,v]=qCache.entries().next().value;qCache.delete(k);v.then(x=>x&&URL.revokeObjectURL(x.url)).catch(()=>{});}
  return job;
}
export function markedQuestion(item,words){return cached(JSON.stringify([item.id,words]),()=>drawQuestion(item,words,true));}
// 형광펜 없이 문항만(카드 그림 자르기가 실패했을 때·크게 보기).
export function croppedQuestion(item,words=[]){return cached(JSON.stringify([item.id,words,'q']),()=>drawQuestion(item,words,false));}

// 쪽 한 장(폭 cssWidth에 맞춤, 화면 배율 반영) + 형광펜 + 끌어서 고를 수 있는 글자 층(시안 31).
// marks: 다시 열 때 칠할 근거 자리 [{x,y,w,h}](쪽 비율 0~1). 돌려주는 sha·fp는 근거에 남길 원본 지문.
export async function renderPage(path,pageNo,words,cssWidth,{sha:known='',saved=[]}={}){
  const {doc,sha,fp}=await openFile(path,{sha:known}),page=await doc.getPage(pageNo),base=page.getViewport({scale:1});
  const scale=Math.min(4,cssWidth/base.width*Math.min(window.devicePixelRatio||1,2)),vp=page.getViewport({scale});
  const c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);
  const g=c.getContext('2d',{alpha:false});g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);
  await page.render({canvasContext:g,viewport:vp}).promise;
  const content=await page.getTextContent(),marks=words.length?findMarks(content,vp,words):[];paint(g,marks);
  if(saved.length)paint(g,saved.map(r=>({x:r.x*c.width,y:r.y*c.height,w:r.w*c.width,h:r.h*c.height})),0,0,'rgba(255,170,0,.35)');
  // 글자 층: 화면 폭 기준 배율로 다시 깔아 브라우저의 글 고르기(끌기)를 그대로 쓴다. 글자는 투명, 고르면 파란 바탕.
  const css=cssWidth/base.width,layer=document.createElement('div');layer.className='textLayer';
  layer.style.cssText=`--scale-factor:${css};--total-scale-factor:${css};--scale-round-x:1px;--scale-round-y:1px`;
  let textItems=0;
  try{const tl=new pdfjs.TextLayer({textContentSource:content,container:layer,viewport:page.getViewport({scale:css})});await tl.render();textItems=content.items.filter(t=>t.str?.trim()).length;}catch{}
  return {canvas:c,layer,pages:doc.numPages,count:marks.length,width:base.width,height:base.height,sha,fp,textItems};
}
