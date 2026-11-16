// 한글로 가져가는 HWPX(11-02): 우리 엔진 때문에 넣은 폭 없는 글자(U+2060 WORD JOINER — 수식 뒤 줄 높이·단 나누기 개체 밀림 방지)를
// 같은 크기 빈칸으로 바꾼다. 윈도우 한글은 이 글자를 조판 부호 「WJ」 점선 상자로 그려 번호 앞 점처럼 보였다(사용자 확인).
// 글자 수가 같아 줄 위치(lineseg textpos)는 그대로다. 보통 크기 WJ는 글 없는 빈 문단에만 있어 빈칸으로 바꿔도 모양이 같다.
// 5E 안(화면·인쇄·5E_hwp 편집)에는 쓰지 않는다 — rhwp는 빈칸이면 수식 뒤 줄 높이를 다시 놓친다(실측 최대 8px 어긋남).
// 11-16(1.7.1 B2·B4): 수식 스크립트도 바꾼다. 5E 조판 엔진(rhwp)은 LaTeX(\frac…)를 그대로 읽어 파일에도 LaTeX로 적지만
// 윈도우 한글은 한글 수식 문법(a over b)만 읽는다. .hwp(바이너리)도 같은 두 가지를 바꾼다.
import {hancomScript} from '../../../js/eq/hwp-latex.js';
const loading={};
function loadScript(file,ready,fail){
  if(ready())return Promise.resolve(ready());
  return loading[file]||=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=new URL('./vendor/'+file,import.meta.url).href;
    s.onload=()=>ready()?resolve(ready()):reject(Error(fail));s.onerror=()=>{delete loading[file];reject(Error(fail));};document.head.append(s);});
}
const loadJSZip=()=>loadScript('jszip.min.js',()=>globalThis.JSZip,'JSZip을 불러오지 못했습니다.');
const loadCFB=()=>loadScript('xlsx.full.min.js',()=>globalThis.XLSX?.CFB,'한글 저장 도구를 불러오지 못했습니다.');
const unescapeXml=s=>s.replace(/&(lt|gt|quot|apos|amp|#(\d+)|#x([0-9a-f]+));/gi,(m,k,d,h)=>d?String.fromCodePoint(+d):h?String.fromCodePoint(parseInt(h,16)):({lt:'<',gt:'>',quot:'"',apos:"'",amp:'&'})[k.toLowerCase()]);
const escapeXml=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// HWPX 구역 XML 하나: WJ → 빈칸, <hp:script> LaTeX → 한글 수식
export function hancomSectionXml(xml){
  return xml.replace(/⁠/g,' ').replace(/(<hp:script\b[^>]*>)([\s\S]*?)(<\/hp:script>)/g,(m,a,body,b)=>{
    const next=hancomScript(unescapeXml(body));return next===unescapeXml(body)?m:a+escapeXml(next)+b;
  });
}
export async function forHancom(bytes,JSZip=globalThis.JSZip){
  JSZip||=await loadJSZip();
  const zip=await JSZip.loadAsync(new Uint8Array(bytes));let changed=false;
  for(const name of Object.keys(zip.files).filter(n=>/^Contents\/section\d+\.xml$/.test(n))){
    const xml=await zip.file(name).async('string'),next=hancomSectionXml(xml);if(next===xml)continue;
    zip.file(name,next);changed=true;
  }
  return changed?zip.generateAsync({type:'uint8array',compression:'DEFLATE'}):bytes;
}

// ── .hwp(바이너리, HWP 5.0) ──
// BodyText/Section* 레코드를 돌며 PARA_TEXT(67)의 U+2060을 빈칸으로(글자 수 같음), EQEDIT(88)의 스크립트를 한글 수식으로 바꾼다.
// 다른 레코드·스트림은 바이트 그대로 둔다. 바꿀 것이 없으면 받은 바이트를 그대로 돌려준다.
// ⚠ 아직 아무 데서도 부르지 않는다(11-17): SheetJS CFB.write로 상자를 다시 쓰면 내용이 같아도 rhwp가 다시 열 때 수식 뒤 줄이 약 15px 밀린다.
const PARA_TEXT=67,EQEDIT=88;
// 8칸(16바이트)을 차지하는 조판 부호(인라인·확장 컨트롤). 나머지 0~31은 한 칸.
const WIDE=new Set([1,2,3,4,5,6,7,8,9,11,12,14,15,16,17,18,19,20,21,22,23]);
function paraText(body){
  const out=new Uint8Array(body);let changed=false;
  for(let i=0;i+1<out.length;){
    const c=out[i]|out[i+1]<<8;
    if(c===0x2060){out[i]=0x20;out[i+1]=0;changed=true;}
    i+=WIDE.has(c)?16:2;
  }
  return changed?out:null;
}
function eqEdit(body){
  if(body.length<6)return null;
  const view=new DataView(body.buffer,body.byteOffset,body.byteLength),len=view.getUint16(4,true);
  if(6+len*2>body.length)return null;
  let script='';for(let k=0;k<len;k++)script+=String.fromCharCode(view.getUint16(6+k*2,true));
  const next=hancomScript(script);if(next===script)return null;
  if(next.length>0xffff)throw Error('수식이 너무 깁니다.');
  const out=new Uint8Array(body.length-len*2+next.length*2),v=new DataView(out.buffer);
  out.set(body.subarray(0,4));v.setUint16(4,next.length,true);
  for(let k=0;k<next.length;k++)v.setUint16(6+k*2,next.charCodeAt(k),true);
  out.set(body.subarray(6+len*2),6+next.length*2);
  return out;
}
export function hancomSectionRecords(stream){
  const data=new DataView(stream.buffer,stream.byteOffset,stream.byteLength),parts=[];let changed=false;
  for(let pos=0;pos<stream.length;){
    if(pos+4>stream.length)throw Error('한글 문단 정보가 불완전합니다.');
    const record=data.getUint32(pos,true);let head=4,size=record>>>20;
    if(size===4095){size=data.getUint32(pos+4,true);head=8;}
    if(pos+head+size>stream.length)throw Error('한글 문단 범위를 확인하세요.');
    const tag=record&1023,body=stream.subarray(pos+head,pos+head+size);
    const next=tag===PARA_TEXT?paraText(body):tag===EQEDIT?eqEdit(body):null;
    if(next){
      changed=true;const big=next.length>=4095,h=new Uint8Array(big?8:4),hv=new DataView(h.buffer);
      hv.setUint32(0,(record&0xfffff)|((big?4095:next.length)<<20)>>>0,true);if(big)hv.setUint32(4,next.length,true);
      parts.push(h,next);
    }else parts.push(stream.subarray(pos,pos+head+size));
    pos+=head+size;
  }
  if(!changed)return null;
  const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}
  return out;
}
export async function forHancomHwp(bytes,CFB=globalThis.XLSX?.CFB){
  CFB||=await loadCFB();
  const archive=CFB.read(new Uint8Array(bytes),{type:'array'});
  const headerIndex=archive.FullPaths.findIndex(p=>/\/FileHeader$/.test(p));if(headerIndex<0)throw Error('한글 파일 머리를 읽지 못했습니다.');
  const compressed=!!(archive.FileIndex[headerIndex].content[36]&1);let changed=false;
  archive.FullPaths.forEach((name,index)=>{
    if(!/\/BodyText\/Section\d+$/.test(name))return;
    const file=archive.FileIndex[index];let stream=new Uint8Array(file.content);
    if(compressed){stream.l=0;stream=CFB.utils._inflateRaw(stream);}
    const next=hancomSectionRecords(stream);if(!next)return;
    file.content=compressed?CFB.utils._deflateRaw(next):next;file.size=file.content.length;changed=true;
  });
  return changed?new Uint8Array(CFB.write(archive,{type:'array',fileType:'cfb'})):bytes;
}
