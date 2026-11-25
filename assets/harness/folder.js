// 1.8.0 하네스 — 등록한 자료 폴더(교과서·학습지·기출 PDF·글)를 근거 후보로 쓴다(결정 9 + 근거 중심, 별과우주 교훈 5: 학습지에서 가르친 것도 근거).
// 내용은 이 기기(IndexedDB)에만 두고 시험지 파일(.5e)에는 경로·쪽 수만 남긴다(결정 15 가정).
const PDFJS='../../vendor/pdfjs/pdf.mjs',WORKER=new URL('../../vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;
let pdfjs=null;
async function lib(){if(!pdfjs){pdfjs=await import(PDFJS);pdfjs.GlobalWorkerOptions.workerSrc=WORKER;}return pdfjs;}
const kindOf=rel=>/교과서/.test(rel)?'textbook':/학습지|활동지|수업/.test(rel)?'worksheet':/기출|모평|수능|학평/.test(rel)?'past':'document';
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
// 폴더 파일들 → [{rel,kind,pages:[글]}]. 큰 파일·많은 쪽은 자른다(밤샘 기준: 파일 60개, 파일당 400쪽, 전체 120MB).
export async function readFolder(files,{onProgress=()=>{},maxFiles=60,maxPages=400,maxBytes=120*1024*1024}={}){
  const picked=[...files].filter(f=>/\.(pdf|txt|md)$/i.test(f.name)).slice(0,maxFiles);let bytes=0;const out=[];
  for(const [i,f] of picked.entries()){bytes+=f.size;if(bytes>maxBytes)break;const rel=f.webkitRelativePath||f.name;onProgress({i,n:picked.length,rel});
    try{if(/\.pdf$/i.test(f.name)){const {getDocument}=await lib();const doc=await getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise;const pages=[];
        for(let p=1;p<=Math.min(doc.numPages,maxPages);p++){const page=await doc.getPage(p);const tc=await page.getTextContent();pages.push(clean(tc.items.map(x=>x.str).join(' ')));}
        await doc.destroy?.();out.push({rel,kind:kindOf(rel),pages});}
      else{const t=clean(await f.text()).slice(0,400000),pages=[];for(let i=0;i<t.length;i+=1500)pages.push(t.slice(i,i+1500));out.push({rel,kind:kindOf(rel),pages,chunked:true});}}
    catch(e){out.push({rel,kind:kindOf(rel),pages:[],error:String(e.message||e).slice(0,200)});}}
  return out;
}
const tokens=q=>[...new Set(String(q||'').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(t=>t.length>=2&&!/^(그리고|그러나|이다|있다|것은|대한|설명|옳은|것만을|보기|에서|있는|대로|고른|문항|그림)$/.test(t)))].slice(0,24);
// 간단한 낱말 겹침 점수로 쪽을 골라 근거 후보로 돌려준다. 후보일 뿐이고 판정은 AI·교사가 한다.
export function searchFolder(index,query,{k=3}={}){const ts=tokens(query);if(!ts.length||!index?.length)return [];const hits=[];
  // 띄어쓰기를 무시하고 비교한다(「후퇴속도」·「후퇴 속도」).
  const tn=ts.map(t=>t.replace(/\s/g,''));
  for(const f of index)f.pages.forEach((text,pi)=>{if(!text)return;const flat=text.replace(/\s/g,'');let score=0;for(const t of tn)if(flat.includes(t))score+=t.length>=3?2:1;if(score>=2)hits.push({f,pi,score});});
  hits.sort((a,b)=>b.score-a.score);
  return hits.slice(0,k).map(({f,pi,score},n)=>{const text=f.pages[pi],first=Math.min(...ts.map(t=>{const i=text.indexOf(t);return i<0?1e9:i;})),at=first>=1e9?0:Math.max(0,first-80);
    return {ref:`fd-${n+1}-${pi+1}`,kind:f.kind,title:f.chunked?`${f.rel.split('/').pop()} (${pi+1}번째 부분)`:`${f.rel.split('/').pop()} ${pi+1}쪽`,page:f.chunked?null:pi+1,rel:f.rel,score,quote:text.slice(at,at+420)};});
}
export function folderPrompt(hits){return hits.length?`[등록한 자료 폴더에서 찾은 글 · 근거 후보일 뿐, 인용할 때는 ref로만]\n${hits.map(h=>`ref=${h.ref} · ${({textbook:'교과서',worksheet:'학습지·수업 자료',past:'기출',document:'자료'})[h.kind]} · ${h.title}\n  ${h.quote}`).join('\n')}\n(학습지·수업 자료에 있으면 교과서에 없어도 수업에서 다룬 근거다.)`:'';}
