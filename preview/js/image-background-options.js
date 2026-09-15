export const IMAGE_BACKGROUND_VERSION = "image-background-v4-policies";

export const EXAM_GRAY_PALETTE = Object.freeze([0, 176, 255]);

/* 각 경로의 수치와 보존 의미를 함께 공개한다. 호출자는 한 threshold를 모든 경로에
 * 재사용하지 말고, 선택한 정책의 전용 options만 덮어써야 한다. */
export const IMAGE_BACKGROUND_POLICY_OPTIONS = Object.freeze({
  connected: Object.freeze({
    threshold: 250,
    neutralTolerance: 8,
    ambiguityThreshold: 235,
    ambiguityNeutralTolerance: 12,
    enclosedLight: "preserve",
    openInterior: "preserve-and-review",
    ambiguousLight: "preserve-and-review",
    translucentPixels: "preserve-exact-rgba",
    realAlphaFrame: "preserve-exact-rgba",
    drawnCheckerboard: "preserve-and-review",
  }),
  "all-near-white": Object.freeze({
    threshold: 235,
    neutralTolerance: 12,
    enclosedLight: "remove",
    antialiasedLight: "convert-to-coverage-alpha",
    translucentPixels: "convert-when-qualifying",
  }),
  checkerboard: Object.freeze({
    threshold: 205,
    neutralTolerance: 18,
    minimumPixels: 24,
    minimumToneGap: 8,
    nonCheckerLight: "preserve",
    uncertainPattern: "preserve-and-review",
    realAlphaFrame: "preserve-exact-rgba",
  }),
  preserve: Object.freeze({
    backgroundPixels: "preserve",
    sourceRgba: "preserve-exact-rgba",
  }),
});

export const IMAGE_BACKGROUND_SCOPE_OPTIONS = Object.freeze({
  changeMask: "one-allows-processing-zero-preserves-exact-rgba",
  preserveMask: "one-preserves-exact-rgba",
});

export const BACKGROUND_POLICIES = new Set(Object.keys(IMAGE_BACKGROUND_POLICY_OPTIONS));
