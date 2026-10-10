import test from 'node:test';
import assert from 'node:assert/strict';
import { AnnotationConflictError, annotationsFor, getAnnotationPage, mergeAnnotationPatch, mergeAnnotationRevision, validateAnnotationPatch } from '../js/rhwp-exam-annotations.js';
import { syncDraftRunsToText, setDraftWholeTextStyle } from '../js/text-run-editing.js';

const label = (id, text = id, extra = {}) => ({id,type:'labeler',p1:{x:0,y:0},p2:{x:12,y:-6},text,labelSize:3.7,...extra});
const page = objects => ({id:'page-a',name:'그림',objects,guides:[{id:'guide',x:1}],layers:[{id:1}],artboard:{w:90,h:60},meta:{number:'3'}});
const source = objects => ({version:'0.17',activePageId:'page-a',pages:[page(objects),{...page([{id:'other-image',type:'image',src:'other'}]),id:'page-b'}],workspace:{selection:'kept'}});
const conflict = error => error instanceof AnnotationConflictError && error.code === 'ANNOTATION_CONFLICT';

test('inline text replacement shares the source editor policy and preserves untouched symbol runs', () => {
  const draft={text:'질량 m 값',fontFamily:'Arial',fontSize:3.7,textRuns:[
    {text:'질량 ',style:{role:'normal',fontFamily:'Arial'}},
    {text:'m',style:{role:'quantity',fontFamily:'Times New Roman',italic:true}},
    {text:' 값',style:{role:'normal',fontFamily:'Arial'}},
  ]};
  syncDraftRunsToText(draft,'질량 m 측정값');
  assert.equal(draft.textRuns.map(run=>run.text).join(''),'질량 m 측정값');
  const symbol=draft.textRuns.find(run=>run.text==='m');
  assert.equal(symbol.style.role,'quantity');assert.equal(symbol.style.fontFamily,'Times New Roman');assert.equal(symbol.style.italic,true);
  setDraftWholeTextStyle(draft,{fontFamily:'Noto Sans KR',fontSize:5,fontWeight:'normal',italic:false});
  assert.equal(draft.textRuns.find(run=>run.text==='m').style.fontFamily,'Times New Roman');
  assert.equal(draft.textRuns.find(run=>run.text==='m').style.italic,true);
  assert.ok(draft.textRuns.every(run=>run.style.fontSize===5));
  assert.ok(draft.textRuns.filter(run=>run.style.role==='normal').every(run=>run.style.fontFamily==='Noto Sans KR'));
});

test('snapshots contain only detached labelers from the selected page with original IDs', () => {
  const input = source([{id:'image',type:'image'},label('a'),{id:'text',type:'text',text:'plain'},label('b')]);
  const labels = annotationsFor(input);
  assert.deepEqual(labels.map(object => object.id),['a','b']);
  assert.equal(getAnnotationPage(input),input.pages[0]);
  labels[0].p1.x = 20;
  assert.equal(input.pages[0].objects[1].p1.x,0);
  assert.notEqual(labels[1],input.pages[0].objects[3]);
  assert.deepEqual(annotationsFor(input.pages[0]),[label('a'),label('b')]);
});

test('missing or ambiguous active pages cannot silently patch another page', () => {
  const input = source([]);
  input.activePageId = 'missing';
  assert.throws(() => annotationsFor(input),/활성 페이지/);
  delete input.activePageId;
  assert.throws(() => getAnnotationPage(input),/활성 페이지/);
  input.pages = [input.pages[0]];
  assert.equal(getAnnotationPage(input),input.pages[0]);
  input.activePageId = 'page-a';input.pages.push(structuredClone(input.pages[0]));
  assert.throws(() => getAnnotationPage(input),/활성 페이지/);
});

test('label edits, creation, deletion and ordering preserve every nonlabel and other source field', () => {
  const background = {id:'image',type:'image',src:'draft-pixels',x:8,cutouts:[{draft:true}]};
  const graph = {id:'graph',type:'funcgraph',draftPoints:[1,4,2]};
  const input = source([background,label('a'),graph,label('b'),{id:'text',type:'text',text:'draft'}]), before = structuredClone(input);
  const baseline = annotationsFor(input), edited = [label('b','수정'),label('c','새 라벨',{elbow:{x:8,y:-3}})];
  const merged = mergeAnnotationPatch(input,baseline,edited);
  assert.deepEqual(annotationsFor(merged),edited);
  assert.deepEqual(merged.pages[0].objects.filter(object => object.type !== 'labeler'),before.pages[0].objects.filter(object => object.type !== 'labeler'));
  assert.deepEqual(merged.pages[1],before.pages[1]);
  for (const key of ['guides','layers','artboard','meta','name','id']) assert.deepEqual(merged.pages[0][key],before.pages[0][key]);
  assert.deepEqual(merged.workspace,input.workspace);
  assert.deepEqual(input,before);
  edited[0].text = 'later';baseline[0].p1.x = 99;
  assert.equal(annotationsFor(merged)[0].text,'수정');
  const empty = mergeAnnotationPatch(input,annotationsFor(input),[]);
  assert.deepEqual(annotationsFor(empty),[]);
  assert.deepEqual(empty.pages[0].objects,[background,graph,{id:'text',type:'text',text:'draft'}]);
});

test('all stale snapshot forms reject atomically, including unrelated label changes', () => {
  for (const mutate of [
    objects => {objects[1].text = 'live';},
    objects => {objects[1].p2.x = 80;},
    objects => objects.push(label('new')),
    objects => objects.splice(1,1),
    objects => objects.reverse(),
  ]) {
    const input = page([{id:'image',type:'image'},label('a'),label('b')]), baseline = annotationsFor(input);
    mutate(input.objects);
    const before = structuredClone(input);
    assert.throws(() => mergeAnnotationPatch(input,baseline,[label('a','inline'),label('b')]),conflict);
    assert.deepEqual(input,before);
  }
});

test('snapshot comparison is independent of property insertion order and serialization of undefined', () => {
  const input = page([label('a','A',{optional:undefined})]);
  const baseline = JSON.parse(JSON.stringify(annotationsFor(input))).map(({p2,p1,text,type,id,...rest}) => ({text,type,p2,id,...rest,p1}));
  assert.deepEqual(annotationsFor(mergeAnnotationPatch(input,baseline,[label('a','B')])),[label('a','B')]);
});

test('patch validation rejects nonlabels, duplicate IDs, malformed geometry and nonserializable data', () => {
  const baseline = [label('a')], circular = label('c');circular.self = circular;
  const invalid = [
    [{id:'image',type:'image'}],
    [label('a'),label('a')],
    [label('', 'empty ID')],
    [label('bad', 'point',{p1:{x:Infinity,y:0}})],
    [label('bad', 'point',{elbow:{x:0,y:NaN}})],
    [label('bad', 'size',{labelSize:0})],
    [label('bad', 'nested',{style:{rotation:NaN}})],
    [label('bad', 'function',{callback:() => {}})],
    [circular],
  ];
  for (const edited of invalid) assert.throws(() => validateAnnotationPatch(baseline,edited));
  assert.equal(validateAnnotationPatch(baseline,[label('a','새 글자')]),true);
});

test('new label IDs cannot take over a nonlabel object and duplicate source IDs cannot be merged', () => {
  const input = page([{id:'image',type:'image',src:'keep'},label('a')]), before = structuredClone(input);
  assert.throws(() => mergeAnnotationPatch(input,annotationsFor(input),[label('image')]),error => conflict(error) && error.ids.includes('image'));
  assert.deepEqual(input,before);
  input.objects.push({id:'image',type:'rect'});
  assert.throws(() => mergeAnnotationPatch(input,annotationsFor(input),[label('a')]),/중복/);
});

test('revision undo and redo preserve background and disjoint annotation drafts by ID', () => {
  const previous = page([label('a','old'),label('b','unchanged')]), next = page([label('a','new'),label('b','unchanged'),label('c','added')]);
  const live = page([{id:'image',type:'image',src:'unapplied-background'},label('a','new'),label('b','unapplied-label'),label('c','added'),label('draft-only')]);
  const original = structuredClone(live), undo = mergeAnnotationRevision(live,next,previous);
  assert.deepEqual(annotationsFor(undo),[label('a','old'),label('b','unapplied-label'),label('draft-only')]);
  assert.deepEqual(undo.objects[0],live.objects[0]);
  assert.deepEqual(mergeAnnotationRevision(undo,previous,next),original);
  assert.deepEqual(live,original);
});

test('revision merging accepts an already published patch but rejects conflicting edits and ID reuse', () => {
  const previous = [label('a','old')], next = [label('a','new'),label('b')];
  assert.deepEqual(annotationsFor(mergeAnnotationRevision(page(next),previous,next)),next);
  const live = page([label('a','third')]), original = structuredClone(live);
  assert.throws(() => mergeAnnotationRevision(live,previous,next),error => conflict(error) && error.ids.includes('a'));
  assert.deepEqual(live,original);
  assert.throws(() => mergeAnnotationRevision(page([label('a','old'),{id:'b',type:'image'}]),previous,next),conflict);
});

test('revision insertion and explicit z-order anchor committed labels while keeping draft label data', () => {
  const previous=[label('a'),label('b')], next=[label('new-first'),label('a'),label('new-middle'),label('b'),label('new-last')];
  const live=page([label('a'),label('draft'),label('b','unapplied')]);
  const merged=mergeAnnotationRevision(live,previous,next);
  assert.deepEqual(annotationsFor(merged),[label('new-first'),label('a'),label('new-middle'),label('draft'),label('b','unapplied'),label('new-last')]);
  const reordered=mergeAnnotationRevision(live,previous,[label('b'),label('a')]);
  assert.deepEqual(annotationsFor(reordered),[label('b','unapplied'),label('draft'),label('a')]);
  assert.deepEqual(mergeAnnotationRevision(reordered,[label('b'),label('a')],previous),live);
  assert.throws(() => mergeAnnotationRevision(page([label('b'),label('a'),label('c')]),[label('a'),label('b'),label('c')],[label('c'),label('b'),label('a')]),conflict);
});
