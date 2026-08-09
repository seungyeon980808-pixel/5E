# Engine V2 core apparatus motifs

`5e-motif-catalog@5` provides five deterministic, diagram-only assemblies for repeated structures that the
existing `ai-scene-fastpath.js` can already render safely. They are high-level layout locks, not new scientific
inventories: every motif expands to ordinary editable 5E objects and emits no text, number, label, leader or
arrowhead.

## Evidence and claim boundary

The 936-row hand-analyzed atlas and the nine-case repeatability suite were used independently. Atlas counts below
are evidence that the component family recurs; they are **not** full motif matches unless explicitly stated.

| Motif | Atlas evidence | Repeatability evidence | Exact claim |
|---|---|---|---|
| `simple_series_circuit` | 70 circuit panels; battery 50, resistor 45, switch 31, lamp 4; battery+resistor+switch in 16 panels | `physics-series-circuit` | The exact four-part battery/switch/resistor/lamp combination occurs in the synthetic fixture, not as one atlas token combination. |
| `fixed_pulley_spring_loads` | block 112, hanging mass 42, spring 17; pulley+mass 19 panels, spring+block 15; one exact pulley+spring candidate (`p1_2027_06_10.png#(가)`) | `physics-pulley-spring` | One fixed pulley, two tangent rope branches, one spring and two matching-looking blank load shapes only; no equal-mass relation is asserted. |
| `lens_mirror_screen_bench` | lens 6, mirror 1, screen 7; optical rail 3 panels; no atlas panel combines all three parts | `earth-observatory-optics` | Narrow synthetic three-part fixture; it is not evidence for arbitrary optical systems. |
| `vessel_particle_comparison` | vessel 211, liquid zone 77; three comparison candidates | `chemistry-vessel-particles` | One explicit vessel beside one explicit particle box; no reaction or transfer semantics. |
| `logistic_population_graph` | 314 graph panels, axis 182, curve 169, population tag 17; two S-curve candidates (`b1_2026_06_12.png#상`, `b2_2026_11_06.png#1`) | `biology-population-graph` | One generic monotone unlabeled logistic curve, not measured data. |

No `IMPLEMENTED_ALIASES` entry was added for these assemblies. Consequently they add **zero newly claimed atlas
blockers** and do not change the audited potential-coverage percentage. Their benefit is deterministic structure,
lower model variance and local compile speed; it must not be reported as a rubric pass rate.

## APIs

Each request must be the scene's sole motif element. Unknown fields fail closed.

```js
import { compileAiMotif } from "./js/ai-motif-catalog.js";

compileAiMotif("simple_series_circuit", {
  switchState: "open", // mandatory: open | closed
});

compileAiMotif("fixed_pulley_spring_loads", {
  springTurns: 12,
  springRadius: 2.4,
});

compileAiMotif("lens_mirror_screen_bench", {
  lensKind: "convex_lens", // mandatory; this is the only accepted fixture value
  mirrorRotation: 45,      // mandatory; this is the only accepted fixture value
});

compileAiMotif("vessel_particle_comparison", {
  vesselKind: "beaker",
  liquid: 0.45,
  particleState: "gas",
  particleCount: 16,
  particleShape: "circle",
  mix: false,
});

compileAiMotif("logistic_population_graph", {});
```

All five accept only an optional `{artboard:{w,h}}` in addition to the exact fields shown above, with minimum
dimensions enforced so components cannot silently overlap. The logistic motif has no adjustable data options: its
eleven visible points and 0..10 plotting ranges are fixture-locked. The vessel motif likewise accepts only the
explicit beaker / 0.45 liquid / 16 gas circles / non-mixed combination shown above.

## Locked invariants

- Series circuit: exactly one dc source, one explicit-state switch, one resistor and one lamp; four connecting
  polylines form one connected degree-2 network. There are no branches or terminal nodes.
- Pulley/spring: the rope curve terminates at the two pulley tangencies; the left tangent ends at the left load;
  the right tangent contacts the spring, whose lower endpoint contacts the matching-looking right load. The rope
  endpoints and crown are checked against the same `pulleyGeom`/`pulleyAnchors` functions used by the renderer, so
  the former T-shaped or off-rim rope failures cannot pass. Matching shape does not assert equal mass.
- Optical bench: exactly three semantic `optics` objects in the order lens, plane mirror, screen. No generic line
  substitutes, concave-lens variant, mirror angle other than 45 degrees, optical rays, axis arrows, object arrows or
  inferred focal construction are accepted.
- Vessel/particles: every state field is mandatory. The particle seed is fixed, motion is always `none`, and no
  piston, stopcock, ticks, reaction arrow or transfer connector is added.
- Logistic graph: one fixed eleven-point smooth series only; x and y are strictly increasing, middle growth is
  steeper than both tails, and axes have no numbers, labels, arrows or grid. Custom midpoint, steepness, ranges or
  series are rejected.

Map motifs still use `compileVerifiedMap`; seated-student and spacecraft motifs still use
`compileIllustrationAsset`. The new dispatch branches do not change those direct compilers.

## Focused verification and benchmark

```powershell
node --test tests/test-ai-core-apparatus-motifs.mjs
node scripts/engine-v2/benchmark-core-apparatus-motifs.mjs 10000
```

On the 2026-08-09 development machine, 10,000 create+compile iterations completed with the following measured
assembly times. The overall 0.0944 ms/scene includes invariant checks and MCP normalization performed by the
benchmark itself.

| Motif | Scenes | Native objects | create+compile ms/scene |
|---|---:|---:|---:|
| `simple_series_circuit` | 2,000 | 16,000 | 0.0408 |
| `fixed_pulley_spring_loads` | 2,000 | 14,000 | 0.0373 |
| `lens_mirror_screen_bench` | 2,000 | 6,000 | 0.0178 |
| `vessel_particle_comparison` | 2,000 | 4,000 | 0.0166 |
| `logistic_population_graph` | 2,000 | 8,000 | 0.0269 |

Result: 0 diagram-policy violations and 0 MCP normalization errors. These timings exclude Luna planning and raster
generation; they describe only deterministic local assembly.
