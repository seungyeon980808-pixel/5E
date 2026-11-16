// A confirmation can close one surface and expose another before keyup. Keep
// that held key from activating the next surface, then release normal input.
const held = new WeakMap();
export function consumeConfirmationPress(event) {
  event.preventDefault(); event.stopImmediatePropagation();
  let view = event.target?.ownerDocument?.defaultView || window;
  try { if (view.top.document) view = view.top; } catch {}
  const code = event.code || event.key;
  if (held.get(view)?.code === code) return;
  held.get(view)?.release();
  const matches = next => (next.code || next.key) === code;
  const down = next => { if (matches(next)) { next.preventDefault(); next.stopImmediatePropagation(); } };
  const up = next => { if (matches(next)) { next.preventDefault(); release(); } };
  const connected = new Set();
  const connect = () => {
    function attach(current) {
      try {
        if (!connected.has(current)) { current.document; connected.add(current); current.addEventListener('keydown',down,true); current.addEventListener('keyup',up,true); }
        for (let i=0;i<current.frames.length;i++) attach(current.frames[i]);
      } catch {}
    }
    attach(view);
  };
  const blur = () => { queueMicrotask(() => { if (!view.document.hasFocus()) release(); }); };
  const release = () => {
    for (const current of connected) { current.removeEventListener('keydown',down,true); current.removeEventListener('keyup',up,true); }
    view.document.removeEventListener('load',connect,true); view.removeEventListener('blur',blur); held.delete(view);
  };
  held.set(view,{code,release});
  connect(); view.document.addEventListener('load',connect,true); view.addEventListener('blur',blur);
}
