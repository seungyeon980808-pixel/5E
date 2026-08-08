# Exam Diagram Engine V2 handoff

## Package entry point

Use `.agents/skills/exam-diagram-engine-v2/SKILL.md`. In a new Codex task, invoke `$exam-diagram-engine-v2`, supply exactly one of the three supported input contracts, and follow the Skill workflow through compile, generation, inspection, and scoring.

The engine is model-provider neutral at the repository boundary: it compiles a constrained prompt and records generation evidence, while Codex's built-in image generator creates the raster asset.

## Important status

V2 is reproducible and fully audited, but its frozen-final release decision is `FAIL` (15/24, 62.5%). Do not present it as meeting the requested quality threshold. Do not edit V2 from the final failures or rerun failed final prompts to replace attempt 1.

For a successor version:

1. Branch from this worktree state.
2. Create new development cases for exact repeated counts, electrical continuity, and sketch-frame suppression without copying the frozen-final cases.
3. Version the Skill and engine as V2.1 or V3.
4. Freeze a new untouched final manifest before any final generation.
5. Execute the 12-case three-regeneration stability gate only after the new final split passes its release thresholds.

## Artifact map

- Skill: `.agents/skills/exam-diagram-engine-v2/`
- Style and subject rules: `.agents/skills/exam-diagram-engine-v2/references/`
- Schemas and example request: `.agents/skills/exam-diagram-engine-v2/assets/`
- Engine and benchmark scripts: `.agents/skills/exam-diagram-engine-v2/scripts/`
- Benchmark manifests and freeze: `benchmarks/exam-diagram-engine-v2/`
- Development and final outputs: `results/exam-diagram-engine-v2/`
- Provenance: `docs/exam-diagram-engine-v2/SESSION1_PROVENANCE.md`
- Failure history: `docs/exam-diagram-engine-v2/FAILURE_AND_CORRECTION_LOG.md`
- Final decision: `docs/exam-diagram-engine-v2/FINAL_REPORT.md`

## Reproduction smoke test

```powershell
python .agents/skills/exam-diagram-engine-v2/scripts/engine.py compile `
  --request .agents/skills/exam-diagram-engine-v2/assets/example-request.json `
  --out-dir tmp/exam-diagram-v2/fresh-session-check
```

The command must create `structure.json`, `prompt.txt`, `prompt.json`, and `preflight.json` with a passing preflight before image generation.
