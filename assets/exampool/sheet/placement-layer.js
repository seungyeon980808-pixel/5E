// 5e_hwp 창 위의 배치 층: 그림을 끌어 다른 그림·표의 옆/위/아래에 놓고, 손잡이로 크기와 폭 비율을 바꾼다.
// 문서는 직접 고치지 않는다. 결과를 순서·묶음·폭 비율·크기 데이터로 넘기면 한글 창은 그 데이터로 다시 그려진다.
import {placeBeside,placeAround,resizeTo,setPairRatio,ratioPair} from './placement-edit.js';
import {snapSize} from './placement.js';

const ICON_GRIP='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/></svg>';
const SIDE={left:'왼쪽',right:'오른쪽',before:'위',after:'아래'};
const KIND={figure:'그림',table:'표'};
const keyOf=c=>JSON.stringify(c.stableIndex||[c.secIdx,c.paraIdx,c.controlIdx]);
// 문서 순서: 쪽 → 위 → (같은 높이면) 바깥 표 먼저 → 왼쪽. 엔진의 순서 번호는 겹친 표에서 문서 순서와 다르다.
const order=(a,b)=>a.page-b.page||Math.round((a.y-b.y)*2)/2||(b.w*b.h-a.w*a.h)||a.x-b.x;
const inside=(r,p,pad=0)=>p.x>=r.x-pad&&p.x<=r.x+r.w+pad&&p.y>=r.y-pad&&p.y<=r.y+r.h+pad;

export function attachPlacementLayer({bridge,host,hint,onApply,canEdit}){
  const doc=host.ownerDocument,layer=doc.createElement('div');layer.className='placement-layer';layer.setAttribute('aria-hidden','true');
  const outline=doc.createElement('div');outline.className='place-outline';outline.hidden=true;
  const tag=doc.createElement('span');tag.className='place-tag';outline.append(tag);
  const grip=doc.createElement('button');grip.type='button';grip.className='place-grip';grip.innerHTML=ICON_GRIP;grip.title='끌어서 표 옮기기';grip.hidden=true;
  const sizer=doc.createElement('button');sizer.type='button';sizer.className='place-size';sizer.title='끌어서 크기 바꾸기 · 5% 단위';sizer.hidden=true;
  const ghost=doc.createElement('div');ghost.className='place-ghost';ghost.hidden=true;
  const marker=doc.createElement('div');marker.className='place-marker';marker.hidden=true;
  const markerLabel=doc.createElement('span');marker.append(markerLabel);
  const readout=doc.createElement('div');readout.className='place-readout';readout.hidden=true;
  layer.append(outline,ghost,marker,readout,grip,sizer);
  let model=null,items=[],dividers=[],dividerNodes=[],hover=null,drag=null,enabled=false,base=hint?.textContent||'';
  const say=(text)=>{if(hint)hint.textContent=text||base;};

  // 한글 창 좌표(페이지 px) → 시트 문서 좌표 → 배치 층 기준 좌표.
  function toLayer(page,c){
    const placement=bridge.pagePlacement(page);if(!placement)return null;
    const a=bridge.parentPoint(placement.x+c.x*placement.scale,placement.y+c.y*placement.scale);
    const r=host.getBoundingClientRect();
    return {x:a.x-r.left,y:a.y-r.top,w:c.w*placement.scale*a.scaleX,h:c.h*placement.scale*a.scaleY};
  }
  function nativeControls(){
    const images=new Map(),tables=new Map();
    for(let page=0;page<bridge.wasm.pageCount;page++)for(const c of bridge.wasm.getPageControlLayout(page).controls||[]){
      const bucket=c.type==='image'?images:c.type==='table'?tables:null;if(!bucket)continue;
      const k=keyOf(c);if(!bucket.has(k))bucket.set(k,{...c,page});
    }
    return {images:[...images.values()].sort(order),tables:[...tables.values()].sort(order)};
  }
  function rebuild(){
    items=[];dividers=[];
    if(!enabled||!model)return;
    const {question:q,owners}=model,{images,tables}=nativeControls();
    if(images.length!==owners.images.length||tables.length!==owners.tables.length){say('배치 · 저장된 조판이 문항 데이터와 달라 끌어서 배치할 수 없습니다. 문항 새로고침 후 다시 시도하세요.');return;}
    for(const [i,t] of tables.entries())if(t.rowCount!==owners.shapes[i].rows||t.colCount!==owners.shapes[i].cols){say('배치 · 표 구조가 문항 데이터와 달라 끌어서 배치할 수 없습니다.');return;}
    const add=(c,owner,kind)=>{if(owner?.kind!=='block')return;const b=q.blocks.find(x=>x.id===owner.id);if(!b)return;const rect=toLayer(c.page,c);if(rect)items.push({id:b.id,kind,block:b,rect});};
    images.forEach((c,i)=>add(c,owners.images[i],'figure'));
    tables.forEach((c,i)=>add(c,owners.tables[i],'table'));
    // 가로 묶음 안 이웃한 두 그림·표 사이의 폭 나누기 손잡이.
    for(const g of q.blocks.filter(b=>b.kind==='group'&&b.layout==='나란히')){
      const kids=q.blocks.filter(b=>b.parent===g.id);
      for(let i=0;i+1<kids.length;i++){const l=items.find(x=>x.id===kids[i].id),r=items.find(x=>x.id===kids[i+1].id);if(l&&r&&l.rect.x+l.rect.w<=r.rect.x+2)dividers.push({l,r});}
    }
    say();
  }
  function paintDividers(){
    dividerNodes.forEach(n=>n.remove());dividerNodes=[];
    for(const d of dividers){
      const n=doc.createElement('button');n.type='button';n.className='place-divider';n.title='끌어서 폭 비율 바꾸기';
      const x=(d.l.rect.x+d.l.rect.w+d.r.rect.x)/2,top=Math.min(d.l.rect.y,d.r.rect.y),bottom=Math.max(d.l.rect.y+d.l.rect.h,d.r.rect.y+d.r.rect.h);
      Object.assign(n.style,{left:`${x-6}px`,top:`${top}px`,height:`${bottom-top}px`});
      n.addEventListener('pointerdown',e=>startDivider(e,d,n));layer.append(n);dividerNodes.push(n);
    }
  }
  const place=(n,r)=>Object.assign(n.style,{left:`${r.x}px`,top:`${r.y}px`,width:`${r.w}px`,height:`${r.h}px`});
  function showHover(item){
    hover=item;outline.hidden=!item;grip.hidden=!item||item.kind!=='table';sizer.hidden=!item;
    if(!item)return;
    place(outline,item.rect);tag.textContent=`${KIND[item.kind]} · ${item.block.label}${item.block.size?` · ${item.block.size}%`:''}`;
    Object.assign(grip.style,{left:`${item.rect.x-22}px`,top:`${item.rect.y}px`});
    Object.assign(sizer.style,{left:`${item.rect.x+item.rect.w-5}px`,top:`${item.rect.y+item.rect.h-5}px`});
  }
  function refresh(){rebuild();paintDividers();if(hover)showHover(items.find(x=>x.id===hover.id)||null);}

  // 놓을 자리: 대상의 왼쪽·오른쪽 1/3이면 옆(가로 묶음), 가운데면 위/아래(세로 순서).
  function dropAt(p){
    const others=items.filter(x=>x.id!==drag.item.id);
    let target=others.find(x=>inside(x.rect,p,10));
    if(!target){let best=Infinity;for(const x of others){const d=Math.abs(p.y-(x.rect.y+x.rect.h/2));if(p.x>=x.rect.x-40&&p.x<=x.rect.x+x.rect.w+40&&d<best){best=d;target=x;}}if(best>80)target=null;}
    if(!target)return null;
    const fx=(p.x-target.rect.x)/target.rect.w,fy=(p.y-target.rect.y)/target.rect.h;
    const side=fx<.3?'left':fx>.7?'right':fy<.5?'before':'after';
    return {target,side};
  }
  function showDrop(drop){
    marker.hidden=!drop;if(!drop){say('배치 · 놓을 그림이나 표 위로 옮기세요.');return;}
    const r=drop.target.rect,vertical=drop.side==='left'||drop.side==='right';
    marker.dataset.axis=vertical?'v':'h';
    if(vertical)Object.assign(marker.style,{left:`${drop.side==='left'?r.x-4:r.x+r.w+1}px`,top:`${r.y}px`,width:'3px',height:`${r.h}px`});
    else Object.assign(marker.style,{left:`${r.x}px`,top:`${drop.side==='before'?r.y-4:r.y+r.h+1}px`,width:`${r.w}px`,height:'3px'});
    const name=`${KIND[drop.target.kind]} ${drop.target.block.label}`;
    let text=vertical?`${name} ${SIDE[drop.side]}에 놓기 · 가로 묶음`:`${name} ${SIDE[drop.side]}에 놓기`;
    if(vertical&&drop.target.block.parent===drag.item.block.parent&&model.question.blocks.find(b=>b.id===drop.target.block.parent)?.layout==='나란히')text=`${name} ${SIDE[drop.side]}에 놓기 · 같은 가로 묶음`;
    else if(vertical){const [a,b]=drop.side==='right'?ratioPair(drop.target.rect.w,drag.item.rect.w):ratioPair(drag.item.rect.w,drop.target.rect.w);text+=` · ${drop.side==='right'?`${KIND[drop.target.kind]} ${a} : ${KIND[drag.item.kind]} ${b}`:`${KIND[drag.item.kind]} ${a} : ${KIND[drop.target.kind]} ${b}`}`;}
    markerLabel.textContent=text;say(`배치 · ${text}`);
  }
  // 시트 문서 좌표(이 층 기준)로 바꾼 포인터 위치.
  const fromParent=(x,y)=>{const r=host.getBoundingClientRect();return {x:x-r.left,y:y-r.top};};
  const fromFrame=e=>{const p=bridge.parentPoint(e.clientX,e.clientY);return fromParent(p.x,p.y);};

  function beginMove(item,start,pointerId,captureTarget){
    drag={mode:'move',item,start,offset:{x:start.x-item.rect.x,y:start.y-item.rect.y},moved:false,pointerId,captureTarget};
  }
  function moveTo(p){
    if(!drag.moved&&Math.hypot(p.x-drag.start.x,p.y-drag.start.y)<5)return;
    if(!drag.moved){drag.moved=true;layer.dataset.dragging='true';ghost.hidden=false;outline.hidden=true;grip.hidden=true;sizer.hidden=true;}
    place(ghost,{x:p.x-drag.offset.x,y:p.y-drag.offset.y,w:drag.item.rect.w,h:drag.item.rect.h});
    drag.drop=dropAt(p);showDrop(drag.drop);
  }
  function endDrag(apply){
    const d=drag;drag=null;layer.dataset.dragging='false';ghost.hidden=true;marker.hidden=true;readout.hidden=true;
    if(!d)return;
    if(apply&&d.mode==='move'&&d.moved&&d.drop){
      const {target,side}=d.drop;
      onApply(q=>side==='left'||side==='right'?placeBeside(q,d.item.id,target.id,side,{dragWidth:d.item.rect.w,targetWidth:target.rect.w}):placeAround(q,d.item.id,target.id,side),`${d.item.block.label}을(를) ${target.block.label} ${SIDE[side]}에 놓았습니다.`);
    }else if(apply&&d.mode==='size'&&d.width!==undefined)onApply(q=>resizeTo(q,d.item.id,d.width,d.available),`${d.item.block.label} 크기 ${d.label}`);
    else if(apply&&d.mode==='divider'&&d.split)onApply(q=>setPairRatio(q,d.pair.l.id,d.pair.r.id,d.split.left,d.split.right),`폭 비율 ${d.label}`);
    say();
  }

  // 칸 폭(px, 이 층 기준): 가로 묶음 안이면 그 칸, 아니면 본문 폭. 상자 안이면 상자 여백을 뺀다.
  function availableWidth(item){
    const placement=bridge.pagePlacement(0);if(!placement)return item.rect.w;
    const page=JSON.parse(bridge.wasm.borrowDocumentHandle().getPageDef(0)),body=(page.width-page.marginLeft-page.marginRight)/75;
    const a=bridge.parentPoint(placement.x,placement.y),px=v=>v*placement.scale*a.scaleX;
    const q=model.question;let width=px(body),node=item.block,chain=[];
    while(node.parent){const p=q.blocks.find(b=>b.id===node.parent);chain.unshift({p,child:node});node=p;}
    for(const {p,child} of chain){
      const boxed=p.boxed===true||p.boxed===undefined&&p.label==='실험';if(boxed)width-=px(22);
      if(p.layout==='나란히'){const kids=q.blocks.filter(b=>b.parent===p.id),total=kids.reduce((s,k)=>s+(k.ratio||1),0);width=width*(child.ratio||1)/total-px(16);}
    }
    return Math.max(20,width);
  }

  sizer.addEventListener('pointerdown',e=>{
    if(!hover||!canEdit())return;e.preventDefault();sizer.setPointerCapture(e.pointerId);
    drag={mode:'size',item:hover,start:fromParent(e.clientX,e.clientY),available:availableWidth(hover)};readout.hidden=false;layer.dataset.dragging='true';
  });
  sizer.addEventListener('pointermove',e=>{
    if(drag?.mode!=='size')return;const p=fromParent(e.clientX,e.clientY),w=Math.max(10,drag.item.rect.w+(p.x-drag.start.x));
    const size=snapSize(w/drag.available*100);drag.width=drag.available*size/100;drag.label=size===100?'자동(칸 폭)':`${size}%`;
    place(ghost,{...drag.item.rect,w:drag.width,h:drag.item.rect.h*drag.width/drag.item.rect.w});ghost.hidden=false;
    Object.assign(readout.style,{left:`${drag.item.rect.x+drag.width+8}px`,top:`${drag.item.rect.y+drag.item.rect.h-22}px`});readout.textContent=drag.label;say(`배치 · 크기 ${drag.label} · 칸 폭 대비 5% 단위`);
  });
  sizer.addEventListener('pointerup',()=>{if(drag?.mode==='size')endDrag(true);});
  sizer.addEventListener('pointercancel',()=>endDrag(false));

  grip.addEventListener('pointerdown',e=>{
    if(!hover||!canEdit())return;e.preventDefault();grip.setPointerCapture(e.pointerId);beginMove(hover,fromParent(e.clientX,e.clientY));
  });
  grip.addEventListener('pointermove',e=>{if(drag?.mode==='move')moveTo(fromParent(e.clientX,e.clientY));});
  grip.addEventListener('pointerup',()=>{if(drag?.mode==='move')endDrag(true);});
  grip.addEventListener('pointercancel',()=>endDrag(false));

  function startDivider(e,pair,node){
    if(!canEdit())return;e.preventDefault();node.setPointerCapture(e.pointerId);
    drag={mode:'divider',pair};layer.dataset.dragging='true';readout.hidden=false;
    const move=ev=>{const p=fromParent(ev.clientX,ev.clientY),left=Math.max(10,p.x-pair.l.rect.x),right=Math.max(10,pair.r.rect.x+pair.r.rect.w-p.x),[a,b]=ratioPair(left,right);
      drag.split={left,right};drag.label=`${KIND[pair.l.kind]} ${a} : ${KIND[pair.r.kind]} ${b}`;readout.textContent=drag.label;Object.assign(readout.style,{left:`${p.x+8}px`,top:`${p.y}px`});
      Object.assign(node.style,{left:`${p.x-6}px`});say(`배치 · 폭 비율 ${drag.label}`);};
    const up=ok=>()=>{node.removeEventListener('pointermove',move);node.removeEventListener('pointerup',onUp);node.removeEventListener('pointercancel',onCancel);endDrag(ok);};
    const onUp=up(true),onCancel=up(false);
    node.addEventListener('pointermove',move);node.addEventListener('pointerup',onUp);node.addEventListener('pointercancel',onCancel);
  }

  // 한글 창 안의 포인터: 그림 위에서는 바로 끌 수 있다. 표는 글을 고쳐야 하므로 손잡이로만 끈다.
  let frameDoc=null;
  const onFrameMove=e=>{
    if(!enabled)return;const p=fromFrame(e);
    if(drag?.mode==='move'){e.stopPropagation();e.preventDefault();moveTo(p);return;}
    if(drag)return;
    showHover(items.find(x=>inside(x.rect,p,x.kind==='table'?0:0))||null);
  };
  const onFrameDown=e=>{
    if(!enabled||e.button!==0||drag||!canEdit())return;const p=fromFrame(e),item=items.find(x=>x.kind==='figure'&&inside(x.rect,p));
    // 그림 위에서 누른 마우스는 배치 층이 맡는다. 한글 엔진이 같은 동작으로 그림을 옮기면 데이터와 문서가 어긋난다.
    if(item){e.preventDefault();e.stopPropagation();beginMove(item,p);}
  };
  const onFrameUp=e=>{if(drag?.mode==='move'){if(drag.moved){e.stopPropagation();e.preventDefault();}endDrag(true);}};
  const onFrameKey=e=>{if(e.key==='Escape'&&drag){e.stopPropagation();endDrag(false);}};
  function bindFrame(){
    const next=bridge.editor.element.contentDocument;if(next===frameDoc)return;
    if(frameDoc){frameDoc.removeEventListener('pointermove',onFrameMove,true);frameDoc.removeEventListener('pointerdown',onFrameDown,true);frameDoc.removeEventListener('pointerup',onFrameUp,true);frameDoc.removeEventListener('keydown',onFrameKey,true);}
    frameDoc=next;frameDoc.addEventListener('pointermove',onFrameMove,true);frameDoc.addEventListener('pointerdown',onFrameDown,true);frameDoc.addEventListener('pointerup',onFrameUp,true);frameDoc.addEventListener('keydown',onFrameKey,true);
  }
  doc.addEventListener('keydown',onFrameKey,true);
  host.addEventListener('pointerleave',()=>{if(!drag)showHover(null);});

  return {
    // 문서를 새로 불러온 뒤: 이 문항과, 문서 순서대로의 그림·표 주인 목록을 알려 준다.
    setModel(next){model=next;enabled=!!next;host.append(layer);bindFrame();showHover(null);refresh();},
    clear(){model=null;enabled=false;endDrag(false);showHover(null);items=[];dividers=[];paintDividers();say();},
    refresh(){if(enabled&&!drag)refresh();},
  };
}
