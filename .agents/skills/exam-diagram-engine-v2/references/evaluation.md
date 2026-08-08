# V2 evaluation protocol

Score every generated original. Score a normalized derivative separately and retain the parent link.

| Criterion | Max | Full-credit evidence |
|---|---:|---|
| core_structure | 25 | All required objects, counts, containment, contacts, topology, and state relations match |
| scientific_accuracy | 20 | No scientifically false or misleading geometry/state; invariants hold |
| proportion_layout | 15 | Relative size, position, panel order, crop, occupancy, and empty regions match |
| kice_lineart | 15 | Clean black 2D assessment linework on white; appropriate line hierarchy |
| restrained_gray | 10 | Only declared physical regions use uniform flat gray; no decorative tone |
| no_forbidden_marks | 10 | Zero text, digits, symbols, labels, leaders, or arrows |
| editability | 5 | Clear margins, separable shapes, no clutter, suitable for 5E post-editing |

Pass only when total is at least 85 and every hard gate passes:

- `severe_science_error` is false;
- `forbidden_mark_count` is zero;
- no unlisted object exists;
- no critical structure/topology invariant is broken;
- every scientific category has a unique approved encoding.

Use failure tags from [failure-history.md](failure-history.md). Record observable evidence, not aesthetic preference. Automated palette/margin checks are supporting evidence only; human visual/scientific review owns object counts, topology, and scientific meaning.

## Dataset integrity

- Development cases may drive specification and prompt changes.
- Final cases are frozen before development evaluation and may be opened only after the engine version is frozen.
- Never revise the engine from final-case failures. Report them and defer changes to the next version.
- After every development correction, rerun all previously passing development cases or their preserved evaluation assertions.
- For 12 representative hard cases, generate three independent attempts and require at least two passes per case.

## Required evidence record

Store request, resolved structure spec, compiled prompt, original output, optional normalized output, evaluator scores, hard-gate findings, failure tags, correction note, engine version, generator/tool identity, and timestamps. Never overwrite a failed attempt.
