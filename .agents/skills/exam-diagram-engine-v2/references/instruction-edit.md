# Reference-guided instruction editing

## Authority order

1. The source image owns all visible scientific content and the initial layout.
2. The explicit user instruction owns only the named changes.
3. The common style specification owns rendering cleanup.
4. Subject rules reject scientifically impossible results; they do not authorize adding conventional apparatus.

Treat the source as immutable outside the change mask. A style-only conversion has an empty scientific change mask.

## Analysis contract

Before prompt compilation, record:

- exact visible object instances and counts;
- connection endpoints, branches, junctions, crossings, contacts, containment, and separation;
- normalized bounding boxes, panel order, crop edges, overlap order, and empty regions;
- source annotations to remove separately from scientific strokes;
- atomic edit operations with named targets and changed properties;
- locked invariants covering every unedited object and relation;
- expected post-edit assertions that can be checked visually.

If a target cannot be identified uniquely, stop. Do not resolve `the container` when multiple containers exist.

## Atomic operations

- `style_cleanup`: change line/fill treatment only. Preserve geometry, count, topology, crop, and occupancy.
- `move`: change only target position. Preserve size, shape, orientation, internals, and all connections unless rerouting is explicit.
- `resize`: change only target dimensions. Preserve center or named anchor, aspect ratio unless explicitly changed, internals, and relations.
- `reorder`: change named panel/object order while preserving each instance geometry and state.
- `duplicate`: add the stated number of copies of the named source instance. Copies inherit only declared properties and receive explicit positions.
- `delete`: remove only named instances and their explicitly listed incident relations; preserve the vacated space unless reflow is requested.
- `replace_state`: change only the stated state variable; reuse the same master geometry.
- `connect` or `disconnect`: change only declared endpoints. Preserve every other edge and crossing/junction semantic.

Split instructions with multiple independent changes into staged edits unless the final relation depends on applying them together.

## Prompt invariant

Compile in this order: source authority, closed inventory, requested changes, locked invariants, expected assertions, style cleanup, zero-tolerance negatives. Repeat `change only the requested properties` at the beginning and end. Never ask the model to “improve,” “redesign,” or “make scientifically complete.”

## Evaluation order

1. Confirm every requested change occurred.
2. Compare all locked objects and relations with the source.
3. Check subject-specific scientific invariants.
4. Check layout/proportion drift.
5. Check line-art style, gray restraint, forbidden marks, and 5E editability.

A visually attractive result fails if it changes one locked property. Record `EDIT_NOT_APPLIED`, `EDIT_OVERREACH`, or the existing structural failure tag.

## Specification learning loop

- Keep every development attempt, including failures.
- Correct one causal class per successor attempt.
- Promote a shared rule only after the same observable failure occurs in at least two independent development cases or three attempts of one stability case.
- Store the evidence case IDs and prompt diff with each promoted rule.
- After promotion, rerun all previously passing development assertions.
- Never use a frozen final result to change the same version's rules.

## Flat-gray safeguard

Three consecutive development attempts on `v22-dev-chemistry-distillation-move-receiver` produced gradients despite an explicit constant-fill constraint. Treat this as model variance, not a reason to keep lengthening the prompt.

- Preserve the original attempt as failed when gray is not flat.
- Permit palette flattening only with explicit masks for every allowed physical region.
- Reject global thresholding when it removes a liquid, material, organ, or layer distinction.
- Score the normalized derivative separately; post-processing cannot repair source drift, topology, or scientific geometry.
