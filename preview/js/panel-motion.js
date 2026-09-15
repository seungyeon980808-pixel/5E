const RESPONSE_MS = 300;
const SAMPLE_COUNT = 18;
const SETTLE_RATE = 6.64;
const surfaceAnimations = new WeakMap();

export function criticallyDampedProgress(value) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  const raw = 1 - (1 + SETTLE_RATE * value) * Math.exp(-SETTLE_RATE * value);
  const end = 1 - (1 + SETTLE_RATE) * Math.exp(-SETTLE_RATE);
  return raw / end;
}

export function panelMotionKeyframes(fromX, toX, fromOpacity = 1) {
  return Array.from({ length: SAMPLE_COUNT + 1 }, (_, index) => {
    const offset = index / SAMPLE_COUNT;
    const progress = criticallyDampedProgress(offset);
    const x = fromX + (toX - fromX) * progress;
    const opacity = fromOpacity + (1 - fromOpacity) * progress;
    return { transform: `translate3d(${x}px, 0, 0)`, opacity, offset };
  });
}

export function cycleFocusIndex(activeIndex, length, reverse = false) {
  if (length <= 0) return -1;
  if (activeIndex < 0) return reverse ? length - 1 : 0;
  return (activeIndex + (reverse ? length - 1 : 1)) % length;
}

function translatedX(fromLeft, element) {
  const rect = element.getBoundingClientRect();
  const scale = element.offsetWidth > 0 ? rect.width / element.offsetWidth : 1;
  return (fromLeft - rect.left) / (scale || 1);
}

function setOverlayBox(panel, box) {
  panel.classList.add('is-panel-transitioning');
  panel.style.setProperty('--panel-motion-left', `${box.left}px`);
  panel.style.setProperty('--panel-motion-top', `${box.top}px`);
  panel.style.setProperty('--panel-motion-width', `${box.width}px`);
  panel.style.setProperty('--panel-motion-height', `${box.height}px`);
}

function clearOverlayBox(panel) {
  panel.classList.remove('is-panel-transitioning');
  for (const name of ['left', 'top', 'width', 'height']) {
    panel.style.removeProperty(`--panel-motion-${name}`);
  }
}

export function createPanelMotion({
  panel,
  surface,
  side,
  reducedMotion,
  mutateLayout,
  setAccessibleExpanded,
  beforeLayout = () => {},
  afterLayout = () => {},
}) {
  let panelAnimation = null;
  let surfaceAnimation = null;
  let revision = 0;

  function cancel() {
    revision += 1;
    panelAnimation?.cancel();
    surfaceAnimation?.cancel();
    if (surfaceAnimation && surfaceAnimations.get(surface) === surfaceAnimation) {
      surfaceAnimations.delete(surface);
    }
    panelAnimation = null;
    surfaceAnimation = null;
  }

  function commit(expanded, overlayOnly = false, notifyLayout = false) {
    cancel();
    if (!overlayOnly && notifyLayout) beforeLayout();
    clearOverlayBox(panel);
    panel.classList.remove('is-panel-moving');
    surface?.classList.remove('is-panel-surface-moving');
    panel.hidden = !expanded;
    panel.inert = !expanded;
    if (!overlayOnly) mutateLayout(expanded);
    if (!overlayOnly && notifyLayout) afterLayout();
    setAccessibleExpanded(expanded);
  }

  function setExpanded(expanded, { overlayOnly = false } = {}) {
    if (reducedMotion() || typeof panel.animate !== 'function') {
      commit(expanded, overlayOnly, true);
      return;
    }

    const panelWasVisible = !panel.hidden;
    const livePanelLeft = panelWasVisible ? panel.getBoundingClientRect().left : null;
    const liveSurfaceLeft = !overlayOnly && surface ? surface.getBoundingClientRect().left : null;
    const liveOpacity = panelWasVisible
      ? Number.parseFloat(getComputedStyle(panel).opacity) || 1 : 0.88;
    setAccessibleExpanded(expanded);
    cancel();
    if (!overlayOnly) beforeLayout();

    if (!overlayOnly && !expanded && !panel.classList.contains('is-panel-transitioning')) {
      setOverlayBox(panel, {
        left: panel.offsetLeft,
        top: panel.offsetTop,
        width: panel.offsetWidth,
        height: panel.offsetHeight,
      });
    }
    if (!overlayOnly && expanded) clearOverlayBox(panel);
    panel.hidden = false;
    panel.inert = !expanded;

    if (!overlayOnly) {
      mutateLayout(expanded);
      afterLayout();
    }

    const panelWidth = panel.offsetWidth || panel.getBoundingClientRect().width;
    const edge = side === 'left' ? -panelWidth : panelWidth;
    const fromX = livePanelLeft === null ? edge : translatedX(livePanelLeft, panel);
    const toX = expanded ? 0 : edge;
    panel.classList.add('is-panel-moving');
    const currentRevision = revision;
    panelAnimation = panel.animate(panelMotionKeyframes(fromX, toX, liveOpacity), {
      duration: RESPONSE_MS,
      easing: 'linear',
      fill: 'both',
    });
    if (!overlayOnly && surface && liveSurfaceLeft !== null) {
      surfaceAnimations.get(surface)?.cancel();
      surface.classList.add('is-panel-surface-moving');
      surfaceAnimation = surface.animate(panelMotionKeyframes(
        translatedX(liveSurfaceLeft, surface), 0, 1,
      ), { duration: RESPONSE_MS, easing: 'linear', fill: 'both' });
      surfaceAnimations.set(surface, surfaceAnimation);
    }
    panelAnimation.finished.then(() => {
      if (currentRevision !== revision) return;
      panelAnimation?.cancel();
      const ownsSurfaceAnimation = surfaceAnimation
        && surfaceAnimations.get(surface) === surfaceAnimation;
      if (surfaceAnimation) {
        surfaceAnimation.cancel();
        if (ownsSurfaceAnimation) surfaceAnimations.delete(surface);
      }
      panelAnimation = null;
      surfaceAnimation = null;
      panel.classList.remove('is-panel-moving');
      if (ownsSurfaceAnimation) surface?.classList.remove('is-panel-surface-moving');
      if (!expanded) panel.hidden = true;
      panel.inert = !expanded;
      clearOverlayBox(panel);
    }).catch(() => {});
  }

  return { setExpanded, reset: commit };
}
