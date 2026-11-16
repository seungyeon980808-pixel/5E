import {address,rectangle,expandRange,parseClipboard,encodeClipboard,planPaste} from './grid-model.js';

// One interaction model for both the question registry and every material table.
export function createSheetGrid({root=document,formula,nameBox,onSelect,onWrite,onHistory,onStatus,onOpen,onDraft}){
  let active=null,anchor=null,lead=null,range=null,scopeKey=null,editing=null,drag=null,copied=null,refreshing=false;
  const tableFor=n=>n?.closest?.('table[data-grid]');
  const cellFor=n=>n?.closest?.('td[data-grid-r]');
  const inputFor=n=>n?.querySelector('input[data-field],textarea[data-field],select[data-field],textarea[data-tcell]');
  const cells=t=>[...t.querySelectorAll('td[data-grid-r]')];
  const pos=n=>[Number(n.dataset.gridR),Number(n.dataset.gridC)];
  const bounds=t=>[Number(t.dataset.gridRows),Number(t.dataset.gridCols)];
  const mergers=t=>cells(t).filter(n=>n.rowSpan>1||n.colSpan>1).map(n=>({r:pos(n)[0],c:pos(n)[1],rs:n.rowSpan,cs:n.colSpan}));
  const find=(t,r,c)=>cells(t).find(n=>{const [y,x]=pos(n);return r>=y&&r<y+n.rowSpan&&c>=x&&c<x+n.colSpan;});
  const value=n=>{const input=inputFor(n);return input?.tagName==='SELECT'?input.value===''?'':input.selectedOptions[0]?.textContent||'':input?.value||'';};
  const identity=t=>t.dataset.grid==='registry'?'registry':t.closest('.tab-content')?.id+':'+t.dataset.grid;
  const describe=()=>{if(!active?.isConnected)return null;const t=tableFor(active);return {table:t,id:t.dataset.grid,key:scopeKey,r:pos(active)[0],c:pos(active)[1],range:[...range],rows:bounds(t)[0],cols:bounds(t)[1]};};
  const isGrid=n=>!!tableFor(n)&&(!!cellFor(n)||n.matches?.('th'));
  function paint(user=false){
    root.querySelectorAll('.grid-range-outline').forEach(n=>n.remove());
    root.querySelectorAll('table[data-grid] td[data-grid-r]').forEach(n=>{
      const same=active&&tableFor(n)===tableFor(active),[r,c]=pos(n),selected=same&&range&&r<=range[2]&&c<=range[3]&&r+n.rowSpan-1>=range[0]&&c+n.colSpan-1>=range[1];
      n.classList.toggle('grid-selected',!!selected);n.classList.toggle('grid-active',n===active);n.classList.toggle('grid-copied',!!copied&&identity(tableFor(n))===copied.key&&r<=copied.range[2]&&c<=copied.range[3]&&r>=copied.range[0]&&c>=copied.range[1]);n.setAttribute('aria-selected',String(!!selected));n.tabIndex=n===active?0:-1;
      const input=inputFor(n);if(input&&input.tagName!=='SELECT')input.readOnly=n!==active;
      if(same){n.classList.toggle('range-top',selected&&r===range[0]);n.classList.toggle('range-bottom',selected&&r+n.rowSpan-1===range[2]);n.classList.toggle('range-left',selected&&c===range[1]);n.classList.toggle('range-right',selected&&c+n.colSpan-1===range[3]);}
    });
    if(!active?.isConnected){formula.value='';nameBox.textContent='—';formula.disabled=true;return;}
    formula.disabled=!!active.dataset.open;const table=tableFor(active),offset=Number(table.dataset.gridColumnOffset??(table.dataset.orientation==='vertical'?1:0)),rowOffset=Number(table.dataset.gridRowOffset||0);nameBox.textContent=range[0]===range[2]&&range[1]===range[3]?address(pos(active)[0]+rowOffset,pos(active)[1]+offset):address(range[0]+rowOffset,range[1]+offset)+':'+address(range[2]+rowOffset,range[3]+offset);
    if(!editing)formula.value=value(active);
    const t=tableFor(active);t.querySelectorAll('th').forEach(n=>{const r=Number(n.dataset.gridRow),c=Number(n.dataset.gridCol);n.classList.toggle('grid-header-selected',n.hasAttribute('data-grid-row')?r>=range[0]&&r<=range[2]:n.hasAttribute('data-grid-col')?c>=range[1]&&c<=range[3]:false);});
    const selected=cells(t).filter(n=>n.classList.contains('grid-selected'));
    if(selected.length>1){const container=t.parentElement,rects=selected.map(n=>n.getBoundingClientRect()),base=container.getBoundingClientRect(),x=Math.min(...rects.map(r=>r.left)),y=Math.min(...rects.map(r=>r.top)),right=Math.max(...rects.map(r=>r.right)),bottom=Math.max(...rects.map(r=>r.bottom)),outline=root.createElement('div');
      outline.className='grid-range-outline';outline.setAttribute('aria-hidden','true');Object.assign(outline.style,{left:x-base.left+container.scrollLeft+'px',top:y-base.top+container.scrollTop+'px',width:right-x+'px',height:bottom-y+'px'});container.append(outline);
    }
    onSelect?.({...describe(),user});
  }
  function select(cell,{extend=false,focus=true,keepRange=false}={}){
    if(!cell)return;const t=tableFor(cell),key=identity(t),point=pos(cell);
    if(!extend||scopeKey!==key){anchor=point;active=cell;}
    lead=point;scopeKey=key;if(!keepRange)range=expandRange(extend?rectangle(anchor,point):rectangle(point,point),mergers(t));
    paint(true);if(focus){const input=inputFor(active);(input?.tagName==='SELECT'?active:input||active).focus({preventScroll:true});cell.scrollIntoView({block:'nearest',inline:'nearest'});}
  }
  function refresh({questionId}={}){
    if(refreshing)return;refreshing=true;const focusHere=n=>!n||n===root.body||!!tableFor(n),previous=active?{key:scopeKey,point:pos(active),range,anchor,lead,focused:root.activeElement===active||cellFor(root.activeElement)===active||!active.isConnected&&focusHere(root.activeElement)}:null;
    root.querySelectorAll('#registry,.data-table').forEach(t=>{
      t.dataset.grid=t.id==='registry'?'registry':t.closest('[data-table]').dataset.table;t.setAttribute('role','grid');
      const rows=[...t.tBodies[0]?.rows||[]],vertical=t.dataset.orientation==='vertical',cols=t.id==='registry'?(vertical?t.tHead.rows[0].cells.length-2:8):Number(t.closest('[data-table]').querySelectorAll('col').length)-1;
      t.dataset.gridRows=rows.length;t.dataset.gridCols=cols;t.setAttribute('aria-rowcount',rows.length);t.setAttribute('aria-colcount',cols);
      rows.forEach((row,r)=>{row.querySelectorAll('th').forEach(n=>{n.dataset.gridRow=r;n.tabIndex=-1;});[...row.cells].filter(n=>n.tagName==='TD').forEach((n,c)=>{
        n.dataset.gridR=t.id==='registry'?r:n.dataset.r;n.dataset.gridC=t.id==='registry'?c:n.dataset.c;n.setAttribute('role','gridcell');
        const input=inputFor(n);n.setAttribute('aria-label',input.getAttribute('aria-label'));input.tabIndex=-1;if(input.tagName!=='SELECT')input.readOnly=true;
      });});
      [...t.tHead?.rows||[]].forEach(row=>[...row.cells].forEach((n,c)=>{if(c>(vertical?1:0))n.dataset.gridCol=c-(vertical?2:1);else n.dataset.gridAll='true';}));
      if(!active)cells(t)[0]?.setAttribute('tabindex','0');
    });
    if(previous){const t=[...root.querySelectorAll('table[data-grid]')].find(t=>identity(t)===previous.key&&t.getClientRects().length);
      if(t){const [nr,nc]=bounds(t);active=find(t,Math.min(previous.point[0],nr-1),Math.min(previous.point[1],nc-1));range=expandRange([Math.min(previous.range[0],nr-1),Math.min(previous.range[1],nc-1),Math.min(previous.range[2],nr-1),Math.min(previous.range[3],nc-1)],mergers(t));anchor=previous.anchor;lead=previous.lead||pos(active);if(active&&previous.focused)(inputFor(active)?.tagName==='SELECT'?active:inputFor(active)||active).focus({preventScroll:true});}
      else {active=null;range=null;}
    }
    const registry=root.querySelector('#registry[data-grid]');
    if(questionId&&registry&&(!active||scopeKey==='registry')){const vertical=registry.dataset.orientation==='vertical',at=vertical?[...registry.tHead.rows[1].cells].filter(n=>n.dataset.id).findIndex(n=>n.dataset.id===questionId):[...registry.tBodies[0].rows].findIndex(row=>row.dataset.id===questionId);if(at>=0&&(!active||pos(active)[vertical?1:0]!==at)){active=find(registry,vertical?(active?pos(active)[0]:0):at,vertical?at:(active?pos(active)[1]:0));scopeKey='registry';anchor=pos(active);lead=anchor;range=rectangle(anchor,anchor);}}
    if(!active){const first=registry&&cells(registry)[0];if(first){active=first;scopeKey=identity(registry);anchor=pos(first);lead=anchor;range=rectangle(anchor,anchor);}}
    paint();refreshing=false;
  }
  function finish(cancel=false){
    if(!editing)return true;const draft=editing;editing=null;draft.cell.classList.remove('grid-editing');draft.input.readOnly=true;const text=draft.fromFormula?formula.value:draft.input.tagName==='SELECT'?value(draft.cell):draft.input.value;
    if(cancel){draft.input.value=draft.original;onDraft?.(null);paint();return true;}
    if(text===draft.text){paint();return true;}
    const selected={...draft.description,range:[draft.description.r,draft.description.c,draft.description.r,draft.description.c]};
    const ok=onWrite(selected,[{r:selected.r,c:selected.c,value:text}]);onDraft?.(null);refresh();
    // 검사에 걸리면 예전에는 친 글 전체가 편집 전 값으로 돌아갔다(M10). 같은 칸을 친 글 그대로 다시 열어 고칠 수 있게 둔다.
    // 다른 입력란으로 초점이 이미 옮겨 갔으면 초점을 빼앗지 않는다(그때는 전처럼 칸 값이 남는다).
    if(ok===false&&draft.input.tagName!=='SELECT'){
      const focus=document.activeElement,away=focus&&focus!==document.body&&focus!==draft.input&&focus!==formula&&!isGrid(focus);
      const table=[...root.querySelectorAll('table[data-grid]')].find(n=>identity(n)===draft.description.key),cell=table&&find(table,draft.description.r,draft.description.c);
      if(cell&&!away){active=cell;begin(text);}}
    return ok;
  }
  function begin(replace){
    if(!active||editing)return;if(active.dataset.open){onOpen?.(describe(),active.dataset.open);return;}const input=inputFor(active);editing={cell:active,input,original:input.value,text:value(active),description:describe()};active.classList.add('grid-editing');
    input.readOnly=false;input.focus();if(input.tagName!=='SELECT'){if(replace!==undefined)input.value=replace;else if(input.type!=='number')input.setSelectionRange?.(input.value.length,input.value.length);}
    formula.value=input.tagName==='SELECT'?value(active):input.value;
    if(replace!==undefined)onDraft?.(describe(),input.value);
  }
  function move(key,extend=false){
    const t=tableFor(active),[r,c]=extend&&lead?lead:pos(active),from=find(t,r,c)||active,[nr,nc]=bounds(t);let next;
    if(!extend&&['Enter','Tab','BackEnter','BackTab'].includes(key)&&(range[0]!==range[2]||range[1]!==range[3])){
      const list=cells(t).filter(n=>{const [y,x]=pos(n);return y>=range[0]&&x>=range[1]&&y<=range[2]&&x<=range[3];}).sort((a,b)=>key.endsWith('Enter')?pos(a)[1]-pos(b)[1]||pos(a)[0]-pos(b)[0]:pos(a)[0]-pos(b)[0]||pos(a)[1]-pos(b)[1]);
      next=list[(list.indexOf(active)+(key.startsWith('Back')?-1:1)+list.length)%list.length];select(next,{keepRange:true});return;
    }
    if(key==='Tab'||key==='BackTab'){const list=cells(t),i=list.indexOf(active),at=i+(key==='Tab'?1:-1);next=list[at];
      if(!next){const outside=[...root.querySelectorAll('button,input,textarea,select,summary,[tabindex="0"]')].filter(n=>!tableFor(n)&&!n.disabled&&n.tabIndex>=0&&n.getClientRects().length);
        const candidate=key==='Tab'?outside.find(n=>t.compareDocumentPosition(n)&4):outside.reverse().find(n=>t.compareDocumentPosition(n)&2);candidate?.focus();return;}
    }
    else if(key==='Home')next=find(t,r,0);else if(key==='End')next=find(t,r,nc-1);
    else {const y=key==='ArrowUp'||key==='BackEnter'?r-1:key==='ArrowDown'||key==='Enter'?r+from.rowSpan:r,x=key==='ArrowLeft'?c-1:key==='ArrowRight'?c+from.colSpan:c;next=y>=0&&x>=0&&y<nr&&x<nc?find(t,y,x):from;}
    select(next,{extend});
  }
  function clear(){if(!active)return;const d=describe(),writes=[];for(let r=range[0];r<=range[2];r++)for(let c=range[1];c<=range[3];c++)writes.push({r,c,value:''});onWrite(d,writes,{clear:true});refresh();}
  function paste(text){
    if(!active)return;try{const d=describe(),t=tableFor(active),vertical=t.dataset.orientation==='vertical',matrix=parseClipboard(text,vertical?{maxRows:d.rows,maxCols:500}:undefined),selected=cells(t).filter(n=>{const [r,c]=pos(n);return r>=range[0]&&c>=range[1]&&r<=range[2]&&c<=range[3];}),target=selected.length===1?rectangle(pos(active),pos(active)):range,plan=planPaste(matrix,target,d.id==='registry'&&!vertical?500:d.rows,d.cols);
      if(onWrite(d,plan.writes)){range=expandRange(plan.range,mergers(tableFor(active)));copied=null;refresh();onStatus('붙여넣기 완료 · '+matrix.length+'행 × '+matrix[0].length+'열');}
    }catch(e){onStatus(e.message,true);}
  }
  root.addEventListener('pointerdown',e=>{
    // Keep focus until the click handler finishes the cell edit. Blurring
    // first redraws the header and removes the button before its click fires.
    if(e.target.closest?.('button[data-preview]')){e.preventDefault();return;}
    let cell=cellFor(e.target),t=tableFor(e.target);const header=e.target.closest?.('th'),target=t?{key:identity(t),point:cell&&pos(cell)}:null;
    if(editing&&(editing.cell.contains(e.target)||e.target===formula))return;
    if(!finish()) {e.preventDefault();e.stopPropagation();return;}
    // Finishing an edit redraws the rows (and sometimes the table), so look the clicked cell up again.
    if(t&&(!t.isConnected||cell&&!cell.isConnected)){if(!t.isConnected)t=[...root.querySelectorAll('table[data-grid]')].find(n=>identity(n)===target.key);if(cell)cell=t&&find(t,...target.point);}
    if(!t||e.button!==0)return;
    if(e.target.matches?.('[data-axis]')||e.target.closest?.('button'))return;
    if(cell){
      if(cell===active&&inputFor(cell)?.tagName==='SELECT'&&e.clientX>cell.getBoundingClientRect().right-24){begin();return;}
      e.preventDefault();select(cell,{extend:e.shiftKey});drag={table:t};
    }
    else if(header){const [nr,nc]=bounds(t);if(!nr)return;e.preventDefault();let rect;
      if(header.dataset.gridAll)rect=[0,0,nr-1,nc-1];else if(header.dataset.gridCol!==undefined){const c=Number(header.dataset.gridCol);rect=[0,c,nr-1,c];}else {const r=Number(header.dataset.gridRow);rect=[r,0,r,nc-1];}
      select(find(t,rect[0],rect[1]));range=expandRange(rect,mergers(t));paint();
    }
  },true);
  root.addEventListener('pointermove',e=>{if(!drag||!(e.buttons&1))return;const cell=cellFor(e.target);if(cell&&tableFor(cell)===drag.table)select(cell,{extend:true,focus:false});});
  root.addEventListener('pointerup',()=>{drag=null;});
  root.addEventListener('dblclick',e=>{const cell=cellFor(e.target);if(cell&&!e.target.matches?.('[data-axis]')){e.preventDefault();select(cell);begin();}});
  root.addEventListener('focusin',e=>{const cell=cellFor(e.target);if(cell&&e.target===cell&&cell!==active)select(cell,{focus:false});});
  root.addEventListener('compositionstart',e=>{if(e.target===inputFor(active)&&!editing)begin('');},true);
  root.addEventListener('keydown',e=>{
    if(e.isComposing||e.keyCode===229||e.target.matches?.('[data-axis]'))return;
    const controlled=cellFor(e.target)||e.target===formula;if(!controlled||!active)return;
    const mod=e.metaKey||e.ctrlKey,key=e.key;
    if(editing||e.target===formula){
      if(key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(true);paint();active?.focus();return;}
      if((key==='Enter'||key==='Tab')&&!e.altKey){e.preventDefault();e.stopImmediatePropagation();if(finish()){move(e.shiftKey?(key==='Enter'?'BackEnter':'BackTab'):key);}return;}
      if(key==='Enter'&&e.altKey){e.preventDefault();if(editing?.input.tagName!=='SELECT'){const n=e.target===formula?formula:editing.input,a=n.selectionStart??n.value.length,b=n.selectionEnd??a;n.setRangeText('\n',a,b,'end');editing.input.value=n.value;formula.value=n.value;onDraft?.(describe(),n.value);}return;}
      // Keep native text shortcuts and arrow movement while editing.
      if(!(mod&&key.toLowerCase()==='s'))e.stopImmediatePropagation();return;
    }
    if(mod&&['z','y'].includes(key.toLowerCase())){e.preventDefault();e.stopImmediatePropagation();onHistory(key.toLowerCase()==='y'||e.shiftKey?'redo':'undo');refresh();return;}
    if(mod&&key.toLowerCase()==='a'){e.preventDefault();e.stopImmediatePropagation();const [nr,nc]=bounds(tableFor(active));range=expandRange([0,0,nr-1,nc-1],mergers(tableFor(active)));paint();return;}
    if(key==='Escape'){e.preventDefault();e.stopImmediatePropagation();copied=null;select(active);return;}
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Tab','Home','End'].includes(key)&&!(e.altKey&&key==='ArrowDown')){
      e.preventDefault();e.stopImmediatePropagation();move(e.shiftKey&&key==='Enter'?'BackEnter':e.shiftKey&&key==='Tab'?'BackTab':key,e.shiftKey&&!['Enter','Tab'].includes(key));return;
    }
    if(key==='F2'||e.altKey&&key==='ArrowDown'){e.preventDefault();e.stopImmediatePropagation();begin();return;}
    if(key==='Delete'||key==='Backspace'){e.preventDefault();e.stopImmediatePropagation();clear();return;}
    if(!mod&&!e.altKey&&(key.length===1||key==='Process')){e.preventDefault();e.stopImmediatePropagation();begin(key==='Process'?'':key);}
  },true);
  root.addEventListener('copy',e=>{
    if(!active||editing||!cellFor(e.target)||e.target.matches?.('[data-axis]'))return;const t=tableFor(active),rows=[],lookup=new Map(cells(t).map(n=>[pos(n).join(':'),n]));
    for(let r=range[0];r<=range[2];r++){const row=[];for(let c=range[1];c<=range[3];c++){const n=lookup.get(r+':'+c);row.push(n?value(n):'');}rows.push(row);}
    e.preventDefault();e.clipboardData.setData('text/plain',encodeClipboard(rows));copied={key:scopeKey,range:[...range]};paint();onStatus('복사됨 · 붙여넣을 셀을 선택하세요. Esc로 복사 표시 해제');
  });
  root.addEventListener('paste',e=>{if(active&&!editing&&cellFor(e.target)&&!e.target.matches?.('[data-axis]')){e.preventDefault();e.stopImmediatePropagation();paste(e.clipboardData.getData('text/plain'));}},true);
  // keydown 없이 글자가 바로 들어오면(받아쓰기·이모지·일부 입력기) 편집을 시작한다. 글자 넣기는 그 글자로 시작한다 —
  // 빈 값으로 시작하면 WebKit이 들어오던 첫 글자를 버렸다.
  root.addEventListener('beforeinput',e=>{if(editing||!cellFor(e.target)||e.target!==inputFor(active))return;if(e.inputType==='insertText'&&e.data){e.preventDefault();begin(e.data);}else begin('');},true);
  root.addEventListener('input',e=>{if(editing&&e.target===editing.input){formula.value=editing.input.tagName==='SELECT'?value(active):editing.input.value;onDraft?.(describe(),formula.value);}});
  root.addEventListener('change',e=>{if(editing&&e.target===editing.input&&e.target.tagName==='SELECT'){e.stopImmediatePropagation();finish();active?.focus();}},true);
  formula.addEventListener('focus',()=>{if(active&&!editing&&!active.dataset.open){begin();if(editing){editing.fromFormula=true;formula.focus();}}});
  formula.addEventListener('input',()=>{if(editing){const n=editing.input;if(n.tagName==='SELECT'){const option=[...n.options].find(o=>o.textContent===formula.value||o.value===formula.value);if(option)n.value=option.value;}else n.value=formula.value;onDraft?.(describe(),formula.value);}});
  // Clicking a toolbar while typing commits first, before its action is dispatched.
  // 한글 창을 다시 그리는 동안 편집기가 입력 위치를 가져가도 시트 칸 입력은 끝내지 않는다(keepEditing).
  let keeping=0;
  root.addEventListener('focusout',e=>{if(keeping)return;if(editing&&e.target===editing.input&&e.relatedTarget!==formula&&!editing.cell.contains(e.relatedTarget))finish();});
  async function keepEditing(run){
    keeping++;const input=editing?.input;
    try{return await run();}
    finally{keeping--;if(!keeping&&editing&&editing.input===input&&input.isConnected&&root.activeElement!==input){const at=[input.selectionStart,input.selectionEnd];input.focus({preventScroll:true});input.setSelectionRange?.(at[0],at[1]);}}
  }
  root.defaultView.addEventListener('resize',()=>paint());
  return {refresh,finish,keepEditing,selectCell:({row,col=0,focus=false})=>{if(editing)return;const t=root.querySelector('#registry[data-grid]');if(t)select(find(t,row,col),{focus});},manages:n=>!!cellFor(n)&&!n.matches?.('[data-axis]'),selected:describe};
}
