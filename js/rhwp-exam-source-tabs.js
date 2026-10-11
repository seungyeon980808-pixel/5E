import { normalizeExamFigure, copyExamData } from './rhwp-exam-links.js?v=1.7.0-four-session-integration';
import { validateFigureRender } from './editable-png.js?v=1.7.0-four-session-integration';
import { restorePageRuntime, savePageRuntime } from './page-history.js?v=1.7.0-four-session-integration';
import { AnnotationConflictError, annotationsFor, annotationSnapshotsEqual, getAnnotationPage, mergeAnnotationPatch, mergeAnnotationRevision } from './rhwp-exam-annotations.js?v=1.7.0-four-session-integration';

function sameData(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item,index) => sameData(item,b[index]));
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keys = Object.keys(a).filter(key => a[key] !== undefined), other = Object.keys(b).filter(key => b[key] !== undefined);
  return keys.length === other.length && keys.every(key => Object.hasOwn(b,key) && sameData(a[key],b[key]));
}

export function createExamDraftChecker(prepareLoadedProject) {
  const canonicalPages = new WeakMap();
  return (current, meta, figure) => {
    let committed = canonicalPages.get(figure.source);
    if (!committed) {
      // Older embedded sources omit defaults added when opening a drawing tab.
      // Compare the same loaded representation without changing either source.
      committed = prepareLoadedProject(copyExamData(figure.source)).active;
      canonicalPages.set(figure.source, committed);
    }
    return !!(meta?.examDraftRender && !sameData(meta.examDraftRender, figure.render))
      || !sameData(current.objects, committed.objects)
      || !sameData(current.artboard, committed.artboard);
  };
}

export function createExamSourceTabs(state, services) {
  const ai = () => services.getAiPanel?.();
  const pageForLink = link => state.get().pages.find(page => page.meta?.examLink?.tabId === link.tabId && page.meta.examLink.assetId === link.assetId);

  // Active-page objects can diverge from page.objects after undo/deletion.
  const livePage = page => ({...page,objects:state.get().activePageId === page.id ? state.get().objects : page.objects});

  function revisionMetadata(page, figure) {
    const meta = {...page.meta,examRevisionId:figure.id,examRender:copyExamData(figure.render || null),
      examEditScope:figure.editScope || 'source',examAnnotationBaseline:annotationsFor(figure.source)};
    // An acknowledged crop stops being a draft. A newer, unapplied crop stays.
    if (meta.examDraftRender && sameData({...meta.examDraftRender,layoutDraft:undefined},{...figure.render,layoutDraft:undefined})) delete meta.examDraftRender;
    return meta;
  }

  function rememberRevision(page, figure) {
    page.meta = revisionMetadata(page,figure);
  }

  function newLinkedPage(figure, source = figure.source) {
    const page = services.prepareLoadedProject(copyExamData(source)).active;
    if (state.get().pages.some(existing => existing.id === page.id)) page.id = `exam_${crypto.randomUUID()}`;
    page.meta = {...page.meta,examLink:copyExamData(figure.link)};
    rememberRevision(page,figure);
    return page;
  }

  // Keep non-label object identities as well as their data. Page identity also
  // owns the WeakMap-backed per-page history and must never be replaced.
  function installLabels(value, page, merged) {
    const original = livePage(page), others = new Map(original.objects.filter(object => object.type !== 'labeler').map(object => [object.id,object]));
    page.objects = merged.objects.map(object => object.type === 'labeler' ? object : others.get(object.id));
    if (value.activePageId !== page.id) return;
    value.objects = page.objects;
    value.selectedIds = (value.selectedIds || []).filter(id => value.objects.some(object => object.id === id));
    if (Array.isArray(value.groups)) {
      const groups = new Map();
      for (const object of value.objects) if (object.groupId) {
        if (!groups.has(object.groupId)) groups.set(object.groupId,[]);
        groups.get(object.groupId).push(object.id);
      }
      value.groups = [...groups].map(([id,memberIds]) => ({id,memberIds}));
    }
  }

  function recordLabelHistory(value, page) {
    const current = livePage(page);
    const runtime = value.activePageId === page.id ? value : {...current,pages:value.pages,activePageId:page.id};
    if (runtime !== value) restorePageRuntime(runtime,page);
    runtime.undoStack.push(copyExamData(current.objects));
    // A new gesture invalidates redo, as in normal canvas editing, while every
    // earlier undo entry and the page runtime remain available.
    runtime.redoStack.length = 0;
    savePageRuntime(runtime,page);
  }

  function revisionMerge(page, figure) {
    if (!page.meta?.examRevisionId || page.meta.examRevisionId === figure.id) return null;
    const current = annotationsFor(livePage(page)), next = annotationsFor(figure.source);
    if (annotationSnapshotsEqual(current,next)) return null; // Patch already applied; acknowledge it.
    const baseline = page.meta.examAnnotationBaseline;
    if (!Array.isArray(baseline)) throw new AnnotationConflictError(current.map(label => label.id));
    return getAnnotationPage(mergeAnnotationRevision(livePage(page),baseline,next));
  }

  // These entry points deliberately do not switch tabs, restore AI state, or
  // reveal the primary window; the RHWP inline editor can remain focused.
  function markAnnotationRevision(raw) {
    const figure = normalizeExamFigure(raw);
    annotationsFor(figure.source);
    let page = pageForLink(figure.link);
    const merged = page ? revisionMerge(page,figure) : null;
    if (!page) {
      page = newLinkedPage(figure);
      state.update(value => value.pages.push(page));
    } else {
      const meta = revisionMetadata(page,figure);
      // No-op reads must not notify the primary workspace: its notification
      // prompts the auxiliary editor to read again, otherwise forming a loop.
      if (merged || !sameData(page.meta,meta)) state.update(value => {
        if (merged) installLabels(value,page,merged);
        page.meta = meta;
      });
    }
    return {labels:annotationsFor(livePage(page))};
  }

  function readAnnotations(raw) {
    const figure = normalizeExamFigure(raw);
    markAnnotationRevision(figure);
    const page = pageForLink(figure.link), baseline = annotationsFor(livePage(page));
    const render = page.meta.examDraftRender || page.meta.examRender;
    return {baseline,draft:copyExamData(baseline),...(render ? {render:copyExamData(render)} : {})};
  }

  function patchAnnotations(raw, baseline, edited, options = {}) {
    const figure = normalizeExamFigure(raw), page = pageForLink(figure.link);
    const render = options.render;
    if (render !== undefined) validateFigureRender(render);
    // Validate and check the complete patch before changing either labels or crop.
    const merged = mergeAnnotationPatch(page ? livePage(page) : figure.source,baseline,edited);
    const target = page || newLinkedPage(figure);
    const labelsChanged = !annotationSnapshotsEqual(baseline,edited);
    state.update(value => {
      if (!page) value.pages.push(target);
      if (labelsChanged) {
        recordLabelHistory(value,target);
        installLabels(value,target,getAnnotationPage(merged));
      }
      if (render !== undefined) target.meta.examDraftRender = copyExamData(render);
    });
    return {labels:annotationsFor(livePage(target))};
  }

  async function capture(aiContext = null) {
    const current = state.get(), selected = current.objects.filter(object => current.selectedIds.includes(object.id));
    const pageId = current.activePageId;
    const taskId = selected.find(object => object.aiTaskId)?.aiTaskId;
    if (!aiContext && taskId) aiContext = await ai()?.captureExamTask(taskId);
    if (state.get().activePageId !== pageId) throw new Error('작업 탭이 바뀌었습니다. 보내기를 다시 눌러주세요.');
    const existingLink = current.pages.find(page => page.id === current.activePageId)?.meta?.examLink;
    const link = aiContext?.snapshot.tabs[0].examLink || existingLink || {tabId:crypto.randomUUID(),assetId:crypto.randomUUID()};
    if (existingLink && (existingLink.tabId !== link.tabId || existingLink.assetId !== link.assetId)) throw new Error('이 5E 탭은 다른 그림에 연결되어 있습니다. AI 작업의 보내기를 사용해 독립된 탭에서 보내주세요.');
    const linkedPage = pageForLink(link);
    if (linkedPage && linkedPage.id !== current.activePageId) throw new Error('이 이미지 작업에 연결된 5E 탭에서 보내주세요. 별도 그림은 독립된 작업 탭으로 만들어주세요.');
    state.update(value => {
      const page = value.pages.find(page => page.id === value.activePageId);
      page.meta = {...page.meta,examLink:copyExamData(link)};
    });
    const source = copyExamData(services.serialize(state.get()));
    source.pages = source.pages.filter(page => page.id === source.activePageId);
    const value = state.get();
    return {source,link:copyExamData(link),name:source.pages[0].name,
      context:{version:1,pageId:source.activePageId,viewBox:copyExamData(value.viewBox),selectedIds:[...value.selectedIds],ai:aiContext}};
  }

  async function prepareAi(taskId, scope) {
    const context = await ai()?.captureExamTask(taskId, scope);
    if (!context) throw new Error('이미지 작업 탭을 찾지 못했습니다.');
    const tab = context.snapshot.tabs[0], candidate = tab.generated?.find(item => item.id === tab.selectedCandidateId);
    if (!candidate) throw new Error('시험지에 보낼 생성 이미지를 선택해주세요.');
    services.materializeCandidate.validate(candidate);
    ai()?.close();
    let page = pageForLink(tab.examLink);
    if (!page) {
      page = {id:`exam_${crypto.randomUUID()}`,name:(tab.title || '생성 이미지').slice(0,40),objects:[],guides:[],layers:copyExamData(state.get().layers),artboard:{w:100,h:100},meta:{number:'',points:'',examLink:copyExamData(tab.examLink)}};
      state.update(value => value.pages.push(page));
    }
    services.switchPage(state,page.id);
    const image = state.get().objects.find(object => ['image','coordplane'].includes(object.type) && object.aiTaskId === taskId && !object.editableAssetRegionId);
    if (!image || image.aiCandidateId !== candidate.id) {
      if (image) state.update(value => {value.selectedIds = [image.id];});
      await services.materializeCandidate(candidate,{taskId,...(image ? {replaceId:image.id} : {})});
    }
    services.centerView?.();
    return capture(context);
  }

  async function activate(raw) {
    const figure = normalizeExamFigure(raw);
    let page = pageForLink(figure.link), switching = page?.id !== state.get().activePageId;
    const annotationTransition = page && (figure.editScope === 'annotations' || page.meta?.examEditScope === 'annotations');
    const restoreCandidate = !page || !!(!annotationTransition && page.meta.examRevisionId && page.meta.examRevisionId !== figure.id);
    if (!page) {
      const prepared = services.prepareLoadedProject(copyExamData(figure.source));
      page = prepared.active;
      if (state.get().pages.some(existing => existing.id === page.id)) page.id = `exam_${crypto.randomUUID()}`;
      page.meta = {...page.meta,examLink:copyExamData(figure.link),examRevisionId:figure.id,examRender:copyExamData(figure.render || null)};
      state.update(value => value.pages.push(page));
    } else if (page.meta.examRevisionId && page.meta.examRevisionId !== figure.id && annotationTransition) {
      // Annotation commits (including undo back to their full-source parent)
      // retain unapplied background/geometry drafts and the page's undo stacks.
      markAnnotationRevision(figure);
    } else if (page.meta.examRevisionId && page.meta.examRevisionId !== figure.id) {
      // Native document undo chooses a previous source revision in the same tab.
      const prepared = services.prepareLoadedProject(copyExamData(figure.source));
      state.update(value => {
        Object.assign(page,{objects:prepared.active.objects,guides:prepared.active.guides,layers:prepared.active.layers,artboard:prepared.active.artboard});
        if (value.activePageId === page.id) Object.assign(value,{objects:page.objects,guides:page.guides,layers:page.layers,artboard:page.artboard,undoStack:[],redoStack:[]});
        rememberRevision(page,figure);
      });
      services.resetPageHistory(state,page);
    }
    if (!page.meta.examRevisionId || !page.meta.examAnnotationBaseline) state.update(()=>{rememberRevision(page,figure);});
    services.switchPage(state,page.id);
    if (switching && figure.context.viewBox) state.update(value => {
      value.viewBox = copyExamData(figure.context.viewBox);
      value.selectedIds = figure.context.selectedIds.filter(id => value.objects.some(object => object.id === id));
    });
    let context = figure.context.ai;
    if (context) context = await ai()?.restoreExamTask(context,{candidateId:restoreCandidate ? context.snapshot.tabs[0].selectedCandidateId : null}) || context;
    return {figure,aiContext:context};
  }

  async function captureEdit(editing) {
    const originalPage = pageForLink(editing.figure.link);
    if (!originalPage || originalPage.id !== state.get().activePageId) throw new Error('연결된 원래 5E 작업 탭에서 시험지에 반영해주세요.');
    let context = editing.aiContext;
    if (context) {
      const active = ai()?.activeExamTask?.();
      if (active && (active.scope !== context.scope || active.taskId !== context.taskId)) throw new Error('연결된 원래 AI 작업 탭에서 시험지에 반영해주세요.');
      context = await ai()?.captureExamTask(context.taskId,context.scope) || context;
      if (state.get().activePageId !== originalPage.id) throw new Error('연결된 원래 5E 작업 탭에서 시험지에 반영해주세요.');
      const tab = context.snapshot.tabs[0], candidate = tab.generated?.find(item => item.id === tab.selectedCandidateId);
      const image = state.get().objects.find(object => ['image','coordplane'].includes(object.type) && object.aiTaskId === context.taskId && !object.editableAssetRegionId);
      if (candidate && image && image.aiCandidateId !== candidate.id) {
        state.update(value => {value.selectedIds = [image.id];});
        await services.materializeCandidate(candidate,{taskId:context.taskId,replaceId:image.id});
      }
    }
    const captured = await capture(context);
    if (captured.link.tabId !== editing.figure.link.tabId || captured.link.assetId !== editing.figure.link.assetId) throw new Error('연결된 원래 작업 탭에서 시험지에 반영해주세요.');
    return captured;
  }

  function markRevision(figure) {
    if (figure.editScope === 'annotations') return markAnnotationRevision(figure);
    const page = pageForLink(figure.link);
    if (page) state.update(() => {
      rememberRevision(page,figure);
      // A full-source acknowledgment explicitly commits the chosen area,
      // superseding even a different crop draft. Reads do not consume it.
      delete page.meta.examDraftRender;
    });
  }
  return {capture,prepareAi,activate,captureEdit,markRevision,readAnnotations,patchAnnotations,markAnnotationRevision,pageForLink,closeAi:() => ai()?.close()};
}
