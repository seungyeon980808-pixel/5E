# Fast-scene failure and correction history

The correction archive contains the two original prompt/contract failures and four later `@6/@4` apparatus regressions. Every retained run made zero image-generation and zero unexpected-tool calls. Raw responses, hashes, exact requests, recovered timings and recovery provenance are preserved in `fast-scene-correction-history.v1.json`; fields that were overwritten before recovery are explicitly `null`, never estimated.

| Case | Initial result | Root cause | Minimal correction | Rerun |
| --- | ---: | --- | --- | ---: |
| `earth-observatory-optics` | 0/3 | Luna rendered the requested plane mirror as a generic line/polyline, so the semantic optics component was absent. | Require `type=optics`, `opticsKind=plane_mirror`, `rotation=45`; explicitly forbid line/polyline/curve substitution. | 3/3 |
| `chemistry-panel-flow` | 0/3 | The motif prompt documented vessel state fields but omitted particle `state/count/mix`, so every panel fell back to gas. | Add particle fields to the audited `panel_flow` contract and require state/count for every particle panel. | 3/3 |
| `physics-series-circuit` (`@6/@4`) | 0/3 | Luna repeated the root artboard inside the exact circuit motif options. | Canonicalize identical duplicates, retain rejection for conflicting values, and remove `options.artboard` from the model-facing reference. | 3/3 |
| `physics-pulley-spring` (`@6/@4`) | 0/3 | All three exact pulley motifs repeated the root artboard in options. | Apply the same fail-safe artboard ownership correction. | 3/3 |
| `earth-observatory-optics` (`@6/@4`) | 2/3 | One exact optical motif repeated the root artboard in options. | Require the fixed optical fixture with only its scientific options and canonicalize an identical duplicate. | 3/3 |
| `chemistry-vessel-particles` (`@6/@4`) | 1/3 | One freeform particle box exceeded the artboard and one exact motif repeated its artboard. | Route the exact request to the fixed vessel-particle fixture with only its scientific options. | 3/3 |

The active benchmark uses `5e-fast-scene-prompt@7` and `5e-motif-catalog@5`. Selected-case reruns archive the replaced case, full reruns carry the existing `correctionHistory` forward, and `--verify` rejects saved results whose prompt or motif version differs from the currently imported modules.
