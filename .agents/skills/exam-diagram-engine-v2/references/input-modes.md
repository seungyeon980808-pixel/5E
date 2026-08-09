# Input-mode analysis and prompt procedures

## Reference image

1. Inspect the exact crop; do not infer from filenames or surrounding page titles.
2. Record visible objects, counts, crop edges, bounding boxes, empty regions, overlap order, contacts, and edge topology.
3. Separate physical structure from text, arrows, leaders, captions, cards, and background context.
4. Determine whether color carries category information and define a monochrome mapping before generation.
5. For a critical object smaller than 8% of the long edge, provide the full image for composition and a detail crop for local shape; never transfer the crop scale to the final composition.
6. Prompt as a faithful transformation. Prohibit substitution by a familiar apparatus and prohibit filling removed-label space.

Prompt invariant: the reference image controls composition and visible structure. Written context may clarify identity but may not add unseen parts.

## Description only

1. Extract only explicit entities, quantities, states, spatial relations, connections, and scientifically necessary boundaries.
2. Build the minimum closed-world scene graph that satisfies the statement.
3. Mark optional cosmetic properties as omitted; do not choose them.
4. Add a scientific invariant for every connection or state that could be misread.
5. If two materially different apparatuses satisfy the description, stop with a critical uncertainty unless the problem meaning selects one uniquely.
6. Choose a simple front/section view and allocate empty label space without inventing labels.

Prompt invariant: scientific necessity does not authorize conventional accessories. Include only objects in the approved graph.

## Sketch plus description

1. Inspect the sketch and record panels, rough bounding boxes, orientation, ordering, contacts, and cropped edges.
2. Parse the description independently into objects, connections, states, and scientific invariants.
3. Create a conflict table: `sketch says`, `description says`, `resolution`, `reason`.
4. Preserve sketch geometry when compatible. Use the description to correct impossible topology, object identity, or state, and record each correction.
5. Do not beautify rough spacing into a new composition. Preserve intentional asymmetry and empty regions.
6. Prompt the model to replace rough strokes with clean line art while keeping the resolved structure graph and sketch layout.
7. Collapse close parallel traces created by edge extraction to one centerline, except where the inventory explicitly identifies a tube, wall, or other physically thick object.

Prompt invariant: the sketch is the authority for layout; the description is the authority for scientific meaning. Every override must be explicit in `conflict_resolutions`.

## Shared prompt compilation

Compile one prompt with these blocks:

1. `ROLE AND OUTPUT`: label-free Korean assessment line art.
2. `CLOSED OBJECT INVENTORY`: exact IDs, kinds, counts, and panels.
3. `TOPOLOGY AND CONTACTS`: every physical edge and non-edge constraint.
4. `LAYOUT`: normalized bounding boxes, order, cropping, margins, empty regions.
5. `SCIENTIFIC INVARIANTS`: states and must-not-misread facts.
6. `CATEGORY MAP`: one unique monochrome representation per category.
7. `STYLE`: white, black lines, named flat grays only.
8. `ZERO-TOLERANCE NEGATIVES`: forbidden content and zero unlisted objects.

Do not mix input analysis prose into the final image prompt. Compile only resolved facts.
