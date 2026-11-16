import { normalizeImageOutputOptions } from './ai-output-processing.js?v=1.7.0-four-session-integration';

const MODES = new Set(['off', 'auto', 'grid', 'manual']);
// 11-09: 막다른 안내(「한 장으로 전환하세요」)를 없앴다. 배경과 분리는 묶지 않고, 배경을 「원본 유지」로 바꾸면 분리도 한 장으로 같이 바뀐다.
export const SEPARATION_BACKGROUND_HINT = '물체별 분리는 바깥 흰 배경을 지운 그림을 나눕니다. 배경을 「원본 유지」로 바꾸면 한 장으로 돌아갑니다.';
export const SEPARATION_LIMITS_HINT = '맞닿거나 겹친 물체는 함께 분리될 수 있습니다. 내부 선은 벡터화하지 않습니다.';

export function transitionSeparationMode(current, separationMode) {
  if (!MODES.has(separationMode)) throw new RangeError('분리 방식을 확인해 주세요.');
  const outputOptions = normalizeImageOutputOptions(current?.outputOptions);
  const singleBackgroundPolicy = !current?.separationMode || current.separationMode === 'off'
    ? outputOptions.backgroundPolicy
    : normalizeImageOutputOptions({ backgroundPolicy: current.singleBackgroundPolicy }).backgroundPolicy;
  const separating = separationMode !== 'off';
  // 분리하는 동안에도 배경 단추는 묶지 않는다: 지우는 방식(바깥 흰색·안쪽 흰색까지)은 그대로 두고, 「원본 유지」일 때만 바깥 흰색 제거로 맞춘다.
  const removal = ['connected', 'all-near-white'].includes(outputOptions.backgroundPolicy) ? outputOptions.backgroundPolicy : 'connected';
  return {
    separationMode,
    singleBackgroundPolicy,
    outputOptions: { ...outputOptions, backgroundPolicy: separating ? removal : singleBackgroundPolicy },
    backgroundLocked: false,
    backgroundHint: separating ? SEPARATION_BACKGROUND_HINT : '',
  };
}
