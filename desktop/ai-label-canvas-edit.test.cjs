const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('a selected leader endpoint over its glyph edits on release; endpoint drags and off-glyph handles remain transforms', async () => {
  const { isLabelerTextPoint } = await import('../js/pick.js?v=1.7.0-four-session-integration');
  const source = slice('../js/text-editor.js', 'let _editClickId =', '\n/* ----- F2 / Enter');
  for (const [handle, point, dragged, locked, expected] of [
    ['p2', { x: 0, y: 0 }, false, false, 1], ['p2', { x: 0, y: 0 }, true, false, 0],
    ['p1', { x: -10, y: -10 }, false, false, 0], ['resize', { x: 0, y: 0 }, false, false, 0],
    ['p2', { x: 0, y: 0 }, false, true, 0],
  ]) {
    const object = { id: 'leader', type: 'labeler', text: 'AB', labelSize: 3.7, locked,
      p1: { x: -10, y: -10 }, p2: { x: 0, y: 0 } };
    const data = { objects: [object], selectedIds: [object.id], activeTool: 'V' };
    const svgEvents = {}, windowEvents = {}, pending = new Map(); let opened = 0, timerId = 0;
    const target = { dataset: { handle, id: object.id }, closest: () => target,
      addEventListener() {}, removeEventListener() {} };
    const context = vm.createContext({ _textEditor: null, _pendingInlineOpenTimer: null, _lastInlineClick: null,
      _state: { get: () => data, update: fn => fn(data) }, isSpaceHeld: () => false,
      _svg: { addEventListener: (name, fn) => { svgEvents[name] = fn; } },
      window: { addEventListener: (name, fn) => { windowEvents[name] = fn; } },
      screenToWorld: (_svg, _view, x, y) => ({ x, y }), isLabelerTextPoint,
      pickSelectableObjectAtPoint: () => object.id, canInlineLabel: o => o?.type === 'labeler' && !o.locked,
      openLabelerTextEditor: id => { assert.equal(id, object.id); opened += 1; },
      startEditingTextObject: () => assert.fail('A leader must use its label editor'),
      setTimeout: fn => { pending.set(++timerId, fn); return timerId; }, clearTimeout: id => pending.delete(id) });
    vm.runInContext(source + '\nsetupTextClickToEdit();', context);
    const event = { button: 0, detail: 1, target, clientX: point.x, clientY: point.y, preventDefault() {} };
    svgEvents.mousedown(event);
    if (dragged) windowEvents.mousemove({ clientX: point.x + 10, clientY: point.y });
    windowEvents.pointerup(event);
    for (const callback of pending.values()) callback();
    assert.equal(opened, expected, `${handle}, dragged=${dragged}, locked=${locked}`);
    assert.deepEqual(data.objects, [object]);
  }
});
test('semantic label no-op and size-only edits retain imported formula mode and native source', async () => {
  const typography = await import('../js/ai-label-typography.js?v=1.7.0-four-session-integration');
  const { resolveTextFontStyle } = await import('../js/state.js?v=1.7.0-four-session-integration');
  const detection = slice('../js/text-editor.js', 'function looksLikeFormula(', '\nfunction _textValue(');
  const contentMode = slice('../js/text-editor.js', 'function _labelAwareContentMode(', '\nfunction _insertIntoUnifiedText(');
  const commit = slice('../js/text-editor.js', 'function _commitSemanticLabel(', '\nfunction _commitText(');
  for (const [type, raw, mode] of [['formula', '3m', 'formula'], ['formula', 'd', 'formula'],
    ['formula', 'B(g)', 'formula'], ['labeler', 'A(s)', 'formula'], ['text', 'm_B', 'plain']]) {
    const object = { id: 'label', type, text: raw, contentMode: mode, labelTypographyVersion: 1,
      source: raw, rawSource: raw, fontFamily: 'Arial', fontSize: 3.7, labelSize: 3.7,
      fontWeight: 'normal', italic: false, formulaUpright: true, x: 2, y: 3, w: 4, h: 5,
      aiTaskId: 'owner', aiCandidateId: 'revision', aiParentImageId: 'background' };
    const draft = { ...structuredClone(object), editingId: object.id, editingType: type,
      labelSourceAtOpen: raw, labelContentModeAtOpen: mode, labelFontFamilyAtOpen: 'Arial' };
    const data = { objects: [object], undoStack: [], redoStack: [{ retained: true }] };
    const before = structuredClone(data);
    const context = vm.createContext({ ...typography, resolveTextFontStyle,
      structuredClone, DEFAULT_TEXT_FONT: 'Arial', _textPlainOnly: false, _textFormulaMode: false });
    vm.runInContext(detection + '\n' + contentMode + '\n' + commit, context);
    assert.equal(context._labelAwareContentMode(raw, draft), mode);
    assert.equal(context._commitSemanticLabel(data, draft, raw, mode === 'formula'), true);
    assert.deepEqual(data, before, `${type} ${raw}: unchanged source preserves the complete object and both histories`);
    draft.fontSize = 4.5;
    const resizedMode = context._labelAwareContentMode(raw, draft);
    context._commitSemanticLabel(data, draft, raw, resizedMode === 'formula');
    assert.equal(object.type, type);
    assert.equal(object.contentMode, mode);
    if (mode === 'formula') { assert.equal(object.source, raw); assert.equal(object.rawSource, raw); }
    assert.equal(type === 'labeler' ? object.labelSize : object.fontSize, 4.5);
    assert.deepEqual(data.undoStack, [before.objects]);
    assert.equal(data.redoStack.length, 0);
    assert.equal(context._labelAwareContentMode('검수한 새 글자', draft), 'plain', 'Actual source changes still recalculate the content mode');
    assert.equal(context._labelAwareContentMode('x^{2}', draft), 'formula', 'Actual formula input still promotes the content mode');
  }
});
test('the full inline commit preserves stored semantic modes and only promotes actual new formula input', async () => {
  const typography = await import('../js/ai-label-typography.js?v=1.7.0-four-session-integration');
  const state = await import('../js/state.js?v=1.7.0-four-session-integration');
  const code = [
    slice('../js/text-editor.js', 'function normalizeFormulaSource(', '\nfunction _cacheTextSelection('),
    slice('../js/text-editor.js', 'function _sliceRuns(', '\nfunction _setDraftWholeTextStyle('),
    slice('../js/text-editor.js', 'function _syncDraftFromUnifiedEditor(', '\nfunction _insertIntoUnifiedText('),
    slice('../js/text-editor.js', 'function _commitSemanticLabel(', '\nexport function cancelActiveTextEditor('),
  ].join('\n');
  for (const [type, original, mode, next, resized] of [
    ['text', 'm_B', 'plain', 'm_B', false],
    ['text', 'm_B', 'plain', 'm_B', true],
    ['formula', '3m', 'formula', '3m', false],
    ['labeler', 'A(s)', 'formula', 'A(s)', false],
    ['text', 'm_B', 'plain', 'x^{2}', false],
    ['formula', '3m', 'formula', '새 글자', false],
  ]) {
    const object = { id: 'label', type, text: original, contentMode: mode, labelTypographyVersion: 1,
      fontFamily: 'Arial', fontSize: 3.7, labelSize: 3.7, fontWeight: 'normal', italic: false,
      formulaUpright: true, x: 2, y: 3, w: 4, h: 5,
      aiTaskId: 'owner', aiCandidateId: 'revision', aiParentImageId: 'background' };
    if (mode === 'formula') Object.assign(object, { source: original, rawSource: original });
    const before = structuredClone(object);
    const draft = { ...structuredClone(object), editingId: object.id, editingType: type,
      labelSourceAtOpen: original, labelContentModeAtOpen: mode, labelFontFamilyAtOpen: 'Arial' };
    if (resized) draft.fontSize = 4.5;
    const redo = [{ retained: true }];
    const data = { objects: [object], draftText: draft, activeTool: 'V', undoStack: [], redoStack: structuredClone(redo) };
    const context = vm.createContext({ ...typography, ...state, structuredClone,
      _textEditor: { value: next }, _textPlainOnly: false, _textFormulaMode: false,
      _state: { get: () => data, update: fn => fn(data) }, _refreshUnifiedPreview() {},
      _removeTextEditor: () => { context._textEditor = null; } });
    vm.runInContext(code, context);
    context._commitText();
    assert.equal(data.draftText, null);
    assert.equal(context._textEditor, null);
    if (next === original && !resized) {
      assert.deepEqual(data.objects, [before], `${original}: the actual commit must preserve the complete object`);
      assert.deepEqual(data.undoStack, []);
      assert.deepEqual(data.redoStack, redo);
    } else {
      assert.deepEqual(data.undoStack, [[before]], 'one complete undo entry for an actual edit');
      assert.deepEqual(Array.from(data.redoStack), []);
      assert.equal(object.contentMode, next === original ? mode : next === 'x^{2}' ? 'formula' : 'plain');
      assert.equal(object.type, next === original ? type : next === 'x^{2}' ? 'formula' : 'text');
      assert.equal(object.text, next);
      if (resized) assert.equal(object.fontSize, 4.5);
      for (const key of ['aiTaskId', 'aiCandidateId', 'aiParentImageId']) assert.equal(object[key], before[key]);
      if (object.contentMode === 'formula') {
        assert.equal(object.source, next);
        assert.equal(object.rawSource, next);
      } else {
        assert.equal(Object.hasOwn(object, 'source'), false);
        assert.equal(Object.hasOwn(object, 'rawSource'), false);
      }
    }
  }
});
function slice(file, start, end) {
  const source = fs.readFileSync(require.resolve(file), 'utf8');
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}
test('selection-locked AI artwork exports even when tracing references are excluded', () => {
  const code = slice('../js/svg-export.js', 'function isReferenceImage(', '\n/* ----- trigger');
  const ctx = vm.createContext({}); vm.runInContext(code, ctx);
  const s = { layers: [{ id: 1, visible: true }] };
  const image = { type: 'image', layerId: 1, imageSelectionLocked: true, aiLabelEditingBackground: true };
  assert.equal(ctx.isHidden(s, image, { includeReferenceImages: false }), false);
  assert.equal(ctx.isHidden(s, { ...image, aiLabelEditingBackground: false }, { includeReferenceImages: false }), true);
  assert.equal(ctx.isHidden(s, image, { excludeAllImages: true }), true);
  assert.equal(ctx.isHidden({ layers: [{ id: 1, visible: false }] }, image, {}), true);
});
test('AI label insertion locks only the image, selects labels and retains export metadata through JSON', () => {
  const code = slice('../js/image-paste.js', 'function insertImageObject(', '\n/* 외부 모듈용');
  for (const enabled of [true, false]) {
    const data = { artboard: { w: 90, h: 60 }, viewBox: { x:0,y:0,w:90,h:60 }, objects:[], undoStack:[], redoStack:[], activeLayerId:1 };
    const ctx = vm.createContext({ structuredClone, _idCounter:0, MAX_UNDO:60,
      fitToArtboard: () => ({ w:70,h:50 }), getLastMouseWorld:()=>null,
      applyLabelPlacementReview:()=>{}, autoLabelsForImage:()=>enabled ? [{id:'label', type:'text',text:'광원'}] : [], rebuildGroups:()=>{} });
    vm.runInContext(code,ctx);
    ctx.insertImageObject({ get:()=>data, update:fn=>fn(data) },'data:image/png;base64,test',{w:70,h:50},
      enabled ? { editableLabelPlan:{ frozen:true }, centerArtboard:true } : {});
    const saved=JSON.parse(JSON.stringify(data));
    assert.equal(saved.objects[0].imageSelectionLocked,enabled);
    assert.equal(saved.objects[0].exportable,true);
    assert.equal(saved.objects[0].aiLabelEditingBackground,enabled ? true : undefined);
    assert.deepEqual(saved.selectedIds,enabled ? ['label'] : [saved.objects[0].id]);
    assert.equal(saved.undoStack.length,1);
  }
});
test('inline Enter/Escape cannot finalize an active IME composition; Shift+Enter preserves multiline input', () => {
  const code = slice('../js/text-editor.js','function _openTextEditor(', '\n// True when an element');
  const events={}; let committed=0, cancelled=0, detailed=0;
  const ta={style:{},className:'',value:'',setAttribute(){},focus(){},setSelectionRange(){},addEventListener:(name,fn)=>{events[name]=fn;}};
  const wrap={getBoundingClientRect:()=>({left:0,top:0}),appendChild(){}};
  const st={draftText:null};
  const ctx=vm.createContext({ _state:{get:()=>st, update:fn=>fn(st)},_svg:{closest:()=>wrap},
    document:{createElement:()=>ta}, _openUnifiedTextEditor:()=>detailed++, getRenderScale:()=>1,
    _syncEditorFont(){}, _syncEditorWidth(){}, _commitText:()=>committed++, _cancelText:()=>cancelled++,
    _elInTextUI:()=>false, _rightMouseDown:false, setTimeout:()=>{}, _lastInlineClick:null, EDIT_CLICK_TOL_PX:4 });
  vm.runInContext(code,ctx);
  ctx._openTextEditor({aiInlinePlain:true,x:0,y:0,fontSize:3},0,0,'광원');
  const key=(key,extras={})=>events.keydown({key,preventDefault(){},stopPropagation(){},...extras});
  key('Enter',{isComposing:true}); key('Escape',{keyCode:229}); key('Enter',{shiftKey:true});
  assert.equal(committed,0); assert.equal(cancelled,0);
  key('Enter'); assert.equal(committed,1);
  key('Escape'); assert.equal(cancelled,1);
  ctx._openTextEditor({aiInlinePlain:false},0,0,'x^2'); assert.equal(detailed,1);
});
test('deferred clicked-caret initialization preserves subsequent native selection and input', () => {
  const create=()=>{
    const frames=[],events={};const st={draftText:null};
    const ta={style:{},className:'',value:'',selectionStart:0,selectionEnd:0,setAttribute(){},focus(){},
      setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;},
      addEventListener:(name,fn)=>{events[name]=fn;}};
    const wrap={getBoundingClientRect:()=>({left:0,top:0}),appendChild(){}};
    const ctx=vm.createContext({_state:{get:()=>st,update:fn=>fn(st)},_svg:{closest:()=>wrap},
      document:{createElement:()=>ta},getRenderScale:()=>1,_syncEditorFont(){},_syncEditorWidth(){},
      _caretIndexFromPoint:()=>0,requestAnimationFrame:fn=>frames.push(fn),setTimeout(){},
      _lastInlineClick:null,EDIT_CLICK_TOL_PX:4});
    vm.runInContext(slice('../js/text-editor.js','function _openTextEditor(', '\n// True when an element'),ctx);
    ctx._openTextEditor({inlineLabel:true,x:0,y:0,fontSize:3,editingId:'label'},0,0,'m_B',{x:0,y:0});
    return {ta,events,flush:()=>frames.splice(0).forEach(fn=>fn())};
  };
  const untouched=create();untouched.flush();assert.equal(untouched.ta.selectionStart,0,'untouched text uses the clicked caret');
  const selected=create();selected.ta.setSelectionRange(0,3);selected.flush();
  assert.deepEqual([selected.ta.selectionStart,selected.ta.selectionEnd],[0,3],'native select-all must retain the replacement range');
  const typed=create();typed.ta.value='m_C';typed.ta.setSelectionRange(3,3);typed.events.input();typed.flush();
  assert.deepEqual([typed.ta.selectionStart,typed.ta.selectionEnd],[3,3],'typed content keeps its native caret');
});
function editClickHarness(object) {
  const emitter = () => {
    const listeners = new Map();
    return {
      addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name,new Set()); listeners.get(name).add(fn); },
      removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
      emit(name, event) { for (const fn of [...(listeners.get(name)||[])]) fn(event); },
    };
  };
  const svg=emitter(), win=emitter(), target=emitter(), tasks=new Map(), edited=[];
  let captures=0, page=1, timerId=0;
  svg.setPointerCapture=()=>captures++;
  target.closest=()=>null;
  const data={activeTool:'V',objects:[object],selectedIds:[]};
  const ctx=vm.createContext({ _svg:svg, window:win, _textEditor:null,
    _editClickId:null,_editClickStart:null,EDIT_CLICK_TOL_PX:4, _lastInlineClick:null,
    _state:{get:()=>data,update:fn=>fn(data),capturePageContext:()=>page,isPageContextCurrent:p=>p===page},
    isSpaceHeld:()=>false,screenToWorld:(_svg,_vb,x,y)=>({x,y}),
    pickSelectableObjectAtPoint:()=>object.id,isLabelerTextPoint:(_obj,p)=>p.x>0,
    startEditingTextObject:id=>edited.push(id),openLabelerTextEditor:id=>edited.push(id),
    setTimeout:fn=>{const id=++timerId;tasks.set(id,fn);return id;},clearTimeout:id=>tasks.delete(id),
    _commitText(){},_closeCtxMenu(){},_textWidthMirror:null,_dragMoveHandler:null,_dragUpHandler:null,_textBox:null });
  vm.runInContext(slice('../js/text-editor.js','function canInlineLabel(', '\nexport function openLabelerTextEditor(')
    + slice('../js/text-editor.js','function setupTextClickToEdit()', '\n/* ----- F2 / Enter')
    + slice('../js/text-editor.js','function _removeTextEditor()', '\n// ESC / tool-switch'),ctx);
  ctx.setupTextClickToEdit();
  const event={button:0,pointerType:'mouse',pointerId:1,clientX:10,clientY:10,detail:1,target,preventDefault(){}};
  return {svg,win,target,data,edited,tasks,event,get captures(){return captures;},
    press(){svg.emit('pointerdown',event);svg.emit('mousedown',event);data.selectedIds=[object.id];},
    flush(){for(const [id,fn] of [...tasks])if(tasks.delete(id))fn();},
    closeEditor(){ctx._removeTextEditor();},switchPage(){page++;}};
}
const plainAiLabel={id:'label',type:'text',text:'B',aiAutoLabel:true,aiParentImageId:'diagram'};
test('AI label first click selects and its next click edits once after pointerup', () => {
  const h=editClickHarness(plainAiLabel);h.press();assert.equal(h.captures,1);
  h.target.emit('pointerup',h.event);h.win.emit('mouseup',h.event);
  h.flush();assert.deepEqual(h.edited,[],'the initial click only selects');
  h.press();h.target.emit('pointerup',h.event);h.win.emit('mouseup',h.event);
  assert.deepEqual(h.edited,[]);h.flush();assert.deepEqual(h.edited,['label']);
});
test('AI label drag/cancel/page change does not open a stale editor', () => {
  for (const action of ['drag','cancel','page']) {
    const h=editClickHarness(plainAiLabel);h.data.selectedIds=['label'];h.press();
    if(action==='drag')h.win.emit('mousemove',{...h.event,clientX:20});
    if(action==='cancel')h.win.emit('pointercancel',h.event);
    h.win.emit('pointerup',h.event);
    if(action==='page')h.switchPage();
    h.flush();assert.deepEqual(h.edited,[]);
  }
});
test('a second press, pointer cancellation or editor removal cancels the queued first-click editor', () => {
  for (const action of ['second press','pointer cancel','editor removal']) {
    const h=editClickHarness(plainAiLabel);h.data.selectedIds=['label'];h.press();h.win.emit('pointerup',h.event);
    h.win.emit('mouseup',h.event);
    assert.equal(h.tasks.size,1,'compatibility mouseup must preserve the pointerup task');
    if(action==='second press')h.svg.emit('mousedown',{...h.event,detail:2,clientX:-1});
    if(action==='pointer cancel')h.win.emit('pointercancel',h.event);
    if(action==='editor removal')h.closeEditor();
    assert.equal(h.tasks.size,0,action+' must remove the pending timer');
    h.flush();assert.deepEqual(h.edited,[],action+' must not revive inline editing');
  }
});
test('leader strokes and ordinary text retain their existing edit gestures', () => {
  for(const obj of [{id:'ordinary',type:'text'}, {...plainAiLabel,type:'labeler'}]) {
    const h=editClickHarness(obj);if(obj.type==='labeler')h.event.clientX=-1;
    h.press();h.win.emit('pointerup',h.event);h.flush();assert.deepEqual(h.edited,[]);
    assert.equal(h.captures,0);
  }
});
test('replacing AI artwork also locks its image and leaves editable labels selected', async () => {
  const prepare=slice('../js/image-paste.js','export async function prepareImageCandidateRevision(', '\nfunction insertImageObject(').replace('export async function','async function');
  const code=prepare+'\n'+slice('../js/image-paste.js','export async function insertImageFromSrc(', '\nexport function initImagePaste(').replace('export async function','async function');
  const image={id:'image',type:'image',src:'old',aiTaskId:'task',aiCandidateId:'old',layerId:1};
  const data={objects:[image],selectedIds:['image'],undoStack:[],redoStack:[],activeLayerId:1};
  const ctx=vm.createContext({structuredClone,MAX_UNDO:60,targetStateFingerprint:JSON.stringify,
    loadImageSize:async()=>({w:100,h:100}),checkLabelCandidateBytes:async()=>{},prepareEditableLabelFonts:async()=>{},
    applyLabelPlacementReview(){},autoLabelsForImage:()=>[{id:'label',type:'text'}],rebuildGroups(){} });
  vm.runInContext(code,ctx);
  await ctx.insertImageFromSrc({get:()=>data,update:fn=>fn(data)},'new',
    {replaceId:'image',aiTaskId:'task',aiCandidateId:'new',editableLabelPlan:{frozen:true,labels:[{text:'B'}]}});
  assert.equal(image.imageSelectionLocked,true);assert.equal(image.aiLabelEditingBackground,true);
  assert.deepEqual(Array.from(data.selectedIds),['label']);assert.equal(data.undoStack.length,1);
});

test('selected manual labelers and AI formula labels enter inline editing on a no-drag click', () => {
  for (const obj of [{id:'manual',type:'labeler',text:'온도'}, {...plainAiLabel,type:'formula',contentMode:'formula'}]) {
    const h=editClickHarness(obj);h.data.selectedIds=[obj.id];h.press();h.win.emit('pointerup',h.event);h.flush();
    assert.deepEqual(h.edited,[obj.id]);assert.equal(h.captures,1);
  }
});
test('locked and vertical labelers do not enter inline editing', () => {
  for (const obj of [{id:'locked',type:'labeler',locked:true},{id:'vertical',type:'labeler',textOrient:'vertical'}]) {
    const h=editClickHarness(obj);h.press();h.win.emit('pointerup',h.event);h.flush();
    assert.deepEqual(h.edited,[]);assert.equal(h.captures,0);
  }
});
