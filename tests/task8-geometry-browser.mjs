import { buildExportSvg, getContentBounds, rasterizeExportCanvas } from '../preview/js/svg-export.js';
import { renderObject } from '../preview/js/render.js';
import { zOrderObjects } from '../preview/js/object-types.js';
import { chromosomeBBox, chromosomeGeometry } from '../preview/js/render/chromosome.js';
import { buildGeometrySection } from '../preview/js/inspector/section-geometry.js';

const result = document.querySelector('#result');
const surfaces = document.querySelector('#surfaces');
const SVG_NS = 'http://www.w3.org/2000/svg';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function rect(id, layerId = 1) {
  return {
    id, type: 'rect', x: -28, y: -15, w: 56, h: 30,
    fillStyle: 'solid', fillLevel: 217, strokeLevel: 0, strokeWidth: 0.4,
    rotation: 0, layerId,
  };
}

function text(id, layerId = 1) {
  return {
    id, type: 'text', x: -24, y: -10, text: 'VISIBLE LABEL',
    fontSize: 5, fontFamily: 'Arial, sans-serif', fontWeight: '700', fontStyle: 'normal',
    rotation: 0, layerId,
  };
}

function koreanText(id, layerId = 1) {
  return {
    id, type: 'text', x: -24, y: -2, text: '한글 라벨\n내보내기 확인',
    fontSize: 4, fontFamily: 'Arial, sans-serif', fontWeight: '600', fontStyle: 'normal',
    rotation: 0, layerId,
  };
}

function formula(id, layerId = 1) {
  return {
    id, type: 'formula', x: 16, y: 9, source: 'v^2', rawSource: 'v^2',
    fontSize: 5, fontFamily: 'serif', fontWeight: 'normal', italic: false,
    w: 12, h: 7, rotation: 0, layerId,
  };
}

function state(objects, layers = [{ id: 1, visible: true }, { id: 2, visible: true }]) {
  return { artboard: { w: 100, h: 70 }, objects, layers };
}

function card(title, node) {
  const section = document.createElement('section');
  section.className = 'card';
  const heading = document.createElement('h2');
  heading.textContent = title;
  section.append(heading, node);
  surfaces.appendChild(section);
}

function editorSvg(objects) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '-50 -35 100 70');
  for (const object of zOrderObjects(objects)) {
    const node = renderObject(object);
    if (node) svg.appendChild(node);
  }
  return svg;
}

function ids(svg) {
  return Array.from(svg.querySelector('g[clip-path]').children, node => node.dataset.id);
}

function arrowPoints(svg) {
  return Array.from(svg.querySelectorAll('polygon[points]')).flatMap(polygon =>
    polygon.getAttribute('points').trim().split(/\s+/).map(pair => {
      const [x, y] = pair.split(',').map(Number);
      return { x, y };
    }));
}

async function post(path, body) {
  const response = await fetch(path, { method: 'POST', body });
  assert(response.ok, `evidence POST failed: ${path}`);
}

function rowStub(label = '') {
  const row = document.createElement('div');
  const fieldLabel = document.createElement('label');
  fieldLabel.className = 'insp-field-label';
  fieldLabel.textContent = label;
  row.appendChild(fieldLabel);
  return { row };
}

async function run() {
  const creationOrders = [
    [text('text-first'), koreanText('korean-first'), formula('formula-first'), rect('shape-last')],
    [rect('shape-first'), text('text-last'), koreanText('korean-last'), formula('formula-last')],
  ];
  const orderReports = [];
  let exportedCanvas;
  for (const [index, objects] of creationOrders.entries()) {
    const expected = Array.from(zOrderObjects(objects), object => object.id);
    const exported = buildExportSvg(state(objects));
    const actual = ids(exported);
    assert(JSON.stringify(actual) === JSON.stringify(expected), `z-order ${index + 1} mismatch`);
    orderReports.push({ creation: objects.map(object => object.id), expected, actual });
    if (index === 0) {
      card('Editor canonical order', editorSvg(objects));
      card('Exported SVG order', exported);
      exportedCanvas = (await rasterizeExportCanvas(state(objects), { dpi: 150 })).canvas;
      card('Exported PNG raster', exportedCanvas);
    }
  }

  const hiddenObjects = [text('visible-text'), formula('hidden-formula', 2), rect('visible-shape')];
  const hiddenState = state(hiddenObjects, [{ id: 1, visible: true }, { id: 2, visible: false }]);
  assert(JSON.stringify(ids(buildExportSvg(hiddenState))) === JSON.stringify(['visible-shape', 'visible-text']),
    'hidden layer changed canonical export order');

  const arrow = {
    id: 'rotated-both', type: 'line', p1: { x: -30, y: -4 }, p2: { x: 30, y: 8 },
    lineMode: 'arrow', lineStyle: 'arrow', arrowHead: 'both', arrowVariant: 'both',
    strokeLevel: 0, strokeWidth: 2, layerId: 1,
  };
  const arrowState = state([arrow]);
  const bounds = getContentBounds(arrowState, {}, 0);
  const fittedSvg = buildExportSvg(arrowState, bounds);
  for (const point of arrowPoints(fittedSvg)) {
    assert(point.x >= bounds.x && point.x <= bounds.x + bounds.w, 'arrow x clipped');
    assert(point.y >= bounds.y && point.y <= bounds.y + bounds.h, 'arrow y clipped');
  }
  const arrowCanvas = (await rasterizeExportCanvas(arrowState, { dpi: 150, bounds })).canvas;
  card('Zero-margin rotated bidirectional arrow SVG', fittedSvg);
  card('Zero-margin rotated bidirectional arrow PNG', arrowCanvas);

  const sizeModel = {
    objects: [{ id: 'size-object', type: 'rect', x: 2, y: 3, w: 20, h: 10, rotation: 0 }],
    selectedIds: ['size-object'], undoStack: [], redoStack: [],
  };
  const store = { get: () => sizeModel, update: update => update(sizeModel) };
  const geometrySection = buildGeometrySection({
    state: store,
    makeLabelSizeRow: () => rowStub('크기'),
    makeLabelTypeRow: () => rowStub('종류'),
    commitSelectedObject: () => false,
  });
  geometrySection.wF.inp.value = '-10';
  geometrySection.wF.inp.dispatchEvent(new Event('blur'));
  assert(sizeModel.objects[0].w === 20 && sizeModel.undoStack.length === 0, 'invalid width mutated state or undo');
  geometrySection.xF.inp.value = '-12.5';
  geometrySection.xF.inp.dispatchEvent(new Event('blur'));
  geometrySection.rotF.inp.value = '-45';
  geometrySection.rotF.inp.dispatchEvent(new Event('blur'));
  assert(sizeModel.objects[0].x === -12.5 && sizeModel.objects[0].rotation === -45,
    'legal negative position or angle was rejected');

  const chromosomeCases = [0, 0.00001, 0.0001, 20].map((length, index) => {
    const object = {
      id: `chromosome-${index}`, type: 'chromosome',
      p1: { x: -30 + index * 20, y: -10 }, p2: { x: -30 + index * 20, y: -10 + length },
      strokeWidth: 0.4, strokeLevel: 0, layerId: 1,
    };
    const geometry = chromosomeGeometry(object);
    const bbox = chromosomeBBox(object);
    const unit = Math.hypot(geometry.ux, geometry.uy);
    assert(Math.abs(unit - 1) < 1e-9, `chromosome ${length} axis is not normalized`);
    assert([bbox.x, bbox.y, bbox.w, bbox.h].every(Number.isFinite), `chromosome ${length} bbox is non-finite`);
    assert(bbox.w <= 100 && bbox.h <= 100, `chromosome ${length} bbox is unbounded`);
    return { length, unit, bbox, object };
  });
  const chromosomeState = state(chromosomeCases.map(entry => entry.object));
  const chromosomeBounds = getContentBounds(chromosomeState, {}, 2);
  const chromosomeSvg = buildExportSvg(chromosomeState, chromosomeBounds);
  const chromosomeCanvas = (await rasterizeExportCanvas(chromosomeState, { dpi: 150, bounds: chromosomeBounds })).canvas;
  card('Zero, tiny, and normal chromosomes SVG', chromosomeSvg);
  card('Zero, tiny, and normal chromosomes PNG', chromosomeCanvas);

  const report = {
    passed: true,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    orderReports,
    hiddenOrder: ids(buildExportSvg(hiddenState)),
    arrowBounds: bounds,
    arrowPointCount: arrowPoints(fittedSvg).length,
    invalidSize: { width: sizeModel.objects[0].w, undoEntries: sizeModel.undoStack.length - 2 },
    legalSigned: { x: sizeModel.objects[0].x, rotation: sizeModel.objects[0].rotation },
    chromosomeCases: chromosomeCases.map(({ object, ...entry }) => entry),
  };

  const serializer = new XMLSerializer();
  const board = document.createElement('canvas');
  board.width = 1280;
  board.height = 900;
  const context = board.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, board.width, board.height);
  context.fillStyle = '#111827';
  context.font = 'bold 28px sans-serif';
  context.fillText('5E Task 8 export and geometry QA', 36, 48);
  context.drawImage(exportedCanvas, 36, 80, 570, 380);
  context.drawImage(arrowCanvas, 674, 80, 570, 200);
  context.drawImage(chromosomeCanvas, 674, 320, 570, 200);
  context.font = '17px monospace';
  const lines = [
    `z-order: ${orderReports[0].actual.join(' > ')}`,
    `hidden: ${report.hiddenOrder.join(' > ')}`,
    `arrow bounds: ${JSON.stringify(bounds)}`,
    `invalid width preserved: ${report.invalidSize.width}; undo delta: ${report.invalidSize.undoEntries}`,
    `legal x/rotation: ${report.legalSigned.x}, ${report.legalSigned.rotation}`,
    ...report.chromosomeCases.map(entry => `chromosome ${entry.length}: unit=${entry.unit.toFixed(4)} bbox=${JSON.stringify(entry.bbox)}`),
  ];
  lines.forEach((line, index) => context.fillText(line, 36, 575 + index * 30));

  const boardBlob = await new Promise(resolve => board.toBlob(resolve, 'image/png'));
  const exportBlob = await new Promise(resolve => exportedCanvas.toBlob(resolve, 'image/png'));
  const arrowBlob = await new Promise(resolve => arrowCanvas.toBlob(resolve, 'image/png'));
  await Promise.all([
    post('/__task8_report', `${JSON.stringify(report, null, 2)}\n`),
    post('/__task8_board', boardBlob),
    post('/__task8_export_png', exportBlob),
    post('/__task8_arrow_png', arrowBlob),
    post('/__task8_export_svg', serializer.serializeToString(fittedSvg)),
  ]);
  result.dataset.status = 'passed';
  result.textContent = JSON.stringify(report, null, 2);
  document.title = 'PASS Task 8 geometry browser QA';
  window.task8Report = report;
}

run().catch(error => {
  result.dataset.status = 'failed';
  result.textContent = error.stack || String(error);
  document.title = 'FAIL Task 8 geometry browser QA';
  window.task8Error = error;
});
