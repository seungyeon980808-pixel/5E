import { BlurReveal } from './blur-reveal.js';
import { RevealStatus } from './reveal-status.js';
import { trackLoadingMotion } from './activity-visibility.js';

const COPY = Object.freeze({
  image: { start: '시험지 스타일로 다시 그리고 있어요', slow: '평소보다 조금 더 걸리고 있어요', verySlow: '아직 작업 중이에요 · 원본은 그대로 있어요', done: '시험지 스타일로 바꿨어요', failed: '변환하지 못했어요 · 원본은 그대로예요' },
  graph: { start: '그래프에서 축과 눈금을 읽고 있어요', slow: '조금 더 걸리고 있어요 · 계속 진행 중', done: '이제 직접 고칠 수 있어요', failed: '그래프를 읽지 못했어요 · 원본은 그대로예요' },
});
const samples = new Map();
export function estimateLoadingMs(kind, model, saved = []) {
  const values = [...(samples.get(`${kind}:${model}`) || []), ...saved].filter(n => Number.isFinite(n) && n >= 1000).sort((a,b) => a-b);
  return values.length ? values[Math.floor(values.length / 2)] : null;
}

export function createWorkbenchLoading({ host, legacy, panel }) {
  const frame = document.createElement('div');
  frame.className = 'ai-loading-frame'; frame.hidden = true; frame.dataset.aiLoadingFrame = '';
  const picture = document.createElement('div'), caption = document.createElement('div');
  picture.className = 'ai-loading-picture'; caption.className = 'ai-loading-caption';
  picture.append(caption); frame.append(picture); host.append(frame);
  const reveal = BlurReveal.attach(picture, { variant: 'focus', fit: 'contain' });
  const status = RevealStatus.attach(caption, { layout: 'band' });
  const releaseMotion = trackLoadingMotion(frame);
  let active = null, epoch = 0, timers = [], clock = null;
  const elapsed = run => Math.max(0, (run.endedAt ?? Date.now()) - run.startedAt);
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; clearInterval(clock); clock = null; };
  const layout = () => {
    if (!active?.size || frame.hidden || !host.clientWidth || !host.clientHeight) return;
    const [sw, sh] = active.size;
    const availableW = Math.max(1, host.clientWidth - 16);
    const source = panel.querySelector('.is-ai-active-source .ai-preview-stage > img');
    const sourceBox = source?.getBoundingClientRect(), hostBox = host.getBoundingClientRect();
    // Reuse the workbench's fitted source size instead of fitting a second,
    // smaller image around a caption. The band overlays the image itself.
    const sourceVisible = sourceBox?.width > 0 && sourceBox?.height > 0;
    const scale = sourceVisible
      ? Math.min(sourceBox.width / sw, sourceBox.height / sh, host.clientWidth / sw)
      : Math.min(availableW / sw, Math.max(1, host.clientHeight - 16) / sh);
    const width = Math.max(1, sw * scale), height = Math.max(1, sh * scale);
    frame.style.width = `${width}px`; picture.style.width = `${width}px`; picture.style.height = `${height}px`;
    frame.style.left = `${(host.clientWidth - width) / 2}px`;
    frame.style.top = `${sourceVisible && panel.dataset.aiLayout === 'side-by-side'
      ? sourceBox.top + sourceBox.height / 2 - hostBox.top - height / 2
      : (host.clientHeight - height) / 2}px`;
  };
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(layout) : null;
  resize?.observe(host);
  const sourceChanges = new MutationObserver(layout);
  const referenceList = panel.querySelector('[data-ai-reference-list]');
  if (referenceList) sourceChanges.observe(referenceList, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });
  referenceList?.addEventListener('scroll', layout, true);
  const tick = () => { if (active) status.setElapsed(elapsed(active)); };
  const reset = () => {
    epoch++; clearTimers(); active = null; reveal.reset(); status.reset(); frame.hidden = true;
    delete panel.dataset.blurLoading; frame.removeAttribute('aria-busy');
    frame.dataset.loadingState = 'idle'; legacy.removeAttribute('aria-hidden');
  };
  const showOriginal = run => {
    if (active !== run || run.settling || !run.visible || !run.original || run.revealing) return;
    run.revealing = true;
    layout();
    void reveal.start(run.original, elapsed(run)).catch(() => {
      if (active === run && !run.settling) reveal.reset();
    });
  };
  const setPhase = message => {
    if (!active || active.settling || !message) return;
    active.message = message;
    if (active.visible) status.set(message);
  };
  const begin = ({ token, source, kind = 'image', model, expectedMs, startedAt = Date.now() }) => {
    if (active?.token === token || !source) return;
    reset();
    const copy = COPY[kind] || COPY.image;
    const own = ++epoch;
    const run = active = { token, source, copy, kind, model, startedAt, settling: false, message: copy.start, size: [4, 3] };
    frame.hidden = false; frame.dataset.loadingState = 'pending'; frame.style.opacity = '0';
    frame.setAttribute('aria-busy', 'true');
    panel.dataset.blurLoading = 'true'; legacy.setAttribute('aria-hidden', 'true');
    layout();
    const image = typeof source === 'string' ? new Image() : source;
    if (typeof source === 'string') { image.decoding = 'async'; image.src = source; }
    const ready = () => {
      if (active !== run || run.settling) return;
      const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
      if (!width || !height) return;
      run.original = image; run.size = [width, height]; layout(); showOriginal(run);
    };
    if (image instanceof HTMLImageElement) void image.decode().then(ready, () => {}); else ready();
    timers.push(setTimeout(() => {
      if (epoch !== own || run.settling) return;
      run.visible = true; frame.style.opacity = '1'; status.show(run.message); tick(); layout(); showOriginal(run);
    }, Math.max(0, 150 - elapsed(run))));
    clock = setInterval(tick, 1000);
    if (Number.isFinite(expectedMs) && expectedMs > 0) {
      timers.push(setTimeout(() => { if (epoch === own && !run.settling) setPhase(copy.slow); }, Math.max(0, expectedMs - elapsed(run))));
      if (copy.verySlow) timers.push(setTimeout(() => { if (epoch === own && !run.settling) setPhase(copy.verySlow); }, Math.max(0, expectedMs * 2 - elapsed(run))));
    }
  };
  const sharpFallback = (run, source) => {
    reveal.reset();
    const image = new Image(); image.alt = source === run.source ? '원본' : '생성 결과'; image.src = source;
    image.className = 'br-final'; image.style.objectFit = 'contain'; image.style.opacity = '1';
    reveal.stage.append(image);
  };
  const finish = async ({ token, outcome, result } = {}) => {
    if (!active || active.token !== token || active.settling) return;
    if (outcome === 'cancelled') { reset(); return; }
    const run = active, own = epoch;
    run.settling = true; run.endedAt = Date.now(); clearTimers();
    let failed = outcome === 'failed' || !result;
    if (elapsed(run) < 150) { reset(); return; }
    frame.dataset.loadingState = failed ? 'failed' : 'completed'; frame.style.opacity = '1';
    frame.removeAttribute('aria-busy');
    if (!run.visible) status.show(run.message);
    if (failed) status.fail(run.copy.failed); else status.done(run.copy.done);
    tick(); layout();
    try {
      if (reveal.state === 'loading') await reveal.complete(failed ? run.source : result);
      else {
        const image = new Image(); image.src = failed ? run.source : result; await image.decode();
        if (epoch !== own) return;
        run.size = [image.naturalWidth, image.naturalHeight]; layout(); sharpFallback(run, image.src);
      }
    } catch {
      if (epoch !== own) return;
      failed = true;
      sharpFallback(run, run.source);
      frame.dataset.loadingState = 'failed'; status.fail(run.copy.failed); tick();
    }
    if (epoch !== own) return;
    if (!failed) {
      const key = `${run.kind}:${run.model}`, values = samples.get(key) || [];
      samples.set(key, [...values, elapsed(run)].slice(-20));
    }
    frame.removeAttribute('aria-busy');
    timers.push(setTimeout(reset, failed ? 6000 : 1000));
  };
  return { begin, finish, reset, setPhase, frame, destroy() { reset(); resize?.disconnect(); sourceChanges.disconnect(); referenceList?.removeEventListener('scroll', layout, true); releaseMotion(); reveal.destroy(); status.destroy(); frame.remove(); } };
}
