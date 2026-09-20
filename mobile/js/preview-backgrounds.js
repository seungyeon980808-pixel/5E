/* ===== 인쇄 비교 배경 이미지 (사용자 등록) =====
 *
 * 사용자가 '기본값 설정' 모달에서 등록한 배경 이미지(실제 인쇄해 본 시험지 스캔 등)를
 * localStorage에 보관하고, 시험지 미리보기(exam-preview.js)가 배경 후보로 함께 쓴다.
 *
 * 저장 형식(localStorage "5e.previewBackgrounds"):
 *   [{ id, name, dataUrl, widthMm, heightMm }]
 *   - dataUrl: 업로드 이미지를 긴 변 MAX_DIM 이하로 리사이즈해 PNG dataURL로 보관
 *     (원본 그대로 넣으면 localStorage 용량을 금방 초과하므로 축소한다)
 *   - widthMm/heightMm: 실제 인쇄 물리 크기(mm) — 미리보기의 '실제 크기로 얹기'에 필요
 *
 * 이 키는 settings.js의 설정 저장/불러오기 대상(PERSONAL_KEYS)에도 포함되어,
 * 브라우저 캐시가 지워져도 설정 파일로 왕복할 수 있다.
 */

export const PREVIEW_BG_KEY = "5e.previewBackgrounds";
const MAX_DIM = 2000; // 리사이즈 상한(긴 변 px)

export function loadPreviewBackgrounds() {
  try {
    const raw = localStorage.getItem(PREVIEW_BG_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

function saveList(list) {
  try {
    localStorage.setItem(PREVIEW_BG_KEY, JSON.stringify(list));
    return true;
  } catch (_) {
    // 대개 용량 초과(QuotaExceededError). 호출부에서 false를 보고 안내한다.
    return false;
  }
}

export function removePreviewBackground(id) {
  const next = loadPreviewBackgrounds().filter((b) => b.id !== id);
  saveList(next);
  return next;
}

/* 파일(File) → 리사이즈 PNG dataURL. 실패 시 reject. */
function fileToResizedDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ dataUrl: canvas.toDataURL("image/png"), naturalW: img.naturalWidth, naturalH: img.naturalHeight });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지를 읽을 수 없습니다.")); };
    img.src = url;
  });
}

/* 새 배경 등록. { name, widthMm, heightMm, file } → 저장된 항목 반환(실패 시 throw).
 * widthMm/heightMm가 비어 있으면 종이 A4 기본값(210×297)을 쓰되, 이미지 종횡비에
 * 맞춰 높이를 보정해 제안한다(사용자가 나중에 편집 가능하도록 값 자체는 그대로 저장). */
export async function addPreviewBackground({ name, widthMm, heightMm, file }) {
  if (!file) throw new Error("이미지 파일을 선택하세요.");
  const { dataUrl } = await fileToResizedDataUrl(file);
  const item = {
    id: `pbg_${Date.now().toString(36)}`,
    name: (name && name.trim()) || file.name || "배경 이미지",
    dataUrl,
    widthMm: Number(widthMm) > 0 ? Number(widthMm) : 210,
    heightMm: Number(heightMm) > 0 ? Number(heightMm) : 297,
  };
  const list = loadPreviewBackgrounds();
  list.push(item);
  if (!saveList(list)) {
    throw new Error("저장 공간이 부족합니다. 기존 배경을 삭제한 뒤 다시 시도하세요.");
  }
  return item;
}
