// Rounded controls are a view of the model. Opening, focusing or committing an
// untouched field must never turn an imported contact into a rounded coordinate.
export function roundedGraphNumber(value) {
  if (!Number.isFinite(Number(value)) || String(value).trim() === '') return String(value ?? '');
  const n = Math.round((Number(value) + Number.EPSILON) * 10) / 10;
  return String(Object.is(n, -0) ? 0 : n);
}

// Exact measured coordinates must remain readable and editable at their supplied
// precision. Layout controls and observed tracing keep the rounded legacy view.
export function graphPointNumber(value, exact = false) {
  return exact && Number.isFinite(Number(value)) && String(value).trim() !== ''
    ? String(Object.is(Number(value), -0) ? 0 : Number(value)) : roundedGraphNumber(value);
}

export function installGraphNumberFields(root) {
  const records = new WeakMap();
  const committing = new WeakSet();
  const eligible = input => input?.matches?.('input[type="number"]') && input.dataset.graphPrecision !== 'exact';
  function format() {
    for (const input of root.querySelectorAll('input[type="number"]')) {
      // Use the incumbent stepper for dynamic graph fields as well. Existing
      // input nodes and listeners stay intact; no second value/write path.
      if (!input.closest('.gm-step')) {
        const doc = input.ownerDocument;
        const wrap = doc.createElement('span'); wrap.className = 'gm-step gm-number-step';
        const buttons = doc.createElement('span'); buttons.className = 'gm-step-btns';
        for (const [direction, glyph, label] of [[1,'▲','늘리기'],[-1,'▼','줄이기']]) {
          const button = doc.createElement('button'); button.type = 'button'; button.tabIndex = -1;
          button.dataset.step = String(direction); button.textContent = glyph;
          button.setAttribute('aria-label', `${input.getAttribute('aria-label') || input.title || '값'} ${label}`);
          buttons.append(button);
        }
        input.before(wrap); wrap.append(input, buttons);
      }
      if (input.step === 'any' && !input.dataset.stepSize) input.dataset.stepSize = '0.1';
      input.closest('.gm-step')?.querySelectorAll('[data-step]').forEach(button => { if (button.disabled !== input.disabled) button.disabled = input.disabled; });
      if (!eligible(input) || input.value === '' || !Number.isFinite(input.valueAsNumber)) continue;
      const previous = records.get(input);
      if (previous?.dirty && input === document.activeElement) continue;
      if (previous && input.value === previous.display) continue;
      const raw = input.value, display = roundedGraphNumber(raw);
      records.set(input, { raw, display, dirty: false });
      input.value = display;
      // step="any" avoids offset lattices such as min=.01, step=.1. The shared
      // stepper still advances exactly .1 through its existing data-step-size API.
      if (!(Number(input.step) >= 1 && Number.isInteger(Number(input.step)))) {
        input.step = 'any'; input.dataset.stepSize = '0.1';
      }
    }
  }
  function normalize(event) {
    const input = event.target;
    if (!eligible(input) || committing.has(input)) return;
    const previous = records.get(input);
    if (event.type === 'input') {
      // Keep partial keyboard input (0., minus signs, exponents) intact until
      // commit. Changing it here moves the caret and corrupts decimal typing.
      records.set(input, { raw: input.value, display: previous?.display, dirty: true });
      return;
    }
    if (event.type === 'change' && previous && !previous.dirty && input.value === previous.display) {
      // Apply dispatches change on focused controls. It is not an edit.
      event.stopImmediatePropagation();
      return;
    }
    if (input.value === '' || !Number.isFinite(input.valueAsNumber)) return;
    let value = Number(roundedGraphNumber(input.value));
    const min = input.min === '' ? -Infinity : Number(input.min);
    const max = input.max === '' ? Infinity : Number(input.max);
    if (value < min) value = Math.ceil(min * 10) / 10;
    if (value > max) value = Math.floor(max * 10) / 10;
    const typed = input.value;
    input.value = roundedGraphNumber(value);
    records.set(input, { raw: input.value, display: input.value, dirty: false });
    if (typed !== input.value) {
      // Some controls commit through input, others through change. Notify both
      // without treating this normalization as another keyboard edit.
      committing.add(input);
      try { input.dispatchEvent(new Event('input', { bubbles: true })); }
      finally { committing.delete(input); }
    }
    queueMicrotask(format);
  }
  function commitBlur(event) {
    const input = event.target;
    if (eligible(input) && records.get(input)?.dirty) input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  root.addEventListener('input', normalize, true);
  root.addEventListener('change', normalize, true);
  root.addEventListener('blur', commitBlur, true);
  const observer = new MutationObserver(format);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  format();
  return { format, destroy() { observer.disconnect(); root.removeEventListener('input', normalize, true); root.removeEventListener('change', normalize, true); root.removeEventListener('blur', commitBlur, true); } };
}
