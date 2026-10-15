import { BlurReveal } from './blur-reveal.js';
import { trackLoadingMotion } from './activity-visibility.js';
import { createPreviewLoading } from '../library/page-loading.js?v=1.7.0-four-session-integration';

// One operation owns its indicator, source layers and clock. Disposing a stale
// selection also prevents a late decode from painting over the current page.
export function createLibraryPreviewLoading(host, paper, source = '') {
  const started = performance.now();
  const status = createPreviewLoading();
  const time = document.createElement('time');
  time.className = 'unilib-preview-elapsed'; time.setAttribute('aria-live', 'off');
  status.append(time); host.append(status); host.setAttribute('aria-busy', 'true');
  let disposed = false, reveal = null, release = null, positionFrame = 0;
  const position = () => {
    if (disposed) return;
    // The page may be taller than the reader. Keep the indicator in the visible
    // viewport instead of centering it below the fold of a tall white page.
    const top = `${host.scrollTop + host.clientHeight / 2}px`;
    if (status.style.top !== top) status.style.top = top;
  };
  const schedulePosition = () => {
    if (disposed || positionFrame) return;
    positionFrame = requestAnimationFrame(() => { positionFrame = 0; position(); });
  };
  const tick = () => {
    const seconds = Math.floor((performance.now() - started) / 1000);
    time.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    time.dateTime = `PT${seconds}S`;
  };
  const clearReveal = () => { release?.(); release = null; reveal?.destroy(); reveal = null; };
  const setPaper = (next, src = source) => {
    if (disposed) return;
    clearReveal(); paper = next;
    if (!src || !paper) return;
    reveal = BlurReveal.attach(paper, { variant: 'fade', fit: 'contain' });
    release = trackLoadingMotion(paper);
    void reveal.start(src, performance.now() - started).catch(() => {
      // An unavailable low-res thumbnail must not fail the full-size request.
    });
  };
  const resize = new ResizeObserver(schedulePosition); resize.observe(host);
  host.addEventListener('scroll', schedulePosition, { passive: true });
  position(); tick(); const clock = setInterval(tick, 1000);
  setPaper(paper);
  const dispose = () => {
    if (disposed) return;
    disposed = true; clearInterval(clock); resize.disconnect();
    cancelAnimationFrame(positionFrame);
    host.removeEventListener('scroll', schedulePosition); status.remove(); clearReveal();
    host.removeAttribute('aria-busy');
  };
  return {
    setPaper, dispose,
    complete(frame, image) {
      const elapsed = performance.now() - started;
      dispose();
      if (elapsed < 150) return;
      // The decoded image and its controls are already usable underneath.
      // Only the visual crossfade settles; completion is never held for a timer.
      const finalReveal = BlurReveal.attach(frame, { variant: 'fade', fit: 'contain' });
      const stop = trackLoadingMotion(frame);
      void finalReveal.start(image, elapsed).then(() => finalReveal.complete(image))
        .catch(() => {}).finally(() => { stop(); finalReveal.destroy(); });
    },
  };
}
