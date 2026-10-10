# White-surface science diagram checkpoint

`white-science-settings.json` preserves the recipe used in the 2026-10-04
label-inclusive comparison, which the user accepted visually. It is an experiment
recipe; the application does not automatically load this JSON.

Use the production source analysis, one image generation, candidate target
mapping, native label compositor and final review. Bind each run to the source,
prompt, module versions, provider RAW and native composite hashes. Keep provider
RAW untouched and retain failures separately from accepted candidates.

The image prompt replaces only the bounded style block with `styleTemplate`.
Resolve `[allowlist]` from source facts **before** seeing the generated output;
preserve the source tracing and label ownership contracts around that block.
Append the corresponding source-grounded scientific structure facts when needed.
The three recorded `perSourceFacts` are examples for their named sources, not
instructions to reuse for unrelated diagrams. New images require new observations.

The current product uses source-label policy 4 and style-review contract 1.1.0.
Historical outputs retain the versions actually used; do not relabel old results
as current-policy runs. Caption text on a scientific dimension/range/direction
mark is restored as text, without duplicating the scientific arrow.

Actual experiment orchestration was Sol 6.1 / medium using the desktop bundled
native runtime. The image backend revision was not exposed. Luna 6.1 was rejected
by the account with HTTP 400; no substitute was used. The product's default CLI
resolver was not changed by this checkpoint.

The frozen additional set passed practical style in 3/3 cases and complete visual
review in 1/3, while product automatic acceptance stayed 0/3. Two subsequent
corrective regressions are separate: the mantle arrow duplication was fixed,
but geometry errors remain. Automatic style review also falsely rejects the
designated historical acceptable style. User visual acceptance of this checkpoint
does not silently relax those automatic gates.

Recorded checks: focused unit 72/72, real-browser synthetic-transport workflow
11/11, full unit 431/432. The sole full-unit failure is the previously recorded
PNG compressed-byte reproducibility test. Actual source analysis, generation,
target mapping and review timing must be reported separately; reused observations
are not evidence of faster fresh-source analysis.

Local run evidence and full images remain under
`.omo/evidence/harness-search-20261004/`; they are not included in this recipe.

## Reuse source observations during tuning

`frozen-source-observation.cjs` binds a retained production observation to the
exact forwarded analysis prompt, ordered source names/data hashes, model,
effort/tier, normalized workflow, source policy and analysis implementation
fingerprint. Use the actual prepared analysis inputs, including any experiment
suffix. The implementation fingerprint must cover the analysis builder/parser,
thread policy and runtime configuration. A changed input or damaged record
returns a cache miss; run production analysis again. Retain the entire plan,
including uncertainties and reserved local-restoration attempts.

Rendering or review variants can share this observation if their actual analysis
inputs remain identical. If a variant changes ownership or preservation choices,
update the analysis request/workflow too. This helper checks bindings and data
integrity; it does not certify the observation's scientific correctness. Create
records only from the production controller's validated observations.

```js
const {
  createAnalysisContext, createFrozenObservationRecord, resolveFrozenObservation,
} = require('./frozen-source-observation.cjs');

const context = createAnalysisContext(preparedAnalysisInputs);
const record = createFrozenObservationRecord(context, actualObservation);
const observation = resolveFrozenObservation(record, nextAnalysisContext);
// Pass observation to executeImageLabelRun. null means fresh analysis.
// Generation, mapping, native composition and final review still run normally.
```

This is a test-harness utility, not an application-wide cache change. It does not
cache RAW/FINAL images, force acceptance or skip final checks. The existing app
observation path has weaker context guards; do not claim it invalidates every
changed request based on this helper's tests.

The 2026-10-04 follow-up measured 6 fresh full runs, 2 same-condition repeats and
14 tool-free fixed-image reviews on Sol 6.1 / medium. Review brevity and geometry
input deduplication did not consistently shorten execution; keep them disabled.
Identical-source observation reuse measured 374.38 → 206.97 seconds and
257.97 → 179.28 seconds. These are repeated-run gains, not first-run gains.
All 8 new outputs still had independent quality failures or uncertainty; timing
does not authorize their acceptance. Reusing analysis cannot guarantee that a
new generation preserves geometry or that native labels avoid overlaps.

`node --test tools/image-harness/frozen-source-observation.test.cjs` checks input
changes, damaged records, immutable uncertainty retention and cache misses.
Six additional zero-native-call probes used real retained observations to verify
the production boundary: identical contexts skip analysis; changed requests
require analysis. The actual timed repeats preceded the helper and used explicit
manifest guards. They are not retroactively reported as runs of this new helper.
Local follow-up evidence: `.omo/evidence/speed-optimization-20261004/`.
