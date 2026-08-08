# Engine interface

## Request

Use a JSON object conforming to `assets/request.schema.json`. The request is an already analyzed, reviewable contract, not raw hidden reasoning.

Required top-level fields:

- `case_id`, `input_mode`, `subject`, `description`;
- `objects`, `connections`, `layout`, `scientific_invariants`;
- `allowed_gray_regions`, `category_encoding`, `forbidden`.

Mode-specific evidence:

- `reference_image`: `source_images` with at least one full-composition image.
- `description_only`: no source image is required; `ambiguities` must contain no unresolved critical item.
- `sketch_plus_description`: at least one sketch image and a `conflict_resolutions` array.

## Compile outputs

- `structure.json`: normalized, validated request contract.
- `prompt.txt`: exact generation prompt.
- `prompt.json`: prompt plus engine metadata and SHA-256 hashes.
- `preflight.json`: errors, warnings, and pass state.

## Image generation adapter

The Skill invokes the built-in image generation tool; the CLI intentionally does not embed credentials or a model SDK. A calling Codex session must inspect referenced local images before invoking the tool and save the returned image beside the compiled artifacts.

## Deterministic vector adapter (V2.1)

For apparatus, repeated counts, sparse topology, and other scenes that can be expressed as clean geometric primitives, prefer `assets/vector-scene.schema.json` and `scripts/vector_renderer.py`. The adapter supports only lines, polylines, polygons, rectangles, ellipses, arcs, and Bézier paths. It has no text, glyph, gradient, lighting, shadow, or arrow primitive.

Every primitive must belong to exactly one instance in the closed inventory. Connections may reference only declared instances. Validation precedes rendering:

```powershell
python scripts/vector_renderer.py validate --scene scene.json --out validation.json
python scripts/vector_renderer.py render --scene scene.json --out generated.png --report render.json
```

Use the image-generation adapter only when a reference contains organic structure that cannot be faithfully represented by the vector contract. Do not silently simplify a scientifically meaningful curve or texture merely to force it into vector primitives.

## 5E handoff

The engine returns a PNG and its sidecar contract. 5E can import the PNG as an image object; labels, symbols, and arrows are added later by the user. UI automation and desktop packaging are outside V2 scope.

## Versioning

Every artifact records `engine_version`. Increment it whenever prompt compilation, structural validation, rubric gates, or normalization policy changes. Preserve old prompts and evaluations by attempt directory.
