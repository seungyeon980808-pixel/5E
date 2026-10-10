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

// Source mode owns the crop frame; document mode only positions the toolbar
// above RHWP's native selection and aspect-preserving resize handles.
export class ExamRegionSurface {
  constructor(host,{source=false,onChange,onSettings,onUndo,onError}={}) {
    Object.assign(this,{source,onChange,onSettings,onUndo,onError});
    this.root=document.createElement('section');this.root.id=source?'exam-source-region':'exam-picture-controls';this.root.className='exam-region-surface';this.root.hidden=true;
    this.root.innerHTML=`<div class="exam-region-clip"><div class="exam-region-frame" aria-label="보내는 영역">${(source?['nw','n','ne','w','e','sw','s','se']:[]).map(dir=>`<button type="button" class="exam-region-handle" data-region-handle="${dir}" aria-label="보내는 영역 ${dir} 조정" title="보내는 영역 조정"></button>`).join('')}</div></div><div class="exam-region-heading"><span class="exam-edit-badge" ${source?'':'hidden'}></span><div class="exam-region-actions">${source?'':'<button type="button" data-picture-modify aria-haspopup="menu" aria-expanded="false">수정</button><button type="button" data-picture-settings>설정</button>'}</div></div>${source?'':'<div class="exam-picture-edit-menu" role="menu" hidden><button type="button" role="menuitem" data-exam-action="labels">현재 페이지에서 수정<small>라벨·지시선 편집</small></button><button type="button" role="menuitem" data-exam-action="edit">편집기에서 수정<small>이미지·객체·보내는 영역 편집</small></button></div>'}`;
    host.append(this.root);this.frame=this.root.querySelector('.exam-region-frame');this.heading=this.root.querySelector('.exam-region-heading');
    const icon=settingIcon();if(icon)this.root.querySelector('[data-picture-settings]')?.prepend(icon);
    this.root.addEventListener('pointerdown',e=>{const h=e.target.closest('[data-region-handle]');if(!h||!this.session?.bounds)return;e.preventDefault();e.stopPropagation();this.closeMenu();this.drag={before:copy(this.session.bounds),geometry:copy(this.geometry),x:e.clientX,y:e.clientY,dir:h.dataset.regionHandle};h.setPointerCapture(e.pointerId);});
    this.root.addEventListener('pointermove',e=>{if(!this.drag)return;try{const d=this.drag;this.preview=resizeRegion(d.before,d.dir,sourceDelta(e.clientX-d.x,e.clientY-d.y,d.geometry,d.before),{maximumWidth:this.session.maximumWidth});this.paint(this.preview);}catch(error){this.onError?.(error);}});
    this.root.addEventListener('pointerup',()=>{if(!this.drag)return;const next=this.preview||this.drag.before,previous=this.drag.before;this.drag=null;this.preview=null;this.paint(this.session.bounds);if(JSON.stringify(next)!==JSON.stringify(previous))void this.commit(next);});
    this.root.addEventListener('pointercancel',()=>{this.drag=null;this.preview=null;if(this.session)this.paint(this.session.bounds);});
    this.root.addEventListener('keydown',e=>{e.stopPropagation();if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();this.onUndo?.(e.shiftKey);return;}const menu=this.root.querySelector('.exam-picture-edit-menu'),trigger=this.root.querySelector('[data-picture-modify]');if(trigger && e.target===trigger && e.key==='ArrowDown'){e.preventDefault();if(menu.hidden)this.toggleMenu();menu.querySelector('button').focus();return;}if(menu && !menu.hidden && ['ArrowDown','ArrowUp','Home','End','Escape'].includes(e.key)){e.preventDefault();if(e.key==='Escape'){this.closeMenu();trigger.focus();return;}const items=[...menu.querySelectorAll('button')],index=items.indexOf(document.activeElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowUp'?-1:1)+items.length)%items.length].focus();return;}const dir=e.target.dataset.regionHandle;if(dir&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const step=e.shiftKey?2:.5;void this.commit(resizeRegion(this.session.bounds,dir,{x:e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,y:e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0},{maximumWidth:this.session.maximumWidth}));}else if(e.key==='Escape'){if(this.drag){this.drag=null;this.preview=null;this.paint(this.session.bounds);}this.closeMenu();}});
    this.root.addEventListener('click',e=>{if(e.target.closest('[data-picture-modify]'))this.toggleMenu();if(e.target.closest('[data-picture-settings]'))this.onSettings?.(e.target.closest('button'));});
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
    const width=Math.min(Math.max(w,300),v.w-16);
    this.heading.hidden=false;const top=Math.max(8,y-this.heading.offsetHeight-8);
    Object.assign(this.heading.style,{left:`${Math.max(v.x+8,Math.min(x,v.x+v.w-width-8))}px`,top:`${top}px`,width:`${width}px`});
    this.frame.dataset.passive=String(!this.session.bounds);
    const offscreen=x+w<v.x||x>v.x+v.w||y+h<v.y||y>v.y+v.h;
    this.frame.hidden=!this.source||offscreen;
    this.heading.hidden=offscreen||top+this.heading.offsetHeight>y;
    this.positionMenu();
  }
  toggleMenu(){const menu=this.root.querySelector('.exam-picture-edit-menu');menu.hidden=!menu.hidden;this.root.querySelector('[data-picture-modify]').setAttribute('aria-expanded',String(!menu.hidden));this.positionMenu();}
  closeMenu(){const menu=this.root.querySelector('.exam-picture-edit-menu');if(menu){menu.hidden=true;this.root.querySelector('[data-picture-modify]').setAttribute('aria-expanded','false');}}
  positionMenu(){const menu=this.root.querySelector('.exam-picture-edit-menu');if(!menu||menu.hidden)return;const r=this.root.querySelector('[data-picture-modify]').getBoundingClientRect();menu.style.left=`${Math.max(8,Math.min(r.right-menu.offsetWidth,innerWidth-menu.offsetWidth-8))}px`;menu.style.top=`${Math.max(8,Math.min(r.bottom+6,innerHeight-menu.offsetHeight-8))}px`;}
}
