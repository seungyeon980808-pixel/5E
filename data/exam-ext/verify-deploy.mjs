// 5e-exam-ext를 올린 뒤 확인(11-19): 목록 401개를 HEAD해 200·크기·CORS 머리글을 맞춰 본다. 읽기만 한다.
// 실행: node data/exam-ext/verify-deploy.mjs [기본 주소]   (기본: https://5e-exam-ext.5e-desktop.workers.dev/v1/)
import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const BASE=process.argv[2]||'https://5e-exam-ext.5e-desktop.workers.dev/v1/';
const list=JSON.parse(readFileSync(join(here,'files.json'),'utf8')).files;
let i=0,ok=0,bytes=0;const bad=[];
async function worker(){while(i<list.length){const f=list[i++];const url=BASE+f.path.split('/').map(encodeURIComponent).join('/');
  try{const r=await fetch(url,{method:'HEAD'});const len=+r.headers.get('content-length');
    if(r.status!==200)bad.push(`${r.status} ${f.path}`);
    else if(len!==f.bytes)bad.push(`크기 ${len}≠${f.bytes} ${f.path}`);
    else if(r.headers.get('access-control-allow-origin')!=='*')bad.push(`CORS 없음 ${f.path}`);
    else{ok++;bytes+=len;}}catch(e){bad.push(`오류 ${f.path} ${e.message}`);}}}
await Promise.all(Array.from({length:6},worker));
console.log(`${BASE}: ${ok}/${list.length} 통과 · ${bytes}바이트`);
if(bad.length){console.error(bad.slice(0,20).join('\n'));process.exit(1);}
