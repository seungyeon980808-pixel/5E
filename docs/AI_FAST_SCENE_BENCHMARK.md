# AI fast-scene live benchmark

Measured on 2026-08-09 with the local Codex app server and the subscription-backed
`gpt-5.6-luna` model. This path asks the model for compact scene JSON and never
calls image generation.

## Reproduce

```powershell
node desktop/benchmark-scene-turn.cjs
```

The benchmark is hard-capped at 120 seconds. It uses low reasoning effort,
priority/Fast service, no reference image, and a single label-free pulley scene.
It fails if the scene is not valid/supported, contains no output objects, or an
image/search/shell/MCP tool is observed.

## Baseline result

| Measure | Result |
| --- | ---: |
| App-server/model/thread setup | 3,909.37 ms |
| `turn/start` RPC | 14.89 ms |
| Luna scene response | 9,572.34 ms |
| Local scene compilation (wall) | 1.632 ms |
| End-to-end including setup and compile | 13,483.35 ms |
| Response size | 399 chars |
| Input elements / output objects | 4 / 4 |
| Image-generation calls | 0 |
| Unexpected tool calls | 0 |

Result: completed, valid, and supported. The compiler reported four layout
warnings because the returned scene used several positive coordinates outside
the centred artboard bounds. Insertion can fit the resulting object bounds, but
the production prompt/router should still strengthen or normalize the coordinate
contract before treating a warning-free layout as guaranteed.

The exact response hash for the run was
`fdc68433d5b6faf786be6e5b5d43c527e396a7c171e757abe88a75eaeee509b5`.

## Hardened rerun

After the prompt stated the exact centred coordinate bounds and the compiler
added a conservative top-left-origin normalizer, the same benchmark was run
again.

| Measure | Result |
| --- | ---: |
| App-server/model/thread setup | 2,208.14 ms |
| `turn/start` RPC | 1.48 ms |
| Luna scene response | 9,089.11 ms |
| Local scene compilation (wall) | 2.282 ms |
| End-to-end including setup and compile | 11,299.54 ms |
| Response size | 414 chars |
| Input elements / output objects | 4 / 4 |
| Compiler warnings / errors | 0 / 0 |
| Image-generation calls | 0 |
| Unexpected tool calls | 0 |

This rerun completed successfully with no layout warning. The response hash was
`74a3b1ebf35439e361a627096de92ee8a9a5f1b57d31cd6d7a95e715d08c4adf`.
