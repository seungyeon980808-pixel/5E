// 1.8.0 출제 하네스 새 엔진 — AI가 부르는 5E 도구(11-27 계획-엔진전환 3절).
// 도구는 화면(app.js)이 넘겨 준 api로만 일한다. 규칙 판정은 guard.js(순수 함수)가 하고, 여기서는 그 판정대로 실행한다.
// 고침의 길은 하나다: 변경 → (계약 미리 적용으로 검사) → 제안 만들기 → 권한·안전망을 지나면 그 제안을 바로 받음. 아니면 제안으로 남김.
import {teacherIntent,checkDirect,checkAccept,normalizeChange,staleReason,PERMISSION_LABEL} from './guard.js';

const obj=(properties,required=[])=>({type:'object',properties,required});
const S={str:d=>({type:'string',description:d}),int:d=>({type:'integer',description:d})};
const clip=(v,n)=>{const s=String(v??'');return s.length>n?s.slice(0,n)+'…':s;};

// 한 차례 동안의 장부(바로 고친 칸 수, 이번에 만든 제안, 되돌리기용 사본, 선생님께 물을 것).
export function newTurnState(text){return {text:String(text||''),intent:teacherIntent(text),applied:0,created:new Set(),undo:null,changes:[],asks:[],proposed:[]};}

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
  };
  return tools;
}
// 이번 차례에 바로 고친 것을 한 묶음으로 되돌린다(선생님이 누를 때). api.work()의 상태를 사본으로 되돌리고, 이번에 만든 제안은 닫는다.
export function undoTurn(api,turn){const w=api.work();if(!turn?.undo)return false;const u=turn.undo;
  w.questions=JSON.parse(u.questions);w.comments=JSON.parse(u.comments);w.pendingEdits=JSON.parse(u.pendingEdits);w.pendingApplied=JSON.parse(u.pendingApplied);
  const states=new Map(JSON.parse(u.proposals));for(const p of w.proposals||[]){if(states.has(p.id))p.state=states.get(p.id);else if(turn.created.has(p.id))p.state='rejected';}
  w.ui={...(w.ui||{}),aiMarks:JSON.parse(u.marks)};w.dirty=true;turn.undo=null;turn.undone=true;return true;}
