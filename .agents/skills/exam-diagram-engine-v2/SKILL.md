---
name: exam-diagram-engine-v2
description: Create and validate label-free Korean KICE-style science diagrams for physics, chemistry, biology, and Earth science from (1) a reference image, (2) a written problem description, or (3) a hand-drawn sketch plus description. Use when Codex must analyze scientific structure, compile a constrained image-generation prompt, generate or revise monochrome exam line art, score it with the V2 rubric, preserve failure/correction history, or prepare an image for later editing in 5E.
---

# Exam Diagram Engine V2

Produce a scientifically faithful, label-free diagram rather than an attractive illustration.

## Required workflow

1. Classify `input_mode` as `reference_image`, `description_only`, or `sketch_plus_description`.
2. Read [references/common-style.md](references/common-style.md), [references/input-modes.md](references/input-modes.md), and the relevant subject section in [references/subject-rules.md](references/subject-rules.md).
3. Analyze the input into the structure contract before writing an image prompt. Never infer an omitted apparatus merely because it is common in that experiment.
4. Save a request JSON that conforms to [assets/request.schema.json](assets/request.schema.json).
5. Run `python scripts/engine.py compile --request <request.json> --out-dir <case-dir>`.
6. Stop before generation if preflight reports an error or unresolved critical uncertainty.
7. Generate with the built-in image generation tool. For reference conversion or sketch interpretation, inspect every local input image first and pass it as an edit/reference input. Keep the compiled prompt unchanged except for tool-required wrapper text.
8. Save the generated original, then run the repository normalizer if flat grayscale cleanup is needed. Never use normalization to excuse a structure or science failure.
9. Evaluate original and normalized outputs separately using [references/evaluation.md](references/evaluation.md). Record the first attempt even when it fails.
10. Revise one failure cause at a time. Preserve the failed prompt, output, evaluation, correction reason, and successor link.

## Non-negotiable gates

- Use a white background and black linework. Use only uniform flat gray in explicitly allowed physical regions.
- Generate zero text, digits, mathematical symbols, labels, captions, leader lines, arrowheads, or direction arrows in illustration-only mode.
- Preserve object identity, count, topology, contact, state differences, proportions, cropping, and intentional empty regions.
- Add zero unlisted scientific devices, supports, surfaces, particles, paths, or decorative context.
- Reject any result with a severe scientific error, any forbidden glyph/arrow, an unmapped category, or a score below 85.
- Leave clear margins and separable shapes for 5E post-editing.

## Input routing

- For a reference image, make that image the sole authority for composition and visible structure; use text only to disambiguate scientific meaning.
- For description only, derive a minimal closed-world scene graph from explicit facts and expose unresolved ambiguities instead of inventing details.
- For a sketch plus description, take geometry and layout from the sketch, scientific identity and constraints from the description, and resolve conflicts explicitly in favor of scientific correctness without silently redesigning the layout.

## Commands

```powershell
python scripts/engine.py compile --request request.json --out-dir run/case-id
python scripts/engine.py inspect-image --image run/case-id/generated.png --out run/case-id/image-metrics.json
python scripts/engine.py score --evaluation run/case-id/evaluation.json --out run/case-id/score.json
python scripts/engine.py validate-benchmark --development benchmarks/development.json --final benchmarks/final.json
python scripts/engine.py summarize --evaluations results --out report.json
```

Read [references/interface.md](references/interface.md) for request/output contracts and [references/failure-history.md](references/failure-history.md) before revising a recurrent failure.
