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
      // The update promise propagates real failures; a skipped animation does not.
      await transition.updateCallbackDone;
      await transition.finished.catch(() => {});
    } else {
      const styles = getComputedStyle(root);
      const blur = styles.getPropertyValue('--mode-motion-blur').trim();
      const body = document.body;
      const play = (frames, duration, easing) => body.animate(frames, { duration, easing, fill: 'both' });
      const soften = play([{ filter: 'blur(0)' }, { filter: `blur(${blur})` }], 250, 'cubic-bezier(.45,0,.55,1)');
      await soften.finished;
      soften.cancel();
      body.style.filter = `blur(${blur})`;
      try {
        const fadeOut = play([{ opacity: 1 }, { opacity: 0.55 }], 150, 'cubic-bezier(.45,0,.55,1)');
        await fadeOut.finished;
        fadeOut.cancel();
        body.style.opacity = '0.55';
        await change();
        const fadeIn = play([{ opacity: 0.55 }, { opacity: 1 }], 150, 'cubic-bezier(.45,0,.55,1)');
        await fadeIn.finished;
        fadeIn.cancel();
        body.style.opacity = '1';
        const sharpen = play([{ filter: `blur(${blur})` }, { filter: 'blur(0)' }], 450, 'cubic-bezier(.4,0,.2,1)');
        await sharpen.finished;
        sharpen.cancel();
      } finally {
        body.style.filter = '';
        body.style.opacity = '';
      }
    }
  } finally {
    root.classList.remove('mode-transition');
  }
}
