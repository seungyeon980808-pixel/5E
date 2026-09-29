import { BACKGROUND_POLICIES } from "./image-background-options.js?v=1.6.0-preview-labeler-0917-1111";

export const DEFAULT_IMAGE_OUTPUT_OPTIONS = Object.freeze({
  backgroundPolicy: "preserve",
  examPalette: false,
  lineThickness: 0,
});

export function normalizeImageOutputOptions(value = {}) {
  return {
    backgroundPolicy: BACKGROUND_POLICIES.has(value?.backgroundPolicy)
      ? value.backgroundPolicy
      : DEFAULT_IMAGE_OUTPUT_OPTIONS.backgroundPolicy,
    examPalette: value?.examPalette === true,
    lineThickness: [0, 1, 2].includes(Number(value?.lineThickness))
      ? Number(value.lineThickness)
      : DEFAULT_IMAGE_OUTPUT_OPTIONS.lineThickness,
  };
}

export function imageOutputOptionsKey(value) {
  const options = normalizeImageOutputOptions(value);
  return `${options.backgroundPolicy}:${options.examPalette ? "gray" : "color"}:line-${options.lineThickness}`;
}

export async function resolveImageOutput(item, value, transform) {
  if (!item?.data) throw new Error("처리할 이미지가 없습니다.");
  if (item.sceneResult) return item.data;
  const options = normalizeImageOutputOptions(value);
  if (options.backgroundPolicy === "preserve" && !options.examPalette && options.lineThickness === 0) return item.data;
  if (typeof transform !== "function") throw new Error("이미지 처리기를 사용할 수 없습니다.");
  return transform(item.data, options);
}
