import { createEditor } from '../vendor/rhwp-editor/index.js?v=1.7.0-four-session-integration';
import { readEditablePng } from './editable-png.js?v=1.7.0-four-session-integration';
import { DEFAULT_PICTURE_LAYOUT, validatePictureLayout, regionGeometry } from './rhwp-exam-region.js?v=1.7.0-four-session-integration';
import { installPictureResize } from './rhwp-exam-picture-resize.js?v=1.7.0-four-session-integration';

export const FIGURE_PREFIX = '5e-exam:';
const HWP_UNITS_PER_MM = 7200 / 25.4;
const decoded = value => typeof value === 'string' ? JSON.parse(value) : value;
const pathKey = path => JSON.stringify((path || []).map(step => [
  step.controlIndex ?? step.controlIdx, step.cellIndex ?? step.cellIdx, step.cellParaIndex ?? step.cellParaIdx,
]));
const pictureRef = (control, pageIndex) => ({
  sec:control.secIdx, ppi:control.paraIdx, ci:control.controlIdx, type:control.type, pageIndex,
  ...(control.cellPath?.length ? {cellPath:control.cellPath} : {}),
  ...(control.headerFooter ? {headerFooter:control.headerFooter} : {}),
});
const matchesPicture = (control, ref) => control.type === 'image' && control.secIdx === ref.sec &&
  control.paraIdx === ref.ppi && control.controlIdx === ref.ci && pathKey(control.cellPath) === pathKey(ref.cellPath) &&
  JSON.stringify(control.headerFooter || null) === JSON.stringify(ref.headerFooter || null);
const contains = (box, x, y) => box.width > 0 && box.height > 0 && x >= box.x && y >= box.y && x <= box.x + box.width && y <= box.y + box.height;
const intersect = (a, b) => {
  if (!a) return b;
  const x = Math.max(a.x,b.x), y = Math.max(a.y,b.y);
  return {x,y,width:Math.max(0,Math.min(a.x+a.width,b.x+b.width)-x),height:Math.max(0,Math.min(a.y+a.height,b.y+b.height)-y)};
};

// This experiment pins the Studio build. Its local plugin context is the only
// boundary that touches Studio internals; document mutations use its history.
export class RhwpExamBridge {
  constructor(editor, onChange, onEdit, onReplace, onBeforeReplace, validateSource) {
    this.editor = editor;
    this.onChange = onChange;
    this.onEdit = onEdit;
    this.validateSource = validateSource;
    this.deps = editor.element.contentWindow.rhwpStudio?.plugins?.deps;
    if (!this.deps?.wasm || typeof this.deps.getInputHandler !== 'function') {
      editor.destroy();
      throw new Error('이 RHWP 버전은 그림 연결을 지원하지 않습니다.');
    }
    this.revision = 0;
    this.onDocumentChanged = () => { this.revision++; this.onChange?.(); };
    this.deps.eventBus.on('document-changed', this.onDocumentChanged);
    // Page-local text edits do not always emit document-changed.
    this.deps.eventBus.on('document-mutated', this.onDocumentChanged);
    this.deps.eventBus.on('document-swapped',()=>setTimeout(()=>{if(!this.loading) onReplace?.();this.onDocumentChanged();},0));
    this.deps.eventBus.on('create-new-document',()=>{const previous=this.generation;setTimeout(()=>{if(this.generation!==previous){onReplace?.();this.onDocumentChanged();}},500);});
    const emit=this.deps.eventBus.emit.bind(this.deps.eventBus);
    this.deps.eventBus.emit=(name,...args)=>{
      const payload=args[0];
      if (!this.loading && onBeforeReplace && ['open-document-bytes','create-new-document'].includes(name)) {
        void (async()=>{
          try {await onBeforeReplace();emit(name,...args);}
          catch(error){if(payload?.requestId)emit('open-document-bytes:done',{requestId:payload.requestId,ok:false,error:error.message});this.onChange?.(error);}
        })();return;
      }
      return emit(name,...args);
    };
    this.doubleClick = event => {
      const ref = this.pictureAtEvent(event);
      if (!ref || !this.onEdit) return;
      const id = this.figureId(ref);
      event.preventDefault(); event.stopImmediatePropagation();
      this.onEdit?.(id, ref);
    };
    this.editor.element.contentDocument.addEventListener('dblclick', this.doubleClick, true);
  }

  static async create(host, options = {}) {
    const studioUrl = new URL('../vendor/rhwp-studio/index.html', import.meta.url);
    studioUrl.searchParams.set('chrome', 'embed');
    const editor = await createEditor(host, { studioUrl:studioUrl.href, renderer:'canvas2d' });
    return new RhwpExamBridge(editor, options.onChange, options.onEdit, options.onReplace, options.onBeforeReplace, options.validateSource);
  }

  get input() {
    const input=this.deps.getInputHandler();this.resizeInputs ||= new WeakSet();
    if(input && !this.resizeInputs.has(input)){this.resizeInputs.add(input);installPictureResize(input,this);}
    return input;
  }
  get wasm() { return this.deps.wasm; }
  get generation() { return this.wasm.documentGeneration; }

  watchView(callback) {
    let frame=0;const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;callback();});};
    const events=['viewport-scroll','viewport-resize','zoom-changed','zoom-raster-ready','document-changed','document-mutated','document-layout-refreshed','picture-object-selection-changed'];
    const offs=events.map(name=>this.deps.eventBus.on(name,schedule));
    const doc=this.editor.element.contentDocument;
    doc.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);
    schedule();
    return ()=>{cancelAnimationFrame(frame);events.forEach((name,i)=>{if(typeof offs[i]==='function')offs[i]();else this.deps.eventBus.off?.(name,schedule);});doc.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);};
  }
  selectPicture(ref) {
    const c=this.input.cursor,p=ref.cellPath?.at(-1);
    c.enterPictureObjectSelectionDirect(ref.sec,ref.ppi,ref.ci,'image',p?.cellIndex,p?.cellParaIndex,ref.headerFooter,ref.cellPath?.[0]?.controlIndex,ref.cellPath,null,false,ref.pageIndex);
    this.input.renderPictureObjectSelection();this.deps.eventBus.emit('picture-object-selection-changed',true);
  }
  paragraphTarget(ref) {
    if(ref.headerFooter || (ref.cellPath?.length||0)>1)return null;
    const p=ref.cellPath?.[0];
    return p?{kind:'cell',sec:ref.sec,parentPara:ref.ppi,controlIdx:p.controlIndex,cellIdx:p.cellIndex,cellParaIdx:p.cellParaIndex}:{kind:'body',sec:ref.sec,para:ref.ppi};
  }
  pictureLayout(ref) {
    const p=this.properties(ref),target=this.paragraphTarget(ref);
    let para;
    try {para=target?.kind==='body'?this.wasm.getParaPropertiesAt(target.sec,target.para):target?this.wasm.getCellParaPropertiesAt(target.sec,target.parentPara,target.controlIdx,target.cellIdx,target.cellParaIdx):null;}catch{}
    const rawAlignment=p.treatAsChar?para?.alignment:p.horzAlign;
    const alignment=typeof rawAlignment==='string'?rawAlignment[0].toUpperCase()+rawAlignment.slice(1).toLowerCase():null;
    return {...DEFAULT_PICTURE_LAYOUT,treatAsChar:!!p.treatAsChar,alignment:['Left','Center','Right'].includes(alignment)?alignment:'Left',
      textWrap:['TopAndBottom','Square','Tight','BehindText','InFrontOfText'].includes(p.textWrap)?p.textWrap:'TopAndBottom',
      ...Object.fromEntries(['top','bottom','left','right'].map(k=>[k,(p['outerMargin'+k[0].toUpperCase()+k.slice(1)]||0)/100]))};
  }
  writePictureLayout(ref,layout) {
    validatePictureLayout(layout);
    const target=this.paragraphTarget(ref),before=this.pictureLayout(ref);
    if(layout.treatAsChar && layout.alignment!==before.alignment && !target)throw new Error('이 위치의 문단 정렬은 RHWP 개체 속성에서 변경해주세요.');
    const props={treatAsChar:layout.treatAsChar,textWrap:layout.textWrap,
      outerMarginTop:Math.round(layout.top*100),outerMarginBottom:Math.round(layout.bottom*100),
      outerMarginLeft:Math.round((layout.alignment==='Center'?0:layout.left)*100),outerMarginRight:Math.round((layout.alignment==='Center'?0:layout.right)*100)};
    if(!layout.treatAsChar)Object.assign(props,{horzRelTo:'Para',horzAlign:layout.alignment});
    this.setProperties(ref,props);
    if(layout.treatAsChar && target){
      const json=JSON.stringify({alignment:layout.alignment.toLowerCase()});
      if(target.kind==='body')this.wasm.applyParaFormat(target.sec,target.para,json);
      else this.wasm.applyParaFormatInCell(target.sec,target.parentPara,target.controlIdx,target.cellIdx,target.cellParaIdx,json);
    }
  }
  applyPictureLayout(ref,layout) {return this.transaction('picture-layout',()=>{this.writePictureLayout(ref,layout);return true;});}

  async settleFigureView(ref, zoom) {
    // Zoom reflows virtual pages asynchronously. Wait for the displayed page,
    // rather than placing the label projection over the previous raster.
    const view = this.editor.element.contentWindow;
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise(resolve => view.requestAnimationFrame(resolve));
      const found = this.picturePlacement(ref);
      if (found && Math.abs(found.placement.scale - zoom) < .002 && !this.input?.viewportManager?.isZoomAnimating?.() && !this.input?.viewportManager?.isZoomRasterPending?.()) return;
    }
  }

  async animateFigureCamera(ref,zoom,{fit='none',centre,scroll}={}) {
    const input=this.input,manager=input.viewportManager,generation=this.generation,from=this.figureGeometry(ref);
    const startZoom=manager.getZoom(),startX=manager.getScrollX(),startY=manager.getScrollY();
    const duration=window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:280;
    manager.cancelPendingZoomRaster();manager.cancelZoomAnimation();manager.updateZoomFitMode(fit);
    // The pinned Studio keeps its existing surfaces while zoomAnimating=true.
    // One camera drives both zoom and pan; only the final view gets new rasters.
    manager.zoomAnimating=true;manager.zoomTarget=zoom;manager.zoomAnchor={x:.5,y:.5};
    let cancelled=false,expected=startZoom;
    const cancel=()=>{cancelled=true;};const doc=this.editor.element.contentDocument;
    doc.addEventListener('wheel',cancel,true);doc.addEventListener('pointerdown',cancel,true);
    try {
      await new Promise(resolve=>{let started;const frame=now=>{
        if(started===undefined)started=now;
        if(cancelled || this.input!==input || this.generation!==generation || Math.abs(manager.getZoom()-expected)>.002){cancelled=true;resolve();return;}
        const t=duration?Math.min(1,(now-started)/duration):1,ease=1-Math.pow(1-t,3);
        expected=startZoom+(zoom-startZoom)*ease;manager.zoom=expected;
        this.deps.eventBus.emit('zoom-changed',expected,manager.zoomAnchor);
        if(scroll){manager.setScrollLeft(startX+(scroll.x-startX)*ease);manager.setScrollTop(startY+(scroll.y-startY)*ease);}
        else if(from && centre){const current=this.figureGeometry(ref),point=this.parentPoint(0,0);if(current){
          const x=from.x+from.w/2+(centre.x-from.x-from.w/2)*ease,y=from.y+from.h/2+(centre.y-from.y-from.h/2)*ease;
          manager.setScrollLeft(manager.getScrollX()+(current.x+current.w/2-x)/point.scaleX);
          manager.setScrollTop(manager.getScrollY()+(current.y+current.h/2-y)/point.scaleY);
        }}
        if(t<1)requestAnimationFrame(frame);else resolve();
      };requestAnimationFrame(frame);});
    } finally {
      doc.removeEventListener('wheel',cancel,true);doc.removeEventListener('pointerdown',cancel,true);
      if(this.input===input&&this.generation===generation){
        // An interrupt may have started Studio's own wheel/manual zoom. Never
        // cancel that newer gesture or replace its anchor/fit preference.
        if(Math.abs(manager.getZoom()-expected)<.002&&manager.zoomTarget===zoom)manager.setZoom(manager.getZoom(),manager.zoomAnchor,fit);
        await this.settleFigureView(ref,manager.getZoom());
      }
      else manager.cancelZoomAnimation();
    }
    return !cancelled;
  }
  async focusFigure(ref, {toolbarHeight = 124, contextHeight = 96} = {}) {
    const input = this.input, manager = input?.viewportManager;
    const geometry = this.figureGeometry(ref), viewport = this.figureViewport();
    if (!manager || !geometry || !viewport) return null;
    const before = {input, generation:this.generation, zoom:manager.getZoom(),
      fit:manager.getZoomFitMode(), x:manager.getScrollX(), y:manager.getScrollY()};
    const angle = (geometry.rotation || 0)*Math.PI/180;
    const w = Math.abs(Math.cos(angle))*geometry.w + Math.abs(Math.sin(angle))*geometry.h;
    const h = Math.abs(Math.sin(angle))*geometry.w + Math.abs(Math.cos(angle))*geometry.h;
    const factor = Math.min((viewport.w-80)/w, (viewport.h-toolbarHeight-contextHeight-64)/h);
    const zoom = Math.max(before.zoom, Math.min(4, before.zoom*factor));
    const completed=await this.animateFigureCamera(ref,zoom,{centre:{x:viewport.x+viewport.w/2,y:viewport.y+44+h*zoom/before.zoom/2}});
    if (this.input !== input || this.generation !== before.generation) return null;
    return {...before,zoomApplied:zoom,interrupted:!completed,ref};
  }

  async restoreFigureView(saved) {
    if (!saved || saved.interrupted || this.input !== saved.input || this.generation !== saved.generation) return;
    const manager = this.input.viewportManager;
    // A manual zoom during editing becomes the user's new view preference.
    if (Math.abs(manager.getZoom()-saved.zoomApplied) > .001) return;
    await this.animateFigureCamera(saved.ref,saved.zoom,{fit:saved.fit,scroll:{x:saved.x,y:saved.y}});
  }

  async newDocument() {
    this.loading=true;
    try {await this.deps.createBlankDocument();} finally {this.loading=false;}
    if (!this.input) throw new Error('새 시험지를 만들지 못했습니다.');
    this.input.cursor?.moveTo?.({sectionIndex:0,paragraphIndex:0,charOffset:0});
    this.revision++;
  }

  async load(bytes, name) {
    // Validate with the exact pinned native parser before Studio hides or
    // replaces the live document. Detached documents own no live undo entries.
    const Document = this.wasm.borrowDocumentHandle().constructor;
    const staged = new Document(bytes);
    try {
      staged.convertToEditable();
      const figures = new Map();
      for (let page = 0; page < staged.pageCount(); page++) {
        const layout = JSON.parse(staged.getPageControlLayout(page));
        for (const control of layout.controls || []) {
          if (control.type !== 'image') continue;
          const image = staged.getControlImageData(control.secIdx,control.paraIdx,JSON.stringify(control.cellPath || []),control.controlIdx);
          const figure = readEditablePng(image,this.validateSource);
          if (!figure) continue;
          const previous = figures.get(figure.id);
          if (previous && JSON.stringify(previous) !== JSON.stringify(figure)) throw new Error('같은 그림 ID의 원본이 서로 다릅니다.');
          figures.set(figure.id,figure);
          if (figures.size > 500) throw new Error('그림 원본은 500개까지 열 수 있습니다.');
        }
      }
    } finally {staged.free();}
    this.loading=true;
    try {await this.editor.loadFile(bytes,name,{skipUnsavedGuard:true,suppressDialogs:true});this.revision++;}
    finally {this.loading=false;}
  }

  transaction(label, mutate) {
    const input = this.input;
    if (!input) throw new Error('먼저 시험지를 열어주세요.');
    let result;
    input.executeOperation({ kind:'snapshot', operationType:`5e-exam:${label}`,
      operation:() => {
        const before = input.getCursorPosition(), snapshot = this.wasm.saveSnapshot();
        try { result = mutate(input); return input.getCursorPosition(); }
        catch (error) { this.wasm.restoreSnapshot(snapshot); input.cursor.moveTo(before); throw error; }
        finally { this.wasm.discardSnapshot(snapshot); }
      } });
    if (result === undefined) throw new Error('이 위치에서 그림을 수정할 수 없습니다.');
    this.deps.eventBus.emit('document-changed');
    return result;
  }

  insertText(text) {
    return this.transaction('text', input => {
      const pos = input.getCursorPosition();
      const result = decoded(this.wasm.insertText(pos.sectionIndex, pos.paragraphIndex, pos.charOffset, text));
      if (!result?.ok) throw new Error('문서에 글을 넣지 못했습니다.');
      input.cursor.moveTo({ ...pos, charOffset:result.charOffset });
      return result;
    });
  }

  insertParagraph() {
    return this.transaction('paragraph', input => {
      const pos = input.getCursorPosition();
      const result = decoded(this.wasm.splitParagraph(pos.sectionIndex, pos.paragraphIndex, pos.charOffset, null));
      if (!result?.ok) throw new Error('새 문단을 만들지 못했습니다.');
      input.cursor.moveTo({ sectionIndex:pos.sectionIndex, paragraphIndex:result.paraIdx, charOffset:0 });
      return result;
    });
  }

  insertFigure({ id, bytes, widthMm, heightMm, pixelWidth, pixelHeight }) {
    return this.transaction('insert-figure', input => {
      let pos = input.getCursorPosition();
      let cellPath = structuredClone(pos.cellPath || []);
      if (input.cursor.isInHeaderFooter?.() || input.cursor.isInFootnote?.()) throw new Error('본문이나 표 셀에 커서를 놓고 그림을 넣어주세요.');
      if (cellPath.length) {
        const last = cellPath.at(-1);
        const cell = cellPath.length === 1
          ? this.wasm.getCellProperties(pos.sectionIndex, pos.parentParaIndex, last.controlIndex, last.cellIndex)
          : this.wasm.getCellPropertiesByPath(pos.sectionIndex, pos.parentParaIndex, JSON.stringify(cellPath), last.cellIndex);
        const available = (cell.width - (cell.paddingLeft || 0) - (cell.paddingRight || 0)) / HWP_UNITS_PER_MM;
        if (available > 0 && widthMm > available) { heightMm *= available / widthMm; widthMm = available; }
      }
      // A new inline picture owns its paragraph, so centring never changes the
      // alignment of the question text on either side of the insertion point.
      if(!cellPath.length && this.wasm.getParagraphLength(pos.sectionIndex,pos.paragraphIndex)>0){
        const length=this.wasm.getParagraphLength(pos.sectionIndex,pos.paragraphIndex),originalOffset=pos.charOffset;
        const split=decoded(this.wasm.splitParagraph(pos.sectionIndex,pos.paragraphIndex,pos.charOffset,null));
        if(!split?.ok)throw new Error('그림을 넣을 문단을 만들지 못했습니다.');
        pos={...pos,paragraphIndex:split.paraIdx,charOffset:0};
        if(length>originalOffset){const tail=decoded(this.wasm.splitParagraph(pos.sectionIndex,pos.paragraphIndex,0,null));if(!tail?.ok)throw new Error('본문을 분리하지 못했습니다.');}
      }
      if(cellPath.length && this.wasm.getCellParagraphLengthByPath(pos.sectionIndex,pos.parentParaIndex,JSON.stringify(cellPath))>0){
        const length=this.wasm.getCellParagraphLengthByPath(pos.sectionIndex,pos.parentParaIndex,JSON.stringify(cellPath)),offset=pos.charOffset;
        const split=decoded(this.wasm.splitParagraphInCellByPath(pos.sectionIndex,pos.parentParaIndex,JSON.stringify(cellPath),offset,null));
        if(!split?.ok)throw new Error('표 셀의 그림 문단을 만들지 못했습니다.');
        cellPath.at(-1).cellParaIndex=split.cellParaIndex;pos={...pos,cellPath,charOffset:0};
        if(length>offset){const tail=decoded(this.wasm.splitParagraphInCellByPath(pos.sectionIndex,pos.parentParaIndex,JSON.stringify(cellPath),0,null));if(!tail?.ok)throw new Error('표 셀의 본문을 분리하지 못했습니다.');}
      }
      // RHWP's picture insertion into a cell creates a paper-anchored sibling.
      // Move the native inline control into the cell in the same undo operation
      // instead, so the row grows and the picture follows the table.
      const result = decoded(this.wasm.insertPicture(pos.sectionIndex, pos.parentParaIndex ?? pos.paragraphIndex, cellPath.length ? 0 : pos.charOffset, '', bytes,
        Math.round(widthMm * HWP_UNITS_PER_MM), Math.round(heightMm * HWP_UNITS_PER_MM),
        pixelWidth, pixelHeight, 'png', FIGURE_PREFIX + id, null, null));
      if (!result?.ok) throw new Error('시험지에 그림을 넣지 못했습니다.');
      const ref = { sec:pos.sectionIndex, ppi:result.paraIdx, ci:result.controlIdx, type:'image' };
      this.wasm.setPictureProperties(ref.sec, ref.ppi, ref.ci, { treatAsChar:true,outerMarginTop:500,outerMarginBottom:500,outerMarginLeft:0,outerMarginRight:0 });
      if (!cellPath.length) {this.writePictureLayout(ref,{...DEFAULT_PICTURE_LAYOUT});return ref;}
      const copied = decoded(this.wasm.copyControl(ref.sec, ref.ppi, ref.ci, '[]'));
      if (!copied?.ok) throw new Error('표에 넣을 그림을 준비하지 못했습니다.');
      const pasted = decoded(this.wasm.pasteInternalInCellByPath(pos.sectionIndex, pos.parentParaIndex, JSON.stringify(cellPath), pos.charOffset));
      if (!pasted?.ok) throw new Error('표 셀에 그림을 넣지 못했습니다.');
      this.wasm.deletePictureControl(ref.sec, ref.ppi, ref.ci);
      const target = this.findFigure(id);
      if (!target?.cellPath?.length) throw new Error('표 셀의 그림 연결을 확인하지 못했습니다.');
      if(this.paragraphTarget(target))this.writePictureLayout(target,{...DEFAULT_PICTURE_LAYOUT});
      return target;
    });
  }

  properties(ref) {
    if (ref.headerFooter) return this.wasm.getHeaderFooterPictureProperties(ref.sec, ref.headerFooter.outerParaIdx, ref.headerFooter.outerControlIdx, ref.ppi, ref.ci);
    if (ref.cellPath?.length) return this.wasm.getCellPicturePropertiesByPath(ref.sec, ref.ppi, ref.cellPath, ref.ci);
    return this.wasm.getPictureProperties(ref.sec, ref.ppi, ref.ci);
  }

  figureId(ref) {
    try {
      const properties = this.properties(ref);
      const description = properties.description || properties.shapeComment || properties.comment || '';
      return description.startsWith(FIGURE_PREFIX) ? description.slice(FIGURE_PREFIX.length) : null;
    } catch { return null; }
  }

  selectedFigureId() {
    const ref = this.input?.cursor?.getSelectedPictureRef();
    return ref ? this.figureId(ref) : null;
  }

  documentPictures() {
    const key = `${this.generation}:${this.revision}`;
    if (this.picturesCache?.key === key) return this.picturesCache.pictures;
    const seen = new Set(), pictures = [];
    for (let page = 0; page < this.wasm.pageCount; page++) {
      for (const control of this.wasm.getPageControlLayout(page).controls || []) {
        if (control.type !== 'image') continue;
        const ref = {sec:control.secIdx,ppi:control.paraIdx,ci:control.controlIdx,type:'image',...(control.cellPath ? {cellPath:control.cellPath} : {})};
        const key = JSON.stringify(ref);
        if (!seen.has(key)) {seen.add(key);pictures.push({ref,id:this.figureId(ref)});}
      }
    }
    this.picturesCache = {key,pictures};
    return pictures;
  }

  insertionTarget() {
    if (!this.input || this.input.cursor.isInHeaderFooter?.() || this.input.cursor.isInFootnote?.()) return null;
    const position = this.input.getCursorPosition();
    return {position:structuredClone(position),generation:this.generation,revision:this.revision};
  }

  insertAt(target, figure) {
    if (!target || target.generation !== this.generation || target.revision !== this.revision) throw new Error('문서가 변경되었습니다. 삽입할 위치를 다시 선택해주세요.');
    const input = this.input;
    // Placement installs a confirmed caret target. Retire the previous table
    // gesture so its screen-space handles cannot consume the next picture click.
    if (input.cursor.isInTableObjectSelection()) {
      input.cursor.exitTableObjectSelection();
      input.tableObjectRenderer?.clear();
      this.deps.eventBus.emit('table-object-selection-changed', false);
    }
    input.cursor.moveTo(target.position);
    return this.insertFigure(figure);
  }

  findFigure(id) {
    for (let page = 0; page < this.wasm.pageCount; page++) {
      const layout = this.wasm.getPageControlLayout(page);
      const visit = value => {
        if (!value || typeof value !== 'object') return null;
        const sec = value.sectionIndex ?? value.secIdx ?? value.section_idx ?? value.sec;
        const ppi = value.paragraphIndex ?? value.paraIdx ?? value.parentParaIdx ?? value.paraIndex ?? value.ppi;
        const ci = value.controlIndex ?? value.controlIdx ?? value.ci;
        if ([sec, ppi, ci].every(Number.isSafeInteger)) {
          const ref = { sec, ppi, ci, type:'image', ...(value.cellPath ? {cellPath:value.cellPath} : {}) };
          if (this.figureId(ref) === id) return ref;
        }
        for (const child of Object.values(value)) {
          const found = Array.isArray(child) ? child.map(visit).find(Boolean) : visit(child);
          if (found) return found;
        }
        return null;
      };
      const found = visit(layout);
      if (found) return found;
    }
    return null;
  }

  replaceFigure(id, image, nextId = id, selectedRef = null, region = null) {
    const ref = selectedRef && this.figureId(selectedRef)===id ? selectedRef : this.findFigure(id);
    if (!ref) throw new Error('연결된 그림을 찾지 못했습니다. 그림이 삭제되었거나 연결이 바뀌었습니다.');
    if (this.figureId(ref) !== id) throw new Error('그림 연결이 바뀌었습니다. 다시 선택해주세요.');
    return this.transaction('replace-figure', () => {
      const props=this.properties(ref), width=props.width;
      const result=this.writeFigure(ref,image,nextId);
      // The PNG already contains the chosen crop. Preserve the native anchor and
      // width; only its aspect ratio changes. Crop UI amounts use shape units,
      // not the source-image coordinates used by the renderer.
      const geometry=region ? regionGeometry(region.before,region.after,props) : {height:Math.max(1,Math.round(width*image.pixelHeight/image.pixelWidth))};
      this.setProperties(ref,geometry);if(region?.layout)this.writePictureLayout(ref,region.layout);return result;
    });
  }

  setProperties(ref,props) {
    if(ref.headerFooter)return this.wasm.setHeaderFooterPictureProperties(ref.sec,ref.headerFooter.outerParaIdx,ref.headerFooter.outerControlIdx,ref.ppi,ref.ci,props);
    return ref.cellPath?.length ? this.wasm.setCellPicturePropertiesByPath(ref.sec,ref.ppi,ref.cellPath,ref.ci,props) : this.wasm.setPictureProperties(ref.sec,ref.ppi,ref.ci,props);
  }
  pictureRasterSize(ref, op) {
    // Linked display images are PNGs. Read the header without decoding a
    // hidden/virtualized page; a rendered foreign image can supply its size.
    const bytes=new Uint8Array(this.wasm.getControlImageData(ref.sec,ref.ppi,ref.ci,JSON.stringify(ref.cellPath || [])));
    const signature=[137,80,78,71,13,10,26,10];
    if (bytes.length>=24 && signature.every((value,index)=>bytes[index]===value) &&
        [73,72,68,82].every((value,index)=>bytes[index+12]===value)) {
      const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
      const width=view.getUint32(16),height=view.getUint32(20);
      if(width>0 && height>0)return {width,height};
    }
    const image=this.editor?.element?.contentDocument?.querySelector(`[data-rhwp-flow-image-page="${ref.pageIndex}"]`)?.querySelectorAll('img')[op.flowIndex];
    if(image?.naturalWidth>0 && image.naturalHeight>0)return {width:image.naturalWidth,height:image.naturalHeight};
    throw new Error('그림의 원본 해상도를 확인하지 못했습니다. 그림을 다시 선택해주세요.');
  }
  pictureSourceRegion(ref, rasterSize = null) {
    // Read native paint data without page visibility requirements: original
    // editing hides the iframe, and a linked picture can be on a virtual page.
    for (let page=0;page<this.wasm.pageCount;page++) {
      const control=this.wasm.getPageControlLayout(page).controls?.find(control=>matchesPicture(control,ref));
      if (!control) continue;
      const op=this.picturePaint(page,control,this.properties(ref));
      if (!op) break;
      const nativeSize=op.originalSizeHu!=null;
      // Some imported files use an all-zero crop as the full-image sentinel.
      const nativeCrop=op.crop && !['left','top','right','bottom'].every(key=>op.crop[key]===0) ? op.crop : null;
      let [w,h]=op.originalSizeHu || [];
      if(nativeSize && !(Number.isFinite(w) && w>0 && Number.isFinite(h) && h>0))break;
      // Pinned Studio's Wo/Ko infer a full-image extent from zero-origin crop
      // endpoints when originalSizeHu is absent (common after HWPX import).
      // A nonzero origin instead needs raster dimensions and the inferred
      // axis scale, or the native 75 HU/px default. Match that render contract.
      if(!nativeSize) {
        const crop=nativeCrop;
        if(!crop){w=1;h=1;}
        else if(crop.left===0 && crop.top===0 && crop.right>0 && crop.bottom>0){w=crop.right;h=crop.bottom;}
        else {
          const size=rasterSize || this.pictureRasterSize({...ref,pageIndex:page},op);
          if(!(Number.isFinite(size.width) && size.width>0 && Number.isFinite(size.height) && size.height>0))break;
          const sx=crop.left===0 && crop.right>0 ? crop.right/size.width : null;
          const sy=crop.top===0 && crop.bottom>0 ? crop.bottom/size.height : null;
          const shared=sx ?? sy ?? 75;
          w=size.width*(sx ?? shared);h=size.height*(sy ?? shared);
        }
      }
      const crop=nativeCrop || {left:0,top:0,right:w,bottom:h};
      const l=Math.max(0,Math.min(w,crop.left)),t=Math.max(0,Math.min(h,crop.top));
      const r=Math.max(l,Math.min(w,crop.right)),b=Math.max(t,Math.min(h,crop.bottom));
      if (![w,h,l,t,r,b].every(Number.isFinite) || r<=l || b<=t) break;
      return {w,h,l,t,r,b,nativeSize};
    }
    throw new Error('그림의 원본 좌표를 확인하지 못했습니다. 그림을 다시 선택해주세요.');
  }
  cropBounds(ref,bounds,rasterSize=null) {
    const {w,h,l,t,r,b}=this.pictureSourceRegion(ref,rasterSize);
    return {x:bounds.x+bounds.w*l/w,y:bounds.y+bounds.h*t/h,w:bounds.w*(r-l)/w,h:bounds.h*(b-t)/h};
  }
  writeFigure(ref, image, id, rasterSize = null) {
    this.picturesCache = null;
    const source=this.pictureSourceRegion(ref,rasterSize);
    // assignPictureImage uses natural pixels ONLY to form crop endpoints
    // (px * 75), retaining originalSizeHu. Preserve that native extent when
    // present; without it Studio derives the extent from the new PNG/crop.
    // Ceiling covers non-/75 extents. Actual PNG resolution comes from bytes.
    const width=source.nativeSize ? Math.ceil(source.w/75) : image.pixelWidth;
    const height=source.nativeSize ? Math.ceil(source.h/75) : image.pixelHeight;
    const result = decoded(this.wasm.assignPictureImage(ref.sec,ref.ppi,JSON.stringify(ref.cellPath || []),ref.ci,image.bytes,width,height,'png'));
    if (!result?.ok) throw new Error('시험지 그림을 교체하지 못했습니다.');
    this.setProperties(ref,{description:FIGURE_PREFIX + id});
    return result;
  }

  recoverFigures(validateSource) {
    const figures = new Map(), seen = new Set(), reconnect = [];
    for (let page = 0; page < this.wasm.pageCount; page++) {
      for (const control of this.wasm.getPageControlLayout(page).controls || []) {
        if (control.type !== 'image') continue;
        const ref = {sec:control.secIdx,ppi:control.paraIdx,ci:control.controlIdx,type:'image',...(control.cellPath ? {cellPath:control.cellPath} : {})};
        const key = JSON.stringify(ref);
        if (seen.has(key)) continue; seen.add(key);
        const bytes = this.wasm.getControlImageData(ref.sec, ref.ppi, ref.ci, JSON.stringify(ref.cellPath || []));
        const figure = readEditablePng(bytes, validateSource);
        if (figure) {
          const existing = figures.get(figure.id);
          if (existing && JSON.stringify(existing) !== JSON.stringify(figure)) throw new Error('같은 그림 ID의 원본이 서로 다릅니다.');
          figures.set(figure.id, figure);
          if (figures.size > 500) throw new Error('그림 원본은 500개까지 열 수 있습니다.');
          if (this.figureId(ref) !== figure.id) reconnect.push({ref,id:figure.id});
        }
      }
    }
    if (reconnect.length) this.transaction('recover-figure-links', () => {
      for (const {ref,id} of reconnect) {
        const props = {description:FIGURE_PREFIX + id};
        if (ref.cellPath?.length) this.wasm.setCellPicturePropertiesByPath(ref.sec, ref.ppi, ref.cellPath, ref.ci, props);
        else this.wasm.setPictureProperties(ref.sec, ref.ppi, ref.ci, props);
      }
      return true;
    });
    return figures;
  }

  // The pinned Studio rounds control layout to 0.1px. Paint ops preserve the
  // actual frame, including table placement and ancestor clipping. Never use
  // picture property offsets: they are anchor-relative HWP units.
  picturePaint(page, control, props) {
    const matches = op => op.bbox && [op.bbox.x-control.x,op.bbox.y-control.y,
      op.bbox.width-control.w,op.bbox.height-control.h].every(delta => Math.abs(delta) <= 0.051) &&
      (op.transform?.rotation || 0) === (props.rotationAngle || 0) &&
      !!op.transform?.horzFlip === !!props.horzFlip && !!op.transform?.vertFlip === !!props.vertFlip;
    const flow = decoded(this.wasm.getPageFlowImageOps(page));
    if (flow?.cacheable) {
      const op = flow.images?.find(matches);
      if (op) return {...op,flow:true,flowIndex:flow.images.filter(image => {
        const clip = image.clip && intersect(image.bbox,image.clip);
        return !clip || (clip.width > 0 && clip.height > 0);
      }).indexOf(op)};
    }
    const visit = (node, clip = null) => {
      if (!node) return null;
      if (node.kind === 'clipRect') clip = intersect(clip,node.clip);
      const op = node.ops?.find(op => op.type === 'image' && matches(op));
      if (op) return {...op,clip};
      for (const child of [...(node.children || []), ...(node.child ? [node.child] : [])]) {
        const found = visit(child,clip); if (found) return found;
      }
      return null;
    };
    return visit(this.wasm.getPageLayerTreeObject(page).root);
  }

  pictureFrame(op) {
    const rotation = op.transform?.rotation || 0, box = op.bbox;
    // createOrReuseFlowImageLayer swaps quarter-turn dimensions back before
    // applying CSS rotate(deg) scale(horzFlip, vertFlip), about the centre.
    const quarterTurn = (rotation % 180 + 180) % 180 === 90;
    const w = quarterTurn ? box.height : box.width, h = quarterTurn ? box.width : box.height;
    return {x:box.x+(box.width-w)/2,y:box.y+(box.height-h)/2,w,h,rotation,
      flipH:!!op.transform?.horzFlip,flipV:!!op.transform?.vertFlip};
  }

  pagePlacement(page) {
    const input = this.input, content = input?.container.querySelector('#scroll-content');
    if (!content || !content.getClientRects().length) return null;
    const zoom = input.viewportManager.getZoom();
    if (!(zoom > 0)) return null;
    const top = input.virtualScroll.getPageOffset(page);
    // Canvas pooling and layered rendering make DOM enumeration unrelated to
    // page indices. Prefer the page's tagged paint plane, then its positioned
    // main canvas. Bounding boxes also track in-flight zoom previews.
    const canvas = [...content.querySelectorAll('.document-page-canvas')].find(canvas => Math.abs(parseFloat(canvas.style.top)-top) < 0.01);
    const plane = content.querySelector(`[data-rhwp-overlay-page="${page}"]`) || canvas;
    if (plane) {
      const rect = plane.getBoundingClientRect(), width = parseFloat(plane.style.width);
      const renderedZoom = Number(canvas?.dataset.rhwpRenderedZoom);
      if (!(rect.width > 0 && rect.height > 0 && width > 0)) return null;
      return {x:rect.left,y:rect.top,w:rect.width,h:rect.height,scale:(renderedZoom > 0 ? renderedZoom : zoom)*rect.width/width};
    }
    return null; // No rendered surface (virtualized, hidden or still loading).
  }

  parentPoint(x, y) {
    const frame = this.editor.element, root = frame.getBoundingClientRect();
    const scaleX = root.width/frame.offsetWidth, scaleY = root.height/frame.offsetHeight;
    return {x:root.left+(frame.clientLeft+x)*scaleX,y:root.top+(frame.clientTop+y)*scaleY,scaleX,scaleY};
  }

  picturePlacement(ref) {
    if (!ref || (ref.type && ref.type !== 'image')) return null;
    try {
      const key=JSON.stringify([this.generation,this.revision,ref.sec,ref.ppi,ref.ci,ref.cellPath,ref.headerFooter]);
      if(this.paintCacheRevision!==`${this.generation}:${this.revision}`){this.paintCache=new Map();this.paintCacheRevision=`${this.generation}:${this.revision}`;}
      const cached=this.paintCache.get(key);
      const pages = cached ? [cached.page] : Array.from({length:this.wasm.pageCount},(_,page) => page);
      if (Number.isInteger(ref.pageIndex) && pages.includes(ref.pageIndex)) pages.unshift(...pages.splice(ref.pageIndex,1));
      for (const page of pages) {
        const control = cached?.control || this.wasm.getPageControlLayout(page).controls?.find(control => matchesPicture(control,ref));
        if (!control || control.missing) continue;
        const placement = this.pagePlacement(page); if (!placement) continue;
        const op = cached?.op || this.picturePaint(page,control,this.properties(ref)); if (!op) continue;
        if(!cached)this.paintCache.set(key,{page,control,op});
        const plane = this.editor.element.contentDocument.querySelector?.(`[data-rhwp-flow-image-page="${page}"]`);
        const element = op.flow ? plane?.querySelectorAll('img')[op.flowIndex]?.parentElement : null;
        if (element && element.style.transform !== `rotate(${op.transform?.rotation || 0}deg) scale(${op.transform?.horzFlip ? -1 : 1}, ${op.transform?.vertFlip ? -1 : 1})`) continue;
        return {op,placement,plane,element};
      }
    } catch { /* Layout can disappear during a native document swap. */ }
    return null;
  }

  // Parent viewport CSS pixels, BEFORE rotation/flips, not the rotated AABB.
  // Apply transform-origin:center; transform:rotate(rotation deg) scale(...).
  // Native crop belongs to the workspace. Use figureViewport(ref) for clipping.
  // A missing/unrendered/unsupported ref is null.
  figureGeometry(ref) {
    const found = this.picturePlacement(ref); if (!found) return null;
    const {op,placement} = found, geometry = this.pictureFrame(op);
    if (found.element) {
      // Read the displayed DOM frame as well as the paint contract. WebKit can
      // snap transformed descendants independently of the page plane. Its AABB
      // centre plus pre-transform CSS size preserves that actual placement.
      const view = this.editor.element.contentWindow, rect = found.element.getBoundingClientRect();
      const size = view.getComputedStyle(found.element), planeSize = view.getComputedStyle(found.plane);
      const scale = found.plane.getBoundingClientRect().width/parseFloat(planeSize.width);
      const centre = this.parentPoint(rect.left+rect.width/2,rect.top+rect.height/2);
      const w = parseFloat(size.width)*scale*centre.scaleX, h = parseFloat(size.height)*scale*centre.scaleY;
      return {...geometry,x:centre.x-w/2,y:centre.y-h/2,w,h};
    }
    const point = this.parentPoint(placement.x+geometry.x*placement.scale,placement.y+geometry.y*placement.scale);
    return {...geometry,x:point.x,y:point.y,w:geometry.w*placement.scale*point.scaleX,h:geometry.h*placement.scale*point.scaleY};
  }

  paintClip(op) {
    // Studio's flow-image DOM wrapper clips to bbox ∩ ancestor clip even when
    // rotated; a bare ancestor clip would admit invisible rotated corners.
    return op.clip && op.flow ? intersect(op.clip,op.bbox) : op.clip;
  }

  // Parent viewport CSS pixels for an OUTER, untransformed overflow:hidden
  // overlay. Without a ref: native scroll viewport (excludes toolbar/scrollbars).
  // With a ref: also intersect its rendered page and native table/body clips.
  figureViewport(ref = null) {
    try {
      const container = this.input?.container;
      if (!container?.getClientRects().length) return null;
      const rect = container.getBoundingClientRect(), point = this.parentPoint(rect.left+container.clientLeft,rect.top+container.clientTop);
      let bounds = {x:point.x,y:point.y,width:container.clientWidth*point.scaleX,height:container.clientHeight*point.scaleY};
      const frame = this.editor.element, origin = this.parentPoint(0,0);
      bounds = intersect(bounds,{x:origin.x,y:origin.y,width:frame.clientWidth*origin.scaleX,height:frame.clientHeight*origin.scaleY});
      if (ref) {
        const found = this.picturePlacement(ref); if (!found) return null;
        const {op,placement} = found, page = this.parentPoint(placement.x,placement.y);
        bounds = intersect(bounds,{x:page.x,y:page.y,width:placement.w*page.scaleX,height:placement.h*page.scaleY});
        const clip = this.paintClip(op);
        if (clip) {
          const wrapper = found.element?.parentElement;
          if (wrapper && wrapper !== found.plane) {
            const rect = wrapper.getBoundingClientRect(), start = this.parentPoint(rect.left,rect.top);
            bounds = intersect(bounds,{x:start.x,y:start.y,width:rect.width*start.scaleX,height:rect.height*start.scaleY});
          } else {
            const start = this.parentPoint(placement.x+clip.x*placement.scale,placement.y+clip.y*placement.scale);
            bounds = intersect(bounds,{x:start.x,y:start.y,width:clip.width*placement.scale*start.scaleX,height:clip.height*placement.scale*start.scaleY});
          }
        }
      }
      return {x:bounds.x,y:bounds.y,w:bounds.width,h:bounds.height};
    } catch { return null; }
  }

  figureRect(ref) {
    const geometry = this.figureGeometry(ref); if (!geometry) return null;
    const {x,y,w,h,rotation} = geometry;
    // Retain the legacy layout-box contract. Only quarter-turn layout boxes
    // have already exchanged axes; figureGeometry is the CSS frame contract.
    const quarterTurn = (rotation % 180 + 180) % 180 === 90;
    const width = quarterTurn ? h : w, height = quarterTurn ? w : h;
    return {x:x+(w-width)/2,y:y+(h-height)/2,w:width,h:height};
  }

  pictureAtEvent(event) {
    const input = this.input, content = input?.container.querySelector('#scroll-content'), target = event.target;
    if (event.button !== 0 || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY) ||
      !content?.contains(target) || target.closest('button,input,textarea,select,a,[contenteditable="true"],[role="button"],[role="menu"],[role="dialog"],.table-object-layer')) return null;
    try {
      const point = input.pagePointFromClientPoint(event.clientX,event.clientY);
      if (!point) return null;
      const {pageIdx:page,pageX:x,pageY:y} = point, placement = this.pagePlacement(page);
      const info = this.wasm.getPageInfo(page);
      if (!placement || !contains({x:0,y:0,width:info.width,height:info.height},x,y)) return null;
      const containerRect = input.container.getBoundingClientRect();
      if (!contains({x:containerRect.left+input.container.clientLeft,y:containerRect.top+input.container.clientTop,
        width:input.container.clientWidth,height:input.container.clientHeight},event.clientX,event.clientY)) return null;
      const scrollRect = content.getBoundingClientRect(), sx = event.clientX-scrollRect.left, sy = event.clientY-scrollRect.top;
      if (input.pictureObjectRenderer?.getHandleAtPoint(sx,sy) || input.tableObjectRenderer?.getHandleAtPoint(sx,sy)) return null;
      const native = input.findPictureAtClick(page,x,y);
      if (native && native.type !== 'image') return null;
      const parent = this.parentPoint(event.clientX,event.clientY);
      const hits = [];
      for (const control of this.wasm.getPageControlLayout(page).controls || []) {
        if (control.type !== 'image' || control.missing || (control.plane === 1 && !control.headerFooter)) continue;
        const ref = pictureRef(control,page), props = this.properties(ref), op = this.picturePaint(page,control,props);
        if (!op) continue;
        const viewport = this.figureViewport(ref), geometry = this.figureGeometry(ref);
        if (!viewport || !geometry || !contains({x:viewport.x,y:viewport.y,width:viewport.w,height:viewport.h},parent.x,parent.y)) continue;
        const dx = parent.x-geometry.x-geometry.w/2, dy = parent.y-geometry.y-geometry.h/2;
        const angle = geometry.rotation*Math.PI/180, localX = dx*Math.cos(angle)+dy*Math.sin(angle), localY = -dx*Math.sin(angle)+dy*Math.cos(angle);
        if (Math.abs(localX) > geometry.w/2 || Math.abs(localY) > geometry.h/2) continue;
        if (control.wrap === 'behindText' && !native) continue;
        hits.push({control,ref});
      }
      // Use Studio's paint order, not a previous cursor selection or ID.
      hits.sort((a,b) => {
        const plane = (b.control.plane ?? 2)-(a.control.plane ?? 2), z = (b.control.zOrder || 0)-(a.control.zOrder || 0);
        if (plane || z) return plane || z;
        const left = a.control.stableIndex || [], right = b.control.stableIndex || [];
        for (let index=0;index<Math.min(left.length,right.length);index++) if (left[index] !== right[index]) return right[index]-left[index];
        return right.length-left.length;
      });
      return hits[0]?.ref || null;
    } catch { return null; }
  }

  async exportHwpx() { return this.editor.exportHwpx(); }
  async exportHwp() { return this.editor.exportHwp(); }
}
