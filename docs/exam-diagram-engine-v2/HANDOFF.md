# Exam Diagram Engine V2.1 handoff

## Entry point

In a new Codex task, invoke `$exam-diagram-engine-v2` and provide a reference image, a written scientific situation, or a sketch plus description. The package entry point is `.agents/skills/exam-diagram-engine-v2/SKILL.md`.

Codex must first produce and review the structure contract. Route vector-eligible scenes to `vector_renderer.py`; route genuinely organic scenes to built-in image generation. Never force an organic structure into a lossy geometric approximation.

## Deterministic vector workflow

```powershell
python .agents/skills/exam-diagram-engine-v2/scripts/vector_renderer.py validate `
  --scene scene.json --out validation.json

python .agents/skills/exam-diagram-engine-v2/scripts/vector_renderer.py render `
  --scene scene.json --out generated.png --report render.json

python .agents/skills/exam-diagram-engine-v2/scripts/engine.py inspect-image `
  --image generated.png --out image-metrics.json
```

The scene must conform to `assets/vector-scene.schema.json`. Validation rejects unsupported primitives, colors, duplicate identifiers, unknown connections, reused geometry, and geometry outside the closed instance inventory.

## Release status

- V2.0 raw-input frozen final: 15/24 (62.5%), failed.
- V2.1 reviewed-scene renderer: 24/24, renderer-only validation.
- V2.2 reference-guided edit engine: development pilot in progress; not released and not approved for 5E production integration.
- Do not interpret V2.1 byte-identical rendering as raw-image understanding accuracy.

## Artifact map

- Skill and routing: `.agents/skills/exam-diagram-engine-v2/SKILL.md`
- Common/input/subject rules: `.agents/skills/exam-diagram-engine-v2/references/`
- Request, evaluation, and vector-scene schemas: `.agents/skills/exam-diagram-engine-v2/assets/`
- Prompt compiler and evaluator: `.agents/skills/exam-diagram-engine-v2/scripts/engine.py`
- Deterministic renderer: `.agents/skills/exam-diagram-engine-v2/scripts/vector_renderer.py`
- V2.1 benchmark: `benchmarks/exam-diagram-engine-v2-1/`
- V2.1 outputs and stability evidence: `results/exam-diagram-engine-v2-1/`
- Historical stochastic V2 artifacts: `benchmarks/exam-diagram-engine-v2/`, `results/exam-diagram-engine-v2/`
- Final report: `docs/exam-diagram-engine-v2/FINAL_REPORT.md`

## Freeze verification

```powershell
python .agents/skills/exam-diagram-engine-v2/scripts/verify_vector_freeze.py --root .
```

Do not modify a pinned V2.1 final artifact. Any future renderer or specification change requires a new version and a new untouched final split.
