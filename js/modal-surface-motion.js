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

function stepSpring(value, velocity, target, seconds) {
  const displacement = value - target;
  const coefficient = velocity + SPRING_FREQUENCY * displacement;
  const decay = Math.exp(-SPRING_FREQUENCY * seconds);
  return {
    value: target + (displacement + coefficient * seconds) * decay,
    velocity: (velocity - SPRING_FREQUENCY * coefficient * seconds) * decay,
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
 * Scheduler arguments are optional and allow deterministic unit verification.
 */
export function createModalSurfaceMotion({
  overlay,
  surface = overlay?.querySelector?.('.modal') || overlay,
  reducedMotion = prefersReducedMotion,
  requestFrame = callback => globalThis.requestAnimationFrame?.(callback),
  cancelFrame = handle => globalThis.cancelAnimationFrame?.(handle),
  now = () => globalThis.performance?.now?.() ?? Date.now(),
} = {}) {
  if (!overlay || !surface) throw new TypeError('A modal overlay and surface are required.');
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

  function render() {
    const progress = Math.max(0, Math.min(1, value));
    const remaining = 1 - progress;
    const base = liveSurfaceBase();
    const translation = [
      `calc(${base.translate[0] || '0px'} + ${offset.x * remaining}px)`,
      `calc(${base.translate[1] || '0px'} + ${offset.y * remaining}px)`,
    ];
    if (base.translate[2]) translation.push(base.translate[2]);
    const scale = 1 - (1 - INITIAL_SCALE) * remaining;
    const scaledBase = [base.scale[0] || '1', base.scale[1] || base.scale[0] || '1'];
    const scaleValues = scaledBase.map(component => `calc(${component} * ${scale})`);
    if (base.scale[2]) scaleValues.push(base.scale[2]);
    surface.style.setProperty('translate', translation.join(' '));
    surface.style.setProperty('scale', scaleValues.join(' '));
    overlay.style.setProperty('opacity', String(baseOpacity * progress));
  }

  function cancelScheduledFrame() {
    if (frameHandle !== null) cancelFrame(frameHandle);
    frameHandle = null;
  }

  function commit({ notify = true } = {}) {
    cancelScheduledFrame();
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
    const elapsed = Math.max(0, (timestamp - lastTime) / 1000);
    lastTime = timestamp;
    ({ value, velocity } = stepSpring(value, velocity, target, elapsed));
    render();
    if (Math.abs(value - target) <= POSITION_TOLERANCE
      && Math.abs(velocity) <= VELOCITY_TOLERANCE) {
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
    pendingHidden = null;
    if (target === 1 && visible()) return true;
    const wasVisible = visible();
    expose();
    if (!savedStyles) {
      captureStyles();
      value = wasVisible ? 1 : 0;
      velocity = 0;
      offset = originOffset(surface, origin);
    }
    target = 1;
    lastTime = now();
    setAccessible(true);
    setState('start');
    render();
    if (shouldReduceMotion()) commit();
    else schedule();
    return true;
  }

  function hide({ onHidden } = {}) {
    if (disposed) return false;
    if (typeof onHidden === 'function') pendingHidden = onHidden;
    if (!savedStyles) {
      captureStyles();
      value = visible() ? 1 : 0;
      velocity = 0;
    }
    target = 0;
    lastTime = now();
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
