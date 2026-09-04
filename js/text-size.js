export const MIN_TEXT_SIZE_PT = 6;
export const MAX_TEXT_SIZE_PT = 400;

export function parseTextSize(value) {
  if (value === "" || value == null) return { ok: false, message: "글씨 크기를 입력해 주세요." };
  const size = Number(value);
  if (!Number.isFinite(size)) return { ok: false, message: "숫자로 입력해 주세요." };
  if (size < MIN_TEXT_SIZE_PT || size > MAX_TEXT_SIZE_PT) {
    return { ok: false, message: `${MIN_TEXT_SIZE_PT}~${MAX_TEXT_SIZE_PT}pt 범위로 입력해 주세요.` };
  }
  return { ok: true, value: Math.round(size * 10) / 10 };
}

export function clampTextSize(value, fallback = 12) {
  const size = Number(value);
  if (!Number.isFinite(size)) return fallback;
  return Math.min(MAX_TEXT_SIZE_PT, Math.max(MIN_TEXT_SIZE_PT, Math.round(size * 10) / 10));
}
