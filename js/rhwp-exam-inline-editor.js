import { renderLabeler } from './render/annotations.js?v=1.7.0-four-session-integration';
import { DEFAULT_TEXT_FONT, DEFAULT_TEXT_SIZE_MM, TEXT_FONTS } from './state.js?v=1.7.0-four-session-integration';
import { syncDraftRunsToText, setDraftWholeTextStyle } from './text-run-editing.js?v=1.7.0-four-session-integration';
import { hasLabelTypography, reconcileLabelTypography } from './ai-label-typography.js?v=1.7.0-four-session-integration';

const NS = 'http://www.w3.org/2000/svg';
const copy = value => structuredClone(value);
const el = (tag, attrs = {}) => {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};

// This is a projection of the original labeler objects. No document controls or
// pixels are mutated until Apply; pointer coordinates use the SVG's inverse CTM.
export class ExamInlineEditor {
  constructor(host, options) {
    this.options = options;
    this.root = document.createElement('section');
    this.root.id = 'exam-inline-editor'; this.root.hidden = true;
    this.root.setAttribute('aria-label', '그림의 라벨과 지시선 편집');
    this.root.innerHTML = `<div class="exam-inline-clip"><div class="exam-inline-picture"><svg class="exam-inline-canvas" aria-label="라벨 편집 영역" tabindex="0"></svg></div></div>
      <div class="exam-inline-image-heading"><span class="exam-edit-badge">라벨·지시선 편집 중</span><div><button type="button" data-inline-action="apply" class="exam-primary">수정 반영</button><button type="button" data-inline-action="close">돌아가기</button></div></div>
      <div class="exam-inline-toolbar" role="toolbar" aria-label="라벨 편집 도구">
        <div class="exam-inline-heading"><strong>라벨 편집</strong><span data-inline-hint>라벨이나 지시선의 점을 드래그하세요.</span></div>
        <p class="exam-inline-recovery" hidden>보관한 초안을 표시합니다. 적용하면 원본의 현재 라벨을 이 내용으로 바꿉니다.</p>
        <div class="exam-inline-tools">
          <button type="button" data-inline-action="add-label">라벨 추가</button><button type="button" data-inline-action="add-leader">지시선 추가</button>
          <button type="button" data-inline-action="elbow">꺾임점</button><button type="button" data-inline-action="delete">삭제</button>
          <button type="button" data-inline-action="undo" aria-label="라벨 편집 되돌리기">되돌리기</button><button type="button" data-inline-action="redo">다시 실행</button>
          <button type="button" data-inline-action="crop">영역 조정</button><button type="button" data-inline-action="original">원본 편집</button>
        </div>
        <div class="exam-inline-properties">
          <label class="exam-inline-text">내용<textarea data-inline-field="text" rows="1" maxlength="10000" aria-label="라벨 내용"></textarea></label>
          <label>글꼴<select data-inline-field="font" aria-label="라벨 글꼴"></select></label>
          <label>글자<input data-inline-field="size" type="number" min="2" max="200" step="0.5" aria-label="라벨 글자 크기">pt</label>
          <label>선<input data-inline-field="stroke" type="number" min="0.05" max="5" step="0.05" aria-label="지시선 굵기">mm</label>

        </div>
      </div>`;
    host.append(this.root);
    this.svg = this.root.querySelector('svg');this.heading=this.root.querySelector('.exam-inline-image-heading');
    this.picture = this.root.querySelector('.exam-inline-picture');
    this.toolbar = this.root.querySelector('.exam-inline-toolbar');
    const font = this.field('font');
    for (const item of TEXT_FONTS) font.add(new Option(item.label, item.css));
    // Reuse the palette's approved icon artwork rather than introducing a set.
    for (const [action, selector] of [['add-label','[data-tool="text"] svg'],['add-leader','[data-symbol="labeler"] svg']]) {
      const icon = document.querySelector(selector);
      if (icon) this.button(action).prepend(icon.cloneNode(true));
    }
    this.root.addEventListener('click', event => {
      const action = event.target.closest('[data-inline-action]')?.dataset.inlineAction;
      if (action) void this.action(action);
    });
    for (const field of this.root.querySelectorAll('[data-inline-field]')) field.addEventListener('change', () => this.changeField(field));
    this.svg.addEventListener('pointerdown', event => this.pointerDown(event));
    this.svg.addEventListener('pointermove', event => this.pointerMove(event));
    this.svg.addEventListener('pointerup', event => this.pointerUp(event));
    this.svg.addEventListener('pointercancel', event => this.pointerUp(event));
    this.svg.addEventListener('dblclick', event => {
      event.preventDefault(); event.stopPropagation();
      const id = event.target.closest('[data-annotation-id]')?.dataset.annotationId;
      if (id) {this.selected = id; this.render(); this.field('text').focus();this.field('text').select();}
    });
    this.root.addEventListener('keydown', event => {
      if (event.target.matches('input,textarea,select')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {event.preventDefault();void this.action(event.shiftKey ? 'redo' : 'undo');}
      else if (event.key === 'Delete' || event.key === 'Backspace') {event.preventDefault();void this.action('delete');}
      else if (event.key === 'Escape') {event.preventDefault();if (this.mode) {this.mode = null;this.anchor = null;this.render();} else void this.action('close');}
    });
  }
  field(name) { return this.root.querySelector(`[data-inline-field="${name}"]`); }
  button(name) { return this.root.querySelector(`[data-inline-action="${name}"]`); }
  get active() { return !this.root.hidden; }
  open(session) {
    this.close();this.session = session;this.labels = copy(session.labels);this.bounds = copy(session.bounds);
    this.busy=false;this.root.querySelectorAll('button,input,textarea,select').forEach(control=>control.disabled=false);
    this.selected = this.labels[0]?.id;this.undo = [];this.redo = [];this.mode = null;this.lastPress=null;this.root.hidden = false;
    this.root.querySelector('.exam-inline-recovery').hidden=!session.recovery;
    this.position();this.render();
    this.stopPosition=session.bridge.watchView(()=>this.position());
    this.resizeObserver=new ResizeObserver(()=>this.position());this.resizeObserver.observe(this.toolbar);
    this.svg.focus({preventScroll:true});
  }
  close() {
    this.stopPosition?.();this.stopPosition=null;this.resizeObserver?.disconnect();
    this.root.hidden = true;this.session = null;this.drag = null;
  }
  setBase(url) {if (!this.session) return;this.session.baseUrl = url;this.render();}
  setLabels(labels) {this.labels=copy(labels);this.undo=[];this.redo=[];this.render();}
  setBounds(bounds, url) {this.bounds = copy(bounds);this.session.bounds = copy(bounds);this.session.baseUrl = url;this.render();this.position();}
  position() {
    if (!this.session) return;
    const {bridge, ref} = this.session, geometry = bridge.figureGeometry?.(ref) || bridge.figureRect(ref);
    if (!geometry) {this.picture.hidden = true;return;}
    this.picture.hidden = false;
    const fallback=bridge.editor.element.getBoundingClientRect(),viewport=bridge.figureViewport?.(),clip=bridge.figureViewport?.(ref) || viewport || {x:fallback.x,y:fallback.y,w:fallback.width,h:fallback.height};
    const frame=viewport ? {x:viewport.x,y:viewport.y,width:viewport.w,height:viewport.h,right:viewport.x+viewport.w,bottom:viewport.y+viewport.h} : fallback;
    Object.assign(this.root.querySelector('.exam-inline-clip').style,{left:`${clip.x}px`,top:`${clip.y}px`,width:`${clip.w}px`,height:`${clip.h}px`});
    Object.assign(this.picture.style,{left:`${geometry.x-clip.x}px`,top:`${geometry.y-clip.y}px`,width:`${geometry.w}px`,height:`${geometry.h}px`,transform:`rotate(${geometry.rotation || 0}deg) scale(${geometry.flipH ? -1 : 1},${geometry.flipV ? -1 : 1})`});
    for(const handle of this.svg.querySelectorAll('[data-inline-handle]'))handle.setAttribute('r',Math.max(.25,this.bounds.w/Math.max(1,geometry.w)*4));
    const width = Math.min(640,Math.max(130,frame.width-24));
    this.toolbar.style.width = `${width}px`;
    const height = this.toolbar.offsetHeight;
    const headingWidth=Math.min(frame.width-24,Math.max(320,geometry.w));
    Object.assign(this.heading.style,{left:`${Math.max(frame.x+12,Math.min(geometry.x,frame.right-headingWidth-12))}px`,top:`${Math.max(8,geometry.y-40)}px`,width:`${headingWidth}px`});
    // Leave the paragraph directly below the figure visible for comparing type.
    Object.assign(this.toolbar.style,{left:`${Math.max(frame.x+12,Math.min(geometry.x,frame.right-width-12))}px`,top:`${Math.max(frame.y+12,frame.bottom-height-12)}px`});
  }
  point(event) {
    const point = new DOMPoint(event.clientX,event.clientY).matrixTransform(this.svg.getScreenCTM().inverse());
    return {x:point.x,y:point.y};
  }
  snapshot() {return copy(this.labels);}
  flush() {
    const field=document.activeElement,label=this.selectedLabel();
    if(!this.active || !label || !field?.matches('[data-inline-field="text"]'))return;
    const current=label.contentMode==='formula' ? label.source || label.rawSource || '' : label.text || '';
    if(field.value!==current)this.changeField(field);
  }
  remember(before = this.labels) {this.undo.push(copy(before));if(this.undo.length>100)this.undo.shift();this.redo=[];}
  publish() {
    this.options.onChange?.(this.snapshot(),copy(this.bounds));
  }
  selectedLabel() {return this.labels?.find(label => label.id === this.selected);}
  render() {
    const b = this.bounds;this.svg.setAttribute('viewBox',`${b.x} ${b.y} ${b.w} ${b.h}`);this.svg.setAttribute('preserveAspectRatio','none');
    const image = el('image',{href:this.session.baseUrl,x:b.x,y:b.y,width:b.w,height:b.h,preserveAspectRatio:'none'});
    this.svg.replaceChildren(image);
    const visible = this.session.layers?.filter(layer => layer.visible === false).map(layer => layer.id) || [];
    for (const label of this.labels) {
      if (visible.includes(label.layerId)) continue;
      const group = renderLabeler(label);group.dataset.annotationId=label.id;
      // A generous invisible stroke makes thin leader lines easy to select.
      for (const line of [...group.querySelectorAll('line,[data-label-leader-route]')]) {
        const hit=line.cloneNode();hit.removeAttribute('data-label-leader-route');hit.setAttribute('stroke','transparent');
        hit.setAttribute('stroke-width',Math.max(.8,b.w/this.picture.clientWidth*10));group.prepend(hit);
      }
      this.svg.append(group);
    }
    const label=this.selectedLabel();
    if (label) {
      const radius = Math.max(.25,b.w/Math.max(1,this.picture.clientWidth)*4);
      const handles = label.leaderRoutes?.length
        ? [['p1',label.leaderRoutes[0].target],['p2',label.p2],...label.leaderRoutes.flatMap((route,index)=>[
          ...(route.attachment==='frame' ? [[`route-${index}-start-0`,route.start]] : []),
          ...(index ? [[`route-${index}-target-0`,route.target]] : []),
          ...route.controls.map((point,control)=>[`route-${index}-control-${control}`,point]),
        ])]
        : [['p1',label.p1],['p2',label.p2],['elbow',label.elbow],['p3',label.p3],...(label.extraAnchors || []).map((p,i)=>[`extra-${i}`,p])];
      for (const [name,point] of handles) {
        if (!point || (name==='p1' && !label.leaderRoutes?.length && point.x===label.p2.x && point.y===label.p2.y)) continue;
        // The caption and its drag handle share the same source-space anchor.
        // pointerDown also supports double-click editing through this handle.
        const handle=el('circle',{cx:point.x,cy:point.y,r:radius,fill:'#fff',stroke:'#2878f0','stroke-width':1.5,'vector-effect':'non-scaling-stroke'});
        handle.dataset.inlineHandle=name;handle.dataset.annotationId=label.id;this.svg.append(handle);
      }
    }
    for (const name of ['text','font','size','stroke']) this.field(name).disabled=!label;
    if (label) {
      this.field('text').value=label.contentMode==='formula' ? label.source || label.rawSource || '' : label.text || '';
      const family=label.fontFamily || DEFAULT_TEXT_FONT;
      if (![...this.field('font').options].some(option=>option.value===family)) this.field('font').add(new Option('현재 글꼴',family));
      this.field('font').value=family;this.field('size').value=Number(((label.labelSize || DEFAULT_TEXT_SIZE_MM)*72/25.4).toFixed(1));this.field('stroke').value=label.strokeWidth || .2;
    } else this.field('text').value='';
    this.button('delete').disabled=!label;this.button('elbow').disabled=!label || !!label.leaderRoutes?.length;
    this.button('elbow').title=label?.leaderRoutes?.length ? '경로의 제어점을 직접 드래그하세요.' : '꺾임점 추가 또는 제거';
    this.button('undo').disabled=!this.undo.length;this.button('redo').disabled=!this.redo.length;
    this.root.querySelector('[data-inline-hint]').textContent=this.mode==='label' ? '그림에서 라벨을 놓을 위치를 클릭하세요.' : this.mode==='leader' ? (this.anchor ? '라벨을 놓을 위치를 클릭하세요.' : '지시선이 가리킬 위치를 클릭하세요.') : '라벨이나 지시선의 점을 드래그하세요.';
    this.svg.dataset.placing=String(!!this.mode);
  }
  changeField(field) {
    const label=this.selectedLabel();if(!label)return;
    this.remember();
    const name=field.dataset.inlineField;
    if(name==='text') {
      if(hasLabelTypography(label)) {
        Object.assign(label,reconcileLabelTypography(label,field.value));
        if(label.labelScriptStyles===undefined)delete label.labelScriptStyles;
        label.labelStyleText=field.value;
      }
      if(label.contentMode==='formula') {label.source=field.value;label.rawSource=field.value;}
      else {
        if(label.textRuns?.length){const draft={...label,fontSize:label.labelSize || DEFAULT_TEXT_SIZE_MM};syncDraftRunsToText(draft,field.value);label.textRuns=draft.textRuns;}
        label.text=field.value;
      }
    } else if(name==='font' || name==='size') {
      const size=name==='size' ? Math.max(2,Math.min(200,Number(field.value)||10))*25.4/72 : label.labelSize || DEFAULT_TEXT_SIZE_MM;
      const family=name==='font' ? field.value : label.fontFamily || DEFAULT_TEXT_FONT;
      if(label.textRuns?.length) {
        const draft={...label,fontSize:label.labelSize || DEFAULT_TEXT_SIZE_MM};
        setDraftWholeTextStyle(draft,{fontFamily:family,fontSize:size,fontWeight:label.fontWeight || 'normal',italic:label.italic===true,letterSpacing:label.letterSpacing});
        label.textRuns=draft.textRuns;
      }
      label.fontFamily=family;label.labelSize=size;
      if(name==='font' && hasLabelTypography(label))label.labelFontOverride=true;
    }
    else if(name==='stroke')label.strokeWidth=Math.max(.05,Math.min(5,Number(field.value)||.2));
    this.render();this.publish();
  }
  pointerDown(event) {
    if(event.button!==0 || this.busy)return;event.preventDefault();this.svg.focus({preventScroll:true});
    const point=this.point(event);
    if(this.mode) {
      if(this.mode==='leader' && !this.anchor) {this.anchor=point;this.render();return;}
      this.remember();
      const label={id:`label_${crypto.randomUUID()}`,type:'labeler',p1:copy(this.anchor || point),p2:point,text:'라벨',labelType:'label',fontFamily:DEFAULT_TEXT_FONT,labelSize:DEFAULT_TEXT_SIZE_MM,strokeWidth:.2,strokeLevel:0,layerId:this.session.layerId || 1,order:Math.max(0,...this.labels.map(l=>l.order || 0))+1,locked:false,positionLocked:false};
      this.labels.push(label);this.selected=label.id;this.mode=null;this.anchor=null;this.render();this.publish();this.field('text').focus();this.field('text').select();return;
    }
    const target=event.target.closest('[data-annotation-id]');
    if(!target) {this.selected=null;this.render();return;}
    this.selected=target.dataset.annotationId;
    const now=performance.now(),previous=this.lastPress;
    // SVG projections can be replaced between presses. Recognize the object
    // identity instead of requiring the browser to retain the same DOM node.
    if(previous?.id===this.selected && now-previous.time<450 && Math.hypot(event.clientX-previous.x,event.clientY-previous.y)<5) {
      this.lastPress=null;this.drag=null;this.render();this.field('text').focus();this.field('text').select();return;
    }
    this.lastPress={id:this.selected,time:now,x:event.clientX,y:event.clientY};
    this.drag={pointerId:event.pointerId,start:point,before:this.snapshot(),handle:target.dataset.inlineHandle || 'p2'};
    this.svg.setPointerCapture(event.pointerId);this.render();
  }
  pointerMove(event) {
    if(this.busy || !this.drag || event.pointerId!==this.drag.pointerId)return;
    const point=this.point(event),label=this.selectedLabel(),before=this.drag.before.find(l=>l.id===label.id),name=this.drag.handle;
    const dx=point.x-this.drag.start.x,dy=point.y-this.drag.start.y;
    if(Math.hypot(dx,dy)>this.bounds.w/Math.max(1,this.picture.clientWidth)*3)this.lastPress=null;
    if (before.leaderRoutes?.length) {
      label.leaderRoutes=copy(before.leaderRoutes);
      const routeHandle=/^route-(\d+)-(start|target|control)-(\d+)$/.exec(name);
      if (routeHandle) {
        const route=label.leaderRoutes[Number(routeHandle[1])];
        const point=routeHandle[2]==='control' ? route?.controls[Number(routeHandle[3])] : route?.[routeHandle[2]];
        if (!point) return;
        point.x+=dx;point.y+=dy;
      } else if (name==='p1') {
        label.leaderRoutes[0].target={x:before.leaderRoutes[0].target.x+dx,y:before.leaderRoutes[0].target.y+dy};
      } else if (name==='p2') {
        label.p2={x:before.p2.x+dx,y:before.p2.y+dy};
        for (const route of label.leaderRoutes) if (route.attachment==='label') {route.start.x+=dx;route.start.y+=dy;}
      }
      label.p1=copy(label.leaderRoutes[0].target);
      this.render();return;
    }
    const key=name.startsWith('extra-') ? null : name;
    const p=key ? before[key] : before.extraAnchors[Number(name.slice(6))];
    if (!p) return;
    const moved={x:p.x+dx,y:p.y+dy};
    if (key) label[key]=moved;else label.extraAnchors[Number(name.slice(6))]=moved;
    if(name==='p2' && before.p1.x===before.p2.x && before.p1.y===before.p2.y)label.p1=copy(moved);
    this.render();
  }
  pointerUp(event) {
    if(!this.drag || event.pointerId!==this.drag.pointerId)return;
    if(JSON.stringify(this.drag.before)!==JSON.stringify(this.labels)) {this.remember(this.drag.before);this.publish();}
    this.drag=null;this.render();
  }
  async action(name) {
    if (!this.active || this.busy) return;
    if(name==='add-label' || name==='add-leader') {this.mode=name==='add-label' ? 'label' : 'leader';this.anchor=null;this.render();this.svg.focus();return;}
    if(name==='delete') {if(!this.selected)return;this.remember();this.labels=this.labels.filter(l=>l.id!==this.selected);this.selected=null;this.render();this.publish();return;}
    if(name==='elbow') {const l=this.selectedLabel();if(!l)return;this.remember();if(l.elbow)delete l.elbow;else l.elbow={x:l.p1.x,y:l.p2.y};this.render();this.publish();return;}
    if(name==='undo' || name==='redo') {const from=name==='undo'?this.undo:this.redo,to=name==='undo'?this.redo:this.undo;if(!from.length)return;to.push(this.snapshot());this.labels=from.pop();this.render();this.publish();return;}
    this.flush();this.busy=true;
    this.root.querySelectorAll('button,input,textarea,select').forEach(control=>control.disabled=true);
    try {await this.options.onAction(name);} catch(error) {this.options.onError?.(error);}
    finally {this.busy=false;if(this.active){this.root.querySelectorAll('button,input,textarea,select').forEach(control=>control.disabled=false);this.render();}}
  }
}

export function chooseInlineCrop({sourceUrl,fullBounds,initialBounds}) {
  return new Promise(resolve => {
    const dialog=document.createElement('dialog');dialog.id='exam-inline-crop-dialog';
    dialog.innerHTML='<strong>보낼 영역 조정</strong><p>기존 테두리를 이동하거나 모서리를 드래그하세요. 바깥에서 드래그하면 새 영역을 지정합니다.</p><svg aria-label="보낼 영역" tabindex="0"></svg><div><button type="button" data-crop-cancel>취소</button><button type="button" data-crop-confirm class="exam-primary">확인</button></div>';
    const svg=dialog.querySelector('svg');svg.setAttribute('viewBox',`${fullBounds.x} ${fullBounds.y} ${fullBounds.w} ${fullBounds.h}`);
    svg.append(el('image',{href:sourceUrl,x:fullBounds.x,y:fullBounds.y,width:fullBounds.w,height:fullBounds.h}));
    const group=el('g');svg.append(group);let bounds=copy(initialBounds),drag;
    const point=event=>{const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());return{x:Math.max(fullBounds.x,Math.min(fullBounds.x+fullBounds.w,p.x)),y:Math.max(fullBounds.y,Math.min(fullBounds.y+fullBounds.h,p.y))};};
    const draw=()=>{
      const b=bounds;group.replaceChildren(el('rect',{x:b.x,y:b.y,width:b.w,height:b.h,fill:'#2878f00a',stroke:'#2878f0','stroke-width':2,'vector-effect':'non-scaling-stroke','data-crop-handle':'move'}));
      for(const [name,x,y]of[['nw',b.x,b.y],['ne',b.x+b.w,b.y],['sw',b.x,b.y+b.h],['se',b.x+b.w,b.y+b.h]])group.append(el('circle',{cx:x,cy:y,r:fullBounds.w/120,fill:'white',stroke:'#2878f0','stroke-width':1.5,'vector-effect':'non-scaling-stroke','data-crop-handle':name}));
      dialog.querySelector('[data-crop-confirm]').disabled=b.w<.1||b.h<.1;
    };
    svg.addEventListener('pointerdown',event=>{event.preventDefault();drag={start:point(event),before:copy(bounds),kind:event.target.dataset.cropHandle || 'new'};svg.setPointerCapture(event.pointerId);});
    svg.addEventListener('pointermove',event=>{
      if(!drag)return;const p=point(event),a=drag.start,b=drag.before;
      if(drag.kind==='move')bounds={...b,x:Math.max(fullBounds.x,Math.min(fullBounds.x+fullBounds.w-b.w,b.x+p.x-a.x)),y:Math.max(fullBounds.y,Math.min(fullBounds.y+fullBounds.h-b.h,b.y+p.y-a.y))};
      else {const anchor=drag.kind==='new'?a:{x:drag.kind.endsWith('w')?b.x+b.w:b.x,y:drag.kind.startsWith('n')?b.y+b.h:b.y};bounds={x:Math.min(anchor.x,p.x),y:Math.min(anchor.y,p.y),w:Math.abs(anchor.x-p.x),h:Math.abs(anchor.y-p.y)};}
      draw();
    });
    svg.addEventListener('pointerup',()=>{drag=null;});svg.addEventListener('pointercancel',()=>{drag=null;});
    const finish=value=>{dialog.close();dialog.remove();resolve(value);};
    dialog.querySelector('[data-crop-cancel]').onclick=()=>finish(null);dialog.querySelector('[data-crop-confirm]').onclick=()=>finish(copy(bounds));
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
    document.body.append(dialog);draw();dialog.showModal();
  });
}
