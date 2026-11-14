// 11-14(시안 review-1114 1-4·1-5): 문항 카드 자료 칸 그림 편집.
// · 그래프 객체가 든 그림 → 그래프 편집 창이 바로 열린다.
// · 그 밖의 그림 → 5E_hwp와 같은 「그림 편집 중」 창(ExamInlineEditor)이 카드 위에 떠오른다.
//   도구: AI 이미지 변환 · 복원(AI 그래프) · 글자 라벨 · 지시선 라벨 · 자르기, 「5E_image에서 자세히」.
// 고친 결과는 같은 칸에 그림(5E 원본을 품은 PNG)으로 돌아간다(문항 카드 ⌘Z로 되돌림).
import { ExamInlineEditor, chooseInlineCrop } from './rhwp-exam-inline-editor.js?v=1.7.0-four-session-integration';
import { annotationsFor, getAnnotationPage, mergeAnnotationPatch } from './rhwp-exam-annotations.js?v=1.7.0-four-session-integration';
import { embedEditablePng } from './editable-png.js?v=1.7.0-four-session-integration';
import { getContentBounds } from './svg-export.js?v=1.7.0-four-session-integration';

const copy = v => structuredClone(v);
const OPTIONS = { includeReferenceImages: true, excludeAllImages: false };
const asData = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768)); return 'data:image/png;base64,' + btoa(s); };
const imageSize = async src => { const i = new Image(); i.src = src; await i.decode(); return { width: i.naturalWidth, height: i.naturalHeight }; };

let editor = null;

// 카드 칸 그림 → 5E 원본(그림 원본이 있으면 그대로, 없으면 그림 하나를 담은 새 쪽).
async function sourceFor(figure, state, services) {
  if (figure.editable?.source) return { source: copy(figure.editable.source), render: copy(figure.editable.render || { bounds: null, options: OPTIONS }) };
  const source = copy(services.serialize(state.get()));
  source.pages = source.pages.filter(p => p.id === source.activePageId);
  services.prepareLoadedProject(source);
  const { width, height } = await imageSize(figure.data);
  const page = source.pages[0], id = crypto.randomUUID(), w = 100, h = 100 * height / Math.max(1, width);
  page.id = `card_${id}`; source.activePageId = page.id; page.name = figure.name?.replace(/\.png$/i, '') || '문항 카드 그림';
  page.artboard = { w, h }; page.guides = [];
  page.objects = [{ id: `image_${id}`, type: 'image', src: figure.data, x: -w / 2, y: -h / 2, w, h, rotation: 0, layerId: page.layers[0].id, order: 0, locked: false }];
  page.meta = { number: '', points: '' };
  return { source, render: { bounds: { x: -w / 2, y: -h / 2, w, h }, options: OPTIONS } };
}

async function raster(source, bounds, services, state, { dpi = 300, labels = true } = {}) {
  const { active } = services.prepareLoadedProject(copy(source));
  if (!labels) active.objects = active.objects.filter(o => o.type !== 'labeler');
  await services.ensureEmbeddedFonts();
  const { canvas } = await services.rasterizeExportCanvas({ ...state.get(), ...active }, { dpi, bounds, options: OPTIONS });
  return canvas;
}

// 고친 원본 → 칸에 넣을 그림(5E 원본을 품은 PNG).
async function figureFrom(source, bounds, name, services, state) {
  const canvas = await raster(source, bounds, services, state);
  const blob = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('그림을 만들지 못했습니다.')), 'image/png'));
  const id = crypto.randomUUID(), render = { bounds: copy(bounds), options: OPTIONS };
  const png = asData(embedEditablePng(new Uint8Array(services.insertPngPhys(await blob.arrayBuffer(), 300)), { id, name, version: 1, source, render }, services.prepareLoadedProject));
  if (png.length > 8 * 1024 * 1024) throw new Error('그림이 너무 큽니다(5 MB 이하로).');
  return { name: `${name}.png`.slice(0, 200), data: png, width: canvas.width, height: canvas.height, editable: { id, name, png, source, render } };
}

// 11-14 지적 19·20: AI 그래프 복원 결과(객체) → 카드 칸 그림. 그래프 원본을 품은 PNG라 칸을 열면 그래프 편집 창으로 간다.
export async function graphFigure(graph, name, { state, services }) {
  const objects = copy(graph?.objects || []);
  if (!objects.some(o => o.type === 'coordplane')) throw new Error('그래프 결과가 비어 있습니다 — AI 창에서 그래프를 다시 만든 뒤 넣으세요.');
  const source = copy(services.serialize(state.get()));
  source.pages = source.pages.filter(p => p.id === source.activePageId);
  services.prepareLoadedProject(source);
  const page = source.pages[0], id = crypto.randomUUID(), layerId = page.layers?.find(l => l.visible !== false)?.id || page.layers?.[0]?.id || 1;
  page.id = `card_${id}`; source.activePageId = page.id; page.name = String(name || 'AI 그래프').replace(/\.png$/i, '');
  page.guides = []; page.meta = { number: '', points: '' };
  page.objects = objects.map(o => ({ ...o, layerId })); page.groups = copy(graph.groups || []);
  // 영역은 축 이름·눈금 숫자·라벨까지 실제 그려진 범위 전체(여백 2mm) — 잘리지 않게(지적 21).
  const bounds = getContentBounds({ ...state.get(), ...page, objects: page.objects }, OPTIONS, 2);
  if (!bounds) throw new Error('그래프 영역을 잡지 못했습니다.');
  return figureFrom(source, bounds, page.name, services, state);
}

function draftOf(page, bounds) {
  const layerId = page.layers?.find(l => l.visible !== false)?.id || page.layers?.[0]?.id || 1;
  const draft = { objects: copy(page.objects), groups: copy(page.groups || []), layers: copy(page.layers || []), artboard: copy(page.artboard), viewBox: { ...bounds },
    activeLayerId: layerId, activePageId: page.id, undoStack: [], redoStack: [], selectedIds: [], targetedId: null, activeTool: 'V' };
  return { draft, state: { get: () => draft, update: fn => fn(draft) } };
}

// 그래프 객체 그림: 그래프 편집 창을 바로 연다.
async function editGraph({ source, render, name, plane, send, services, state }) {
  const page = getAnnotationPage(source), bounds = render.bounds || getContentBounds({ ...state.get(), ...page }, OPTIONS, 2);
  const { draft, state: draftState } = draftOf(page, bounds);
  const { openGraphModal } = await import('./graph/graph-modal.js?v=1.7.0-four-session-integration');
  const applied = await new Promise(resolve => { let done = false;
    openGraphModal(plane.id, 'coord', { state: draftState, title: '그래프 편집', confirmLabel: '적용', onApply: () => { done = true; resolve(true); }, onClose: () => { if (!done) resolve(false); } }); });
  if (!applied) return;
  const next = copy(source), nextPage = getAnnotationPage(next);
  nextPage.objects = copy(draft.objects); nextPage.groups = copy(draft.groups || []);
  const nextBounds = getContentBounds({ ...state.get(), ...nextPage, objects: nextPage.objects }, OPTIONS, 2) || bounds;
  send({ action: 'figure-ready', figure: await figureFrom(next, nextBounds, name, services, state) });
}

export async function editCardFigure(m, { send, state, services, frame, onDetail }) {
  const figure = m.figure;
  if (!figure?.data) throw new Error('편집할 그림이 없습니다.');
  const name = (m.label || figure.name || '그림').replace(/\.png$/i, '');
  let { source, render } = await sourceFor(figure, state, services);
  const page = getAnnotationPage(source);
  if (!render.bounds) render.bounds = getContentBounds({ ...state.get(), ...page }, OPTIONS, 2) || { x: -page.artboard.w / 2, y: -page.artboard.h / 2, w: page.artboard.w, h: page.artboard.h };
  const plane = page.objects.find(o => o.type === 'coordplane');
  if (plane) return editGraph({ source, render, name, plane, send, services, state });

  // 그림 편집 창: 카드 칸 자리(rect, 출제 칸 iframe 안 좌표)에서 떠오른다.
  const tileRect = () => {
    const f = frame?.getBoundingClientRect?.(), r = m.rect;
    return f && r ? { x: f.left + r.x, y: f.top + r.y, w: r.w, h: r.h } : null;
  };
  const bridge = { figureRect: tileRect, figureGeometry: tileRect, watchView: fn => { addEventListener('resize', fn); return () => removeEventListener('resize', fn); } };
  let bounds = copy(render.bounds), labels = annotationsFor(source);
  const preview = async b => (await raster(source, b, services, state, { dpi: 150, labels: false })).toDataURL('image/png');
  // 닫으면 키보드 초점을 출제 칸으로 돌려준다 — 바깥 문서에 남으면 카드의 ⌘Enter·Delete가 닿지 않았다.
  const finish = () => { editor.close(); try { frame?.contentWindow?.focus(); } catch {} };
  const options = {
    onChange: (next, b) => { labels = next; bounds = b; },
    onError: error => send({ error: error.message || String(error) }),
    onAction: async action => {
      if (action === 'close') { finish(); return; }
      if (action === 'apply') {
        // 11-15: 창을 먼저 닫고(닫히는 움직임이 끝난 뒤) 그림을 만든다 — 그림 만들기와 닫는 움직임이 겹쳐 버벅였다.
        const merged = mergeAnnotationPatch(copy(source), annotationsFor(source), editor.snapshot()), at = copy(editor.bounds || bounds);
        finish(); await new Promise(r => setTimeout(r, 280));
        const out = await figureFrom(merged, at, name, services, state);
        send({ action: 'figure-ready', figure: out }); return;
      }
      if (action === 'crop') {
        const a = page.artboard, content = getContentBounds({ ...state.get(), ...page }, OPTIONS, 3);
        const boxes = [{ x: -a.w / 2, y: -a.h / 2, w: a.w, h: a.h }, bounds, ...(content ? [content] : [])];
        const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
        const full = { x, y, w: Math.max(...boxes.map(b => b.x + b.w)) - x, h: Math.max(...boxes.map(b => b.y + b.h)) - y };
        const chosen = await chooseInlineCrop({ sourceUrl: await preview(full), fullBounds: full, initialBounds: bounds });
        if (!chosen) return;
        bounds = chosen; editor.setBounds(chosen, await preview(chosen)); return;
      }
      if (action === 'ai' || action === 'restore') {
        // AI 이미지 변환·AI 그래프 복원: 지금 그림을 원본으로 AI 창을 연다. 결과는 「문항 카드에 넣기」로 이 칸에 돌아온다.
        const merged = mergeAnnotationPatch(copy(source), annotationsFor(source), editor.snapshot());
        const ref = (await raster(merged, editor.bounds || bounds, services, state, { dpi: 200 })).toDataURL('image/png');
        finish();
        dispatchEvent(new CustomEvent('5e:ai-open-reference', { detail: { reference: { dataUrl: ref, name, sourceKind: 'exam-figure' }, conversionKind: action === 'restore' ? 'graph' : 'image', hwpTarget: { examCard: { qid: m.qid, key: m.key }, label: name } } }));
        return;
      }
      if (action === 'original') {
        // 5E_image에서 자세히: 지금까지 고친 것을 원본으로 품은 그림을 만들어 예전 정밀 편집(5E_image 화면) 길로 넘긴다.
        const merged = mergeAnnotationPatch(copy(source), annotationsFor(source), editor.snapshot());
        const out = await figureFrom(merged, editor.bounds || bounds, name, services, state);
        finish(); onDetail?.({ ...m, figure: out }); return;
      }
      if (action === 'revert') return;
    },
  };
  if (!editor) { editor = new ExamInlineEditor(document.body, options); editor.root.style.zIndex = '1300'; editor.root.dataset.host = 'card'; }
  else editor.options = options;
  editor.open({ simple: false, graph: false, restored: false, bridge, ref: null, labels, bounds, baseUrl: await preview(bounds), layers: page.layers, layerId: page.layers.find(l => l.visible !== false)?.id || 1 });
  editor.position();
}
