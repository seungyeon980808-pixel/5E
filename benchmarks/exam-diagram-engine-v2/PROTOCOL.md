# V2 benchmark protocol

The benchmark contains 60 cases: 36 development and 24 frozen final cases. The 3 input modes × 4 subjects matrix contains five cases per cell: three development and two final. Therefore each input mode has 20 cases and each subject has 15.

Development cases may drive prompt/specification correction. Freeze the engine version and rerun all development regression assertions before opening `final.json`. Never edit V2 from final-case failures. `LOCK.json` pins both manifests.

For every case preserve this directory pattern:

```text
results/<split>/<case-id>/
  request.json
  structure.json
  preflight.json
  attempt-01/prompt.txt
  attempt-01/prompt.json
  attempt-01/generated.png
  attempt-01/image-metrics.json
  attempt-01/evaluation.json
  attempt-01/score.json
  attempt-02/correction.json  # only when needed
```

Evaluate each attempt independently. Passing requires at least 85/100 and all hard gates. An output containing a severe scientific error or any text/digit/symbol/label/leader/arrow cannot pass.

Select twelve `difficulty: hard` development cases across all modes and subjects for stability testing. Generate three independent outputs from the same frozen prompt; at least two must pass.

The input assets are project-owned synthetic fixtures. They may contain color, labels, rough strokes, or arrows specifically to test removal. They are not final diagram outputs.
