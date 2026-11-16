// 기출 시험지 PDF 정적 내보내기(11-03): Cloudflare Workers 정적 파일(무료·카드 없이)로 PDF를 바로 내보낸다.
// 드라이브 게이트웨이는 받을 때마다 경로를 찾느라 1~5초, 가끔 멈춰 12초씩 다시 시도했다.
// 원본은 이 맥에 동기화된 드라이브 공유 폴더 그대로 — 복사하지 않고 링크만 만든다(site/v1/<공유 폴더 안 경로>).
// 올릴 목록 = 5E 색인(평가원 index.json + 학평 hakpyeong/index.json)의 publicPath.
// 미리 변환한 문항(preconvert.cjs → q-kice/·q-hakpyeong/)도 site/q/·site-hak/q/에 링크한다. 학평 문항은 파일 수 한도(2만) 때문에 따로(5e-exam-hak).
// 실행: node exam-pdf/build-site.mjs && (cd exam-pdf && npx wrangler@4 deploy --config wrangler.jsonc && npx wrangler@4 deploy --config wrangler-hak.jsonc)
import {readFileSync,existsSync,statSync,mkdirSync,symlinkSync,lstatSync,readlinkSync,unlinkSync,writeFileSync,readdirSync,openSync,readSync,closeSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import os from 'node:os';

const here=dirname(fileURLToPath(import.meta.url)),repo=join(here,'..'),site=join(here,'site');
const ROOT=process.env.EXAM_PDF_ROOT||join(os.homedir(),'Library/CloudStorage/GoogleDrive-park49174332@gmail.com/내 드라이브/1. 개인작업/5E_공유폴더테스트_0916');
const paths=[...new Set(['assets/exampool/convert/data/index.json','assets/exampool/convert/data/hakpyeong/index.json']
  .flatMap(f=>Object.values(JSON.parse(readFileSync(join(repo,f),'utf8')).files)))].sort();
const missing=paths.filter(p=>!existsSync(join(ROOT,p)));
if(missing.length){console.error(`원본 폴더에 없는 파일 ${missing.length}개:`,missing.slice(0,5));process.exit(1);}
const big=paths.filter(p=>statSync(join(ROOT,p)).size>25*1024*1024);
if(big.length){console.error('25MB 넘는 파일(정적 파일 한도):',big);process.exit(1);}
let made=0;
for(const p of paths){const src=join(ROOT,p),dst=join(site,'v1',p);mkdirSync(dirname(dst),{recursive:true});
  let ok=false;try{ok=lstatSync(dst).isSymbolicLink()&&readlinkSync(dst)===src;}catch{}
  if(!ok){try{unlinkSync(dst);}catch{}symlinkSync(src,dst);made++;}}
// 11-05: 라이브러리 「5E 제공」 자료팩 색인(pack·checksums·catalog·search-index)도 올린다(js/pdf-library/static-mirror.js).
// search-index.json(33MB)은 정적 파일 한도(25MB)를 넘어 16MB 조각으로 나눠 복사한다. 이어 붙인 뒤 앱이 SHA-256으로 확인한다.
for(const f of ['pack.json','checksums.json','catalog.json']){const src=join(ROOT,f),dst=join(site,'v1',f);try{unlinkSync(dst);}catch{}symlinkSync(src,dst);}
{const src=join(ROOT,'search-index.json'),size=statSync(src).size,PART=16*1024*1024,n=Math.ceil(size/PART),fd=openSync(src,'r');
  for(const f of readdirSync(join(site,'v1')).filter(f=>f.startsWith('search-index.json.part')))unlinkSync(join(site,'v1',f));
  for(let i=0;i<n;i++){const len=Math.min(PART,size-i*PART),buf=Buffer.alloc(len);readSync(fd,buf,0,len,i*PART);writeFileSync(join(site,'v1',`search-index.json.part${i}`),buf);}
  closeSync(fd);writeFileSync(join(site,'v1','search-index.json.parts.json'),JSON.stringify({parts:n,bytes:size}));console.log(`자료팩 색인: search-index ${n}조각 · ${(size/1e6).toFixed(1)}MB`);}
const HEAD='  Access-Control-Allow-Origin: *\n  Access-Control-Expose-Headers: Content-Length, ETag\n  Cache-Control: public, max-age=86400\n';
writeFileSync(join(site,'_headers'),`/v1/*\n${HEAD}/q/*\n${HEAD}`);
// 미리 변환한 문항 링크
function linkQ(from,to){if(!existsSync(from))return 0;mkdirSync(to,{recursive:true});let n=0;
  for(const f of readdirSync(from).filter(f=>f.endsWith('.json')&&f!=='failed.json')){const src=join(from,f),dst=join(to,f);let ok=false;try{ok=lstatSync(dst).isSymbolicLink()&&readlinkSync(dst)===src;}catch{}if(!ok){try{unlinkSync(dst);}catch{}symlinkSync(src,dst);}n++;}return n;}
const qk=linkQ(join(here,'q-kice'),join(site,'q')),siteHak=join(here,'site-hak');mkdirSync(siteHak,{recursive:true});
const qh=linkQ(join(here,'q-hakpyeong'),join(siteHak,'q'));writeFileSync(join(siteHak,'_headers'),`/q/*\n${HEAD}`);
console.log(`미리 변환: 평가원 ${qk}개(site/q) · 학평 ${qh}개(site-hak/q)`);
const total=paths.reduce((s,p)=>s+statSync(join(ROOT,p)).size,0);
console.log(`PDF ${paths.length}개 · ${(total/1e6).toFixed(0)}MB · 새 링크 ${made}개 → ${site}`);
