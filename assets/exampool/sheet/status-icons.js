// 문항·시험지 상태 아이콘(11-04 확정, 시안 5e-design-mockups/status-icons-1104-v3.html).
//  · 문항: 원 안이 완성도만큼 채워진다. 출제 중(노랑) → 출제 완료(초록, 가득) → 시험지에 넣음(파랑, 가득 + 체크).
//  · 시험지: 귀퉁이가 접힌 종이의 2단 칸이 담은 문항 수만큼 채워진다. 출제 중(노랑) → 출제 완료(파랑).
// 색은 CSS 변수(--st-q-work 등, office-pool.css)로 정하고 아이콘은 currentColor로 그린다.
import {slotsOf,bogiOf,isCombo} from './card-shared.js';
import {workflowOf} from './views.js';

// 완성도 0~1: 발문 · 자료 · (〈보기〉) · 선지 · 정답 중 채운 칸의 비율(카드 번호 고리와 같은 셈).
export function progressOf(q){
  const slots=slotsOf(q),filled=slots.filter(b=>b.kind==='table'?b.table.cells.flat().some(c=>c.value||c.figure):!!b.figure).length;
  const bogi=bogiOf(q),lines=bogi?bogi.lines.filter(l=>l.text.trim()).length:0;
  const choices=q.style==='대응표'?5:q.choices.filter(c=>c.text.trim()||c.figure).length;
  const items=[!!q.ask.trim(),filled===slots.length,...(isCombo(q)?[!!bogi&&lines===bogi.lines.length&&lines>0]:[]),choices===5,q.type==='서술형'?!!q.modelAnswer.trim():q.answer!==null];
  return items.filter(Boolean).length/items.length;
}
// 문항 상태: 시험지에 넣음 > 출제 완료 > 출제 중.
export function questionState(q,data){
  if(data?.exams?.some(e=>e.items.includes(q.id)))return 'used';
  return workflowOf(q)==='complete'?'done':'work';
}
const NAME={work:'출제 중',done:'출제 완료',used:'시험지에 넣음',new:'문항 추가'};
const pie=p=>{if(p<=0)return '';if(p>=1)return '<circle cx="12" cy="12" r="6.6"/>';const a=p*2*Math.PI,x=12+6.6*Math.sin(a),y=12-6.6*Math.cos(a);return `<path d="M12 12V5.4A6.6 6.6 0 ${p>.5?1:0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z"/>`;};
export function qIcon(state,p=0,{title=true}={}){
  const full=state==='done'||state==='used';
  return `<svg class="st-ico st-q-${state}" viewBox="0 0 24 24" aria-hidden="true">${title?`<title>${NAME[state]}${state==='work'?` · 완성도 ${Math.round(p*100)}%`:''}</title>`:''}
<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="1.5"${state==='new'?' stroke-dasharray="2.2 2.2"':''}/>
<g fill="currentColor">${full?pie(1):state==='new'?'':pie(p)}</g>${state==='used'?'<path class="st-mark" d="m8.8 12.2 2.2 2.2 4.3-4.4" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>':''}${state==='new'?'<path d="M12 8.6v6.8M8.6 12h6.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>':''}</svg>`;
}
export function examIcon(state,p=0,{title=true}={}){
  const full=state==='done',f=full?1:Math.max(0,Math.min(1,p));
  const cells=[[6.6,9.2],[6.6,14.4],[12.6,9.2],[12.6,14.4]],w=4.8,h=4.2;
  const body=cells.map(([x,y],i)=>{const v=Math.max(0,Math.min(1,f*4-i));if(v<=0)return '';const hh=h*v;return `<rect x="${x}" y="${(y+h-hh).toFixed(2)}" width="${w}" height="${hh.toFixed(2)}" rx=".8"/>`;}).join('');
  return `<svg class="st-ico st-e-${state}" viewBox="0 0 24 24" aria-hidden="true">${title?`<title>${state==='new'?'새 시험지':state==='done'?'출제 완료':`출제 중 · ${Math.round(f*100)}%`}</title>`:''}
<g fill="none" stroke="currentColor" stroke-linejoin="round"><path d="M5 3.5h10.5L19.5 7.5V19.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z" stroke-width="1.5"${state==='new'?' stroke-dasharray="2.2 2.2"':''}/><path d="M15.5 3.5v3a1 1 0 0 0 1 1h3" stroke-width="1.3"/><path d="M6.6 6.6h6.4" stroke-width="1.3" stroke-linecap="round"/>${state==='new'?'<path d="M12 10.5v6M9 13.5h6" stroke-width="1.6" stroke-linecap="round"/>':'<path d="M12 9.2v9.4" stroke-width=".9" opacity=".55"/>'}</g>
<g fill="currentColor">${body}</g></svg>`;
}
