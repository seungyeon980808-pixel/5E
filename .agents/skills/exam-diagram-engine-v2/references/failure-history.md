# Failure taxonomy and correction history rules

## Stable tags

- `STRUCTURE_LOSS`: object, count, compartment, or required state disappears.
- `SCIENCE_ERROR`: contact, connection, state, direction, or geometry becomes scientifically false.
- `TOPOLOGY_LOSS`: edge start/end, branch, terminal, loop, or crossing semantics change.
- `CATEGORY_ENCODING`: source categories collapse or an encoding is ambiguous.
- `RATIO_LAYOUT`: proportions, panels, ordering, crop, occupancy, or spacing drift.
- `OVER_SHADE`: gradient, glossy tone, shadow, or excess gray appears.
- `3DIFICATION`: flat assessment diagram becomes a realistic/perspective render.
- `EXTRA_TEXT_SYMBOL`: text, digits, symbols, arrows, leaders, or annotation residue appears.
- `EXTRA_CONTEXT`: an unlisted object, background element, or conventional apparatus is added.
- `EDIT_UNSUITABLE`: clutter, merged regions, weak margins, or baked annotation impedes 5E editing.
- `BENCHMARK_DEFECT`: a source fixture, case contract, split, or expected invariant is internally wrong; repair only development data and never silently repair a frozen final case.
- `CATEGORY_COLLAPSE`: distinct required regions or states became visually indistinguishable.
- `TEXT_RESIDUE`: a glyph-like tick, pointer, character, digit, or arrow survived illustration-only mode.
- `MODEL_VARIANCE`: the same explicit corrective constraint failed repeatedly; retain the failure instead of weakening evaluation.

## Session 1 evidence

- Closed, clearly connected apparatus and repeated-position scenes were the most stable.
- Failures clustered around high-cardinality particles, color-coded categories, sparse edge networks, anatomy, natural texture, and empty annotation boxes.
- Label removal often caused objects to expand into the cleared area or left empty boxes/leaders.
- Palette normalization removed color/gradient but never repaired topology or science.
- Historical strongest reference cases include connected distillation apparatus, repeated lamp positions, hand-tool-beaker contact, and two-state circuits.
- Historical failures include source-path-target topology collapse, color-band collapse, illumination geometry becoming a gray blob, and natural surfaces becoming texture.

## Correction record

For each revision, save:

```json
{
  "attempt": 2,
  "parent_attempt": 1,
  "failure_tags": ["TOPOLOGY_LOSS"],
  "observed_failure": "receiver branches merged after the transfer vessel",
  "single_change": "enumerate each branch edge and require three separate terminal targets",
  "prompt_diff": "...",
  "regression_cases_rerun": ["..."],
  "result": "pass|fail"
}
```

Do not delete rejected prompts or outputs. Do not rewrite the failure as a success after post-processing.
