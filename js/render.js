/* ===== RENDER FACADE =====
 * js/render.js was split into domain modules under js/render/ (v0.41.0).
 * This file only re-exports the symbols consumed outside the render layer
 * (main.js, snap.js, svg-export.js, templates.js, tools.js, transform.js),
 * so every existing `from "./render.js?v=..."` import keeps working. */

export { render, setSnapPreview, setSmartGuides, renderObject, singleObjBBox } from "./render/scene.js?v=1.4.2";
export { rotPt, curveSamplePoints } from "./render/core.js?v=1.4.0";
export { makeFillPattern } from "./render/fill.js?v=1.4.0";
// 인스펙터가 상자 라벨 두 슬롯을 렌더러와 '같은 규칙'으로 읽기 위해 필요하다.
export { boxLabelSlots, makeLabelEl } from "./render/labels.js?v=1.4.0";
export { circuitBodyPolygon } from "./render/circuit.js?v=1.4.0";
export { pendulumGeometry, pendulumBobRadius, pendulumBBox } from "./render/pendulum.js?v=1.4.0";
export { springGeometry, springBBox, SPRING_DEFAULTS } from "./render/spring.js?v=1.4.0";
export { chargeFieldGeometry, chargeFieldBBox, CHARGEFIELD_DEFAULTS,
         fieldLinesGeometry, fieldLinesBBox, FIELDLINES_DEFAULTS } from "./render/field.js?v=1.4.0";
export { standingWaveGeometry, standingWaveBBox, normalizeHarmonic,
         STANDINGWAVE_DEFAULTS } from "./render/standing-wave.js?v=1.4.0";
export { pulleyGeom, pulleyAnchors } from "./render/optics-apparatus.js?v=1.4.0";
export { parabolaPoints, parabolaBBox, parabolaApexPoints, DEFAULT_APEX_MM } from "./render/parabola.js?v=1.4.0";
export { groundArcPoints, groundArcBBox, groundArcRadius, screenToGround,
         DEFAULT_SWEEP_DEG } from "./render/groundarc.js?v=1.4.0";
// 생명과학 부품 6종 (2026-07-31) — 규격은 docs/BIO_PARTS_SPEC.md
export { bracePathPoints, braceBBox } from "./render/brace.js?v=1.4.0";
export { chromosomeGeometry, chromosomeBBox } from "./render/chromosome.js?v=1.4.0";
export { bilayerGeometry, bilayerBBox } from "./render/bilayer.js?v=1.4.0";
export { neuronGeometry, neuronBBox } from "./render/neuron.js?v=1.4.0";
export { legendLayout, legendBBox } from "./render/legend.js?v=1.4.0";
export { pedigreeLayout, pedigreeBBox } from "./render/pedigree.js?v=1.4.0";
// 화학 부품 10종 (2026-07-31) — 규격은 docs/CHEM_PARTS_SPEC.md
export { vesselBBox, VESSEL_KINDS } from "./render/vessel.js?v=1.4.0";
export { chemModelBBox, MOLECULES, VALENCE } from "./render/chemmodel.js?v=1.4.0";
export { particleBoxBBox } from "./render/particlebox.js?v=1.4.0";
export { orbitalBBox } from "./render/orbital.js?v=1.4.0";
export { bondGroupBBox, BOND_MOLECULES } from "./render/bondgroup.js?v=1.4.0";
export { chemChartBBox } from "./render/chemchart.js?v=1.4.0";
export { axisBreakBBox } from "./render/axisbreak.js?v=1.4.0";
export { chemGraphBBox } from "./render/chemgraph.js?v=1.4.0";
export { electrodeBBox } from "./render/electrode.js?v=1.4.0";
export { periodicBBox, PERIODIC_ELEMENTS } from "./render/periodic.js?v=1.4.0";
