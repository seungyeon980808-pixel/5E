// 5E_cell의 '구성' 시트: 선택한 문항의 구성 한 줄마다 순서·묶음·배치·폭 비율·크기·간격·정렬.
// 엑셀 '구성' 시트와 같은 값을 같은 말로 보여 준다. 고치면 데이터 하나만 바뀌고 한글 창이 다시 그려진다.
import {KINDS} from './model.js';
import {labelInDocument} from './handoff.js';
import {ALIGNS,CHOICE_LAYOUTS,formatSize,formatGap,formatRatio,parseSize,parseGap,parseRatio,parseAlign,parseChoiceLayout} from './placement.js';

const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const select=(name,values,value,label,blank)=>`<select data-part="${name}" aria-label="${E(label)}">${blank!==undefined?`<option value=""${value?'':' selected'}>${E(blank)}</option>`:''}${values.map(v=>`<option${v===value?' selected':''}>${E(v)}</option>`).join('')}</select>`;
const field=(name,value,label,placeholder)=>`<input data-part="${name}" aria-label="${E(label)}" value="${E(value)}" placeholder="${E(placeholder)}" inputmode="decimal" autocomplete="off">`;
const ICON={up:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',down:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'};

// 화면에 보일 순서: 묶음 안 자식은 묶음 바로 아래(깊이 표시).
export function partRows(q){
  const rows=[];
  const walk=(parent,depth)=>{for(const b of q.blocks.filter(x=>x.parent===parent)){rows.push({b,depth});walk(b.id,depth+1);}};
  walk(null,0);return rows;
}

export function renderParts(host,q){
  if(!q){host.innerHTML='<p class="parts-empty">문항을 선택하면 구성과 배치가 보입니다.</p>';return;}
  const groups=q.blocks.filter(b=>b.kind==='group');
  const rows=partRows(q).map(({b,depth},i)=>{
    const parent=q.blocks.find(x=>x.id===b.parent),side=parent?.layout==='나란히',sized=b.kind==='figure'||b.kind==='table';
    return `<tr data-part-id="${b.id}">
      <th class="row-num" scope="row">${i+1}</th>
      <td class="part-order"><div class="order-cell"><span>${q.blocks.filter(x=>x.parent===b.parent).indexOf(b)+1}</span><button type="button" data-part-move="up" aria-label="${E(b.label)} 위로">${ICON.up}</button><button type="button" data-part-move="down" aria-label="${E(b.label)} 아래로">${ICON.down}</button></div></td>
      <td class="part-kind">${KINDS[b.kind]}</td>
      <td class="part-name" style="--depth:${depth}"${labelInDocument(b)?' data-hwp="text"':''}><input data-part="label" aria-label="구성 이름" value="${E(b.label)}" maxlength="240"></td>
      <td><select data-part="parent" aria-label="상위 묶음"><option value=""${parent?'':' selected'}>—</option>${groups.filter(g=>g.id!==b.id).map(g=>`<option value="${g.id}"${g.id===parent?.id?' selected':''}>${E(g.label)}</option>`).join('')}</select></td>
      <td>${b.kind==='group'?select('layout',['세로','나란히'],b.layout,'배치'):'<span class="part-na">—</span>'}</td>
      <td>${side?field('ratio',formatRatio(b.ratio),'폭 비율','1'):'<span class="part-na">—</span>'}</td>
      <td>${sized?field('size',formatSize(b.size),'크기','자동'):'<span class="part-na">—</span>'}</td>
      <td>${field('gap',formatGap(b.gap),'간격','0mm')}</td>
      <td>${sized?select('align',ALIGNS,b.align||'','정렬','자동'):'<span class="part-na">—</span>'}</td>
    </tr>`;}).join('');
  const choices=q.type==='서술형'?'':`<tr data-part-id="choices"><th class="row-num" scope="row">${partRows(q).length+2}</th><td class="part-order"></td><td class="part-kind">선지</td><td class="part-name">①~⑤</td><td><span class="part-na">—</span></td><td>${select('choiceLayout',CHOICE_LAYOUTS,q.choiceLayout||'','선지 배열','자동')}</td><td colspan="4"><span class="part-na">한 줄 · 3+2 · 세로</span></td></tr>`;
  host.innerHTML=`<table id="parts" aria-label="선택 문항의 구성과 배치">
    <colgroup><col class="row-col"><col class="order-col"><col class="kind-col"><col class="name-col"><col class="parent-col"><col class="layout-col"><col class="ratio-col"><col class="size-col"><col class="gap-col"><col class="align-col"></colgroup>
    <thead><tr class="letters"><th></th>${'ABCDEFGHI'.split('').map(c=>`<th>${c}</th>`).join('')}</tr>
    <tr><th></th><th>순서</th><th>구성</th><th>이름</th><th>상위 묶음</th><th>배치</th><th>폭 비율</th><th>크기</th><th>간격</th><th>정렬</th></tr></thead>
    <tbody>${rows}<tr data-part-id="ask"><th class="row-num" scope="row">${partRows(q).length+1}</th><td class="part-order"></td><td class="part-kind">발문</td><td class="part-name">발문</td><td colspan="6"><span class="part-na">문항 시트에서 입력</span></td></tr>${choices}</tbody></table>`;
}

// 한 칸의 변경을 문항에 적용한다. 값은 눈금에 맞춰 저장한다. 잘못된 값은 예외로 알린다.
export function applyPartChange(q,id,name,value){
  if(id==='choices'){if(name!=='choiceLayout')return;const v=parseChoiceLayout(value);if(v===undefined)delete q.choiceLayout;else q.choiceLayout=v;return;}
  const b=q.blocks.find(x=>x.id===id);if(!b)throw Error('구성을 찾지 못했습니다.');
  if(name==='label'){const v=String(value).trim();if(!v)throw Error('구성 이름을 입력하세요.');b.label=v;return;}
  if(name==='layout'){if(b.kind!=='group'||!['세로','나란히'].includes(value))throw Error('배치는 세로·나란히 중에서 고르세요.');b.layout=value;if(value==='세로')for(const c of q.blocks)if(c.parent===b.id)delete c.ratio;return;}
  if(name==='parent'){
    const g=value?q.blocks.find(x=>x.kind==='group'&&x.id===value&&x.id!==b.id):null;if(value&&!g)throw Error('상위 묶음을 찾지 못했습니다.');
    for(let p=g;p;p=q.blocks.find(x=>x.id===p.parent))if(p.id===b.id)throw Error('묶음을 자기 안으로 옮길 수 없습니다.');
    b.parent=g?g.id:null;delete b.ratio;
    // 옮긴 구성은 새 묶음의 마지막 순서로 간다.
    q.blocks.splice(q.blocks.indexOf(b),1);q.blocks.push(b);return;
  }
  const parsers={ratio:parseRatio,size:parseSize,gap:parseGap,align:parseAlign};
  if(!parsers[name])return;
  const v=parsers[name](value);if(v===undefined)delete b[name];else b[name]=v;
}

// 같은 묶음 안에서 순서를 한 칸 옮긴다.
export function movePart(q,id,direction){
  const b=q.blocks.find(x=>x.id===id);if(!b)return false;
  const siblings=q.blocks.filter(x=>x.parent===b.parent),at=siblings.indexOf(b),other=siblings[at+(direction==='up'?-1:1)];
  if(!other)return false;const i=q.blocks.indexOf(b),j=q.blocks.indexOf(other);[q.blocks[i],q.blocks[j]]=[q.blocks[j],q.blocks[i]];return true;
}
