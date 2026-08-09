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
- `MASK_REQUIRED`: flat-gray cleanup requires a declared physical-region mask; global normalization would erase or merge scientific regions.

## V2.2 reference-edit evidence

- Circuit style cleanup preserved topology and removed annotations on the first attempt.
- Moving one circuit component while locking all other components preserved the series topology on the first attempt.
- Moving a chemistry receiver and extending its tube succeeded at the requested relation but changed receiver proportions and produced gradients in three consecutive attempts.
- Global palette normalization reduced the gradient but erased the liquid-region encoding. V2.2 therefore requires region-aware masks for such cleanup and keeps the original edit failed.

## V2.2 development benchmark revision 3

- Initial independent audit: 13/36 passed (36.1%). Failures included 19 `OVER_SHADE`, four `STRUCTURE_LOSS`, four `EDIT_OVERREACH`, four `SOURCE_DRIFT`, three `CATEGORY_ENCODING`, two `RATIO_LAYOUT`, one `EDIT_NOT_APPLIED`, and one `TOPOLOGY_LOSS`.
- Explicit masks corrected 13 outputs whose structure and category assignment already passed. No mask was applied to a missing or wrongly assigned region.
- A second causal retry repaired eight cases: three missing-liquid cases, one tube-terminal failure, one rigid panel move, one mantle-category assignment, and two fault-relative-geometry failures.
- The incline-block case required a third attempt because `on the incline` was too vague. Naming `the upright block's lower-right corner directly touches the incline surface` restored the physical contact.
- Raw retry artifacts that retained gradients remain failed as `OVER_SHADE`; separately stored mask derivatives pass.
- After these revisions, the development set reached 36/36 while all prior passing cases remained passing. This is development evidence only and must not be reported as final accuracy.

## V2.2 rules revision 4

- Existing development evidence was consolidated into three cross-family safeguards without using frozen-final outputs as prompt-training examples.
- `move` now treats the edit mask as a strict locality fence and limits connector redraw to the named segment. This generalizes the incline, lens, lung-panel, and fault drift corrections.
- `delete` now removes every incident segment through its first preserved endpoint or junction and rejects dangling stubs. This generalizes the gas-over-water terminal-loss evidence.
- `style_cleanup` now preserves filled/unfilled and black/gray/white category distinctions before color removal. This generalizes the distillation and subduction category failures.
- `CATEGORY_COLLAPSE` and `TEXT_RESIDUE`, already documented stable tags, are now accepted by the executable evaluator.

## Three-run stability audit and rules revision 5

- Twelve difficult development cases were generated three times from identical revision-4 prompts. Only 2/12 were raw-stable and 8/12 were structure-stable before flat-gray normalization.
- Four repeated structural failures were preserved: incline contact/orientation failed 3/3, a small source object beside an annotation disappeared 3/3, receiver liquid disappeared 2/3, and a switch blade was replaced by a different mark 3/3.
- Revision 5 adds a closed-inventory before/after census, rigid movement of named container contents, and exact source-master reuse for hinged state changes.
- Targeted retries must name the exact contact corner, the annotation-adjacent inventory object, every carried liquid region, or the retained pivot/blade. These retries remain development evidence and do not alter the consumed frozen-final results.

## Stability revision 5 results and revision 6

- The annotation-adjacent triangular source improved from 0/3 to 3/3 structure passes, and receiver-liquid preservation improved from 1/3 to 3/3.
- The incline block still failed 3/3: two runs placed it on the horizontal base and one rotated it with the incline. Revision 6 therefore permits one normalized target bounding box plus an exact corner-to-surface contact after repeated qualitative-position failure.
- The switch fixture is a `BENCHMARK_DEFECT`: the source blade is shorter than the distance from its pivot to the opposite contact, so rotation without resizing cannot satisfy the frozen operation. It is excluded from the representative stability denominator and replaced; its failed prompts and outputs remain preserved.
- The incline-block fixture is also a `BENCHMARK_DEFECT`: pixel inspection shows the source block lies inside the triangular ramp and does not contact the inclined boundary, contradicting the named source relation. Three verbose and three concise retries could not preserve a contact absent from the source. It is excluded and replaced by the valid hanging-mass edit from the same apparatus; all failed evidence remains preserved.

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
