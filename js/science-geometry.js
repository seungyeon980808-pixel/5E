/* Editable scientific illustrations. Units are drawing mm, mL and °C;
 * these helpers describe a schematic, not a physics simulation. */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback) => Number.isFinite(v) ? v : fallback;

export function endpointSettings(obj, vertical = false) {
  const a = obj.p1 || { x: 0, y: 0 }, b = obj.p2 || a;
  const dx = b.x - a.x, dy = b.y - a.y;
  return { length: Math.hypot(dx, dy), angle: Math.atan2(vertical ? dx : dy, vertical ? dy : dx) * 180 / Math.PI };
}

export function setEndpointSettings(obj, values, vertical = false) {
  const old = endpointSettings(obj, vertical);
  const length = clamp(finite(values.length, old.length), 0.1, 1000);
  const angle = clamp(finite(values.angle, old.angle), -180, 180) * Math.PI / 180;
  const a = obj.p1 || { x: 0, y: 0 };
  obj.p2 = { x: a.x + length * (vertical ? Math.sin(angle) : Math.cos(angle)),
    y: a.y + length * (vertical ? Math.cos(angle) : Math.sin(angle)) };
}

// Width profiles match the native glassware outlines. A circular cross-section
// is assumed for flask/tube diagrams; capacity calibrates their total volume.
// Width and height resize the drawing independently of its labelled capacity.
const profiles = {
  beaker: t => 1, box: t => 1, tank: t => 1,
  cylinder_graduated: t => 1, burette: t => 1,
  flask: t => { const z = t * 26; return z < 18 ? 23 - 15 * z / 18 : 8; },
  test_tube: t => { const z = t * 25; return z < 5 ? 2 * Math.sqrt(Math.max(0, 25 - (5 - z) ** 2)) : 10; },
  round_flask: t => { const z = t * 28; return z < 10 + Math.sqrt(84) ? 2 * Math.sqrt(Math.max(0, 100 - (10 - z) ** 2)) : 8; },
};
const tables = new Map();
export const VOLUME_KINDS = Object.keys(profiles);
function volumeTable(kind) {
  if (!profiles[kind]) return null;
  if (!tables.has(kind)) {
    const n = 1024, a = [0];
    for (let i = 0; i < n; i++) a.push(a[i] + profiles[kind]((i + 0.5) / n) ** 2);
    const total = a[n];
    tables.set(kind, a.map(x => x / total));
  }
  return tables.get(kind);
}
export function vesselWidthAtHeight(kind, height) {
  const fn = profiles[kind];
  const max = kind === "flask" ? 23 : kind === "test_tube" ? 10 : kind === "round_flask" ? 20 : 1;
  return fn ? fn(clamp(finite(height, 0), 0, 1)) / max : 1;
}
export function volumeFractionAtHeight(kind, height) {
  const h = clamp(finite(height, 0), 0, 1), a = volumeTable(kind);
  if (!a) return h;
  const p = h * (a.length - 1), i = Math.min(a.length - 2, Math.floor(p));
  return a[i] + (a[i + 1] - a[i]) * (p - i);
}
export function heightAtVolumeFraction(kind, fraction) {
  const f = clamp(finite(fraction, 0), 0, 1), a = volumeTable(kind);
  if (!a || f === 0 || f === 1) return f;
  let lo = 0, hi = a.length - 1;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (a[mid] < f) lo = mid; else hi = mid; }
  return (lo + (f - a[lo]) / (a[hi] - a[lo])) / (a.length - 1);
}
export function vesselFill(obj) {
  const capacity = clamp(finite(obj.capacityMl, 200), 0.1, 100000);
  const legacyHeight = clamp(finite(obj.liquid, 0.34), 0, 1);
  const volume = clamp(finite(obj.volumeMl, capacity * volumeFractionAtHeight(obj.kind, legacyHeight)), 0, capacity);
  return { capacity, volume, height: obj.fillMode === "volume" && profiles[obj.kind]
    ? heightAtVolumeFraction(obj.kind, volume / capacity) : legacyHeight };
}

// Bound work and label density even when a saved file asks for tiny steps.
// Thinning preserves integer multiples of the requested step, and both ends.
export function scaleMarks(min, max, step, limit = 25) {
  if (![min, max, step].every(Number.isFinite) || max <= min || step <= 0) return [];
  const stride = Math.max(1, Math.ceil((max - min) / step / (limit - 1)));
  const inc = step * stride, values = [];
  for (let i = 0; i < limit && min + i * inc < max; i++) values.push(min + i * inc);
  values.push(max);
  return values;
}
export function scaleNumber(v) { return String(Number(v.toFixed(3))); }
export function thermometerScale(obj) {
  const min = finite(obj.temperatureMin, 0), rawMax = finite(obj.temperatureMax, 100);
  const max = rawMax > min ? rawMax : min + 100;
  const legacy = clamp(finite(obj.level, 0.55), 0, 1);
  const value = clamp(finite(obj.temperature, min + legacy * (max - min)), min, max);
  return { min, max, value, level: (value - min) / (max - min),
    marks: scaleMarks(min, max, finite(obj.temperatureStep, (max - min) / 5), 12) };
}
