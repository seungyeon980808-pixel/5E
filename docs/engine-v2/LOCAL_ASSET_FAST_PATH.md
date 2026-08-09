# Local asset fast path

`js/ai-local-asset-router.js` recognizes a deliberately narrow set of complete requests and converts them directly into an audited high-level motif request. It performs no network request, model turn, tool call, raster generation, or image upload. A match can therefore be compiled immediately by the existing code-native motif runtime.

This is an optimization boundary, not a general natural-language interpreter. False negatives are preferred to false positives. Any unrecognized, mixed, destructive, reference-based, or ambiguous request must continue through the normal engine router.

## Public contract

```js
import { matchLocalAssetRequest } from "./js/ai-local-asset-router.js";

const routed = matchLocalAssetRequest({
  request: "한반도 물리 해안선 지도 윤곽만 그려 줘",
  mode: "diagram",
  references: [],
});
```

A match returns:

```json
{
  "matched": true,
  "motifRequest": {
    "type": "motif",
    "motif": "verified_map_outline",
    "options": {
      "variant": "korean_peninsula",
      "fillLand": false
    }
  },
  "reason": "local-verified-map-outline:korean_peninsula"
}
```

A miss returns only a non-authoritative diagnostic reason:

```json
{
  "matched": false,
  "reason": "map-overlay-or-unsafe-content"
}
```

The caller must use `motifRequest` only when `matched === true`. The reason strings help tests and diagnostics; they are not user-facing error messages and must not be used to force a match.

The returned object is deterministic for an identical normalized request. `JSON.stringify(result.motifRequest)` is therefore suitable as the asset portion of a cache key. The module does not return a compiled scene because compilation belongs to the existing motif runtime:

```js
import { compileAiMotif } from "./js/ai-motif-catalog.js";

const routed = matchLocalAssetRequest({ request, mode, references });
if (routed.matched) {
  const { motif, options } = routed.motifRequest;
  const compiled = compileAiMotif(motif, options, { idPrefix: "ai_local" });
  // Insert compiled.objects through the normal native-scene insertion path.
}
```

## Global gates

The local path is considered only when all of these are true:

- `mode` is exactly `diagram`;
- `references` is absent or an empty array;
- `request` is a non-empty string;
- the request is not a destructive edit such as remove, delete, erase, cut out, 삭제, 제거, 지우기, or 빼기;
- the request is not a revision of an earlier/reference/original image or result;
- exactly one supported asset family can satisfy the whole request.

`complete` mode is rejected because the local assets intentionally do not generate labels or other finished annotations. A reference, even a single reference, is rejected because matching a reference requires structural interpretation rather than a deterministic phrase-to-asset lookup.

## Supported exact families

### Panel flow scaffold

The panel-flow route requires an exact panel count from 2 through 5 and an explicit plain-line connection between adjacent panels. It supports only these closed grammars:

1. empty rectangular boxes;
2. identical empty beakers, flasks, or test tubes;
3. particle boxes whose left-to-right/order wording, state, and particle count are stated for every panel.

Examples:

- `빈 비커 4개로 패널 흐름 도식을 만들고 비커 사이를 실선 연결선으로 연결해 줘`
- `입자 상자 3개를 왼쪽부터 기체 입자 12개, 액체 입자 10개, 고체 입자 8개로 두고 패널 사이를 평범한 연결선으로 연결해 줘`

The second example produces:

```js
{
  type: "motif",
  motif: "panel_flow",
  options: {
    panelCount: 3,
    panelType: "particlebox",
    states: [
      { state: "gas", count: 12 },
      { state: "liquid", count: 10 },
      { state: "solid", count: 8 },
    ],
    connectors: true,
  },
}
```

Missing panel counts, panel counts outside 2–5, unspecified vessel contents, liquid levels, pistons, weights, clamps, valves, ticks, reaction conditions, missing particle order, missing particle counts, non-plain connectors, mixed vessel kinds, or any second scene object are rejected. The matcher does not infer a scientific state from panel position.

### Empty dual-axis scaffold

This route is an annotation-free coordinate scaffold, not a data-plot interpreter. The request must explicitly state:

- left and right y axes (dual y axis);
- one x axis;
- that the plot is blank or has no data/series/curves;
- an exact equal-division/tick count from 2 through 12.

```js
{
  type: "motif",
  motif: "dual_axis_plot",
  options: { tickCount: 5, leftSeries: [], rightSeries: [], grid: false },
}
```

`빈 이중 y축 그래프에 x축과 5등분 눈금만 있는 도식` matches. Any data points, functions, curves, trends, ranges, grid, bar/scatter content, or second apparatus rejects the local path. Series geometry cannot be safely invented from prose such as “increase and then decrease.”

### Closed-loop wiring scaffolds

Only two complete, fixed topologies are accepted:

| Exact request | Motif | Fixed topology |
|---|---|---|
| rectangular closed orthogonal solid-line loop with exactly four terminal nodes | `orthogonal_wiring` | 4 corner nodes, 4 axis-aligned edges |
| triangular closed diagonal solid-line loop with exactly three terminal nodes | `diagonal_wiring` | 3 corner nodes, 3 direct edges |

The returned `options` contains every node coordinate and edge explicitly plus `showNodes:true`; it does not depend on a hidden runtime topology default. The request must call the result a wiring/circuit scaffold or wiring-only result.

Open loops, missing node counts, shape/count conflicts, mixed orthogonal and diagonal strategies, dashed wires, branches, crossings, series/parallel networks, resistors, bulbs, cells, switches, capacitors, inductors, diodes, ground symbols, or any other apparatus are rejected. Those requests need structural interpretation by the normal engine.

### Generic valueless contour bundle

The contour route accepts only a generic/schematic contour bundle with:

- an exact line count from 2 through 12;
- `nested` plus explicitly closed curves, or `parallel` plus explicitly open curves;
- explicit wording that the lines have no values/levels.

```js
{ type: "motif", motif: "contour_bundle", options: { count: 5, variant: "nested" } }
```

Examples:

- `값 없이 중첩된 닫힌 개략 등치선 묶음 5개만 그려 줘`
- `수치 없이 평행한 열린 일반 등치선 묶음 6개만 그려 줘`

Real maps or terrain, named regions, mountains/basins, geology, faults, pressure/weather/temperature, fill or shading, dashed/intersecting lines, missing values policy, missing count, missing variant, or inconsistent open/closed wording reject the local path.

For all four scaffold families above, a positive request for text, numbers, symbols, labels, leaders, or arrows is rejected. An unambiguous exclusion such as `문자 숫자 화살표는 넣지 마` is allowed. Mixed polarity such as `문자 없이 숫자는 넣어 줘` is rejected.

### Fixture-locked simple series circuit

The circuit route is not a general circuit parser. It requires one explicitly closed rectangular/closed-wiring-loop series topology and all four singleton components in their fixed positions:

| Position | Required component |
|---|---|
| left | one DC source |
| top | one switch whose state is explicitly `open` or `closed` |
| right | one resistor |
| bottom | one lamp/bulb |

The only emitted option is the stated switch state:

```js
{ type: "motif", motif: "simple_series_circuit", options: { switchState: "open" } }
```

Both Korean and English exact forms are accepted, for example:

- `단일 직렬 회로를 닫힌 사각 배선 루프로 구성하고 왼쪽 직류 전원 한 개, 위쪽 열린 스위치 한 개, 오른쪽 저항 한 개, 아래쪽 전구 한 개만 놓아 줘`
- `one closed rectangular series circuit with exactly one dc source on the left, one open switch on the top, one resistor on the right, and one lamp on the bottom, no labels or arrows`

An absent or conflicting switch state, a missing closed-loop statement, a component count or position change, branches, parallel paths, meters, extra electrical components, component values, a second scene, or positive annotations reject the route. Values are never inferred from familiar circuit symbols.

### Fixture-locked fixed pulley, spring, and loads

This route requires all of the following explicit relationships:

- exactly one ceiling-fixed pulley;
- exactly one continuous rope;
- one blank rectangular load directly on the left branch;
- exactly one spring on the right branch, followed below by one blank rectangular load;
- the two blank loads are explicitly the same shape.

It emits the fixed no-option fixture:

```js
{ type: "motif", motif: "fixed_pulley_spring_loads", options: {} }
```

`같은 모양` / `same shape` means matching drawn appearance only. The matcher deliberately rejects `같은 질량`, `같은 무게`, `equal mass`, and `equal weight`; it never turns visual equality into a physics claim. Missing rope continuity, a missing same-shape relation, additional pulleys or springs, moving/compound pulleys, an incline, a hand/person, force or tension details, labels, and mixed apparatus all reject the local route. Spring turn count and radius are not inferred or emitted.

### Fixture-locked lens, mirror, and screen bench

The only supported optical bench has exactly:

- one convex lens on the left;
- one plane mirror in the center, explicitly at 45 degrees;
- one screen on the right.

```js
{
  type: "motif",
  motif: "lens_mirror_screen_bench",
  options: { lensKind: "convex_lens", mirrorRotation: 45 },
}
```

Another lens kind, another angle, missing or repeated components, changed ordering, any additional numeric value, rays, an object or object arrow, source, axis, distance, focal length, image construction, labels, or a second apparatus reject the route. A clear exclusion such as `no rays labels or arrows` is permitted; it adds nothing to the fixture.

### Fixture-locked vessel and particle comparison

This route is intentionally one immutable scientific comparison. A request must explicitly identify one beaker and one particle box side by side and state every locked field:

```js
{
  type: "motif",
  motif: "vessel_particle_comparison",
  options: {
    vesselKind: "beaker",
    liquid: 0.45,
    particleState: "gas",
    particleCount: 16,
    particleShape: "circle",
    mix: false,
  },
}
```

Accepted value wording includes `0.45` or an explicit equivalent `45%`; no other numeric detail is allowed. All of gas state, 16 particles, circular shape, and unmixed state must be stated. A missing field, a different value/state/shape/container, mixed or moving particles, multiple vessels/boxes, annotations, or another apparatus rejects the route. The matcher does not infer particle state from spacing or infer a count from the picture.

### Fixture-locked generic logistic population graph

The logistic route requires explicit evidence for all of these properties: logistic, S-shaped, population, generic/schematic, exactly one curve, and unlabeled. It emits:

```js
{ type: "motif", motif: "logistic_population_graph", options: {} }
```

Examples include `일반적인 무라벨 단일 곡선으로 개체군 로지스틱 S자 성장 곡선만 그려 줘` and `one generic unlabeled logistic S-shaped population curve without labels text numbers`.

Any numeric value, range, tick, grid, carrying-capacity line, asymptote request, multiple/additional curves or series, named species or biological context, labels, arrows, or second apparatus rejects the local route. The matcher does not fit data, choose an axis range, or claim a carrying-capacity value.

### Verified physical coastline map

The request must explicitly name exactly one variant, explicitly say that a physical coastline is wanted, and explicitly use map/outline intent.

| Request variant | Motif option |
|---|---|
| world / 세계 | `world` |
| Pacific / 태평양 | `pacific` |
| East Asia / 동아시아 | `east_asia` |
| Korean Peninsula / 한반도 | `korean_peninsula` |

The result is always:

```js
{
  type: "motif",
  motif: "verified_map_outline",
  options: { variant, fillLand: false },
}
```

Examples that match:

- `세계 전체의 물리 해안선 지도만 검은 선으로 그려 줘`
- `동아시아 해안선 지도 윤곽만 만들어 줘`
- `Korean Peninsula physical coastline map outline`

The following make the request non-local and are rejected even if phrased as an exclusion: political or administrative boundaries, place names, labels, geological maps, weather maps, isobars, contours, routes, tracks, markers, earthquake or volcano locations, tectonic boundaries, currents, arrows, land shading/fill, multiple maps, or any second scene object. These overlays remain separate 5E editing work.

`한반도 지도` is not enough: without explicit physical-coastline intent, the requested kind of map is ambiguous.

### Three seated students in dialogue

The request must explicitly contain all four facts:

1. the people are students;
2. there are exactly three;
3. they are seated at one shared desk/table;
4. they are talking, conversing, or discussing.

The default result has a rectangular table and no speech bubbles:

```js
{
  type: "motif",
  motif: "student_trio_seated_dialogue",
  options: { tableShape: "rect", speechBubbles: "none" },
}
```

An explicitly round table selects `tableShape:"round"`. A positive, explicit request for speech bubbles selects:

```js
{
  tableShape: "rect",
  speechBubbles: "three_blank",
  speechBubbleEvidence: "request",
}
```

The bubbles are always blank. Bubble text, a bubble count other than three, the wrong number of students, individual/multiple desks, standing poses, teachers, boards, chairs, classroom backgrounds, books, computers, laboratory apparatus, maps, spacecraft, graphs, robots, animals, plants, or requested facial expressions all reject the local match.

### Simple flat spacecraft shell

The request must explicitly describe the target as all of:

- simple/minimal;
- flat/2D;
- a spacecraft shell, hull, outline, or exterior.

With no optional part named, the request is exactly:

```js
{
  type: "motif",
  motif: "spacecraft_flat_shell",
  options: {},
}
```

Only options explicitly present in the current request are emitted:

| Explicit wording | Emitted option |
|---|---|
| compact / long shell | `proportions:"compact"` / `"long"` |
| left-facing / right-facing | `facing:"left"` / `"right"` |
| a window / single window / wide window | `window:"single"` / `"wide"` |
| seated occupant | `occupant:"seated"` |
| point source | `device:"point_source"` |
| detector | `device:"detector_box"` |
| plane mirror | `device:"plane_mirror"` |
| device at rear/center/front | `deviceSlot:"rear"` / `"center"` / `"front"` |

Runtime compatibility is checked before matching: an occupant or device requires an explicit window; an occupant plus a device requires an explicit wide window; and the rear device slot is unavailable when an occupant is present.

Complex or realistic renderings, rockets/launch vehicles, 3D, thrusters, engines, exhaust, wings, fins, antennas, solar panels, landing gear, background bodies/scenery, trajectories, unsupported apparatus, multiple spacecraft, multiple windows, multiple occupants, multiple devices, and contradictory options are rejected.

The phrase `평면 거울` does not by itself satisfy the flat-shell requirement. The matcher removes that device phrase before checking whether the spacecraft itself was explicitly described as flat or 2D.

## Failure policy

The matcher never tries to repair an incomplete request and never invents an option. For example:

- `한반도 지도` does not infer physical coastlines;
- `학생들이 대화` does not infer a count, seated pose, or table;
- `우주선` does not infer a flat shell;
- `우주선에 탑승자` does not infer that the occupant is seated or that a window exists;
- `비커 3개 패널` does not infer that the vessels are empty or connected;
- `이중 y축 그래프` does not infer an x axis, blank series, or tick count;
- `직교 배선` does not infer node count, shape, closure, or components;
- `등치선 5개` does not infer a generic map-free intent or nested/parallel topology;
- `직렬 회로` does not infer the four fixed component positions or switch state;
- `도르래와 용수철` does not infer one continuous rope or matching load shapes;
- `볼록 렌즈와 거울` does not infer a 45-degree mirror or a right-side screen;
- `비커와 입자 상자` does not infer liquid fraction, particle state/count/shape, or mixing state;
- `로지스틱 곡선` does not infer a generic, single, unlabeled S curve;
- `창 두 개` is not collapsed to the one-window asset;
- `말풍선 하나` is not expanded to three bubbles.

On every such miss, the existing fast-scene or raster path remains responsible for the request.

## Verification

The dedicated test contains positive contract checks plus false-positive suites for counts, negation, mixed scenes, map overlays, unsupported props, conflicting options, and compiler compatibility:

```powershell
node --test tests/test-ai-local-asset-router.mjs
```

The 2026-08-09 warmed v3 synthetic matcher benchmark used 26 requests: one exact hit and one representative miss for each of the 13 local families. Across seven samples of 100,000 calls, the measured samples were 889.690, 884.003, 799.354, 797.318, 916.723, 832.197, and 820.949 ms. The median was 832.197 ms: 0.008322 ms (8.322 µs) per call, or about 120,164 calls/s on the development machine. This number describes only phrase matching, not native asset compilation or insertion. The important latency property is that a successful match adds no network or model round trip.
