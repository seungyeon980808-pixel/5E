// 문항 카드(card-editor.js)가 쓰는 아이콘·상수·작은 도우미. 화면 상태와 상관없는 것만 모았다(2026-10-19 밤 리팩토링, 동작 그대로).
import {SHAPE_ICONS} from './new-question.js';

const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NUM=['①','②','③','④','⑤'];
const COMMON=['ㄱ','ㄷ','ㄱ, ㄴ','ㄴ, ㄷ','ㄱ, ㄴ, ㄷ'];
// 선지 조합 기출 통계(10-20): 평가원 과학탐구 8과목 8,420문항 중 〈보기〉 ㄱ·ㄴ·ㄷ로 답하는 5,958문항의 ①~⑤ 조합 빈도 상위 3개(합 72.5%).
const COMBO_STATS={n:5958,top:[[['ㄱ','ㄴ','ㄱ, ㄷ','ㄴ, ㄷ','ㄱ, ㄴ, ㄷ'],30.4],[['ㄱ','ㄷ','ㄱ, ㄴ','ㄴ, ㄷ','ㄱ, ㄴ, ㄷ'],29.4],[['ㄱ','ㄴ','ㄷ','ㄱ, ㄴ','ㄴ, ㄷ'],12.7]]};
const ICON={
  pic:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16l4-4 4 4 4-6 4 6"/><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/></svg>',
  table:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 10h16M4 15h16M10 4v16"/></svg>',
  plus:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  star:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.2 5.3L20 9l-4.4 3.8L17 18.5 12 15.6 7 18.5l1.4-5.7L4 9l5.8-.7z"/></svg>',
  left:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
  right:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  grid:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
  page:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10v17H7z"/><path d="M9.5 8h5M9.5 11h5M9.5 14h3"/></svg>',
  card:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
  out:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>',
  panelL:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M9 4.5v15"/></svg>',
  panelR:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M15 4.5v15"/></svg>',
  sliders:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
  link:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  close:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  lib:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h3v15H5zM10 4.5h3v15h-3z"/><path d="m15.2 5.4 2.9-.8 3.6 14.4-2.9.8z"/></svg>',
  search:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/></svg>',
};
// 시안 4: 왼쪽 라이브러리(기출·교과서·기준·자료) · 가운데 문항 카드(쪽 전체로 바꿔 보기) · 오른쪽 미리보기|AI.
const TABS=[['past','기출문제'],['textbooks','교과서'],['standards','성취기준·교육과정'],['references','자료']];
const slotsOf=q=>{const out=[];const walk=p=>{for(const b of q.blocks.filter(x=>x.parent===p)){if(b.kind==='figure'||b.kind==='table')out.push(b);walk(b.id);}};walk(null);return out;};
// 유형·자료 구조는 새 문항 창에서 정한다. 카드 머리 줄에는 이름표로만 보이고, 눌렀을 때만 유형 바꾸기 메뉴가 열린다.
const STRUCT_SHORT={two:'자료 2개',big:'큰 자료 1개',small:'작은 자료 1개',condition:'조건 상자',many:'자료 3개 이상',experiment:'실험 상자',none:'글만'};
const shapeIco=k=>`<svg class="ico shape" viewBox="0 0 24 24" aria-hidden="true">${SHAPE_ICONS[k]||''}</svg>`;
const CHEV='<svg class="ico chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
const CHECK='<svg class="ico tick" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';
const bogiOf=q=>q.blocks.find(b=>b.kind==='bogi');
const isCombo=q=>q.type==='합답형';
const CHANNEL=/^\/preview(?:\/|$)/.test(location.pathname)?'5e.preview:':'';// 공개 프리뷰는 저장 이름을 분리
const store={get(k,d){try{return JSON.parse(localStorage.getItem(CHANNEL+'exampool-card:'+k))??d;}catch{return d;}},set(k,v){try{localStorage.setItem(CHANNEL+'exampool-card:'+k,JSON.stringify(v));}catch{}}};

// 오래 걸리는 단추의 진행 표시: 단추는 폭을 그대로 두고 고리만(5E 라이브러리 로딩 고리와 같은 모양),
// 지금 단계 글은 그 기출 그림 위에 크게 덮어 보인다(단추 글이 길어져 카드 줄이 바뀌지 않게).
const busyHtml=stage=>`<i class="busy-ring" aria-hidden="true"></i><span class="sr-only">${E(stage)}</span>`;
const pastBusyHtml=stage=>`<div class="past-busy" role="status"><i class="busy-ring" aria-hidden="true"></i><span>${E(stage)}</span></div>`;
export {busyHtml,pastBusyHtml,E,NUM,COMMON,COMBO_STATS,ICON,TABS,slotsOf,STRUCT_SHORT,shapeIco,CHEV,CHECK,bogiOf,isCombo,CHANNEL,store};
