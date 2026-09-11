import { BACKGROUND_POLICIES } from "./image-background-options.js";

export const DEFAULT_IMAGE_OUTPUT_OPTIONS = Object.freeze({
  backgroundPolicy: "preserve",
  examPalette: false,
});

export function normalizeImageOutputOptions(value = {}) {
  return {
    backgroundPolicy: BACKGROUND_POLICIES.has(value?.backgroundPolicy)
      ? value.backgroundPolicy
      : DEFAULT_IMAGE_OUTPUT_OPTIONS.backgroundPolicy,
    examPalette: value?.examPalette === true,
  };
}

export function imageOutputOptionsKey(value) {
  const options = normalizeImageOutputOptions(value);
  return `${options.backgroundPolicy}:${options.examPalette ? "gray" : "color"}`;
}

export async function resolveImageOutput(item, value, transform) {
  if (!item?.data) throw new Error("처리할 이미지가 없습니다.");
  if (item.sceneResult) return item.data;
  const options = normalizeImageOutputOptions(value);
  if (options.backgroundPolicy === "preserve" && !options.examPalette) return item.data;
  if (typeof transform !== "function") throw new Error("이미지 처리기를 사용할 수 없습니다.");
  return transform(item.data, options);
}
