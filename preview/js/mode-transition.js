export async function animateModeChange(change) {
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { await change(); return; }
  root.classList.add('mode-transition');
  try {
    if (typeof document.startViewTransition === 'function') {
      const transition = document.startViewTransition(async () => {
        await change();
      });
      void transition.ready.catch(() => {});
      // The update promise propagates real failures; a skipped animation does not.
      await transition.updateCallbackDone;
      await transition.finished.catch(() => {});
    } else {
      await change();
      const styles = getComputedStyle(root);
      const duration = parseFloat(styles.getPropertyValue('--mode-motion-duration'));
      const easing = styles.getPropertyValue('--mode-motion-easing').trim();
      const animations = [...document.querySelectorAll('.app-shell-header, #panel-left, #panel-right')]
        .filter(element => element.getBoundingClientRect().width > 0)
        .map(element => element.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration, easing }));
      await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
    }
  } finally {
    root.classList.remove('mode-transition');
  }
}
