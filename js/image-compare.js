/* ===== IMAGE COMPARE (트레이싱 원본 vs 내가 그린 오브젝트 좌우 비교) =====
 *
 * 목적: 이미지를 흐리게(투명도) 깔고 그 위에 트레이싱한 뒤, 얼마나 닮았는지
 * 확인하기 어려운 문제를 해결한다. 영역을 지정하면 팝업이 뜨고
 *   - 좌 = 삽입한 이미지 "원본"(흐리게 해둔 상태가 아니라 불투명 원본 그대로)
 *   - 우 = 내가 그린 오브젝트들(참조 이미지 제외)
 * 을 같은 bounds·같은 배율로 좌우 나란히 보여준다.
 *
 * ※ 요구서 "비교 중 이미지 투명도 0" 은 '원본 그대로(불투명) 보이게'로 해석한다.
 *   원래 캔버스의 이미지 투명도 설정 자체는 건드리지 않는다(팝업을 닫으면 그대로).
 *
 * 원칙: 순수 표시 기능 — state / undo / export / 프로젝트 저장 어디에도 흔적을
 *   남기지 않는다. 열고 닫으면 사라진다.
 *
 * 인프라 재사용:
 *   - 영역 드래그+Enter: export-dialog.js runAreaCapture(svg, state, onDone, hint)
 *   - 우측 오브젝트 래스터화: svg-export.js rasterizeExportCanvas(..., { options:{ includeReferenceImages:false } })
 *   - 좌측 원본: 대상 이미지 객체 src(dataURL/URL)를 bounds에 해당하는 부분만 크롭.
 *     이미지 객체는 <image x y width height href=src>로 그려지며(world y는 아래로 증가,
 *     preserveAspectRatio 없이 박스에 꽉 채움) → world→source 매핑이 균일하다.
 */

import { runAreaCapture } from "./export-dialog.js?v=0.54.10";
import { rasterizeExportCanvas } from "./svg-export.js?v=0.54.10";

let _overlay = null; // 비교 모달 오버레이(1회 생성 후 재사용)
let _els = null;     // 자주 쓰는 하위 요소 캐시

/* ----- 원본 이미지 로드(캐시) ----- */
const _imgCache = {};
function loadOriginal(src) {
  if (_imgCache[src]) return Promise.resolve(_imgCache[src]);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { _imgCache[src] = img; resolve(img); };
    img.onerror = () => reject(new Error("원본 이미지 로드 실패"));
    img.src = src;
  });
}

/* ----- 모달 DOM 1회 생성 (exam-preview.js 패턴을 좌우 2분할로 본뜸) ----- */
function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.hidden = true;

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.style.width = "auto";
  modal.style.maxWidth = "calc(100vw - 32px)";
  modal.style.gap = "12px";

  const title = document.createElement("h2");
  title.className = "modal-title";
  title.textContent = "이미지 비교";
  modal.appendChild(title);

  // 좌(원본) · 우(그린 것) 2분할 무대.
  const stage = document.createElement("div");
  stage.style.cssText =
    "display:flex;gap:12px;align-items:flex-start;justify-content:center;" +
    "overflow:auto;max-height:74vh;flex-wrap:wrap;";
  modal.appendChild(stage);

  const leftPane = makePane("삽입한 원본 이미지");
  const rightPane = makePane("내가 그린 오브젝트");
  stage.appendChild(leftPane.wrap);
  stage.appendChild(rightPane.wrap);

  const info = document.createElement("div");
  info.style.cssText =
    "font-size:12px;color:var(--text-secondary,#57606a);line-height:1.5;";
  modal.appendChild(info);

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "modal-btn modal-btn-primary";
  closeBtn.textContent = "닫기";
  closeBtn.addEventListener("click", hide);
  actions.appendChild(closeBtn);
  modal.appendChild(actions);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // 바깥 클릭 / Escape로 닫기.
  overlay.addEventListener("click", (e) => { if (e.target === overlay) hide(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) {
      e.preventDefault();
      e.stopImmediatePropagation();
      hide();
    }
  }, true);

  _overlay = overlay;
  _els = { info, left: leftPane, right: rightPane };
}

/* ----- 한 칸(제목 + 캔버스 자리) ----- */
function makePane(label) {
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;flex-direction:column;gap:6px;align-items:center;flex:0 0 auto;";
  const cap = document.createElement("div");
  cap.textContent = label;
  cap.style.cssText = "font-size:12px;font-weight:600;color:var(--text-secondary,#57606a);";
  const box = document.createElement("div");
  box.style.cssText =
    "background:var(--bg-input,#f0f2f5);border:1px solid var(--border,#d0d7de);" +
    "border-radius:8px;padding:8px;display:flex;align-items:center;justify-content:center;";
  wrap.appendChild(cap);
  wrap.appendChild(box);
  return { wrap, box };
}

function hide() {
  if (_overlay) _overlay.hidden = true;
  // 캔버스 정리(다음 비교 때 새로 채운다).
  if (_els) { _els.left.box.innerHTML = ""; _els.right.box.innerHTML = ""; }
}

/* ----- bounds(world {x,y,w,h})에 해당하는 원본 이미지 크롭 캔버스 -----
 * 이미지 객체는 world 박스 [obj.x, obj.y, obj.w, obj.h]에 원본을 꽉 채워 그린다.
 * 따라서 world→원본픽셀 매핑은 축별 균일:
 *   sx = (bounds.x - obj.x)/obj.w * naturalWidth  (y도 동일)
 * rotation!==0 이면 정확한 크롭이 어려워, 이 경우엔 원본 전체를 표시한다(가정 명시). */
function cropOriginal(img, obj, bounds, displayW, displayH) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(displayW));
  canvas.height = Math.max(1, Math.round(displayH));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";

  const nw = img.naturalWidth || img.width || 1;
  const nh = img.naturalHeight || img.height || 1;

  if (obj.rotation) {
    // 회전된 이미지는 정밀 크롭 대신 전체를 채워 넣는다(비교 근사).
    ctx.drawImage(img, 0, 0, nw, nh, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  const pxPerWx = nw / obj.w;
  const pxPerWy = nh / obj.h;
  let sx = (bounds.x - obj.x) * pxPerWx;
  let sy = (bounds.y - obj.y) * pxPerWy;
  let sw = bounds.w * pxPerWx;
  let sh = bounds.h * pxPerWy;

  // 소스 영역이 이미지 밖으로 나가면 흰색으로 채우고, 겹치는 부분만 그린다.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const clipX = Math.max(0, sx);
  const clipY = Math.max(0, sy);
  const clipR = Math.min(nw, sx + sw);
  const clipB = Math.min(nh, sy + sh);
  if (clipR > clipX && clipB > clipY) {
    const scaleX = canvas.width / sw;
    const scaleY = canvas.height / sh;
    const dx = (clipX - sx) * scaleX;
    const dy = (clipY - sy) * scaleY;
    const dw = (clipR - clipX) * scaleX;
    const dh = (clipB - clipY) * scaleY;
    ctx.drawImage(img, clipX, clipY, clipR - clipX, clipB - clipY, dx, dy, dw, dh);
  }
  return canvas;
}

/* ----- 지정 영역을 좌우로 렌더 ----- */
async function renderCompare(state, imageObj, bounds) {
  const { info, left, right } = _els;
  left.box.innerHTML = "";
  right.box.innerHTML = "";

  // 1) 우측: export와 동일 경로로 래스터화 — 참조 이미지 제외 옵션으로 "그린 것만".
  let art;
  try {
    art = await rasterizeExportCanvas(state.get(), {
      dpi: 300,
      bounds,
      // includeReferenceImages:false → 참조(잠긴/배경) 이미지 제외.
      // excludeAllImages:true → 편집 모드의 비교 대상 이미지까지 포함해 모든
      // 이미지를 제외 → 우측은 순수하게 "내가 그린 오브젝트만" 남는다.
      options: { includeReferenceImages: false, excludeAllImages: true },
    });
  } catch (_) {
    info.textContent = "그린 오브젝트를 준비하는 중 오류가 발생했습니다.";
    return;
  }

  // 표시 배율: 우측 래스터의 실제 mm 크기를 기준으로 창에 맞춰 축소한다.
  // 좌우 모두 같은 bounds(mm)를 같은 px/mm로 표시해야 비교가 유효하므로
  // 하나의 displayW/H를 계산해 둘 다에 적용한다.
  const maxSide = Math.min((window.innerWidth || 1200) * 0.42, 520);
  const mmW = art.widthMm || bounds.w || 1;
  const mmH = art.heightMm || bounds.h || 1;
  const scale = Math.min(maxSide / mmW, maxSide / mmH, 8); // px/mm, 과확대 방지
  const displayW = Math.max(1, mmW * scale);
  const displayH = Math.max(1, mmH * scale);

  // 2) 좌측: 원본 이미지 크롭.
  let leftCanvas = null;
  try {
    const img = await loadOriginal(imageObj.src);
    leftCanvas = cropOriginal(img, imageObj, bounds, displayW, displayH);
  } catch (_) {
    const msg = document.createElement("div");
    msg.style.cssText = "font-size:12px;color:var(--text-secondary,#57606a);padding:20px;";
    msg.textContent = "원본 이미지를 불러오지 못했습니다.";
    left.box.appendChild(msg);
  }
  if (leftCanvas) {
    leftCanvas.style.cssText = `display:block;width:${displayW}px;height:${displayH}px;`;
    left.box.appendChild(leftCanvas);
  }

  // 우측 래스터 캔버스: 내부 해상도는 그대로, CSS 크기만 좌측과 동일하게.
  const rc = art.canvas;
  rc.style.cssText = `display:block;width:${displayW}px;height:${displayH}px;background:#fff;`;
  right.box.appendChild(rc);

  info.innerHTML =
    `비교 영역 <strong>${mmW.toFixed(0)} × ${mmH.toFixed(0)} mm</strong>` +
    ` · 좌 = 삽입 원본(불투명) · 우 = 그린 오브젝트(참조 이미지 제외)` +
    (imageObj.rotation ? `<br>※ 회전된 이미지라 좌측은 원본 전체를 근사 표시합니다.` : "");
}

/* ----- 공개 진입점: 인스펙터 '비교' 버튼이 호출 -----
 * state = 앱 state, imageObj = 비교할 이미지 객체(없으면 무시). */
export function startImageCompare(state, imageObj) {
  if (!imageObj || imageObj.type !== "image" || !imageObj.src) return;
  const svg = document.getElementById("canvas");
  if (!svg) return;

  // 영역 드래그 → 핸들 조절 → Enter 확정(export의 runAreaCapture 재사용).
  runAreaCapture(svg, state, (bounds) => {
    if (!bounds) return; // 취소
    if (!_overlay) buildModal();
    _overlay.hidden = false;
    renderCompare(state, imageObj, bounds);
  }, "비교할 영역을 드래그하십시오");
}
