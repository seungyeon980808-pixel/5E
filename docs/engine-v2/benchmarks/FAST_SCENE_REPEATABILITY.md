# Fast-scene repeatability benchmark

- Generated: 2026-08-09T13:19:50.187Z
- Model: gpt-5.6-luna
- Runtime profile: effort=`low`, service tier=`priority`, image tools disabled
- Cases/runs: 9 cases, 27 independent ephemeral-thread runs
- Reproducibility: 9/9 cases meet at least 2/3 passes
- Image generation calls: 0
- Unexpected tool calls: 0
- Verification: **PASS**

Timing definitions: `total` is fresh thread creation through local compile; `model` is turn request through `turn/completed`; `compile` is local motif expansion and 5E object compilation. All values are milliseconds.

## Case summary

| Case | Subject | Type | Passes | Median total | Median model | Median compile | Response hashes | Scene hashes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 직렬 회로 | physics | circuit | 3/3 | 5632.34 | 5306.34 | 1.609 | 1 | 1 |
| 도르래와 용수철 | physics | pulley-spring | 3/3 | 9250.64 | 8965.99 | 1.232 | 1 | 1 |
| 관측 장치의 렌즈와 거울 | earth-science | lens-mirror | 3/3 | 6207.42 | 5903.76 | 0.307 | 1 | 1 |
| 용기와 입자 | chemistry | vessel-particles | 3/3 | 6159.95 | 5858.12 | 0.171 | 1 | 1 |
| 개체군 변화 그래프 | biology | graph | 3/3 | 7922.82 | 7628.11 | 0.409 | 3 | 3 |
| 3단계 입자 패널 흐름 | chemistry | panel-flow | 3/3 | 9278.01 | 8976.29 | 0.639 | 2 | 1 |
| 생물 지표 이중축 | biology | dual-axis | 3/3 | 7395.63 | 7105 | 1.318 | 3 | 3 |
| 등치선 묶음 | earth-science | contour | 3/3 | 6984.68 | 6501.43 | 0.84 | 3 | 3 |
| 직교 배선 | physics | wiring | 3/3 | 7230.42 | 6948.05 | 0.359 | 3 | 1 |

## Individual runs

| Case | Run | Pass | total | model | compile | objects | warnings | errors | image | tools | response hash | scene hash |
| --- | ---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| physics-series-circuit | 1 | yes | 13193.76 | 10922.92 | 4.696 | 8 | 0 | 0 | 0 | 0 | 77d83bfdd982 | 87b7428e88af |
| physics-series-circuit | 2 | yes | 5561.22 | 5275.06 | 1.609 | 8 | 0 | 0 | 0 | 0 | 77d83bfdd982 | 87b7428e88af |
| physics-series-circuit | 3 | yes | 5632.34 | 5306.34 | 1.06 | 8 | 0 | 0 | 0 | 0 | 77d83bfdd982 | 87b7428e88af |
| physics-pulley-spring | 1 | yes | 5997.41 | 5683.64 | 1.832 | 7 | 0 | 0 | 0 | 0 | 3a7b92ce395f | 39743a4a23e0 |
| physics-pulley-spring | 2 | yes | 9250.64 | 8965.99 | 0.401 | 7 | 0 | 0 | 0 | 0 | 3a7b92ce395f | 39743a4a23e0 |
| physics-pulley-spring | 3 | yes | 9884.55 | 9600.56 | 1.232 | 7 | 0 | 0 | 0 | 0 | 3a7b92ce395f | 39743a4a23e0 |
| earth-observatory-optics | 1 | yes | 6207.42 | 5903.76 | 0.499 | 3 | 0 | 0 | 0 | 0 | 3252cbcf74b1 | 0f2fd48bd657 |
| earth-observatory-optics | 2 | yes | 6560.26 | 6248.91 | 0.296 | 3 | 0 | 0 | 0 | 0 | 3252cbcf74b1 | 0f2fd48bd657 |
| earth-observatory-optics | 3 | yes | 6151.53 | 5872.07 | 0.307 | 3 | 0 | 0 | 0 | 0 | 3252cbcf74b1 | 0f2fd48bd657 |
| chemistry-vessel-particles | 1 | yes | 6159.95 | 5858.12 | 0.836 | 2 | 0 | 0 | 0 | 0 | 620a481fc976 | 583837ca4bff |
| chemistry-vessel-particles | 2 | yes | 6895.34 | 6626.26 | 0.165 | 2 | 0 | 0 | 0 | 0 | 620a481fc976 | 583837ca4bff |
| chemistry-vessel-particles | 3 | yes | 6035.64 | 5750.78 | 0.171 | 2 | 0 | 0 | 0 | 0 | 620a481fc976 | 583837ca4bff |
| biology-population-graph | 1 | yes | 9435.14 | 9034.69 | 1.259 | 4 | 0 | 0 | 0 | 0 | 01cc0ca455bf | 719b210f1729 |
| biology-population-graph | 2 | yes | 7922.82 | 7628.11 | 0.233 | 4 | 0 | 0 | 0 | 0 | 6db2d649afe3 | 1d5ecdbce74c |
| biology-population-graph | 3 | yes | 7493.05 | 7200.23 | 0.409 | 4 | 0 | 0 | 0 | 0 | 9dc0b7f51fdb | 2afe97f41e93 |
| chemistry-panel-flow | 1 | yes | 9278.01 | 8976.29 | 0.639 | 5 | 0 | 0 | 0 | 0 | b2c77e400bfd | 7249918446f7 |
| chemistry-panel-flow | 2 | yes | 7632.06 | 7329.45 | 0.551 | 5 | 0 | 0 | 0 | 0 | b2c77e400bfd | 7249918446f7 |
| chemistry-panel-flow | 3 | yes | 11344.54 | 11047.1 | 0.867 | 5 | 0 | 0 | 0 | 0 | 03c49d28507d | 7249918446f7 |
| biology-dual-axis | 1 | yes | 6980.97 | 6652.7 | 1.318 | 18 | 0 | 0 | 0 | 0 | 4625ea2811fd | 7787fd07b23d |
| biology-dual-axis | 2 | yes | 7395.63 | 7105 | 1.043 | 18 | 0 | 0 | 0 | 0 | 93c549965bd6 | 855694732308 |
| biology-dual-axis | 3 | yes | 9876.21 | 9552.95 | 1.658 | 18 | 0 | 0 | 0 | 0 | 1ea87c029404 | a4fce9681c04 |
| earth-contour-bundle | 1 | yes | 6984.68 | 6501.43 | 2.038 | 5 | 0 | 0 | 0 | 0 | 1fe806b50b04 | 9d1108ecb42c |
| earth-contour-bundle | 2 | yes | 6200.62 | 5673.09 | 0.84 | 5 | 0 | 0 | 0 | 0 | a035dd86c7f6 | d1dc68cd958a |
| earth-contour-bundle | 3 | yes | 7196.36 | 6922.49 | 0.401 | 5 | 0 | 0 | 0 | 0 | b95f49c623fa | 133a816319ac |
| physics-orthogonal-wiring | 1 | yes | 7230.42 | 6905.08 | 1.562 | 8 | 0 | 0 | 0 | 0 | 96b823cc48f4 | 502125795a49 |
| physics-orthogonal-wiring | 2 | yes | 7240.71 | 6962.71 | 0.359 | 8 | 0 | 0 | 0 | 0 | 930e8f1b0c15 | 502125795a49 |
| physics-orthogonal-wiring | 3 | yes | 7181.66 | 6948.05 | 0.287 | 8 | 0 | 0 | 0 | 0 | 8da40286566e | 502125795a49 |

## Exact requests

### 직렬 회로 (`physics-series-circuit`)

160×90 mm 아트보드 안에 단순 직렬 회로를 구성해 줘. 왼쪽에 직류 전원 1개, 위쪽에 열린 스위치 1개, 오른쪽에 저항 1개, 아래쪽에 전구 1개를 놓고, 네 부품을 사각 루프의 검은 도선으로 끊김 없이 연결해. 문자·숫자·기호·라벨·화살표는 만들지 말고 장식과 명암도 넣지 마.

Full wrapped model input SHA-256: `3a03e47f4b9aa4fdc5345d05849d2f08316096fc68460e31843953454b192ef7`. The full exact wrapped input and every raw response are preserved in `fast-scene-repeatability.v1.json`.

### 도르래와 용수철 (`physics-pulley-spring`)

160×90 mm 아트보드 중앙에 상단 고정 도르래 1개를 그리고 줄이 도르래를 지나 양쪽으로 수직으로 내려오게 해 줘. 왼쪽 줄 끝에는 직사각형 추 1개를 매달고, 오른쪽 줄 끝은 세로 용수철의 위쪽 끝에 연결하며 용수철 아래쪽 끝에는 같은 크기의 직사각형 추 1개를 매달아. 접촉과 연결 관계가 분명해야 한다. 문자·숫자·기호·라벨·화살표·그림자는 만들지 마.

Full wrapped model input SHA-256: `ca5d5bf78007cfb883337419dc66ab3672dcc11c1b9e5b40b16b4c3846c87912`. The full exact wrapped input and every raw response are preserved in `fast-scene-repeatability.v1.json`.

### 관측 장치의 렌즈와 거울 (`earth-observatory-optics`)

지구과학 관측 장치의 광학 부품 배치를 160×90 mm 아트보드에 단순화해 줘. 가로 광축을 따라 왼쪽에 큰 볼록렌즈 1개, 중앙 오른쪽에 45도로 기울어진 평면거울 1개, 가장 오른쪽에 세로 스크린 1개를 서로 겹치지 않게 놓아. 이 요구는 lens_mirror_screen_bench 고정 fixture와 정확히 일치하므로, 해당 motif 하나만 사용하고 options에는 lensKind=convex_lens와 mirrorRotation=45만 넣어. 세 부품은 모두 optics 요소로 작성해야 하며, 특히 평면거울은 반드시 type=optics, opticsKind=plane_mirror, rotation=45인 요소로 만들고 일반 line·polyline·curve로 대체하지 마. 광선 화살표와 문자·숫자·기호·라벨은 그리지 말고, 검은 선과 필요한 최소 회색만 사용해.

Full wrapped model input SHA-256: `0bed611e4e4420206f1d18351bab24317d9c04e5b311fd440398f7b832ddc35f`. The full exact wrapped input and every raw response are preserved in `fast-scene-repeatability.v1.json`.

### 용기와 입자 (`chemistry-vessel-particles`)

160×90 mm 아트보드에 서로 떨어진 두 용기를 배치해 줘. 왼쪽에는 액체가 높이의 약 45%까지 담긴 비커 1개를 놓고, 오른쪽에는 기체 입자 16개가 고르게 퍼진 밀폐 직사각형 입자 용기 1개를 놓아. 이 요구는 vessel_particle_comparison 고정 fixture와 정확히 일치하므로, 해당 motif 하나만 사용하고 options에는 vesselKind=beaker, liquid=0.45, particleState=gas, particleCount=16, particleShape=circle, mix=false만 넣어. 입자는 원형이고 운동 화살표는 없어야 한다. 문자·숫자·기호·라벨·그림자·광택은 만들지 마.

Full wrapped model input SHA-256: `348b568ae578552e5707d287da13a9d9e0db2452252cc0145997d8cc18dd2710`. The full exact wrapped input and every raw response are preserved in `fast-scene-repeatability.v1.json`.

### 개체군 변화 그래프 (`biology-population-graph`)

160×90 mm 아트보드 중앙에 시간에 따른 개체군 크기의 S자형 증가를 나타내는 그래프 1개를 구성해 줘. 축은 숫자·문자·화살표가 없는 검은 선이고 격자는 사용하지 마. 한 개의 매끄러운 곡선은 왼쪽 아래에서 시작해 중앙에서 빠르게 증가하고 오른쪽 위에서 완만하게 수평에 가까워져야 한다. 다른 장치는 추가하지 마.

Full wrapped model input SHA-256: `866c99b7068b17e5adfa4fdaf94bfb765819ec77f99812f2b824e95ac058b826`. The full exact wrapped input and every raw response are preserved in `fast-scene-repeatability.v1.json`.

### 3단계 입자 패널 흐름 (`chemistry-panel-flow`)

감사된 panel_flow 모티프 하나만 사용해 3단계 입자 상태 비교를 만들어 줘. panelType은 particlebox, panelCount는 3으로 하고, 왼쪽부터 기체 12개, 액체 12개, 고체 12개 상태를 사용해. 패널 사이에는 평범한 연결선만 두고 화살표·문자·숫자·기호·라벨은 넣지 마. 모티프 요청은 장면의 유일한 요소여야 한다.

Full wrapped model input SHA-256: `b8568a9a6fcf75fdb36bf049a050f96184637d5772da2f6d104ba165aaeda893`. The full exact wrapped input and every raw response are preserved in `fast-scene-repeatability.v1.json`.

### 생물 지표 이중축 (`biology-dual-axis`)

감사된 dual_axis_plot 모티프 하나만 사용해 같은 시간축에서 두 생물 지표가 변하는 이중 y축 그래프를 만들어 줘. xRange는 [0,10], leftRange는 [0,10], rightRange는 [0,100], tickCount는 5로 하고, 왼쪽 계열은 4개 이상 점으로 증가 후 감소, 오른쪽 계열은 4개 이상 점으로 완만히 증가하게 해. 숫자·문자·기호·라벨·화살표는 넣지 말고 모티프 요청은 장면의 유일한 요소여야 한다.

Full wrapped model input SHA-256: `3104e8b7cdcad4c7070ba7cdd52340fc0e468f3df1e953be22b292ba325aa5c6`. The full exact wrapped input and every raw response are preserved in `fast-scene-repeatability.v1.json`.

### 등치선 묶음 (`earth-contour-bundle`)

감사된 contour_bundle 모티프 하나만 사용해 지구과학용 무라벨 등치선 묶음을 만들어 줘. variant는 nested, count는 5이고 충분한 바깥 여백을 남겨. 모든 선은 닫힌 검은 곡선이며 문자·숫자·기호·라벨·화살표·채움은 없어야 한다. 모티프 요청은 장면의 유일한 요소여야 한다.

Full wrapped model input SHA-256: `d12c970e61d2f36dd67272ef29b0b99452d9b492d94a4dc8410ea95e94ccfa86`. The full exact wrapped input and every raw response are preserved in `fast-scene-repeatability.v1.json`.

### 직교 배선 (`physics-orthogonal-wiring`)

감사된 orthogonal_wiring 모티프 하나만 사용해 직교 배선 골격을 만들어 줘. 네 노드를 아트보드 안의 직사각형 네 모서리 부근에 놓고 네 변을 수평·수직 선으로 닫힌 회로처럼 연결해. showNodes는 true로 하고 대각선, 문자·숫자·기호·라벨·화살표는 넣지 마. 모티프 요청은 장면의 유일한 요소여야 한다.

Full wrapped model input SHA-256: `c0402a65e3461bde332506f7f5fba56a1b7a49fd74b3b881f6983dc4e3531e32`. The full exact wrapped input and every raw response are preserved in `fast-scene-repeatability.v1.json`.

## Re-run

```powershell
node desktop/benchmark-scene-repeatability.cjs
node desktop/benchmark-scene-repeatability.cjs --verify
# Re-run only one failed case while preserving other cases:
node desktop/benchmark-scene-repeatability.cjs --case physics-series-circuit
```

