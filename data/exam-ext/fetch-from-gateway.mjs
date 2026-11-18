// 기출확장_국영수사탐 문제지 PDF를 드라이브 게이트웨이에서 내려받는다(읽기만, 11-19).
// 왜: 이 PDF들은 지금 드라이브 게이트웨이(5e-google-drive-gateway)로만 나간다. 정적 Worker 5e-exam-ext로 옮기려면
//     올릴 파일을 이 맥에 한 번 모아야 한다. 드라이브 원본은 과목 폴더 아래 평평하게(<과목>/<파일>) 있어 그 모양 그대로 받는다.
// 목록: data/exam-ext/files.json(기출 탐색기 exam-search의 data/files.json에서 확장 경로만 뽑은 것, list-from-exam-search.mjs가 만듦).
// 실행: EXAM_EXT_SRC=<받을 폴더> node data/exam-ext/fetch-from-gateway.mjs
//   - 이미 받은 파일은 크기·MD5가 맞으면 건너뛴다(다시 실행해도 됨).
//   - 받은 바이트의 MD5를 게이트웨이 ETag(드라이브 md5Checksum)·목록의 md5와 맞춰 본다.
import {readFileSync,existsSync,mkdirSync,writeFileSync,renameSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const OUT=process.env.EXAM_EXT_SRC;
if(!OUT){console.error('EXAM_EXT_SRC에 PDF를 받을 폴더를 적어 주세요. 예: EXAM_EXT_SRC=~/Work/<날짜>_exam-ext/pdf node data/exam-ext/fetch-from-gateway.mjs');process.exit(1);}
const GATEWAY='https://5e-google-drive-gateway.5e-desktop.workers.dev/v1/google-drive/folders/1ckc6lPTmGobFNf8Zv0zMuwR5Gg3qykGo/public/';
const PREFIX='기출문제/기출확장_국영수사탐/';
const list=JSON.parse(readFileSync(join(here,'files.json'),'utf8')).files;
const CONCURRENCY=Number(process.env.CONCURRENCY||4),STALL_MS=20000,TRIES=6;
const md5=b=>createHash('md5').update(b).digest('hex');

async function getOnce(url){
  const ac=new AbortController();let t;const arm=()=>{clearTimeout(t);t=setTimeout(()=>ac.abort(),STALL_MS);};arm();
  try{const r=await fetch(url,{signal:ac.signal});if(!r.ok)return{status:r.status};
    const reader=r.body.getReader(),chunks=[];for(;;){arm();const{done,value}=await reader.read();if(done)break;chunks.push(value);}
    return{status:200,etag:(r.headers.get('etag')||'').replace(/"/g,''),buf:Buffer.concat(chunks)};}
  finally{clearTimeout(t);}
}

let next=0,got=0,skipped=0;const failed=[];
async function worker(){
  while(next<list.length){const item=list[next++];const rel=item.path.slice(PREFIX.length),dst=join(OUT,rel);
    if(existsSync(dst)&&statSync(dst).size===item.bytes&&(!item.md5||md5(readFileSync(dst))===item.md5)){skipped++;continue;}
    const url=GATEWAY+rel.split('/').map(encodeURIComponent).join('/');let last='';
    for(let i=0;i<TRIES;i++){
      try{const r=await getOnce(i?`${url}?retry=${Date.now()}`:url);
        if(r.status!==200){last=`HTTP ${r.status}`;if(r.status<500&&r.status!==429)break;await new Promise(s=>setTimeout(s,1500*(i+1)));continue;}
        const h=md5(r.buf);
        if(r.etag&&r.etag!==h){last=`MD5 다름(ETag ${r.etag}, 받은 것 ${h})`;continue;}
        if(item.md5&&item.md5!==h){last=`목록 MD5 다름(${item.md5} ≠ ${h})`;continue;}
        if(item.bytes&&item.bytes!==r.buf.length){last=`크기 다름(${item.bytes} ≠ ${r.buf.length})`;continue;}
        mkdirSync(dirname(dst),{recursive:true});writeFileSync(dst+'.part',r.buf);renameSync(dst+'.part',dst);got++;last='';break;
      }catch(e){last=String(e?.name==='AbortError'?'응답 멈춤':e?.message||e);}
    }
    if(last)failed.push({path:item.path,error:last});
    const done=got+skipped+failed.length;if(done%25===0)console.log(`${done}/${list.length} (받음 ${got} · 건너뜀 ${skipped} · 실패 ${failed.length})`);
  }
}
await Promise.all(Array.from({length:CONCURRENCY},worker));
writeFileSync(join(OUT,'..','fetch-result.json'),JSON.stringify({when:new Date().toISOString(),total:list.length,got,skipped,failed},null,1));
console.log(`끝: ${list.length}개 중 받음 ${got} · 건너뜀 ${skipped} · 실패 ${failed.length}`);
if(failed.length){console.error(failed.slice(0,10));process.exit(2);}
