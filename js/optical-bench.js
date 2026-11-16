/* Physical positions (metres) are independent of the printed x/y/w/h box (mm).
 * One apparatus object owns all parts; rendering, dragging and inspector edits
 * share this model so moving a part cannot detach its stand from the rail.
 */
export const OPTICAL_BENCH_DEFAULTS = Object.freeze({
  benchMode: "slit", railLength: 3.2, sourcePosition: 0.38,
  elementPosition: 0.96, screenPosition: 2.96,
});
const finite = (v, fallback) => Number.isFinite(v) ? v : fallback;
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
export function isOpticalBench(o) { return o?.type === "apparatus" && o.kind === "optical_bench"; }
export function opticalBenchSettings(o = {}) {
  const railLength = clamp(finite(o.railLength, 3.2), 0.2, 1000);
  const position = key => clamp(finite(o[key], OPTICAL_BENCH_DEFAULTS[key]), 0, railLength);
  return { benchMode: o.benchMode === "lens" ? "lens" : "slit", railLength,
    sourcePosition: position("sourcePosition"), elementPosition: position("elementPosition"),
    screenPosition: position("screenPosition") };
}
export function changeOpticalBench(o, key, value) {
  const s = opticalBenchSettings(o);
  if (key === "benchMode") return { ...s, benchMode: value === "lens" ? "lens" : "slit" };
  if (!Number.isFinite(value)) return s;
  if (key === "elementScreenDistance") s.screenPosition = s.elementPosition + Math.max(0, value);
  else if (key in OPTICAL_BENCH_DEFAULTS) s[key] = value;
  return opticalBenchSettings(s);
}
export function opticalBenchLayout(o) {
  const settings = opticalBenchSettings(o), x = finite(o.x,0), y=finite(o.y,0);
  const w=Math.max(0.1,finite(o.w,140)), h=Math.max(0.1,finite(o.h,40));
  // The component axis leaves space at both ends for the oblique screen and
  // slider width. Every position, including both rail ends, stays in the box.
  const axisStart=x+w*.13, axisEnd=x+w*.91;
  const parts = [
    { id:"source", prop:"sourcePosition", label:settings.benchMode==="lens"?"광원":"레이저" },
    { id:"element", prop:"elementPosition", label:settings.benchMode==="lens"?"렌즈":"이중 슬릿" },
    { id:"screen", prop:"screenPosition", label:"스크린" },
  ].map(p=>({...p,position:settings[p.prop],x:axisStart+(axisEnd-axisStart)*settings[p.prop]/settings.railLength,y:y+h*.92}));
  return {x,y,w,h,axisStart,axisEnd,settings,parts,
    elementScreenDistance:Math.abs(settings.screenPosition-settings.elementPosition)};
}
export function opticalBenchWorldPoint(o, p) {
  const l=opticalBenchLayout(o), cx=l.x+l.w/2, cy=l.y+l.h/2;
  const r=finite(o.rotation,0)*Math.PI/180;
  return {x:cx+(p.x-cx)*Math.cos(r)-(p.y-cy)*Math.sin(r),y:cy+(p.x-cx)*Math.sin(r)+(p.y-cy)*Math.cos(r)};
}
export function opticalBenchLocalPoint(o,p) {
  return opticalBenchWorldPoint({...o,rotation:-finite(o.rotation,0)},p);
}
export function opticalBenchPositionAtPoint(o,p) {
  const l=opticalBenchLayout(o), local=opticalBenchLocalPoint(o,p);
  return clamp((local.x-l.axisStart)/(l.axisEnd-l.axisStart)*l.settings.railLength,0,l.settings.railLength);
}
