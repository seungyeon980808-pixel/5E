// 한글로 가져가는 HWPX(11-02): 우리 엔진 때문에 넣은 폭 없는 글자(U+2060 WORD JOINER — 수식 뒤 줄 높이·단 나누기 개체 밀림 방지)를
// 같은 크기 빈칸으로 바꾼다. 윈도우 한글은 이 글자를 조판 부호 「WJ」 점선 상자로 그려 번호 앞 점처럼 보였다(사용자 확인).
// 글자 수가 같아 줄 위치(lineseg textpos)는 그대로다. 보통 크기 WJ는 글 없는 빈 문단에만 있어 빈칸으로 바꿔도 모양이 같다.
// 5E 안(화면·인쇄·5E_hwp 편집)에는 쓰지 않는다 — rhwp는 빈칸이면 수식 뒤 줄 높이를 다시 놓친다(실측 최대 8px 어긋남).
let loading=null;
function loadJSZip(){
  if(globalThis.JSZip)return Promise.resolve(globalThis.JSZip);
  return loading||=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=new URL('./vendor/jszip.min.js',import.meta.url).href;
    s.onload=()=>globalThis.JSZip?resolve(globalThis.JSZip):reject(Error('JSZip을 불러오지 못했습니다.'));s.onerror=()=>{loading=null;reject(Error('JSZip을 불러오지 못했습니다.'));};document.head.append(s);});
}
export async function forHancom(bytes,JSZip=globalThis.JSZip){
  JSZip||=await loadJSZip();
  const zip=await JSZip.loadAsync(new Uint8Array(bytes));let changed=false;
  for(const name of Object.keys(zip.files).filter(n=>/^Contents\/section\d+\.xml$/.test(n))){
    const xml=await zip.file(name).async('string');if(!xml.includes('⁠'))continue;
    zip.file(name,xml.replace(/⁠/g,' '));changed=true;
  }
  return changed?zip.generateAsync({type:'uint8array',compression:'DEFLATE'}):bytes;
}
