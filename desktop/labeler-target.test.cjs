const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../js');
class Element {
  constructor(tag) { this.tagName = tag; this.attrs = {}; this.dataset = {}; this.children = []; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  appendChild(n) { this.children.push(n); return n; }
}
function load(file, names, deps = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
    .replace(/^import\s[\s\S]*?from\s*["'][^"']+["'];\s*/gm, '')
    .replace(/^export\s*\{[\s\S]*?\};?\s*/gm, '')
    .replace(/\bexport\s+(?=(?:async\s+)?function|const|let|class)/g, '');
  const context = vm.createContext({ document: { createElementNS: (_, tag) => new Element(tag) }, window: {}, ...deps });
  vm.runInContext(source + `\nglobalThis.result={${names.join(',')}};`, context, { timeout: 2000, filename: file });
  return context.result;
}
// 1.7.0 라벨 지시선 경로·라벨 글꼴은 이 검사의 라벨이 쓰지 않으므로 '기능 꺼짐' 값으로 채운다.
const LABEL_OFF = { deriveLabelLeaderGeometry: () => null, pointInLabelerBlock: () => false, leaderRoutePoints: () => [], sampleLeaderRoute: () => [], renderLeaderRoutes: () => {}, hasLabelTypography: () => false, measureLabelTypography: () => null, nativeLabelBounds: () => null, nativeLabelPolygon: () => null, renderLabelTypography: () => null };
const leaderGeometry = load('label-leader-geometry.js', ['deriveLabelLeaderGeometry', 'pointInLabelerBlock'], {
  ...LABEL_OFF, attachLeaderRoutesToLabel: routes => routes || [], labelTypographyAngle: () => 0, measureFormula: () => null,
  estimateLabelBlock: (text, size, pad) => ({ hw: size + pad, hh: size / 2 + pad }), DEFAULT_TEXT_FONT: 'sans-serif', DEFAULT_TEXT_SIZE_MM: 3.7,
});
const markers = load('labeler-target.js', ['labelerDotDiameter', 'labelerTargetDots']);
const core = load('render/core.js', ['SVG_NS', 'grayHex', 'applyDash'], { fillSvgTextWithRomanRuns() {} });
const annotations = load('render/annotations.js', ['renderLabeler'], {
  ...LABEL_OFF, ...leaderGeometry, ...core, ...markers, DEFAULT_TEXT_SIZE_MM: 3.7,
  estimateLabelBlock: (text, size, pad) => ({ hw: size + pad, hh: size / 2 + pad }),
  makeUprightLabel: () => null, hasStyledTextRuns: () => false, DEFAULT_TEXT_FONT: 'sans-serif',
});
const types = load('object-types.js', ['OBJECT_TYPES', 'SIZE_TYPES', 'BOX_FACE_TYPES', 'POINT_ARRAY_TYPES', 'TEXT_MEASURED_TYPES', 'zOrderObjects', 'ENDPOINT_HANDLE_TYPES', 'LABEL_CAPABLE_TYPES', 'OBJECT_TYPE_IDS', 'LINE_TOL_TYPES']);
const geometry = load('geometry.js', ['segDist']);
const picking = load('pick.js', ['getObjectBBox', 'hitTest'], {
  ...LABEL_OFF, ...leaderGeometry, ...types, ...geometry, ...markers, DEFAULT_TEXT_SIZE_MM: 3.7,
  getRenderScale: () => 1, estimateLabelBlock: (text, size, pad) => ({ hw: size + pad, hh: size / 2 + pad }),
});
const io = load('project-io.js', ['prepareLoadedProject', 'serialize'], {
  ...types, migrateObjectStyleMode() {}, DEFAULT_TEXT_FONT: 'sans-serif', DEFAULT_TEXT_SIZE_MM: 3.7,
});
const plain = x => JSON.parse(JSON.stringify(x));
const label = props => ({ id: 'label', type: 'labeler', p1: { x: 0, y: 0 }, p2: { x: 40, y: 0 }, text: 'O', strokeLevel: 0, strokeWidth: 0.2, ...props });

test('legacy and disabled labelers render without dots; invalid diameter uses the default', () => {
  for (const props of [{}, { targetMarker: 'none' }, { targetMarker: 'unknown' }]) {
    assert.equal(markers.labelerTargetDots(label(props)).length, 0);
    assert.equal(annotations.renderLabeler(label(props)).children.filter(n => n.tagName === 'circle').length, 0);
  }
  for (const diameter of [0, -2, Infinity, NaN, '2']) assert.equal(markers.labelerDotDiameter({ targetDotDiameter: diameter }), 1);
});

test('dots cover each target anchor, with no marker at the label or elbow', () => {
  const o = label({ targetMarker: 'dot', targetDotDiameter: 1.6, strokeLevel: 80,
    p3: { x: 5, y: 10 }, extraAnchors: [{ x: 8, y: -4 }, { x: NaN, y: 0 }], elbow: { x: 20, y: 4 } });
  const dots = annotations.renderLabeler(o).children.filter(n => n.tagName === 'circle');
  assert.deepEqual(dots.map(n => [Number(n.attrs.cx), Number(n.attrs.cy), Number(n.attrs.r)]), [[0, 0, 0.8], [5, 10, 0.8], [8, -4, 0.8]]);
  for (const dot of dots) { assert.equal(dot.attrs.fill, core.grayHex(80)); assert.equal(dot.attrs.stroke, 'none'); }
  const changedText = annotations.renderLabeler({ ...o, text: 'O_Q', labelSize: 9 }).children.filter(n => n.tagName === 'circle');
  assert.deepEqual(changedText.map(n => n.attrs), dots.map(n => n.attrs));
});

test('visible dot circumference is selectable and included in object bounds', () => {
  const o = label({ targetMarker: 'dot', targetDotDiameter: 20 });
  const b = picking.getObjectBBox(o);
  assert.equal(b.x, -10); assert.equal(b.y, -10); assert(b.y + b.h >= 10);
  assert.equal(picking.hitTest([o], { x: -8, y: 0 }, 0, 0), o.id);
  assert.equal(picking.hitTest([label({})], { x: -8, y: 0 }, 0, 0), null);
});

test('actual project loader and serializer preserve dot settings and legacy appearance', () => {
  const objs = [label({ targetMarker: 'dot', targetDotDiameter: 1.6 }), label({ id: 'old' })];
  const loaded = io.prepareLoadedProject({ version: '0.17', objects: objs, artboard: { w: 90, h: 60 } });
  const saved = io.serialize({ ...loaded, objects: loaded.active.objects, layers: loaded.active.layers, guides: loaded.active.guides, artboard: loaded.active.artboard });
  const reopened = io.prepareLoadedProject(plain(saved)).active.objects;
  assert.equal(reopened[0].targetMarker, 'dot'); assert.equal(reopened[0].targetDotDiameter, 1.6);
  assert.equal(markers.labelerTargetDots(reopened[1]).length, 0);
  assert.equal(reopened[0].type, 'labeler'); assert.equal(reopened[1].type, 'labeler');
});
