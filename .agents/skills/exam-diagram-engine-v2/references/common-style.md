# Common style specification

This specification consolidates the verified Session 1 rules. The current V2 rubric and 85-point threshold supersede the historical 95-point research threshold; historical scores remain evidence only.

## Visual contract

- Canvas: pure white, no page furniture or panel captions.
- Linework: black; main silhouettes slightly heavier than internal structure lines; clean joins; no comic contour.
- Fill: white by default. Permit one or two uniform gray values only for named physical regions such as liquid, a cut surface, a materially distinct layer, or a necessary organ region.
- Projection: orthographic, section, elevation, or restrained oblique view. Avoid perspective unless it is structurally required by the source.
- Surface: no lighting, highlight, reflection, cast shadow, gradient, bloom, stippling, decorative hatching, or photographic texture.
- Detail: preserve every problem-relevant part and cap all nonessential repeated detail at the source count or an explicit budget.

## Closed-world structure contract

Treat the approved object list as closed. Preserve:

- object kind and count;
- parent/containment relation;
- edge start, edge end, branch count, terminal count, and crossing-vs-junction semantics;
- physical contacts and support relations;
- panel count, order, shared master geometry, and state-variable differences;
- relative bounding boxes, occupancy, crop edges, overlap order, and intentional empty regions;
- category encodings after color removal.

Do not replace an apparatus with a conceptually similar apparatus. Do not complete a cropped object. Do not enlarge an object into space vacated by removed labels.

Relational negatives must appear as visible topology. In particular, “open and separate” means an open mouth with a white gap and forbids a stopper, cap, touching delivery tube, or tube entry.

## Forbidden content

Generate zero text, letters, Korean characters, digits, units, mathematical marks, chemical symbols, panel markers, labels, captions, watermarks, QR codes, empty annotation boxes, leader lines, guide lines, arrowheads, or semantic direction lines. Physical wires, tubes, strings, boundaries, and wavefronts explicitly listed in the structure contract are not semantic arrows.

## Gray and category encoding

Use category encodings in this order: filled versus unfilled shape, distinct outline shape, then white versus one flat gray. Never collapse distinct source categories into the same mark. Do not use stipple or crosshatch as a general category channel. If more categories exist than the declared monochrome mapping can represent safely, fail preflight or require an explicit line-style/shape mapping.

## Layout and editability

- Keep every required object inside the canvas unless the source intentionally crops it.
- Reserve at least 6% clear margin on sides not intentionally cropped.
- Preserve label-removal areas as empty space.
- Prefer separable, high-contrast silhouettes and closed physical regions suitable for later 5E labels and marks.
- Do not flatten physically separate liquid regions or neighboring objects into one gray mass.

## Generation order

Write prompts in this order: closed object inventory, topology and contacts, layout and ratios, state variables, allowed fills, style, forbidden list. Style adjectives never precede structure.

## Correction policy

Keep the first attempt. Diagnose with one or more stable failure tags. Correct one causal class per revision. Use deterministic palette normalization only after structure and science pass; normalization cannot upgrade a failed original into a successful generation attempt.
