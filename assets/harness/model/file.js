// 시험지 파일(.5e, kind 'examset') 읽기·쓰기 — 명세 2절. 압축 없는 ZIP(js/backup-zip.js).
// 안: manifest.json · work.json · versions/<label>.json · blob/<sha256> · chat/<id>.jsonl · checks/<id>.json
// JSON 안의 큰 덩어리(그림 data URL 전부, 4096자 넘는 base64 — 문항 조판 typeset.bytes 등)는
// {"$5eBlob":"<sha>"}로 빼고 바이트는 blob/에 한 번만 둔다. 판끼리 같은 그림은 덩어리 하나를 함께 쓴다.
// base64 글자 그대로였던 덩어리(data URL이 아닌 것)는 {"$5eBlob":"<sha>","as":"base64"}로 적어 그대로 되살린다.
import {zipStore,unzipStore,isZip} from '../../../js/backup-zip.js';
import {MAX_PROJECT_FILE_BYTES} from '../../../js/project-file-policy.js';
import {SCHEMA} from './examset.js';

const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const BLOB='$5eBlob',BIG=4096;
const DATA_URL=/^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/i;
const B64=/^[A-Za-z0-9+/]+={0,2}$/;
const LABEL=/^v\d+\.\d+$/,SAFE=/^[A-Za-z0-9_-]{1,80}$/,SHA=/^[a-f0-9]{64}$/;

function b64ToBytes(s){const bin=atob(s),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}
function bytesToB64(b){let s='';for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return btoa(s);}
async function sha256(bytes){return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');}
function sniff(b){
  if(b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47)return 'image/png';
  if(b[0]===0xff&&b[1]===0xd8)return 'image/jpeg';
  if(b[0]===0x50&&b[1]===0x4b&&b[2]===3&&b[3]===4)return 'application/zip';
  return 'application/octet-stream';
}

/* ---------- 덩어리 빼기 ---------- */
function makeStash(){
  const blobs=new Map(),seen=new Map();// sha → {mediaType,bytes} · 글자 → ref(같은 글자를 다시 해시하지 않음)
  async function one(s){
    if(seen.has(s))return seen.get(s);
    let ref=null;const m=DATA_URL.exec(s);
    // 다시 인코딩해서 글자가 그대로 나오는(정규 base64) 것만 뺀다 — 왕복이 바이트 단위로 같아야 한다.
    if(m&&m[2].length%4===0){const bytes=b64ToBytes(m[2]);if(bytesToB64(bytes)===m[2]){const sha=await sha256(bytes);if(!blobs.has(sha))blobs.set(sha,{mediaType:m[1].toLowerCase(),bytes});ref={[BLOB]:sha};}}
    else if(!m&&s.length>BIG&&s.length%4===0&&B64.test(s)){const bytes=b64ToBytes(s);if(bytesToB64(bytes)===s){const sha=await sha256(bytes);if(!blobs.has(sha))blobs.set(sha,{mediaType:sniff(bytes),bytes});ref={[BLOB]:sha,as:'base64'};}}
    seen.set(s,ref);return ref;
  }
  async function walk(v,depth=0){
    if(depth>200)throw Error('시험지 데이터가 너무 깊습니다.');
    if(typeof v==='string'){if(v.length<64||!(v.startsWith('data:')||v.length>BIG))return v;return (await one(v))||v;}
    if(Array.isArray(v)){const out=new Array(v.length);for(let i=0;i<v.length;i++)out[i]=await walk(v[i],depth+1);return out;}
    if(v&&typeof v==='object'){
      if(Object.hasOwn(v,BLOB))throw Error('예약된 시험지 필드입니다($5eBlob).');
      const out={};for(const k of Object.keys(v)){if(v[k]===undefined)continue;out[k]=await walk(v[k],depth+1);}return out;
    }
    return v;
  }
  return {blobs,walk};
}

// 풀이 검사: work.json에는 요약만, 풀이 과정 전문은 checks/<id>.json에.
const RUN_SUMMARY=['provider','model','isolated','answer','ms'];
const checkSummary=c=>({...c,runs:(c.runs||[]).map(r=>Object.fromEntries(RUN_SUMMARY.filter(k=>r?.[k]!==undefined).map(k=>[k,r[k]]))),full:true});

export async function buildExamsetFile(work){
  if(!work||work.kind!=='examset')throw Error('시험지(examset) 작업 상태가 아닙니다.');
  if(!SAFE.test(work.projectId))throw Error('시험지 프로젝트 ID가 올바르지 않습니다.');
  const {blobs,walk}=makeStash(),entries=[];
  const json=v=>enc.encode(JSON.stringify(v));
  // 판
  const versionFiles=[];
  for(const v of work.versions){
    if(!LABEL.test(v.label))throw Error(`판 이름이 올바르지 않습니다: ${v.label}`);
    if(v.missing)continue;// 못 읽은 판은 새로 쓸 수 없다(원본 덩어리가 없음)
    versionFiles.push({name:`versions/${v.label}.json`,data:json(await walk(v))});
  }
  // 대화(세션별 jsonl). 섞인 순서는 work.json의 chatOrder로 되살린다.
  const {versions,chat,checks,missingBlobs,...rest}=work;
  const chatFiles=new Map(),chatOrder=[];
  for(const m of chat||[]){const id=SAFE.test(String(m?.session??''))?String(m.session):'exam';chatOrder.push(id);if(!chatFiles.has(id))chatFiles.set(id,[]);chatFiles.get(id).push(JSON.stringify(await walk(m)));}
  const checkFiles=[],checkList=[];
  for(const c of checks||[]){if(SAFE.test(String(c?.id??''))){checkFiles.push({name:`checks/${c.id}.json`,data:json(await walk(c))});checkList.push(checkSummary(c));}else checkList.push(c);}
  const workJson={...rest,versions:work.versions.filter(v=>!v.missing).map(v=>v.label),checks:checkList,chatOrder};
  const workData=json(await walk(workJson));
  const blobList=[...blobs.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0);
  const manifest={format:'5e-project',version:1,kind:'examset',projectId:work.projectId,name:String(work.meta?.title||'').slice(0,200),
    schema:work.schema??SCHEMA,minApp:'1.8.0',head:work.head??null,dirty:!!work.dirty,blobs:blobList.map(([sha256,b])=>({sha256,mediaType:b.mediaType,bytes:b.bytes.length}))};
  entries.push({name:'manifest.json',data:json(manifest)},{name:'work.json',data:workData},...versionFiles,
    ...blobList.map(([sha,b])=>({name:`blob/${sha}`,data:b.bytes})),
    ...[...chatFiles.entries()].map(([id,lines])=>({name:`chat/${id}.jsonl`,data:enc.encode(lines.join('\n')+'\n')})),...checkFiles);
  const blob=zipStore(entries),out=new Uint8Array(await blob.arrayBuffer());
  if(out.length>MAX_PROJECT_FILE_BYTES)throw Error('시험지 파일은 최대 128 MiB까지 저장할 수 있습니다.');
  return out;
}

/* ---------- 열기 ---------- */
const u8=v=>v instanceof Uint8Array?v:ArrayBuffer.isView(v)?new Uint8Array(v.buffer,v.byteOffset,v.byteLength):new Uint8Array(v);
function readManifest(files){
  const raw=files.get('manifest.json');if(!raw||raw.length>1024*1024)throw Error('프로젝트 정보가 없습니다.');
  return JSON.parse(dec.decode(raw));
}
export function peekKind(bytes){
  try{const data=u8(bytes);if(!isZip(data))return null;const m=readManifest(unzipStore(data,{maxEntryBytes:MAX_PROJECT_FILE_BYTES,maxTotalBytes:MAX_PROJECT_FILE_BYTES}));
    return m?.format==='5e-project'?String(m.kind):m?.format==='5e-exam'?'exam':null;}
  catch{return null;}
}
class MissingBlob extends Error{constructor(sha){super('빠진 덩어리: '+sha);this.sha=sha;}}

export async function parseExamsetFile(bytes){
  const data=u8(bytes);
  if(data.length>MAX_PROJECT_FILE_BYTES)throw Error('프로젝트 파일이 128 MiB를 초과합니다.');
  if(!isZip(data))throw Error('시험지 파일(.5e)이 아닙니다.');
  const files=unzipStore(data,{maxEntryBytes:MAX_PROJECT_FILE_BYTES,maxTotalBytes:MAX_PROJECT_FILE_BYTES});
  const m=readManifest(files);
  if(m.format!=='5e-project'||m.version!==1)throw Error('지원하는 5E 프로젝트 파일이 아닙니다.');
  if(m.kind!=='examset')throw Error(`시험지(출제) 파일이 아닙니다(종류: ${m.kind}).`);
  if(!Number.isInteger(m.schema)||m.schema>SCHEMA)throw Error('더 새 5E에서 만든 시험지 파일입니다. 5E를 업데이트한 뒤 열어 주세요.');
  if(!Array.isArray(m.blobs))throw Error('시험지 파일의 덩어리 목록이 없습니다.');
  // 목록에 있고, 실제로 있고, 해시가 맞는 덩어리만 쓴다. 되살린 글자는 판끼리 함께 쓴다(메모리에 한 벌).
  const ok=new Map(),text=new Map(),bad=[];
  for(const b of m.blobs){
    if(!b||!SHA.test(b.sha256)||typeof b.mediaType!=='string'){continue;}
    const raw=files.get(`blob/${b.sha256}`);
    if(!raw||await sha256(raw)!==b.sha256){bad.push(b.sha256);continue;}
    ok.set(b.sha256,{mediaType:b.mediaType,bytes:raw});
  }
  const restore=(ref)=>{
    const sha=ref[BLOB],as=ref.as,keys=Object.keys(ref);
    if(typeof sha!=='string'||keys.some(k=>k!==BLOB&&k!=='as')||as!==undefined&&as!=='base64')throw Error('시험지 덩어리 연결이 올바르지 않습니다.');
    const b=ok.get(sha);if(!b)throw new MissingBlob(sha);
    const key=sha+(as||'');if(!text.has(key)){const b64=bytesToB64(b.bytes);text.set(key,as==='base64'?b64:`data:${b.mediaType};base64,${b64}`);}
    return text.get(key);
  };
  const hydrate=(v,depth=0)=>{
    if(depth>200)throw Error('시험지 데이터가 너무 깊습니다.');
    if(Array.isArray(v))return v.map(x=>hydrate(x,depth+1));
    if(v&&typeof v==='object'){if(Object.hasOwn(v,BLOB))return restore(v);const o={};for(const k of Object.keys(v))o[k]=hydrate(v[k],depth+1);return o;}
    return v;
  };
  const readJson=name=>{const raw=files.get(name);if(!raw)return undefined;return JSON.parse(dec.decode(raw));};
  const wraw=readJson('work.json');if(!wraw)throw Error('시험지 작업 상태(work.json)가 없습니다.');
  // 지금 작업 상태에 빠진 덩어리가 있으면 그 자리는 비우고 알린다(파일은 연다).
  const missingInWork=[];
  const hydrateWork=(v,depth=0)=>{
    if(Array.isArray(v))return v.map(x=>hydrateWork(x,depth+1));
    if(v&&typeof v==='object'){if(Object.hasOwn(v,BLOB)){try{return restore(v);}catch(e){if(e instanceof MissingBlob){missingInWork.push(e.sha);return null;}throw e;}}
      const o={};for(const k of Object.keys(v))o[k]=hydrateWork(v[k],depth+1);return o;}
    return v;
  };
  const {versions:labels=[],chatOrder=[],checks:checkList=[],...rest}=hydrateWork(wraw);
  const work={...rest};
  // 판: 덩어리가 빠진 판만 missing으로 둔다.
  work.versions=[];
  for(const label of labels){
    if(!LABEL.test(label))continue;
    const raw=readJson(`versions/${label}.json`);
    if(!raw){work.versions.push({label,missing:true,reason:'판 파일이 없습니다.'});continue;}
    try{work.versions.push(hydrate(raw));}
    catch(e){if(!(e instanceof MissingBlob))throw e;
      const {snapshot,...head}=raw;work.versions.push({...head,snapshot:null,missing:true,reason:'그림 자료가 빠졌습니다.'});}
  }
  // 대화
  const chats=new Map();
  for(const [name,raw] of files)if(name.startsWith('chat/')&&name.endsWith('.jsonl')){
    const id=name.slice(5,-6);chats.set(id,dec.decode(raw).split('\n').filter(Boolean).map(l=>hydrateWork(JSON.parse(l))));}
  work.chat=[];const cursor=new Map();
  for(const id of chatOrder){const list=chats.get(id)||[],i=cursor.get(id)||0;if(i<list.length){work.chat.push(list[i]);cursor.set(id,i+1);}}
  for(const [id,list] of chats)for(let i=cursor.get(id)||0;i<list.length;i++)work.chat.push(list[i]);// 순서표 밖(손으로 고친 파일)
  // 풀이 검사: 전문 파일이 있으면 그것으로, 없으면 요약 그대로.
  work.checks=checkList.map(c=>{if(!c?.full)return c;const full=readJson(`checks/${c.id}.json`);if(full){try{return hydrate(full);}catch{}}const {full:_,...s}=c;return s;});
  work.head=m.head??work.head??null;work.dirty=!!m.dirty;
  if(missingInWork.length||bad.length)work.missingBlobs=[...new Set([...missingInWork,...bad])];
  return work;
}
