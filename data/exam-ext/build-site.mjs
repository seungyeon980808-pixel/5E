// 기출확장_국영수사탐 정적 Worker(5e-exam-ext) 올릴 묶음 만들기(11-19, 아직 올리지 않음).
// 받은 PDF 폴더(fetch-from-gateway.mjs 결과, 또는 드라이브 「기출확장_국영수사탐」을 동기화한 폴더 — 둘 다 <과목>/<파일> 모양)를
// data/exam-ext/site/v1/기출문제/기출확장_국영수사탐/<과목>/<파일> 로 링크한다(복사 안 함).
// 경로를 기출 탐색기 publicPath와 똑같이 두어, 앱은 STATIC 주소만 바꿔 staticLink(path)를 그대로 쓴다(5e-exam-pdf와 같은 방식).
// 실행: EXAM_EXT_SRC=<PDF 폴더> node data/exam-ext/build-site.mjs
//       && npx wrangler@4 deploy --config cloudflare/exam-ext/wrangler.jsonc   ← 사용자 승인 뒤에만
import {readFileSync,existsSync,statSync,mkdirSync,symlinkSync,lstatSync,readlinkSync,unlinkSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url)),site=join(here,'site');
const SRC=process.env.EXAM_EXT_SRC&&resolve(process.env.EXAM_EXT_SRC);
if(!SRC){console.error('EXAM_EXT_SRC에 기출확장 PDF 폴더(<과목>/<파일> 모양)를 적어 주세요.');process.exit(1);}
const PREFIX='기출문제/기출확장_국영수사탐/',LIMIT_FILES=20000,LIMIT_BYTES=25*1024*1024;
const list=JSON.parse(readFileSync(join(here,'files.json'),'utf8')).files;
const CHECK_MD5=process.env.CHECK_MD5!=='0';
const problems=[];
for(const f of list){const src=join(SRC,f.path.slice(PREFIX.length));
  if(!existsSync(src)){problems.push(`없음: ${f.path}`);continue;}
  const size=statSync(src).size;
  if(size!==f.bytes)problems.push(`크기 다름: ${f.path} (${size} ≠ ${f.bytes})`);
  if(size>LIMIT_BYTES)problems.push(`25MiB 넘음: ${f.path}`);
  if(CHECK_MD5&&f.md5&&createHash('md5').update(readFileSync(src)).digest('hex')!==f.md5)problems.push(`MD5 다름: ${f.path}`);}
if(problems.length){console.error(`묶음을 만들 수 없습니다(${problems.length}건):\n`+problems.slice(0,20).join('\n'));process.exit(1);}
if(list.length+1>LIMIT_FILES){console.error(`파일 수 ${list.length}개가 Worker 한도(${LIMIT_FILES})를 넘습니다.`);process.exit(1);}
// 목록에 없는 옛 링크는 지운다(다시 만들 때 남은 것이 올라가지 않게).
const want=new Set(list.map(f=>join(site,'v1',f.path)));
(function prune(dir){if(!existsSync(dir))return;for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);
  if(e.isDirectory())prune(p);else if(p.endsWith('.pdf')&&!want.has(p))unlinkSync(p);}})(join(site,'v1'));
let made=0;
for(const f of list){const src=join(SRC,f.path.slice(PREFIX.length)),dst=join(site,'v1',f.path);mkdirSync(dirname(dst),{recursive:true});
  let ok=false;try{ok=lstatSync(dst).isSymbolicLink()&&readlinkSync(dst)===src;}catch{}
  if(!ok){try{unlinkSync(dst);}catch{}symlinkSync(src,dst);made++;}}
writeFileSync(join(site,'_headers'),'/v1/*\n  Access-Control-Allow-Origin: *\n  Access-Control-Expose-Headers: Content-Length, ETag\n  Cache-Control: public, max-age=86400\n');
const total=list.reduce((s,f)=>s+f.bytes,0);
console.log(`기출확장 PDF ${list.length}개 · ${(total/1e6).toFixed(1)}MB · 새 링크 ${made}개 → ${site}`);
