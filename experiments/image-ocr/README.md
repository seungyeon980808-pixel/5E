# Track E image OCR experiment

This directory is an isolated OCR quality and resource experiment. It is not imported by the product UI. The engine-neutral boundary is `../../js/image-ocr.js`; every result preserves the source image and forbids automatic replacement.

## Reproduce

```sh
npm ci --prefix experiments/image-ocr
npm test --prefix experiments/image-ocr
npm run benchmark --prefix experiments/image-ocr -- --iterations 3
```

The first online benchmark run downloads integrity-pinned model files into ignored `experiments/image-ocr/.models/`. Once populated, add `--offline` to prove the run does not use the network:

```sh
npm run benchmark --prefix experiments/image-ocr -- --iterations 3 --offline
```

The benchmark writes `benchmarks/image-ocr/track-e-results.json`. Every candidate child has a 120,000 ms deadline (configurable with `--candidate-timeout-ms`, hard-capped at 300,000 ms). A timeout terminates the whole child process group/tree and is recorded as `status: "unavailable"` with `CANDIDATE_PROCESS_TIMEOUT`, the deadline, and termination evidence; it never becomes an accuracy result. Other initialization failures remain `unavailable` and do not abort the matrix. `npm test` verifies the OCR boundary, deterministic process-tree timeout, fallback contract, and fixture bytes. `npm run fixtures` checks the deterministic fixture atlas without rewriting it.

`@resvg/resvg-js` exists only to verify the generated fixtures. Tesseract.js runs through its WASM worker. The Paddle comparison uses `canvas-native` preprocessing and native ONNX Runtime CPU in Node; its browser-capable package path is documented, but these measurements are not browser timings.
