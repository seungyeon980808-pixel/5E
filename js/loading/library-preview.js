import { BlurReveal } from './blur-reveal.js?v=1.7.0-four-session-integration';
import { trackLoadingMotion } from './activity-visibility.js?v=1.7.0-four-session-integration';
import { createPreviewLoading } from '../library/page-loading.js?v=1.7.0-four-session-integration';
import { mountElapsedClock } from './elapsed-clock.js?v=171';

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
  // 1.7.1 B13: 시계는 그래픽 처리 장치 움직임으로 — 그림 해독이 주 스레드를 붙잡아도 멈추지 않는다.
  position(); const clock = mountElapsedClock(time, started);
  setPaper(paper);
  const dispose = () => {
    if (disposed) return;
    disposed = true; clock.stop(); resize.disconnect();
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
      // This bounded completion must settle when the reader closes. Pausing it
      // offscreen leaves its finished promise and detached frame retained.
      void finalReveal.start(image, elapsed).then(() => finalReveal.complete(image))
        .catch(() => {}).finally(() => { finalReveal.destroy(); });
    },
  };
}
