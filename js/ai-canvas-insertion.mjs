export async function performCanvasInsertion({
  insert,
  onSuccess,
  onFailure,
  close,
} = {}) {
  try {
    const result = await insert();
    onSuccess?.(result);
    close?.();
    return { ok: true, result };
  } catch (error) {
    const detail = error?.message || String(error);
    const message = `캔버스 삽입 실패: ${detail}. 창은 그대로 유지됩니다. 현재 결과를 확인한 뒤 다시 시도하세요.`;
    onFailure?.(message, error);
    return { ok: false, error, message };
  }
}
