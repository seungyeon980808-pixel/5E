/* ===== MCP BRIDGE — 열려 있는 앱에 외부(Claude/MCP)에서 객체를 넣는 통로 =====
 *
 * 무엇을 하나: `tools/mcp-5e` MCP 서버가 로컬(127.0.0.1)에 열어 둔 통로에 붙어서,
 * "이 객체들을 지금 화면에 추가해라" 같은 명령을 받아 state에 반영한다. 파일을 저장했다가
 * 다시 여는 왕복 없이, 앱을 켜 둔 채로 그림이 들어온다.
 *
 * 안전장치 — 이 모듈은 아래 조건이 전부 맞을 때만 깨어난다:
 *   1) localhost에서 열렸거나, 주소에 `?mcp=1`을 붙여 **직접 켠** 경우에만.
 *      배포본(GitHub Pages)을 그냥 연 사람에게는 아무 일도 일어나지 않는다 —
 *      켜지 않은 브라우저는 127.0.0.1을 두드려 보지도 않는다.
 *   2) 통로(포트 8579~8583)가 실제로 응답할 때만
 *   3) 서버가 없으면 조용히 포기한다 — 콘솔 에러도 남기지 않는다
 *
 * 켜기: 주소 끝에 `?mcp=1` → 이 브라우저에 기억된다(localStorage). 끄기: `?mcp=0`
 *
 * UI: 상단 툴바 zoom 표시 바로 왼쪽의 "MCP ●" 버튼(#mcp-bridge-btn, index.html에 정적으로
 * 있음) — 점(●)이 상태 표시다: 회색 테두리만=연결 안 됨, 파란 채움=연결됨.
 * 켜져 있을 때(bridgeEnabled())만 hidden을 벗긴다.
 *
 * 들어오는 모든 변경은 undoStack에 스냅샷을 남긴다. 마음에 안 들면 Ctrl+Z로 되돌린다.
 */

import { state } from "./state.js?v=1.4.0";
import { showAlert, showConfirm } from "./ui-dialogs.js?v=1.4.0";
import { switchPage, addPage } from "./pages.js?v=1.4.0";
import { rasterizeExportCanvas, ensureEmbeddedFonts, insertPngPhys,
         getContentBounds } from "./svg-export.js?v=1.4.0";
import { translateObject } from "./transform.js?v=1.4.0";

const MM_PER_INCH = 25.4;   // exportImage 에서 "가로 몇 px" 요청을 dpi 로 환산할 때 쓴다
// 이 창을 다른 5E 창과 구별하는 표식. 새로고침하면 새로 생긴다(그게 맞다 — 새 연결이므로).
const CLIENT_ID = Math.random().toString(36).slice(2, 8) + "-" + String(Date.now()).slice(-5);
const PORTS = [8579, 8580, 8581, 8582, 8583];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const STORAGE_KEY = "5e.mcpBridge";

/* ----- 켜져 있는가 -----
 * localhost는 개발용이므로 항상 켠다. 배포본은 `?mcp=1`로 한 번 켜면 그 브라우저에만
 * 기억된다 — 링크를 받은 다른 사람에게는 옮겨가지 않는다. */
function bridgeEnabled() {
  let stored = null;
  try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* 시크릿 모드 등 */ }
  const q = new URLSearchParams(location.search).get("mcp");
  if (q === "1") { try { localStorage.setItem(STORAGE_KEY, "1"); } catch {} return true; }
  if (q === "0") { try { localStorage.removeItem(STORAGE_KEY); } catch {} return false; }
  if (LOCAL_HOSTS.has(location.hostname)) return true;
  return stored === "1";
}

let source = null;
let idSeq = 0;
let lastPort = null;
let connecting = false;   // 버튼을 눌러 재시도하는 중 — 중복 클릭 방지

/* ----- 화면에 그려진 모양의 실제 범위 (fitArtboard 용) -----
 * #canvas 의 좌표계가 곧 world mm 라(viewBox 가 mm), 렌더된 요소의 getBBox() 를
 * 그대로 쓸 수 있다. 렌더러가 상자 밖에 그리는 것(좌표평면 축 이름, 라벨 등)까지
 * 포함하므로 "내보내면 어디까지 나오나"에 대한 정확한 답이다.
 * getBBox() 는 획 두께를 빼고 주므로 strokeWidth/2 만큼 넓힌다. */
function renderedBounds(s) {
  const svg = document.getElementById("canvas");
  if (!svg) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of s.objects) {
    if (!o || !o.id) continue;
    let el = null;
    try { el = svg.querySelector(`[data-id="${CSS.escape(o.id)}"]`); } catch (_) { el = null; }
    if (!el) continue;
    let b = null;
    try { b = el.getBBox(); } catch (_) { continue; }
    if (!b || !isFinite(b.x) || !isFinite(b.y) || !(b.width >= 0) || !(b.height >= 0)) continue;
    const half = (Number(o.strokeWidth) || 0) / 2;
    x0 = Math.min(x0, b.x - half);
    y0 = Math.min(y0, b.y - half);
    x1 = Math.max(x1, b.x + b.width + half);
    y1 = Math.max(y1, b.y + b.height + half);
  }
  return (isFinite(x0) && x1 > x0 && y1 > y0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

function unionRect(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.w, b.x + b.w), y1 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/* ----- 명령 처리기 ----- */
const COMMANDS = {
  // 통로가 살아 있는지 + 지금 화면에 뭐가 있는지
  ping() {
    const s = state.get();
    return { app: "5E", objects: s.objects.length, artboard: s.artboard, page: activePageName(s) };
  },

  // 지금 그려져 있는 것을 읽어 간다 — Claude가 "현재 그림을 보고" 고칠 수 있게 하는 통로.
  getState() {
    const s = state.get();
    return {
      artboard: s.artboard,
      page: activePageName(s),
      bounds: {
        xMin: -s.artboard.w / 2, xMax: s.artboard.w / 2,
        yMin: -s.artboard.h / 2, yMax: s.artboard.h / 2,
      },
      objects: s.objects.map((o) => ({
        id: o.id, type: o.type, kind: o.kind, element: o.element,
        label: o.label || o.text || o.expr || undefined,
        x: o.x, y: o.y, w: o.w, h: o.h, p1: o.p1, p2: o.p2,
        pointCount: Array.isArray(o.points) ? o.points.length : undefined,
        // 그래프 내장 요소(수선의 발·표시점·화살촉) 개수. 이게 보이면 그 요소가 계열에
        // 실린 '내장 요소'라는 뜻 — 별도 직선 객체로 흉내 낸 것과 밖에서 구별하기 위한 표시.
        planeId: o.planeId,
        guides: Array.isArray(o.guideXs) ? o.guideXs.length : undefined,
        markers: Array.isArray(o.markerXs) ? o.markerXs.length : undefined,
        arrows: Array.isArray(o.arrowSpecs) ? o.arrowSpecs.length : undefined,
        seriesLock: o.type === "coordplane" ? o.seriesLock !== false : undefined,
        groupId: o.groupId,
      })),
    };
  },

  // 객체 추가 — MCP 쪽에서 이미 검증·기본값 채움이 끝난 것이 온다.
  addObjects({ objects, group }) {
    if (!Array.isArray(objects) || !objects.length) throw new Error("objects가 비었습니다");
    const ids = [];
    let grouped = 0;
    state.update((s) => {
      s.undoStack.push(JSON.parse(JSON.stringify(s.objects)));
      s.redoStack = [];
      for (const raw of objects) {
        const id = raw.id && !s.objects.some((o) => o.id === raw.id) ? raw.id : nextId();
        const obj = { ...raw, id, order: s.objects.length, layerId: raw.layerId ?? s.activeLayerId };
        s.objects.push(obj);
        ids.push(id);
      }
      s.selectedIds = ids;
      s.targetedId = null;
      lockPlanesToSeries(s, ids);
      if (group) grouped = groupObjects(s, ids);
    });
    flash(`${ids.length}개 추가됨`);
    return { added: ids.length, ids, grouped };
  },

  // id로 지우기
  removeObjects({ ids }) {
    const set = new Set(ids || []);
    let removed = 0;
    state.update((s) => {
      s.undoStack.push(JSON.parse(JSON.stringify(s.objects)));
      s.redoStack = [];
      const before = s.objects.length;
      s.objects = s.objects.filter((o) => !set.has(o.id));
      s.objects.forEach((o, i) => { o.order = i; });
      s.selectedIds = [];
      removed = before - s.objects.length;
    });
    flash(`${removed}개 삭제됨`);
    return { removed };
  },

  /* ----- 페이지 목록 ----- */
  // 그림을 여러 장 그릴 때 어느 탭에 무엇이 있는지 보고, 원하는 탭으로 옮겨 그리기 위한 것.
  listPages() {
    const s = state.get();
    return {
      active: s.activePageId,
      pages: (s.pages || []).map((p, i) => ({
        index: i, id: p.id, name: p.name,
        // 활성 페이지의 objects는 s.objects에 있고, 비활성 페이지는 p.objects에 있다.
        objects: p.id === s.activePageId ? s.objects.length : (p.objects || []).length,
        // 활성 페이지의 아트보드는 s.artboard가 진짜다(p.artboard는 페이지를 떠날 때
        // writeBackActive로 갱신되므로 활성 중에는 낡은 값이다).
        artboard: p.id === s.activePageId ? s.artboard : p.artboard,
      })),
    };
  },

  /* ----- 페이지 전환 / 추가 -----
   * page: 인덱스(0부터) | 이름 | id. create:true면 없을 때 새로 만든다.
   * 앱의 pages.js를 그대로 호출하므로 탭 UI·그룹 재구축·히스토리 처리가 앱과 동일하다. */
  setPage({ page, create }) {
    const s = state.get();
    const list = s.pages || [];
    let target = null;
    if (typeof page === "number") target = list[page];
    else if (typeof page === "string") target = list.find((p) => p.id === page || p.name === page);
    if (!target) {
      if (!create) throw new Error(`페이지를 찾을 수 없습니다: ${page} (현재 ${list.length}장)`);
      addPage(state);
      // 이름을 지정해 만든 경우 새 탭 이름을 그대로 붙인다(pages.js의 renamePage는
      // 사용자에게 입력을 묻는 대화상자라 여기서 쓸 수 없다).
      if (typeof page === "string") {
        state.update((st) => {
          const np = (st.pages || []).find((p) => p.id === st.activePageId);
          if (np) np.name = page;
        });
      }
      flash("페이지 추가");
      const s2 = state.get();
      return { active: s2.activePageId, name: activePageName(s2), created: true };
    }
    switchPage(state, target.id);
    flash(`${target.name}(으)로 이동`);
    return { active: target.id, name: target.name, created: false };
  },

  /* 아트보드를 그린 내용에 맞춘다.
   *
   * 두 가지 사고를 한 번에 없앤다:
   *  ① 축 이름·한글 라벨이 아트보드 밖으로 나가 내보내기에서 **잘린다**.
   *     라벨은 평면·도형 바깥에 놓이는데, 아트보드를 손으로 정하면 그 폭을
   *     매번 눈대중해야 한다(2026-08-03 시연에서 두 번 겪었다).
   *  ② 여백이 넓으면 그림 자체는 작아진다 — PNG 의 실제 크기가 곧 시험지에
   *     들어가는 크기라, 빈 종이가 그림을 밀어낸다.
   *
   * 글자 폭은 **화면에 실제로 그려진 SVG** 를 재서 얻는다(getObjectBBox).
   * 서버에는 폰트 메트릭이 없으므로 이 계산은 앱만 할 수 있다. 그래서 그리기
   * 직후가 아니라 '다 그린 뒤 따로' 부르는 도구다 — 그때는 이미 렌더가 끝나 있다.
   */
  fitArtboard({ margin = 2, recenter = true } = {}) {
    const s = state.get();
    if (!s.objects.length) throw new Error("화면에 그려진 것이 없습니다");
    const pad = Math.max(0, Number(margin) || 0);
    // 좌표 기준 상자와 **화면에 실제로 그려진** 상자의 합집합을 쓴다.
    // 좌표 기준만 보면 안 되는 이유: coordplane 의 상자는 평면 사각형까지라
    // 그 바깥에 그려지는 축 이름("전압(V)")이 빠진다 — 실측에서 53.6mm 로 재
    // 아트보드를 잡았더니 실제 76.3mm 인 그림이 양옆으로 잘렸다(2026-08-03).
    // 반대로 DOM 은 아직 안 그려진 객체를 놓치므로, 둘을 합쳐 '덜 자르는' 쪽으로.
    const geo = getContentBounds(s, {}, 0);
    const dom = renderedBounds(s);
    const u = unionRect(geo, dom);
    if (!u) throw new Error("크기를 잴 수 있는 객체가 없습니다");
    const bb = { x: u.x - pad, y: u.y - pad, w: u.w + 2 * pad, h: u.h + 2 * pad };

    const before = { ...s.artboard };
    let dx = 0, dy = 0, w, h;
    if (recenter) {
      // 아트보드는 항상 원점 중심이라, 그림을 가운데로 옮겨야 딱 맞는다.
      dx = -(bb.x + bb.w / 2);
      dy = -(bb.y + bb.h / 2);
      w = bb.w; h = bb.h;
    } else {
      // 좌표를 건드리지 않는 대신, 원점 기준 먼 쪽에 맞춰 넓힌다.
      w = 2 * Math.max(Math.abs(bb.x), Math.abs(bb.x + bb.w));
      h = 2 * Math.max(Math.abs(bb.y), Math.abs(bb.y + bb.h));
    }
    const round1 = (v) => Math.max(10, Math.round(v * 10) / 10);
    w = round1(w); h = round1(h);

    state.update((st) => {
      st.undoStack.push(JSON.parse(JSON.stringify(st.objects)));
      st.redoStack = [];
      if (dx || dy) st.objects.forEach((o) => translateObject(o, dx, dy));
      st.artboard = { w, h };
    });
    flash(`아트보드 ${w}×${h}mm`);
    return {
      artboard: { w, h }, before, objects: s.objects.length,
      moved: { dx: Math.round(dx * 100) / 100, dy: Math.round(dy * 100) / 100 },
    };
  },

  // 아트보드(페이지) 크기 변경 — 기출 그림의 가로세로 비율을 맞추는 데 쓴다.
  // 원본이 정사각형에 가까운데 90×60으로 그리면 도형이 전부 눌려 보이기 때문.
  setArtboard({ w, h }) {
    const nw = Number(w), nh = Number(h);
    if (!Number.isFinite(nw) || !Number.isFinite(nh) || nw <= 0 || nh <= 0) {
      throw new Error("아트보드 크기는 0보다 큰 숫자여야 합니다");
    }
    state.update((s) => {
      s.undoStack.push(JSON.parse(JSON.stringify(s.objects)));
      s.redoStack = [];
      s.artboard = { w: nw, h: nh };
    });
    flash(`아트보드 ${nw}×${nh}mm`);
    return { artboard: { w: nw, h: nh } };
  },

  // 현재 페이지 비우기 (Ctrl+Z로 되돌아온다)
  clear() {
    let removed = 0;
    state.update((s) => {
      s.undoStack.push(JSON.parse(JSON.stringify(s.objects)));
      s.redoStack = [];
      removed = s.objects.length;
      s.objects = [];
      s.selectedIds = [];
    });
    flash("전부 지움 (Ctrl+Z로 되돌리기)");
    return { removed };
  },

  /* 지금 화면을 PNG로 찍어 보낸다 — Claude가 자기가 그린 그림을 **눈으로** 확인하는 통로.
   *
   * 왜 필요한가: getState 는 객체 id·타입·좌표만 준다. 그래서 선이 안 이어졌는지,
   * 라벨이 도형을 뚫고 나갔는지, 화살표가 반대인지는 좌표를 머릿속으로 재구성해야만
   * 알 수 있었다(2026-07-27 도르래 지지대가 끊긴 걸 교사가 사진으로 알려준 사건).
   *
   * 문서를 바꾸지 않는다. 파일도 만들지 않는다 — 캔버스를 base64 로 떠서 돌려줄 뿐이다.
   *
   * widthPx: 결과 가로 픽셀. 이미지는 토큰을 많이 먹으므로 기본을 낮게 잡고,
   *   자세히 봐야 할 때만 올린다. rasterizeExportCanvas 는 dpi 로 받으므로
   *   아트보드 실제 폭(mm)에서 필요한 dpi 를 역산한다.
   */
  async exportImage({ widthPx } = {}) {
    const s = state.get();
    if (!s.objects.length) throw new Error("화면에 그려진 것이 없습니다");
    // 글꼴 임베딩을 반드시 먼저 태운다 — 빠뜨리면 수식(Latin Modern)이 다른 글꼴로
    // 래스터라이즈돼, 화면과 다른 그림을 보고 판단하게 된다.
    await ensureEmbeddedFonts();
    const wantPx = Math.min(Math.max(Math.round(widthPx || 600), 200), 2000);
    const widthMm = s.artboard?.w || 90;
    const dpi = Math.max(24, Math.round((wantPx / widthMm) * MM_PER_INCH));
    const { canvas, widthMm: outW, heightMm: outH } = await rasterizeExportCanvas(s, { dpi });
    const dataUrl = canvas.toDataURL("image/png");
    return {
      mimeType: "image/png",
      base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
      widthPx: canvas.width,
      heightPx: canvas.height,
      artboardMm: { w: outW, h: outH },
      page: activePageName(s),
      objects: s.objects.length,
    };
  },

  /* 지금 화면을 **인쇄 품질 PNG(base64)** 로 만들어 돌려준다 — 서버가 파일로 저장하는
   * save_image 툴의 앱쪽 절반. exportImage 와 달리 dpi 를 그대로 받고(기본 300),
   * pHYs 청크를 새겨 한글/워드 삽입 크기가 맞는다. 파일 쓰기는 서버가 한다 —
   * 브라우저는 임의 경로에 쓸 수 없고, 쓰면 안 되기도 하다(저장은 통제된 통로로만). */
  async saveImagePng({ dpi } = {}) {
    const s = state.get();
    if (!s.objects.length) throw new Error("화면에 그려진 것이 없습니다");
    await ensureEmbeddedFonts();
    const useDpi = Math.min(Math.max(Math.round(dpi || 300), 72), 600);
    const { canvas, widthMm: outW, heightMm: outH } = await rasterizeExportCanvas(s, { dpi: useDpi });
    const dataUrl = canvas.toDataURL("image/png");
    const raw = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const stamped = new Uint8Array(insertPngPhys(bytes.buffer, useDpi));
    let bin = "";
    const CHUNK = 0x8000;   // 큰 이미지에서 호출 스택 초과를 피해 조각내어 인코딩
    for (let i = 0; i < stamped.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, stamped.subarray(i, i + CHUNK));
    }
    return {
      base64: btoa(bin),
      dpi: useDpi,
      widthPx: canvas.width,
      heightPx: canvas.height,
      artboardMm: { w: outW, h: outH },
      page: activePageName(s),
      objects: s.objects.length,
    };
  },
};

/* ----- 좌표·함수 묶기(seriesLock) -----
 * 그래프 도구로 만든 그래프는 평면과 계열이 한 그룹으로 묶여 함께 움직인다(기본 ON).
 * MCP로 들어온 그래프도 같아야 한다 — 안 묶이면 평면만 끌었을 때 곡선·수선의 발이
 * 제자리에 남아 축과 어긋난다. 방금 들어온 객체 중 평면(seriesLock !== false)과
 * 그 평면을 planeId로 가리키는 계열을 한 그룹으로 만든다. */
function lockPlanesToSeries(s, newIds) {
  const fresh = new Set(newIds);
  for (const plane of s.objects) {
    if (plane.type !== "coordplane" || !fresh.has(plane.id)) continue;
    if (plane.seriesLock === false) continue;
    const memberIds = [plane.id];
    for (const o of s.objects) {
      if (o.planeId === plane.id && fresh.has(o.id) && !o.groupId) memberIds.push(o.id);
    }
    if (memberIds.length < 2) continue;
    const gid = "grp_" + plane.id;
    for (const id of memberIds) {
      const o = s.objects.find((x) => x.id === id);
      if (o && !o.groupId) o.groupId = gid;
    }
    (s.groups = s.groups || []).push({ id: gid, memberIds });
  }
}

/* ----- 방금 넣은 것들을 한 덩어리로 묶기 -----
 * AI 는 초안까지만 그리고 위치 조정은 사람이 한다. 그런데 낱개로 넘기면 검전기
 * 하나를 옮기는 데 16개, 자기장 영역은 26개를 골라야 한다 — 그게 편집을 막는
 * 가장 큰 마찰이었다. 한 번의 호출로 만든 것은 한 단위로 보고 묶어서 넘긴다.
 * 더 잘게 만지고 싶으면 사람이 그룹을 풀면 된다(앱에 해제 UI 가 있다).
 *
 * 이미 다른 묶음에 든 것(그래프의 평면·곡선)은 건드리지 않는다 — 그 묶음이 더 정확하다. */
function groupObjects(s, newIds) {
  const members = newIds.filter((id) => {
    const o = s.objects.find((x) => x.id === id);
    return o && !o.groupId;
  });
  if (members.length < 2) return 0;
  const gid = "grp_" + members[0];
  for (const id of members) {
    const o = s.objects.find((x) => x.id === id);
    if (o) o.groupId = gid;
  }
  (s.groups = s.groups || []).push({ id: gid, memberIds: members });
  return members.length;
}

function activePageName(s) {
  const p = (s.pages || []).find((q) => q.id === s.activePageId);
  return p ? p.name : "페이지 1";
}
function nextId() {
  return `obj_${Date.now().toString(36)}_x${++idSeq}`;
}

/* ----- 연결 ----- */
async function findPort() {
  for (const p of PORTS) {
    try {
      const r = await fetch(`http://127.0.0.1:${p}/health`, { signal: AbortSignal.timeout(600) });
      if (r.ok && (await r.json()).server === "mcp-5e") return p;
    } catch { /* 그 포트엔 없음 — 다음 후보 */ }
  }
  return null;
}

async function respond(port, id, ok, payload) {
  try {
    await fetch(`http://127.0.0.1:${port}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ok ? { id, ok: true, data: payload } : { id, ok: false, error: String(payload) }),
    });
  } catch { /* 서버가 사라졌다 — 다음 명령에서 재연결된다 */ }
}

/* ----- 자동 재연결(워치독) -----
 * 왜 필요한가: 예전엔 페이지가 뜰 때 findPort()를 딱 한 번만 했다. 그때 MCP 서버가 아직
 * 안 떠 있었으면(Claude Code를 나중에 켬) 영영 끊긴 채로 남아, 사용자가 버튼을 눌러야만
 * 붙었다. EventSource 자체 재연결은 '같은 포트'로만 시도하므로 서버가 다른 포트(8580…)로
 * 올라오거나 세션이 바뀌면 그것도 소용이 없다. 그래서 끊겨 있는 동안 주기적으로 포트를
 * 다시 훑는다. 붙으면 멈추고, 끊기면 다시 돈다.
 * 간격은 2초에서 시작해 1.5배씩 늘려 최대 15초 — 서버가 없을 때 fetch 폭풍을 내지 않는다. */
const RETRY_MIN_MS = 2000;
const RETRY_MAX_MS = 15000;
let retryTimer = null;
let retryDelay = RETRY_MIN_MS;

function stopWatchdog() {
  clearTimeout(retryTimer);
  retryTimer = null;
  retryDelay = RETRY_MIN_MS;
}

function scheduleReconnect() {
  if (retryTimer || connecting) return;          // 이미 예약됐거나 수동 재시도 중
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    if (badgeState === "connected") return;      // 그 사이에 붙었다
    const port = await findPort();
    if (port) { connect(port); return; }         // connect()의 onopen이 워치독을 멈춘다
    // 하한을 RETRY_MIN_MS로 걸어 둔다 — retryNow()가 0으로 시작시켜도 다음 간격이
    // 0으로 굳어 fetch 폭풍이 되지 않게.
    retryDelay = Math.min(Math.max(Math.round(retryDelay * 1.5), RETRY_MIN_MS), RETRY_MAX_MS);
    scheduleReconnect();
  }, retryDelay);
}

// 탭을 다시 보거나 창에 포커스가 돌아오면 즉시 한 번 시도한다(백오프 대기 없이).
// 다른 창에서 Claude Code를 켜고 돌아오는 흐름이 가장 흔하기 때문.
function retryNow() {
  if (badgeState === "connected" || connecting) return;
  stopWatchdog();
  retryDelay = 0;        // 대기 없이 한 번 — 실패하면 위 백오프가 다시 2초부터 잡는다
  scheduleReconnect();
}

function connect(port, manual = false) {
  lastPort = port;
  if (source) { try { source.close(); } catch { /* 이미 닫힘 */ } }
  /* 내가 누구인지 밝히면서 붙는다 — 서버가 app_status 로 "지금 붙은 게 어느 창인지"를
   * 돌려줄 수 있어야 한다. 같은 포트의 다른 탭도 구분해야 하므로 창마다 다른 CLIENT_ID 를 쓴다.
   * (2026-07-27: 어느 창에 붙었는지 알 수 없어 교사 문서에 그림이 들어간 사고가 있었다) */
  // manual=1 은 "사람이 배지를 눌렀다"는 표시 — 서버는 이때만 다른 창의 연결을 넘겨준다.
  const q = `?cid=${encodeURIComponent(CLIENT_ID)}&href=${encodeURIComponent(location.href)}`
          + (manual ? "&manual=1" : "");
  source = new EventSource(`http://127.0.0.1:${port}/events${q}`);
  source.onopen = () => { stopWatchdog(); setBadge("connected", port); };
  /* 다른 창이 통로를 가져가면 서버가 알려준다. 조용히 끊기면 이 창에 그리고 있다고
   * 착각한 채 남의 문서를 건드리게 되므로, 화면에 분명히 띄운다. */
  source.addEventListener("evicted", () => {
    flash("MCP 연결을 다른 5E 창에 넘겼습니다 — 이 창에는 그려지지 않습니다");
  });
  source.onerror = () => {
    // EventSource는 같은 포트로만 재시도하므로 여기서 끊고 워치독에 넘긴다(포트가 바뀌어도 찾도록).
    if (source) { try { source.close(); } catch { /* 무시 */ } source = null; }
    setBadge("disconnected", port);
    scheduleReconnect();
  };
  source.onmessage = async (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    const fn = COMMANDS[msg.cmd];
    if (!fn) return respond(port, msg.id, false, `알 수 없는 명령: ${msg.cmd}`);
    // await 를 반드시 건다 — exportImage 처럼 비동기인 명령이 있다. 안 걸면 Promise
    // 객체가 그대로 직렬화돼 빈 {} 가 나간다(동기 명령은 await 해도 그대로다).
    try { respond(port, msg.id, true, await fn(msg.args || {})); }
    catch (e) { respond(port, msg.id, false, e.message); }
  };
}

/* ----- 연결 상태 버튼 -----
 * index.html에 이미 있는 정적 버튼(#mcp-bridge-btn, zoom 표시 옆 · fullscreen/theme
 * 토글과 같은 클래스)을 그대로 쓴다. 켜져 있을 때(localhost 또는 ?mcp=1)만 hidden을
 * 벗기고, 연결 안 됐을 때도 보여서 눌러서 다시 시도하거나 안내를 볼 수 있게 한다. */
function bridgeBtn() {
  return document.getElementById("mcp-bridge-btn");
}
let flashTimer = null;
let badgeState = "connecting"; // "connecting" | "connected" | "disconnected"
function setBadge(kind, port) {
  badgeState = kind;
  const b = bridgeBtn();
  if (!b) return;
  b.hidden = false;
  b.classList.toggle("mcp-connecting", kind === "connecting");
  if (kind === "connected") {
    b.setAttribute("aria-pressed", "true");
    b.title = `MCP 연결됨 (:${port}) — 클릭하면 상태 확인`;
  } else if (kind === "disconnected") {
    b.setAttribute("aria-pressed", "false");
    b.title = "MCP 연결 안 됨 — 클릭해서 다시 시도";
  } else {
    b.setAttribute("aria-pressed", "false");
    b.title = "MCP 서버를 찾는 중…";
  }
}
// 명령 처리 직후 잠깐 배경을 밝혀 "방금 반영됐다"는 걸 조용히 알린다(텍스트 배지가
// 아니라 아이콘 버튼이라 title만으론 눈에 안 띄어서 — 툴바 다른 토글과 같은 톤 유지).
function flash(text) {
  const b = bridgeBtn();
  if (!b) return;
  const baseTitle = b.title;
  b.classList.add("mcp-flash");
  if (text) b.title = `MCP · ${text}`;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { b.classList.remove("mcp-flash"); b.title = baseTitle; }, 1500);
}

/* ----- 버튼 클릭: 연결돼 있으면 상태만 보여주고, 안 돼 있으면 다시 붙어 본다 -----
 * 웹페이지는 보안상 컴퓨터의 프로그램(Claude Code·MCP 서버)을 직접 실행할 수 없다.
 * 그래서 이 버튼이 할 수 있는 최선은 "이미 떠 있는 서버에 다시 붙어보기"까지다.
 * Claude Code를 아예 안 켰다면 이 버튼으로는 켤 수 없고, 사용자가 직접 켜야 한다. */
async function handleBadgeClick() {
  if (badgeState === "connected") {
    let info = null;
    try { info = COMMANDS.ping(); } catch { /* 무시 */ }
    return showAlert(
      `연결된 포트: ${lastPort}\n` +
        (info ? `현재 페이지: ${info.page}, 객체 ${info.objects}개` : "") +
        `\n\n대화창에서 그냥 말씀하시면 이 화면에 바로 그려집니다.`,
      { title: "MCP 연결됨" }
    );
  }
  if (connecting) return;
  connecting = true;
  stopWatchdog();                    // 수동 재시도가 워치독과 겹치지 않게
  setBadge("connecting");
  const port = await findPort();
  connecting = false;
  // 사람이 직접 누른 것이므로 다른 창이 붙어 있어도 넘겨받는다.
  if (port) { connect(port, true); return; }

  setBadge("disconnected");
  scheduleReconnect();               // 수동 시도가 실패해도 이후엔 자동으로 계속 노린다
  const open = await showConfirm(
    "MCP 서버를 찾지 못했습니다.\n\n" +
      "확인할 것:\n" +
      "1. 컴퓨터에서 Claude Code가 실행 중이고, 'mcp-5e' 도구가 등록돼 있는지\n" +
      "   (터미널에서: claude mcp list 로 확인)\n" +
      "2. 등록 직후라면 Claude Code를 새 세션으로 다시 시작했는지\n" +
      "3. 이 화면이 http://localhost 로 열려 있는지 (지금 주소: " + location.origin + ")\n\n" +
      "웹페이지는 보안상 프로그램을 스스로 실행할 수 없어서, 이 버튼은\n" +
      "'이미 켜진 서버에 다시 붙어보기'만 할 수 있습니다.",
    { title: "MCP 연결 안 됨", okText: "설치 안내 열기", cancelText: "닫기" }
  );
  if (open) window.open(GUIDE_URL, "_blank", "noopener");
}

/* ----- 시작 -----
 * index.html이 이 파일을 <script type="module">로 직접 싣는다. 그래서 스스로 켜지되,
 * 다른 모듈이 import 했을 때 두 번 켜지지 않도록 한 번만 돌게 막아 둔다. */
/* ----- 미설치 사용자용: 버튼은 보이되, 포트는 두드리지 않는다 -----
 * 발견성(2026-07-31 교사 결정): 게이트를 안 켠 브라우저에도 버튼은 항상 보인다.
 * 눌렀을 때만 한 번 찾아 보고 — 찾으면 그 자리에서 켜지고(다음부터 자동 연결),
 * 못 찾으면 설치 안내를 띄운다. 백그라운드 포트 노크는 여전히 게이트 뒤에 있다. */
const GUIDE_URL = "https://github.com/seungyeon980808-pixel/5E/blob/main/tools/mcp-5e/GUIDE_FOR_TEACHERS.md";

async function handleInstallClick() {
  if (connecting) return;
  connecting = true;
  setBadge("connecting");
  const port = await findPort();
  connecting = false;
  if (port) {
    // 서버가 이미 떠 있다 = 설치된 사용자다. 이 브라우저에 켠 것으로 기억하고 정식 배선으로 전환.
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
    const b = bridgeBtn();
    b?.removeEventListener("click", handleInstallClick);
    b?.addEventListener("click", handleBadgeClick);
    connect(port, true);
    return;
  }
  setBadge("disconnected");
  const open = await showConfirm(
    "Claude에게 말로 그림을 시키는 기능입니다.\n" +
      "예: \"30° 경사면에 물체 두 개 그려줘\"\n\n" +
      "연결된 서버를 찾지 못했습니다.\n" +
      "· 처음이라면 — 설치가 한 번 필요합니다 (Claude 유료 구독 + Node.js, 약 10분)\n" +
      "· 이미 설치했다면 — Claude Code를 켠 뒤 이 버튼을 다시 눌러 보세요.",
    { title: "AI로 그리기 (MCP)", okText: "설치 안내 열기", cancelText: "닫기" }
  );
  if (open) window.open(GUIDE_URL, "_blank", "noopener");
}

let started = false;
export async function initMcpBridge() {
  if (started) return;
  started = true;
  if (!bridgeEnabled()) {
    // 게이트를 안 켠 브라우저: 포트를 두드리지 않되 버튼은 보인다(설치 안내 입구).
    const b = bridgeBtn();
    if (b) {
      b.hidden = false;
      b.setAttribute("aria-pressed", "false");
      b.title = "AI로 그리기 — 클릭: 연결 시도 / 설치 안내";
      b.addEventListener("click", handleInstallClick);
    }
    return;
  }
  bridgeBtn()?.addEventListener("click", handleBadgeClick);
  setBadge("connecting");            // 버튼을 먼저 보여준다 — 못 찾아도 눌러서 재시도할 수 있게
  // 탭 복귀·창 포커스에서 즉시 재시도(백오프를 기다리지 않는다).
  document.addEventListener("visibilitychange", () => { if (!document.hidden) retryNow(); });
  window.addEventListener("focus", retryNow);
  const port = await findPort();
  if (port) connect(port);
  else { setBadge("disconnected"); scheduleReconnect(); }   // 나중에 서버가 떠도 알아서 붙는다
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMcpBridge, { once: true });
} else {
  initMcpBridge();
}
