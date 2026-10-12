const SPRING_FREQUENCY = 28;
const POSITION_TOLERANCE = 0.003;
const VELOCITY_TOLERANCE = 0.07;
const INITIAL_SCALE = 0.982;
const MAX_ORIGIN_OFFSET = 24;
const SURFACE_PROPERTIES = ['translate', 'scale'];

function cssComponents(value) {
  if (!value || value === 'none') return [];
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index <= value.length; index += 1) {
    const character = value[index];
    if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    if (index === value.length || (depth === 0 && /\s/.test(character))) {
      const part = value.slice(start, index).trim();
      if (part) parts.push(part);
      start = index + 1;
    }
  }
  return parts;
}

function applyProperty(property) {
  if (property.value) property.element.style.setProperty(property.name, property.value, property.priority);
  else property.element.style.removeProperty(property.name);
}

function computedProperty(element, name) {
  if (typeof globalThis.getComputedStyle === 'function') {
    const computed = globalThis.getComputedStyle(element);
    return computed[name] || computed.getPropertyValue?.(name) || '';
  }
  return element.style.getPropertyValue(name);
}

function stepSpring(value, velocity, target, seconds, frequency = SPRING_FREQUENCY) {
  const displacement = value - target;
  const coefficient = velocity + frequency * displacement;
  const decay = Math.exp(-frequency * seconds);
  if (decay === 0) return { value: target, velocity: 0 };
  return {
    value: target + (displacement + coefficient * seconds) * decay,
    velocity: (velocity - frequency * coefficient * seconds) * decay,
  };
}

function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function originOffset(surface, origin) {
  if (!origin) return { x: 0, y: 12 };
  const originRect = typeof origin.getBoundingClientRect === 'function'
    ? origin.getBoundingClientRect() : origin;
  const surfaceRect = surface.getBoundingClientRect?.();
  if (!surfaceRect) return { x: 0, y: 12 };
  const originX = Number.isFinite(originRect.x) && !Number.isFinite(originRect.width)
    ? originRect.x : originRect.left + (originRect.width || 0) / 2;
  const originY = Number.isFinite(originRect.y) && !Number.isFinite(originRect.height)
    ? originRect.y : originRect.top + (originRect.height || 0) / 2;
  if (!Number.isFinite(originX) || !Number.isFinite(originY)) return { x: 0, y: 12 };
  const clamp = value => Math.max(-MAX_ORIGIN_OFFSET, Math.min(MAX_ORIGIN_OFFSET, value));
  return {
    x: clamp((originX - surfaceRect.left - surfaceRect.width / 2) * 0.04),
    y: clamp((originY - surfaceRect.top - surfaceRect.height / 2) * 0.04),
  };
}

/**
 * Interruptible modal motion without an animation library or a delayed open.
 *
 * `show()` exposes the overlay synchronously; `hide()` makes it inert immediately
 * and removes it only after settling. `isOpen()` reports the requested state.
 * `finish()` commits that state immediately. `dispose()` commits it and cancels
 * all pending callbacks. A new show invalidates an interrupted hide's callback.
 *
 * `data-modal-motion-state` is `start`, `open`, `closing`, or `closed`. Integrations
 * can use it to disable an existing CSS entrance animation. Motion is added to
 * live computed translate/scale values, preserving percentage centering and
 * paired login positioning even when a class changes during the animation.
 * The whole overlay fades, including its scrim, without also fading the child
 * surface. Original inline values and priorities are restored at rest.
 *
 * `cssEntrance` opts a separate surface into an actual named CSS entrance. Its
 * initial scale/opacity are CSS-owned; an interrupted close captures presentation
 * values, cancels only that named effect, and reuses this lifecycle and scheduler.
 * Reopening continues those channels without restarting the CSS entrance.
 *
 * Scheduler arguments are optional and allow deterministic unit verification.
 */
export function createModalSurfaceMotion({
  overlay,
  surface = overlay?.querySelector?.('.modal') || overlay,
  cssEntrance = null,
  springFrequency = SPRING_FREQUENCY,
  animateSurface = true,
  reducedMotion = prefersReducedMotion,
  requestFrame = callback => globalThis.requestAnimationFrame?.(callback),
  cancelFrame = handle => globalThis.cancelAnimationFrame?.(handle),
  now = () => {
    const timelineTime = globalThis.document?.timeline?.currentTime;
    return Number.isFinite(timelineTime) ? timelineTime : globalThis.performance?.now?.() ?? Date.now();
  },
} = {}) {
  if (!overlay || !surface) throw new TypeError('A modal overlay and surface are required.');
  if (cssEntrance && surface === overlay) throw new TypeError('A CSS entrance requires a separate modal surface.');
  const nativeDialog = overlay.tagName?.toLowerCase() === 'dialog';
  const visible = () => nativeDialog ? Boolean(overlay.open) : !overlay.hidden;
  let target = visible() ? 1 : 0;
  let value = target;
  let velocity = 0;
  let frameHandle = null;
  let lastTime = 0;
  let disposed = false;
  let pendingHidden = null;
  let savedStyles = null;
  let baseOpacity = 1;
  let offset = { x: 0, y: 12 };
  let cssEntrancePending = false;
  let cssChannels = null;
  let previousCssSample = null;
  let cssPresentationHold = null;

  function readNow() {
    const time = now();
    if (!Number.isFinite(time)) throw new TypeError('Modal motion requires a finite clock.');
    return time;
  }

  function setState(state) {
    overlay.dataset.modalMotionState = state;
  }

  function setAccessible(open) {
    overlay.inert = !open;
    if (open) overlay.removeAttribute('aria-hidden');
    else overlay.setAttribute('aria-hidden', 'true');
  }

  function expose() {
    overlay.hidden = false;
    if (nativeDialog && !overlay.open) overlay.show();
  }

  function captureStyles() {
    if (savedStyles) return;
    savedStyles = [
      ...SURFACE_PROPERTIES.map(name => ({ element: surface, name })),
      ...(cssEntrance ? [{ element: surface, name: 'opacity' }] : []),
      { element: overlay, name: 'opacity' },
    ].map(({ element, name }) => ({
      element, name,
      value: element.style.getPropertyValue(name),
      priority: element.style.getPropertyPriority(name),
    }));
    const opacity = computedProperty(overlay, 'opacity');
    const parsedOpacity = Number.parseFloat(opacity);
    baseOpacity = Number.isFinite(parsedOpacity) ? parsedOpacity : 1;
  }

  function restoreStyles() {
    for (const property of savedStyles || []) applyProperty(property);
    savedStyles = null;
  }

  function liveSurfaceBase() {
    // Temporarily reveal the underlying CSS declarations before sampling. A
    // captured base would become stale when login pairing or a breakpoint changes.
    const properties = (savedStyles || []).filter(property => property.element === surface
      && SURFACE_PROPERTIES.includes(property.name));
    const presented = properties.map(({ element, name }) => ({
      element, name,
      value: element.style.getPropertyValue(name),
      priority: element.style.getPropertyPriority(name),
    }));
    for (const property of properties) applyProperty(property);
    try {
      return {
        translate: cssComponents(computedProperty(surface, 'translate')),
        scale: cssComponents(computedProperty(surface, 'scale')),
      };
    } finally {
      for (const property of presented) applyProperty(property);
    }
  }

  function namedCssAnimations() {
    if (!cssEntrance) return [];
    return [...(surface.getAnimations?.() || [])]
      .filter(animation => animation.animationName === cssEntrance);
  }

  function readCssSurface(time = readNow()) {
    const components = cssComponents(computedProperty(surface, 'scale')).map(Number);
    const scale = components.length ? [components[0], components[1] ?? components[0], components[2] ?? 1] : [1, 1, 1];
    const rawOpacity = computedProperty(surface, 'opacity');
    const opacity = rawOpacity === '' ? 1 : Number(rawOpacity);
    if (!scale.every(Number.isFinite) || !Number.isFinite(opacity)) {
      throw new TypeError('The named CSS entrance must expose finite scale and opacity.');
    }
    return { scale, opacity, time };
  }

  function cancelCssEntrance() {
    for (const animation of namedCssAnimations()) animation.cancel();
    cssEntrancePending = false;
  }

  function releaseCssPresentation() {
    cssPresentationHold?.cancel();
    cssPresentationHold = null;
  }

  function handoffCssEntrance(time) {
    if (cssChannels) return;
    // Copy presentation values before cancellation; computed-style objects are live.
    const presented = readCssSurface(time);
    const previous = previousCssSample;
    const named = namedCssAnimations().find(animation => animation.playState !== 'idle');
    const nativePresentation = named?.effect?.getKeyframes && named.effect.getTiming
      && typeof globalThis.Animation === 'function' && typeof globalThis.KeyframeEffect === 'function'
      && globalThis.document?.timeline && Number.isFinite(named.currentTime)
      ? { frames: named.effect.getKeyframes(), timing: named.effect.getTiming(), time: named.currentTime } : null;
    cancelCssEntrance();
    const base = readCssSurface(time);
    if (nativePresentation) {
      // Keep native interpolation precision until the first advancing spring frame.
      cssPresentationHold = new globalThis.Animation(
        new globalThis.KeyframeEffect(surface, nativePresentation.frames, nativePresentation.timing),
        globalThis.document.timeline);
      cssPresentationHold.pause();
      cssPresentationHold.currentTime = nativePresentation.time;
    }
    const seconds = previous ? (presented.time - previous.time) / 1000 : 0;
    // This preserves sampled velocity; exact CSS easing derivatives still require
    // verification at a first-frame interruption and at the 62% keyframe boundary.
    const velocity = (value, oldValue) => {
      const sampled = seconds > 0 ? (value - oldValue) / seconds : 0;
      return Number.isFinite(sampled) ? sampled : 0;
    };
    cssChannels = {
      scale: presented.scale.map((value, index) => ({
        value, velocity: velocity(value, previous?.scale[index] ?? value),
        open: base.scale[index], closed: base.scale[index] * (index < 2 ? INITIAL_SCALE : 1),
      })),
      opacity: {
        value: presented.opacity, velocity: velocity(presented.opacity, previous?.opacity ?? presented.opacity),
        open: base.opacity, closed: presented.opacity,
      },
    };
    previousCssSample = null;
  }

  function stepCssChannels(seconds) {
    if (!cssChannels) return;
    for (const channel of [...cssChannels.scale, cssChannels.opacity]) {
      Object.assign(channel, stepSpring(channel.value, channel.velocity,
        target ? channel.open : channel.closed, seconds));
    }
  }

  function cssChannelsSettled() {
    return !cssChannels || [...cssChannels.scale, cssChannels.opacity].every(channel =>
      Math.abs(channel.value - (target ? channel.open : channel.closed)) <= POSITION_TOLERANCE
      && Math.abs(channel.velocity) <= VELOCITY_TOLERANCE);
  }

  function render() {
    const progress = Math.max(0, Math.min(1, value));
    const remaining = 1 - progress;
    // Full-screen libraries keep their large grid stationary while fading.
    // Avoid alternating style writes/computed reads on that grid every frame.
    if (!animateSurface) {
      overlay.style.setProperty('opacity', String(baseOpacity * progress));
      return;
    }
    const base = liveSurfaceBase();
    const translation = [
      `calc(${base.translate[0] || '0px'} + ${offset.x * remaining}px)`,
      `calc(${base.translate[1] || '0px'} + ${offset.y * remaining}px)`,
    ];
    if (base.translate[2]) translation.push(base.translate[2]);
    surface.style.setProperty('translate', translation.join(' '));
    if (cssChannels) {
      surface.style.setProperty('scale', cssChannels.scale.map(channel => String(channel.value)).join(' '));
      surface.style.setProperty('opacity', String(Math.max(0, Math.min(1, cssChannels.opacity.value))));
    } else {
      const scale = 1 - (1 - INITIAL_SCALE) * remaining;
      const scaledBase = [base.scale[0] || '1', base.scale[1] || base.scale[0] || '1'];
      const scaleValues = scaledBase.map(component => `calc(${component} * ${scale})`);
      if (base.scale[2]) scaleValues.push(base.scale[2]);
      surface.style.setProperty('scale', scaleValues.join(' '));
    }
    overlay.style.setProperty('opacity', String(baseOpacity * progress));
  }

  function cancelScheduledFrame() {
    if (frameHandle !== null) cancelFrame(frameHandle);
    frameHandle = null;
  }

  function commit({ notify = true } = {}) {
    cancelScheduledFrame();
    releaseCssPresentation();
    if (cssEntrance) cancelCssEntrance();
    cssChannels = null;
    previousCssSample = null;
    value = target;
    velocity = 0;
    restoreStyles();
    setAccessible(Boolean(target));
    if (target) {
      expose();
      setState('open');
      pendingHidden = null;
    } else {
      if (nativeDialog && overlay.open) overlay.close();
      overlay.hidden = true;
      setState('closed');
      const callback = pendingHidden;
      pendingHidden = null;
      if (notify) callback?.();
    }
  }

  function frame(timestamp) {
    frameHandle = null;
    if (disposed) return;
    if (!Number.isFinite(timestamp)) { commit(); return; }
    if (cssEntrancePending) {
      lastTime = timestamp;
      const running = namedCssAnimations().some(animation =>
        animation.playState !== 'finished' && animation.playState !== 'idle');
      if (shouldReduceMotion() || !running) commit();
      else { previousCssSample = readCssSurface(); schedule(); }
      return;
    }
    const elapsed = Math.max(0, (timestamp - lastTime) / 1000);
    lastTime = timestamp;
    ({ value, velocity } = stepSpring(value, velocity, target, elapsed, springFrequency));
    stepCssChannels(elapsed);
    if (elapsed > 0) releaseCssPresentation();
    render();
    if (Math.abs(value - target) <= POSITION_TOLERANCE
      && Math.abs(velocity) <= VELOCITY_TOLERANCE && cssChannelsSettled()) {
      commit();
    } else {
      schedule();
    }
  }

  function schedule() {
    if (frameHandle !== null) return;
    frameHandle = requestFrame(frame) ?? null;
    // Non-browser consumers still receive a usable, immediately settled surface.
    if (frameHandle === null) commit();
  }

  function shouldReduceMotion() {
    return typeof reducedMotion === 'function' ? reducedMotion() : Boolean(reducedMotion);
  }

  function show({ origin } = {}) {
    if (disposed) return false;
    if (target === 1 && visible()) { pendingHidden = null; return true; }
    const time = readNow();
    pendingHidden = null;
    const wasVisible = visible();
    expose();
    if (!savedStyles) {
      captureStyles();
      value = wasVisible ? 1 : 0;
      velocity = 0;
      offset = originOffset(surface, origin);
    }
    target = 1;
    lastTime = time;
    setAccessible(true);
    setState('start');
    if (cssEntrance && !wasVisible) {
      // The source CSS owns the initial 260ms scale and child opacity. Do not
      // fade the overlay or add a second transform while that entrance plays.
      cssEntrancePending = true;
      cssChannels = null;
      previousCssSample = null;
      value = 1; velocity = 0;
      if (shouldReduceMotion()) commit();
      else schedule();
      return true;
    }
    render();
    if (shouldReduceMotion()) commit();
    else schedule();
    return true;
  }

  function hide({ onHidden } = {}) {
    if (disposed) return false;
    const time = readNow();
    if (typeof onHidden === 'function') pendingHidden = onHidden;
    if (!savedStyles) {
      captureStyles();
      value = visible() ? 1 : 0;
      velocity = 0;
    }
    if (cssEntrance) handoffCssEntrance(time);
    target = 0;
    lastTime = time;
    setAccessible(false);
    setState('closing');
    render();
    if (!visible() || shouldReduceMotion()) commit();
    else schedule();
    return true;
  }

  function finish() {
    if (!disposed) commit();
  }

  function dispose() {
    if (disposed) return;
    pendingHidden = null;
    commit({ notify: false });
    disposed = true;
  }

  setState(target ? 'open' : 'closed');
  return { show, hide, finish, dispose, isOpen: () => !disposed && target === 1 };
}
