---
name: exam-diagram-engine-v2
description: Edit a supplied science reference image according to explicit user instructions while preserving every unmentioned object, relation, proportion, and layout feature, and convert the result to label-free Korean KICE-style line art. Use when Codex must perform reference-guided diagram revision, style cleanup as a zero-geometry-change edit, compile a closed-change prompt, validate instruction compliance and source preservation, or iteratively improve the edit specification from retained failures.
---

# Exam Diagram Engine V2

Produce a scientifically faithful, label-free edit rather than inventing a new illustration. V2.2 narrows the supported product surface to `reference image + edit instruction`. Style-only conversion is the same workflow with zero scientific geometry changes.

## Required workflow

1. Read [references/common-style.md](references/common-style.md), [references/instruction-edit.md](references/instruction-edit.md), and the relevant subject section in [references/subject-rules.md](references/subject-rules.md).
2. Inspect the exact source image and enumerate visible scientific objects, topology, contacts, counts, proportions, panels, crop edges, and intentional empty regions.
3. Parse the user instruction into atomic edit operations. Treat every property outside the explicit change set as locked.
4. Save an edit request conforming to [assets/edit-request.schema.json](assets/edit-request.schema.json).
5. Run `python scripts/edit_engine.py compile --request <request.json> --rules assets/edit-rules.v2.2.json --out-dir <case-dir>`.
6. Stop before generation if preflight reports an error or unresolved critical uncertainty.
7. Invoke the image editing adapter with the source as the edit target and the compiled prompt. Never regenerate from text alone. The deterministic vector renderer remains a downstream option only after a separately reviewed scene contract exists.
8. Save and score the generated original first. If and only if structure, topology, category assignment, and the requested edit pass, flatten gray through explicit physical-region masks. Never use tonal cleanup to excuse a structure or science failure.
9. Evaluate original and normalized outputs separately using [references/evaluation.md](references/evaluation.md). Record the first attempt even when it fails.
10. Revise one failure cause at a time using the causal retry templates in [references/instruction-edit.md](references/instruction-edit.md). Preserve the failed prompt, output, evaluation, correction reason, and successor link. Promote a rule only from repeated development failures, then rerun every preserved passing assertion.

## Non-negotiable gates

- Use a white background and black linework. Use only uniform flat gray in explicitly allowed physical regions.
- Generate zero text, digits, mathematical symbols, labels, captions, leader lines, arrowheads, or direction arrows in illustration-only mode.
- Preserve object identity, count, topology, contact, state differences, proportions, cropping, and intentional empty regions.
- Add zero unlisted scientific devices, supports, surfaces, particles, paths, or decorative context.
- Reject any result with a severe scientific error, any forbidden glyph/arrow, an unmapped category, or a score below 85.
- Leave clear margins and separable shapes for 5E post-editing.

## Change routing

- `style_cleanup`: remove annotations/color/texture and apply KICE line art; change zero scientific geometry.
- `move`, `resize`, `reorder`, `duplicate`, `delete`, `replace_state`, `connect`, `disconnect`: modify only the named targets and properties.
- Reject ambiguous targets, contradictory operations, edits that require an unlisted apparatus, and edits whose scientific result cannot be determined from the source plus instruction.
- Read [references/instruction-edit.md](references/instruction-edit.md) for operation-specific invariants and evaluation order.

## Commands

```powershell
python scripts/engine.py compile --request request.json --out-dir run/case-id
python scripts/engine.py inspect-image --image run/case-id/generated.png --out run/case-id/image-metrics.json
python scripts/engine.py score --evaluation run/case-id/evaluation.json --out run/case-id/score.json
python scripts/engine.py validate-benchmark --development benchmarks/development.json --final benchmarks/final.json
python scripts/engine.py summarize --evaluations results --out report.json
python scripts/edit_engine.py compile --request edit-request.json --rules assets/edit-rules.v2.2.json --out-dir run/case-id
python scripts/edit_engine.py summarize --results results/edit-v2.2/development --out results/edit-v2.2/development-summary.json
python scripts/vector_renderer.py validate --scene scene.json --out validation.json
python scripts/vector_renderer.py render --scene scene.json --out generated.png --report render.json
```

Read [references/interface.md](references/interface.md) for request/output contracts and [references/failure-history.md](references/failure-history.md) before revising a recurrent failure.
