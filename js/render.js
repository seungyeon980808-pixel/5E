/* ===== RENDER FACADE =====
 * js/render.js was split into domain modules under js/render/ (v0.41.0).
 * This file only re-exports the symbols consumed outside the render layer
 * (main.js, snap.js, svg-export.js, templates.js, tools.js, transform.js),
 * so every existing `from "./render.js?v=1.7.0-four-session-integration"` import keeps working. */

export { render, setSnapPreview, setSmartGuides, renderObject, singleObjBBox } from "./render/scene.js?v=1.7.0-four-session-integration";
export { rotPt, curveSamplePoints } from "./render/core.js?v=1.7.0-four-session-integration";
export { makeFillPattern } from "./render/fill.js?v=1.7.0-four-session-integration";
// 인스펙터가 상자 라벨 두 슬롯을 렌더러와 '같은 규칙'으로 읽기 위해 필요하다.
export { boxLabelSlots, makeLabelEl } from "./render/labels.js?v=1.7.0-four-session-integration";
export { circuitBodyPolygon } from "./render/circuit.js?v=1.7.0-four-session-integration";
export { pendulumGeometry, pendulumBobRadius, pendulumBBox } from "./render/pendulum.js?v=1.7.0-four-session-integration";
export { springGeometry, springBBox, SPRING_DEFAULTS } from "./render/spring.js?v=1.7.0-four-session-integration";
export { chargeFieldGeometry, chargeFieldBBox, CHARGEFIELD_DEFAULTS,
         fieldLinesGeometry, fieldLinesBBox, FIELDLINES_DEFAULTS } from "./render/field.js?v=1.7.0-four-session-integration";
export { standingWaveGeometry, standingWaveBBox, normalizeHarmonic,
         STANDINGWAVE_DEFAULTS } from "./render/standing-wave.js?v=1.7.0-four-session-integration";
export { pulleyGeom, pulleyAnchors } from "./render/optics-apparatus.js?v=1.7.0-four-session-integration";
export { parabolaPoints, parabolaBBox, parabolaApexPoints, DEFAULT_APEX_MM } from "./render/parabola.js?v=1.7.0-four-session-integration";
export { groundArcPoints, groundArcBBox, groundArcRadius, screenToGround,
         DEFAULT_SWEEP_DEG } from "./render/groundarc.js?v=1.7.0-four-session-integration";
// 생명과학 부품 6종 (2026-07-31) — 규격은 docs/BIO_PARTS_SPEC.md
export { bracePathPoints, braceBBox } from "./render/brace.js?v=1.7.0-four-session-integration";
export { chromosomeGeometry, chromosomeBBox } from "./render/chromosome.js?v=1.7.0-four-session-integration";
export { bilayerGeometry, bilayerBBox } from "./render/bilayer.js?v=1.7.0-four-session-integration";
export { neuronGeometry, neuronBBox } from "./render/neuron.js?v=1.7.0-four-session-integration";
export { legendLayout, legendBBox } from "./render/legend.js?v=1.7.0-four-session-integration";
export { pedigreeLayout, pedigreeBBox } from "./render/pedigree.js?v=1.7.0-four-session-integration";
// 화학 부품 10종 (2026-07-31) — 규격은 docs/CHEM_PARTS_SPEC.md
export { vesselBBox, VESSEL_KINDS } from "./render/vessel.js?v=1.7.0-four-session-integration";
export { chemModelBBox, MOLECULES, VALENCE } from "./render/chemmodel.js?v=1.7.0-four-session-integration";
export { particleBoxBBox } from "./render/particlebox.js?v=1.7.0-four-session-integration";
export { orbitalBBox } from "./render/orbital.js?v=1.7.0-four-session-integration";
export { bondGroupBBox, BOND_MOLECULES } from "./render/bondgroup.js?v=1.7.0-four-session-integration";
export { chemChartBBox } from "./render/chemchart.js?v=1.7.0-four-session-integration";
export { axisBreakBBox } from "./render/axisbreak.js?v=1.7.0-four-session-integration";
export { bubbleLayout, bubblePath, bubbleBBox } from "./render/bubble.js?v=1.7.0-four-session-integration";
export { chemGraphBBox } from "./render/chemgraph.js?v=1.7.0-four-session-integration";
export { electrodeBBox } from "./render/electrode.js?v=1.7.0-four-session-integration";
export { periodicBBox, PERIODIC_ELEMENTS } from "./render/periodic.js?v=1.7.0-four-session-integration";
