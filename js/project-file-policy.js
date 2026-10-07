// Encoded .5e/.json input budget, inclusive. A 64 MiB embedded image expands to
// ~85.34 MiB in base64; 128 MiB leaves room for document data without allowing
// the backup restore aggregate budget (256 MiB) as one unchecked text input.
export const MAX_PROJECT_FILE_BYTES = 128 * 1024 * 1024;

export function projectFileSizeError(file) {
  if (file.size <= MAX_PROJECT_FILE_BYTES) return null;
  return `파일 용량: ${file.size.toLocaleString("ko-KR")}바이트 (${(file.size / 1024 / 1024).toFixed(2)} MiB).\n` +
    `프로젝트 파일은 128 MiB (${MAX_PROJECT_FILE_BYTES.toLocaleString("ko-KR")}바이트)까지 열 수 있습니다.\n` +
    "이미지 해상도를 줄이거나 페이지를 나누어 더 작은 프로젝트 파일로 저장한 뒤 다시 열어 주세요. 현재 작업은 그대로 유지됩니다.";
}
