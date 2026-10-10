import { blocksCanvasShortcut } from "./platform.js?v=1.7.0-four-session-integration";
import { showAlert } from "./ui-dialogs.js?v=1.7.0-four-session-integration";
/* ===== IMAGE PASTE (Ctrl+V system-clipboard image -> normal image object) ===== */

import { getLastMouseWorld, rebuildGroups } from "./transform.js?v=1.7.0-four-session-integration";
import { createEditableImageLabelObjects } from "./ai-editable-image-labels.js?v=1.7.0-four-session-integration";
import { prepareEditableLabelFonts, nativeLabelBounds, measureLabelTypography } from "./ai-label-typography.js?v=1.7.0-four-session-integration";
import { validateLabelTargetPlacement } from './ai-label-target-placement.js?v=1.7.0-four-session-integration';

// 왜: png/jpeg만 허용하면 webp/gif/bmp를 클립보드로 붙여넣을 때 조용히 무시된다.
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"]);
const MAX_IMG_DIM = 2000; // px — 초고해상도 붙여넣기 이미지는 이 상한으로 다운스케일
const MAX_UNDO = 60;      // undo 스냅샷 개수 상한(딥클론 누적 메모리 폭증 방지)
let _idCounter = 0;

// 자연 크기가 상한을 넘으면 canvas로 축소 재인코딩해 저장(=undo 스냅샷에 딥클론되는
// data URL 크기를 줄여 메모리 폭증을 막는다). 상한 이하면 원본 그대로.
// project-io.js(드래그앤드롭 이미지 삽입)도 같은 축소를 쓴다 — 붙여넣기 경로만
// 축소하고 드롭 경로는 원본 그대로 저장하면 저장 파일·자동저장이 고해상도 사진에서
// 폭증한다(1건 프로젝트-저장/페이지 감사 finding).
export function downscaleIfNeeded(src, natural) {
  const max = Math.max(natural.w, natural.h);
  if (max <= MAX_IMG_DIM) return Promise.resolve({ src, size: natural });
  const scale = MAX_IMG_DIM / max;
  const w = Math.max(1, Math.round(natural.w * scale));
  const h = Math.max(1, Math.round(natural.h * scale));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve({ src: c.toDataURL("image/png"), size: { w, h } });
      } catch (_) { resolve({ src, size: natural }); }
    };
    img.onerror = () => resolve({ src, size: natural });
    img.src = src;
  });
}

function isEditingFieldTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
    target.isContentEditable ||
    (target.closest && target.closest("#inspector, .text-editor-overlay, .font-modal-overlay, .text-ctx-menu, .modal-overlay"));
}

function loadImageSize(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = Number(img.naturalWidth), h = Number(img.naturalHeight);
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
        reject(new Error("이미지 크기를 확인할 수 없습니다."));
        return;
      }
      resolve({ w, h });
    };
    img.onerror = () => reject(new Error("Unable to decode image"));
    img.src = src;
  });
}

function fitToArtboard(natural, artboard) {
  // 왜: Math.min만 쓰면 작은 이미지가 아트보드의 90%까지 강제 확대돼 화질이
  // 열화된다 — 1을 상한으로 둬 축소만 하고 확대는 하지 않는다.
  const scale = Math.min((artboard.w * 0.9) / natural.w, (artboard.h * 0.9) / natural.h, 1);
  return { w: natural.w * scale, h: natural.h * scale };
}

function targetStateFingerprint(target) {
  const { src, ...state } = target;
  return JSON.stringify(state);
}

function cloneSourceMetadata(value) {
  if (value == null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("이미지 출처 정보를 확인할 수 없습니다.");
  const metadata = {};
  const ownValue = (key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  };
  for (const key of [
    "provider", "documentId", "documentTitle", "documentHash", "title", "locator", "displayName",
    "sha256", "sourceKind", "itemId", "fileName", "sourceUrl", "license",
  ]) {
    const field = ownValue(key);
    if (typeof field === "string" && field.trim()) metadata[key] = field.trim();
  }
  const pageNumber = ownValue("pageNumber");
  if (Number.isInteger(pageNumber) && pageNumber > 0) metadata.pageNumber = pageNumber;
  const rect = ownValue("rect");
  if (Array.isArray(rect) && rect.length === 4 && rect.every((number) => Number.isFinite(number))) {
    metadata.rect = [...rect];
  }
  const fullPageFallback = ownValue("fullPageFallback");
  if (typeof fullPageFallback === "boolean") metadata.fullPageFallback = fullPageFallback;
  return Object.keys(metadata).length ? metadata : undefined;
}

async function checkLabelCandidateBytes(plan, src) {
  const report = plan?.qualityReview;
  const expected = report?.compositeBindings?.candidateSha256;
  if (!expected) return;
  const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(src))),
    byte => byte.toString(16).padStart(2, '0')).join('');
  if (actual === expected) return;
  plan.reviewRequired = true;
  plan.qualityReview = { ...report, verdict: 'uncertain', issues: [...(report.issues || []), {
    code: 'label-placement-image-changed', severity: 'major',
    message: '삽입 이미지가 최종 라벨 검수 이미지와 달라 그림과 라벨을 다시 확인해야 합니다.',
    reviewedCandidateSha256: expected, insertedCandidateSha256: actual,
  }] };
}

function applyLabelPlacementReview(image) {
  const plan = image.aiEditableLabelPlan;
  const report = plan?.qualityReview;
  const size = report?.compositeBindings?.imageSize;
  // Legacy plans have no placement proof; keep their existing review requirement.
  delete image.aiReviewState;
  delete image.aiReviewReport;
  delete image.aiReviewDraft;
  if (plan?.reviewDraft?.origin === 'user-review-edit') {
    plan.reviewRequired = true;
    image.aiReviewDraft = true;
    image.aiReviewState = 'needs-attention';
    image.aiReviewReport = structuredClone(report);
    return;
  }
  if (!size) {
    if (report?.issues?.some(issue => issue.code === 'label-placement-image-changed')) {
      image.aiReviewState = 'needs-attention'; image.aiReviewReport = structuredClone(report);
    }
    return;
  }
  const matches = [size.w, size.h].every(value => Number.isFinite(value) && value > 0)
    && Math.abs(size.w - image.w) <= 1e-6 && Math.abs(size.h - image.h) <= 1e-6;
  if (!matches) {
    plan.reviewRequired = true;
    plan.qualityReview = { ...report, verdict: 'uncertain', issues: [...(report.issues || []), {
      code: 'label-placement-size-changed', severity: 'major',
      message: '삽입 크기가 최종 라벨 검수 크기와 달라 배치와 글자 크기를 다시 확인해야 합니다.',
      reviewedImageSize: { ...size }, insertedImageSize: { w: image.w, h: image.h },
    }] };
  }
  const rotation = image.rotation ?? 0, opacity = image.opacity ?? 1;
  if (!Number.isFinite(rotation) || rotation % 360 !== 0 || opacity !== 1 || image.cutouts?.length) {
    plan.reviewRequired = true;
    const current = plan.qualityReview;
    plan.qualityReview = { ...current, verdict: 'uncertain', issues: [...(current.issues || []), {
      code: 'label-placement-display-changed', severity: 'major',
      message: '삽입 이미지의 회전·투명도·잘라낸 영역이 검수 화면과 달라 최종 배치를 다시 확인해야 합니다.',
      insertedDisplay: { rotation, opacity, cutoutCount: image.cutouts?.length || 0 },
    }] };
  }
  image.aiReviewReport = structuredClone(plan.qualityReview);
  image.aiReviewState = matches && report.verdict === 'pass' && !plan.reviewRequired ? 'passed' : 'needs-attention';
}

function autoLabelsForImage(image, place, artboard) {
  const labels = place?.editableLabelPlan?.labels;
  if (!Array.isArray(labels) || !labels.length) return [];
  try {
    const createObjects = () => {
      let serial = 0;
      return createEditableImageLabelObjects({
      labels,
      relationGroups: place.editableLabelPlan.relationGroups,
      placement: place.editableLabelPlan.targetPlacement,
      candidateSha256: place.editableLabelPlan.candidateSha256,
      image,
      metadata: { aiTaskId: place.aiTaskId, aiCandidateId: place.aiCandidateId },
      idFactory: () => `${image.id}_auto_label_${++serial}`,
      }).map(label => ({ ...label, aiLabelReviewRequired: image.aiEditableLabelPlan?.reviewRequired === true,
      ...(image.aiEditableLabelPlan?.qualityReview?.targetVerified === false ? {aiTargetReviewRequired:true} : {}),
      ...(image.aiReviewState ? { aiReviewState: image.aiReviewState } : {}) }));
    };
    let objects = createObjects();
    if (place.editableLabelPlan.reviewDraft?.presentation === 'external-list') {
      // Move native objects, not the immutable normalized source observation.
      // Translate relation groups as a unit, including every observed route point.
      const groupObjects = objects => {
        const groups = new Map();
        for (const object of objects) {
          const key = object.groupId || object.id;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(object);
        }
        return groups;
      };
      let scale = 1;
      const groupBounds = group => {
        const points = group.flatMap(object => {
          const m = measureLabelTypography(object);
          const b = object.type === 'labeler' ? {x:object.p2.x-m.rotatedW/2,y:object.p2.y-m.rotatedH/2,w:m.rotatedW,h:m.rotatedH} : nativeLabelBounds(object);
          const padding = 0.5 * scale;
          return [{x:b.x-padding,y:b.y-padding},{x:b.x+b.w+padding,y:b.y+b.h+padding},
            ...['p1','p2','elbow'].flatMap(key => object[key] ? [object[key]] : []),
            ...(object.extraAnchors || []),
            ...(object.leaderRoutes || []).flatMap(route => {
              const radius = Math.max(0.5 * scale, route.endRadius || 0);
              return [route.start,...route.controls,{x:route.target.x-radius,y:route.target.y-radius},{x:route.target.x+radius,y:route.target.y+radius}];
            })];
        });
        return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),
          top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
      };
      const gap = 2;
      let groups = groupObjects(objects);
      if (artboard) {
        const bounds = [...groups.values()].map(groupBounds);
        const width = image.w + gap + Math.max(...bounds.map(b=>b.right-b.left));
        const height = Math.max(image.h, bounds.reduce((h,b)=>h+b.bottom-b.top,0) + gap*(bounds.length-1));
        scale = Math.min(1,artboard.w*0.9/width,artboard.h*0.9/height);
        image.x = -width*scale/2; image.y = -height*scale/2;
        image.w *= scale; image.h *= scale;
        objects = createObjects();
        groups = groupObjects(objects);
      }
      let top = image.y;
      for (const group of groups.values()) {
        const bounds = groupBounds(group);
        const dx = image.x+image.w+gap*scale-bounds.left, dy = top-bounds.top;
        const move = point => ({x:point.x+dx,y:point.y+dy});
        for (const object of group) {
          if (Number.isFinite(object.x)) { object.x += dx; object.y += dy; }
          for (const key of ['p1','p2','elbow']) if (object[key]) object[key] = move(object[key]);
          if (object.extraAnchors) object.extraAnchors = object.extraAnchors.map(move);
          if (object.leaderRoutes) object.leaderRoutes = object.leaderRoutes.map(route => ({
            ...route,start:move(route.start),target:move(route.target),controls:route.controls.map(move),
          }));
          object.aiTargetReviewRequired = true;
          object.aiLabelDraftPresentation = 'external-list';
        }
        top += bounds.bottom-bounds.top+gap*scale;
      }
    }
    return objects;
  } catch (error) {
    throw new Error(`편집 라벨을 만들지 못해 삽입하지 않았습니다: ${error.message}`);
  }
}

export async function prepareImageCandidateRevision(image, src, options) {
  await loadImageSize(src);
  const editableLabelPlan = options.editableLabelPlan ? structuredClone(options.editableLabelPlan) : null;
  if (editableLabelPlan?.targetPlacement) {
    await validateLabelTargetPlacement({plan:editableLabelPlan.sourcePlan,placement:editableLabelPlan.targetPlacement,candidateDataUrl:src});
  }
  if (editableLabelPlan?.labels?.length) await prepareEditableLabelFonts(editableLabelPlan.labels);
  await checkLabelCandidateBytes(editableLabelPlan,src);
  const replacement = {...structuredClone(image),src,aiCandidateId:options.aiCandidateId};
  if (editableLabelPlan) replacement.aiEditableLabelPlan = editableLabelPlan;
  else delete replacement.aiEditableLabelPlan;
  applyLabelPlacementReview(replacement);
  const labels = autoLabelsForImage(replacement,{...options,editableLabelPlan});
  replacement.imageSelectionLocked = Boolean(labels.length && editableLabelPlan?.frozen);
  if (replacement.imageSelectionLocked) replacement.aiLabelEditingBackground = true;
  else delete replacement.aiLabelEditingBackground;
  return {image:replacement,labels};
}

function insertImageObject(state, src, size, place) {
  const s0 = state.get();
  const fitted = fitToArtboard(size, s0.artboard);
  // place.at 지정 시 그 지점(예: 아트보드 원점)을 기준으로, 아니면 마지막 마우스/뷰포트 중앙.
  const target = place?.centerArtboard
    ? { x: 0, y: 0 }
    : (place && place.at) ? place.at : (getLastMouseWorld() ||
      { x: s0.viewBox.x + s0.viewBox.w / 2, y: s0.viewBox.y + s0.viewBox.h / 2 });
  const off = (place && place.offset) || { dx: 0, dy: 0 };
  const x = target.x - fitted.w / 2 + off.dx;
  const y = target.y - fitted.h / 2 + off.dy;
  const id = `obj_${Date.now().toString(36)}_img${++_idCounter}`;

  const image = {
    id,
    type: "image",
    src,
    x,
    y,
    w: fitted.w,
    h: fitted.h,
    rotation: 0,
    mode: "edit",
    opacity: 1,
    aspectLocked: true,
    exportable: true,
    locked: false,
    positionLocked: false,
    imageSelectionLocked: false,
    cutouts: [],
    ...(place?.aiTaskId ? {aiTaskId:place.aiTaskId,aiCandidateId:place.aiCandidateId} : {}),
    ...(place?.sourceMetadata ? {sourceMetadata:place.sourceMetadata} : {}),
    ...(place?.editableLabelPlan ? {aiEditableLabelPlan: structuredClone(place.editableLabelPlan)} : {}),
  };
  applyLabelPlacementReview(image);
  const labels = autoLabelsForImage(image, place, s0.artboard);
  // AI diagrams remain exportable artwork; only selection is locked for label editing.
  if (labels.length && place?.editableLabelPlan?.frozen) {
    image.imageSelectionLocked = true;
    image.aiLabelEditingBackground = true;
  }
  state.update((s) => {
    s.undoStack.push(JSON.parse(JSON.stringify(s.objects)));
    if (s.undoStack.length > MAX_UNDO) s.undoStack.splice(0, s.undoStack.length - MAX_UNDO);
    s.redoStack = [];
    s.objects.push({ ...image, layerId: s.activeLayerId, order: s.objects.length });
    for (const label of labels) s.objects.push({ ...label, layerId: s.activeLayerId, order: s.objects.length });
    rebuildGroups(s);
    // Drafts are for individual text corrections; multi-selection resize handles
    // can cover small glyphs before their first click.
    s.selectedIds = place?.editableLabelPlan?.reviewDraft ? []
      : image.imageSelectionLocked ? labels.map(label => label.id) : [id, ...labels.map(label => label.id)];
    s.targetedId = null;
    s.activeTool = "V";
  });
  return id;
}

/* 외부 모듈용(기출 라이브러리·이미지 불러오기 등): dataURL을 즉시 이미지 객체로 삽입.
 * 내부 붙여넣기 경로와 달리 디코드 실패를 삼키지 않고 throw한다.
 * opts.at={x,y} = 삽입 기준점(예: 아트보드 원점), opts.offset={dx,dy} = 카스케이드용. */
export async function insertImageFromSrc(state, src, opts = {}) {
  // Capture intent before decoding. UI state (page, selected object, even opts)
  // can change while Image.onload/downscaling is pending.
  const routeIsCurrent = typeof opts?.isCurrent === "function" ? opts.isCurrent : null;
  const options = { ...opts,
    ...(opts?.at ? { at: { ...opts.at } } : {}),
    ...(opts?.offset ? { offset: { ...opts.offset } } : {}),
    ...(opts?.sourceMetadata ? { sourceMetadata: cloneSourceMetadata(opts.sourceMetadata) } : {}),
    ...(opts?.editableLabelPlan ? { editableLabelPlan: structuredClone(opts.editableLabelPlan) } : {}),
  };
  delete options.isCurrent;
  if (typeof src !== "string" || !src.trim()) throw new Error("삽입할 이미지가 없습니다.");
  const hasAiMetadata = options.aiTaskId != null || options.aiCandidateId != null;
  if (hasAiMetadata && (![options.aiTaskId, options.aiCandidateId].every(value => typeof value === "string" && value.trim()))) {
    throw new Error("이미지 작업·버전 정보를 확인할 수 없습니다.");
  }
  if (options.replaceId && !hasAiMetadata) throw new Error("교체할 이미지 작업 정보가 없습니다.");

  const initial = state.get();
  const pageId = initial.activePageId ?? null;
  const pageRecord = initial.pages?.find(page => page.id === pageId) ?? null;
  const objectsAtStart = initial.objects;
  const initialTarget = options.replaceId ? initial.objects.find(obj => obj.id === options.replaceId) : null;
  const targetSnapshot = initialTarget ? targetStateFingerprint(initialTarget) : null;
  const targetSource = initialTarget?.src;
  const targetCandidateId = initialTarget?.aiCandidateId;
  let invalidationError = null;
  function assertContext(s) {
    if (invalidationError) throw invalidationError;
    if (routeIsCurrent && !routeIsCurrent()) {
      throw new Error("이미지를 준비하는 동안 선택한 라이브러리 자료가 변경되었습니다. 다시 시도해 주세요.");
    }
    if ((s.activePageId ?? null) !== pageId
      || (s.pages?.find(page => page.id === pageId) ?? null) !== pageRecord
      || s.objects !== objectsAtStart) {
      throw new Error("이미지를 준비하는 동안 페이지가 변경되었습니다. 다시 시도해 주세요.");
    }
    if (!options.replaceId) return null;
    const target = s.objects.find(obj => obj.id === options.replaceId);
    if (!target || target !== initialTarget || targetStateFingerprint(target) !== targetSnapshot || target.type !== "image"
      || target.aiTaskId !== options.aiTaskId || target.src !== targetSource
      || target.aiCandidateId !== targetCandidateId
      || s.selectedIds?.length !== 1 || s.selectedIds[0] !== target.id) {
      throw new Error("교체 대상 이미지나 선택이 변경되었습니다. 다시 선택해 주세요.");
    }
    if (target.locked || target.positionLocked || target.imageSelectionLocked) {
      throw new Error("잠긴 이미지는 교체할 수 없습니다.");
    }
    return target;
  }
  assertContext(initial);
  // Latch temporary page/selection changes too (switch away and back is not
  // permission to complete an earlier operation). Always release the listener.
  const unsubscribe = state.subscribe?.((s) => {
    try { assertContext(s); } catch (error) { invalidationError ??= error; }
  });
  try {
    const natural = await loadImageSize(src);
    if (options.editableLabelPlan?.targetPlacement) {
      await validateLabelTargetPlacement({ plan: options.editableLabelPlan.sourcePlan, placement: options.editableLabelPlan.targetPlacement, candidateDataUrl: src });
    }
    if (options.editableLabelPlan?.labels?.length) await prepareEditableLabelFonts(options.editableLabelPlan.labels);
    assertContext(state.get());
    if (options.replaceId) {
      const prepared = await prepareImageCandidateRevision(initialTarget,src,options);
      assertContext(state.get());
      state.update((s) => {
        const target = assertContext(s);
        const undo = JSON.parse(JSON.stringify(s.objects));
        s.undoStack.push(undo);
        if (s.undoStack.length > MAX_UNDO) s.undoStack.splice(0, s.undoStack.length - MAX_UNDO);
        s.redoStack = [];
        // Geometry, layer, grouping, clipping and other image settings remain.
        Object.assign(target,prepared.image);
        if (!options.editableLabelPlan) delete target.aiEditableLabelPlan;
        for (let index = s.objects.length - 1; index >= 0; index -= 1) {
          const object = s.objects[index];
          if (object.aiAutoLabel === true && object.aiParentImageId === target.id) s.objects.splice(index, 1);
        }
        const labels = prepared.labels;
        for (const label of labels) s.objects.push({ ...label, layerId: target.layerId, order: s.objects.length });
        rebuildGroups(s);
        s.selectedIds = target.imageSelectionLocked ? labels.map(label => label.id) : [target.id, ...labels.map(label => label.id)];
        s.targetedId = null;
        s.activeTool = "V";
      });
      return options.replaceId;
    }
    const scaled = options.preserveBytes ? { src, size: natural } : await downscaleIfNeeded(src, natural);
    await checkLabelCandidateBytes(options.editableLabelPlan, scaled.src);
    assertContext(state.get());
    return insertImageObject(state, scaled.src, scaled.size, options);
  } finally {
    if (typeof unsubscribe === "function") unsubscribe();
  }
}

export function initImagePaste(state, svg) {
  document.addEventListener("paste", (event) => {
    if (isEditingFieldTarget(event.target) || blocksCanvasShortcut(event)) return;
    const items = Array.from(event.clipboardData?.items || []);
    const file = items.find(item => ACCEPTED_TYPES.has(item.type))?.getAsFile();
    if (!file) return;
    event.preventDefault();
    const initial = state.get();
    const page = initial.pages?.find(record => record.id === initial.activePageId);
    const pageId = initial.activePageId;
    const at = getLastMouseWorld() || { x: initial.viewBox.x + initial.viewBox.w / 2, y: initial.viewBox.y + initial.viewBox.h / 2 };
    let stale = false;
    const changedPage = current => current.activePageId !== pageId ||
      current.pages?.find(record => record.id === pageId) !== page;
    const unsubscribe = state.subscribe(current => { if (changedPage(current)) stale = true; });
    const reader = new FileReader();
    const failed = message => {
      unsubscribe();
      void showAlert(message, { title: "이미지 붙여넣기" });
    };
    reader.onerror = () => failed("이미지를 읽지 못했습니다. 다시 복사하거나 이미지 파일을 불러와 주세요.");
    reader.onload = async () => {
      try {
        if (stale || changedPage(state.get())) throw new Error("페이지가 바뀌어 붙여넣기를 취소했습니다. 원하는 페이지에서 다시 붙여넣어 주세요.");
        await insertImageFromSrc(state, String(reader.result || ""), { at });
      } catch (error) {
        void showAlert(error?.message?.includes("페이지") ? error.message :
          "이미지를 붙여넣지 못했습니다. 다시 복사하거나 이미지 파일을 불러와 주세요.", { title: "이미지 붙여넣기" });
      } finally { unsubscribe(); }
    };
    try { reader.readAsDataURL(file); }
    catch { failed("이미지를 읽지 못했습니다. 이미지 파일을 불러와 주세요."); }
  });
}
