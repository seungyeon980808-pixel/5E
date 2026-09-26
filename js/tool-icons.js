/* ===== TOOL ICONS: 팔레트 버튼 아이콘 정본 (2026-07-27 교사 확정) =====
 *
 * 왜 따로 두나
 *   예전에는 대부분의 아이콘을 **렌더러 출력을 그대로 축소해서** 썼다. 22px로 줄이면
 *   선이 사라지고 면이 뭉개져 무슨 도구인지 알아볼 수 없었다(교사 지적). 그래서 팔레트
 *   전용으로 다시 그렸다. templates.js에 넣으면 그 파일이 비대해지므로 분리한다.
 *
 * 설계 규칙 ("기호형")
 *   · viewBox 20×20, 사방 여백 2 이상. 중심(10,10)에서 크게 벗어나지 않게.
 *   · 주선 1.5 / 보조선 1.05 / 실선 0.8. 22px에서 선이 사라지지 않는 최소 굵기다.
 *   · 채움은 **극성·초점처럼 뜻이 있을 때만**. 나머지는 전부 선.
 *   · 회로는 교과서 기호 그대로. 글자는 전류계·전압계·미지소자·자석·저울에만.
 *   · 색은 currentColor — 라이트/다크/과목 테마를 그대로 따라간다.
 *
 * 여기 없는 id는 templates.js의 기존 경로(렌더러 자동 생성 등)로 넘어간다.
 * 저항(resistor)은 교사 판단으로 기존 아이콘을 그대로 쓴다 → 일부러 넣지 않는다.
 */

/* 굵기 3단계. 주선(1.5)은 공통 도구 아이콘(index.html, stroke-width 1.5)과 같은 값이다.
 * 보조선·실선은 처음에 1.05 / 0.8 로 잡았더니 화면에서 0.68~0.85px 까지 내려가,
 * 요소 수가 적고 전부 1.5 인 공통 도구 옆에서 아이콘이 가벼워 보였다(교사 지적).
 * 주선은 그대로 두고 얇은 쪽만 올렸다(2026-07-27 확정). */
const S    = 'stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"';
const S2   = 'stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.25"';
const HAIR = 'stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1"';

const DOT = (x, y, r = 1.8) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor"/>`;
const RING = (x, y, r = 1.5) => `<circle cx="${x}" cy="${y}" r="${r}" ${S2}/>`;
const TXT = (t, size = 9.5, x = 10, y = 10) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-family="serif" text-anchor="middle" dominant-baseline="central" fill="currentColor">${t}</text>`;

/* 화살촉 — (x,y)에 각도 a(도) 방향. 굵은 것(AH)과 얇은 것(AHT) 두 가지. */
function head(x, y, a, len, style) {
  const r = a * Math.PI / 180, s = 145 * Math.PI / 180;
  const p = (k) => `${(x + len * Math.cos(r + k)).toFixed(2)} ${(y + len * Math.sin(r + k)).toFixed(2)}`;
  return `<path d="M${p(s)} L${x} ${y} L${p(-s)}" ${style}/>`;
}
const AH = (x, y, a, len = 2.2) => head(x, y, a, len, S2);
const AHT = (x, y, a, len = 1.7) => head(x, y, a, len, HAIR);

/* 중심에서 뻗는 방사선 + 화살촉 — 점전하용. */
function RAY(a, r0, r1, arrow) {
  const r = a * Math.PI / 180;
  const x0 = 10 + r0 * Math.cos(r), y0 = 10 + r0 * Math.sin(r);
  const x1 = 10 + r1 * Math.cos(r), y1 = 10 + r1 * Math.sin(r);
  return `<path d="M${x0.toFixed(2)} ${y0.toFixed(2)} L${x1.toFixed(2)} ${y1.toFixed(2)}" ${HAIR}/>` +
         (arrow ? AHT(x1, y1, a, 1.7) : "");
}

/* 감긴 코일 — 기울인 원을 이어 그린다. sin으로 시작하므로 **양 끝이 중심선(cy)에서 빠진다**
 * (지그재그로 그리면 저항처럼 보인다는 교사 지적). 용수철은 4회·크게, 코일(inductor)은
 * 3회·작게 감아 둘이 한눈에 갈리게 했다. */
function coil(x0, x1, cy, turns, R) {
  const n = turns * 26;
  let d = "";
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * turns * 2 * Math.PI;
    const x = x0 + (x1 - x0) * (i / n) + R * 0.5 * Math.cos(t);
    const y = cy + R * Math.sin(t);
    d += (i ? " L" : "M") + x.toFixed(2) + " " + y.toFixed(2);
  }
  return d;
}

/* id → viewBox "0 0 20 20" 안의 내용 마크업. */
export const TOOL_ICONS = {
  /* ---------- 역학 ---------- */
  pulley:
    `<circle cx="10" cy="10" r="6.8" ${S}/>${DOT(10, 10)}`,
  pulley_ceiling:
    `<path d="M3.5 3 H16.5 M10 3 V5.5" ${S}/><circle cx="10" cy="11" r="5.2" ${S}/>${DOT(10, 11, 1.5)}`,
  spring:
    `<path d="M1.5 10 H5.6 M14.4 10 H18.5" ${S}/><path d="${coil(5.6, 14.4, 10, 4, 4.3)}" ${S}/>`,
  pendulum:
    `<path d="M4 3.5 H16 M10 3.5 L13.4 12.6" ${S}/>${DOT(14, 14.6, 2.7)}`,
  cart:
    `<path d="M2.5 7.5 H17.5 V11.5 H2.5 Z" ${S}/>` +
    `<circle cx="6.6" cy="15" r="2.2" ${S2}/><circle cx="13.4" cy="15" r="2.2" ${S2}/>`,
  clamp:
    `<path d="M4 18 H12 M8 18 V3.5 M8 7 H15.5 M15.5 5 V9" ${S}/>`,
  /* 저울 = 캔버스 렌더러(optics-apparatus.js drawScale)와 같은 디지털 저울:
     상판 + 본체 + 숫자 표시창 + 버튼 2개 + 발. 표시창의 숫자가 저울임을 말해 준다. */
  scale:
    `<path d="M6.2 2.4 H13.8 V4 H6.2 Z" ${S2}/><path d="M7 5 H13" ${HAIR}/>` +
    `<path d="M2.4 5.8 H17.6 V15.4 H2.4 Z" ${S}/>` +
    `<path d="M4 8.2 H11.4 V12.6 H4 Z" ${S2}/>` +
    `<text x="7.7" y="10.4" font-size="3.6" font-family="monospace" text-anchor="middle" dominant-baseline="central" fill="currentColor">0.9</text>` +
    DOT(13.6, 10.4, 0.85) + DOT(15.8, 10.4, 0.85) +
    `<path d="M4.6 15.4 V17.4 M15.4 15.4 V17.4" ${S2}/>`,
  /* 입체: 보이는 변을 **모두** 닫는다. 예전엔 오른쪽 옆면의 뒤 세로변·아래 빗변이 빠져
     "그리다 만" 모양이었다. */
  solid_box:
    `<path d="M3.5 8.5 H13.5 V17 H3.5 Z" ${S}/>` +
    `<path d="M3.5 8.5 L7.5 4.5 H17.5 L13.5 8.5 M13.5 17 L17.5 13 V4.5" ${S}/>`,
  solid_slab:
    `<path d="M2 11.5 H13.5 V15.5 H2 Z" ${S}/>` +
    `<path d="M2 11.5 L6 7.5 H17.5 L13.5 11.5 M13.5 15.5 L17.5 11.5 V7.5" ${S}/>`,
  solid_cylinder:
    `<ellipse cx="10" cy="5.5" rx="4.6" ry="2" ${S}/>` +
    `<path d="M5.4 5.5 V14.5 A4.6 2 0 0 0 14.6 14.5 V5.5" ${S}/>`,
  solid_disk:
    `<ellipse cx="10" cy="9.5" rx="7.4" ry="3.2" ${S}/>` +
    `<path d="M2.6 9.5 V12.2 A7.4 3.2 0 0 0 17.4 12.2 V9.5" ${S}/>`,
  solid_wedge:
    `<path d="M2.5 16.5 H17.5 L2.5 6.5 Z" ${S}/>`,
  solid_desk:
    `<path d="M2 8.5 H14 V11 H2 Z" ${S}/>` +
    `<path d="M2 8.5 L5.5 5.5 H17.5 L14 8.5 M14 11 L17.5 8 V5.5" ${S}/>` +
    `<path d="M3.4 11 V17.5 M12.6 11 V17.5 M16.1 9.5 V16" ${S}/>`,
  solid_plane:
    `<path d="M1.5 15 L7 5 H18.5 L13 15 Z" ${S}/>`,
  /* 3차원 좌표축: 깊이축은 화면 **안으로 들어가지 않고 밖으로 나온다**(왼쪽 아래). */
  solid_axes3d:
    `<path d="M7.6 11.6 V3.2 M7.6 11.6 H17.2 M7.6 11.6 L2.8 17" ${S}/>` +
    AH(7.6, 3.2, -90, 2.1) + AH(17.2, 11.6, 0, 2.1) + AH(2.8, 17, 132, 2.1),
  /* 평면 위 좌표축·원호: 평면을 크게, 테두리는 0.8로 얇게. 안쪽 오브젝트가 테두리와
     겹치지 않도록 여백 1.0 이상을 두고 좌표를 잡았다(실측 확인). 깊이축의 방향은
     평행사변형 왼쪽 모서리와 **평행**해야 평면 위에 누운 것으로 보인다. */
  solid_axesgnd:
    `<path d="M1 16.5 L6.2 6.5 H19 L13.8 16.5 Z" ${HAIR}/>` +
    `<path d="M6 13.6 H12.8" ${S}/>${AH(12.8, 13.6, 0, 1.6)}` +
    `<path d="M6 13.6 L8.34 9.1" ${S}/>${AH(8.34, 9.1, -62.5, 1.6)}`,
  groundarc:
    `<path d="M1 16.5 L6.2 6.5 H19 L13.8 16.5 Z" ${HAIR}/>` +
    `<path d="M5 13.8 A14 8 0 0 1 13.6 9.8" ${S}/>${DOT(5, 13.8, 1.1)}${DOT(13.6, 9.8, 1.1)}`,
  parabola:
    `<path d="M3 16.8 Q10 -1.5 17 16.8" ${S}/>${DOT(10, 4.5, 1.6)}` +
    `<path d="M2.5 18 H17.5" ${S2} stroke-dasharray="1.8 1.4"/>`,

  /* ---------- 전자기학 ---------- */
  /* 도선: 사선으로 눕히면 같은 20×20 안에서 가로보다 길어 보인다. */
  wire:
    `<path d="M2.66 17.38 L18.66 5.38 M1.34 15.62 L17.34 3.62" ` +
    `stroke="currentColor" fill="none" stroke-linecap="round" stroke-width="0.85"/>`,
  compass:
    `<circle cx="10" cy="10" r="8.3" ${S2}/>` +
    `<path d="M13.6 6.4 L11.3 11.3 L6.4 13.6 L8.7 8.7 Z" ${S2}/>` +
    `<path d="M13.6 6.4 L11.3 11.3 L8.7 8.7 Z" fill="currentColor" stroke="none"/>`,
  /* 점전하: 전하에 부호(+)를 넣고 방사선 화살표는 **바깥쪽** — 교과서 표준. */
  ef_single:
    `<circle cx="10" cy="10" r="2.7" ${S2}/>` +
    `<path d="M8.6 10 H11.4 M10 8.6 V11.4" ${HAIR}/>` +
    [0, 45, 90, 135, 180, 225, 270, 315].map((a) => RAY(a, 4, 8.6, true)).join(""),
  /* 두 전하(쌍극자): +에서 나와 −로 들어간다. 화살촉은 곡선의 중점에 접선 방향으로. */
  ef_pair:
    `<circle cx="4.4" cy="10" r="2.5" ${S2}/><path d="M3 10 H5.8 M4.4 8.6 V11.4" ${HAIR}/>` +
    `<circle cx="15.6" cy="10" r="2.5" ${S2}/><path d="M14.2 10 H17" ${HAIR}/>` +
    `<path d="M6.9 10 H13.1" ${HAIR}/>${AHT(10.6, 10, 0)}` +
    `<path d="M5.6 7.7 Q10 2.6 14.4 7.7" ${HAIR}/>${AHT(10.6, 5.15, 0)}` +
    `<path d="M5.6 12.3 Q10 17.4 14.4 12.3" ${HAIR}/>${AHT(10.6, 14.85, 0)}`,
  /* 평행판 균일장: 캔버스 렌더러(render/field.js "uniform")를 본떴다 —
     판 두 장 + 사이를 채우는 곧은 화살표 + 좌측 부호. */
  ef_uniform:
    `<path d="M4 3.4 H18 V5.2 H4 Z M4 14.8 H18 V16.6 H4 Z" fill="currentColor" fill-opacity=".22" ${S2}/>` +
    [7.2, 11, 14.8].map((x) => `<path d="M${x} 6 V13.2" ${HAIR}/>` + AHT(x, 14.5, 90)).join("") +
    TXT("+", 4.6, 2.4, 4.3) + TXT("−", 4.6, 2.4, 15.7),
  /* 막대자석: 두 극을 명암으로 갈라 칠하고 N·S를 크게 — 자석임이 바로 읽히게. */
  mag_bar:
    `<path d="M10 7.6 H15.6 V12.4 H10 Z" fill="currentColor" fill-opacity=".42" stroke="none"/>` +
    `<path d="M4.4 7.6 H15.6 V12.4 H4.4 Z M10 7.6 V12.4" ${S}/>` +
    TXT("N", 4.2, 7.2, 10) + TXT("S", 4.2, 12.8, 10) +
    `<path d="M5.2 6.8 Q10 0.9 14.8 6.8" ${HAIR}/>${AHT(10, 3.85, 0)}` +
    `<path d="M5.2 13.2 Q10 19.1 14.8 13.2" ${HAIR}/>${AHT(10, 16.15, 0)}`,
  /* 도선 자기장: 세로 도선 + 동심원, 회전 방향은 오른손 법칙. */
  mag_wire:
    `<path d="M10 1 V19" ${S}/>${AH(10, 1.6, -90, 2)}` +
    `<ellipse cx="10" cy="10" rx="7.6" ry="3" ${HAIR}/><ellipse cx="10" cy="10" rx="4.2" ry="1.7" ${HAIR}/>` +
    AHT(2.4, 10, 90) + AHT(5.8, 10, 90),

  /* ---------- 회로 (resistor는 기존 아이콘 유지 → 일부러 없음) ---------- */
  inductor:
    `<path d="M1.5 10 H5.5 M14.5 10 H18.5" ${S}/><path d="${coil(5.5, 14.5, 10, 3, 3.0)}" ${S}/>`,
  capacitor:
    `<path d="M1.5 10 H8.4 M11.6 10 H18.5 M8.4 5 V15 M11.6 5 V15" ${S}/>`,
  dc_source:
    `<path d="M1.5 10 H7 M11.5 10 H18.5 M7 4.5 V15.5 M11.5 7.5 V12.5" ${S}/>`,
  ac_source:
    `<circle cx="10" cy="10" r="6" ${S2}/><path d="M6.6 10 Q8.3 6.4 10 10 T13.4 10" ${S}/>`,
  /* 전구: ANSI 필라멘트형(원 안에 고리). IEC의 원+X보다 전구로 읽힌다는 교사 판단. */
  lamp:
    `<circle cx="10" cy="10" r="5.6" ${S}/>` +
    `<path d="M6.6 12.4 L8.4 8.6 A1.8 1.8 0 0 1 11.6 8.6 L13.4 12.4" ${S2}/>` +
    `<path d="M1.5 10 H4.4 M15.6 10 H18.5" ${S2}/>`,
  ammeter:
    `<circle cx="10" cy="10" r="6.4" ${S}/>${TXT("A")}`,
  voltmeter:
    `<circle cx="10" cy="10" r="6.4" ${S}/>${TXT("V")}`,
  diode:
    `<path d="M1.5 10 H7 M14 10 H18.5" ${S2}/>` +
    `<path d="M7 5.4 L14 10 L7 14.6 Z" ${S}/><path d="M14 5.4 V14.6" ${S}/>`,
  unknown:
    `<path d="M1.5 10 H4.5 M15.5 10 H18.5" ${S2}/>` +
    `<path d="M4.5 6.2 H15.5 V13.8 H4.5 Z" ${S}/>${TXT("?", 8.5)}`,
  /* 스위치: 실제 회로도 표기 — 단자는 빈 원, 지렛대는 왼쪽 단자에 물려 열려 있고
     오른쪽 단자를 조금 지나 끝난다(칼날 스위치의 날). */
  sw_open:
    `<path d="M1.5 14 H5.4 M14.6 14 H18.5" ${S2}/>` +
    RING(6.6, 14, 1.2) + RING(13.4, 14, 1.2) +
    `<path d="M6.1 12.9 L14.2 7.6" ${S}/>`,
  sw_spdt:
    `<path d="M1.5 10 H4.6 M15.4 6 H18.5 M15.4 14 H18.5" ${S2}/>` +
    RING(5.8, 10, 1.2) + RING(14.2, 6, 1.2) + RING(14.2, 14, 1.2) +
    `<path d="M5.6 8.9 L14.6 4.7" ${S}/>`,

  /* ---------- 광학 ---------- */
  convex_lens:
    `<path d="M10 2.5 Q14.8 10 10 17.5 Q5.2 10 10 2.5 Z" ${S}/>`,
  concave_lens:
    `<path d="M6 2.5 H14 Q10 10 14 17.5 H6 Q10 10 6 2.5 Z" ${S}/>`,
  /* 거울: 뒷면을 옅게 채워 반사면을 구분하고, 광축 점선과 초점을 함께 둔다.
     볼록은 왼쪽으로, 오목은 오른쪽으로 부풀어 둘이 갈린다. */
  convex_mirror:
    `<path d="M8.6 2.5 Q4.2 10 8.6 17.5 L11 17.5 Q6.6 10 11 2.5 Z" fill="currentColor" fill-opacity=".22" ${S2}/>` +
    `<path d="M4.4 10 H18.5" ${HAIR} stroke-dasharray="1.6 1.3"/>${DOT(15.6, 10, 1)}`,
  concave_mirror:
    `<path d="M11.4 2.5 Q15.8 10 11.4 17.5 L9 17.5 Q13.4 10 9 2.5 Z" fill="currentColor" fill-opacity=".22" ${S2}/>` +
    `<path d="M1.5 10 H15.6" ${HAIR} stroke-dasharray="1.6 1.3"/>${DOT(4.4, 10, 1)}`,
  plane_mirror:
    `<path d="M9 2.5 V17.5" ${S}/>` +
    `<path d="M9 5 L12.4 2.6 M9 9 L12.4 6.6 M9 13 L12.4 10.6 M9 17 L12.4 14.6" ${S2}/>`,
  object_arrow:
    `<path d="M10 17.5 V3 M10 3 L7.3 6 M10 3 L12.7 6" ${S}/><path d="M5.5 17.5 H14.5" ${S2}/>`,
  screen:
    `<path d="M8.6 2.5 H11.4 V17.5 H8.6 Z" fill="currentColor" stroke="none"/>`,
  point_light:
    `${DOT(10, 10, 2.6)}` +
    `<path d="M10 5.6 V2.2 M10 14.4 V17.8 M5.6 10 H2.2 M14.4 10 H17.8 ` +
    `M6.9 6.9 L4.5 4.5 M13.1 13.1 L15.5 15.5 M13.1 6.9 L15.5 4.5 M6.9 13.1 L4.5 15.5" ${S2}/>`,
  /* 정상파 3종: 파형은 같고 끝단 처리로만 구분한다 — 줄은 양끝 점, 열린관은 위아래 관벽,
     닫힌관은 오른쪽이 막힌다. */
  stw_string:
    `<path d="M2 10 Q6 3.4 10 10 T18 10" ${S}/>` +
    `<path d="M2 10 Q6 16.6 10 10 T18 10" ${S} opacity=".45"/>${DOT(2, 10, 1.5)}${DOT(18, 10, 1.5)}`,
  stw_open:
    `<path d="M2 4 H18 M2 16 H18" ${S2}/>` +
    `<path d="M2 10 Q6 5 10 10 T18 10" ${S}/><path d="M2 10 Q6 15 10 10 T18 10" ${S} opacity=".45"/>`,
  stw_closed:
    `<path d="M2 4 H18 M2 16 H18 M18 4 V16" ${S2}/>` +
    `<path d="M2 10 Q6 5 10 10 T18 10" ${S}/><path d="M2 10 Q6 15 10 10 T18 10" ${S} opacity=".45"/>`,

  /* ===== 지구과학 (2026-07-31) — docs/EARTH_PARTS_SPEC.md =====
   * 렌더러 축소본을 쓰면 암상 무늬 넷이 전부 '빈 상자'로 보여 구분이 안 된다
   * (채움 패턴은 render()가 만드는 <defs>에 사는데 아이콘에는 그 defs가 없다).
   * 그래서 무늬를 아이콘 안에 직접 그린다 — 이 파일이 존재하는 이유 그대로다. */

  // 지질학: 상자 테두리 + 그 암석의 무늬. 무늬가 곧 정보라 무늬를 크게 성기게 넣는다.
  strata_lime:                                    // 벽돌(석회암)
    `<path d="M2.5 5 H17.5 V15 H2.5 Z" ${S2}/>` +
    `<path d="M2.5 10 H17.5 M10 5 V10 M6 10 V15 M14 10 V15" ${HAIR}/>`,
  strata_volc:                                    // v (화산암)
    `<path d="M2.5 5 H17.5 V15 H2.5 Z" ${S2}/>` +
    `<path d="M5 7.5 L7 10.5 L9 7.5 M11 7.5 L13 10.5 L15 7.5 M8 12 L10 15 L12 12" ${HAIR}/>`,
  strata_plut:                                    // + (심성암)
    `<path d="M2.5 5 H17.5 V15 H2.5 Z" ${S2}/>` +
    `<path d="M4.5 8 H8.5 M6.5 6 V10 M11.5 12 H15.5 M13.5 10 V14" ${HAIR}/>`,
  strata_shale:                                   // 가로줄(셰일)
    `<path d="M2.5 5 H17.5 V15 H2.5 Z" ${S2}/>` +
    `<path d="M2.5 8 H17.5 M2.5 11 H17.5 M2.5 13.5 H17.5" ${HAIR}/>`,
  unconformity:                                   // 부정합면 — 물결치는 접촉면
    `<path d="M2 12.5 Q5.5 8.5 9 12.5 T16 12.5 Q17.2 12.5 18 11.8" ${S2}/>` +
    `<path d="M2 6.5 H18" ${HAIR} opacity=".55"/>`,

  // 해양학
  isobath:                                        // 등수심선 — 선을 끊고 값이 앉는다
    `<path d="M2 13 Q6 6.5 8.6 9.2 M11.4 9.2 Q14 11.9 18 6" ${S2}/>` +
    TXT("50", 6, 10, 9.6),
  scalebar:                                       // 축척 막대 — 양 끝 세로 바
    `<path d="M3 12 H17 M3 9 V15 M17 9 V15" ${S2}/>` +
    `<path d="M6 5.5 H14" ${HAIR} opacity=".6"/>`,

  // 기상학: 전선 기호는 붙는 모양이 곧 이름이다 — 삼각(한랭) / 반원(온난)
  front_cold:
    `<path d="M2 14 H18" ${S2}/>` +
    `<path d="M4 14 L6.4 8.6 L8.8 14 Z M11 14 L13.4 8.6 L15.8 14 Z" fill="currentColor" ${S2}/>`,
  front_warm:
    `<path d="M2 14 H18" ${S2}/>` +
    `<path d="M4 14 A2.7 2.7 0 0 1 9.4 14 Z M11 14 A2.7 2.7 0 0 1 16.4 14 Z" fill="currentColor" ${S2}/>`,
  front_stat:                                     // 정체 — 삼각과 반원이 반대쪽으로
    `<path d="M2 10 H18" ${S2}/>` +
    `<path d="M3.5 10 L5.9 4.6 L8.3 10 Z" fill="currentColor" ${S2}/>` +
    `<path d="M11 10 A2.7 2.7 0 0 0 16.4 10 Z" fill="currentColor" ${S2}/>`,
  front_occl:                                     // 폐색 — 같은 쪽에 번갈아
    `<path d="M2 14 H18" ${S2}/>` +
    `<path d="M3.5 14 L5.9 8.6 L8.3 14 Z" fill="currentColor" ${S2}/>` +
    `<path d="M10.5 14 A2.7 2.7 0 0 1 15.9 14 Z" fill="currentColor" ${S2}/>`,
  isobar:                                         // 등압선 — 폐곡선 + 값
    `<path d="M10 3.6 Q17 6 16.6 10 Q16 15 10 16.4 Q4 15 3.4 10 Q3 6.6 8.4 4.2" ${S2}/>` +
    TXT("H", 7, 10, 10.2),

  // 천문학: 산점 — 점만 뿌린다(●/○로 두 자료를 구분한다)
  scatter:
    DOT(4.5, 14.5, 1.5) + DOT(8, 10.5, 1.5) + DOT(11.5, 12.5, 1.5) +
    DOT(14, 6.5, 1.5) + DOT(16.5, 9.5, 1.5) + DOT(6.5, 6, 1.5),
  scatter_o:
    RING(4.5, 14.5, 1.6) + RING(8, 10.5, 1.6) + RING(11.5, 12.5, 1.6) +
    RING(14, 6.5, 1.6) + RING(16.5, 9.5, 1.6),
};
