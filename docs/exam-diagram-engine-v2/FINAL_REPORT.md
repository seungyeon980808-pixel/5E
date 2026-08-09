# Exam Diagram Engine V2 final report

## Release outcome

`NOT COMPLETE — the end-to-end raw-input engine has not satisfied the requested completion gates.`

The original stochastic V2.0 adapter remains the only frozen evidence covering raw reference/text/sketch generation and scored 15/24 (62.5%). V2.1 proves that a correct, pre-authored scene JSON can be rendered deterministically; it does not prove that raw pixels or prose are converted into that correct scene. Its 24/24 result is renderer validation only and must not be reported as complete engine accuracy.

## V2.1 renderer-only results

| Dimension | Passed | Total | Rate | Required |
|---|---:|---:|---:|---:|
| Overall | 24 | 24 | 100% | 85% |
| Reference image | 8 | 8 | 100% | 80% |
| Description only | 8 | 8 | 100% | 80% |
| Sketch + description | 8 | 8 | 100% | 80% |
| Physics | 6 | 6 | 100% | 80% |
| Chemistry | 6 | 6 | 100% | 80% |
| Biology | 6 | 6 | 100% | 80% |
| Earth science | 6 | 6 | 100% | 80% |

- Severe scientific errors: 0.
- Passing outputs containing text, digits, symbols, labels, leader lines, or arrows: 0.
- Unlisted-object hard-gate failures: 0.
- Representative hard cases: 12/12 passed all three regenerations; all three PNGs were byte-identical per case.

The final manifest hash is `26c5c626c420dbe8c2e44fe5ceeb8358549ed0fb8723dce98a769ba981d58a50`. The freeze record pins 46 renderer, specification, manifest, scene-contract, and input-asset files. Post-run verification found zero mismatches.

## Architecture

The package now uses two explicit adapters:

1. `deterministic_vector`: preferred for apparatus, exact repeated counts, sparse topology, panels, particles, and clean anatomical/geological outlines. The JSON scene contract contains a closed instance inventory and declared connections. Only lines, polylines, polygons, rectangles, ellipses, arcs, and Bézier paths exist.
2. `built_in_image_generation`: retained for organic structures that cannot be represented faithfully by the vector grammar. Its output must still pass the same hard gates and cannot use normalization to repair science or topology.

The vector adapter structurally has no text, glyph, gradient, lighting, shadow, or arrow primitive. Every drawable primitive must be assigned exactly once to a declared scientific instance, and connections may refer only to declared instances.

## Benchmark protocol

- V2.1 uses 20 new scenario families that do not reuse the original frozen-final families.
- Development contains 36 cases; final contains 24.
- Combined balance is exactly 20 cases per input mode and 15 per subject.
- Only development results were used to correct contact and region-encoding defects.
- The final manifest, all final scene contracts, all final reference/sketch inputs, renderer, schema, and core specifications were hashed before final rendering.
- Eight unique frozen-final scientific outputs were manually inspected after generation; each represents three input-mode cases.

## Regression and reproducibility

- Original V2 result files are byte-unchanged relative to commit `23ff05f9b625a6872732ab0eb12e3c2edacb207b`.
- Legacy and vector unit tests: 8/8 passed.
- Skill package validation: passed.
- A copied Skill directory, without repository code outside the package, validated and rendered the example scene to PNG hash `c00ed07d9954d02bde522bb364f083daf4019fc0e1e189ec2d9e997809be91a5`.
- UI, desktop packaging, and 5E interface implementation were not modified.

## Evidence map

- Freeze and balance: `benchmarks/exam-diagram-engine-v2-1/FINAL_FREEZE.json`, `LOCK.json`.
- Development/final summaries: `results/exam-diagram-engine-v2-1/development-summary.json`, `final-summary.json`.
- Manual science audit: `results/exam-diagram-engine-v2-1/final-manual-visual-audit.json`.
- Stability: `results/exam-diagram-engine-v2-1/stability-summary.json`.
- Historical failures and corrections: `docs/exam-diagram-engine-v2/FAILURE_AND_CORRECTION_LOG.md`.

## Scope note

The benchmark proves only scene-contract rendering. Raw-input analysis and reference-guided edit accuracy remain under development. V2.2 narrows the next validation target to `reference image + explicit edit instruction`; no 5E production integration should use it until a new blind benchmark passes.
