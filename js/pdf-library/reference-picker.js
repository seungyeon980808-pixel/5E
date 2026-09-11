let openPicker = null;

export function registerPdfReferencePicker(handler) {
  openPicker = typeof handler === "function" ? handler : null;
  return () => {
    if (openPicker === handler) openPicker = null;
  };
}

export async function openPdfReferencePicker(options) {
  if (!openPicker) throw new Error("PDF 기출문제 라이브러리를 열 수 없습니다.");
  await openPicker(options);
}
