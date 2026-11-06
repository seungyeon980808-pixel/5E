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
    this.root.setAttribute('aria-label', '그림 편집');
    // 11-06 결정 11-05e: 한글에서 그림을 두 번 누르면 그 자리에서 고친다(수식처럼). 도구는 다섯 개만 —
    // AI 변환 · 복원(그래프 객체로) · 텍스트 · 라벨러 · 자르기. 정밀 작업은 작은 「5E_image에서 자세히」로만 넘어간다.
    const icon = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
    this.root.innerHTML = `<div class="exam-inline-clip"><div class="exam-inline-picture"><svg class="exam-inline-canvas" aria-label="그림 편집 영역" tabindex="0"></svg></div></div>
      <div class="exam-inline-image-heading"><span class="exam-edit-badge">그림 편집 중</span><div><button type="button" data-inline-action="apply" class="exam-primary" title="같은 자리·같은 크기로 반영 (되돌리기 ⌘Z)">적용</button><button type="button" data-inline-action="close" title="닫기 (Esc)">닫기</button></div></div>
      <div class="exam-inline-toolbar" role="toolbar" aria-label="그림 편집 도구">
        <p class="exam-inline-recovery" hidden>보관한 초안을 표시합니다. 적용하면 원본의 현재 라벨을 이 내용으로 바꿉니다.</p>
        <div class="exam-inline-tools exam-inline-five">
          <button type="button" class="exam-inline-tool" data-inline-action="ai" title="AI로 이 그림을 다시 그립니다 — 5E_image AI 작업대(이미지 변환)가 이 그림을 참고 그림으로 열립니다">${icon('<path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>')}<span>AI 변환</span></button>
          <button type="button" class="exam-inline-tool" data-inline-action="restore" title="그림 속 그래프를 고칠 수 있는 그래프 객체로 되살립니다 — 그래프 창에서 원본을 깔고 맞춥니다">${icon('<path d="M4 4v16h16M7 15c3-1 4-8 6-8s3 5 7 5"/>')}<span data-inline-restore-label>복원</span></button>
          <button type="button" class="exam-inline-tool" data-inline-action="add-label" title="글자 라벨 넣기 — 그림을 눌러 자리를 고릅니다">${icon('<path d="M5 6h14M12 6v13M9 19h6"/>')}<span>텍스트</span></button>
          <button type="button" class="exam-inline-tool" data-inline-action="add-leader" title="지시선 라벨 넣기 — 가리킬 곳과 글자 자리를 차례로 누릅니다">${icon('<circle cx="7" cy="17" r="2"/><path d="M8.5 15.5 15 9h5"/>')}<span>라벨러</span></button>
          <button type="button" class="exam-inline-tool" data-inline-action="crop" title="보이는 영역 다시 고르기">${icon('<path d="M6 3v13a2 2 0 0 0 2 2h13M3 6h13a2 2 0 0 1 2 2v13"/>')}<span>자르기</span></button>
        </div>
        <div class="exam-inline-sub">
          <span class="exam-inline-hint" data-inline-hint>도구를 고르세요 · 글자를 두 번 누르면 바로 고칩니다</span>
          <button type="button" data-inline-action="revert" hidden title="복원 전의 그림으로 되돌립니다">그림으로 되돌리기</button>
          <button type="button" class="exam-inline-icon" data-inline-action="elbow" title="지시선 꺾임점" aria-label="꺾임점">${icon('<path d="M5 19V9h10V5"/>')}</button>
          <button type="button" class="exam-inline-icon" data-inline-action="delete" title="고른 라벨 지우기 (Delete)" aria-label="삭제">${icon('<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>')}</button>
          <button type="button" class="exam-inline-icon" data-inline-action="undo" title="되돌리기 (⌘Z)" aria-label="라벨 편집 되돌리기">${icon('<path d="M9 7 5 11l4 4M5 11h9a5 5 0 0 1 0 10h-2"/>')}</button>
          <button type="button" class="exam-inline-icon" data-inline-action="redo" title="다시 실행 (⇧⌘Z)" aria-label="다시 실행">${icon('<path d="m15 7 4 4-4 4M19 11h-9a5 5 0 0 0 0 10h2"/>')}</button>
          <button type="button" class="exam-inline-more" data-inline-action="original" title="손이 많이 가는 정밀 작업은 5E_image에서 — 고친 뒤 「시험지에 반영」하면 이 자리로 돌아옵니다">5E_image에서 자세히 ↗</button>
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
    // 11-06 사용자: 종이 위에 도구만 붙이지 말고 「따로 창」 — 그림이 종이에서 떠올라 가운데 큰 창이 되고, 나머지 문서는 어둡게.
    // 적용·닫기하면 줄어들며 제자리로. 창 = 머리줄(적용·닫기) · 왼쪽 다섯 도구 · 가운데 큰 그림 · 아래 속성 줄.
    this.backdrop=document.createElement('div');this.backdrop.className='exam-inline-backdrop';
    this.slot=document.createElement('div');this.slot.className='exam-inline-slot';
    this.window=document.createElement('div');this.window.className='exam-inline-window';this.window.setAttribute('role','dialog');this.window.setAttribute('aria-modal','true');this.window.setAttribute('aria-label','그림 편집');
    this.clip=this.root.querySelector('.exam-inline-clip');
    this.window.append(this.heading,this.clip,this.toolbar);
    this.root.prepend(this.backdrop,this.slot);this.root.append(this.window);
    const font = this.field('font');
    for (const item of TEXT_FONTS) font.add(new Option(item.label, item.css));
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
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!event.repeat) { if (this.mode) {this.mode=null;this.anchor=null;this.render();} else void this.action('close'); }
        return;
      }
      if (event.target.matches('input,textarea,select')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {event.preventDefault();void this.action(event.shiftKey ? 'redo' : 'undo');}
      else if (!this.session?.simple && (event.key === 'Delete' || event.key === 'Backspace')) {event.preventDefault();void this.action('delete');}
      // 간단 편집 중의 Delete·Backspace가 창 밖으로 흘러 뒤에 숨은 그림의 객체를 지우지 않게(H3)
      else if (event.key === 'Delete' || event.key === 'Backspace') event.stopPropagation();
    });
  }
  field(name) { return this.root.querySelector(`[data-inline-field="${name}"]`); }
  syncTools() { for (const [action, mode] of [['add-label','label'],['add-leader','leader']]) this.button(action).setAttribute('aria-pressed', String(this.mode===mode)); }
  button(name) { return this.root.querySelector(`[data-inline-action="${name}"]`); }
  get active() { return !this.root.hidden; }
  open(session) {
    this.close();this.session = session;this.labels = copy(session.labels);this.bounds = copy(session.bounds);
    this.root.dataset.simple = String(!!session.simple);
    // 11-06: 두 번 누르기로 열어도 다섯 도구를 모두 보인다(예전 「간단 편집」은 라벨 글자만 고쳤다).
    this.root.querySelector('.exam-edit-badge').textContent = session.graph ? '그래프 그림 편집 중' : '그림 편집 중';
    this.root.querySelector('[data-inline-restore-label]').textContent = session.graph ? '그래프 편집' : '복원';
    this.button('restore').title = session.graph ? '그래프 창에서 이 그래프 객체를 고칩니다' : '그림 속 그래프를 고칠 수 있는 그래프 객체로 되살립니다 — 그래프 창에서 원본을 깔고 맞춥니다';
    this.button('revert').hidden = !session.restored;
    this.busy=false;this.root.querySelectorAll('button,input,textarea,select').forEach(control=>control.disabled=false);
    this.selected = this.labels[0]?.id;this.undo = [];this.redo = [];this.mode = null;this.lastPress=null;this.root.hidden = false;
    this.root.querySelector('.exam-inline-recovery').hidden=!session.recovery;
    this.position();this.render();this.liftIn();
    this.stopPosition=session.bridge.watchView(()=>this.position());
    this.resizeObserver=new ResizeObserver(()=>this.position());this.resizeObserver.observe(this.toolbar);
    this.svg.focus({preventScroll:true});
  }
  close() {
    this.stopPosition?.();this.stopPosition=null;this.resizeObserver?.disconnect();
    if(this.session&&!this.root.hidden)this.settleBack();
    this.root.classList.remove('is-in');
    this.root.hidden = true;this.session = null;this.drag = null;
  }
  // 떠오르기: 종이 위 그림 자리(source)에서 창 속 큰 그림 자리로 확대되며 올라온다.
  liftIn(){
    const reduce=matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.root.classList.remove('is-in');
    const from=this.sourceRect,to=this.picture.getBoundingClientRect();
    if(!reduce&&from&&to.width>0){
      this.picture.style.transition='none';
      this.picture.style.transformOrigin='0 0';
      this.picture.style.transform=`translate(${from.x-to.left}px,${from.y-to.top}px) scale(${from.w/to.width},${from.h/to.height})`;
      void this.picture.offsetWidth;
      this.picture.style.transition='';
    }
    requestAnimationFrame(()=>{if(!this.session)return;this.root.classList.add('is-in');this.picture.style.transform='';});
  }
  // 제자리로: 창을 닫는 즉시 그림 사본이 종이 위 자리로 줄어들며 사라진다(문서는 바로 다시 쓸 수 있게).
  settleBack(){
    const reduce=matchMedia?.('(prefers-reduced-motion: reduce)').matches,from=this.picture.getBoundingClientRect(),to=this.sourceRect;
    if(reduce||!to||!from.width)return;
    const ghost=this.picture.cloneNode(true);ghost.className='exam-inline-ghost';ghost.setAttribute('aria-hidden','true');ghost.removeAttribute('id');ghost.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
    Object.assign(ghost.style,{position:'fixed',left:`${from.left}px`,top:`${from.top}px`,width:`${from.width}px`,height:`${from.height}px`,transform:'none',transformOrigin:'0 0',margin:'0'});
    const shade=this.backdrop.cloneNode(false);shade.classList.add('exam-inline-ghost-shade');
    (this.root.parentElement||document.body).append(shade,ghost);
    void ghost.offsetWidth;
    ghost.style.transform=`translate(${to.x-from.left}px,${to.y-from.top}px) scale(${to.w/from.width},${to.h/from.height})`;ghost.style.opacity='0.0';shade.style.opacity='0';
    setTimeout(()=>{ghost.remove();shade.remove();},420);
  }
  setBase(url) {if (!this.session) return;this.session.baseUrl = url;this.render();}
  setLabels(labels) {this.labels=copy(labels);this.undo=[];this.redo=[];this.render();}
  setBounds(bounds, url) {this.bounds = copy(bounds);this.session.bounds = copy(bounds);this.session.baseUrl = url;this.render();this.position();}
  position() {
    if (!this.session) return;
    const {bridge, ref} = this.session, geometry = bridge.figureGeometry?.(ref) || bridge.figureRect(ref);
    // 종이 위 자리(떠오르기·제자리 애니메이션과 「떠난 자리」 점선). 문서가 움직이면 따라간다.
    if (geometry) {this.sourceRect={x:geometry.x,y:geometry.y,w:geometry.w,h:geometry.h};Object.assign(this.slot.style,{left:`${geometry.x}px`,top:`${geometry.y}px`,width:`${geometry.w}px`,height:`${geometry.h}px`});this.slot.hidden=false;}
    else this.slot.hidden=true;
    // 창 속 큰 그림: 그림 비율 그대로 화면 높이의 62%까지(창 틀 자리 230px은 남김), 화면 폭에 맞게 줄인다.
    const ratio=(this.bounds?.w>0&&this.bounds?.h>0)?this.bounds.w/this.bounds.h:(geometry?geometry.w/Math.max(1,geometry.h):4/3);
    const vw=innerWidth,vh=innerHeight,maxW=Math.max(160,Math.min(vw*.7,vw-260)),maxH=Math.max(120,Math.min(vh*.62,vh-230));
    let w=maxW,h=w/ratio;if(h>maxH){h=maxH;w=h*ratio;}
    this.picture.hidden=false;
    Object.assign(this.clip.style,{left:'',top:'',width:`${Math.round(w)+56}px`,height:`${Math.round(h)+40}px`});
    Object.assign(this.picture.style,{left:'28px',top:'20px',width:`${Math.round(w)}px`,height:`${Math.round(h)}px`});
    for(const handle of this.svg.querySelectorAll('[data-inline-handle]'))handle.setAttribute('r',Math.max(.25,this.bounds.w/Math.max(1,w)*5));
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
    if (label && !this.session.simple) {
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
        const handle=el('circle',{cx:point.x,cy:point.y,r:radius,fill:'#fff',stroke:'#6ba4f8','stroke-width':1.5,'vector-effect':'non-scaling-stroke'});
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
    this.root.querySelector('[data-inline-hint]').textContent=this.mode==='label' ? '그림에서 글자를 놓을 자리를 누르세요 · Esc 그만두기' : this.mode==='leader' ? (this.anchor ? '글자를 놓을 자리를 누르세요 · Esc 그만두기' : '지시선이 가리킬 곳을 누르세요 · Esc 그만두기') : label ? '글자는 아래 칸에서 고치고, 라벨·지시선의 점은 끌어 옮깁니다' : '도구를 고르세요 · 글자를 두 번 누르면 바로 고칩니다';
    this.syncTools();
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
    if (this.session.simple) {this.render();return;}
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
    if(name==='delete') {if(!this.selected)return;this.remember();this.lastDeleted=this.selected;this.labels=this.labels.filter(l=>l.id!==this.selected);this.selected=null;this.render();this.publish();return;}
    if(name==='elbow') {const l=this.selectedLabel();if(!l)return;this.remember();if(l.elbow)delete l.elbow;else l.elbow={x:l.p1.x,y:l.p2.y};this.render();this.publish();return;}
    if(name==='undo' || name==='redo') {const from=name==='undo'?this.undo:this.redo,to=name==='undo'?this.redo:this.undo;if(!from.length)return;to.push(this.snapshot());this.labels=from.pop();
      // 지운 라벨을 되돌리면 다시 골라 둔다(글자 칸이 비지 않게).
      if(!this.labels.some(l=>l.id===this.selected))this.selected=this.labels.some(l=>l.id===this.lastDeleted)?this.lastDeleted:this.labels[0]?.id;this.render();this.publish();return;}
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
      const b=bounds;group.replaceChildren(el('rect',{x:b.x,y:b.y,width:b.w,height:b.h,fill:'#6ba4f80a',stroke:'#6ba4f8','stroke-width':2,'vector-effect':'non-scaling-stroke','data-crop-handle':'move'}));
      for(const [name,x,y]of[['nw',b.x,b.y],['ne',b.x+b.w,b.y],['sw',b.x,b.y+b.h],['se',b.x+b.w,b.y+b.h]])group.append(el('circle',{cx:x,cy:y,r:fullBounds.w/120,fill:'white',stroke:'#6ba4f8','stroke-width':1.5,'vector-effect':'non-scaling-stroke','data-crop-handle':name}));
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
