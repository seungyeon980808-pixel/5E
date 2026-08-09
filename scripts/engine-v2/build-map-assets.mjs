#!/usr/bin/env node

/* Build deterministic, code-native map outlines from Natural Earth land data.
 *
 * This is a build-time tool only. The generated runtime data contains physical
 * coastlines, not political borders, labels or disputed-boundary claims.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const NATURAL_EARTH_COMMIT = "ca96624a56bd078437bca8184e78163e5039ad19";
export const NATURAL_EARTH_SOURCE_URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NATURAL_EARTH_COMMIT}/geojson/ne_50m_land.geojson`;
export const NATURAL_EARTH_SOURCE_SHA256 = "e874b27a51d146452be360cafb3cc50c86001074a67d534113e6534682f9826b";
export const NATURAL_EARTH_COASTLINE_URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NATURAL_EARTH_COMMIT}/geojson/ne_50m_coastline.geojson`;
export const NATURAL_EARTH_COASTLINE_SHA256 = "271f1c4c1908312bac6b29d158ea1356544beafc129f260005300913aa5ea283";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT = path.resolve(HERE, "../../js/ai-map-assets-data.js");

const VARIANTS = Object.freeze({
  world: Object.freeze({ bbox: [-180, -58, 180, 84], wrapCenter: 0, target: [160, 72], tolerance: 0.34, minArea: 0.055, maxGroups: 58 }),
  pacific: Object.freeze({ bbox: [100, -10, 300, 70], wrapCenter: 200, target: [160, 72], tolerance: 0.28, minArea: 0.04, maxGroups: 72 }),
  east_asia: Object.freeze({ bbox: [95, 10, 160, 60], wrapCenter: 127.5, target: [122, 84], tolerance: 0.19, minArea: 0.025, maxGroups: 82 }),
  korean_peninsula: Object.freeze({ bbox: [124, 32.5, 131.5, 43.5], wrapCenter: 127.75, target: [70, 100], tolerance: 0.11, minArea: 0.012, maxGroups: 110 }),
});

function parseArgs(argv) {
  const args = { source: null, coastline: null, output: DEFAULT_OUTPUT, stdout: false, check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source") args.source = argv[++i];
    else if (arg === "--coastline") args.coastline = argv[++i];
    else if (arg === "--output") args.output = path.resolve(argv[++i]);
    else if (arg === "--stdout") args.stdout = true;
    else if (arg === "--check") args.check = true;
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write("Usage: node build-map-assets.mjs --source ne_50m_land.geojson --coastline ne_50m_coastline.geojson [--output FILE] [--stdout] [--check]\n");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.source) throw new Error("--source is required. Download the pinned Natural Earth GeoJSON first.");
  if (!args.coastline) throw new Error("--coastline is required. Download the pinned Natural Earth coastline GeoJSON first.");
  args.source = path.resolve(args.source);
  args.coastline = path.resolve(args.coastline);
  return args;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function flattenGeometry(featureCollection) {
  const groups = [];
  let groupId = 0;
  for (const feature of featureCollection.features || []) {
    const geometry = feature?.geometry;
    if (!geometry) continue;
    const polygons = geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
    for (const polygon of polygons) {
      const rings = polygon
        .filter((ring) => Array.isArray(ring) && ring.length >= 4)
        .map((ring, ringIndex) => ({ points: ring, hole: ringIndex > 0 }));
      if (rings.length) groups.push({ id: groupId++, rings });
    }
  }
  return groups;
}

function flattenCoastlines(featureCollection) {
  const lines = [];
  for (const feature of featureCollection.features || []) {
    const geometry = feature?.geometry;
    if (!geometry) continue;
    const candidates = geometry.type === "LineString"
      ? [geometry.coordinates]
      : geometry.type === "MultiLineString" ? geometry.coordinates : [];
    for (const line of candidates) {
      if (Array.isArray(line) && line.length >= 2) lines.push(line);
    }
  }
  return lines;
}

function normalizeLongitudeSequence(points, center) {
  if (!points.length) return [];
  const out = [];
  let previous = Number(points[0][0]);
  while (previous - center > 180) previous -= 360;
  while (previous - center < -180) previous += 360;
  out.push([previous, Number(points[0][1])]);
  for (let i = 1; i < points.length; i += 1) {
    let lon = Number(points[i][0]);
    while (lon - previous > 180) lon -= 360;
    while (lon - previous < -180) lon += 360;
    out.push([lon, Number(points[i][1])]);
    previous = lon;
  }
  const mean = out.reduce((sum, point) => sum + point[0], 0) / out.length;
  const shift = Math.round((center - mean) / 360) * 360;
  return out.map(([lon, lat]) => [lon + shift, lat]);
}

function clipAgainst(points, inside, intersect) {
  if (!points.length) return [];
  const out = [];
  let previous = points[points.length - 1];
  let previousInside = inside(previous);
  for (const current of points) {
    const currentInside = inside(current);
    if (currentInside !== previousInside) out.push(intersect(previous, current));
    if (currentInside) out.push(current);
    previous = current;
    previousInside = currentInside;
  }
  return out;
}

function clipPolygon(points, bbox) {
  const [minX, minY, maxX, maxY] = bbox;
  let out = points.slice(0, -1);
  const vertical = (x) => (a, b) => {
    const t = (x - a[0]) / (b[0] - a[0]);
    return [x, a[1] + (b[1] - a[1]) * t];
  };
  const horizontal = (y) => (a, b) => {
    const t = (y - a[1]) / (b[1] - a[1]);
    return [a[0] + (b[0] - a[0]) * t, y];
  };
  out = clipAgainst(out, ([x]) => x >= minX, vertical(minX));
  out = clipAgainst(out, ([x]) => x <= maxX, vertical(maxX));
  out = clipAgainst(out, ([, y]) => y >= minY, horizontal(minY));
  out = clipAgainst(out, ([, y]) => y <= maxY, horizontal(maxY));
  if (out.length < 3) return [];
  return out;
}

function clipSegment(a, b, bbox) {
  const [minX, minY, maxX, maxY] = bbox;
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const tests = [
    [-dx, a[0] - minX], [dx, maxX - a[0]],
    [-dy, a[1] - minY], [dy, maxY - a[1]],
  ];
  for (const [p, q] of tests) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

function samePoint(a, b, epsilon = 1e-8) {
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

function clipPolyline(points, bbox) {
  const runs = [];
  let current = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const clipped = clipSegment(points[i], points[i + 1], bbox);
    if (!clipped) {
      if (current.length >= 2) runs.push(current);
      current = [];
      continue;
    }
    if (!current.length) current.push(clipped[0], clipped[1]);
    else if (samePoint(current[current.length - 1], clipped[0])) current.push(clipped[1]);
    else {
      if (current.length >= 2) runs.push(current);
      current = [clipped[0], clipped[1]];
    }
  }
  if (current.length >= 2) runs.push(current);
  return runs;
}

function squaredSegmentDistance(point, start, end) {
  let x = start[0], y = start[1];
  let dx = end[0] - x, dy = end[1] - y;
  if (dx || dy) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = end[0]; y = end[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplifyOpen(points, tolerance) {
  if (points.length <= 3) return points.slice();
  const sqTolerance = tolerance * tolerance;
  const markers = new Uint8Array(points.length);
  markers[0] = 1;
  markers[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDistance = sqTolerance;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const distance = squaredSegmentDistance(points[i], points[first], points[last]);
      if (distance > maxDistance) { index = i; maxDistance = distance; }
    }
    if (index >= 0) {
      markers[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, index) => markers[index]);
}

function simplifyRing(points, tolerance) {
  if (points.length <= 5) return points.slice();
  let split = 1;
  let best = -1;
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i][0] - points[0][0];
    const dy = points[i][1] - points[0][1];
    const d = dx * dx + dy * dy;
    if (d > best) { best = d; split = i; }
  }
  const a = simplifyOpen(points.slice(0, split + 1), tolerance);
  const b = simplifyOpen(points.slice(split).concat([points[0]]), tolerance);
  const joined = a.concat(b.slice(1, -1));
  return joined.length >= 3 ? joined : points.slice();
}

function project(points, config) {
  const [minLon, minLat, maxLon, maxLat] = config.bbox;
  const [width, height] = config.target;
  return points.map(([lon, lat]) => [
    ((lon - minLon) / (maxLon - minLon)) * width,
    ((maxLat - lat) / (maxLat - minLat)) * height,
  ]);
}

function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i], b = points[(i + 1) % points.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return total;
}

function roundPoint([x, y]) {
  return [Number(x.toFixed(5)), Number(y.toFixed(5))];
}

function buildVariant(sourceGroups, sourceCoastlines, config) {
  const projectedGroups = [];
  for (const sourceGroup of sourceGroups) {
    const rings = [];
    for (const sourceRing of sourceGroup.rings) {
      const normalized = normalizeLongitudeSequence(sourceRing.points, config.wrapCenter);
      const clipped = clipPolygon(normalized, config.bbox);
      if (clipped.length < 3) continue;
      const projected = project(clipped, config);
      const simplified = simplifyRing(projected, config.tolerance);
      const area = polygonArea(simplified);
      if (area < config.minArea) continue;
      rings.push({ hole: sourceRing.hole, area, points: simplified.map(roundPoint) });
    }
    const outer = rings.find((ring) => !ring.hole);
    if (!outer) continue;
    projectedGroups.push({ area: outer.area, rings: [outer, ...rings.filter((ring) => ring.hole)] });
  }
  projectedGroups.sort((a, b) => b.area - a.area);
  const kept = projectedGroups.slice(0, config.maxGroups);
  const rings = kept.flatMap((group) => group.rings.map((ring) => ({ hole: ring.hole, points: ring.points })));
  const coastlines = [];
  for (const sourceLine of sourceCoastlines) {
    const normalized = normalizeLongitudeSequence(sourceLine, config.wrapCenter);
    for (const run of clipPolyline(normalized, config.bbox)) {
      const projected = project(run, config);
      const simplified = simplifyOpen(projected, config.tolerance);
      const length = polylineLength(simplified);
      if (simplified.length >= 2 && length >= Math.max(0.5, config.tolerance * 2)) {
        coastlines.push({ length, points: simplified.map(roundPoint) });
      }
    }
  }
  coastlines.sort((a, b) => b.length - a.length);
  const keptCoastlines = coastlines.slice(0, 120).map(({ points }) => ({ points }));
  return {
    bbox: config.bbox,
    sourceSize: config.target,
    groupCount: kept.length,
    ringCount: rings.length,
    pointCount: rings.reduce((sum, ring) => sum + ring.points.length, 0),
    rings,
    coastlineCount: keptCoastlines.length,
    coastlinePointCount: keptCoastlines.reduce((sum, line) => sum + line.points.length, 0),
    coastlines: keptCoastlines,
  };
}

function stableStringify(value) {
  return JSON.stringify(value, null, 2);
}

export function buildMapAssetData(featureCollection, coastlineCollection) {
  const sourceGroups = flattenGeometry(featureCollection);
  const sourceCoastlines = flattenCoastlines(coastlineCollection);
  return Object.fromEntries(Object.entries(VARIANTS).map(([id, config]) => [id, buildVariant(sourceGroups, sourceCoastlines, config)]));
}

export function renderModule(data) {
  const source = {
    name: "Natural Earth ne_50m_land",
    url: NATURAL_EARTH_SOURCE_URL,
    commit: NATURAL_EARTH_COMMIT,
    sha256: NATURAL_EARTH_SOURCE_SHA256,
    coastlineUrl: NATURAL_EARTH_COASTLINE_URL,
    coastlineSha256: NATURAL_EARTH_COASTLINE_SHA256,
    license: "public domain",
    geometry: "physical land coastline only; no political boundaries",
  };
  return `/* Generated by scripts/engine-v2/build-map-assets.mjs. Do not hand-edit. */\n\n`
    + `export const MAP_ASSET_DATA_VERSION = "5e-natural-earth-coastline@1";\n`
    + `export const MAP_ASSET_SOURCE = Object.freeze(${stableStringify(source)});\n`
    + `export const MAP_ASSET_VARIANTS = Object.freeze(${stableStringify(data)});\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const buffer = fs.readFileSync(args.source);
  const actualHash = sha256(buffer);
  if (actualHash !== NATURAL_EARTH_SOURCE_SHA256) {
    throw new Error(`Natural Earth source hash mismatch: expected ${NATURAL_EARTH_SOURCE_SHA256}, got ${actualHash}`);
  }
  const coastlineBuffer = fs.readFileSync(args.coastline);
  const actualCoastlineHash = sha256(coastlineBuffer);
  if (actualCoastlineHash !== NATURAL_EARTH_COASTLINE_SHA256) {
    throw new Error(`Natural Earth coastline hash mismatch: expected ${NATURAL_EARTH_COASTLINE_SHA256}, got ${actualCoastlineHash}`);
  }
  const featureCollection = JSON.parse(buffer.toString("utf8"));
  const coastlineCollection = JSON.parse(coastlineBuffer.toString("utf8"));
  const output = renderModule(buildMapAssetData(featureCollection, coastlineCollection));
  if (args.stdout) process.stdout.write(output);
  if (args.check) {
    if (!fs.existsSync(args.output)) throw new Error(`Generated map data is missing: ${args.output}`);
    if (fs.readFileSync(args.output, "utf8") !== output) throw new Error(`Generated map data is stale: ${args.output}`);
  } else if (!args.stdout) {
    fs.mkdirSync(path.dirname(args.output), { recursive: true });
    fs.writeFileSync(args.output, output, "utf8");
    process.stdout.write(`${args.output}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
