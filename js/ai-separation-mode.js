import { normalizeImageOutputOptions } from './ai-output-processing.js?v=1';

const MODES = new Set(['off', 'auto', 'grid', 'manual']);
export const SEPARATION_BACKGROUND_HINT = '물체별 분리는 바깥 배경을 제거합니다. 배경 설정을 바꾸려면 한 장으로 전환하세요.';
export const SEPARATION_LIMITS_HINT = '맞닿거나 겹친 물체는 함께 분리될 수 있습니다. 내부 선은 벡터화하지 않습니다.';

export function transitionSeparationMode(current, separationMode) {
  if (!MODES.has(separationMode)) throw new RangeError('분리 방식을 확인해 주세요.');
  const outputOptions = normalizeImageOutputOptions(current?.outputOptions);
  const singleBackgroundPolicy = !current?.separationMode || current.separationMode === 'off'
    ? outputOptions.backgroundPolicy
    : normalizeImageOutputOptions({ backgroundPolicy: current.singleBackgroundPolicy }).backgroundPolicy;
  const backgroundLocked = separationMode !== 'off';
  return {
    separationMode,
    singleBackgroundPolicy,
    outputOptions: { ...outputOptions, backgroundPolicy: backgroundLocked ? 'connected' : singleBackgroundPolicy },
    backgroundLocked,
    backgroundHint: backgroundLocked ? SEPARATION_BACKGROUND_HINT : '',
  };
}
