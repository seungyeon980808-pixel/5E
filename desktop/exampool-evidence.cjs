// ExamPool 출제 대화용 근거 검색(읽기 전용). 브라우저는 SQLite를 직접 읽지 못하므로 로컬 서버가
// 기존 검색 도구(search_evidence.py)를 정해진 인자로만 실행한다. 모델이 경로·SQL·명령을 정하지 않는다.
// 설정: FIVE_E_EVIDENCE_DB(근거 DB), FIVE_E_EVIDENCE_TOOL(search_evidence.py), FIVE_E_EVIDENCE_PYTHON(기본 python3).
// 없으면 이 기기의 출제 스킬 설정(local-database.json)을 읽는다. 어느 쪽도 없으면 '근거 미확보'로 답한다.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const KINDS={curriculum:'curriculum',past:'items',claim:'claims',textbook:'pages'};
// 파이썬은 서버의 PATH가 짧아도 찾도록 후보를 차례로 본다(표준 라이브러리만 쓰는 검색 도구).
const PYTHONS=[path.join(os.homedir(),'.local/share/mise/installs/python/latest/bin/python3'),'/opt/homebrew/bin/python3','/usr/local/bin/python3','/usr/bin/python3'];
function locate(env=process.env){
  let db=env.FIVE_E_EVIDENCE_DB||'',tool=env.FIVE_E_EVIDENCE_TOOL||'',cfg={};
  try{cfg=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.codex/skills/exam-item-authoring/references/local-database.json'),'utf8'));}catch{}
  // 공유 폴더(드라이브)에 둔 DB 옆의 scripts/ 검색 도구를 자동으로 고르지 않는다 — 폴더 편집 권한이 있는 사람이 그 파이썬 파일을 바꾸면
  // 이 맥에서 코드가 실행됐다(R1). 검색 도구는 FIVE_E_EVIDENCE_TOOL이나 이 맥의 스킬 설정(query_tool)으로만 정한다. 공유 폴더에는 DB만 둔다.
  db||=cfg.database||'';tool||=cfg.query_tool||'';
  const python=env.FIVE_E_EVIDENCE_PYTHON||[...PYTHONS,cfg.query_python].find(p=>p&&fs.existsSync(p))||'python3';
  return {db,tool,python,available:Boolean(db&&tool&&fs.existsSync(db)&&fs.existsSync(tool))};
}
const clip=(v,n)=>{const s=String(v??'').replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n)+'…':s;};
const idOf=(...parts)=>'ev-'+crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0,12);
// 검색 결과를 출제 대화에 넘길 작은 꼴로 줄인다. 판정은 도구가 준 기본값(근거 미확보·판독 미확인)을 그대로 둔다.
function compact(kind,raw){
  const out=[];
  for(const r of raw.results||[]){
    if(kind==='curriculum'){
      const u=r.unit||{},title=typeof u.title==='string'?u.title:u.title?.raw_text||u.heading?.raw_text||'';
      const standards=(u.standards||[]).slice(0,4),seg=standards[0]?.segments?.[0]||{};
      const ctx=Object.entries(u.contexts||{}).flatMap(([k,v])=>(v||[]).slice(0,1).map(x=>`${{explanation:'해설',assessment:'평가',considerations:'고려 사항'}[k]||k}: ${clip(x.raw_text,220)}`));
      out.push({ref:idOf(r.document_sha256,r.revision,title,standards.map(x=>x.code).join()),kind:'curriculum',title:clip(`${r.edition||''} 개정 ${r.school_band||''} ${title}`,300),quote:clip([...standards.map(x=>x.display_text||x.native_text),...ctx].join(' / '),1200),edition:r.edition||null,schoolBand:r.school_band||null,codes:standards.map(x=>x.code),sha256:r.document_sha256||null,page:Number.isInteger(seg.page_no)?seg.page_no:null,bbox:Array.isArray(seg.bbox)?seg.bbox:null,judgement:'missing'});
    }else if(kind==='items'){
      out.push({ref:idOf(r.item_id),kind:'past',title:clip(`기출 ${r.item_id}${r.exam_identity?.reviewed_original_subject?' · '+r.exam_identity.reviewed_original_subject:''}`,300),quote:clip(r.text,900),sha256:r.document_sha256||null,page:r.page_no||null,bbox:Array.isArray(r.bbox)?r.bbox:null,judgement:r.judgement==='reading_unverified'?'unreadable':'missing',note:clip(r.note,300),reviewedClaims:(r.reviewed_claims||[]).slice(0,3).map(c=>({statement:clip(c.statement,300),truth:c.truth_status,judgement:c.judgement}))});
    }else if(kind==='claims'){
      const ev=(r.evidence||[])[0]||{};
      out.push({ref:idOf(r.claim_id),kind:'claim',title:clip(`검토 명제 ${r.claim_id}`,200),quote:clip(r.statement,700),conditions:r.conditions||null,truth:r.truth_status||null,sha256:ev.document_sha256||null,page:ev.page_no||null,judgement:'missing',note:'검토된 출처 명제이나 지금 문장에 그대로 적용되는지는 따로 대조해야 함'});
    }else{
      out.push({ref:idOf(r.document_sha256,r.page_no),kind:'textbook',title:clip(`${path.basename(r.path||'자료')} ${r.page_no}쪽`,300),quote:clip(r.text,900),sha256:r.document_sha256||null,page:r.page_no||null,judgement:r.judgement==='reading_unverified'?'unreadable':'missing'});
    }
  }
  return out;
}
function search(request,{env=process.env,run=execFile}={}){
  const kind=KINDS[request?.kind];if(!kind)return Promise.reject(Error('근거 검색 종류는 curriculum·past·claim·textbook입니다.'));
  const terms=(Array.isArray(request.terms)?request.terms:[request.query]).map(t=>String(t??'').normalize('NFC').trim()).filter(Boolean).slice(0,5);
  if(!terms.length||terms.some(t=>t.length>80||/[\0\r\n]/.test(t)))return Promise.reject(Error('검색어는 80자 이하 1~5개입니다.'));
  const limit=Math.max(1,Math.min(8,Number(request.limit)||5)),edition=['2015','2022'].includes(request.edition)?request.edition:null;
  const where=locate(env);
  if(!where.available)return Promise.resolve({available:false,kind:request.kind,results:[],warning:'근거 DB를 찾지 못했습니다. 검색 결과 없음은 거짓의 증거가 아니며, 근거는 미확보로 남습니다.'});
  const args=['-E','-s',where.tool,'--db',where.db,'--sentence',clip(request.sentence||terms.join(' '),300),...terms.flatMap(t=>['--term',t]),'--kind',kind,'--limit',String(limit),...(edition&&kind==='curriculum'?['--curriculum-edition',edition]:[])];
  return new Promise(resolve=>{
    run(where.python,args,{cwd:os.tmpdir(),timeout:45000,maxBuffer:16*1024*1024,env:{PATH:process.env.PATH,HOME:os.homedir(),LANG:'ko_KR.UTF-8'}},(error,stdout,stderr)=>{
      let raw=null;try{raw=JSON.parse(String(stdout||''));}catch{}
      if(!raw)return resolve({available:false,kind:request.kind,results:[],warning:`근거 검색을 실행하지 못했습니다(${clip(String(stderr||'').split('\n').filter(Boolean).pop()||[error?.code,error?.signal,error?.killed?'시간 초과':''].filter(Boolean).join(' ')||error?.message||'응답 없음',200)}). 근거는 미확보로 남습니다.`});
      resolve({available:raw.availability!=='unavailable'&&raw.availability!=='temporarily_busy',kind:request.kind,terms,results:compact(kind,raw),warning:raw.warning||'',coverageWarning:raw.coverage_warning||undefined});
    });
  });
}
module.exports={search,locate,compact};
