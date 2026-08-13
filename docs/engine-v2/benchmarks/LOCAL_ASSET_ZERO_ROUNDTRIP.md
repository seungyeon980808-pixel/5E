# Strict local asset zero-round-trip benchmark

Generated: 2026-08-11T05:38:49.006Z

This benchmark invokes no model, image generator, tool, or UI. It measures only the strict request matcher
and deterministic code-native compilation. Every case is run three times.

## Result

- Cases: 19/19 passed
- Runs: 57/57 passed
- Deterministic cases: 19/19
- External calls: model 0, imageGeneration 0, tools 0
- Median matcher: 0.4334 ms
- Median compile: 0.2468 ms
- Median production path total (match + high-level compile): 1.2744 ms
- Median direct-compiler parity check (verification overhead, not production total): 0.1285 ms

| Case | Objects | Passed runs | Deterministic | Match ms | Compile ms | Total ms |
| --- | ---: | ---: | :---: | ---: | ---: | ---: |
| map-world | 120 | 3/3 | yes | 0.4457 | 6.0677 | 7.3112 |
| map-pacific | 120 | 3/3 | yes | 0.3456 | 4.4707 | 7.5121 |
| map-east-asia | 111 | 3/3 | yes | 0.1894 | 2.016 | 2.7578 |
| map-korean-peninsula | 23 | 3/3 | yes | 0.1819 | 1.1739 | 1.7203 |
| student-trio-no-bubbles | 24 | 3/3 | yes | 0.8241 | 0.5618 | 1.475 |
| student-trio-three-blank-bubbles | 27 | 3/3 | yes | 0.2479 | 0.2539 | 0.5219 |
| spacecraft-simple-flat-shell | 3 | 3/3 | yes | 0.6666 | 0.088 | 0.7829 |
| spacecraft-wide-window-equipped | 9 | 3/3 | yes | 0.2768 | 0.1428 | 0.7046 |
| panel-flow-empty-box | 5 | 3/3 | yes | 2.1046 | 0.1578 | 2.3593 |
| panel-flow-ordered-particles | 5 | 3/3 | yes | 0.3418 | 0.1489 | 0.5088 |
| dual-axis-blank-five-divisions | 16 | 3/3 | yes | 0.7464 | 0.2542 | 1.0848 |
| orthogonal-wiring-closed-rectangle | 8 | 3/3 | yes | 0.383 | 0.1556 | 0.5879 |
| diagonal-wiring-closed-triangle | 6 | 3/3 | yes | 0.0652 | 0.0523 | 0.1276 |
| contour-bundle-five-nested | 5 | 3/3 | yes | 0.8574 | 0.1184 | 1.2744 |
| simple-series-circuit-open | 8 | 3/3 | yes | 1.1436 | 0.1122 | 1.2852 |
| fixed-pulley-spring-loads | 7 | 3/3 | yes | 1.7509 | 0.3256 | 2.0902 |
| lens-mirror-screen-exact | 3 | 3/3 | yes | 0.9544 | 0.0908 | 1.0696 |
| vessel-particle-comparison-locked | 2 | 3/3 | yes | 0.8519 | 0.0693 | 0.9451 |
| logistic-population-graph-fixed | 4 | 3/3 | yes | 0.6679 | 0.3712 | 0.9719 |

## Exact requests

### map-world

- Request: `세계 전체의 물리적 해안선 지도 윤곽을 그려 줘.`
- Motif: `verified_map_outline`
- Options: `{"variant":"world","fillLand":false}`
- Scene hash: `fddb26dda29e7084d4509f863cd9088fa9bc31383d07f632a0a6bdac396eef41`
- Result hash: `2a4565dbf02144c61b601a3dff1ff2673d89391cdd4e67cb130c01e07fbd5c50`

### map-pacific

- Request: `태평양의 물리적 해안선 지도 윤곽을 그려 줘.`
- Motif: `verified_map_outline`
- Options: `{"variant":"pacific","fillLand":false}`
- Scene hash: `9eea958ebd32c002ec100d9a5f3b1a5a18e09a027bdd56a8465921a7fe569266`
- Result hash: `eaf5c6a9218493937bd4bdbe98400af2275f55ed446e4e889eb15abb34d78143`

### map-east-asia

- Request: `동아시아의 물리적 해안선 지도 윤곽을 그려 줘.`
- Motif: `verified_map_outline`
- Options: `{"variant":"east_asia","fillLand":false}`
- Scene hash: `d280cfa2a354c2458e7094b0153e3e8dc89b97d0762ea5a9b2f7ed2ee66672c7`
- Result hash: `6a790b42b41c3988d49c5a8a50acd692d6acf0f3d0ad3601a6416e12c1995ac0`

### map-korean-peninsula

- Request: `한반도의 물리적 해안선 지도 윤곽을 그려 줘.`
- Motif: `verified_map_outline`
- Options: `{"variant":"korean_peninsula","fillLand":false}`
- Scene hash: `818434e58d68dda44cbb186984bb93b33717ecef67fe1944afaba176589663c2`
- Result hash: `1cf350f6b390cf3a5a547a75b502f9d49b113a1d64f4f0d4a98cd7d5f3d5df15`

### student-trio-no-bubbles

- Request: `세 명의 학생이 직사각형 탁자에 앉아 대화하는 장면을 그려 줘.`
- Motif: `student_trio_seated_dialogue`
- Options: `{"tableShape":"rect","speechBubbles":"none"}`
- Scene hash: `3d143b05b0d809ea02480b9619a9ebeb07164ddf2643c752659bf49e425281cf`
- Result hash: `419fe4701d7e9e5535f468c5c5f15b8d4ac88f65bec8a1ec02ae10c3783cd8ec`

### student-trio-three-blank-bubbles

- Request: `세 명의 학생이 원형 탁자에 앉아 대화하며 빈 말풍선 세 개를 포함한 장면을 그려 줘.`
- Motif: `student_trio_seated_dialogue`
- Options: `{"tableShape":"round","speechBubbles":"three_blank","speechBubbleEvidence":"request"}`
- Scene hash: `d7efa831978ea14e3e1834e882ec97b2d3aa5766ab1b19989f94bf85be4444b6`
- Result hash: `e9db7ea1046577e69002cd0f3e64d50d1eb4bd91db658e2b9fc25b21d21759a0`

### spacecraft-simple-flat-shell

- Request: `간단한 평면형 우주선 외형만 그려 줘.`
- Motif: `spacecraft_flat_shell`
- Options: `{}`
- Scene hash: `1dbc302975d3ba7f00e2039f0d4daf60c3ca08252994d86ce86b9991637bb684`
- Result hash: `5f7658930c6b51cb60f027272431c1042b5a78b765a20fe7dc6a870d3b45c990`

### spacecraft-wide-window-equipped

- Request: `간단한 평면형 우주선 외형에 넓은 관측창, 앉은 탑승자, 앞쪽 검출기 상자를 포함해 그려 줘.`
- Motif: `spacecraft_flat_shell`
- Options: `{"window":"wide","occupant":"seated","device":"detector_box","deviceSlot":"front"}`
- Scene hash: `959ecc933e6281f9ab395b6ec24adcd4b2a7c9507f1eb2def439dab10baec66a`
- Result hash: `d65b1f015003e588348bf8df0e7d3fbcfdb6d97d06de7a5d36e876ed35da7e7a`

### panel-flow-empty-box

- Request: `panel_flow 패널 흐름으로 빈 사각 상자 3개를 패널 사이의 평범한 연결선으로 연결한 도식만 그려 줘`
- Motif: `panel_flow`
- Options: `{"panelCount":3,"panelType":"box","states":[{"tone":"white"},{"tone":"white"},{"tone":"white"}],"connectors":true}`
- Scene hash: `146d6fdde00f08095ad57088ac991c2f33fdf86dbf59b4fef46abe80aa427347`
- Result hash: `0ed8ff31ca167e7621fd6ae1a5aacec734e0027089cbfe25d889961d4fb887ea`

### panel-flow-ordered-particles

- Request: `입자 상자 3개를 왼쪽부터 기체 입자 12개, 액체 입자 10개, 고체 입자 8개로 두고 패널 사이를 평범한 연결선으로 연결해 줘`
- Motif: `panel_flow`
- Options: `{"panelCount":3,"panelType":"particlebox","states":[{"state":"gas","count":12},{"state":"liquid","count":10},{"state":"solid","count":8}],"connectors":true}`
- Scene hash: `45444934c8a18b9c3e64206cbe1aebda5aca423ccb7d0fd0c1d9fb2903f8c61d`
- Result hash: `fce5f874daab33e5a487d809172a9281c23d7ae26b1a7a1b28dc4a7ce7a457ba`

### dual-axis-blank-five-divisions

- Request: `빈 이중 y축 그래프에 x축과 5등분 눈금만 있는 도식`
- Motif: `dual_axis_plot`
- Options: `{"tickCount":5,"leftSeries":[],"rightSeries":[],"grid":false}`
- Scene hash: `3b6786d031215568f5f4efa525d22b82f2f7280f763c8d1de2dee0c6ee5e48fa`
- Result hash: `04cf8e233a4bc4a1a7b5ceeb06f28b4d3f667a4be78c1bd9c1d316797a97de02`

### orthogonal-wiring-closed-rectangle

- Request: `직사각형 네 꼭짓점에 단자점 4개가 있는 직교 배선 골격만 닫힌 회로로 평범한 실선 연결`
- Motif: `orthogonal_wiring`
- Options: `{"nodes":[{"id":"a","at":[-48,-24]},{"id":"b","at":[48,-24]},{"id":"c","at":[48,24]},{"id":"d","at":[-48,24]}],"edges":[{"from":"a","to":"b"},{"from":"b","to":"c"},{"from":"c","to":"d"},{"from":"d","to":"a"}],"showNodes":true}`
- Scene hash: `9c30d5b16645ad28262c91c052b3ef226d8d05235bd120b2c93ac731b24e8cd0`
- Result hash: `1fcc22116502bf7cf897fe25a12b04e84114188ea796c91ee746e7bd6ebe5f0e`

### diagonal-wiring-closed-triangle

- Request: `삼각형 꼭짓점에 단자점 3개가 있는 대각 배선 골격만 닫힌 회로로 평범한 실선 연결`
- Motif: `diagonal_wiring`
- Options: `{"nodes":[{"id":"a","at":[-48,26]},{"id":"b","at":[0,-28]},{"id":"c","at":[48,26]}],"edges":[{"from":"a","to":"b"},{"from":"b","to":"c"},{"from":"c","to":"a"}],"showNodes":true}`
- Scene hash: `f2eb3b126ca639abf0e48f796dcabe8cf40f9a62e011b16fd28cb8415b2226c7`
- Result hash: `83421e75dffd9e532f3cd8f961a8a689d59b94b81df8a33baf43fd89c90dc205`

### contour-bundle-five-nested

- Request: `값 없이 중첩된 닫힌 개략 등치선 묶음 5개만 그려 줘`
- Motif: `contour_bundle`
- Options: `{"count":5,"variant":"nested"}`
- Scene hash: `cbbd1d9dbdb080ee4284b56ea43cae11696b62081a803f3598e2ef8ac3502883`
- Result hash: `f9fdf748d42afbee38f7b41bf47803195f7e5a16a7a6ffd4c305aff95f7a1890`

### simple-series-circuit-open

- Request: `단일 사각형 직렬 회로를 닫힌 배선 루프로 그려 줘. 왼쪽에 직류 전원 하나, 위쪽에 열린 스위치 하나, 오른쪽에 저항 하나, 아래쪽에 전구 하나를 배치해.`
- Motif: `simple_series_circuit`
- Options: `{"switchState":"open"}`
- Scene hash: `87b7428e88af3dcd107bb5536d9fe100715e79c98fc0a8b6f95a6ef932fcd57e`
- Result hash: `f0cb5bc47cfa45fb0696aa305f26b47e43a542e62cf82cadb4b7c8680243d082`

### fixed-pulley-spring-loads

- Request: `천장에 고정된 도르래 하나에 하나의 연속된 줄을 걸고, 왼쪽에는 빈 직사각형 추 하나, 오른쪽에는 용수철 하나와 그 아래 같은 모양의 빈 직사각형 추 하나만 배치해.`
- Motif: `fixed_pulley_spring_loads`
- Options: `{}`
- Scene hash: `39743a4a23e0e3628cbc92cdf133817ef03f2906dd3e78fa1bf36c9a1eedd2dd`
- Result hash: `0681469075d089e4b43aefb5c57f05e5e9b248090c75c4e801306e6868db00ef`

### lens-mirror-screen-exact

- Request: `광학대에서 왼쪽에 볼록 렌즈 하나, 중앙에 45도 평면 거울 하나, 오른쪽에 스크린 하나만 배치해.`
- Motif: `lens_mirror_screen_bench`
- Options: `{"lensKind":"convex_lens","mirrorRotation":45}`
- Scene hash: `0f2fd48bd657351ff9ab1ff1413b95c4ede547b50ce5abcf4ffc60365c499aaf`
- Result hash: `8ea64974f814fcdcbd2d20d06c156861541702e712b0b5466cd29478e771c42d`

### vessel-particle-comparison-locked

- Request: `비커 하나와 입자 상자 하나를 나란히 비교해. 비커의 액체 채움 비율은 0.45이다. 입자 상자는 혼합하지 않은 원형 입자이고 기체 상태의 입자이며 입자 수는 16이다.`
- Motif: `vessel_particle_comparison`
- Options: `{"vesselKind":"beaker","liquid":0.45,"particleState":"gas","particleCount":16,"particleShape":"circle","mix":false}`
- Scene hash: `583837ca4bff76dd5a04dc4bc0ecec8c3c933ded9cc71b7b96a0bb52a7a9a497`
- Result hash: `2fa32ec12720ac6c8554b10ac57db8edecb2e02c2d305c86098a1978c0e58929`

### logistic-population-graph-fixed

- Request: `개체군 로지스틱 S자형 성장 곡선을 일반적인 단일 곡선으로 문자와 숫자 없이 그려 줘.`
- Motif: `logistic_population_graph`
- Options: `{}`
- Scene hash: `e7aeb54e5e17f257869f564caaf0ac7e7093f3be450c65c6f0e63fcb8f15cf27`
- Result hash: `39e6961164aa8fc84f1b75a8190580b2154584a65c37740c3b44d618f10b5612`

## Failures and corrections

No matcher, compiler, audit, metadata, parity, or determinism failure occurred in this run.
The JSON artifact preserves 3 corrections.

## What this proves

- These 19 exact, reference-free diagram requests take a zero-round-trip local path.
- The 4 pinned map variants, 4 strict illustration configurations, and 11 general code-native motifs compile to valid, supported 5E objects.
- Canonical expanded-scene and compile-result hashes repeat across all three runs.
- The compiled objects contain no diagram-mode text or arrow violations.
- Map source metadata and strict-illustration component/group provenance survive compilation; general native motifs are checked independently without requiring illustration provenance.

## Limitations

- This is not a semantic benchmark for paraphrases. The matcher intentionally rejects requests outside its exact safe grammar.
- It does not test reference-image transformation, sketches, raster output, model latency, UI insertion, or scientific scoring.
- The map assets cover only world, Pacific, East Asia, and Korean Peninsula physical coastlines. They contain no political borders or overlays.
- The student asset is limited to exactly three seated students at one table. Blank bubbles require explicit request evidence and never contain text.
- The spacecraft asset is a generic flat shell. The equipped case is allowed only because the request explicitly supplies a wide window, seated occupant, detector, and safe front slot.
- The general code-native motifs accept only the exact counts, topology, states, and fixed apparatus configurations recorded above; this is not evidence for arbitrary variants.
- Millisecond timings vary with CPU load; canonical hashes and pass gates, not speed thresholds, are the regression contract.

## Reproduce

```powershell
npm.cmd run benchmark:local-assets
npm.cmd run verify:local-assets
node --test desktop/benchmark-local-assets.test.cjs
```

