import { isWhitePngWorkflow } from "./ai-white-png.js?v=1.6.0-preview-labeler-0917-1111";
export const KICE_IMAGE_WORKFLOW_VERSION = "kice-white-png-v1";
export const KICE_IMAGE_MODE = "diagram";
export const KICE_IMAGE_OUTPUT_ENGINE = "raster";
export const KICE_REFERENCE_CLEANUP_REQUEST = "첨부한 과학 그림을 글자 없는 흑백 도식(순백색 배경 PNG)으로 재구성해 줘. 물체 종류와 개수, 연결·접촉·겹침, 액체층, 상대 배치를 보존하고 글자·숫자·라벨·수식은 제거해 줘. 표면 질감과 제품 장식은 줄이되 과학적 구조는 임의로 생략하지 마.";
export function kiceImageRequest(value, { hasImage = false } = {}) {
  const request = String(value || "").trim();
  return request || (hasImage ? KICE_REFERENCE_CLEANUP_REQUEST : "");
}
export function enforceKiceImageRunInput(input = {}) {
  const mode = input.mode || KICE_IMAGE_MODE;
  const outputEngine = input.outputEngine || KICE_IMAGE_OUTPUT_ENGINE;
  const result = { ...input, mode, outputEngine };
  return isWhitePngWorkflow(result)
    ? { ...result, qualityMode: "simple", complexPass: 1, complexCorrectionScheduled: false }
    : result;
}
