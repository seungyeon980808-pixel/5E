# Exam Diagram Engine V2 usage

The reusable package is `.agents/skills/exam-diagram-engine-v2`. Invoke it in a new Codex session as `$exam-diagram-engine-v2` and provide a reference image, a scientific description, or a sketch plus description.

The Skill first produces a reviewable request contract, then compiles a generation prompt. It deliberately keeps model credentials out of the repository and uses Codex's built-in image generation capability. The PNG output and JSON sidecar can be imported into 5E; labels, symbols, and arrows are added later in 5E.

For geometry-expressible scenes, V2.1 prefers the deterministic vector adapter. Start from `assets/example-vector-scene.json`, preserve the closed instance inventory, and render only after validation:

```powershell
python .agents/skills/exam-diagram-engine-v2/scripts/vector_renderer.py validate `
  --scene .agents/skills/exam-diagram-engine-v2/assets/example-vector-scene.json

python .agents/skills/exam-diagram-engine-v2/scripts/vector_renderer.py render `
  --scene .agents/skills/exam-diagram-engine-v2/assets/example-vector-scene.json `
  --out generated.png --report render.json
```

Example local compile:

```powershell
python .agents/skills/exam-diagram-engine-v2/scripts/engine.py compile `
  --request .agents/skills/exam-diagram-engine-v2/assets/example-request.json `
  --out-dir tmp/exam-diagram-v2/example
```

Then generate from `prompt.txt`, save `generated.png`, inspect palette/margins, and fill the evaluation record:

```powershell
python .agents/skills/exam-diagram-engine-v2/scripts/engine.py inspect-image `
  --image tmp/exam-diagram-v2/example/generated.png `
  --out tmp/exam-diagram-v2/example/image-metrics.json

python .agents/skills/exam-diagram-engine-v2/scripts/engine.py score `
  --evaluation tmp/exam-diagram-v2/example/evaluation.json `
  --out tmp/exam-diagram-v2/example/score.json
```

Validate the frozen benchmark layout with:

```powershell
python .agents/skills/exam-diagram-engine-v2/scripts/engine.py validate-benchmark `
  --development benchmarks/exam-diagram-engine-v2/development.json `
  --final benchmarks/exam-diagram-engine-v2/final.json
```

Do not edit the V2 prompt from final-case results. Create a new engine version for subsequent changes.
