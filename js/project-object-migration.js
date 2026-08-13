import { migrateObjectStyleMode } from "./style-mode.js?v=1.4.0";
import { DEFAULT_TEXT_SIZE_MM, DEFAULT_TEXT_FONT, normalizeTextRuns, textRunsToText } from "./state.js?v=1.4.0";
import { LABEL_CAPABLE_TYPES } from "./object-types.js?v=1.4.0";

const APPARATUS_TEMPLATE_IDS = {
  wire: "E001",
  compass: "E002",
  pulley: "M001",
  clamp: "M004",
  scale: "M003",
  transistor: "E010",
  device_box: "E011",
  bar_magnet: "E012",
  electroscope: "E013",
  speaker: "W001",
  thermometer: "M010",
  phototube: "O010",
  slit: "O011",
  fringe_pattern: "O012",
};

function normalizeLabelType(value, fallback = "quantity") {
  return value === "quantity" || value === "label" ? value : fallback;
}

export function migrateObjectList(objects) {
  if (!Array.isArray(objects)) return [];
  return objects.map((obj) => {
    const next = {
      ...obj,
      positionLocked: obj.positionLocked ?? false,
    };
    if (LABEL_CAPABLE_TYPES.has(next.type)) {
      next.labelType = normalizeLabelType(next.labelType, next.type === "labeler" ? "label" : "quantity");
    }
    if ((next.type === "rect" || next.type === "ellipse") &&
        next.labelInner == null && next.labelOuter == null) {
      const pos = next.labelPos || "center";
      const inner = pos === "center";
      next.labelInner = inner ? (next.label ?? "") : "";
      next.labelInnerType = normalizeLabelType(next.labelType, "quantity");
      next.labelOuter = inner ? "" : (next.label ?? "");
      next.labelOuterPos = inner ? "right" : pos;
      next.labelOuterType = "label";
    }
    migrateObjectStyleMode(next);
    if (next.type === "text") {
      next.italic = next.italic ?? false;
      if (Array.isArray(next.textRuns) && next.textRuns.length) {
        next.textRuns = normalizeTextRuns(next);
        next.text = next.text ?? textRunsToText(next.textRuns);
      }
    }
    if (next.type === "formula") {
      next.italic = next.italic ?? false;
      next.rawSource = next.rawSource ?? next.source ?? "";
    }
    if (next.type === "polyline") {
      next.rounded = next.rounded ?? false;
      next.cornerRadius = next.cornerRadius ?? 10;
    }
    if (next.type === "optics" && next.kind === "object_arrow") {
      next.dashLength = next.dashLength ?? 0;
      next.dashGap = next.dashGap ?? 0;
    }
    if (next.type === "anglearc") {
      next.radius = next.radius ?? 14;
      next.startAngle = next.startAngle ?? 0;
      next.sweepAngle = next.sweepAngle ?? 60;
    }
    if (next.type === "rightangle") {
      next.size = next.size ?? 6;
      next.angle = next.angle ?? 0;
      next.orientation = next.orientation ?? 1;
    }
    if (next.type === "labeler") {
      next.p1 = next.p1 ?? { x: 0, y: 0 };
      next.p2 = next.p2 ?? { x: next.p1.x + 12, y: next.p1.y - 6 };
      next.text = next.text ?? "㉠";
      next.fontFamily = next.fontFamily ?? DEFAULT_TEXT_FONT;
      next.labelSize = next.labelSize ?? DEFAULT_TEXT_SIZE_MM;
      next.strokeLevel = next.strokeLevel ?? 0;
      next.strokeWidth = next.strokeWidth ?? 0.2;
      if (Array.isArray(next.textRuns) && next.textRuns.length) {
        next.textRuns = normalizeTextRuns(next);
        next.text = next.text ?? textRunsToText(next.textRuns);
      }
    }
    if (next.type === "image") {
      const oldBackgroundLocked = next.mode === "background" && next.locked === true && next.recognized !== true;
      next.mode = next.mode === "background" ? "background" : "edit";
      next.opacity = typeof next.opacity === "number" ? next.opacity : 1;
      next.aspectLocked = next.aspectLocked ?? true;
      next.exportable = next.exportable ?? true;
      next.cutouts = Array.isArray(next.cutouts) ? next.cutouts : [];
      next.imageSelectionLocked = next.imageSelectionLocked ?? oldBackgroundLocked;
      next.locked = oldBackgroundLocked ? false : (next.locked ?? false);
      if (next.imageSelectionLocked) next.positionLocked = false;
      next.recognized = next.recognized === true;
    }
    if (next.type === "pendulum") {
      next.p1 = next.p1 ?? { x: 0, y: 0 };
      next.p2 = next.p2 ?? { x: next.p1.x, y: next.p1.y + 30 };
      next.showCenterGhost = next.showCenterGhost ?? true;
      next.showSymmetricGhost = next.showSymmetricGhost ?? true;
      next.showLengthLabel = next.showLengthLabel ?? true;
      next.lengthLabel = next.lengthLabel ?? "L_B";
      next.labelType = "quantity";
      next.strokeLevel = next.strokeLevel ?? 0;
      next.strokeWidth = next.strokeWidth ?? 0.2;
    }
    if (next.type === "svgAsset") {
      next.assetId = next.assetId ?? "pulley";
      next.x = next.x ?? 0;
      next.y = next.y ?? 0;
      next.w = next.w ?? 43;
      next.h = next.h ?? 38;
      next.rotation = next.rotation ?? 0;
      next.lockAspect = next.lockAspect ?? true;
    }
    if (next.type === "apparatus") {
      next.kind = next.kind ?? "wire";
      next.templateId = next.templateId ?? APPARATUS_TEMPLATE_IDS[next.kind] ?? null;
      next.x = next.x ?? 0;
      next.y = next.y ?? 0;
      next.w = next.w ?? 20;
      next.h = next.h ?? 12;
      next.rotation = next.rotation ?? 0;
      if (next.kind === "wire") {
        next.length = next.length ?? next.w ?? 24;
        next.angle = next.angle ?? 0;
        next.thickness = next.thickness ?? next.gap ?? 1.8;
        next.gap = next.gap ?? next.thickness;
      }
      if (next.kind === "compass") next.needleAngle = next.needleAngle ?? -90;
      if (next.kind === "compass" || next.kind === "pulley" || next.kind === "clamp" || next.kind === "scale") {
        next.lockAspect = next.lockAspect ?? true;
      }
      if (next.kind === "pulley") next.variant = next.variant ?? "basic";
      if (next.kind === "clamp") next.flipped = next.flipped ?? false;
      if (next.kind === "scale") next.displayText = next.displayText ?? "0.99 N";
      if (next.kind === "electroscope") {
        next.leafSpread = next.leafSpread ?? 0.55;
        next.lockAspect = next.lockAspect ?? true;
      }
    }
    if (next.type === "coordplane") {
      next.x = next.x ?? 0; next.y = next.y ?? 0;
      next.w = next.w ?? 80; next.h = next.h ?? 80;
      next.rotation = next.rotation ?? 0;
      next.lockAspect = next.lockAspect ?? true;
      next.axisVariant = next.axisVariant ?? "cross";
      next.xMin = next.xMin ?? -5; next.xMax = next.xMax ?? 5;
      next.yMin = next.yMin ?? -5; next.yMax = next.yMax ?? 5;
      next.gridStepX = next.gridStepX ?? 1; next.gridStepY = next.gridStepY ?? 1;
      next.tickStepX = next.tickStepX ?? 1; next.tickStepY = next.tickStepY ?? 1;
      next.showAxisLines = next.showAxisLines ?? true;
      next.showGrid = next.showGrid ?? false;
      next.showTicks = next.showTicks ?? true;
      next.showTickX = next.showTickX ?? true;
      next.showTickY = next.showTickY ?? true;
      next.showTickLabels = next.showTickLabels ?? false;
      next.tickLabelSize = next.tickLabelSize ?? 2.6;
      next.tickLabelMode = next.tickLabelMode ?? (next.showTickLabels ? "number" : "none");
      next.tickTextX = Array.isArray(next.tickTextX) ? next.tickTextX : [];
      next.tickTextY = Array.isArray(next.tickTextY) ? next.tickTextY : [];
      {
        const gridOver = Number.isFinite(next.gridOver) ? next.gridOver : 0.5;
        next.gridOverXPos = Number.isFinite(next.gridOverXPos) ? next.gridOverXPos : gridOver;
        next.gridOverXNeg = Number.isFinite(next.gridOverXNeg) ? next.gridOverXNeg : gridOver;
        next.gridOverYPos = Number.isFinite(next.gridOverYPos) ? next.gridOverYPos : gridOver;
        next.gridOverYNeg = Number.isFinite(next.gridOverYNeg) ? next.gridOverYNeg : gridOver;
      }
      next.tickMovable = next.tickMovable ?? false;
      next.tickOffX = Array.isArray(next.tickOffX) ? next.tickOffX : [];
      next.tickOffY = Array.isArray(next.tickOffY) ? next.tickOffY : [];
      next.annMarkers = Array.isArray(next.annMarkers) ? next.annMarkers : [];
      next.annGuides = Array.isArray(next.annGuides) ? next.annGuides : [];
      next.annArrows = Array.isArray(next.annArrows) ? next.annArrows : [];
      next.guideLines = Array.isArray(next.guideLines) ? next.guideLines : [];
      next.legends = Array.isArray(next.legends) ? next.legends : [];
      next.annLabelPoints = Array.isArray(next.annLabelPoints) ? next.annLabelPoints : [];
      next.ranges = Array.isArray(next.ranges) ? next.ranges : [];
      next.dimensions = Array.isArray(next.dimensions) ? next.dimensions : [];
      next.leaders = Array.isArray(next.leaders) ? next.leaders : [];
      next.gridOver = Number.isFinite(next.gridOver) ? next.gridOver : (next.gridCountX !== undefined ? 0.5 : 0);
      next.labelScale = Number.isFinite(next.labelScale) ? next.labelScale : 1;
      next.labelX = next.labelX ?? "x"; next.labelY = next.labelY ?? "y";
      next.labelYLayout = next.labelYLayout ?? "horizontal";
      next.showAxisLabels = next.showAxisLabels ?? true;
      next.axisLabelSize = next.axisLabelSize ?? 3.5;
      next.showOrigin = next.showOrigin ?? true;
      next.exportable = next.exportable ?? true;
      next.strokeLevel = next.strokeLevel ?? 0;
      next.strokeWidth = next.strokeWidth ?? 0.2;
    }
    if (next.type === "funcgraph") {
      next.expr = next.expr ?? "";
      next.domainMin = next.domainMin ?? -5;
      next.domainMax = next.domainMax ?? 5;
      next.planeId = next.planeId ?? null;
      next.points = Array.isArray(next.points) ? next.points : [];
      next.closed = false;
      next.strokeLevel = next.strokeLevel ?? 0;
      next.strokeWidth = next.strokeWidth ?? 0.2;
      next.dashLength = next.dashLength ?? 0;
      next.dashGap = next.dashGap ?? 0;
      next.labelShow = next.labelShow ?? false;
    }
    return next;
  });
}
