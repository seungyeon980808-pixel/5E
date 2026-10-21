// 출제 대화 요청문. 로컬 Codex 연결은 보낼 때마다 새 스레드라 이전 대화를 기억하지 않는다.
// 그래서 앱이 매번 지침 묶음·현재 문항·요구사항·최근 대화·교사의 직접 수정·근거 검색 결과를 함께 넣는다.
import {GUIDELINES,GUIDELINES_VERSION} from './guidelines.js';
import {AUTHORING_FORMAT} from './contract.js';
const CIRCLED='①②③④⑤';
// 문항을 사람이 읽는 꼴로. 구성 이름(지문·(가)·ㄱ·①)으로 가리키게 하고, 필요하면 [id]도 준다.
export function describeQuestion(q){
  const lines=[`문항 번호: ${q.number} · 유형: ${q.type}${q.style?` · 선지 표현: ${q.style}`:''} · 배점: ${q.points}`];
  if(q.standardCode)lines.push(`성취기준 코드(교사 입력): ${q.standardCode}`);if(q.intent)lines.push(`출제 의도: ${q.intent}`);
  for(const b of q.blocks){
    if(b.kind==='bogi')continue;
    const head=`- ${b.label||b.kind}${b.parent?' (묶음 안)':''} [${b.kind} · ${b.id}]`;
    if(b.kind==='table')lines.push(head+'\n'+b.table.cells.map(r=>'  | '+r.map(c=>String(c.value??'')).join(' | ')+' |').join('\n'));
    else if(b.kind==='figure')lines.push(head+(b.figure?.data?` 그림 있음(${b.figure.name||'이름 없음'}${b.figure.editable?', 편집 원본 있음':''})`:' (빈 그림 칸)'));
    else if(b.lines)lines.push(head+'\n'+b.lines.map(l=>`  ${l.label} ${l.text}`).join('\n'));
    else lines.push(head+(b.text?`: ${b.text}`:' (비어 있음)'));
  }
  lines.push(`발문: ${q.ask||'(비어 있음)'}`);
  const bogi=q.blocks.find(b=>b.kind==='bogi');if(bogi)lines.push('<보기>\n'+bogi.lines.map(l=>`  ${l.label}. ${l.text||'(비어 있음)'}`).join('\n'));
  if(q.type!=='서술형')lines.push('선지\n'+q.choices.map((c,i)=>`  ${CIRCLED[i]} ${c.text||'(비어 있음)'}`).join('\n'));
  lines.push(q.type==='서술형'?`모범 답안: ${q.modelAnswer||'(비어 있음)'}`:`정답(교사 입력): ${q.answer===null?'(비어 있음)':CIRCLED[q.answer]}`);
  lines.push(`해설: ${q.explanation||'(비어 있음)'}`);
  return lines.join('\n');
}
const list=(title,items)=>items?.length?`${title}\n${items.map(x=>'- '+x).join('\n')}`:'';
export const RESPONSE_SPEC=`[응답 형식] 아래 JSON 객체 하나만 출력한다. 설명 글·코드 블록 표시 없이 JSON만.
{
  "format": "${AUTHORING_FORMAT}",
  "reply": "교사에게 하는 말. 핵심만 3~8문장. 무엇을 바꿨고 왜, 남은 확인 사항.",
  "questions": ["답·범위 판정을 바꾸는 누락만, 최대 3개. 없으면 빈 배열"],
  "requirements": {"explicit": ["교사가 말한 요구"], "assumed": ["임시 가정"], "pending": ["확인 필요"]},
  "target": {"schoolLevel": "", "subject": "", "curriculum": "2015 또는 2022 개정", "scope": "", "difficulty": ""},
  "proposal": null 또는 {"summary": "변경 요약", "draft": {...새 문항 전체...} 또는 생략, "changes": [...개별 변경...] 또는 생략},
  "solve": {"statements": [{"target": "ㄱ", "truth": true, "reason": "다시 푼 근거"}], "answer": 1~5, "workings": "재계산"},  ← target은 보기 기호(ㄱ·ㄴ·ㄷ)나 선지 번호(①~⑤)만. 변경안이 있으면 변경안 기준으로 푼다
  "review": {"axes": {"curriculum": {"status": "pass|issue|unverified", "note": ""}, "scope": {...}, "answer": {...}, "figure": {...}}, "items": [{"target": "ㄴ", "severity": "error|scope|ambiguity|style", "problem": "", "fix": ""}]},
  "figures": [{"slot": "그림 칸 이름 또는 new", "kind": "graph|image", "description": "한글 제작 명세", "mustNot": ["정답 노출 요소"]}],
  "evidenceRequests": [{"kind": "curriculum|claim|past|textbook", "query": "검색어", "edition": "2015|2022"}],
  "evidenceUsed": [{"ref": "받은 ref", "target": "ㄱ", "claim": "지지하는 문장", "judgement": "direct|conditional|derived|refuted|missing|conflict|unreadable", "condition": "적용 조건", "note": ""}],
  "issues": ["남은 쟁점"]
}
draft 칸: {"type": "합답형|객관식|서술형", "passage": "지문", "ask": "발문", "bogi": ["ㄱ 내용", "ㄴ 내용", "ㄷ 내용"], "choices": ["ㄱ", "ㄷ", "ㄱ, ㄴ", "ㄴ, ㄷ", "ㄱ, ㄴ, ㄷ"], "answer": 3, "explanation": "해설(보기별 판단)", "intent": "평가 목표"}
changes 항목: {"path": "ask|passage|explanation|intent|answer", "value": ...} · {"path": "bogi", "line": "ㄴ", "value": "새 보기"} · {"path": "choice", "index": 0~4, "value": "ㄱ, ㄴ"} · {"path": "block", "id": "구성 이름 또는 id", "value": "글"} · {"path": "table", "id": "표 이름", "cells": [["머리", "…"], ["…"]]}
- answer는 1~5(①~⑤). 바꾸지 않을 칸은 넣지 않는다. 교사가 요청하지 않은 칸을 고치지 않는다(다만 조건을 바꾸면 영향받는 정답·해설은 함께 고친다).
- 근거가 필요하면 이번에는 evidenceRequests만 채우고 proposal은 null로 둬도 된다. 앱이 검색해서 다시 묻는다.
- 검토(review)는 지금 문항 버전에 대해 한다. 실제 그림이 없으면 figure는 unverified.`;
export function buildAuthoringPrompt(packet,{evidence=[],round=1,errors=[]}={}){
  const a=packet.authoring||{};
  const parts=[
    `[지침 묶음 ${GUIDELINES_VERSION}]\n${GUIDELINES}`,
    RESPONSE_SPEC,
    `[요청 종류] ${({chat:'대화(설계·수정 요청)',review:'현재 문항 통합 검토',draft:'새 문항 초안 만들기'})[packet.kind]||packet.kind}`,
    a.target?`[출제 대상(지금까지 정함)] ${Object.entries(a.target).map(([k,v])=>`${k}=${v}`).join(', ')}`:'',
    list('[요구사항 · 명시]',a.requirements?.explicit),list('[요구사항 · 임시 가정]',a.requirements?.assumed),list('[확인 필요]',a.requirements?.pending),
    list('[남은 쟁점]',a.issues),list('[다시 확인할 칸(내용이 바뀜)]',a.stale),
    a.axes?`[지난 검토 축] ${Object.entries(a.axes).map(([k,v])=>`${k}:${v}`).join(', ')}`:'',
    list('[교사가 지난 AI 답 이후 직접 고친 칸 — 이것이 현재 기준]',packet.teacherEdits),
    list('[최근 수정 이력]',a.recentHistory),
    `[현재 문항 · 버전 ${a.revision??0}]\n${describeQuestion(packet.question)}`,
    packet.figures?.length?`[첨부한 실제 그림] 문항에 들어 있는 그림을 순서대로 첨부했다: ${packet.figures.map((f,i)=>`${i+1}. ${f.label}`).join(', ')}. 그림 검토(figure 축)는 이 실제 그림을 읽고 판단한다.`:(packet.figureCount?'':'[실제 그림] 이 문항에는 아직 실제 그림이 없다. figure 축은 unverified로 둔다.'),
    packet.conversation?.length?`[최근 대화]\n${packet.conversation.map(m=>`${m.role==='me'?'교사':'AI'}: ${String(m.text).slice(0,1500)}`).join('\n')}`:'',
    // 검색 표시(marker, ref 없음)는 결과가 아니다. 섞어 넣으면 「ref=undefined」 줄이 생기고 「결과가 없었습니다」 안내가 빠졌다(M25).
    (evidence=evidence.filter(e=>e.ref)).length?`[근거 검색 결과 · 후보일 뿐, ref로만 인용]\n${evidence.map(e=>`ref=${e.ref} · ${e.kind} · ${e.title}${e.page?` · ${e.page}쪽`:''}${e.edition?` · ${e.edition} 개정`:''}\n  ${e.quote}${e.note?`\n  주의: ${e.note}`:''}`).join('\n')}`:(round>1?'[근거 검색 결과] 요청한 검색에서 결과가 없었습니다. 근거는 미확보로 두세요.':''),
    errors.length?`[앞선 응답의 형식 오류 — 고쳐서 다시 출력]\n${errors.map(e=>'- '+e).join('\n')}`:'',
    `[교사 요청]\n${packet.text}`,
  ];
  return parts.filter(Boolean).join('\n\n');
}
