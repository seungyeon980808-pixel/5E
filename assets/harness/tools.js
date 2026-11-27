// 1.8.0 출제 하네스 새 엔진 — AI가 부르는 5E 도구(11-27 계획-엔진전환 3절).
// 도구는 화면(app.js)이 넘겨 준 api로만 일한다. 규칙 판정은 guard.js(순수 함수)가 하고, 여기서는 그 판정대로 실행한다.
// 고침의 길은 하나다: 변경 → (계약 미리 적용으로 검사) → 제안 만들기 → 권한·안전망을 지나면 그 제안을 바로 받음. 아니면 제안으로 남김.
import {teacherIntent,checkDirect,checkAccept,normalizeChange,staleReason,PERMISSION_LABEL,isPlaceholder,teacherPlanText,wantsPlanApply,saidByTeacher} from './guard.js';

const obj=(properties,required=[])=>({type:'object',properties,required});
const S={str:d=>({type:'string',description:d}),int:d=>({type:'integer',description:d})};
const clip=(v,n)=>{const s=String(v??'');return s.length>n?s.slice(0,n)+'…':s;};

// 한 차례 동안의 장부(바로 고친 칸 수, 이번에 만든 제안, 되돌리기용 사본, 선생님께 물을 것).
// 만드는 도구 장부(11-27 저녁): info 정한 시험지 정보 · planFirst 설계표가 이번에 처음 생김 · planNew 이번에 저장한 설계표 안 · bumped 올린 판 · started 뒤에서 시작한 일 · ruleCards 규칙 저장 물음 카드.
export function newTurnState(text){return {text:String(text||''),intent:teacherIntent(text),applied:0,created:new Set(),undo:null,changes:[],asks:[],proposed:[],
  info:[],planFirst:false,planNew:new Set(),bumped:null,started:[],ruleCards:[]};}

export function createTools(api){
  const {X,CIRCLED}=api;const work=()=>api.work();
  const qs=()=>X.orderedQuestions(work());
  const byNo=no=>qs().find(q=>String(q.number)===String(no));
  const noSuch=no=>({error:`${no}번 문항이 없어요. 문항 번호: ${qs().map(q=>q.number).join(', ')||'없음'}`});
  const lockNames=q=>(q.locks||[]).map(l=>api.cellLabel(q,l.key));
  const where=c=>c.path==='choice'?`선지 ${CIRCLED[c.index]}`:c.path==='bogi'?`보기 ${c.line}`:c.path==='block'?`자료 「${c.id}」`:({ask:'발문',passage:'지문',explanation:'해설',answer:'정답',points:'배점'})[c.path];
  // 되돌리기용 사본: 이번 차례에 처음 바로 고치기 직전의 상태를 한 번만 떠 둔다.
  const snapshot=turn=>{if(turn.undo)return;const w=work();turn.undo={questions:JSON.stringify(w.questions),comments:JSON.stringify(w.comments),proposals:JSON.stringify((w.proposals||[]).map(p=>[p.id,p.state])),pendingEdits:JSON.stringify(w.pendingEdits||[]),pendingApplied:JSON.stringify(w.pendingApplied??null),marks:JSON.stringify(w.ui?.aiMarks||[])};};

  const tools={
    read_exam:{description:'지금 시험지의 정보·설계표·문항 목록·판·코멘트 수·열린 제안을 읽는다. 시험지에 대해 답하거나 일하기 전에 부른다.',inputSchema:obj({}),
      run:()=>{const w=work();return {title:w.meta.title||'(이름 없음)',permission:PERMISSION_LABEL[api.permission()],
        info:Object.fromEntries(X.META_KEYS.filter(k=>w.meta[k]?.value!=null&&w.meta[k].value!=='').map(k=>[k,w.meta[k].value])),missing:X.missingBlocking(w),
        plan:w.plan.map(r=>({no:r.no,unit:r.unit,difficulty:r.difficulty,points:r.points,form:r.form,figure:r.figure,hasQuestion:!!r.qid})),
        questions:qs().map(q=>({no:q.number,type:q.type,points:q.points,answer:q.answer!=null?CIRCLED[q.answer]:null,lockedCells:lockNames(q)})),
        version:w.head||'v0.0',editsNotInVersion:api.pendingCount(),comments:X.commentCounts(w),
        openProposals:api.openProposals().map(p=>({proposalId:p.id,no:w.questions.find(q=>q.id===p.qid)?.number,summary:clip(p.summary,120),touchesLockedCell:!!p.touchesLock}))};}},
    read_question:{description:'문항 하나의 전문을 읽는다(발문·자료·보기·선지·정답·배점·해설·잠긴 칸). 문항을 고치거나 문항에 대해 말하기 전에 꼭 부른다.',inputSchema:obj({no:S.int('문항 번호')},['no']),
      run:({no})=>{const q=byNo(no);if(!q)return noSuch(no);return {no:q.number,type:q.type,points:q.points,ask:q.ask||'',body:api.plainBlocks(q),choices:(q.choices||[]).map((c,i)=>({number:i+1,mark:CIRCLED[i],text:c.text||(c.figure?.data?'[그림 선지]':'')})),
        answer:q.answer!=null?q.answer+1:null,explanation:clip(q.explanation,1500),lockedCells:lockNames(q),lockedNote:(q.locks||[]).length?'잠긴 칸은 선생님이 직접 고친 칸이라 바로 고칠 수 없고 제안만 돼요.':undefined};}},
    read_comments:{description:'코멘트 대장을 읽는다(선생님이 문항에 단 코멘트와 상태: new 새로 달림 · talk 의논 중 · decided 결정됨 · applied 반영됨 · dropped 안 함).',inputSchema:obj({status:S.str('이 상태만(생략하면 new·talk·decided)')}),
      run:({status})=>{const w=work();const want=status?[status]:['new','talk','decided'];return {comments:w.comments.filter(c=>want.includes(c.status)).slice(-40).map(c=>({id:c.id,no:w.questions.find(q=>q.id===c.qid)?.number??null,cell:c.target||null,status:c.status,text:clip(c.text,600),decision:c.decision||null,proposalIds:(c.proposals||[]).filter(pid=>w.proposals?.some(p=>p.id===pid&&['current','agreed'].includes(p.state)))}))};}},
    find_standard:{description:'2022 개정 교육과정 성취기준 원문을 찾는다(앱에 실린 고시 원문, 중·고 모든 과목). 성취기준·교육과정을 말하거나 근거로 댈 때는 꼭 이 도구의 결과만 인용한다. code를 알면 code로, 모르면 query(낱말)로. 2015 개정은 실려 있지 않다.',
      inputSchema:obj({query:S.str('찾을 낱말들(예: 충격량 운동량)'),code:S.str('성취기준 코드(예: 10통과1-03-04)'),subject:S.str('과목 이름(예: 통합과학1, 물리학)'),school:{type:'string',enum:['middle','high'],description:'middle 중학교 · high 고등학교'},limit:S.int('몇 개까지(기본 5)')}),
      run:async({query,code,subject,school,limit})=>{const r=await api.findStandards({query,code,subject,school,limit:Math.max(1,Math.min(8,Number(limit)||5))});
        return {edition:'2022 개정',source:'앱에 실린 고시 원문',results:r.map(x=>({code:x.code,label:api.standardLabel(x),area:x.area||null,text:x.text,ref:x.ref})),...(r.length?{}:{note:'찾지 못했어요. 낱말을 바꿔 보거나, 2015 개정 과목(물리학Ⅰ 등)이면 실려 있지 않아요 — 그때는 「근거 없음(2015 개정 원문 없음)」이라고 말하세요.'})};}},
    find_material:{description:'선생님이 등록한 자료 폴더(교과서·학습지)에서 관련 쪽을 찾는다. 근거가 필요할 때 부른다. 자료 폴더가 없으면 빈 결과가 온다.',inputSchema:obj({query:S.str('찾을 말')},['query']),
      run:async({query})=>{const hits=await api.folderHits(String(query||''),4);return {registered:!!work().sources?.folder,results:hits.map(h=>({ref:h.ref,kind:h.kind,title:h.title,page:h.page||null,quote:clip(h.quote,700)}))};}},

    change_question:{description:'문항의 칸을 고친다. 권한이 「바로 고침」이고 선생님이 그 문항을 고치라고 분명히 시킨 경우에만 실제로 바뀌고, 그 밖에는 5E가 「제안」으로 낮춰 시험지 위에 띄운다(선생님이 받기를 누르면 반영). 결과의 applied를 보고 선생님께 사실대로 말한다. 부르기 전에 read_question으로 지금 글을 읽고, 글 칸은 before에 지금 글을 그대로 넣는다.',
      inputSchema:obj({no:S.int('문항 번호'),summary:S.str('무엇을 왜 바꾸는지 한 줄'),changes:{type:'array',minItems:1,maxItems:8,items:obj({
        path:{type:'string',enum:['ask','passage','choice','bogi','block','answer','points','explanation'],description:'ask 발문 · passage 지문 · choice 선지 · bogi 보기 줄 · block 자료 글 · answer 정답 · points 배점 · explanation 해설'},
        number:S.int('choice일 때 선지 번호 1~5'),line:S.str('bogi일 때 줄 이름(ㄱ·ㄴ·ㄷ)'),id:S.str('block일 때 자료 이름'),
        value:S.str('바꿀 글. answer는 정답 번호 1~5, points는 배점 숫자'),before:S.str('글 칸이면 꼭: read_question에서 읽은 지금 글 그대로')},['path','value'])}},['no','summary','changes']),
      run:async({no,summary,changes},{turn})=>{const w=work(),q=byNo(no);if(!q)return noSuch(no);
        let list;try{list=(Array.isArray(changes)?changes:[]).map(normalizeChange);}catch(e){return {error:e.message};}
        if(!list.length)return {error:'changes가 비었어요.'};
        const contract=list.map(({before,...c})=>c);
        const stale=list.map((c,i)=>{const cur=X.currentValue(q,contract[i]);const why=staleReason(c,cur);return why?{where:where(c),why,current:cur}:null;}).filter(Boolean);
        if(stale.length)return {error:`고치기 전 글이 지금과 달라요(${stale.map(s=>s.where+': '+s.why).join(' / ')}). read_question으로 다시 읽고 before를 맞춰 다시 부르세요.`,current:stale};
        const same=contract.filter(c=>String(X.currentValue(q,c)??'').trim()===String(c.value).trim());
        if(same.length===contract.length)return {applied:false,proposed:false,note:'이미 그렇게 쓰여 있어 바꿀 것이 없어요.'};
        const dry=api.applyChanges(q,contract);if(dry.errors.length)return {error:'이 변경은 적용할 수 없어요: '+dry.errors.map(e=>e.message).join(' / ')};
        const check=api.checkAnswerStructure(dry.question),warnings=(check.problems||[]).map(p=>p.text).slice(0,4);
        const locked=contract.filter(c=>X.touchedLocks(q,c).length>0);
        const guard=checkDirect({permission:api.permission(),intent:turn.intent,number:q.number,openNumber:api.openNumber(),questionCount:w.questions.length,cells:contract.length,lockedCells:locked.length,appliedThisTurn:turn.applied});
        const shown=contract.map(c=>({where:where(c),before:X.currentValue(q,c),after:c.value}));
        if(guard.direct)snapshot(turn);
        const pid=X.addProposal(w,{qid:q.id,changes:contract,before:contract.map(c=>X.currentValue(q,c)),summary:clip(summary||'AI 안',300),effects:{answer:contract.some(c=>c.path==='answer')}});
        turn.created.add(pid);
        if(!guard.direct){turn.proposed.push({no:q.number,proposalId:pid,why:guard.reasons.map(r=>r.text)});api.afterChange({tab:'sheet'});
          return {applied:false,proposed:true,proposalId:pid,no:q.number,changes:shown,why:guard.reasons.map(r=>r.text),warnings,note:'고치지 않았어요. 시험지 위에 제안으로 띄웠어요. 선생님이 시험지에서 받기를 누르거나 「반영해」라고 하면 반영돼요. 선생님께 그렇게 알리세요.'};}
        const keys=contract.flatMap(c=>X.changeKeys(q,c));
        const r=api.applyProposal(pid,`선생님 지시: ${clip(turn.text,60)}`);
        if(!r.ok){return {applied:false,proposed:true,proposalId:pid,no:q.number,error:'바로 고치지 못해 제안으로 남겼어요'+(r.errors.length?': '+r.errors.map(e=>e.message).join(' / '):''),changes:shown};}
        turn.applied+=contract.length;turn.changes.push({no:q.number,qid:q.id,cells:shown.map(s=>s.where),keys});api.markChanged(q.id,keys);api.afterChange({tab:'review'});
        return {applied:true,no:q.number,changes:shown,warnings,note:`고쳤어요. 판(${w.head||'v0.0'})에는 아직 안 넣었어요(판은 선생님이 「판 올려」라고 할 때 올림). 선생님은 이번에 고친 것을 한 번에 되돌릴 수 있어요.`};}},
    accept_proposals:{description:'시험지 위에 이미 떠 있는 제안을 받는다(반영). 선생님이 「반영해」「그 제안 받아」처럼 분명히 말했을 때만 부른다. 방금 이 차례에 만든 제안은 「제안 후 받기」 권한에서는 받을 수 없다.',
      inputSchema:obj({no:S.int('이 문항의 열린 제안 모두'),proposalIds:{type:'array',items:{type:'string'},description:'받을 제안 id들(read_exam의 openProposals)'}}),
      run:async({no,proposalIds},{turn})=>{const w=work();let list=api.openProposals();if(Array.isArray(proposalIds)&&proposalIds.length)list=list.filter(p=>proposalIds.includes(p.id));else if(no!=null){const q=byNo(no);if(!q)return noSuch(no);list=list.filter(p=>p.qid===q.id);}else return {error:'no나 proposalIds 중 하나가 필요해요.'};
        if(!list.length)return {accepted:[],note:'받을 제안이 없어요.'};
        const out=[];for(const p of list){const number=w.questions.find(q=>q.id===p.qid)?.number;const ok=checkAccept({permission:api.permission(),intent:turn.intent,wantsApply:api.wantsApply(turn.text),createdThisTurn:turn.created.has(p.id)});
          if(!ok.ok){out.push({proposalId:p.id,no:number,accepted:false,why:ok.reason});continue;}
          if(p.touchesLock){out.push({proposalId:p.id,no:number,accepted:false,why:'선생님이 직접 고친 칸(잠김)을 건드리는 제안이라 시험지에서 직접 받아야 해요'});continue;}
          snapshot(turn);const q=w.questions.find(x=>x.id===p.qid),keys=p.changes.flatMap(c=>X.changeKeys(q,c));const r=api.applyProposal(p.id,`선생님 지시: ${clip(turn.text,60)}`);
          if(r.ok){turn.applied+=p.changes.length;turn.changes.push({no:number,qid:p.qid,cells:[clip(p.summary,40)],keys});api.markChanged(p.qid,keys);}
          out.push({proposalId:p.id,no:number,accepted:r.ok,...(r.ok?{}:{why:'반영하지 못했어요'+(r.skipped.length?'(잠긴 칸)':'')})});}
        api.afterChange({tab:'sheet'});return {accepted:out,note:'판에는 아직 안 넣었어요.'};}},
    update_comment:{description:'코멘트 대장의 상태를 바꾼다: talk(의논 중, 답을 달 때) · decided(선생님이 이렇게 하기로 정함) · dropped(안 하기로 함). 문항 글은 바뀌지 않는다. 선생님이 정한 것만 decided로.',
      inputSchema:obj({id:S.str('코멘트 id'),status:{type:'string',enum:['talk','decided','dropped']},answer:S.str('코멘트에 달 답(질문이면 근거로 답)'),decision:S.str('decided일 때: 정한 내용')},['id','status']),
      run:({id,status,answer,decision},{turn})=>{const w=work(),c=w.comments.find(x=>x.id===id);if(!c)return {error:'그 코멘트가 없어요. read_comments로 id를 확인하세요.'};
        if(['applied','dropped'].includes(c.status))return {error:`이미 ${c.status==='applied'?'반영된':'안 하기로 한'} 코멘트예요.`};
        if(status==='decided'&&(turn.intent.discuss||turn.intent.empty))return {error:'선생님이 정한 것이 아니에요(의논 중). talk로 두세요.'};
        X.updateComment(w,id,{status,...(answer?{answer:clip(answer,1200)}:{}),...(status==='decided'?{decision:clip(decision||turn.text,300)}:{})});api.afterChange({});return {ok:true,id,status};}},
    ask_teacher:{description:'일을 계속하려면 선생님이 꼭 정해야 하는 것을 묻는다(최대 3개). 보기를 주면 선생님이 눌러 고른다. 부른 뒤에는 더 일하지 말고 짧게 마무리해 답을 기다린다. 알아서 정해도 되는 것은 묻지 말고 정한 뒤 알린다.',
      inputSchema:obj({questions:{type:'array',minItems:1,maxItems:3,items:obj({ask:S.str('물음'),options:{type:'array',maxItems:6,items:{type:'string'},description:'눌러 고를 보기 2~5개(그대로 답이 되는 짧은 말)'}},['ask'])}},['questions']),
      run:({questions},{turn})=>{const list=(Array.isArray(questions)?questions:[]).slice(0,3).map(x=>({ask:clip(x?.ask,300),options:(Array.isArray(x?.options)?x.options:[]).slice(0,6).map(o=>clip(o,60)).filter(Boolean)})).filter(x=>x.ask);
        if(!list.length)return {error:'물음이 비었어요.'};turn.asks.push(...list);turn.asks.splice(3);return {asked:list.length,note:'화면에 물음 카드를 띄웠어요. 이제 짧게 마무리하고 답을 기다리세요.'};}},

    // ── 만드는 도구(11-27 저녁). 지금 엔진의 함수(absorb의 규칙·draftAll·drawFigure·bumpVersion·solveChanged·rebalanceAnswers·triageComments)를 감싼다. ──
    set_info:{description:'시험지 정보를 정한다. values의 칸: subject 과목 · grade 학년(학교급) · term 학기 · examName 시험 이름(예: 1학기 기말고사) · range 범위(단원) · itemCount 문항 수 · pointsTotal 총점 · pointKinds 배점 종류(예: [2,3,4]) · difficulty 난이도 분포(예: {"상":2,"중":4,"하":2}) · emphasis 수업 강조 · form 양식. by:"teacher"는 선생님이 이번 말에서 그 값을 실제로 말했을 때만, 네가 정한 기본값은 by:"ai". 선생님이 정했거나 본 칸은 ai 값으로 덮지 않는다(결과의 skipped). 막는 칸(과목·범위·문항 수·총점)이 비어 있으면 묻고, 나머지는 알아서 정한 뒤 알린다.',
      inputSchema:obj({values:obj({subject:S.str('과목(예: 통합과학1, 물리학Ⅰ)'),grade:S.str('학년(예: 고1, 중2)'),term:S.str('학기(예: 2026-1)'),examName:S.str('시험 이름(예: 1학기 기말고사)'),range:S.str('범위(단원 이름들)'),itemCount:S.int('문항 수'),pointsTotal:{type:'number',description:'총점'},
        pointKinds:{type:'array',items:{type:'number'},description:'배점 종류'},difficulty:{type:'object',additionalProperties:{type:'integer'},description:'난이도 분포(난이도 이름: 문항 수)'},emphasis:{type:'array',items:{type:'string'},description:'수업 강조(낱말들)'},form:S.str('양식(예: 수능형 5지선다)')}),
        by:{type:'string',enum:['teacher','ai'],description:'teacher 선생님이 말한 값 · ai 네가 정한 기본값'}},['values','by']),
      run:({values,by},{turn})=>{const w=work();if(!values||typeof values!=='object'||Array.isArray(values))return {error:'values는 {칸:값} 꼴이어야 해요.'};
        const set=[],skipped=[],ignored=[];
        for(const [k,raw] of Object.entries(values)){if(!X.META_KEYS.includes(k)){ignored.push({key:k,why:'모르는 칸'});continue;}if(isPlaceholder(raw)){ignored.push({key:k,why:'값이 비었거나 「미정」'});continue;}
          // 코드가 정한다: 선생님 말이 없는 차례이거나 그 값이 선생님 말에 없으면 ai로 낮춘다.
          let who=by==='teacher'?'teacher':'ai';const lowered=who==='teacher'&&(turn.intent.empty||!saidByTeacher(raw,turn.text));if(lowered)who='ai';
          const cur=w.meta[k];if(who==='ai'&&cur&&cur.value!=null&&cur.value!==''&&!X.canAiChange(cur)){skipped.push({key:k,current:cur.value,why:cur.by==='teacher'?'선생님이 정한 칸':'선생님이 이미 본 칸'});continue;}
          if(JSON.stringify(cur?.value??null)===JSON.stringify(raw)&&(cur?.by===who||who==='ai')){set.push({key:k,value:raw,by:cur?.by||who,same:true});continue;}
          if(X.setMeta(w,k,raw,who)){set.push({key:k,value:raw,by:who,...(lowered?{lowered:'선생님 말에 없는 값이라 AI가 정한 값으로 넣음'}:{})});turn.info.push({key:k,by:who});}
          else skipped.push({key:k,current:cur?.value??null,why:'바꿀 수 없는 칸'});}
        // absorb와 같은 자동 제목: 비었거나 자동으로 만든 제목이면 학기·시험·과목으로 다시 만든다.
        if(!w.meta.title||w.meta.title==='새 시험지'||w.meta.titleAuto){const t=[w.meta.term?.value,w.meta.examName?.value,w.meta.subject?.value].filter(Boolean).join(' · ');if(t){w.meta.title=t;w.meta.titleAuto=true;}}
        api.afterChange({});const missing=X.missingBlocking(w);
        return {set,skipped,...(ignored.length?{ignored}:{}),missing,title:w.meta.title||null,
          note:skipped.length?'skipped 칸은 바꾸지 않았어요(선생님이 정했거나 본 칸). 바꾸고 싶으면 「지금 → 바꿀 안」으로 말만 하세요.':missing.length?`막는 칸 ${missing.join('·')}이 비었어요. ask_teacher로 물어보세요.`:'정했어요. AI가 정한 값은 선생님께 짧게 알리세요.'};}},
    set_plan:{description:'설계표(문항별 계획)를 잡거나 바꾼다. 막는 칸(과목·범위·문항 수·총점)이 비면 받지 않는다. 선생님이 아직 안 본 행은 바로 바뀌고, 이미 본 행은 「설계표 안」으로 저장된다(선생님이 「설계표 반영해」라고 하면 apply_plan_proposals). 선생님이 이번 말로 설계표를 직접 바꾸라고 했으면 by:"teacher"(문항이 아직 없는 행만 바로 바뀜). 행 수는 문항 수와, 배점 합은 총점과 맞춘다.',
      inputSchema:obj({rows:{type:'array',minItems:1,maxItems:60,items:obj({no:S.int('문항 번호(1부터)'),unit:S.str('소단원'),standards:{type:'array',items:{type:'string'},description:'성취기준 코드(find_standard로 확인한 것만)'},difficulty:S.str('난이도(상·중·하 등)'),points:{type:'number',description:'배점'},
        form:{type:'string',enum:['combo','single','pair','talk','essay'],description:'combo 합답형 · single 객관식 · pair 짝 비교 · talk 대화형 · essay 서술형'},structure:{type:'string',enum:['two','big','small','condition','many','experiment','none'],description:'자료 구조: two 자료 둘 · big 큰 자료 하나 · small 작은 자료 · condition 조건 · many 여러 자료 · experiment 실험 · none 없음'},
        twist:S.str('평가할 사고·꼬는 방식 한 줄'),figure:{type:'string',enum:['reuse','convert','new','code','none'],description:'그림: reuse 기출 그림 그대로 · convert 바꿔 그림 · new 새 그림 · code 그래프(코드로) · none 없음'},
        basis:{type:'array',items:obj({kind:{type:'string',enum:['textbook','worksheet','past']},title:S.str('자료 이름'),page:S.int('쪽')}),description:'근거 자료'},status:{type:'string',enum:['set','choosing','redesign','empty']}},['no'])},
        by:{type:'string',enum:['teacher','ai'],description:'teacher 선생님이 이번 말로 직접 시킨 변경 · ai 네가 짠 안'}},['rows','by']),
      run:({rows,by},{turn})=>{const w=work(),missing=X.missingBlocking(w);
        if(missing.length)return {refused:true,missing,note:'먼저 ask_teacher로 물어보세요. 막는 칸이 비어 설계표를 받지 않았어요.'};
        const list=(Array.isArray(rows)?rows:[]).filter(r=>r&&Number.isInteger(Number(r.no))&&Number(r.no)>=1);if(!list.length)return {error:'rows가 비었거나 번호(no)가 없어요.'};
        const teacher=by==='teacher'&&!turn.intent.empty&&teacherPlanText(turn.text,{discuss:api.wantsDiscussOnly(turn.text)});
        const firstPlan=!w.plan.length,key=()=>JSON.stringify(w.plan.map(r=>[r.no,r.unit,r.difficulty,r.points,r.form,r.figure]));const before=key();
        const withQ=teacher?list.filter(x=>w.plan.find(p=>p.no===Number(x.no))?.qid).map(x=>Number(x.no)):[];
        let r;try{r=X.setPlanRows(w,teacher?list.filter(x=>!withQ.includes(Number(x.no))):list,teacher?'teacher':'ai');}catch(e){return {error:e.message};}
        // absorb와 같게: 본 행의 안은 바뀌는 칸만 저장해 두었다가 「설계표 반영해」면 바꾼다.
        const sum=api.summarizeRow,real=(r.proposals||[]).filter(p=>sum(p.before)!==sum(p.after)||(p.before?.twist||'')!==(p.after?.twist||''));
        w.planProposals=real.map(p=>({no:p.no,after:p.after,at:new Date().toISOString()}));for(const p of w.planProposals)turn.planNew.add(p);
        if(firstPlan&&w.plan.length)turn.planFirst=true;
        if(w.meta.stage==='design'&&w.plan.length)api.afterChange({tab:'plan'});else api.afterChange({});
        const n=Number(w.meta.itemCount?.value),total=Number(w.meta.pointsTotal?.value),pts=w.plan.reduce((a,x)=>a+(Number(x.points)||0),0),warnings=[];
        if(Number.isFinite(n)&&n>0&&w.plan.length!==n)warnings.push(`설계표 ${w.plan.length}행 · 문항 수 ${n}`);if(Number.isFinite(total)&&total>0&&pts&&pts!==total)warnings.push(`배점 합 ${pts}점 · 총점 ${total}점`);
        return {applied:r.applied,storedAsProposal:real.map(p=>({no:p.no,now:sum(p.before),proposed:sum(p.after)})),...(withQ.length?{notChanged:withQ.map(no=>({no,why:'이미 문항이 있는 행이라 바꾸지 않았어요'}))}:{}),changed:key()!==before,rows:w.plan.length,pointsSum:pts,warnings,
          note:real.length?`이미 보신 행 ${real.length}칸은 바꾸지 않고 안으로 저장했어요. 「설계표 반영해」라고 하면 바뀐다고 알리세요.`:r.applied.length?'설계표에 넣었어요. 선생님이 설계표를 보고 「초안 써 줘」라고 하면 write_questions를 부르세요. 지금 초안을 쓰지 마세요.':'바뀐 것이 없어요.'};}},
    apply_plan_proposals:{description:'저장해 둔 설계표 안(set_plan의 storedAsProposal)을 설계표에 넣는다. 선생님이 「설계표 반영해」「추천대로」「그 안대로」처럼 말했을 때만 된다. 이번 차례에 새로 만든 안은 선생님이 아직 못 봤으니 받지 않는다.',inputSchema:obj({}),
      run:(_,{turn})=>{const w=work(),shown=(w.planProposals||[]).filter(p=>!turn.planNew.has(p));
        if(!wantsPlanApply(turn.text)||api.wantsDiscussOnly(turn.text))return {refused:true,why:'선생님이 설계표 안을 반영하라고 하지 않았어요'};
        if(!shown.length)return {refused:true,why:(w.planProposals||[]).length?'방금 만든 안이라 선생님이 아직 못 봤어요':'저장된 설계표 안이 없어요'};
        const n=api.applyPlanProposals(shown);api.afterChange({tab:'plan'});return {applied:n,note:`설계표 ${n}칸을 안대로 바꿨어요(문항이 이미 있는 칸은 그대로).`};}},
    write_questions:{description:'설계표의 빈 행(문항이 없는 행)에 문항 초안을 뒤에서 쓰기 시작한다. 바로 돌아오고, 쓰는 대로 화면에 나오며, 다 쓰면 5E가 판 v0.1로 올리고 선생님께 알린다. 선생님이 「초안 써 줘」처럼 쓰라고 했을 때만 부른다. 부른 뒤 기다리지 말고 짧게 마무리한다. 문항 글을 답에 직접 쓰지 않는다.',inputSchema:obj({}),
      run:(_,{turn})=>{const w=work();
        if(api.drafting())return {refused:true,why:'이미 초안을 쓰는 중이에요',note:'쓰는 중이니 다 쓰면 5E가 알린다고 말하세요.'};
        const missing=X.missingBlocking(w);if(missing.length)return {refused:true,why:'막는 칸이 비었어요',missing,note:'먼저 ask_teacher로 물어보세요.'};
        const rows=w.plan.filter(r=>!r.qid&&(r.status!=='empty'||String(r.unit||'').trim()));if(!rows.length)return {refused:true,why:w.plan.length?'설계표의 모든 행에 이미 문항이 있어요':'설계표가 없어요',note:w.plan.length?'새 문항이 필요하면 설계표에 행을 더하세요.':'먼저 set_plan으로 설계표를 잡으세요.'};
        if(turn.intent.empty||turn.intent.discuss||!(api.mode()==='q'||api.wantsDraft(turn.text)))return {refused:true,why:'선생님이 초안을 쓰라고 하지 않았어요',note:'설계표를 보여 드리고 「초안 써 줘」라고 하시면 쓴다고 말하세요.'};
        api.startDraft();turn.started.push('draft');
        return {started:true,rows:rows.length,nos:rows.map(r=>r.no),note:'뒤에서 쓰는 중이에요. 쓰는 대로 화면에 나오고, 끝나면 5E가 선생님께 알려요. 기다리지 말고 짧게 마무리하세요.'};}},
    draw_figure:{description:'문항의 빈 그림 칸에 그림을 그려 넣는다(빈 칸 채우기만 — 이미 있는 그림은 바꾸지 않는다). kind: graph = 코드로 그리는 정량 그래프(축 이름·단위·눈금·값·점·선을 description에 정확히), figure = 상황·장치 그림(무엇이 어디에 있는지, 글자 라벨). 그래프와 그림이 둘 다 필요하면 두 번 부른다. 선생님이 그려 달라고 했을 때만 부른다. 1~3분 걸린다.',
      inputSchema:obj({no:S.int('문항 번호'),kind:{type:'string',enum:['graph','figure'],description:'graph 정량 그래프 · figure 상황·장치 그림'},description:S.str('그릴 것(한국어, 자세히)')},['no','kind','description']),
      run:async({no,kind,description},{turn})=>{const q=byNo(no);if(!q)return noSuch(no);
        if(!['graph','figure'].includes(kind))return {error:'kind는 graph나 figure예요.'};if(!String(description||'').trim())return {error:'description(그릴 것)이 비었어요.'};
        if(turn.intent.empty||turn.intent.discuss||!/그림|그래프|도식|그려|그리|삽화/.test(turn.text))return {refused:true,why:'선생님이 그림을 그리라고 하지 않았어요'};
        if(api.drawingQ(q.id))return {refused:true,why:`${q.number}번 그림을 이미 그리는 중이에요`};
        const slots=q.blocks.filter(b=>b.kind==='figure');
        if(!slots.length)return {refused:true,why:'이 문항에는 그림 칸이 없어요',note:'그림 칸은 선생님이 문항에 빈 그림 칸을 만든 뒤 다시 시켜야 해요'};
        if(slots.every(b=>b.figure?.data))return {refused:true,why:'이미 그림이 있어요',note:'그림 바꾸기는 선생님이 그림을 두 번 눌러 image에서 하거나, 빈 칸을 만든 뒤 다시 시켜야 해요'};
        const r=await api.drawInto(q.id,{kind,description:clip(description,2000)});
        if(!r.ok)return {drawn:false,no:q.number,error:'그리지 못했어요'+(r.error?': '+r.error:''),note:'문항의 그림 칸은 그대로예요. 설명을 바꿔 다시 시키거나 image에서 직접 넣을 수 있다고 알리세요.'};
        return {drawn:true,no:q.number,slot:r.slot,note:`${q.number}번 빈 「${r.slot}」 칸에 넣었어요. 판에는 아직 안 넣었어요.`};}},
    bump_version:{description:'판을 올린다(지금까지 고친 것을 한 묶음으로 새 판 v0.x에 넣음). 선생님이 「판 올려」라고 했을 때만 된다. 두 모델 풀이는 따로(run_solve_check).',inputSchema:obj({why:S.str('이 판에 무엇이 들어가는지 한 줄')}),
      run:({why},{turn})=>{if(!api.wantsBump(turn.text))return {refused:true,why:'선생님이 판을 올리라고 하지 않았어요'};
        if(api.drafting())return {refused:true,why:'초안을 쓰는 중이에요',note:'다 쓰면 5E가 v0.1로 올린다고 말하세요.'};
        const w=work();if(!api.unversioned())return {bumped:false,version:w.head||'v0.0',note:`판에 안 들어간 고침이 없어 올리지 않았어요. 지금 판은 ${w.head||'v0.0'}이에요. 그렇게 말하세요.`};
        const list=w.pendingEdits||[],nos=[...new Set(list.map(x=>w.questions.find(q=>q.id===x.qid)?.number).filter(Boolean))];
        const v=api.bumpVersion(clip(why||'판 올리기',80));if(!v)return {bumped:false,version:w.head||'v0.0',note:'판을 올리지 못했어요.'};turn.bumped={label:v.label,stats:v.stats,nos};
        return {bumped:true,version:v.label,changedQuestions:nos,stats:{answers:(v.stats?.answers||[]).map(a=>a?CIRCLED[a-1]:'·').join(' '),pointsTotal:v.stats?.pointsTotal??null},note:`${v.label}로 올렸어요. 두 모델 풀이는 하지 않았어요(선생님이 「풀이 검사」라고 하면 run_solve_check).`};}},
    run_solve_check:{description:'두 모델 풀이 검사를 뒤에서 시작한다(정답·해설을 가린 문항을 서로 다른 두 모델이 따로 풂, 크레딧을 씀). 선생님이 「풀이 검사」「두 모델로 풀어 봐」라고 했을 때만 된다. 판에 안 들어간 고침이 있으면 먼저 판을 올린다. 바로 돌아오고, 끝나면 5E가 결과를 알린다.',inputSchema:obj({}),
      run:(_,{turn})=>{if(!api.wantsSolve(turn.text)||turn.intent.discuss)return {refused:true,why:'선생님이 풀이 검사를 하라고 하지 않았어요'};
        const w=work();if(!w.questions.length)return {refused:true,why:'아직 문항이 없어요'};if(api.drafting())return {refused:true,why:'초안을 쓰는 중이에요',note:'다 쓰면 5E가 판을 올리고 풀이 검사를 해요.'};
        let v=null,bumped=false;if(api.unversioned()){v=api.bumpVersion('풀이 검사 전 판 올리기');bumped=!!v;if(v)turn.bumped={label:v.label,stats:v.stats,nos:[]};}
        if(!v){const cur=w.versions.find(x=>x.label===w.head);v={label:w.head||'v0.0',changed:cur?.changed?.length?cur.changed.slice():w.items.slice()};}
        const ids=(v.changed||w.items).filter(id=>w.questions.some(q=>q.id===id&&q.type!=='서술형'));if(!ids.length)return {refused:true,why:'풀 객관식 문항이 없어요'};
        api.startSolve(v);turn.started.push('solve');
        return {started:true,version:v.label,bumpedFirst:bumped,questions:ids.map(id=>w.questions.find(q=>q.id===id)?.number),note:'뒤에서 두 모델이 푸는 중이에요. 끝나면 5E가 결과를 알려요. 기다리지 말고 짧게 마무리하세요.'};}},
    rebalance_answers:{description:'정답 번호 분포(①~⑤ 개수·같은 번호 연속)를 고르게 맞추는 「안」을 만든다. 문항은 바꾸지 않고 제안으로만 붙는다(선생님이 「정답 분포 안 그대로 반영해」라고 하면 반영). 선생님이 정답 분포를 맞추라고 했을 때만.',inputSchema:obj({}),
      run:async(_,{turn})=>{if(turn.intent.empty||turn.intent.discuss||!/정답|분포/.test(turn.text))return {refused:true,why:'선생님이 정답 분포를 맞추라고 하지 않았어요'};
        const w=work();if(!w.questions.length)return {refused:true,why:'아직 문항이 없어요'};if(api.drafting())return {refused:true,why:'초안을 쓰는 중이에요'};
        const before=new Set((w.proposals||[]).map(p=>p.id));await api.rebalanceAnswers();
        const made=(w.proposals||[]).filter(p=>!before.has(p.id));for(const p of made)turn.created.add(p.id);
        return {proposals:made.map(p=>({proposalId:p.id,no:w.questions.find(q=>q.id===p.qid)?.number,summary:clip(p.summary,100)})),applied:false,note:made.length?'5E가 이미 화면에 안을 알렸어요. 아무것도 바꾸지 않았다는 것만 한두 문장으로 말하세요.':'바꿀 문항이 없거나 안을 만들지 못했어요(5E가 화면에 알렸어요).'};}},
    triage_comments:{description:'선생님이 시험지에 단 새 코멘트(new)를 문항마다 읽고 「지금 → 바꿀 안」을 제안으로 붙인다. 문항은 바꾸지 않는다. 선생님이 「코멘트 다 달았어」「코멘트 봐 줘」라고 할 때 부른다.',inputSchema:obj({}),
      run:async(_,{turn})=>{if(turn.intent.empty||turn.intent.discuss)return {refused:true,why:turn.intent.discuss?'고치지 말고 의논하자는 말이라 안을 만들지 않았어요':'선생님 말이 없는 차례예요'};
        const w=work(),fresh=w.comments.filter(c=>c.status==='new');if(!fresh.length)return {note:'새 코멘트가 없어요'};
        const before=new Set((w.proposals||[]).map(p=>p.id));await api.triageComments();const made=(w.proposals||[]).filter(p=>!before.has(p.id));for(const p of made)turn.created.add(p.id);
        return {comments:fresh.length,questions:new Set(fresh.map(c=>c.qid)).size,proposals:made.length,applied:false,counts:X.commentCounts(w),note:'5E가 이미 화면에 결과를 알렸어요. 아무것도 고치지 않았다는 것과 받기·「반영해」로 반영된다는 것만 짧게 말하세요.'};}},
    save_rule:{description:'선생님이 이번 말에서 밝힌 출제 규칙(표현·표기·금지·자료 다루는 법처럼 다음 문항에도 쓸 것)을 「규칙으로 저장할까요?」 카드로 띄운다. 저장은 선생님이 카드를 눌러야 된다. 문항 수·배점 같은 시험 조건은 규칙이 아니라 set_info.',
      inputSchema:obj({text:S.str('규칙 한 문장'),layer:{type:'string',enum:['global','subject','exam'],description:'추천 층: global 모든 시험지 · subject 이 과목 · exam 이 시험지'}},['text']),
      run:({text,layer},{turn})=>{const t=clip(String(text||'').replace(/\s+/g,' ').trim(),300);if(!t)return {error:'규칙 글이 비었어요.'};if(turn.intent.empty)return {refused:true,why:'선생님 말이 없는 차례예요'};
        if(api.rules().some(r=>String(r.text).trim()===t)||turn.ruleCards.some(r=>r.text===t))return {queued:false,note:'이미 있는 규칙이에요.'};
        if(turn.ruleCards.length>=3)return {queued:false,note:'한 번에 세 개까지만 물어요.'};
        turn.ruleCards.push({text:t,id:crypto.randomUUID(),...(['global','subject','exam'].includes(layer)?{layer}:{})});
        return {queued:true,saved:false,note:'답 아래에 「이걸 규칙으로 저장할까요?」 카드를 띄워요. 선생님이 눌러야 저장돼요. 저장했다고 말하지 마세요.'};}},
  };
  return tools;
}
// 이번 차례에 바로 고친 것을 한 묶음으로 되돌린다(선생님이 누를 때). api.work()의 상태를 사본으로 되돌리고, 이번에 만든 제안은 닫는다.
export function undoTurn(api,turn){const w=api.work();if(!turn?.undo)return false;const u=turn.undo;
  w.questions=JSON.parse(u.questions);w.comments=JSON.parse(u.comments);w.pendingEdits=JSON.parse(u.pendingEdits);w.pendingApplied=JSON.parse(u.pendingApplied);
  const states=new Map(JSON.parse(u.proposals));for(const p of w.proposals||[]){if(states.has(p.id))p.state=states.get(p.id);else if(turn.created.has(p.id))p.state='rejected';}
  w.ui={...(w.ui||{}),aiMarks:JSON.parse(u.marks)};w.dirty=true;turn.undo=null;turn.undone=true;return true;}
