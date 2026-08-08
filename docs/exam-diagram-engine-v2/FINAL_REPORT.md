# Exam Diagram Engine V2 final report

## Release outcome

`PASS — Engine V2.1 within the V2 package satisfies every requested completion gate for the frozen benchmark.`

The original stochastic V2.0 adapter remains preserved as a failed baseline (15/24, 62.5%). V2.1 adds a deterministic vector scene adapter for diagrams that can be represented without semantic loss by geometric primitives. The image-generation adapter remains available for genuinely organic reference material, but its historical V2.0 score is not substituted for the V2.1 release evidence.

## Frozen-final results

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

The benchmark proves the complete Codex analysis-contract-render-evaluate procedure for the curated input modes. The deterministic renderer does not automatically understand raw pixels or prose by itself; Codex performs the documented analysis and writes the reviewed scene contract. This is the intended Skill interface and is why scene preflight remains mandatory.
