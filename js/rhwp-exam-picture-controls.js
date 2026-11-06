import {resizeRegion,sourceDelta,regionGeometry,validatePictureLayout,validRegion} from './rhwp-exam-region.js?v=1.7.0-four-session-integration';
const copy=v=>structuredClone(v);
const settingIcon=()=>document.querySelector('#settings-menu-btn svg')?.cloneNode(true);

export class PictureSettings {
  constructor(host,{onApply,onError}={}) {
    this.onApply=onApply;this.onError=onError;
    this.root=document.createElement('form');this.root.className='exam-picture-settings';this.root.hidden=true;
    this.root.setAttribute('role','dialog');this.root.setAttribute('aria-label','그림 설정');
    this.root.innerHTML=`<div class="exam-settings-heading"><strong>그림 설정</strong><button type="button" data-settings-close aria-label="그림 설정 닫기">닫기</button></div>
      <label class="exam-setting-check"><input type="checkbox" data-layout="treatAsChar">글자처럼 취급</label>
      <label>정렬<select data-layout="alignment"><option value="Left">왼쪽</option><option value="Center">가운데</option><option value="Right">오른쪽</option></select></label>
      <fieldset><legend>본문과의 간격</legend><div class="exam-setting-grid">${['top','bottom','left','right'].map((k,i)=>`<label data-margin="${k}">${['위','아래','왼쪽','오른쪽'][i]}<input data-layout="${k}" type="number" min="0" max="720" step="0.5" required>pt</label>`).join('')}</div></fieldset>
      <fieldset data-wrap-group><legend>어울림</legend><div class="exam-wrap-options" role="group" aria-label="어울림 사용 여부"><button type="button" data-wrap="Square">사용</button><button type="button" data-wrap="TopAndBottom">사용 안 함</button></div><p data-wrap-hint></p>
      <details><summary>고급 배치</summary><label>본문 배치<select data-layout="textWrap"><option value="TopAndBottom">자리 차지</option><option value="Square">어울림</option><option value="Tight">빈 공간 채움</option><option value="BehindText">글 뒤로</option><option value="InFrontOfText">글 앞으로</option></select></label></details></fieldset>
      <p data-alignment-hint></p><div class="exam-settings-footer"><button type="button" data-settings-close>취소</button><button type="submit" class="exam-primary">적용</button></div>`;
    host.append(this.root);
    this.root.addEventListener('change',e=>{const k=e.target.dataset.layout;if(!k)return;this.value[k]=k==='treatAsChar'?e.target.checked:['top','bottom','left','right'].includes(k)?Number(e.target.value):e.target.value;this.refresh();});
    this.root.addEventListener('click',e=>{const wrap=e.target.closest('[data-wrap]');if(wrap){this.value.textWrap=wrap.dataset.wrap;this.refresh();}if(e.target.closest('[data-settings-close]'))this.close();});
    this.root.addEventListener('submit',async e=>{e.preventDefault();if(!this.root.reportValidity())return;try{validatePictureLayout(this.value);if(await this.onApply?.(copy(this.value),this.context)!==false)this.close();}catch(error){this.onError?.(error);}});
    this.root.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.close();}if(e.key==='Tab'){const items=[...this.root.querySelectorAll('button,input,select,summary')].filter(x=>!x.disabled&&x.getClientRects().length),first=items[0],last=items.at(-1);if(e.shiftKey&&e.target===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&e.target===last){e.preventDefault();first.focus();}}});
  }
  open(value,anchor,context={}) {
    this.value=copy(value);this.context=context;this.anchor=anchor;this.returnFocus=document.activeElement;
    this.root.hidden=false;this.refresh();const r=anchor.getBoundingClientRect();
    this.root.style.left=`${Math.max(8,Math.min(r.right-this.root.offsetWidth,innerWidth-this.root.offsetWidth-8))}px`;
    this.root.style.top=`${Math.max(8,Math.min(r.bottom+6,innerHeight-this.root.offsetHeight-8))}px`;
    this.root.querySelector('[data-layout]').focus({preventScroll:true});
  }
  refresh() {
    for(const input of this.root.querySelectorAll('[data-layout]')){const k=input.dataset.layout;if(k==='treatAsChar')input.checked=this.value[k];else input.value=this.value[k];}
    this.root.querySelector('[data-wrap-group]').hidden=this.value.treatAsChar;
    for(const k of ['left','right'])this.root.querySelector(`[data-margin="${k}"]`).hidden=this.value.alignment==='Center';
    for(const b of this.root.querySelectorAll('[data-wrap]'))b.setAttribute('aria-pressed',String(b.dataset.wrap===this.value.textWrap || b.dataset.wrap==='Square'&&this.value.textWrap==='Tight'));
    this.root.querySelector('[data-wrap-hint]').textContent=['Square','Tight'].includes(this.value.textWrap)?'본문이 그림의 좌우로 흐릅니다.':this.value.textWrap==='TopAndBottom'?'본문은 그림의 위아래로만 배치됩니다.':'고급 배치 설정을 사용 중입니다.';
    const supported=!this.value.treatAsChar || this.context.inlineAlignment!==false;this.root.querySelector('[data-layout="alignment"]').disabled=!supported;
    this.root.querySelector('[data-alignment-hint]').textContent=!supported?'중첩 표·머리말의 문단 정렬은 RHWP 개체 속성에서 변경해주세요.':this.value.treatAsChar?'정렬은 그림이 들어 있는 문단에 적용됩니다.':'선택한 정렬을 기준으로 그림을 배치합니다.';
  }
  close(){const wasOpen=!this.root.hidden;this.root.hidden=true;if(wasOpen&&this.returnFocus?.isConnected)this.returnFocus.focus({preventScroll:true});}
}

// 11-06 시안 A1(hwp-picture-controls-1106 v7): 그림을 고르면 아이콘 다섯 칸 한 줄 — 간단한 수정 · 이미지 변환 · 그래프 복원 · 맞춤 · 설정.
const pictureIcon=path=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const FIT_ICONS={width:pictureIcon('<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>'),height:pictureIcon('<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>'),free:pictureIcon('<path d="M4 4h16v16H4z" stroke-dasharray="2 2.5"/><path d="M9 15l6-6M11 9h4v4"/>')};
const FIT_TITLES={width:'맞춤: 좌우 맞춤 (누르면 상하 맞춤)',height:'맞춤: 상하 맞춤 (누르면 자유)',free:'맞춤: 자유 (누르면 좌우 맞춤)'};
const PICTURE_TOOLS=`<span class="exam-picture-tools" role="toolbar" aria-label="그림 도구">`
  +`<button type="button" data-picture-modify data-exam-action="labels" title="간단한 수정 — 5E_image와 같은 편집 화면이 이 위에 창으로 뜹니다 (두 번 누르기와 같음)" aria-label="간단한 수정">${pictureIcon('<path d="M15.5 4.5l4 4L9 19H5v-4z M13.5 6.5l4 4"/>')}</button>`
  +`<button type="button" data-exam-action="picture-ai-image" title="이미지 변환 — AI 이미지 창" aria-label="이미지 변환">${pictureIcon('<path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>')}</button>`
  +`<button type="button" data-exam-action="picture-ai-graph" title="그래프 복원 — AI 그래프 창" aria-label="그래프 복원">${pictureIcon('<path d="M4 4v16h16M7 15c3-1 4-8 6-8s3 5 7 5"/>')}</button>`
  +`<button type="button" data-picture-fit data-fit-mode="width" title="${FIT_TITLES.width}" aria-label="${FIT_TITLES.width}">${FIT_ICONS.width}</button>`
  +`<button type="button" data-picture-settings title="그림 설정" aria-label="설정">${pictureIcon('<path d="M3 6h10M17 6h4M3 18h4M11 18h10"/><circle cx="15" cy="6" r="2.2"/><circle cx="9" cy="18" r="2.2"/>')}</button></span>`;

// Source mode owns the crop frame; document mode only positions the toolbar
// above RHWP's native selection and aspect-preserving resize handles.
export class ExamRegionSurface {
  constructor(host,{source=false,onChange,onSettings,onUndo,onError,onFit}={}) {
    Object.assign(this,{source,onChange,onSettings,onUndo,onError,onFit});
    this.root=document.createElement('section');this.root.id=source?'exam-source-region':'exam-picture-controls';this.root.className='exam-region-surface';this.root.hidden=true;
    this.root.innerHTML=`<div class="exam-region-clip"><div class="exam-region-frame" aria-label="보내는 영역">${(source?['nw','n','ne','w','e','sw','s','se']:[]).map(dir=>`<button type="button" class="exam-region-handle" data-region-handle="${dir}" aria-label="보내는 영역 ${dir} 조정" title="보내는 영역 조정"></button>`).join('')}</div></div><div class="exam-region-heading"><span class="exam-edit-badge" ${source?'':'hidden'}></span><div class="exam-region-actions">${source?'':PICTURE_TOOLS}</div></div>`;
    host.append(this.root);this.frame=this.root.querySelector('.exam-region-frame');this.heading=this.root.querySelector('.exam-region-heading');
    if(source){const icon=settingIcon();if(icon)this.root.querySelector('[data-picture-settings]')?.prepend(icon);}
    else this.heading.classList.add('exam-picture-tools-row');
    this.root.addEventListener('pointerdown',e=>{const h=e.target.closest('[data-region-handle]');if(!h||!this.session?.bounds)return;e.preventDefault();e.stopPropagation();this.closeMenu();this.drag={before:copy(this.session.bounds),geometry:copy(this.geometry),x:e.clientX,y:e.clientY,dir:h.dataset.regionHandle};h.setPointerCapture(e.pointerId);});
    this.root.addEventListener('pointermove',e=>{if(!this.drag)return;try{const d=this.drag;this.preview=resizeRegion(d.before,d.dir,sourceDelta(e.clientX-d.x,e.clientY-d.y,d.geometry,d.before),{maximumWidth:this.session.maximumWidth});this.paint(this.preview);}catch(error){this.onError?.(error);}});
    this.root.addEventListener('pointerup',()=>{if(!this.drag)return;const next=this.preview||this.drag.before,previous=this.drag.before;this.drag=null;this.preview=null;this.paint(this.session.bounds);if(JSON.stringify(next)!==JSON.stringify(previous))void this.commit(next);});
    this.root.addEventListener('pointercancel',()=>{this.drag=null;this.preview=null;if(this.session)this.paint(this.session.bounds);});
    this.root.addEventListener('keydown',e=>{e.stopPropagation();if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();this.onUndo?.(e.shiftKey);return;}const menu=this.root.querySelector('.exam-picture-edit-menu'),trigger=this.root.querySelector('[data-picture-modify]');if(menu && trigger && e.target===trigger && e.key==='ArrowDown'){e.preventDefault();if(menu.hidden)this.toggleMenu();menu.querySelector('button').focus();return;}if(menu && !menu.hidden && ['ArrowDown','ArrowUp','Home','End','Escape'].includes(e.key)){e.preventDefault();if(e.key==='Escape'){this.closeMenu();trigger.focus();return;}const items=[...menu.querySelectorAll('button')],index=items.indexOf(document.activeElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowUp'?-1:1)+items.length)%items.length].focus();return;}const dir=e.target.dataset.regionHandle;if(dir&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const step=e.shiftKey?2:.5;void this.commit(resizeRegion(this.session.bounds,dir,{x:e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,y:e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0},{maximumWidth:this.session.maximumWidth}));}else if(e.key==='Escape'){if(this.drag){this.drag=null;this.preview=null;this.paint(this.session.bounds);}this.closeMenu();}});
    this.root.addEventListener('click',e=>{if(e.target.closest('[data-picture-settings]'))this.onSettings?.(e.target.closest('button'));if(e.target.closest('[data-picture-fit]'))this.onFit?.();});
  }
  async commit(next){try{validRegion(next);await this.onChange?.(copy(next));}catch(error){this.onError?.(error);}finally{if(this.session)this.paint(this.session.bounds);}}
  show(session){this.session=session;this.root.hidden=false;this.root.querySelector('.exam-edit-badge').textContent=session.name?`${session.name} · 편집 중`:'';this.root.querySelectorAll('[data-region-handle]').forEach(h=>h.hidden=!session.bounds);this.position();}
  hide(){this.root.hidden=true;this.session=null;this.drag=null;this.closeMenu();}
  position(){if(!this.session||this.drag)return;this.geometry=this.session.geometry();if(!this.geometry){this.root.hidden=true;return;}this.root.hidden=false;this.paint(this.session.bounds);}
  paint(bounds){
    const g=this.geometry;if(!g)return;
    const b=this.session.bounds;
    const p=b&&bounds?regionGeometry(b,bounds,{sourceFrame:true,width:g.w,height:g.h,horzOffset:g.x,vertOffset:g.y,rotationAngle:g.rotation,horzFlip:g.flipH,vertFlip:g.flipV,treatAsChar:false}):{sourceFrame:true,width:g.w,height:g.h,horzOffset:g.x,vertOffset:g.y};
    const v=this.session.viewport?.()||{x:0,y:0,w:innerWidth,h:innerHeight};
    Object.assign(this.root.querySelector('.exam-region-clip').style,{left:`${v.x}px`,top:`${v.y}px`,width:`${v.w}px`,height:`${v.h}px`});
    Object.assign(this.frame.style,{left:`${p.horzOffset-v.x}px`,top:`${p.vertOffset-v.y}px`,width:`${p.width}px`,height:`${p.height}px`,transform:`rotate(${g.rotation||0}deg) scale(${g.flipH?-1:1},${g.flipV?-1:1})`});
    const a=(g.rotation||0)*Math.PI/180,w=Math.abs(Math.cos(a))*p.width+Math.abs(Math.sin(a))*p.height,h=Math.abs(Math.sin(a))*p.width+Math.abs(Math.cos(a))*p.height;
    const x=p.horzOffset+(p.width-w)/2,y=p.vertOffset+(p.height-h)/2;
    this.heading.hidden=false;let top;
    if(!this.source){
      // 11-06 시안 A1·A1′: 단추 줄의 오른쪽 끝 = 그림 오른쪽 끝, 그림 윗변 4px 위. 좁은 그림(가운데 회전점과 부딪침)이거나
      // 위에 자리가 없으면 그림 아랫변 4px 아래(오른쪽 끝 맞춤). 그림 밖으로 튀어나오지 않는다.
      const bw=this.heading.offsetWidth,bh=this.heading.offsetHeight,right=x+w,above=y-4-bh;
      const narrow=right-bw<x+w/2+10,below=narrow||above<v.y+2;
      top=below?y+h+4:above;this.heading.dataset.place=below?'below':'above';
      Object.assign(this.heading.style,{left:`${Math.max(v.x+4,Math.min(right-bw,v.x+v.w-bw-4))}px`,top:`${top}px`,width:''});
    }else{
      const width=Math.min(Math.max(w,300),v.w-16);top=Math.max(8,(g.headingBottom??y)-this.heading.offsetHeight-8);
      Object.assign(this.heading.style,{left:`${Math.max(v.x+8,Math.min(x,v.x+v.w-width-8))}px`,top:`${top}px`,width:`${width}px`});
    }
    this.frame.dataset.passive=String(!this.session.bounds);
    const offscreen=x+w<v.x||x>v.x+v.w||y+h<v.y||y>v.y+v.h;
    this.frame.hidden=!this.source||offscreen;
    this.heading.hidden=offscreen||(this.source&&top+this.heading.offsetHeight>y);
    this.positionMenu();
  }
  // 맞춤 단추: 지금 모드(좌우·상하·자유)를 아이콘과 이름으로 보여 준다.
  setFitMode(mode){const b=this.root.querySelector('[data-picture-fit]');if(!b)return;b.dataset.fitMode=mode;b.innerHTML=FIT_ICONS[mode]||FIT_ICONS.width;const label=FIT_TITLES[mode]||FIT_TITLES.width;b.title=label;b.setAttribute('aria-label',label);}
  toggleMenu(){const menu=this.root.querySelector('.exam-picture-edit-menu');menu.hidden=!menu.hidden;this.root.querySelector('[data-picture-modify]').setAttribute('aria-expanded',String(!menu.hidden));this.positionMenu();}
  closeMenu(){const menu=this.root.querySelector('.exam-picture-edit-menu');if(menu){menu.hidden=true;this.root.querySelector('[data-picture-modify]').setAttribute('aria-expanded','false');}}
  positionMenu(){const menu=this.root.querySelector('.exam-picture-edit-menu');if(!menu||menu.hidden)return;const r=this.root.querySelector('[data-picture-modify]').getBoundingClientRect();menu.style.left=`${Math.max(8,Math.min(r.right-menu.offsetWidth,innerWidth-menu.offsetWidth-8))}px`;menu.style.top=`${Math.max(8,Math.min(r.bottom+6,innerHeight-menu.offsetHeight-8))}px`;}
}
