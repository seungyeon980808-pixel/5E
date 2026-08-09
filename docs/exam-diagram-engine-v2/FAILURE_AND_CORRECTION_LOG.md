# Engine V2 failure and correction log

## Development-only corrections

All prompt and specification changes below were made against the 36-case development split before the final freeze.

| Failure family | Observed symptom | Correction incorporated into V2 |
|---|---|---|
| Benchmark defect | Circuit bypass, separatory-funnel source, and synthetic sketch topology did not match their manifests | Rebuilt the affected development fixtures and added manifest/invariant checks |
| Relation rendered as an object | Optical alignment became a visible axis | Declared relations and invariants to be non-drawn geometry constraints |
| Symbol-like apparatus detail | Thermometer became a pointer or marked scale | Required a plain unmarked thermometer and prohibited ticks/pointers |
| Decorative Earth-science texture | Volcano slopes acquired extra strokes | Required empty-outline landforms and one-stroke strata boundaries |
| Open/closed topology loss | Receiver mouth was closed or contacted by an invented connector | Defined “open and separate” as a visible open mouth plus white gap |
| Sketch double-edge carryover | Edge-extracted rough strokes became duplicated frames, layers, or diaphragms | Added centerline-collapse rules except for physically thick walls/tubes |
| Recurrent model variance | Biology two-state diaphragm remained a double-line band | Preserved the failed attempts and tagged the unresolved variance instead of weakening the gate |

The latest development result is 35/36 passing (97.2%). The remaining failure is `v2-sketch-biology-03-lungs-two-states`.

## Frozen final failures

The final split, prompts, input assets, and specification hashes were frozen in `benchmarks/exam-diagram-engine-v2/FINAL_FREEZE.json`. The following failures were recorded without changing or retrying the frozen prompt.

| Case | Score | Hard-gate cause |
|---|---:|---|
| `v2-ref-physics-04-spring-two-states` | 87 | unequal coil count |
| `v2-ref-chemistry-05-electrolysis-vessel` | 73 | invalid electrode/battery topology; source fixture also conflicts with the manifest |
| `v2-txt-physics-04-spring-two-states` | 84 | unequal coil count |
| `v2-txt-physics-05-coil-compass` | 71 | broken circuit topology |
| `v2-txt-biology-05-chromosome-pairs` | 79 | one alleged homologous pair has mismatched morphology |
| `v2-sketch-physics-04-spring-two-states` | 83 | unequal coil count |
| `v2-sketch-physics-05-coil-compass` | 77 | disconnected repeated loops instead of one coil |
| `v2-sketch-chemistry-05-electrolysis-vessel` | 63 | wires terminate in air and an invented bridge joins electrodes |
| `v2-sketch-earth-04-eclipse-alignment` | 99 | invented enclosing frame |

These failures identify V2 limitations; they are not correction inputs for V2. A successor cycle must derive changes from new development cases and use a newly frozen, uncontaminated final set.

## V2.1 successor correction

V2.1 did not rewrite the stochastic prompt from the frozen failures. It introduced a general closed-inventory vector adapter and evaluated it on 20 new scenario families.

Development-only findings were:

| Finding | Correction before V2.1 final freeze |
|---|---|
| A pendulum string and lever load were declared connected but their coordinates left a visible gap | Moved endpoints to the shared support/contact coordinates |
| The ocean-water polygon produced an extra approximation outline distinct from the scientific seafloor curve | Made the water polygon fill-only and retained one explicit seafloor boundary |

After these changes, the 36-case development split passed 36/36. The renderer, core rules, final manifest, 24 final scene contracts, and 16 final input assets were then frozen. No final-result correction was made. The frozen final split passed 24/24, and the stability suite passed 36/36 regenerations.
