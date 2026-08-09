import test from "node:test";
import assert from "node:assert/strict";

import {
  NATURAL_EARTH_COMMIT,
  NATURAL_EARTH_SOURCE_SHA256,
  NATURAL_EARTH_COASTLINE_SHA256,
  buildMapAssetData,
  renderModule,
} from "../scripts/engine-v2/build-map-assets.mjs";
import {
  MAP_ASSET_DATA_VERSION,
  MAP_ASSET_SOURCE,
  MAP_ASSET_VARIANTS,
} from "../js/ai-map-assets-data.js";

const landFixture = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [[[-5, -5], [5, -5], [5, 5], [-5, 5], [-5, -5]]],
    },
  }],
};

const coastlineFixture = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: [[-5, -5], [5, -5], [5, 5], [-5, 5], [-5, -5]],
    },
  }],
};

test("map asset builder is deterministic and clips source geometry", () => {
  const first = buildMapAssetData(landFixture, coastlineFixture);
  const second = buildMapAssetData(landFixture, coastlineFixture);
  assert.deepEqual(first, second);
  assert.equal(first.world.ringCount, 1);
  assert.equal(first.world.coastlineCount, 1);
  assert.ok(first.world.rings[0].points.length >= 3);
  assert.ok(first.world.coastlines[0].points.length >= 2);
  for (const point of [...first.world.rings[0].points, ...first.world.coastlines[0].points]) {
    assert.ok(Number.isFinite(point[0]) && Number.isFinite(point[1]));
    assert.ok(point[0] >= 0 && point[0] <= first.world.sourceSize[0]);
    assert.ok(point[1] >= 0 && point[1] <= first.world.sourceSize[1]);
  }
  assert.equal(renderModule(first), renderModule(second));
});

test("checked-in map data is pinned to verified physical-coastline sources", () => {
  assert.equal(MAP_ASSET_DATA_VERSION, "5e-natural-earth-coastline@1");
  assert.equal(MAP_ASSET_SOURCE.commit, NATURAL_EARTH_COMMIT);
  assert.equal(MAP_ASSET_SOURCE.sha256, NATURAL_EARTH_SOURCE_SHA256);
  assert.equal(MAP_ASSET_SOURCE.coastlineSha256, NATURAL_EARTH_COASTLINE_SHA256);
  assert.match(MAP_ASSET_SOURCE.geometry, /physical land coastline/i);
  assert.deepEqual(Object.keys(MAP_ASSET_VARIANTS).sort(), ["east_asia", "korean_peninsula", "pacific", "world"]);
  for (const data of Object.values(MAP_ASSET_VARIANTS)) {
    assert.ok(data.ringCount > 0);
    assert.ok(data.coastlineCount > 0);
    assert.equal(data.ringCount, data.rings.length);
    assert.equal(data.coastlineCount, data.coastlines.length);
  }
});

