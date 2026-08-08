# Exam Diagram Engine V2 final report

## Outcome

Engine V2 is implemented as a reusable Codex Skill and has complete development and frozen-final artifacts, but it does **not** satisfy the release completion gates.

- Development: 35/36 passing, 97.2%.
- Frozen final: 15/24 passing, 62.5%.
- Passing outputs containing text, digits, symbols, labels, leader lines, or arrows: 0.
- Frozen-final severe science errors: 4.
- Therefore the package is a validated experimental V2, not an approved production engine.

## Frozen-final breakdown

| Dimension | Passed | Total | Rate | Required |
|---|---:|---:|---:|---:|
| Overall | 15 | 24 | 62.5% | 85% |
| Reference image | 6 | 8 | 75.0% | 80% |
| Description only | 5 | 8 | 62.5% | 80% |
| Sketch + description | 4 | 8 | 50.0% | 80% |
| Physics | 1 | 6 | 16.7% | 80% |
| Chemistry | 4 | 6 | 66.7% | 80% |
| Biology | 5 | 6 | 83.3% | 80% |
| Earth science | 5 | 6 | 83.3% | 80% |

The final manifest hash is `9b1aab440f3af36a7dfcf197f0cb345a25fac71cb4e3e04a96dfb863fece7db9`. The development manifest hash is `716da5cbca67e9ae8398c3a5267b4448e64ad083ac275d8760a7eff8fa5abc2d`.

## What was delivered

- Common style specification with strict label-free illustration mode.
- Separate analyzers and prompt construction rules for reference, description-only, and sketch-plus-description inputs.
- Physics, chemistry, biology, and Earth-science guardrails.
- Request/evaluation schemas, compiler, preflight, image inspection, scoring, benchmark validation, and summarization tools.
- Balanced 36-case development and 24-case final manifests: 20 cases per input mode and 15 per subject across both splits.
- Original prompts, failed outputs, evaluations, scores, image metrics, and correction history.
- Final-freeze hash record preventing post-hoc tuning.
- New-session usage documentation and a local compile example.

No 5E UI, desktop packaging, or 5E integration code was modified.

## Release decision

`FAIL — DO NOT PROMOTE V2 AS COMPLETION-GATE COMPLIANT.`

The dominant weaknesses are exact-count consistency across comparative panels, electrical topology, and suppression of sketch-derived incidental frames/double edges. The required 12-case, three-regeneration release stability gate is not claimed: running it cannot reverse the already-failed frozen-final release decision. A V2.1 effort should add new development cases for these failure families and validate against a new untouched final split.

## Verification evidence

- `python -m unittest tests/test_exam_diagram_engine_v2.py -v`: 4/4 passed.
- Skill package validator: passed.
- Benchmark validator: passed with 36 development and 24 final cases and exact balance constraints.
- All 24 frozen-final cases have a prompt, generated PNG, evaluation, score, and image-metrics record.
