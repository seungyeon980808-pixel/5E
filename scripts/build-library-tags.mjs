// 11-05: 라이브러리 「문항」 검색·조건용 작은 색인 — exam 기출 색인(assets/exampool/convert/data)에서 문항마다
// 단원·태그·그림/표/〈보기〉 여부만 뽑는다(본문 글은 라이브러리 자료팩 색인에 이미 있다).
// 실행: node scripts/build-library-tags.mjs → assets/exampool/convert/data/library-tags.json
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
const dir=new URL('../assets/exampool/convert/data/',import.meta.url);
const rows=[];
for(const f of readdirSync(dir).filter(f=>/^[pbce][12]\.json$/.test(f)))rows.push(...JSON.parse(readFileSync(new URL(f,dir),'utf8')));
for(const f of readdirSync(new URL('hakpyeong/',dir)).filter(f=>/^[pbce][12]\.json\.gz$/.test(f)))rows.push(...JSON.parse(gunzipSync(readFileSync(new URL('hakpyeong/'+f,dir)))));
const parts=[],tags=[],P=new Map(),T=new Map();
const ref=(list,map,v)=>{if(!map.has(v)){map.set(v,list.length);list.push(v);}return map.get(v);};
const items={};
for(const r of rows){const [id,,,,,,,pt,tg,fig,,text]=r;const t=String(text||'');
  const shape=(fig?1:0)|(/구\s*분|표는|표\s*\(|표와|표에/.test(t)?2:0)|(/<\s*보\s*기\s*>/.test(t)?4:0);
  items[id]=[pt.map(v=>ref(parts,P,v)),tg.map(v=>ref(tags,T,v)),shape];}
const syn=JSON.parse(readFileSync(new URL('synonyms.json',dir),'utf8')).map||{};
const out={schema:'library-tags-v1',parts,tags,synonyms:syn,items};
writeFileSync(new URL('library-tags.json',dir),JSON.stringify(out));
console.log(`문항 ${rows.length}개 · 단원 ${parts.length} · 태그 ${tags.length} · ${(JSON.stringify(out).length/1024).toFixed(0)}KB`);
