// Both surfaces stay live: no snapshots, copied image grids or per-frame DOM writes.
const activeHandoffs = new WeakMap();

export function animateLibraryAiHandoff(sourceOverlay, sourceSurface, targetOverlay) {
  const targetSurface = targetOverlay?.querySelector('.modal-ai');
  if (!sourceSurface || !targetSurface || targetOverlay.hidden || targetOverlay.inert) return () => {};
  activeHandoffs.get(sourceOverlay)?.();
  activeHandoffs.get(targetOverlay)?.();
  // Settle the workbench's normal pop entrance before adding the lateral motion.
  targetOverlay.dispatchEvent(new Event('5e:library-ai-handoff-ready'));
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  if (media.matches || typeof sourceSurface.animate !== 'function') return () => {};
  const options = { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' };
  const outgoing = sourceSurface.animate([{ translate: '0px' }, { translate: '-48px' }], options);
  const incoming = targetSurface.animate([{ translate: '48px' }, { translate: '0px' }], options);
  outgoing.id = '5e:library-ai-out';
  incoming.id = '5e:library-ai-in';
  sourceOverlay.dataset.libraryAiHandoff = '';
  targetOverlay.dataset.libraryAiHandoff = '';
  let cancelled = false;
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    observer.disconnect();
    media.removeEventListener('change', cancel);
    outgoing.cancel(); incoming.cancel();
    delete sourceOverlay.dataset.libraryAiHandoff;
    delete targetOverlay.dataset.libraryAiHandoff;
    if (activeHandoffs.get(sourceOverlay) === cancel) activeHandoffs.delete(sourceOverlay);
    if (activeHandoffs.get(targetOverlay) === cancel) activeHandoffs.delete(targetOverlay);
  };
  const observer = new MutationObserver(() => {
    if (!sourceOverlay.isConnected || !targetOverlay.isConnected || sourceOverlay.hidden || targetOverlay.hidden
      || targetOverlay.inert || ['start', 'open'].includes(sourceOverlay.dataset.modalMotionState)) cancel();
  });
  for (const element of [sourceOverlay, targetOverlay]) {
    observer.observe(element, { attributes: true, attributeFilter: ['hidden', 'inert', 'data-modal-motion-state'] });
  }
  incoming.onfinish = () => incoming.cancel();
  media.addEventListener('change', cancel);
  activeHandoffs.set(sourceOverlay, cancel);
  activeHandoffs.set(targetOverlay, cancel);
  return cancel;
}
