// 기출확장 올릴 목록 만들기(11-19): 기출 탐색기(exam-search) data/files.json에서 「기출문제/기출확장_국영수사탐/」 경로만 뽑고,
// 게이트웨이 HEAD로 크기(content-length)와 드라이브 MD5(ETag)를 적어 data/exam-ext/files.json에 쓴다.
// 정답표(사이트가 쓰지 않음)는 목록에 없으므로 올리지 않는다.
// 실행: EXAM_SEARCH_FILES=<exam-search의 data/files.json> node data/exam-ext/list-from-exam-search.mjs
//   (예: git -C <exam-search> show origin/main:data/files.json > /tmp/files.json)
import {readFileSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const SRC=process.env.EXAM_SEARCH_FILES;
if(!SRC){console.error('EXAM_SEARCH_FILES에 exam-search의 data/files.json 경로를 적어 주세요.');process.exit(1);}
const GATEWAY='https://5e-google-drive-gateway.5e-desktop.workers.dev/v1/google-drive/folders/1ckc6lPTmGobFNf8Zv0zMuwR5Gg3qykGo/public/';
const PREFIX='기출문제/기출확장_국영수사탐/';
const paths=[...new Set(JSON.parse(readFileSync(SRC,'utf8')).map(f=>f.publicPath).filter(p=>p?.startsWith(PREFIX)))].sort();
const out=[];let i=0;const bad=[];
async function worker(){while(i<paths.length){const p=paths[i++];const url=GATEWAY+p.slice(PREFIX.length).split('/').map(encodeURIComponent).join('/');
  let ok=false;for(let t=0;t<4&&!ok;t++){try{const r=await fetch(url,{method:'HEAD'});if(r.status===200){out.push({path:p,bytes:+r.headers.get('content-length'),md5:(r.headers.get('etag')||'').replace(/"/g,'')});ok=true;}else if(r.status<500)break;}catch{}}
  if(!ok)bad.push(p);}}
await Promise.all(Array.from({length:6},worker));
out.sort((a,b)=>a.path<b.path?-1:1);
const bytes=out.reduce((s,f)=>s+f.bytes,0);
writeFileSync(join(here,'files.json'),JSON.stringify({note:'기출확장_국영수사탐 문제지(기출 탐색기가 쓰는 것만). list-from-exam-search.mjs가 만듦.',made:new Date().toLocaleDateString('sv-SE'),count:out.length,bytes,files:out},null,0).replace(/\},\{/g,'},\n{')+'\n');
console.log(`목록 ${out.length}개 · ${bytes}바이트${bad.length?` · 게이트웨이 HEAD 실패 ${bad.length}개`:''}`);
if(bad.length){console.error(bad.slice(0,10));process.exit(2);}
