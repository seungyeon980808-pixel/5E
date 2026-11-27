// 1.8.0 출제 하네스: 2022 개정 교육과정 성취기준 원문을 앱 안에 묶는다.
// 원본은 korean-secondary-learning-map-mcp 자료(MIT, 성취기준 원문은 저작권법 제7조 제2호 보호 제외 고시 원문).
// 실행: node scripts/build-harness-curriculum.mjs [원본 data/kr 폴더]
//   → assets/harness/data/curriculum-2022.json
// 같은 원본이면 늘 같은 파일이 나온다(정렬 고정, 만든 시각 안 넣음).
// 원본 모양이 기대와 다르면 바로 멈춘다.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';

const DEFAULT_SRC=join(homedir(),'.local/share/mcp/korean-secondary-learning-map-mcp/data/kr');
const SRC=resolve(process.argv[2]||DEFAULT_SRC);
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const OUT=join(ROOT,'assets/harness/data/curriculum-2022.json');

function fail(msg){console.error('[curriculum] 멈춤: '+msg);process.exit(1);}
function need(ok,msg){if(!ok)fail(msg);}
function readJson(name){
  const p=join(SRC,name);
  need(existsSync(p),`원본 파일이 없다: ${p}`);
  try{return JSON.parse(readFileSync(p,'utf8'));}catch(e){fail(`${name}을 읽지 못했다: ${e.message}`);}
}
// 글자 순서(코드 포인트)로만 비교한다. 지역 설정에 따라 순서가 바뀌지 않게.
const cmp=(a,b)=>a<b?-1:a>b?1:0;

const manifest=readJson('manifest.json');
const textsFile=readJson('standard-texts.json');
const curFile=readJson('curriculum-standards.json');

need(manifest&&manifest.counts&&Number.isInteger(manifest.counts.standards),'manifest.json에 counts.standards가 없다');
need(textsFile&&typeof textsFile.version==='string'&&Array.isArray(textsFile.texts),'standard-texts.json 모양이 {version, texts[]}가 아니다');
need(curFile&&Array.isArray(curFile.curricula),'curriculum-standards.json 모양이 {curricula[]}가 아니다');

// 원문: key → {code,text,sourceId}
const texts=new Map();
for(const [i,t] of textsFile.texts.entries()){
  need(t&&typeof t.key==='string'&&typeof t.code==='string'&&typeof t.text==='string'&&typeof t.sourceId==='string',`원문 ${i}번 칸 모양이 이상하다`);
  need(/^\[[^\]\s]+\]$/.test(t.code),`원문 코드 모양이 이상하다: ${t.code}`);
  need(t.key.endsWith(':'+t.code),`원문 key와 code가 맞지 않는다: ${t.key}`);
  need(t.text.trim().length>=5,`원문 글이 비었거나 너무 짧다: ${t.key}`);
  need(!texts.has(t.key),`원문 key가 겹친다: ${t.key}`);
  texts.set(t.key,t);
}

const LEVEL={middle:'m',high:'h'};
const subjects=[];   // 과목 칸 목록
const areas=[],areaIdx=new Map();
const items=[];
const seenKeys=new Set();
const cur=[...curFile.curricula].sort((a,b)=>cmp(a.schoolLevel==='middle'?0:1,b.schoolLevel==='middle'?0:1)||cmp(a.subjectKorean,b.subjectKorean)||cmp(a.id,b.id));
for(const c of cur){
  need(c&&typeof c.id==='string'&&LEVEL[c.schoolLevel]&&typeof c.subjectKorean==='string'&&c.subjectKorean&&Array.isArray(c.standards),`교육과정 칸 모양이 이상하다: ${c&&c.id}`);
  need(c.standards.length>0,`성취기준이 없는 과목: ${c.id}`);
  const si=subjects.length;
  let annex=null;
  const rows=[];
  for(const s of c.standards){
    need(s&&typeof s.key==='string'&&typeof s.code==='string'&&typeof s.domainKorean==='string',`성취기준 칸 모양이 이상하다: ${c.id}`);
    need(s.schoolLevel===c.schoolLevel&&s.subjectKorean===c.subjectKorean,`과목·학교급이 교육과정과 다르다: ${s.key}`);
    need(s.gradeBand===c.gradeBand,`학년군이 교육과정과 다르다: ${s.key}`);
    const t=texts.get(s.key);need(t,`원문이 없는 성취기준: ${s.key}`);
    need(t.code===s.code,`코드가 다르다: ${s.key}`);
    need(!seenKeys.has(s.key),`성취기준이 두 번 나온다: ${s.key}`);seenKeys.add(s.key);
    if(annex===null)annex=t.sourceId;
    need(annex===t.sourceId,`한 과목 안에서 출처 별책이 섞였다: ${c.id}`);
    const area=s.domainKorean.trim();
    let ai=-1;if(area){if(!areaIdx.has(area)){areaIdx.set(area,areas.length);areas.push(area);}ai=areaIdx.get(area);}
    rows.push({c:s.code,s:si,a:ai,t:t.text});
  }
  rows.sort((a,b)=>cmp(a.c,b.c));
  for(const r of rows){const o={c:r.c,s:r.s};if(r.a>=0)o.a=r.a;o.t=r.t;items.push(o);}
  subjects.push({n:c.subjectKorean,l:LEVEL[c.schoolLevel],g:String(c.gradeBand||''),grp:String(c.subjectGroupKorean||''),cat:String(c.courseCategory||''),x:annex});
}

need(items.length===texts.size,`원문 수(${texts.size})와 묶은 성취기준 수(${items.length})가 다르다`);
need(items.length===manifest.counts.standards,`manifest 성취기준 수(${manifest.counts.standards})와 다르다(${items.length})`);
if(Number.isInteger(manifest.counts.curricula))need(subjects.length===manifest.counts.curricula,`manifest 과목 수(${manifest.counts.curricula})와 다르다(${subjects.length})`);

// 서로 다른 과목이 같은 코드를 쓰는 경우(원본 그대로). ref를 나눌 때 쓴다.
const codeCount=new Map();for(const it of items)codeCount.set(it.c,(codeCount.get(it.c)||0)+1);
const dupCodes=[...codeCount].filter(([,n])=>n>1).map(([c])=>c).sort(cmp);

let pkgVersion='';
try{pkgVersion=JSON.parse(readFileSync(join(SRC,'../../package.json'),'utf8')).version||'';}catch{}

const ANNEX={
  annex3:'[별책3] 중학교 교육과정 · 교육부 고시 제2022-33호',
  annex4:'[별책4] 고등학교 교육과정 · 교육부 고시 제2022-33호',
  annex20:'[별책20] 과학 계열 선택 과목 교육과정 · 교육부 고시 제2022-33호',
  annex21:'[별책21] 체육 계열 선택 과목 교육과정 · 교육부 고시 제2022-33호',
  annex22:'[별책22] 예술 계열 선택 과목 교육과정 · 국가교육위원회 고시 제2024-3호',
};
const usedAnnex=[...new Set(subjects.map(s=>s.x))].sort(cmp);
for(const a of usedAnnex)need(ANNEX[a],`모르는 출처 별책: ${a} (스크립트의 ANNEX 표에 넣어야 한다)`);

const out={
  meta:{
    edition:'2022',
    count:items.length,
    subjectCount:subjects.length,
    middle:items.filter(it=>subjects[it.s].l==='m').length,
    high:items.filter(it=>subjects[it.s].l==='h').length,
    source:'korean-secondary-learning-map-mcp'+(pkgVersion?' '+pkgVersion:'')+' (https://github.com/raphysicst-create/korean-secondary-learning-map-mcp) data/kr',
    license:'자료 묶음: MIT (Copyright (c) 2026 raphysicst-create). 성취기준 원문: 저작권법 제7조 제2호에 따라 보호받지 않는 고시 원문.',
    attribution:'성취기준 원문 출처: 교육부 고시 제2022-33호 별책3·4·20·21, 국가교육위원회 고시 제2024-3호 별책22 (국가교육과정정보센터 NCIC·교육부 공개 PDF). 추출·정규화 자료: korean-secondary-learning-map-mcp (MIT, © 2026 raphysicst-create).',
    builtFrom:`${textsFile.version} · ${manifest.taxonomyVersion||''} · ${manifest.generatedAt||''}`,
    note:'공백·줄바꿈은 원본에서 정규화됨. 국가교육위원회 고시 제2026-1호(2026.1.21.)의 별책3·4 개정분은 반영되지 않음. 이 자료는 교육부·국가교육위원회·NCIC의 공식 산출물이 아님.',
    sources:Object.fromEntries(usedAnnex.map(a=>[a,ANNEX[a]])),
    duplicateCodes:dupCodes,
    keys:{
      subjects:'과목 목록. n=과목 이름, l=학교급(m 중학교·h 고등학교), g=학년군, grp=교과(군), cat=과목 구분(common 공통·general-elective 일반 선택·career-elective 진로 선택·convergence-elective 융합 선택·middle-elective 중학교 선택), x=원문 출처 별책(meta.sources)',
      areas:'영역 이름 목록',
      items:'성취기준. c=코드(대괄호 포함), s=subjects 번호, a=areas 번호(없으면 빠짐), t=공식 원문',
    },
  },
  subjects,
  areas,
  items,
};

mkdirSync(dirname(OUT),{recursive:true});
const body=JSON.stringify(out);
writeFileSync(OUT,body+'\n');
const bytes=Buffer.byteLength(body)+1;
console.log(`[curriculum] 원본: ${SRC}`);
console.log(`[curriculum] 성취기준 ${items.length}개 (중 ${out.meta.middle} · 고 ${out.meta.high}) · 과목 ${subjects.length}개 (중 ${subjects.filter(s=>s.l==='m').length} · 고 ${subjects.filter(s=>s.l==='h').length}) · 영역 ${areas.length}개 · 같은 코드 ${dupCodes.length}개`);
console.log(`[curriculum] ${OUT} · ${(bytes/1024).toFixed(0)}KB (${bytes} 바이트)`);
if(bytes>2.5*1024*1024)console.log('[curriculum] 주의: 2.5MB가 넘는다. 학교급·교과별로 나누는 것을 검토할 것.');
