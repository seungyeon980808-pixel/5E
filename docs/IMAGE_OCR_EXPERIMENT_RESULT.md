# Track E OCR experiment result

Measured 2026-09-10. Status: isolated experiment complete; product activation **off**.

## Decision

Do not enable product OCR or automatic text replacement. Every measured engine produced only **4 exact fixtures out of 11 (36.36%)**. The strongest character score, 86.21%, hides meaning-changing errors in Korean labels, ambiguous glyphs, spacing, units, and subscripts. High confidence did not make those outputs safe.

`js/image-ocr.js` therefore defaults to `mode: "off"`, returns review evidence only, always reports `replacementAllowed: false`, and preserves the original image for off, unavailable, failed, malformed, oversized, timed-out, empty, uncertain, and suggested results. The untrusted boundary caps encoded and RGBA input at 64 MiB, caps each RGBA dimension at 16,384 px, and gives engine availability plus recognition one shared deadline of at most 30,000 ms. Nothing imports it from product UI in this change.

## Protocol

- Inputs: 11 committed single-line PNG fixtures, including `묽은 염산`, `증류수`, short Korean, `O0 I1 l1`, decimals, units, superscript, chemical subscripts, 12 px Korean, faint text, and Gaussian-blurred Korean.
- Generated atlas: pinned Nanum Gothic bytes and deterministic SVG-to-PNG rendering. Three already-rendered fixed PNGs add the required literal labels and blur case without rebuilding the atlas.
- Scoring: NFC, line-ending/space normalization, then Unicode-code-point Levenshtein distance. Exact match retains distinctions such as `O/0`, `I/1/l`, `²/2`, and `₂/2`.
- Three recognition runs per fixture; output was stable in the saved run.
- Every candidate child had a 120,000 ms deadline. A timeout is unavailable evidence and requests whole-tree termination; the saved run had zero timed-out candidates.
- Environment: Node v24.20.0, macOS Darwin 25.6.0 arm64, Apple M5 (10 logical CPUs), 16 GiB RAM.
- External calls: zero paid API calls and zero image-generation calls. Model files were integrity-pinned and the final run used `--offline`.

The complete per-run values, hashes, edit operations, dependency inventory, and environment are in `benchmarks/image-ocr/track-e-results.json`.

## Measured comparison

| Candidate | Status | Exact | Character accuracy | Median label time | Init | Peak RSS | Initial model bytes |
|---|---:|---:|---:|---:|---:|---:|---:|
| Tesseract.js 7, `tessdata_fast`, `kor` | measured | 4/11 (36.36%) | 72.41% | 7.730 ms | 64.295 ms | 152.22 MiB | 1,677,415 |
| Tesseract.js 7, `tessdata_fast`, `kor+eng` | measured | 4/11 (36.36%) | 78.16% | 11.533 ms | 81.990 ms | 164.09 MiB | 5,790,503 |
| ppu-paddle-ocr 6.5.1, PP-OCRv5 Korean mobile | measured | 4/11 (36.36%) | 86.21% | 9.832 ms | 85.444 ms | 409.73 MiB | 18,387,658 |
| Tesseract.js 7, `tessdata_best`, `kor` | unavailable | n/a | n/a | n/a | failed after 94.867 ms | not measurable | 12,528,128 |
| Tesseract.js 7, `tessdata_best`, `kor+eng` | unavailable | n/a | n/a | n/a | failed after 143.352 ms | not measurable | 27,928,729 |

Times are local-machine values, not browser or Render predictions. “Median label time” is the median of the 11 per-fixture medians. Tesseract browser cold uncompressed code + one compatible core + model was measured as about 5.75 MiB for `kor` and 9.86 MiB for `kor+eng`; actual transfer compression/cache behavior is deployment-specific. Paddle browser runtime transfer was not measured. Its exact model payload was 18,387,658 bytes; the measured Node dependency closures were 15,267,081 bytes for the wrapper and 259,655,111 bytes for native ONNX Runtime.

The raw `tessdata_best` profiles are not reported as bad accuracy. They could not initialize in this Tesseract.js v7 runtime and exited with:

```text
Aborted(missing function: _ZN9tesseract13DotProductSSEEPKfS1_i)
```

The benchmark records both profiles as `status: "unavailable"`, code `TESSERACT_WASM_MISSING_SYMBOL`, `timedOut: false`, the applied 120,000 ms deadline, and no termination action, then continues. This observation is scoped to the pinned Tesseract.js runtime on this machine; it does not claim native Tesseract or every browser has the same failure.

Every worker uses the same bounded runner. On POSIX it starts each candidate in its own process group, sends group `SIGTERM` at the deadline, escalates the group to `SIGKILL` after 1,000 ms, and stops waiting after another 1,000 ms while recording any incomplete termination. On Windows it requests `taskkill /T /F` with a child-only fallback. A deterministic test starts a parent and descendant, waits for both readiness events, triggers the deadline signal, and verifies that both receive the POSIX group termination; it uses no sleep or polling. Timeout reports remain `status: "unavailable"`, `aggregate: null`, with code `CANDIDATE_PROCESS_TIMEOUT`, deadline, signal, and termination evidence.

## Exact examples

| Expected | Tesseract fast `kor` | Tesseract fast `kor+eng` | Paddle Korean |
|---|---|---|---|
| `묽은 염산` | `문은 염산` | `Be 염산` | `붉은 염산` |
| `묽은 염산` (blurred) | `문은 염산` | `He 염산` | `맑은 염산` |
| `증류수` | `증류수` | `증류수` | `증류수` |
| `O0 I1 l1 S5 B8` | `001111 55 88` | `001111 55 88` | `O0 11 11 S5 B8` |
| `0.01 1.00 10.0` | exact | exact | exact |
| `속력 12 m/s²` | `속력 12 07/9@2` | `속력 12 m/s?` | `속력 12m/s2` |
| `H₂O + CO₂` | `20 + 0,` | `H,0 + CO,` | `H2O + CO2` |
| `물체의 운동` (12 px) | exact | exact | exact |
| `전압 3.0 V` (faint) | `전압 3.0` | `전압 3.0` | `전압3.0V` |

Confidence cannot repair this. Paddle returned `붉은 염산` at 0.9621 and the wrong `속력 12m/s2` at 0.9955. Tesseract returned `속력 12 m/s?` at 94/100. These are direct counterexamples to confidence-triggered replacement.

## Candidate feasibility

| Candidate | Finding |
|---|---|
| Tesseract.js 7 | Browser and Node worker support is documented and the fast profile ran. Quality is not usable for replacement. |
| ppu-paddle-ocr 6.5.1 | A distinct Paddle/ONNX implementation ran with browser-compatible `canvas-native` preprocessing. This project is a third-party wrapper and its converted model files are community-hosted, not an official Paddle browser SDK. Browser timing remains unmeasured. |
| Official Paddle.js OCR 1.2.4 | Browser-capable, but its official README limits recognition to Chinese, English, and numbers. It cannot satisfy Korean fixtures, so it was not given a misleading accuracy run. |
| Native PaddleOCR | Official PP-OCRv5 has a Korean model and documents 88.0% on its own Korean dataset, but the supported quick start is Python/CLI, not this static browser app. A separate server would add deployment and memory risk. |
| EasyOCR | Korean is supported through Python/PyTorch, but no official browser runtime was found. It does not fit static hosting or the 512 MiB Render service without a new measured backend. |
| Google ML Kit | Official text-recognition setup targets Android and iOS, not a general web page. It would violate the no-install/browser requirement. |
| Browser `TextDetector` / Shape Detection | No stable interoperable web OCR surface with a Korean contract was found; it cannot be the product fallback. |
| Scribe.js / tesseract-wasm | Both remain Tesseract-family wrappers. Running the same traineddata through another wrapper is not an independent accuracy candidate; it would not answer the Korean-model quality question. |
| Transformer/VLM OCR | No compact, officially browser-supported Korean scientific-label model with a measured fit for this worktree was identified. Large vision models were excluded rather than shifted onto the free server without evidence. |

The supplied feasibility report (`93187f44:.omo/ulw-research/20260910-051044/REPORT.md`) establishes the deployment boundary used here: static browser work is preferred; Render Free is 0.1 CPU/512 MB and has sleep/ephemeral-storage constraints. Tesseract's 149–164 MiB local peak leaves more headroom, but its quality fails. Paddle's 406 MiB local process peak leaves too little evidence-backed headroom for the existing service, and Apple M5 timings cannot be extrapolated to 0.1 CPU. No extra server is recommended.

## Integration handoff (not activated)

Public experiment function:

```js
suggestImageText(image, options, dependencies)
```

Options are exactly:

```js
{ mode: "off" | "suggest", language: "kor" | "kor+eng", preserveOriginal: true }
```

Injected engine contract:

```js
{
  id,
  available({ signal }), // boolean property or async function, optional
  recognize(imageCopy, { language, signal })
  // -> Promise<{ text, confidence?, uncertain? }>
}
```

Boundary limits and execution contract:

- `IMAGE_OCR_LIMITS.maxEncodedBytes`: 67,108,864. Strings are counted as UTF-8 representation bytes; `Blob.size`, `ArrayBuffer.byteLength`, or view `byteLength` is used otherwise. Oversize returns `failed/IMAGE_ENCODED_TOO_LARGE` before any engine call.
- `IMAGE_OCR_LIMITS.maxRgbaBytes`: 67,108,864; `maxDimension`: 16,384 px per side. RGBA data must also contain exactly `width * height * 4` bytes. Violations return `failed/IMAGE_RGBA_TOO_LARGE`, `failed/IMAGE_DIMENSIONS_TOO_LARGE`, or `failed/INVALID_IMAGE` before any engine call.
- `IMAGE_OCR_LIMITS.maxEngineMs`: 30,000. `timeoutMs` defaults to that value and may only lower it to an integer of at least 1. Availability and recognition share one deadline and one internal abort signal.
- Availability timeout returns `unavailable/ENGINE_TIMEOUT`; recognition timeout returns `failed/ENGINE_TIMEOUT`; caller cancellation returns `ENGINE_ABORTED`. Every case keeps the original and has no suggestions.
- `mode: "off"` returns before inspecting the image, engine, clock, signal, or timeout dependency.

Result state contract:

- Common immutable policy fields: `preserveOriginal: true`, `originalPreserved: true`, `replacementAllowed: false`, `suggestions: []` unless text evidence exists.
- `status: "off"`: no image inspection and no engine call.
- `status: "unavailable" | "failed" | "no-text"`: original crop remains; error is machine-readable; no suggestion. This includes input-limit, cancellation, and deadline failures.
- `status: "suggested"`: original crop still remains; `reviewRequired: true`; confidence and uncertainty are evidence only.

A future `js/image-objectify.js` owner can pass the existing `makeTextCropDataUrl(...).dataUrl` to `suggestImageText`. The caller must snapshot `loadGeneration`, `analysisGeneration`, component identity/bounds, and the original crop before starting. It must discard stale responses and keep `textCrops` as the insertion source for every status. This experiment exposes no apply/replace function; any later human-approved replacement requires a separate product contract and UI change. Initial state must remain:

```js
{ mode: "off", language: "kor", preserveOriginal: true }
```

## Reproduction and verification

```sh
npm ci --prefix experiments/image-ocr
npm test --prefix experiments/image-ocr
npm run benchmark --prefix experiments/image-ocr -- --iterations 3
npm run benchmark --prefix experiments/image-ocr -- --iterations 3 --offline
```

Final verified run:

- `npm test`: 16/16 tests passed (13 OCR boundary/scoring/fixture tests and 3 benchmark-process tests); deterministic atlas check verified 8 generated fixtures, and the test verified all 3 fixed fixture hashes.
- Independent offline rerun: exited 0; 3 candidates measured, 2 unavailable profiles recorded, 0 timed out; 11 fixtures × 3 runs per measured candidate; candidate deadline 120,000 ms; output SHA-256 `f9ce0a6a9ba15b2c7a6b9fb592edf95aac6858dc2d8753a8b83850e77dfcd3fd`.
- Syntax checks passed for the module, tests, model loader, and all benchmark runners.
- TypeScript language-server diagnostics were unavailable because that server is not installed on this workstation.
- `js/image-objectify.js`, `js/ai-panel.js`, product UI, and the shared image contract were not edited by Track E.

## Official/current sources reviewed

Accessed 2026-09-10:

- Tesseract.js v7 browser/Node scope and worker API: https://github.com/naptha/tesseract.js/blob/v7.0.0/README.md
- Tesseract.js local worker/core/language loading: https://github.com/naptha/tesseract.js/blob/v7.0.0/docs/local-installation.md
- Pinned Tesseract fast data: https://github.com/tesseract-ocr/tessdata_fast/tree/87416418657359cb625c412a48b6e1d6d41c29bd
- Pinned Tesseract best data: https://github.com/tesseract-ocr/tessdata_best/tree/e12c65a915945e4c28e237a9b52bc4a8f39a0cec
- PaddleOCR PP-OCRv5 multilingual/Korean model documentation: https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.en.md
- Official Paddle.js OCR package scope: https://github.com/PaddlePaddle/Paddle.js/blob/release/v2.2.5/packages/paddlejs-models/ocr/README.md
- ppu-paddle-ocr 6.5.1 project documentation: https://github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr/blob/v6.5.1/README.md
- Pinned converted Paddle models: https://huggingface.co/snowfluke/ppu-paddle-ocr-models/tree/bf1d5edb0335d3262be7caf13f766ba274b4cadd
- ONNX Runtime browser deployment: https://onnxruntime.ai/docs/tutorials/web/
- EasyOCR API/runtime documentation: https://www.jaided.ai/easyocr/documentation/
- Google ML Kit text recognition platforms: https://developers.google.com/ml-kit/vision/text-recognition/v2
- WICG Shape Detection draft: https://wicg.github.io/shape-detection-api/
- Render Free constraints: https://render.com/docs/free and https://render.com/docs/compute-plans

**Recommendation (Short):** keep OCR disabled and preserve raster text. Re-open only as a separate measured browser study after a materially better Korean scientific-text model is available; do not tune a confidence threshold around these errors.
