# Subject-specific guardrails

## Physics

- Treat circuits as graphs: terminal count, junction count, crossing versus connection, component order, and switch contact state precede component appearance.
- Keep each wire/string/ray-like physical object continuous from named start to named end. Never allow a wire to disappear behind a device without an explicit terminal.
- Reuse a master apparatus across state panels; vary only declared positions, switch contacts, needle angles, spring lengths, or source distances.
- Draw compass and meter needles as arrowhead-free rods. Omit N/S, polarity, current, force, motion, and ray arrows.
- Preserve pulley count, rope tangency, support points, surface contacts, slope sign, optical boundary, and source-screen geometry.
- In illustration-only optics, omit semantic rays unless the ray/wavefront itself is explicitly the scientific object requested.
- Alignment and optical-axis statements are geometric constraints only. Do not render an axis or guide line unless the closed object inventory explicitly lists it.

## Chemistry

- Preserve vessel kind, opening, neck, stopper, liquid surface, heating location, support order, and tube endpoints.
- Keep liquid fills inside vessel walls with one horizontal surface and uniform gray. Count physically separate liquid regions separately.
- Treat apparatus as a topology: source vessel, transfer path, receiver, vents, branches, and terminal targets.
- For particle models, record species count, count per species, bonding, adjacency, state panels, and unchanged particles. Use a declared shape/fill map; omit element and charge symbols.
- Do not add common labware, sensors, hotplates, reagents, wires, or safety stands not present in the source/description.
- Preserve process stages; do not invent intermediate steps or transition arrows.
- Render thermometers as plain unmarked capillaries ending in a bulb. Omit scale ticks, numerals, pointer shapes, and arrowheads unless marks mode explicitly requests them.

## Biology

- Describe anatomy by visible compartments, lumens, walls, branches, and connections before naming the organ.
- Preserve major surrounding context when needed for interpretation; do not replace a torso cutaway with a standalone organ icon.
- For tubular organs, keep both ends, lumen, wall layers, and folds; do not close them into a pouch.
- Cap repeated alveoli, villi, cells, chromosomes, fibers, or particles by region/slot. Do not convert them into texture.
- In comparisons, keep viewpoint, scale, and common anatomy fixed; vary only the declared biological state.
- Use exactly one stroke for each comparison-panel frame and each diaphragm boundary; edge-extraction doublets are not anatomical thickness.
- For organisms and hand-tool scenes, prioritize posture, gaze direction when relevant, and exact hand/foot/tool contact over realistic facial or surface detail.

## Earth science

- Preserve layer count, ordering, thickness relationships, unconformities, channels, faults, plate boundaries, vents, and contact coordinates.
- Define irregular boundaries with left/right endpoints, extrema, and contacts rather than generic names.
- Use exactly one stroke for each section frame and stratum boundary; never copy edge-extraction doublets as extra layers.
- Limit strata, cracks, clasts, vesicles, crystals, stars, or surface marks by explicit count/range; never reproduce all photographic texture.
- Use one boundary and one flat region for water; no reflection or lighting.
- Preserve sample count and the relation between a main cross-section and detached rock/mineral samples.
- Keep intentionally cropped globes or landscapes cropped. Avoid spherical 3D shading, atmospheric glow, starfield backgrounds, and decorative terrain.
- Draw a volcanic cone as an empty outline unless the closed inventory explicitly includes a conduit or chamber; never add decorative slope strokes.
