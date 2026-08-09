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

The 36-case development baseline produced 19 `OVER_SHADE` failures across chemistry, biology, and earth science. Prompt-only constant-gray constraints remained unreliable after targeted retries.

- Preserve and score the raw generated image first.
- Reject missing regions, wrong categories, broken contacts, and source drift before tonal cleanup.
- Permit flattening only with explicit masks for every already-correct physical gray region.
- Reject global thresholding when it removes or merges a liquid, material, organ, or layer distinction.
- Score the mask derivative separately; post-processing cannot repair source drift, topology, category assignment, or scientific geometry.

Thirteen first-attempt outputs and eight structurally corrected retries were safely flattened only after independent review confirmed their category assignment and geometry. The failed parents remain part of the evidence history.

## Causal retry templates

- Contact failure: specify the exact touching corner and surface. Avoid vague phrases such as `place on the incline`.
- Endpoint failure: specify where the open terminal must lie, including containment such as `inside the shortened inverted jar`.
- Group-move failure: name the complete rigid group and lock every internal shape and relation.
- Category failure: name both the region that must become white and the only region allowed gray.

## Locality, category, and deletion safeguards

- Treat each normalized edit mask as a strict locality fence. Scientific ink outside the mask is locked, not merely advisory.
- For a moved endpoint with a connector, adjust only the named connector segment. Do not shift or redraw the connected organ, vessel, container, or surrounding path to make the edit look smoother.
- Before removing color, inventory every distinction encoded by filled versus unfilled and by black, gray, or white fills. Style cleanup must preserve the distinction even when the geometry is unchanged.
- When deleting a connected object, trace every incident edge to its first preserved endpoint or junction and remove the entire incident segment. A dangling line or V-shaped remnant is `TOPOLOGY_LOSS`.
- These safeguards are promoted from development evidence: rigid-move drift in the incline, lens, lung-panel, and fault cases; endpoint loss in the gas-over-water case; and category loss in distillation and subduction cases.
- Relative-offset failure: move the target outline and all internal boundaries together and quantify a visible offset relative to layer thickness.

Each retry corrects one causal class. Rewriting the whole scene prompt is prohibited because it obscures which rule caused the improvement.
