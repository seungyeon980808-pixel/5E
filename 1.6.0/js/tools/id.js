/* ===== SHARED OBJECT-ID GENERATOR ===== */
//
// Every tool pipeline (shape draw, free draw, node, click-to-click placement)
// mints new object ids through this ONE counter, so ids stay unique no matter
// which module created the object. Previously each pipeline inlined
// `obj_${Date.now()}_${++_idCounter}` against a tools.js-local counter; splitting
// those pipelines into their own modules would have given each its own counter
// and risked same-millisecond id collisions. This central helper prevents that.

let _idCounter = 0;

export function nextObjectId() {
  return `obj_${Date.now().toString(36)}_${++_idCounter}`;
}
