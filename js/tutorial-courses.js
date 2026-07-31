/* ===== TUTORIAL COURSES (따라하기 커리큘럼 — 내용만) =====
 *
 * 연출 엔진(tutorial.js)과 내용을 분리해 둔다: 설명 문구만 고칠 때 화면 코드를
 * 안 건드리게. (HwpPalette 가 help_ui.py / help_content.py 를 나눈 것과 같은 원칙.)
 *
 * 코스 = { id, title, desc, minutes, practice, next[], steps[] }
 *   practice: true 면 시작할 때 '따라하기 연습' 페이지를 만들고 끝나면 정리를 묻는다.
 *   next:     다 끝냈을 때 이어서 추천할 코스 id.
 *
 * 단계 = { target, title, text, action, wait }
 *   target: () => 선택자(또는 요소) 하나 또는 배열. 함수인 이유는 tutorial.js 주석 참고.
 *           눌러야 할 곳과 결과가 보이는 곳이 떨어져 있으면 배열로 둘 다 짚는다.
 *   action: 이 단계로 들어올 때 한 번 실행(개수 기록 등). ctx 를 받아 단계끼리 값을 넘긴다.
 *   wait:   { click: 선택자 }  — 그 자리를 실제로 눌러야 넘어간다
 *           { until: (ctx)=>bool } — 조건이 참이 될 때까지 기다린다
 *           hint 로 안내 문구를 바꿀 수 있다.
 *
 * 문체: 존댓말, 짧은 단락, 글머리표는 '·'. 표는 쓰지 않는다.
 */

import {
  state, DEFAULT_TEXT_SIZE_MM, DEFAULT_TEXT_FONT,
  EQUATION_FONT_FAMILY, OBJECT_LABEL_TEXT_FONT_FAMILY,
} from "./state.js?v=1.4.0";
import { makeLine, makePolyline, setActiveTool, DEFAULT_STROKE_WIDTH } from "./tools.js?v=1.4.0";
import { TEMPLATES } from "./templates.js?v=1.4.0";
import { NODE_DEFAULT_SIZE } from "./tools/node-placement.js?v=1.4.0";
import { applyNewObjectStyleDefaults } from "./style-mode.js?v=1.4.0";

const objects = () => state.get().objects || [];

/* 화면에 실제로 보이는 요소만 돌려준다.
 * 5E 의 팝오버·접힌 패널은 닫혀 있어도 DOM 에는 그대로 남아 있다. querySelector 로
 * 찾히는 것만 믿고 대상으로 넘기면 크기 0 인 유령을 짚게 되고, 그러면 구멍이 아예
 * 안 생겨 튜토리얼이 멈춘 것처럼 보인다(빗면 코스에서 '텍스트'를 못 고르던 원인). */
function vis(sel) {
  const el = typeof sel === "string" ? document.querySelector(sel) : sel;
  if (!el || !el.isConnected) return null;
  const r = el.getBoundingClientRect();
  return (r.width > 0 && r.height > 0 && el.offsetParent !== null) ? el : null;
}

/* id 가 없는 버튼을 글자로 찾는다. 5E 에는 동적으로 만들어져 id 가 없는 단추가 있다
 * (이미지 지우기, 전체 통일/수정의 정렬·간격 줄 등). 화면에 보이는 것만 돌려준다. */
function byText(text, scope = document) {
  const els = [...scope.querySelectorAll("button, label, .modal-btn")];
  return els.find((e) => e.textContent.trim() === text && vis(e)) || null;
}
// '전체 통일/수정' 창의 정렬·간격 줄(순서 고정: 좌우정렬·상하정렬·좌우간격·상하간격·깊이간격)
function bulkRow(i) {
  return vis(`#bulk-gap-rows > label:nth-child(${i + 1})`);
}

/* ===== 자동 배치 =====
 * "사각형을 미리 띄워 놓고 다루는 것부터" 시키기 위한 헬퍼(사용자 요구).
 * 앱이 실제로 쓰는 생성 경로(applyNewObjectStyleDefaults)를 그대로 태워, 손으로 그린 것과
 * 완전히 같은 객체가 되게 한다 — 안 그러면 선택·스냅·내보내기에서 미묘하게 다르게 논다.
 * 이미 같은 것이 있으면 다시 만들지 않는다([이전]으로 돌아왔다 와도 두 벌이 되지 않게). */
function placeObjects(list, { allowDup = false } = {}) {
  state.update((s) => {
    const snap = JSON.parse(JSON.stringify(s.objects));
    let added = 0;
    for (const o of list) {
      // 같은 종류가 이미 있으면 건너뛴다([이전]으로 돌아왔다 와도 두 벌이 안 되게).
      // 같은 종류를 여러 개 놓아야 하는 코스(정렬 실습)는 allowDup 으로 푼다.
      if (!allowDup && s.objects.some((x) => x.type === o.type)) continue;
      s.objects.push({ ...o, id: `tut_${o.type}_${s.objects.length}_${added}`, layerId: s.activeLayerId || 1 });
      added += 1;
    }
    if (added) { s.undoStack.push(snap); s.redoStack = []; s.selectedIds = []; }
  });
}

// 손으로 그렸을 때와 같은 기본 스타일이 붙은 사각형/직선을 만든다.
// 연습용으로 놓아 주는 것은 회색으로 채운다 — 흰 채움이면 흰 아트보드에서
// 테두리만 보여 '뭘 잡아야 하는지' 알기 어렵다(사용자 지적).
function newRect(x, y, w, h, gray = 205) {
  return applyNewObjectStyleDefaults({
    type: "rect", x, y, w, h, rotation: 0,
    strokeWidth: DEFAULT_STROKE_WIDTH,   // 기본 0.2mm — 안 주면 굵게 나온다(사용자 지적)
    fillNone: false, fillLevel: gray, fillStyle: "solid",
  });
}
function newLine(a, b) {
  const l = makeLine(a, b);
  delete l.id;
  return l;
}
/* 텍스트는 필드를 빠뜨리면 안 된다 — fontSize 를 안 주면 기본값이 안 먹어 글자가
 * 터무니없이 크게 나온다(실제로 그랬다). text-editor.js 가 새 글자를 만들 때 채우는
 * 필드를 그대로 맞춘다. */
function newText(x, y, text, size = DEFAULT_TEXT_SIZE_MM) {
  return applyNewObjectStyleDefaults({
    type: "text", x, y, text,
    source: text, contentMode: "plain",
    fontSize: size, fontFamily: DEFAULT_TEXT_FONT,
    fontWeight: "normal", fontStyle: "normal",
    italic: false, underline: false, strikeout: false, rotation: 0,
  });
}
const objectCount = () => objects().length;
const countOf = (type) => objects().filter((o) => o.type === type).length;

/* ===== 빗면 그림의 도면 (world mm) =====
 * 아트보드 기본값 90×60 → x −45..45, y −30..30 (y 는 아래로 증가).
 * 안내선과 완성 미리보기가 같은 값을 쓰도록 한곳에 모아 둔다.
 *
 * 직각삼각형 도구는 '왼쪽 세로변 + 아래 가로변 + 왼위에서 오른아래로 내려오는 빗변'
 * 으로 그려진다(index.html 의 아이콘 경로와 같은 모양) — 그래서 물체는 오른쪽 아래로
 * 미끄러지는 그림이 된다. */
const FIG = {
  // 바닥 수평면 — 맨 먼저 그린다. 나머지는 여기에 붙여 나간다.
  ground: [[-38, 20], [38, 20]],
  // '수평면' 글자 자리. 글자는 이 점에서 오른쪽으로 흐르므로(기준점=왼쪽 아래),
  // 3.7mm 글씨 세 자 ≒ 12mm 를 더해도 아트보드 오른쪽 끝(45)을 넘지 않게 잡는다.
  groundText: [19, 26],
  groundTextBox: [[18, 21.5], [32, 21.5], [32, 27], [18, 27]],
  // 빗면은 바닥에서 한참 띄운 자리에 그린 뒤 Shift 드래그로 내려 붙인다.
  // 5mm만 띄우면 "붙었나?" 싶게 미미해서 스냅의 손맛이 안 난다(사용자 지적) →
  // 14mm 띄워, 끌어내리다 마지막에 탁 붙는 것이 확실히 느껴지게 한다.
  wedgeDraw: [[-32, -18], [-32, 6], [8, 6]],
  wedgeFinal: [[-32, -4], [-32, 20], [8, 20]],
  // 물체는 빈 오른쪽 위에 정사각형으로 그린 뒤 빗면으로 끌어 붙인다.
  blockDraw: [[16, -22], [26, -22], [26, -12], [16, -12]],
};

/* 빗면에 '얹힌' 물체의 네 꼭짓점.
 * 축에 나란한 사각형을 그리면 빗면 위에 둥둥 떠 보인다(사용자 지적) — 실제 스냅은
 * 빗변 각도에 맞춰 눕히므로, 미리보기 점선도 눕은 모양이어야 그림이 말이 된다.
 * 빗변 방향으로 t 만큼 간 지점에서, 빗변에 나란한 변과 수직인 변으로 정사각형을 세운다. */
function blockOnSlope(size = 10, t = 0.42) {
  const [ax, ay] = FIG.wedgeFinal[0];          // 빗변 위 끝
  const [bx, by] = FIG.wedgeFinal[2];          // 빗변 아래 끝
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;          // 빗변 방향 단위벡터
  const nx = uy, ny = -ux;                     // 빗면 바깥쪽(위쪽) 법선
  const px = ax + ux * (len * t), py = ay + uy * (len * t);
  return [
    [px, py],
    [px + ux * size, py + uy * size],
    [px + ux * size + nx * size, py + uy * size + ny * size],
    [px + nx * size, py + ny * size],
  ];
}
FIG.blockFinal = blockOnSlope();

/* 완성된 빗면의 빗변(윗면). 사용자가 실제로 그린 삼각형 기준으로 계산한다 —
 * 점선에 딱 맞게 안 그렸어도 판정이 어긋나지 않도록. */
function wedgeSlope() {
  const t = objects().find((o) => o.type === "triangle");
  if (!t) return null;
  return { a: { x: t.x, y: t.y }, b: { x: t.x + t.w, y: t.y + t.h } };
}

// 점과 선분 사이 거리(mm).
function distToSegment(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
  const dx = p.x - (a.x + t * vx), dy = p.y - (a.y + t * vy);
  return Math.hypot(dx, dy);
}

/* ===== 코스 0: 시작 준비 =====
 * 무엇을 배우기 전에 화면부터 눈에 맞춘다. 글씨가 깨알같거나 헐렁한 채로 화면 소개를
 * 받으면 그 소개가 헛돌기 때문이다.
 *
 * 이 코스만의 특징:
 *   · 캔버스를 안 쓴다 → 연습 페이지를 만들지 않는다(practice: false).
 *   · 짚는 대상이 전부 화면 UI(버튼·메뉴 항목·슬라이더) → 커서 시연도 화면 좌표(at/onEl)를 쓴다.
 *   · 드롭다운·모달처럼 단계 도중에 생기는 대상이라, target 은 매 틱 다시 찾힌다(tutorial.js).
 */

const GETTING_READY = {
  id: "getting-ready",
  title: "시작 준비",
  desc: "내 눈에 맞는 화면부터 — 2분",
  minutes: 2,
  practice: false,
  next: ["basics"],
  steps: [
    {
      title: "반갑습니다",
      text:
        "5E는 시험지·학습지에 넣을 그림을 만드는 도구입니다.\n" +
        "배우기 전에 화면부터 눈에 맞추겠습니다. 30초면 됩니다.\n\n" +
        "· 글씨가 작거나 크면 무엇을 배워도 불편합니다\n" +
        "· 언제든 [그만]으로 나가고, [이전]으로 되돌아올 수 있습니다",
    },
    {
      target: () => "#settings-menu-btn",
      title: "위쪽 '설정'을 눌러 주세요",
      text:
        "화면 맨 위 줄에 있습니다. '파일' 바로 오른쪽이에요.\n\n" +
        "· 커서가 어디를 누르는지 보여 드리고 있습니다",
      demo: () => ({ kind: "clicks", at: ["#settings-menu-btn"] }),
      wait: { click: "#settings-menu-btn", hint: "설정을 눌러 주세요" },
    },
    {
      // 드롭다운이 열린 뒤에는 '환경 설정' 항목 하나만 짚는다. 설정 버튼까지 같이
      // 감싸면 상자가 메뉴 전체로 커져서 어디를 누를지 알 수 없다(사용자 지적).
      target: () => "#open-screen",
      title: "'환경 설정'을 눌러 주세요",
      text:
        "펼쳐진 목록에서 두 번째 항목입니다.\n\n" +
        "· 화면 크기·저장·라이브러리 설정이 이 창에 모여 있습니다",
      demo: () => ({ kind: "clicks", at: ["#open-screen"] }),
      wait: { click: "#open-screen", hint: "환경 설정을 눌러 주세요" },
    },
    {
      target: () => ["#pref-zoom", "#pref-zoom-val"],
      title: "슬라이더를 움직여 눈에 맞추세요",
      text:
        "끄는 즉시 글씨와 도구가 통째로 커지고 작아집니다. 편한 크기에서 손을 놓으세요.\n\n" +
        "· 따로 저장할 필요 없습니다 — 놓는 순간 저장돼서, 다음에 열어도 이 크기 그대로입니다\n" +
        "· 브라우저 확대(Ctrl+휠)와는 별개로, 5E 안에서만 적용됩니다",
      demo: () => ({ kind: "drag", onEl: "#pref-zoom", from: [0.30, 0.5], to: [0.72, 0.5] }),
      action: (ctx) => {
        // 얼마나 움직였는지 재려면 시작값이 필요하다. 되돌아왔을 때는 다시 잡지 않는다
        // (tutorial.js 가 revisiting 이면 action 을 건너뛴다).
        const el = document.getElementById("pref-zoom");
        ctx.zoom0 = el ? Number(el.value) : null;
      },
      wait: {
        until: (ctx) => {
          const el = document.getElementById("pref-zoom");
          if (!el || ctx.zoom0 == null) return false;
          return Math.abs(Number(el.value) - ctx.zoom0) >= 5;   // 5% 이상 움직이면 통과
        },
        hint: "슬라이더를 끌어 보세요",
      },
    },
    {
      target: () => "#pref-close",
      title: "이제 시작할 준비가 됐습니다",
      text:
        "'닫기'를 누르면 준비 끝입니다.\n\n" +
        "· 이 창의 다른 탭(도구·저장·라이브러리)은 나중에 필요할 때 만나면 됩니다\n" +
        "· 화면 크기는 언제든 여기서 다시 바꿀 수 있습니다",
      demo: () => ({ kind: "clicks", at: ["#pref-close"] }),
      wait: { click: "#pref-close", hint: "닫기를 눌러 주세요" },
    },
  ],
};

/* ===== 코스 1: 기초 조작 =====
 * 그리기를 시키지 않는다. 사각형·직선을 미리 놓아 두고 **다루는 법**부터 익힌다
 * (사용자 요구) — 고르고·옮기고·크기 바꾸고·돌리고·다듬는 리듬이 5E의 전부이기 때문.
 *
 * 통과 조건은 전부 '처음 놓아 둔 값'과 비교하는 절대 조건이다. 개수 기준선을 쓰면
 * [이전]으로 돌아왔을 때 기준선이 다시 잡혀 영영 통과할 수 없게 된다.
 */

// 코스 1이 자동으로 놓는 연습감의 처음 값 (world mm). 통과 판정의 기준이 된다.
const B = {
  rect: { x: -32, y: -12, w: 15, h: 11 },
  rectTarget: [[-8, -12], [7, -12], [7, -1], [-8, -1]],   // 옮겨 갈 자리
  rectBig: [[-8, -12], [15, -12], [15, 5], [-8, 5]],      // 키울 목표 크기(23×17)
  rectStroke: 0.4,
  line: { p1: { x: -32, y: 15 }, p2: { x: -12, y: 15 } },
  lineEnd: [12, 6],                                        // 끝점이 갈 자리
  // 화살표 겨냥 실습 — 세 곳을 차례로 짚는다(사용자 요구: 최소 3회 반복).
  aimSpots: [[30, -4], [30, 22], [-24, 22]],
};

// 겨냥할 자리를 동그라미(◎)처럼 보이게 하는 열두 각형.
function aimRing(c, r = 4) {
  return Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
  });
}

const rectObj = () => objects().find((o) => o.type === "rect");
const lineObj = () => objects().find((o) => o.type === "line");
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const BASICS = {
  id: "basics",
  title: "기초 조작",
  desc: "놓인 것을 고르고·옮기고·다듬기 — 그리기는 다음에",
  minutes: 8,
  practice: true,
  next: ["incline-figure"],
  steps: [
    {
      title: "화면은 다섯 구역입니다",
      text:
        "왼쪽은 도구, 가운데는 그림, 오른쪽은 속성, 아래는 페이지, 위는 파일과 설정.\n" +
        "지금부터 하나씩 짚어 드립니다.\n\n" +
        "· 연습용 페이지를 따로 만들어 두었습니다 — 원래 작업은 건드리지 않습니다",
    },
    {
      target: () => "#panel-left",
      title: "왼쪽 — 도구 서랍",
      text:
        "네 칸으로 나뉘어 있습니다.\n\n" +
        "· 공통 도구 — 선·도형·글자. 과목과 상관없이 늘 씁니다\n" +
        "· 과목별 오브젝트 — 빗면·도르래·회로처럼 과목 전용 부품\n" +
        "· 퍼스널 오브젝트 — 내가 저장해 둔 것\n" +
        "· 고급 기능 — 이미지 객체화, 전체 통일/수정 등\n\n" +
        "맨 위 과목 상자를 바꾸면 목록이 통째로 바뀝니다.",
    },
    {
      target: () => "#canvas",
      title: "가운데 — 시험지에 들어갈 딱 그 영역",
      text:
        "흰 판이 아트보드입니다. 여기 있는 것만 그림으로 나갑니다.\n\n" +
        "· 휠을 굴리면 확대·축소\n" +
        "· 스페이스바를 누른 채 끌면 화면 이동\n" +
        "· 지금 휠을 굴려 보셔도 됩니다 — 다음 단계에서 되돌리는 법을 배웁니다",
    },
    {
      target: () => "#center-view-btn",
      title: "헤맸을 땐 — 화면 고정",
      text:
        "확대하다 그림을 잃어버려도 이 단추 하나면 돌아옵니다. 눌러 보세요.\n\n" +
        "· 캔버스 아래 막대의 오른쪽 끝, 과녁(⌖) 모양입니다\n" +
        "· 단축키는 Ctrl+Space 입니다",
      demo: () => ({ kind: "clicks", at: ["#center-view-btn"] }),
      wait: { click: "#center-view-btn", hint: "과녁 단추를 눌러 주세요" },
    },
    {
      target: () => "#canvas",
      title: "연습감을 놓아 드릴게요",
      text:
        "그리는 건 다음 코스에서 합니다. 먼저 이미 놓인 것을 다루는 법부터 익히겠습니다.\n\n" +
        "· 아래 단추를 누르면 사각형 하나와 직선 하나가 놓입니다",
      auto: {
        label: "연습감 놓기",
        run: () => placeObjects([
          newRect(B.rect.x, B.rect.y, B.rect.w, B.rect.h),
          newLine(B.line.p1, B.line.p2),
        ]),
      },
    },
    {
      target: () => "#canvas",
      title: "① 골라서 옮기기",
      text:
        "지금은 선택 도구(V) 상태입니다. 사각형을 누른 채 점선 자리까지 끌어 보세요.\n\n" +
        "· 누르면 골라지고, 그대로 끌면 옮겨집니다",
      guide: () => ({ pts: B.rectTarget, close: true, note: "여기로", noteDy: -10 }),
      demo: () => ({
        kind: "drag",
        from: [B.rect.x + B.rect.w / 2, B.rect.y + B.rect.h / 2],
        to: [(B.rectTarget[0][0] + B.rectTarget[2][0]) / 2, (B.rectTarget[0][1] + B.rectTarget[2][1]) / 2],
      }),
      wait: {
        until: () => {
          const r = rectObj();
          if (!r) return false;
          const cx = (B.rectTarget[0][0] + B.rectTarget[2][0]) / 2;
          const cy = (B.rectTarget[0][1] + B.rectTarget[2][1]) / 2;
          return dist([r.x + r.w / 2, r.y + r.h / 2], [cx, cy]) <= 9;
        },
        hint: "사각형을 점선 자리로 끌어 주세요",
      },
    },
    {
      target: () => "#canvas",
      title: "② 크기 바꾸기",
      text:
        "고른 것의 네 모서리에 흰 네모 손잡이가 생겼습니다.\n" +
        "오른쪽 아래 손잡이를 잡고 점선 크기까지 끌어 키워 보세요.\n\n" +
        "· 점선에 딱 맞출 필요는 없습니다 — 그 근처면 넘어갑니다\n" +
        "· Shift 를 누른 채 끌면 가로세로 비율이 유지됩니다",
      guide: () => ({ pts: B.rectBig, close: true, note: "이 크기까지", noteDy: -10 }),
      demo: () => ({
        kind: "drag",
        from: [B.rectTarget[2][0], B.rectTarget[2][1]],     // 지금 오른쪽 아래 모서리
        to: [B.rectBig[2][0], B.rectBig[2][1]],             // 목표 오른쪽 아래 모서리
      }),
      wait: {
        until: () => { const r = rectObj(); return !!r && r.w >= B.rect.w * 1.35; },
        hint: "오른쪽 아래 손잡이를 끌어 키워 주세요",
      },
    },
    {
      // 도구 선택과 실제 회전을 한 단계에 넣으면, 상자가 '버튼 + 캔버스'를 함께
      // 감싸느라 커져서 정작 버튼이 강조되지 않는다(사용자 지적) → 두 단계로 나눈다.
      target: () => '[data-tool="rotate"]',
      title: "③ 회전 도구를 눌러 주세요",
      text:
        "왼쪽 맨 윗줄 가운데, 둥근 화살표(↻) 모양입니다.\n\n" +
        "· 단축키는 R 입니다",
      demo: () => ({ kind: "clicks", at: ['[data-tool="rotate"]'] }),
      wait: { click: '[data-tool="rotate"]', hint: "회전 도구를 눌러 주세요" },
    },
    {
      target: () => "#canvas",
      title: "사각형 안쪽을 잡고 돌리세요",
      text:
        "점선으로 짚은 곳 — 사각형 안 아무 데나 잡고, 시계 방향으로 원을 그리듯 끄세요.\n" +
        "손잡이를 따로 잡을 필요 없이 몸통을 끌면 돌아갑니다.\n\n" +
        "· 비스듬해지면 넘어갑니다 (10도만 돌려도 충분합니다)\n" +
        "· 되돌리려면 Ctrl+Z 입니다",
      // 어디를 잡아야 하는지 — 지금 사각형 자리를 그대로 짚는다.
      guide: () => {
        const r = rectObj();
        if (!r) return null;
        return { pts: [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]],
                 close: true, note: "여기를 잡고", noteDy: -8 };
      },
      // 몸통을 잡고 오른쪽 아래로 호를 그리듯 끄는 시늉.
      demo: () => {
        const r = rectObj();
        if (!r) return null;
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        return { kind: "drag", from: [cx + r.w * 0.3, cy], to: [cx + r.w * 0.25, cy + r.h * 0.45] };
      },
      wait: {
        until: () => {
          const r = rectObj();
          if (!r) return false;
          const deg = Math.abs(((r.rotation || 0) % 360 + 360) % 360);
          return deg >= 8 && deg <= 352;
        },
        hint: "사각형을 끌어 돌려 주세요",
      },
    },
    {
      target: () => "#panel-right",
      title: "④ 오른쪽에서 다듬기",
      text:
        "고른 것의 속성이 오른쪽에 나옵니다. 선 굵기를 한 단계 바꿔 보세요.\n\n" +
        "· 캔버스에 바로 반영됩니다\n" +
        "· 사각형이 안 골라져 있으면 먼저 한 번 눌러 고르세요",
      wait: {
        until: () => { const r = rectObj(); return !!r && Math.abs((r.strokeWidth || 0) - B.rectStroke) > 0.001; },
        hint: "선 굵기를 바꿔 주세요",
      },
    },
    {
      target: () => "#canvas",
      title: "⑤ 직선은 양 끝의 점을 잡습니다",
      text:
        "아래쪽 가로 직선을 한 번 누르세요. 그러면 선의 양 끝에 작은 손잡이가 나타납니다.\n" +
        "그중 <오른쪽 끝> 손잡이를 잡고, 점선이 가리키는 오른쪽 위까지 끌어 올리세요.\n\n" +
        "· 잡을 곳 = 선의 오른쪽 끄트머리 (점선의 시작점 ● 자리)\n" +
        "· 놓을 곳 = 점선의 반대쪽 끝 ◎ 자리\n" +
        "· 끝점 하나만 옮겨도 길이와 기울기가 한꺼번에 바뀝니다",
      guide: () => [
        // 지금 선의 실제 끝점에서 목표까지 — 잡을 곳과 놓을 곳을 한 줄로 잇는다.
        (() => { const l = lineObj();
          const from = l && l.p2 ? [l.p2.x, l.p2.y] : [B.line.p2.x, B.line.p2.y];
          return { pts: [from, B.lineEnd], close: false, note: "여기까지 끌기", noteDy: -8 }; })(),
      ],
      demo: () => {
        const l = lineObj();
        const from = l && l.p2 ? [l.p2.x, l.p2.y] : [B.line.p2.x, B.line.p2.y];
        return { kind: "drag", from, to: B.lineEnd };
      },
      wait: {
        until: () => {
          const l = lineObj();
          if (!l || !l.p2) return false;
          return dist([l.p2.x, l.p2.y], B.lineEnd) <= 9;
        },
        hint: "오른쪽 끝 손잡이를 점선 자리로 끌어 주세요",
      },
    },
    {
      target: () => "#panel-right",
      title: "⑥ 화살표 달기",
      text:
        "직선이 골라진 채로, 오른쪽 속성의 '화살표'에서 하나 골라 보세요.\n\n" +
        "· 힘·속도·전류 방향 표시가 한 번에 됩니다\n" +
        "· 물결 화살표는 빛·전자기파에 씁니다",
      wait: {
        until: () => { const l = lineObj(); return !!l && (l.lineMode || "solid") !== "solid"; },
        hint: "화살표를 골라 주세요",
      },
    },
    {
      target: () => "#canvas",
      title: "⑦ 화살표 끝을 여기저기 대 보세요",
      text:
        "화살표는 '무엇을 가리키느냐'가 전부입니다. 끝점을 옮겨 방향을 바꿔 보겠습니다.\n" +
        "점선 ◎ 자리로 화살표 끝을 끌어다 놓으세요. 세 곳을 차례로 짚습니다.\n\n" +
        "· 옮길 때마다 남은 횟수가 줄어듭니다\n" +
        "· 각도가 자유롭게 바뀌는 걸 손으로 느껴 보세요",
      action: (ctx) => { ctx.aimHit = 0; },
      guide: (ctx) => {
        const i = Math.min(ctx.aimHit || 0, B.aimSpots.length - 1);
        const p = B.aimSpots[i];
        const l = lineObj();
        const from = l && l.p2 ? [l.p2.x, l.p2.y] : [B.line.p2.x, B.line.p2.y];
        return [
          { pts: [from, p], close: false, note: `${i + 1}번째 자리로`, noteDy: -8 },
          { pts: aimRing(p), close: true },
        ];
      },
      demo: (ctx) => {
        const i = Math.min(ctx.aimHit || 0, B.aimSpots.length - 1);
        const l = lineObj();
        const from = l && l.p2 ? [l.p2.x, l.p2.y] : [B.line.p2.x, B.line.p2.y];
        return { kind: "drag", from, to: B.aimSpots[i] };
      },
      wait: {
        // 목표 자리에 닿을 때마다 한 칸씩 올라가고, 세 번을 채우면 통과한다.
        until: (ctx) => {
          const l = lineObj();
          if (!l || !l.p2) return false;
          const i = ctx.aimHit || 0;
          if (i >= B.aimSpots.length) return true;
          if (dist([l.p2.x, l.p2.y], B.aimSpots[i]) <= 8) ctx.aimHit = i + 1;
          return (ctx.aimHit || 0) >= B.aimSpots.length;
        },
        hint: "화살표 끝을 ◎ 자리로 끌어 주세요 (3회)",
      },
    },
    {
      title: "완성되었습니다",
      text:
        "고르고 → 끌고 → 오른쪽에서 다듬는다. 5E에서 하는 일은 결국 이 리듬입니다.\n\n" +
        "완성된 그림을 마음껏 조작해 보세요 — 옮기고, 돌리고, 크기를 바꿔도 됩니다.\n" +
        "실수해도 Ctrl+Z 로 되돌아갑니다.\n\n" +
        "· 다 해 보셨으면 아래 [마치기]를 눌러 다음 단계로 넘어가세요",
    },
  ],
};

/* ===== 코스 2: 빗면 그림 완성 =====
 * 순서가 곧 요령이다 — 바닥을 먼저 깔고 거기에 붙여 나간다.
 *   바닥 직선 → '수평면' 글자 → 빗면(띄워 그린 뒤 스냅) → 물체(정사각형 → 라벨 → 스냅)
 *   → 다 그린 뒤 통째로 묶어 옮기기.
 * 처음부터 제자리에 그리게 하지 않는 것이 핵심이다. 띄워 그린 뒤 Shift 드래그로
 * 붙이게 해야 스냅이 무엇인지 몸으로 익힌다.
 */

const INCLINE_FIGURE = {
  id: "incline-figure",
  title: "빗면 그림 완성",
  desc: "바닥부터 깔고 스냅으로 붙여 나가는 그림 한 장",
  minutes: 8,
  practice: true,
  next: ["exam-search"],
  steps: [
    {
      title: "이런 그림을 만듭니다",
      text:
        "역학 문항에 가장 많이 나오는 그림입니다.\n" +
        "바닥을 먼저 깔고, 거기에 빗면과 물체를 붙여 나갑니다.\n\n" +
        "· 그릴 자리는 점선으로 짚어 드립니다\n" +
        "· 어디를 눌러 어디까지 끄는지는 가상 커서가 보여 줍니다\n" +
        "· 물체는 빗면에 나란히 눕습니다 — 스냅이 각도까지 맞춰 줍니다",
      guide: () => [
        { pts: FIG.wedgeFinal, close: true, note: "빗면" },
        { pts: FIG.blockFinal, close: true },
        { pts: FIG.ground, close: false },
        { pts: FIG.groundTextBox, close: true, note: "수평면" },
      ],
    },

    /* ----- ① 바닥 수평면 (직선) ----- */
    {
      target: () => '[data-tool="L"]',
      title: "① 바닥부터 — 직선 도구",
      text:
        "그림의 기준이 될 바닥을 먼저 깝니다. 직선 도구를 눌러 주세요.\n\n" +
        "· 왼쪽 도구 3번째 줄 맨 왼쪽, 사선(╱) 모양입니다 (단축키 L)",
      demo: () => ({ kind: "clicks", at: ['[data-tool="L"]'] }),
      wait: { click: '[data-tool="L"]', hint: "직선 도구를 눌러 주세요" },
    },
    {
      target: () => "#canvas",
      title: "Ctrl 을 누른 채 양 끝을 클릭하세요",
      text:
        "직선은 끄는 게 아니라 두 점을 찍습니다.\n" +
        "키보드의 Ctrl 을 누른 채로 ① 을 누르고, 이어서 ② 를 누르세요.\n\n" +
        "· Ctrl 을 누르고 있으면 15° 단위로 딱 맞아 완전한 수평이 됩니다\n" +
        "· 화면에 뜬 Ctrl 표시가 '지금 누르고 있어야 한다'는 뜻입니다\n" +
        "· 잘못 찍었으면 Esc 로 취소합니다",
      guide: () => ({ pts: FIG.ground, close: false, note: "여기가 바닥", noteDy: 22 }),
      demo: () => ({ kind: "clicks", pts: FIG.ground, mod: "Ctrl 누른 채" }),
      wait: { until: () => countOf("line") >= 1, hint: "Ctrl 을 누른 채 양 끝을 눌러 주세요" },
    },

    /* ----- ② '수평면' 글자 — 도구는 직접 고르고, 타이핑만 자동 ----- */
    {
      // 팝오버가 열리면 '텍스트' 항목 하나만 짚는다 — 라벨러까지 함께 감싸면
      // 무엇을 눌러야 하는지 알 수 없다(사용자 지적).
      // 팝오버가 열려 '보이는' 동안에만 텍스트 항목을 짚고, 그전에는 단추를 짚는다.
      target: () => vis('.tool-chooser-opt[data-tool="T"]') || "#tool-text-merged",
      // 팝오버는 단추 오른쪽에 열린다. 설명 창을 기본값(오른쪽)에 두면 그 자리를 덮어
      // 정작 '텍스트'를 누를 수 없다(사용자 지적) → 아래쪽으로 내린다.
      coachSide: "below",
      title: "② 글자 — 텍스트 도구",
      text:
        "바닥이 무엇인지 적어 둡니다. 이 단추를 누르면 둘 중 하나를 고르는 창이 뜹니다.\n\n" +
        "· 위쪽 '텍스트'를 고르세요 (단축키 T 를 눌러도 같습니다)\n" +
        "· 아래 '라벨러'는 지시선이 달린 이름표라 쓰임이 다릅니다",
      demo: () => ({
        kind: "clicks",
        at: [vis('.tool-chooser-opt[data-tool="T"]') || vis("#tool-text-merged")],
      }),
      wait: {
        until: () => state.get().activeTool === "T",
        hint: "텍스트를 고르세요",
      },
    },
    {
      target: () => "#canvas",
      title: "'수평면'이라고 적습니다",
      text:
        "텍스트 도구가 켜졌습니다. 점선 자리를 누르면 그 자리에 입력칸이 열립니다.\n" +
        "아래 단추를 누르면 입력칸을 열고 글자까지 넣어 드립니다 —\n" +
        "확정은 직접 Ctrl+Enter 로 하세요.\n\n" +
        "· 확정이 Enter 가 아니라 Ctrl+Enter 인 점을 손으로 익혀 두세요\n" +
        "· Esc 를 누르면 없던 일이 됩니다",
      guide: () => [
        { pts: FIG.groundTextBox, close: true, note: "여기에 글자", noteDy: -10 },
        { pts: FIG.ground, close: false },
      ],
      // 커서는 글자가 시작될 자리(점선 상자의 좌측 상단)를 짚어야 한다 —
      // 기준점보다 아래를 짚으면 "왜 저기를 누르지?"가 된다(사용자 지적).
      demo: () => ({ kind: "clicks", pts: [[FIG.groundTextBox[0][0] + 1, FIG.groundTextBox[0][1] + 3]] }),
      auto: {
        label: "입력칸 열고 '수평면' 넣기",
        // 글자를 바로 만들어 버리면 Ctrl+Enter 를 배울 기회가 없다(사용자 지적).
        // 그래서 앱의 진짜 경로(캔버스 mousedown → 입력칸)를 태우고 값만 채운다.
        run: () => {
          const svg = document.getElementById("canvas");
          if (!svg || !svg.getScreenCTM) return;
          const p = svg.createSVGPoint();
          p.x = FIG.groundText[0]; p.y = FIG.groundText[1];
          const c = p.matrixTransform(svg.getScreenCTM());
          svg.dispatchEvent(new MouseEvent("mousedown", {
            clientX: c.x, clientY: c.y, bubbles: true, cancelable: true, button: 0,
          }));
          setTimeout(() => {
            const ta = document.querySelector("textarea.unified-text-input");
            if (!ta) return;
            ta.value = "수평면";
            ta.dispatchEvent(new Event("input", { bubbles: true }));
            ta.focus();
          }, 80);
        },
      },
      wait: {
        until: () => objects().some((o) => o.type === "text" && String(o.text || "").trim() !== ""),
        hint: "Ctrl+Enter 로 확정해 주세요",
      },
    },

    /* ----- ③ 빗면 (그린 뒤 바닥에 스냅) ----- */
    {
      target: () => '[data-tool="Y"]',
      title: "③ 빗면 — 직각삼각형 도구",
      text:
        "빗면은 직각삼각형으로 만듭니다.\n\n" +
        "· 왼쪽 도구 2번째 줄 가운데, 삼각형(◺) 모양입니다 (단축키 Y)\n" +
        "· 왼쪽 세로변이 높은 쪽, 빗변이 미끄러지는 면이 됩니다",
      demo: () => ({ kind: "clicks", at: ['[data-tool="Y"]'] }),
      wait: { click: '[data-tool="Y"]', hint: "직각삼각형 도구를 눌러 주세요" },
    },
    {
      target: () => "#canvas",
      title: "바닥에서 살짝 띄워 빗면을 끄세요",
      text:
        "일부러 바닥 위에 띄운 자리를 짚어 뒀습니다. 왼쪽 위에서 오른쪽 아래로 끄세요.\n\n" +
        "· 지금은 바닥에 안 닿아도 됩니다 — 다음 단계에서 붙입니다\n" +
        "· 처음부터 손으로 맞추려 애쓰지 않는 것이 요령입니다",
      guide: () => [
        { pts: FIG.wedgeDraw, close: true, note: "여기에 빗면", noteDy: 26 },
        { pts: FIG.ground, close: false },
      ],
      demo: () => ({ kind: "drag", from: FIG.wedgeDraw[0], to: FIG.wedgeDraw[2] }),
      wait: { until: () => countOf("triangle") >= 1, hint: "점선 자리에 끌어 보세요" },
    },
    {
      target: () => "#canvas",
      title: "Shift 를 누른 채 끌어 바닥에 붙이세요",
      text:
        "빗면을 눌러 고른 다음, Shift 를 누른 채 아래로 끄세요.\n" +
        "바닥선에 닿을 만큼 가까워지면 자석처럼 딱 달라붙습니다.\n\n" +
        "· 아랫변이 바닥과 마주 보게 반듯이 내려야 아랫변이 붙습니다\n" +
        "· 기울어져 누우면 Ctrl+Z 로 되돌리고 다시 해 보세요",
      guide: () => [
        { pts: FIG.wedgeFinal, close: true, note: "여기까지", noteDy: 26 },
        { pts: FIG.ground, close: false },
      ],
      demo: () => ({
        kind: "drag",
        from: [(FIG.wedgeDraw[0][0] + FIG.wedgeDraw[2][0]) / 2, (FIG.wedgeDraw[0][1] + FIG.wedgeDraw[2][1]) / 2],
        to: [(FIG.wedgeFinal[0][0] + FIG.wedgeFinal[2][0]) / 2, (FIG.wedgeFinal[0][1] + FIG.wedgeFinal[2][1]) / 2],
        mod: "Shift 누른 채",
      }),
      wait: {
        // 아랫변이 바닥선에 '반듯하게' 얹혔을 때만 통과. 기울어 누운 것을 성공으로 봐 주면
        // 이상한 그림을 안은 채 다음으로 가 버린다.
        until: () => {
          const t = objects().find((o) => o.type === "triangle");
          const l = objects().find((o) => o.type === "line");
          if (!t || !l || !l.p1 || !l.p2) return false;
          const deg = ((t.rotation || 0) % 360 + 360) % 360;
          const upright = deg < 3 || deg > 357;
          const groundY = (l.p1.y + l.p2.y) / 2;
          return upright && Math.abs((t.y + t.h) - groundY) <= 2;
        },
        hint: "Shift 를 누른 채 바닥까지",
      },
    },

    /* ----- ④ 물체 (정사각형 → 라벨 → 빗면에 스냅) ----- */
    {
      target: () => '[data-tool="RECT"]',
      title: "④ 물체 — 사각형 도구",
      text:
        "빗면에 올릴 물체를 만듭니다.\n\n" +
        "· 왼쪽 도구 2번째 줄 맨 오른쪽, 사각형(▭) 모양입니다 (단축키 S)",
      demo: () => ({ kind: "clicks", at: ['[data-tool="RECT"]'] }),
      wait: { click: '[data-tool="RECT"]', hint: "사각형 도구를 눌러 주세요" },
    },
    {
      target: () => "#canvas",
      title: "Shift 를 누른 채 끌어 정사각형으로",
      text:
        "빈 곳에 먼저 만들어 두겠습니다. Shift 를 누른 채 끌면 가로세로 비율이 고정돼\n" +
        "정사각형이 됩니다.\n\n" +
        "· 물체는 정사각형으로 두는 편이 시험지에서 깔끔합니다\n" +
        "· 타원도 같은 방법으로 정원이 됩니다",
      guide: () => [
        { pts: FIG.blockDraw, close: true, note: "여기에 물체", noteDy: -12 },
        { pts: FIG.wedgeFinal, close: false },
        { pts: FIG.ground, close: false },
      ],
      demo: () => ({ kind: "drag", from: FIG.blockDraw[0], to: FIG.blockDraw[2], mod: "Shift 누른 채" }),
      wait: { until: () => countOf("rect") >= 1, hint: "Shift 를 누른 채 끌어 보세요" },
    },
    {
      target: () => "#panel-right",
      title: "⑤ 물리량 라벨 m",
      text:
        "물체에 질량 m 을 붙입니다. 점선으로 표시한 자리 — 물체 한가운데에 들어갑니다.\n\n" +
        "· 직접 하시려면: 물체를 눌러 고른 뒤 오른쪽 '라벨' 칸에 입력\n" +
        "· 바로 위 '종류'를 물리량으로 두면 시험지 관례대로 기울인 글씨가 됩니다\n" +
        "· 질량 m, 속력 v, 힘 F … 무엇이든 됩니다",
      // 라벨이 어디에 붙는지 보여 준다 — 방금 그린 물체 자리를 짚는다(사용자 지적).
      guide: () => {
        const r = objects().find((o) => o.type === "rect");
        const box = r
          ? [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]]
          : FIG.blockDraw;
        return { pts: box, close: true, note: "여기에 m", noteDy: -8 };
      },
      auto: {
        label: "라벨 m 붙이기",
        run: () => {
          const r = objects().find((o) => o.type === "rect");
          if (!r) return;
          state.update((s) => {
            const snap = JSON.parse(JSON.stringify(s.objects));
            const o = s.objects.find((x) => x.id === r.id);
            if (!o) return;
            o.label = "m";
            o.labelType = "quantity";
            s.undoStack.push(snap);
            s.redoStack = [];
          });
        },
      },
    },
    {
      target: () => "#canvas",
      title: "⑥ Shift 를 누른 채 끌어 빗면에 얹으세요",
      text:
        "물체를 고른 상태에서 Shift 를 누른 채 빗면 쪽으로 끄세요.\n" +
        "빗변에 가까워지면 각도까지 맞춰 나란히 눕습니다.\n\n" +
        "· 점선이 눕어 있는 건 실제로 그렇게 붙기 때문입니다",
      guide: () => [
        { pts: FIG.blockFinal, close: true, note: "여기까지", noteDy: -12 },
        { pts: FIG.wedgeFinal, close: false },
        { pts: FIG.ground, close: false },
      ],
      demo: () => ({
        kind: "drag",
        from: [(FIG.blockDraw[0][0] + FIG.blockDraw[2][0]) / 2, (FIG.blockDraw[0][1] + FIG.blockDraw[2][1]) / 2],
        to: [(FIG.blockFinal[0][0] + FIG.blockFinal[2][0]) / 2, (FIG.blockFinal[0][1] + FIG.blockFinal[2][1]) / 2],
        mod: "Shift 누른 채",
      }),
      wait: {
        until: () => {
          const s = wedgeSlope();
          const r = objects().find((o) => o.type === "rect");
          if (!s || !r) return false;
          return distToSegment({ x: r.x + r.w / 2, y: r.y + r.h }, s.a, s.b) <= 7;
        },
        hint: "Shift 를 누른 채 빗면까지",
      },
    },

    /* ----- ⑦ 다 그린 뒤 — 통째로 다루기 ----- */
    {
      target: () => "#canvas",
      title: "⑦ 전부 감싸도록 끌어 한꺼번에 고르기",
      text:
        "그림이 완성됐습니다. 이제 통째로 다루는 법을 익힙니다.\n" +
        "빈 곳에서 시작해 그림 전체를 감싸도록 대각선으로 끄세요.\n\n" +
        "· 감싸인 것이 모두 골라집니다 — 하나씩 Shift+클릭 할 필요가 없습니다",
      demo: () => ({ kind: "drag", from: [-42, -27], to: [42, 29] }),
      wait: {
        until: () => (state.get().selectedIds || []).length >= 3,
        hint: "그림 전체를 감싸도록 끌어 주세요",
      },
    },
    {
      target: () => "#canvas",
      title: "⑧ G 를 눌러 하나로 묶기",
      text:
        "여러 개가 골라진 상태에서 키보드 G 를 누르면 한 덩어리가 됩니다.\n\n" +
        "· 묶어 두면 옮길 때 그림이 흐트러지지 않습니다\n" +
        "· 다시 풀려면 Shift+G 입니다",
      wait: {
        until: () => {
          const s = state.get();
          const ids = s.selectedIds || [];
          if (ids.length < 2) return false;
          const gid = s.objects.find((o) => ids.includes(o.id))?.groupId;
          return !!gid && s.objects.filter((o) => o.groupId === gid).length >= 2;
        },
        hint: "키보드 G 를 눌러 주세요",
      },
    },
    {
      target: () => "#canvas",
      title: "⑨ 묶은 것을 통째로 옮겨 보세요",
      text:
        "이제 어디를 잡아 끌어도 그림 전체가 함께 움직입니다.\n" +
        "아무 데나 잡고 조금 옮겨 보세요.\n\n" +
        "· 잘못 옮겼으면 Ctrl+Z 로 되돌립니다",
      action: (ctx) => {
        const t = objects().find((o) => o.type === "triangle");
        ctx.moveFrom = t ? [t.x, t.y] : null;
      },
      wait: {
        until: (ctx) => {
          const t = objects().find((o) => o.type === "triangle");
          if (!t || !ctx.moveFrom) return false;
          return Math.hypot(t.x - ctx.moveFrom[0], t.y - ctx.moveFrom[1]) >= 3;
        },
        hint: "그림을 잡고 옮겨 보세요",
      },
    },
    {
      title: "그림 한 장이 끝났습니다",
      text:
        "바닥을 깔고 → 거기에 붙여 나가는 순서. 이게 시험지 그림을 빨리 만드는 요령입니다.\n\n" +
        "· 빗면을 골라 속성의 '채우기 종류'를 빗금으로 하면 재질 표시가 됩니다\n" +
        "· 다음 코스에서는 기출 문항을 가져와 고치고 내보내는 것까지 해 봅니다",
    },
  ],
};

/* ===== 코스 3: 기출 가져와 고쳐서 내보내기 =====
 * 실전 흐름을 통째로 한 번 태운다 —
 *   찾고 → 오브젝트로 바꿔 오고 → 묶음을 풀고 → 필요 없는 것을 지우고
 *   → 내 라벨을 달고 → 내 라이브러리에 저장하고 → 여러 개 꺼내 쓰고 → 내보낸다.
 * '내보내기'를 따로 코스로 두지 않고 여기 붙였다(사용자 요구) — 실제로도 이 흐름의 끝이
 * 내보내기이기 때문에, 떼어 놓으면 맥락이 끊긴다.
 *
 * 검색은 압축 코드 20260611 을 **버튼을 누를 때마다 한 조각씩** 넣어 결과가 좁혀지는 것을
 * 눈으로 보게 한다(실측: 2→60개, 2026→58개, 202606→20개, 20260611→1개).
 */

const EXAM_CODE = "20260611";        // 2026학년도 6월 모평 물리1 11번
const CODE_STEPS = [2, 4, 6, 8];     // 버튼을 누를 때마다 여기까지 채운다

function typeIntoSearch(v) {
  const q = document.getElementById("examlib-query");
  if (!q) return;
  q.value = v;
  q.dispatchEvent(new Event("input", { bubbles: true }));
}
const examHits = () => {
  const t = document.getElementById("examlib-status")?.textContent || "";
  const m = t.match(/(\d+)\s*개/);
  return m ? Number(m[1]) : null;
};
// 지금 캔버스에 있는 그룹 id 들(객체화 삽입물은 하나의 groupId 로 묶여 온다).
const groupIds = () => new Set(objects().map((o) => o.groupId).filter(Boolean));

const EXAM_SEARCH = {
  id: "exam-search",
  title: "기출 가져와 고쳐서 내보내기",
  desc: "찾고 · 풀고 · 지우고 · 저장하고 · 내보내기 — 실전 한 바퀴",
  minutes: 12,
  practice: true,
  next: ["trim-exam"],
  steps: [
    {
      title: "사실 처음부터 그릴 필요가 없습니다",
      text:
        "물리1·화학1·생명1·지구1 기출 도해가 들어 있습니다.\n" +
        "이번엔 실제 문항 하나를 가져와 필요한 부분만 남기고, 내 라벨을 달아\n" +
        "내 라이브러리에 저장해 두고 재사용하는 것까지 해 보겠습니다.",
    },
    {
      target: () => "#exam-library-open",
      title: "기출문항 검색 열기",
      text:
        "캔버스 아래 막대에 있습니다. 눌러 주세요.\n\n" +
        "· 단축키는 Ctrl+Shift+F 입니다",
      demo: () => ({ kind: "clicks", at: ["#exam-library-open"] }),
      wait: { click: "#exam-library-open", hint: "기출문항 검색을 눌러 주세요" },
    },
    {
      target: () => ["#examlib-query", "#examlib-status"],
      title: "번호를 한 조각씩 — 결과가 좁혀집니다",
      text:
        "문항 번호를 압축 코드로 칩니다. 아래 단추를 누를 때마다 두 자리씩 늘어납니다.\n" +
        "오른쪽 위 '문항 n개' 표시가 어떻게 줄어드는지 보세요.\n\n" +
        "· 20 = 연도 앞자리 · 2026 = 학년도 · 202606 = 6월 · 20260611 = 11번\n" +
        "· 한 번에 다 치지 않고 나눠 보는 이유는, 어디까지 좁혔는지 눈으로 알기 위해서입니다",
      auto: {
        repeat: {
          label: (i) => (i < CODE_STEPS.length
            ? `'${EXAM_CODE.slice(0, CODE_STEPS[i])}' 까지 넣기  (${i + 1}/${CODE_STEPS.length})`
            : "다음"),
          run: (i) => {
            if (i >= CODE_STEPS.length) return false;
            typeIntoSearch(EXAM_CODE.slice(0, CODE_STEPS[i]));
            return i + 1 < CODE_STEPS.length;   // 아직 남았으면 버튼을 유지
          },
        },
      },
    },
    {
      target: () => "#examlib-grid",
      title: "딱 한 문항이 남았습니다",
      text:
        "2026학년도 6월 모평 물리1 11번입니다. 카드를 눌러 골라 주세요.\n\n" +
        "· 숫자를 다 넣으면 문항이 하나로 좁혀집니다",
      wait: {
        until: () => {
          const b = document.getElementById("examlib-insert");
          return !!b && !b.disabled;
        },
        hint: "카드를 눌러 골라 주세요",
      },
    },
    {
      target: () => ["#examlib-insert", "#examlib-objectify", "#examlib-refwin"],
      title: "가져오는 법이 셋입니다",
      text:
        "· 이미지 삽입 — 그림째로. 배경에 깔고 위에 덧그릴 때\n" +
        "· 오브젝트 변환 — 선 하나하나 고칠 수 있는 형태로\n" +
        "· 참고 창 — 옆에 띄워 두고 보면서 새로 그릴 때\n\n" +
        "우리는 일부만 남기고 지울 거라 '오브젝트 변환'입니다.",
    },
    {
      target: () => "#examlib-objectify",
      title: "오브젝트 변환을 눌러 주세요",
      text:
        "누르면 잠깐 불러온 뒤 '객체화' 창이 열립니다.\n\n" +
        "· 그림을 선으로 바꾸는 데 몇 초 걸립니다",
      demo: () => ({ kind: "clicks", at: ["#examlib-objectify"] }),
      wait: { click: "#examlib-objectify", hint: "오브젝트 변환을 눌러 주세요" },
    },
    {
      target: () => "#objectify-insert",
      title: "그대로 '객체로 삽입'",
      text:
        "이 창에서 선을 얼마나 잘게 딸지 조절할 수 있습니다.\n" +
        "지금은 기본값 그대로 두고 '객체로 삽입'을 누르세요.\n\n" +
        "· 왼쪽 미리보기가 준비되면 단추가 켜집니다\n" +
        "· 나중에 결과가 성기면 이 창의 값을 만져 다시 뽑으면 됩니다",
      demo: () => ({ kind: "clicks", at: ["#objectify-insert"] }),
      wait: {
        until: () => objects().length > 0,
        hint: "'객체로 삽입'을 눌러 주세요",
      },
    },

    /* ----- 묶음을 풀어야 부분만 지울 수 있다 ----- */
    {
      target: () => "#canvas",
      title: "① 먼저 묶음을 풉니다 — Shift+G",
      text:
        "가져온 그림은 전체가 한 덩어리로 묶여 들어옵니다.\n" +
        "이대로는 일부만 지울 수 없으니, 먼저 풀어야 합니다.\n\n" +
        "· 그림을 한 번 눌러 고른 뒤, 키보드 Shift+G 를 누르세요\n" +
        "· 묶기가 G, 풀기가 Shift+G 입니다",
      action: (ctx) => { ctx.groups0 = groupIds().size; },
      wait: {
        until: (ctx) => groupIds().size < (ctx.groups0 ?? 1),
        hint: "그림을 고른 뒤 Shift+G 를 눌러 주세요",
      },
    },
    {
      target: () => "#canvas",
      title: "② 오른쪽 우주선만 남기고 지웁니다",
      text:
        "이제 낱개로 고를 수 있습니다. 남길 것은 오른쪽 우주선 하나뿐입니다.\n" +
        "나머지를 감싸도록 끌어 고른 뒤 Delete 를 누르세요.\n\n" +
        "· 여러 번 나눠서 지우셔도 됩니다\n" +
        "· 잘못 지웠으면 Ctrl+Z 로 되돌립니다\n" +
        "· 다 지우셨는데 안 넘어가면 아래 [다음]을 누르세요",
      // 남는 조각 수가 문항마다 달라 판정이 헐렁하다 → 갇히지 않게 [다음]을 함께 둔다.
      allowNext: true,
      wait: {
        until: (ctx) => objects().length > 0 && objects().length <= (ctx.keepMax || 14),
        hint: "우주선만 남기고 지워 주세요",
      },
      action: (ctx) => {
        // 전체의 1/4 이하로 줄면 '나머지를 지웠다'로 본다 — 문항마다 조각 수가 달라
        // 절대 개수로는 판정할 수 없다.
        ctx.keepMax = Math.max(3, Math.round(objects().length * 0.25));
      },
    },
    {
      target: () => "#canvas",
      title: "③ 우주선 안의 글자도 지웁니다",
      text:
        "우주선 안에 남은 c 같은 글자도 내 문항엔 필요 없습니다.\n" +
        "글자를 눌러 고른 뒤 Delete 를 누르세요.\n\n" +
        "· 객체화된 글자는 '글자'가 아니라 작은 그림 조각으로 들어옵니다 —\n" +
        "  그래서 도형과 똑같이 골라서 지웁니다\n" +
        "· 여러 개면 감싸도록 끌어 한꺼번에 지우셔도 됩니다",
      action: (ctx) => { ctx.beforeLetters = objects().length; },
      wait: {
        until: (ctx) => objects().length < (ctx.beforeLetters ?? Infinity),
        hint: "글자를 고르고 Delete 를 눌러 주세요",
      },
    },
    {
      target: () => "#canvas",
      title: "④ 내 라벨을 새로 답니다",
      text:
        "지운 자리에 내가 쓸 기호를 넣습니다. 이것도 대신 넣어 드릴게요.\n\n" +
        "· 직접 하시려면: 텍스트 도구(T) → 자리 클릭 → 입력 → Ctrl+Enter\n" +
        "· 기호만 바꾸면 같은 그림으로 다른 문항이 됩니다",
      auto: {
        label: "라벨 A 넣기",
        run: () => {
          if (!objects().some((o) => o.type === "text")) {
            placeObjects([newText(-6, -14, "A")]);
          }
        },
      },
    },

    /* ----- 내 라이브러리에 저장해 두고 재사용 ----- */
    {
      target: () => "#canvas",
      title: "⑤ 저장할 것을 골라 둡니다",
      text:
        "이 우주선을 다음 문항에서도 쓰려면 내 라이브러리에 저장해 둡니다.\n" +
        "먼저 우주선 전체를 감싸도록 끌어 고르세요.\n\n" +
        "· 저장은 '지금 골라 둔 것'을 담습니다",
      wait: {
        until: () => (state.get().selectedIds || []).length >= 1,
        hint: "우주선을 감싸도록 끌어 주세요",
      },
    },
    {
      target: () => "#personal-object-save",
      title: "⑥ [오브젝트 저장]을 누르세요",
      text:
        "왼쪽 맨 아래 '고급 기능' 묶음에 있습니다.\n\n" +
        "· 이름을 정하는 창이 뜹니다 — 아무 이름이나 넣고 저장하세요\n" +
        "· 저장한 것은 왼쪽 '퍼스널 오브젝트'와 오브젝트 검색(Ctrl+F)에서 다시 나옵니다",
      demo: () => ({ kind: "clicks", at: ["#personal-object-save"] }),
      wait: {
        until: () => !!document.getElementById("po-ok"),
        hint: "오브젝트 저장을 눌러 주세요",
      },
    },
    {
      target: () => ["#po-name", "#po-ok"],
      title: "⑦ 이름을 넣고 저장",
      text:
        "이름은 대신 넣어 드릴게요. '저장'을 누르시면 됩니다.\n\n" +
        "· 분류는 그대로 두셔도 됩니다\n" +
        "· 이름을 바꾸고 싶으시면 직접 고쳐 쓰셔도 됩니다",
      auto: {
        label: "이름 '우주선' 넣기",
        run: () => {
          const n = document.getElementById("po-name");
          if (!n) return;
          n.value = "우주선";
          n.dispatchEvent(new Event("input", { bubbles: true }));
        },
      },
    },
    {
      // 저장이 끝나면 왼쪽 '퍼스널 오브젝트' 칸에 항목이 생긴다. 그 칸은 기본이 접힘
      // 상태(index.html: is-collapsed)라, 먼저 펴 줘야 사용자가 볼 수 있다.
      target: () => vis("#personal-parts .personal-item-btn") || "#personal-section",
      title: "⑧ 라이브러리에서 여러 개 꺼내 씁니다",
      text:
        "왼쪽 '퍼스널 오브젝트' 칸에 방금 저장한 우주선이 있습니다.\n" +
        "이름을 누를 때마다 캔버스에 하나씩 더 놓입니다. 눌러 보세요.\n\n" +
        "· 같은 장치를 여러 개 배치하는 문항(비교 실험 등)이 순식간에 됩니다\n" +
        "· 칸이 접혀 있으면 '퍼스널 오브젝트' 제목을 눌러 펼칩니다",
      action: (ctx) => {
        // 접혀 있으면 펴 준다 — 안 펴면 항목이 화면에 없어 짚을 대상 자체가 없다.
        document.getElementById("personal-section")?.classList.remove("is-collapsed");
        ctx.beforeInsert = objects().length;
      },
      demo: () => (vis("#personal-parts .personal-item-btn")
        ? { kind: "clicks", at: ["#personal-parts .personal-item-btn"] } : null),
      allowNext: true,
      wait: {
        until: (ctx) => objects().length > (ctx.beforeInsert || 0),
        hint: "퍼스널 오브젝트에서 우주선을 눌러 주세요",
      },
    },

    /* ----- 내보내기 ----- */
    {
      target: () => ["#file-menu-btn", "#image-export"],
      title: "⑨ 이제 내보냅니다 — 파일 메뉴",
      text:
        "다 됐으면 한글에 붙일 그림으로 뽑습니다.\n" +
        "위쪽 '파일'을 누른 뒤 '이미지로 내보내기'를 고르세요.\n\n" +
        "· 단축키는 Alt+P 입니다",
      demo: () => ({ kind: "clicks", at: ["#file-menu-btn"] }),
      wait: {
        until: () => !!document.getElementById("export-confirm"),
        hint: "파일 → 이미지로 내보내기",
      },
    },
    {
      target: () => ["#export-format", "#export-area"],
      title: "⑩ 필요한 부분만 — 영역 지정",
      text:
        "형식은 PNG 로 두세요. 시험지에 넣을 그림은 PNG 가 깔끔합니다.\n" +
        "그림 일부만 필요하면 '영역 지정'을 눌러 캔버스에서 원하는 만큼 끕니다.\n\n" +
        "· 영역을 안 정하면 아트보드 전체가 나갑니다\n" +
        "· '모든 페이지'를 쓰면 문항별 페이지를 폴더 하나로 한 번에 뽑습니다",
      demo: () => ({ kind: "clicks", at: ["#export-area"] }),
    },
    {
      target: () => ["#export-confirm", "#export-cancel"],
      title: "⑪ 내보내기 — 또는 오늘은 취소",
      text:
        "'내보내기'를 누르면 PNG 파일이 내려받아집니다.\n" +
        "연습이니 '취소'로 닫으셔도 됩니다 — 둘 중 아무거나 누르세요.\n\n" +
        "· 작업은 몇 초마다 자동 저장되니 저장 걱정은 안 하셔도 됩니다\n" +
        "· 다른 컴퓨터로 옮길 때만 파일 → 프로젝트 저장(Ctrl+S)",
      wait: {
        until: () => !document.getElementById("export-confirm"),
        hint: "내보내기 또는 취소를 눌러 주세요",
      },
    },
    {
      title: "실전 한 바퀴가 끝났습니다",
      text:
        "찾고 → 풀고 → 지우고 → 고치고 → 저장해 두고 → 꺼내 쓰고 → 내보낸다.\n" +
        "이게 5E로 시험지 그림을 만드는 전부입니다.\n\n" +
        "· 저장해 둔 우주선은 다음에 열어도 왼쪽에 그대로 있습니다\n" +
        "· 막히면 언제든 위쪽 [튜토리얼]로 돌아오세요. 수고하셨습니다",
    },
  ],
};

/* ===================================================================
 * 심화 트랙 — 기본 4코스를 마친 사람에게 권하는 도구 확장
 * =================================================================== */

/* ===== 코스 4: 기출 그림 다듬기 =====
 * 지우는 길이 둘이라는 것을 몸으로 익힌다.
 *   · 통째로 가져온 '이미지'  → 오른쪽 속성의 지우개(사각형·자유 영역)
 *   · 선으로 바뀐 '오브젝트'  → 가위(✂)
 * 무엇을 가져왔느냐에 따라 손이 달라진다는 게 이 코스의 전부다.
 */

const TRIM_EXAM = {
  id: "trim-exam",
  title: "기출 그림 다듬기",
  desc: "가져온 그림에서 필요 없는 부분 지우기",
  minutes: 6,
  practice: true,
  next: ["align-space"],
  steps: [
    {
      title: "지우는 법이 둘입니다",
      text:
        "기출 도해에는 보통 필요 없는 것이 섞여 있습니다 — 남의 문항 번호, 안 쓸 보조선.\n\n" +
        "· 통째로 가져온 <이미지>는 오른쪽 속성의 <지우개>로 지웁니다\n" +
        "· 선으로 바뀐 <오브젝트>는 <가위>로 잘라 냅니다\n\n" +
        "이번엔 이미지 쪽을 해 보고, 마지막에 가위도 만져 봅니다.",
    },
    {
      target: () => "#exam-library-open",
      title: "기출문항 검색 열기",
      text: "캔버스 아래 막대에 있습니다. 눌러 주세요. (Ctrl+Shift+F)",
      demo: () => ({ kind: "clicks", at: ["#exam-library-open"] }),
      wait: { click: "#exam-library-open", hint: "기출문항 검색을 눌러 주세요" },
    },
    {
      target: () => ["#examlib-query", "#examlib-status"],
      title: "문항을 찾아 드릴게요",
      text:
        "이번에는 검색을 대신 해 드립니다. 아래 단추를 누르세요.\n\n" +
        "· 압축 코드 20260611 = 2026학년도 6월 모평 11번",
      auto: {
        label: "'20260611' 검색하기",
        run: () => typeIntoSearch("20260611"),
      },
    },
    {
      target: () => "#examlib-grid",
      title: "카드를 눌러 고르세요",
      text: "한 문항만 남았습니다. 카드를 눌러 주세요.",
      wait: {
        until: () => { const b = document.getElementById("examlib-insert"); return !!b && !b.disabled; },
        hint: "카드를 눌러 골라 주세요",
      },
    },
    {
      target: () => "#examlib-insert",
      title: "이번엔 '이미지 삽입'입니다",
      text:
        "선으로 바꾸지 않고 그림째로 가져옵니다. 지우개는 이미지에만 쓸 수 있기 때문입니다.\n\n" +
        "· 오브젝트 변환과의 차이를 손으로 비교해 보세요",
      demo: () => ({ kind: "clicks", at: ["#examlib-insert"] }),
      wait: {
        until: () => countOf("image") >= 1,
        hint: "'이미지 삽입'을 눌러 주세요",
      },
    },
    {
      target: () => "#panel-right",
      title: "① 이미지를 골라 지우개 꺼내기",
      text:
        "가져온 이미지를 한 번 누르면, 오른쪽 속성에 <사각형 영역 지우기> 단추가 나옵니다.\n" +
        "그 단추를 눌러 주세요.\n\n" +
        "· 이미지를 안 골랐으면 단추가 나오지 않습니다",
      demo: () => (byText("사각형 영역 지우기") ? { kind: "clicks", at: [byText("사각형 영역 지우기")] } : null),
      allowNext: true,
      wait: {
        until: () => state.get().imageEditSession != null
          || (objects().find((o) => o.type === "image")?.cutouts || []).length > 0,
        hint: "'사각형 영역 지우기'를 눌러 주세요",
      },
    },
    {
      target: () => "#canvas",
      title: "② 지울 자리를 끌어 보세요",
      text:
        "지우고 싶은 곳을 대각선으로 끌면 그 영역이 투명해집니다.\n\n" +
        "· 이미지를 옮기거나 돌려도 지운 자리는 따라옵니다\n" +
        "· 되돌리려면 Ctrl+Z, 전부 되돌리려면 속성의 '지운 영역 초기화'",
      action: (ctx) => {
        ctx.cut0 = (objects().find((o) => o.type === "image")?.cutouts || []).length;
      },
      allowNext: true,
      wait: {
        until: (ctx) => (objects().find((o) => o.type === "image")?.cutouts || []).length > (ctx.cut0 || 0),
        hint: "지울 자리를 끌어 주세요",
      },
    },
    {
      target: () => "#panel-right",
      title: "③ 모양이 얄궂으면 — 자유 영역 지우기",
      text:
        "네모로 안 잘리는 자리는 붓으로 문지릅니다.\n" +
        "<자유 영역 지우기>를 누른 뒤 캔버스에서 칠하듯 그어 보세요.\n\n" +
        "· 지운 자리는 전부 데이터로 남아, 저장했다 열어도 그대로입니다",
      demo: () => (byText("자유 영역 지우기") ? { kind: "clicks", at: [byText("자유 영역 지우기")] } : null),
      allowNext: true,
      wait: {
        until: (ctx) => (objects().find((o) => o.type === "image")?.cutouts || []).length > (ctx.cut0 || 0) + 1,
        hint: "자유 영역으로 한 번 더 지워 보세요",
      },
    },
    {
      target: () => '[data-tool="CUT"]',
      title: "④ 선으로 된 그림은 가위로",
      text:
        "'오브젝트 변환'으로 가져온 그림은 선 하나하나가 객체라, 지우개가 아니라 <가위>를 씁니다.\n" +
        "연습용 선을 하나 놓아 뒀습니다. 가위 도구를 눌러 주세요.\n\n" +
        "· 왼쪽 맨 윗줄 오른쪽, 가위(✂) 모양입니다 (단축키 E)",
      action: () => placeObjects([newLine({ x: -30, y: -22 }, { x: 30, y: -22 })]),
      demo: () => ({ kind: "clicks", at: ['[data-tool="CUT"]'] }),
      wait: { click: '[data-tool="CUT"]', hint: "가위 도구를 눌러 주세요" },
    },
    {
      target: () => "#canvas",
      title: "선을 가로질러 그어 자르세요",
      text:
        "자르고 싶은 곳을 가로질러 긋기만 하면 그 자리에서 끊깁니다.\n\n" +
        "· Shift 를 누르면 곧은 직선으로 그어집니다\n" +
        "· 자르고 나면 조각이 각각 따로 골라집니다",
      guide: () => ({ pts: [[0, -28], [0, -16]], close: false, note: "여기를 가로질러", noteDy: -6 }),
      demo: () => ({ kind: "drag", from: [0, -28], to: [0, -16] }),
      action: (ctx) => { ctx.beforeCut = objects().length; },
      allowNext: true,
      wait: {
        until: (ctx) => objects().length > (ctx.beforeCut || 0),
        hint: "선을 가로질러 그어 주세요",
      },
    },
    {
      title: "이제 어떤 그림이 와도 됩니다",
      text:
        "통째로 쓸 것은 <이미지 + 지우개>, 뜯어고칠 것은 <오브젝트 변환 + 가위>.\n" +
        "두 길을 다 아셨습니다.\n\n" +
        "· 다 보셨으면 [마치기]를 눌러 주세요",
    },
  ],
};

/* ===== 코스 5: 정렬과 간격 =====
 * 같은 장치를 여러 개 늘어놓는 문항(비교 실험)이 순식간에 되는 기능.
 * 정렬이 먼저, 간격이 나중이라는 순서까지 손으로 익힌다(bulk-edit.js 의 규칙).
 */

const ALIGN_SPACE = {
  id: "align-space",
  title: "정렬과 간격",
  desc: "여러 개를 한 줄로 가지런히",
  minutes: 5,
  practice: true,
  next: ["terrain"],
  steps: [
    {
      target: () => "#canvas",
      title: "삐뚤빼뚤한 상자 세 개",
      text:
        "비교 실험 문항처럼 같은 것을 여러 개 늘어놓을 때 쓰는 기능을 배웁니다.\n" +
        "일부러 어긋나게 놓아 드릴게요.\n\n" +
        "· 아래 단추를 누르면 상자 세 개가 놓입니다",
      auto: {
        label: "상자 세 개 놓기",
        run: () => placeObjects([
          newRect(-34, -14, 16, 12),
          newRect(-8, -4, 16, 12),
          newRect(20, -20, 16, 12),
        ], { allowDup: true }),
      },
    },
    {
      target: () => "#canvas",
      title: "① 한꺼번에 고르기 — 감싸도록 끌기",
      text:
        "빈 곳에서 시작해 상자 세 개를 모두 감싸도록 대각선으로 끄세요.\n\n" +
        "· 감싸인 것이 전부 골라집니다\n" +
        "· 하나씩 Shift+클릭 해도 되지만, 끄는 쪽이 훨씬 빠릅니다",
      demo: () => ({ kind: "drag", from: [-40, -26], to: [40, 4] }),
      wait: {
        until: () => (state.get().selectedIds || []).length >= 3,
        hint: "세 개를 모두 감싸도록 끌어 주세요",
      },
    },
    {
      target: () => "#bulk-edit-open",
      title: "② [전체 통일/수정] 열기",
      text:
        "왼쪽 맨 아래 '고급 기능' 묶음에 있습니다. 눌러 주세요.\n\n" +
        "· 골라 둔 것들을 한 방에 다루는 창입니다\n" +
        "· 색·굵기를 한꺼번에 통일할 때도 같은 창을 씁니다",
      demo: () => ({ kind: "clicks", at: ["#bulk-edit-open"] }),
      wait: {
        until: () => !!vis("#bulk-apply"),
        hint: "전체 통일/수정을 눌러 주세요",
      },
    },
    {
      target: () => bulkRow(0) || "#bulk-gap-rows",
      coachSide: "left",
      title: "③ 좌우 정렬을 켜고 적용",
      text:
        "맨 윗줄 <좌우 정렬(가로 한 줄)>을 체크하고, 아래 [적용]을 누르세요.\n\n" +
        "· 세로 높이가 맞춰져 한 줄로 섭니다\n" +
        "· 옆의 상자로 '가운데 / 위 / 아래' 중 기준을 고릅니다",
      allowNext: true,
      wait: {
        until: () => {
          const rs = objects().filter((o) => o.type === "rect");
          if (rs.length < 3) return false;
          const ys = rs.map((o) => o.y + o.h / 2);
          return Math.max(...ys) - Math.min(...ys) < 1.5;   // 한 줄로 섰다
        },
        hint: "좌우 정렬을 체크하고 적용해 주세요",
      },
    },
    {
      target: () => bulkRow(2) || "#bulk-gap-rows",
      coachSide: "left",
      title: "④ 이번엔 좌우 간격",
      text:
        "셋째 줄 <좌우 간격 통일>을 체크하고 [적용]을 누르세요.\n\n" +
        "· 상자 사이의 빈 거리가 전부 같아집니다\n" +
        "· 정렬이 먼저, 간격이 나중입니다 — 순서가 반대면 정렬이 다시 흐트러집니다",
      allowNext: true,
      wait: {
        until: () => {
          const rs = objects().filter((o) => o.type === "rect").sort((a, b) => a.x - b.x);
          if (rs.length < 3) return false;
          const g1 = rs[1].x - (rs[0].x + rs[0].w);
          const g2 = rs[2].x - (rs[1].x + rs[1].w);
          return Math.abs(g1 - g2) < 1.5;                   // 간격이 고르다
        },
        hint: "좌우 간격을 체크하고 적용해 주세요",
      },
    },
    {
      title: "비교 실험 그림이 30초입니다",
      text:
        "같은 장치를 셋 놓고 조건만 바꾸는 문항 — 이제 이렇게 만듭니다.\n\n" +
        "· 하나 만들고 → Ctrl+D 로 복제 → 감싸서 고르기 → 정렬 → 간격\n" +
        "· 같은 창에서 선 굵기·색도 한 방에 통일할 수 있습니다\n" +
        "· 다 보셨으면 [마치기]를 눌러 주세요",
    },
  ],
};

/* ===== 코스 6: 꺾은선으로 지형 그리기 =====
 * 세 번째 그리기 방식. 도형=드래그, 직선=두 점, 꺾은선=여러 점+더블클릭.
 * 삼각형으로는 못 만드는 '비탈—평지—비탈' 지형이 이 도구의 존재 이유다.
 */

// 비탈 → 평지 → 비탈 지형 (world mm)
const TERRAIN = [[-38, -6], [-14, 14], [6, 14], [26, 24], [38, 24]];

const TERRAIN_COURSE = {
  id: "terrain",
  title: "꺾은선으로 지형 그리기",
  desc: "삼각형으로 안 되는 비탈은 꺾은선으로",
  minutes: 5,
  practice: true,
  next: [],
  steps: [
    {
      title: "비탈 + 평지 + 비탈",
      text:
        "직각삼각형으로는 '내려왔다가 평평했다가 또 내려가는' 지형을 못 만듭니다.\n" +
        "꺾은선은 찍는 대로 이어져서 어떤 지형이든 됩니다.\n\n" +
        "· 점선이 오늘 만들 모양입니다",
      guide: () => ({ pts: TERRAIN, close: false, note: "이런 지형", noteDy: -14 }),
    },
    {
      target: () => '[data-tool="P"]',
      title: "① 꺾은선 도구",
      text:
        "왼쪽 도구 3번째 줄 가운데, 지그재그(⌇) 모양입니다.\n\n" +
        "· 단축키는 P 입니다\n" +
        "· 바로 옆 곡선(C)도 찍는 법은 똑같고, 이어지는 모양만 부드럽습니다",
      demo: () => ({ kind: "clicks", at: ['[data-tool="P"]'] }),
      wait: { click: '[data-tool="P"]', hint: "꺾은선 도구를 눌러 주세요" },
    },
    {
      target: () => "#canvas",
      title: "② ①②③④ 를 차례로 클릭",
      text:
        "번호 자리를 순서대로 누르세요. 누를 때마다 선이 한 마디씩 이어집니다.\n\n" +
        "· 아직 끝내지 마세요 — 마지막 점은 다음 단계에서 찍습니다\n" +
        "· 잘못 찍었으면 Esc 로 전부 취소하고 다시 시작합니다",
      guide: () => ({ pts: TERRAIN, close: false }),
      demo: () => ({ kind: "clicks", pts: TERRAIN.slice(0, 4) }),
      wait: {
        until: () => {
          const d = state.get().draft;
          return !!d && Array.isArray(d.points) && d.points.length >= 4;
        },
        hint: "번호 자리를 차례로 눌러 주세요",
      },
    },
    {
      target: () => "#canvas",
      title: "③ 마지막 자리에서 더블클릭",
      text:
        "⑤ 자리에서 빠르게 두 번 누르면 꺾은선이 완성됩니다.\n\n" +
        "· Enter 를 눌러도 같습니다\n" +
        "· Esc 는 취소입니다",
      guide: () => [
        { pts: TERRAIN, close: false },
        { pts: aimRing(TERRAIN[4], 3), close: true, note: "여기서 더블클릭", noteDy: -12 },
      ],
      demo: () => ({ kind: "clicks", pts: [TERRAIN[4], TERRAIN[4]] }),
      wait: {
        until: () => countOf("polyline") >= 1,
        hint: "마지막 자리에서 더블클릭 해 주세요",
      },
    },
    {
      target: () => "#canvas",
      title: "④ 찍은 점은 나중에도 고칩니다",
      text:
        "완성한 꺾은선을 한 번 누르면 모든 꼭짓점에 손잡이가 생깁니다.\n" +
        "가운데쯤의 점을 잡고 위아래로 끌어 평지 높이를 바꿔 보세요.\n\n" +
        "· 지형을 다시 그릴 필요 없이 점만 옮기면 됩니다",
      action: (ctx) => {
        const p = objects().find((o) => o.type === "polyline");
        ctx.pts0 = p ? JSON.stringify(p.points) : null;
      },
      allowNext: true,
      wait: {
        until: (ctx) => {
          const p = objects().find((o) => o.type === "polyline");
          return !!p && ctx.pts0 && JSON.stringify(p.points) !== ctx.pts0;
        },
        hint: "꼭짓점 하나를 끌어 옮겨 주세요",
      },
    },
    {
      title: "세 가지 그리기를 모두 익히셨습니다",
      text:
        "도형은 드래그, 직선은 두 점, 꺾은선은 여러 점 + 더블클릭.\n" +
        "이 셋이면 시험지에 나오는 모양은 거의 다 만듭니다.\n\n" +
        "· 곡선(C)도 꺾은선과 똑같이 찍으면 부드럽게 이어집니다\n" +
        "· 다 보셨으면 [마치기]를 눌러 주세요",
    },
  ],
};

/* ===================================================================
 * 실습 과제 10 — 문제 그림을 처음부터 끝까지
 *
 * 앞의 코스가 '기능을 하나씩'이라면, 과제는 '그림 한 장을 끝까지'다.
 * 과제마다 **처음 쓰는 도구**를 하나씩 배정해, 열 개를 돌면 5E 의 주요 기능을
 * 한 번씩 다 만져 보게 된다(사용자 요구).
 *
 * 과제는 구조가 같아 데이터로 적고 makeTask() 가 코스로 부풀린다:
 *   parts[] = 배치할 부품 (심볼 id 또는 도구) + 놓을 자리 + 안내문
 * 부품 배치는 좌측 팔레트의 심볼을 누르면 캔버스에 놓이는 5E 의 정식 경로를 그대로 쓴다.
 * =================================================================== */

// 심볼 팔레트 버튼을 찾는다(과목별 오브젝트는 아코디언 안이라 먼저 펴 준다).
function symbolBtn(symbolId) {
  document.querySelectorAll(".tool-section.is-collapsed").forEach((sec) => {
    if (sec.querySelector(`[data-symbol="${symbolId}"]`)) sec.classList.remove("is-collapsed");
  });
  document.querySelectorAll(".subject-part.is-collapsed, .subject-part-section.is-collapsed")
    .forEach((sec) => { if (sec.querySelector(`[data-symbol="${symbolId}"]`)) sec.classList.remove("is-collapsed"); });
  return vis(`[data-symbol="${symbolId}"]`);
}

// 캔버스에 이 종류가 하나라도 늘었는가 — 부품 배치 판정에 쓴다.
// (기준선 비교는 쓰지 않는다 — 절대 개수로 판정한다. makeTask 주석 참고)

/* 과제 하나를 코스로 부풀린다.
 *  spec = { id, title, desc, minutes, intro, figure[], parts[], outro }
 *  parts[i] = { symbol|tool, name, where, tip, type, at }
 *     symbol : 좌측 팔레트 심볼 id (도르래·용수철 등)
 *     tool   : 공통 도구 코드 (L·RECT·Y…)
 *     type   : 놓이면 생기는 오브젝트 type (판정용)
 *     at     : 점선으로 짚어 줄 자리 (world mm 다각형)
 */
function makeTask(spec) {
  const steps = [
    {
      title: spec.title,
      text: spec.intro + "\n\n· 점선이 오늘 만들 그림입니다\n· 점선에 딱 맞지 않아도 됩니다",
      guide: () => spec.figure,
    },
  ];

  spec.parts.forEach((p, i) => {
    const num = ["①", "②", "③", "④", "⑤", "⑥", "⑦"][i] || `${i + 1}.`;
    // 이 부품 앞에 같은 종류가 몇 개 놓였는가 (회로처럼 같은 type 을 여러 번 쓰는 과제용)
    const sameTypeBefore = spec.parts.slice(0, i).filter((q) => q.type === p.type).length;
    // 1) 부품(도구) 고르기
    steps.push({
      target: () => (p.symbol ? (symbolBtn(p.symbol) || "#panel-left") : `[data-tool="${p.tool}"]`),
      title: `${num} ${p.name} 고르기`,
      text: p.where + (p.tip ? `\n\n· ${p.tip}` : ""),
      demo: () => {
        const el = p.symbol ? symbolBtn(p.symbol) : vis(`[data-tool="${p.tool}"]`);
        return el ? { kind: "clicks", at: [el] } : null;
      },
      allowNext: true,
      wait: {
        // 심볼을 누르면 5E 가 그 심볼이 쓰는 도구를 armed 상태로 바꾼다(templates.js).
        // 예전엔 여기서 무조건 true 를 돌려줘 '고르기' 단계가 그냥 지나갔다.
        until: () => {
          const want = p.symbol ? (TEMPLATES[p.symbol]?.create?.tool) : p.tool;
          return want ? state.get().activeTool === want : false;
        },
        hint: `${p.name}을(를) 눌러 주세요`,
      },
    });
    // 2) 캔버스에 놓기
    steps.push({
      target: () => "#canvas",
      title: `${num} 점선 자리에 놓기`,
      text: p.place || "점선 자리에 놓아 주세요.",
      guide: () => [{ pts: p.at, close: p.close !== false, note: p.name, noteDy: -8 }, ...spec.figure.slice(0, 2)],
      demo: () => (p.drag
        ? { kind: "drag", from: p.at[0], to: p.at[2] || p.at[1], mod: p.mod }
        : { kind: "clicks", pts: [p.at[0]], mod: p.mod }),
      allowNext: true,
      wait: {
        // 절대 개수로 본다 — "들어올 때보다 늘었나"로 재면 [이전]으로 돌아왔을 때
        // 기준선이 다시 잡혀 영영 통과하지 못한다. 같은 종류를 여러 개 놓는 과제
        // (회로 부품 3개)를 위해, 앞에 같은 종류가 몇 개 있었는지까지 세어 둔다.
        until: () => countOf(p.type) >= sameTypeBefore + 1,
        hint: "점선 자리에 놓아 주세요",
      },
    });
  });

  steps.push({
    title: "완성되었습니다",
    text: spec.outro + "\n\n· 완성된 그림을 마음껏 조작해 보세요\n· 다 해 보셨으면 [마치기]를 눌러 주세요",
  });

  return { id: spec.id, title: spec.title, desc: spec.desc, minutes: spec.minutes,
           practice: true, next: spec.next || [], task: true, steps };
}

/* ----- 과제별 도면 (world mm) ----- */
const T = {
  ground: [[-38, 22], [38, 22]],
  ceiling: [[-30, -26], [30, -26]],
  box: (x, y, w = 10, h = 8) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
  dot: (c, r = 4) => aimRing(c, r),
};

const TASKS = [
  makeTask({
    id: "task-pulley", title: "P1 · 도르래 두 물체", desc: "줄로 연결된 m₁·m₂ — 역학 단골",
    minutes: 5, next: ["task-spring"],
    intro: "도르래에 줄을 걸고 두 물체를 매다는, 역학에서 가장 많이 나오는 장치입니다.",
    figure: [{ pts: T.ground, close: false }, { pts: T.box(-30, -18, 40, 6), close: true, note: "책상" }],
    parts: [
      { tool: "L", type: "line", name: "책상 윗면", where: "왼쪽 도구 3번째 줄 맨 왼쪽, 사선(╱) 모양입니다.",
        tip: "직선은 두 점을 클릭합니다 (단축키 L)", at: [[-34, 0], [6, 0]], close: false, drag: false,
        place: "두 점을 차례로 클릭해 책상 윗면을 그으세요." },
      { symbol: "pulley", type: "svgAsset", name: "도르래", where: "왼쪽 '과목별 오브젝트 → 역학'에 있습니다.",
        tip: "심볼은 누른 뒤 캔버스를 클릭하면 놓입니다", at: T.dot([8, -2], 5),
        place: "책상 오른쪽 끝, 점선 자리를 클릭해 도르래를 놓으세요." },
      { tool: "RECT", type: "rect", name: "물체 m₁", where: "왼쪽 도구 2번째 줄 맨 오른쪽입니다.",
        tip: "Shift 를 누른 채 끌면 정사각형", at: T.box(-16, -10, 9, 9), drag: true, mod: "Shift 누른 채",
        place: "책상 위 점선 자리에 Shift 를 누른 채 끌어 정사각형으로 만드세요." },
    ],
    outro: "도르래와 줄, 두 물체까지. 나머지 줄은 직선 도구로 이어 주면 완성입니다.",
  }),
  makeTask({
    id: "task-spring", title: "P2 · 용수철 진동", desc: "평형점 기준 진동 그림",
    minutes: 5, next: ["task-pendulum"],
    intro: "스탠드에 용수철을 달고 추를 매다는 그림입니다. 평형점을 점선으로 표시합니다.",
    figure: [{ pts: T.ceiling, close: false }, { pts: T.box(-6, 6, 12, 10), close: true, note: "추" }],
    parts: [
      { symbol: "clamp", type: "apparatus", name: "클램프(스탠드)", where: "'과목별 오브젝트 → 역학'에 있습니다.",
        at: T.dot([-20, 0], 6), place: "왼쪽 점선 자리를 클릭해 스탠드를 세우세요." },
      { symbol: "spring", type: "spring", name: "용수철", where: "'과목별 오브젝트 → 역학'에 있습니다.",
        tip: "끌어서 길이를 정합니다", at: [[0, -20], [0, -20], [0, 4]], drag: true, close: false,
        place: "위에서 아래로 끌어 용수철을 만드세요." },
      { tool: "RECT", type: "rect", name: "추", where: "왼쪽 도구 2번째 줄 맨 오른쪽입니다.",
        at: T.box(-6, 6, 12, 10), drag: true,
        place: "용수철 끝 점선 자리에 추를 끌어 만드세요." },
    ],
    outro: "평형점 점선은 직선 도구로 긋고, 속성에서 '선 종류'를 점선으로 바꾸면 됩니다.",
  }),
  makeTask({
    id: "task-pendulum", title: "P3 · 단진자와 각도", desc: "기준선에서 θ만큼 벗어난 진자",
    minutes: 5, next: ["task-slope"],
    intro: "단진자를 놓고 연직 기준선과의 각 θ 를 표시합니다.",
    figure: [{ pts: T.dot([0, -24], 3), close: true, note: "고정점" }, { pts: [[0, -24], [14, 4]], close: false }],
    parts: [
      { symbol: "pendulum", type: "pendulum", name: "단진자", where: "'과목별 오브젝트 → 역학'에 있습니다.",
        tip: "끌면 줄 길이와 기운 각이 정해집니다", at: [[0, -24], [0, -24], [14, 4]], drag: true, close: false,
        place: "고정점에서 오른쪽 아래로 끌어 진자를 만드세요." },
      { tool: "L", type: "line", name: "연직 기준선", where: "왼쪽 도구 3번째 줄 맨 왼쪽입니다.",
        tip: "Ctrl 을 누른 채 찍으면 완전한 수직", at: [[0, -24], [0, 8]], close: false, mod: "Ctrl 누른 채",
        place: "고정점에서 아래로, 두 점을 클릭해 연직선을 그으세요." },
      { symbol: "anglearc", type: "anglearc", name: "각도 호 θ", where: "왼쪽 도구 4번째 줄 오른쪽(각도) 안에 있습니다.",
        tip: "세 점을 찍어 각을 만듭니다", at: T.dot([3, -10], 5),
        place: "두 선 사이 점선 자리에 각도 호를 놓으세요." },
    ],
    outro: "각도 호에 라벨을 달면 θ 가 됩니다. 최저점에는 '점(N)'을 찍어 두면 깔끔합니다.",
  }),
  makeTask({
    id: "task-slope", title: "P4 · 복합 경사면 활강", desc: "비탈—평지—비탈 위의 물체",
    minutes: 6, next: ["task-circuit"],
    intro: "꺾은선으로 만든 지형 위에 물체를 얹습니다. 코스 6에서 배운 꺾은선을 씁니다.",
    figure: [{ pts: TERRAIN, close: false, note: "지형" }],
    parts: [
      { tool: "P", type: "polyline", name: "지형(꺾은선)", where: "왼쪽 도구 3번째 줄 가운데, 지그재그 모양입니다.",
        tip: "여러 점을 찍고 마지막에 더블클릭", at: TERRAIN, close: false,
        place: "점선의 꼭짓점을 차례로 찍고, 마지막 자리에서 더블클릭 하세요." },
      { tool: "RECT", type: "rect", name: "물체", where: "왼쪽 도구 2번째 줄 맨 오른쪽입니다.",
        at: T.box(-24, 0, 9, 9), drag: true, mod: "Shift 누른 채",
        place: "비탈 위 점선 자리에 Shift 를 누른 채 정사각형으로 만드세요." },
    ],
    outro: "물체를 Shift 로 끌면 비탈에 나란히 눕습니다. 지형에 빗금 채우기를 넣으면 지면 표시가 됩니다.",
  }),
  makeTask({
    id: "task-circuit", title: "P5 · 직류 회로", desc: "전지·저항·전구 직렬 회로",
    minutes: 6, next: ["task-lens"],
    intro: "회로 부품을 늘어놓고 연결선으로 잇습니다. 끝점이 단자에 자석처럼 붙습니다.",
    figure: [{ pts: T.box(-28, -14, 56, 30), close: true, note: "회로" }],
    parts: [
      { symbol: "dc_source", type: "circuit", name: "직류전원", where: "'과목별 오브젝트 → 전기자기학'에 있습니다.",
        tip: "끌어서 크기를 정합니다", at: [[-28, -14], [-28, -14], [-28, 2]], drag: true, close: false,
        place: "왼쪽 점선 자리에 전원을 놓으세요." },
      { symbol: "resistor", type: "circuit", name: "저항", where: "같은 '전기자기학' 칸에 있습니다.",
        at: [[-14, -14], [-14, -14], [4, -14]], drag: true, close: false,
        place: "위쪽 점선 자리에 저항을 놓으세요." },
      { symbol: "lamp", type: "circuit", name: "전구", where: "같은 '전기자기학' 칸에 있습니다.",
        at: [[16, -14], [16, -14], [28, -2]], drag: true, close: false,
        place: "오른쪽 점선 자리에 전구를 놓으세요." },
    ],
    outro: "부품 사이는 '회로 연결선'으로 잇습니다. 끝점을 단자 가까이 가져가면 딱 붙습니다.",
  }),
  makeTask({
    id: "task-lens", title: "P6 · 볼록렌즈 상 작도", desc: "광학 작도의 표준형",
    minutes: 6, next: ["task-wave"],
    intro: "볼록렌즈와 물체를 놓고 광선을 그어 상을 작도합니다.",
    figure: [{ pts: [[-38, 0], [38, 0]], close: false, note: "광축" }],
    parts: [
      { tool: "L", type: "line", name: "광축", where: "왼쪽 도구 3번째 줄 맨 왼쪽입니다.",
        tip: "Ctrl 을 누르면 완전한 수평", at: [[-38, 0], [38, 0]], close: false, mod: "Ctrl 누른 채",
        place: "가운데를 가로지르는 광축을 두 점으로 그으세요." },
      { symbol: "convex_lens", type: "optics", name: "볼록렌즈", where: "'과목별 오브젝트 → 파동 및 광학'에 있습니다.",
        at: [[0, -16], [0, -16], [0, 16]], drag: true, close: false,
        place: "가운데 점선 자리에 렌즈를 세우세요." },
      { symbol: "object_arrow", type: "optics", name: "물체(화살표)", where: "같은 '파동 및 광학' 칸에 있습니다.",
        at: [[-24, 0], [-24, 0], [-24, -12]], drag: true, close: false,
        place: "렌즈 왼쪽 점선 자리에 물체를 세우세요." },
    ],
    outro: "광선은 직선에 화살표를 달아 긋습니다. 끝점이 물체 머리에 자석처럼 붙습니다.",
  }),
  makeTask({
    id: "task-wave", title: "P7 · 정상파 실험", desc: "줄의 정상파 — 마디와 배",
    minutes: 5, next: ["task-field"],
    intro: "줄에 생긴 정상파를 그리고, 마디와 배에 이름표를 붙입니다.",
    figure: [{ pts: [[-32, 0], [32, 0]], close: false, note: "줄" }],
    parts: [
      { symbol: "stw_string", type: "standingwave", name: "정상파(줄)", where: "오브젝트 검색(Ctrl+F)에서 '정상파'로 찾습니다.",
        tip: "접혀 있는 항목이라 검색이 빠릅니다", at: [[-32, -10], [-32, -10], [32, 10]], drag: true, close: false,
        place: "점선 자리에 끌어 정상파를 만드세요." },
      { symbol: "labeler", type: "labeler", name: "라벨러(지시선)", where: "왼쪽 도구 4번째 줄 가운데(텍스트) 안, 아래쪽 항목입니다.",
        tip: "단축키 Shift+T — 지시선이 달린 이름표입니다", at: T.dot([-16, -14], 5),
        place: "마디를 가리킬 자리에 라벨러를 놓으세요." },
    ],
    outro: "줄 길이는 '자' 도구로 재서 L 로 표시하면 문항 그림이 완성됩니다.",
  }),
  makeTask({
    id: "task-field", title: "P8 · 점전하 전기력선", desc: "+q·−q 주위의 전기장",
    minutes: 5, next: ["task-graph"],
    intro: "두 점전하 주위의 전기력선을 그리고, 한 지점의 장 방향을 화살표로 표시합니다.",
    figure: [{ pts: T.box(-26, -16, 52, 32), close: true, note: "전기력선" }],
    parts: [
      { symbol: "ef_pair", type: "chargefield", name: "전기력선(쌍)", where: "오브젝트 검색(Ctrl+F)에서 '전기력선'으로 찾습니다.",
        at: [[-26, -16], [-26, -16], [26, 16]], drag: true, close: false,
        place: "점선 자리에 끌어 전기력선을 만드세요." },
      { tool: "C", type: "curve", name: "등전위선(곡선)", where: "왼쪽 도구 3번째 줄 맨 오른쪽입니다.",
        tip: "꺾은선처럼 찍고 더블클릭으로 완성", at: [[0, -20], [6, -8], [0, 4], [-6, 16]], close: false,
        place: "점을 찍어 등전위선을 그리고 더블클릭으로 끝내세요." },
    ],
    outro: "등전위선은 속성에서 '선 종류'를 점선으로 바꾸면 관례에 맞습니다.",
  }),
  makeTask({
    id: "task-graph", title: "P9 · v–t 그래프 문항", desc: "속도-시간 그래프와 넓이",
    minutes: 6, next: ["task-remix"],
    intro: "좌표평면을 만들고 그 위에 그래프를 그립니다. 넓이가 이동 거리인 그 그림입니다.",
    figure: [{ pts: T.box(-30, -20, 56, 40), close: true, note: "좌표평면" }],
    parts: [
      { tool: "F", type: "coordplane", name: "좌표/함수 생성", where: "왼쪽 맨 아래 '고급 기능'의 [좌표/함수 생성] 입니다.",
        tip: "단축키 F — 창에서 축 범위를 정합니다", at: T.box(-30, -20, 56, 40), drag: true,
        place: "창에서 만들기를 누르면 좌표평면이 놓입니다." },
      { tool: "P", type: "polyline", name: "그래프(꺾은선)", where: "왼쪽 도구 3번째 줄 가운데입니다.",
        at: [[-26, 14], [-8, -8], [10, -8], [24, 14]], close: false,
        place: "점을 차례로 찍어 v–t 그래프를 그리고 더블클릭으로 끝내세요." },
    ],
    outro: "넓이 부분은 사각형을 겹쳐 놓고 '채우기 종류'를 빗금으로 하면 표시됩니다.",
  }),
  makeTask({
    id: "task-remix", title: "P10 · 기출 변형 문제", desc: "종합 — 실전 흐름 그대로",
    minutes: 6, next: [],
    intro: "지금까지 배운 것을 한 번에 씁니다. 기출을 가져와 고치고, 페이지를 나눠 원본과 변형을 나란히 둡니다.",
    figure: [{ pts: T.box(-30, -18, 60, 36), close: true, note: "가져온 그림" }],
    parts: [
      { tool: "RECT", type: "rect", name: "표시용 상자", where: "왼쪽 도구 2번째 줄 맨 오른쪽입니다.",
        tip: "바꿀 부분을 네모로 표시해 두면 나중에 찾기 쉽습니다", at: T.box(-10, -8, 20, 16), drag: true,
        place: "고칠 부분에 표시용 상자를 그려 두세요." },
    ],
    outro:
      "이제 페이지 탭에서 우클릭 → 복제로 원본과 변형을 나란히 두고,\n" +
      "파일 → 이미지로 내보내기의 '모든 페이지'로 폴더 하나에 한꺼번에 뽑으면 끝입니다.",
  }),
];

/* ===================================================================
 * 시범 과제 P0 — 기출 도판 한 장을 끝까지 (2027학년도 6월 물리Ⅱ 13번)
 *
 * 기존 P1~P10 은 '부품 2~3개 놓기'로 끝나 기출 도판 요소의 일부만 실습한다
 * (docs/TUTORIAL_TASK_REDESIGN_20260727.md). 이 과제는 그 대안을 하나만 만들어
 * 판단받기 위한 시범이다. 통과하면 같은 틀로 나머지를 다시 쓴다.
 *
 * 다른 점 셋:
 *   ① 목표가 실제 기출 도판이다 — `compare` 로 원본을 나란히 띄운다
 *   ② 뼈대 → 이름표 → 치수 → 마감 4국면을 모두 지난다 (치수선·점선·채움 포함)
 *   ③ 난이도 '쉬움'이면 각 단계의 auto 가 자동 실행돼 만들어지는 과정만 보게 된다
 *      (tutorial.js showStep 의 autoPlay). 그래서 **모든 제작 단계에 auto 가 있어야 한다.**
 *
 * ⚠ 좌표는 머리로 짜지 않았다. mcp-5e 로 실제 앱에 그려 놓고 export_image 로 눈으로
 *   보며 고친 결과를 그대로 옮겼다(2026-07-28). 손으로 어림한 앞 판은 글자가 지형선을
 *   덮고 띠가 비탈에서 떨어져 나가 못 쓸 그림이 나왔다. 좌표를 고칠 일이 생기면
 *   **다시 MCP 로 그려 보고 고칠 것.** 숫자만 만지면 같은 실수를 반복한다.
 *
 * 아트보드는 130×40mm — 원본 도판이 가로로 긴 비율(약 3.7:1)이라 기본 90×60 에 그리면
 * 그림이 눌리고 글자만 커 보인다. 그래서 첫 단계가 '아트보드 비율 맞추기'다.
 * =================================================================== */

/* 좌표는 원본 PNG(1199×324px)를 픽셀로 재서 130mm 판으로 환산한 값이다
 * (1px = 0.1084mm, 원점 = 이미지 중심). 재현이 어긋나면 이 환산부터 다시 한다. */
const EX = {
  id: "p2_2027_06_13",       // assets/exam-library/images/<id>.png
  board: { w: 130, h: 40 },  // 원본 비율(약 3.7:1)에 맞춘 아트보드
  ground: 9.2,               // 수평면 y
  p: [-54.5, -13],           // 5h 높이 출발점
  slopeFoot: [-17.4, 9.2],   // 비탈이 바닥에 닿는 꼭짓점(필렛 전 기준점)
  flatEnd: [9.8, 9.2],
  topStart: [24.4, -1.08],   // 2h 높이 평지 시작
  right: [59.7, -1.08],
  qDot: [-14.9, 9.2],        // q 표시점 — 필렛이 끝난 자리
  terrainSW: 0.35,           // 지형선은 굵다. 치수·점선은 0.22
  round: 1.5,                // 경사면처리 back-off (mm) — 2.5 는 과해 상승부가 통째로 S자가 된다
};
EX.terrain = [EX.p, EX.slopeFoot, EX.flatEnd, EX.topStart, EX.right];
// 비탈은 p 위로 조금 더 뻗어 있다(원본)
EX.slopeTail = [[-57.8, -14.98], EX.p];

/* 마찰 구간 = 표면 '아래'에 붙는 회색 띠. 회전 사각형 대신 닫힌 꺾은선(다각형)으로
 * 만든다 — rect 의 rotation 은 중심 기준이라 비탈에 붙는 자리를 계산하기 번거롭다.
 *
 * ⚠ 방향: 법선은 진행 방향의 **오른쪽(= 화면 아래쪽)**이다. 원본 도판에서 마찰 구간은
 *   지면의 두께처럼 표면 아래로 들어간다 — 위로 얹으면 물체가 타고 넘는 장애물처럼
 *   보인다(실제로 그렇게 잘못 그렸다가 지적받았다). */
function bandQuad([ax, ay], [bx, by], t) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len * t, ny = dx / len * t;
  return [[ax, ay], [bx, by], [bx + nx, by + ny], [ax + nx, ay + ny]];
}
/* ⚠ 비탈 위 띠는 **좌표를 재서 넣지 않는다.** 원본 픽셀을 재서 넣었더니 비탈선보다
 *   3mm 아래에 떠 버렸다(선과 따로 노는 그림). 띠는 비탈선 위에 있어야 하고, 세로 폭이
 *   정확히 h(= h 치수가 재는 구간)여야 한다 — 그래서 **비탈선에서 계산한다.** */
const slopeM = (EX.slopeFoot[1] - EX.p[1]) / (EX.slopeFoot[0] - EX.p[0]);
const onSlope = (y) => [EX.p[0] + (y - EX.p[1]) / slopeM, y];

EX.dimH = [[-46.6, -3.36], [-46.6, 0.87]];    // h 치수가 재는 높이 구간
EX.bandI = [onSlope(EX.dimH[0][1]), onSlope(EX.dimH[1][1])];
EX.bandIT = 1.4;
EX.bandII = [[-11.9, EX.ground], [7.1, EX.ground]];
EX.bandIII = [[26.6, -1.08], [47.2, -1.08]];  EX.bandFlatT = 1.0;
EX.objR = 1.3;                                 // 정지한 물체 반지름(원본 기준)
// 띠가 표면 아래로 들어가므로 물체는 표면선 위에 그대로 앉는다(원본과 같다).
EX.objC = [36, -1.08 - EX.objR];
EX.objBox = [EX.objC[0] - EX.objR, EX.objC[1] - EX.objR, EX.objR * 2, EX.objR * 2];
// 출발 위치 표시 — 원본은 p 옆에 점선 원을 두어 '여기 있던 물체'를 나타낸다
EX.startRing = [-53.3, -15.2];
EX.startRingR = 1.5;
// 치수선 자리 — 그림 바깥으로 빼야 읽힌다. d 는 띠 전체가 아니라 왼쪽 일부만 잰다(원본).
EX.dim5h = [[-57.2, EX.p[1]], [-57.2, EX.ground]];
EX.dim2h = [[58.1, -1.08], [58.1, EX.ground]];
EX.dimD = [[27.2, 2.28], [35.6, 2.28]];
EX.groundLine = [[-62, EX.ground], [61, EX.ground]];
/* 치수가 어디를 재는지 가리키는 안내 점선.
 * h 의 두 안내선은 **띠의 양 끝까지** 가야 한다 — 임의의 x 로 끊으면 허공을 가리켜
 * "무엇을 재는 치수인지" 알 수 없게 된다(실제로 그랬다). 그래서 bandI 에서 뽑는다. */
EX.guides = [
  [EX.dim5h[0], [-51.5, EX.p[1]]],
  [EX.dimH[0], [EX.bandI[0][0] + 0.6, EX.dimH[0][1]]],
  [EX.dimH[1], [EX.bandI[1][0] + 0.5, EX.dimH[1][1]]],
  [EX.right, [61, EX.right[1]]],
];
/* 속도 화살표는 비탈과 **나란해야** 한다 — 각도가 다르면 비탈을 벗어난 것처럼 보인다.
 * 시작점만 정하고 끝점은 비탈 방향으로 6.75mm 나아간 자리로 계산한다. */
EX.vArrow = (() => {
  const a = [-51.3, -14.25];
  const len = Math.hypot(1, slopeM);
  const k = 6.75;
  return [a, [a[0] + k / len, a[1] + k * slopeM / len]];
})();

const LABEL_MM = 3;      // 구간 이름표 — 기본 3.7mm 는 지형선을 침범한다
const MARK_MM = 3.2;     // p·q 같은 한 글자 이름표
const NOTE_MM = 3.4;     // 정지·v

const pt = ([x, y]) => ({ x, y });

function newPoly(pts, { closed = false, gray = null, dash = 0, noStroke = false,
  round = 0, sw = null } = {}) {
  const o = makePolyline(pts.map(pt));
  delete o.id;
  o.closed = closed;
  if (gray !== null) { o.fillLevel = gray; o.fillNone = false; o.fillStyle = "solid"; }
  if (dash) { o.dashLength = dash; o.dashGap = dash * 0.8; }
  // 기출의 마찰 구간 띠는 테두리가 없는 회색 면이다 — 선을 그으면 지형선과 겹쳐 지저분해진다.
  if (noStroke) o.strokeWidth = 0;
  else if (sw !== null) o.strokeWidth = sw;
  // 경사면처리 — 원본 도판의 지형은 꺾인 곳이 각지지 않고 둥글다(가장 눈에 띄는 차이였다)
  if (round) { o.rounded = true; o.cornerRadius = round; }
  return o;
}
function newEllipse(cx, cy, r, { gray = 255, sw = DEFAULT_STROKE_WIDTH, dash = 0, hollow = false } = {}) {
  const o = applyNewObjectStyleDefaults({
    type: "ellipse", x: cx - r, y: cy - r, w: r * 2, h: r * 2, rotation: 0,
    strokeWidth: sw,
    fillNone: hollow, fillLevel: gray, fillStyle: "solid",
  });
  if (dash) { o.dashLength = dash; o.dashGap = dash * 0.85; }
  return o;
}
// 길이표시(치수선) — 5E 의 lineMode "lengthArrow" + dimensionLabel 이 그대로 기출 치수선이다.
function newDim(a, b, label) {
  const o = newLine(pt(a), pt(b));
  o.lineMode = "lengthArrow";
  o.lineStyle = "lengthArrow";
  o.dimensionVariant = "bothBars";
  o.dimensionLabel = label;
  o.strokeWidth = 0.22;
  return o;
}
/* 점선 — 값을 손으로 정하지 않고 **앱의 선 종류 프리셋**(인스펙터 점선1·2·3)을 쓴다.
 * 임의의 값(1.1/0.7 등)을 넣으면 인스펙터에서 어느 프리셋도 선택 상태로 보이지 않아,
 * 사용자가 같은 선을 다시 만들 방법을 배울 수 없다(사용자 지적).
 *   기준선(수평면) = 점선3(긴 파선) · 안내선 = 점선2 · 표시용 원 = 점선1 */
const DASH = { d1: [0.2, 0.2], d2: [0.5, 0.3], d3: [1.0, 0.3] };
function newDash(a, b, kind = "d2") {
  const [len, gap] = DASH[kind] || DASH.d2;
  const o = newLine(pt(a), pt(b));
  o.dashLength = len;
  o.dashGap = gap;
  o.strokeWidth = 0.22;
  return o;
}
function newArrow(a, b, sw = 0.3) {
  const o = newLine(pt(a), pt(b));
  o.lineMode = "arrow";
  o.lineStyle = "arrow";
  o.arrowVariant = "right";
  o.arrowHead = "end";
  o.strokeWidth = sw;
  return o;
}
/* 물리량 글자(v·m·F…) — 기출은 물리량을 세리프 이탤릭으로 쓴다.
 * 치수 라벨(5h·d)은 5E 가 자동으로 이 서체를 쓰지만, 자유 텍스트는 지정해야 한다. */
function newQuantity(x, y, text, size = DEFAULT_TEXT_SIZE_MM) {
  const o = newText(x, y, text, size);
  o.fontFamily = EQUATION_FONT_FAMILY;
  o.fontStyle = "italic";
  o.italic = true;
  return o;
}
/* 이름표(한글·점 이름) — 기출 도판의 글자는 고딕이 아니라 **명조**다.
 * 돋움으로 넣으면 원본과 확연히 달라 보인다(사용자 지적). 5E 의 라벨 기본 글꼴
 * (신명중명조)과 같은 것을 쓴다. */
function newLabelText(x, y, text, size = DEFAULT_TEXT_SIZE_MM) {
  const o = newText(x, y, text, size);
  o.fontFamily = OBJECT_LABEL_TEXT_FONT_FAMILY;
  return o;
}
/* 위치 표시점(p·q) — **타원으로 흉내내지 않고 진짜 '점' 객체를 만든다.**
 * 예전엔 검은 타원(r 0.7 = 지름 1.4mm)을 놓았는데, 점 도구의 기본 크기를 줄여도
 * 튜토리얼 그림의 점만 옛 크기로 남았다(사용자 지적). 점 도구가 만드는 것과 같은
 * 객체를 같은 기본 크기로 놓으면 다시 어긋날 일이 없다. */
function newNode(cx, cy) {
  const sz = NODE_DEFAULT_SIZE;
  return applyNewObjectStyleDefaults({
    type: "optics", kind: "node",
    x: cx - sz / 2, y: cy - sz / 2, w: sz, h: sz,
    rotation: 0, strokeLevel: 0, strokeWidth: 0.3,
    fillLevel: 255, fillNone: true,
    label: "", showLabel: false, labelPos: "above", labelType: "quantity",
    dashLength: 0, dashGap: 0,
  });
}
function newSolid(a, b, sw) {
  const o = newLine(pt(a), pt(b));
  o.strokeWidth = sw;
  return o;
}
// 회색 띠 하나 — 표면(a→b) 위에 얹힌 테두리 없는 면
function newBand(a, b, t) {
  return newPoly(bandQuad(a, b, t), { closed: true, gray: 200, noStroke: true });
}
/* 아트보드(페이지) 크기 — mcp-bridge.setArtboard 와 같은 경로.
 * 기출 재현은 비율 맞추기가 먼저다: 세로로 긴 판에 가로로 긴 그림을 그리면
 * 그림만 작아지고 글자는 그대로라 전부 어그러진다. */
function setBoard({ w, h }) {
  state.update((s) => {
    s.undoStack.push(JSON.parse(JSON.stringify(s.objects)));
    s.redoStack = [];
    s.artboard = { w, h };
  });
}

// 지형 꺾은선(닫히지 않은 폴리선) — 경사면처리 단계에서 이것을 골라 준다
const terrainPoly = () => objects().find((o) => o.type === "polyline" && !o.closed);
/* 인스펙터의 '경사면처리' 줄 — id 가 없어 라벨 글자로 찾는다.
 * 아직 나타나지 않았으면(객체 미선택 등) 오른쪽 패널 전체를 짚는다. */
function roundRowEl() {
  const lbl = byText("경사면처리");
  return (lbl && lbl.closest(".insp-row")) || "#panel-right";
}

// 판정: 길이표시 선이 하나라도 있는가 / 점선이 하나라도 있는가 / 회색으로 채운 다각형이 있는가
const hasDim = () => objects().some((o) => o.type === "line" && o.lineMode === "lengthArrow");
const hasDash = () => objects().some((o) => (o.type === "line" || o.type === "polyline") && o.dashLength > 0);
const hasBand = () => objects().some((o) => o.type === "polyline" && o.closed && !o.fillNone && o.fillLevel < 240);

const EXAM_TASK_INCLINE = {
  id: "task-exam-incline",
  title: "P0 · 빗면과 마찰 구간 (시범)",
  desc: "기출 도판 한 장을 끝까지 — 치수선·점선·채움까지",
  minutes: 10,
  practice: true,
  task: true,
  next: [],
  steps: [
    /* ---------- 국면 0: 목표 확인 ---------- */
    {
      title: "오늘 만들 그림",
      text:
        "2027학년도 6월 물리Ⅱ 13번 도판입니다. 아래 단추로 원본을 먼저 보세요.\n\n" +
        "· 점선이 만들 자리입니다 — 딱 맞지 않아도 됩니다\n" +
        "· 판 맞추기 → 지형 → 이름표 → 치수 → 마감 순으로 갑니다\n" +
        "· 스페이스바를 누르면 [다음]과 같습니다",
      guide: () => [{ pts: EX.terrain, close: false, note: "지형", noteDy: -6 }],
      // 아직 아무것도 안 그렸으므로 '비교'가 아니라 원본만 보여 준다(빈 칸과 비교할 수 없다).
      exam: EX.id,
      examNote: "이것이 목표 도판입니다. 다 만든 뒤 마지막 단계에서 내 그림과 나란히 비교합니다.",
    },

    /* ---------- 국면 1: 판 비율 맞추기 ---------- */
    {
      target: () => vis(".insp-ab-presets") || "#panel-right",
      title: "① 먼저 판을 원본 비율로",
      text:
        "기출 도판은 가로로 깁니다. 기본 판(90×40)에 그대로 그리면 그림만 작아지고\n" +
        "글자는 그대로라 도판이 어그러집니다. 그래서 판부터 맞춥니다.\n\n" +
        "· 오른쪽 패널 맨 위 '아트보드'에서 가로 130, 세로 40 으로 바꿉니다\n" +
        "· 아무것도 선택하지 않았을 때만 보이는 칸입니다\n" +
        "· 기출 재현은 언제나 이 순서입니다 — 판 먼저, 그림 나중",
      allowNext: true,
      auto: { label: "130 × 40 으로 맞추기", run: () => setBoard(EX.board) },
      wait: {
        until: () => (state.get().artboard?.w || 0) >= 110,
        hint: "가로를 130 으로 바꿔 주세요",
      },
    },

    /* ---------- 국면 2: 뼈대 ---------- */
    {
      target: () => '[data-tool="P"]',
      title: "② 지형 — 꺾은선 도구",
      text:
        "비탈–바닥–비탈–평지가 이어진 지형입니다. 선을 네 번 잇는 대신 꺾은선 하나로 만듭니다.\n\n" +
        "· 왼쪽 도구 3번째 줄 가운데, 지그재그 모양입니다 (단축키 P)",
      demo: () => ({ kind: "clicks", at: ['[data-tool="P"]'] }),
      auto: { label: "꺾은선 도구 켜기", run: () => setActiveTool("P") },
      wait: { until: () => state.get().activeTool === "P", hint: "꺾은선 도구를 눌러 주세요" },
    },
    {
      target: () => "#canvas",
      title: "② 꼭짓점을 차례로 찍습니다",
      text:
        "점선의 꼭짓점 다섯 곳을 왼쪽부터 차례로 누르고, 마지막 자리에서 더블클릭으로 끝냅니다.\n\n" +
        "· 지금은 모서리가 각집니다 — 둥글게 만드는 것은 바로 다음 단계입니다\n" +
        "· 지형선은 다른 선보다 굵게(0.35mm) 두는 것이 기출 관례입니다\n" +
        "· 잘못 찍었으면 Esc 로 취소하고 다시 합니다",
      guide: () => [{ pts: EX.terrain, close: false, note: "여기가 지형", noteDy: -6 }],
      demo: () => ({ kind: "clicks", pts: EX.terrain }),
      allowNext: true,
      auto: {
        label: "대신 그려 주기",
        // 여기서는 **각진 채로** 만든다 — 둥글게 하는 것을 다음 단계에서 눈으로 보여 주려면
        // 이 단계의 결과가 반드시 각져 있어야 한다(먼저 둥글게 만들면 배울 것이 사라진다).
        run: () => placeObjects([
          newPoly(EX.terrain, { sw: EX.terrainSW }),
          newSolid(EX.slopeTail[0], EX.slopeTail[1], EX.terrainSW),
        ], { allowDup: true }),
      },
      wait: { until: () => countOf("polyline") >= 1, hint: "꼭짓점을 차례로 찍어 주세요" },
    },
    /* ----- 경사면처리: 원본과 가장 크게 갈리는 지점이라 한 단계를 온전히 쓴다 ----- */
    {
      // 폴리선이 골라져 있어야 오른쪽에 '경사면처리' 칸이 나타난다 → action 에서 골라 준다.
      action: () => {
        const poly = terrainPoly();
        if (poly) state.update((s) => { s.selectedIds = [poly.id]; });
      },
      target: () => roundRowEl(),
      title: "② 모서리를 둥글게 — 경사면처리",
      text:
        "지금 지형은 모서리가 칼처럼 각져 있습니다. 기출 도판의 지형은 꺾인 곳이 둥글게\n" +
        "처리돼 있습니다 — 이 차이가 도판의 인상을 가장 크게 바꿉니다.\n\n" +
        "· 지형을 고른 상태에서 오른쪽 '선' 칸의 [경사면처리]를 켜세요\n" +
        "· 바로 아래 '곡률 반경'으로 둥근 정도를 정합니다 (여기서는 " + EX.round + "mm)\n" +
        "· 꼭짓점은 그대로 남습니다 — 그리기를 다시 하지 않아도 되고, 나중에 꼭짓점을\n" +
        "  옮기면 둥근 처리가 따라옵니다",
      guide: () => [{ pts: EX.terrain, close: false }],
      demo: () => {
        const el = roundRowEl();
        return typeof el === "string" ? null : { kind: "clicks", at: [el] };
      },
      allowNext: true,
      auto: {
        label: "경사면처리 켜기",
        run: () => state.update((s) => {
          const o = s.objects.find((x) => x.type === "polyline" && !x.closed);
          if (!o) return;
          s.undoStack.push(JSON.parse(JSON.stringify(s.objects)));
          s.redoStack = [];
          o.rounded = true;
          o.cornerRadius = EX.round;
        }),
      },
      wait: {
        until: () => objects().some((o) => o.type === "polyline" && !o.closed && o.rounded),
        hint: "[경사면처리]를 켜 주세요",
      },
    },
    {
      target: () => '[data-tool="O"]',
      title: "③ 정지한 물체 — 타원 도구",
      text:
        "오른쪽 평지에 멈춰 있는 물체는 작은 원입니다.\n\n" +
        "· 왼쪽 도구 2번째 줄, 타원 모양입니다 (단축키 O)\n" +
        "· Shift 를 누른 채 끌면 완전한 원이 됩니다",
      demo: () => ({ kind: "clicks", at: ['[data-tool="O"]'] }),
      auto: { label: "타원 도구 켜기", run: () => setActiveTool("O") },
      wait: { until: () => state.get().activeTool === "O", hint: "타원 도구를 눌러 주세요" },
    },
    {
      target: () => "#canvas",
      title: "③ 평지 위에 원을 놓습니다",
      text:
        "점선 자리를 Shift 를 누른 채 끌어 원을 만드세요.\n\n" +
        "· 지면에 살짝 얹힌 정도가 기출 도판의 관례입니다",
      guide: () => [
        { pts: T.box(...EX.objBox), close: true, note: "물체", noteDy: -6 },
        { pts: EX.terrain, close: false },
      ],
      demo: () => ({
        kind: "drag",
        from: [EX.objBox[0], EX.objBox[1]],
        to: [EX.objBox[0] + EX.objBox[2], EX.objBox[1] + EX.objBox[3]],
        mod: "Shift 누른 채",
      }),
      allowNext: true,
      auto: {
        label: "대신 그려 주기",
        run: () => placeObjects([newEllipse(EX.objC[0], EX.objC[1], EX.objR, { sw: 0.28 })], { allowDup: true }),
      },
      wait: { until: () => countOf("ellipse") >= 1, hint: "점선 자리에 원을 만들어 주세요" },
    },

    /* ---------- 국면 2: 이름표 ---------- */
    {
      target: () => vis('.tool-chooser-opt[data-tool="T"]') || "#tool-text-merged",
      coachSide: "below",
      title: "④ 이름표 — 텍스트 도구",
      text:
        "기출 도판은 글자가 절반입니다. p·q·정지·수평면·마찰 구간까지 일곱 개를 넣습니다.\n\n" +
        "· 이 단추를 누르면 '텍스트'와 '라벨러' 중 하나를 고르는 창이 뜹니다\n" +
        "· 위쪽 '텍스트'를 고르세요 (단축키 T)",
      demo: () => ({ kind: "clicks", at: [vis('.tool-chooser-opt[data-tool="T"]') || vis("#tool-text-merged")] }),
      auto: { label: "텍스트 도구 켜기", run: () => setActiveTool("T") },
      wait: { until: () => state.get().activeTool === "T", hint: "텍스트를 고르세요" },
    },
    {
      target: () => "#canvas",
      title: "④ '정지'를 직접 적어 봅니다",
      text:
        "물체 위 점선 자리를 누르면 입력칸이 열립니다. '정지'를 적고 Ctrl+Enter 로 확정하세요.\n\n" +
        "· 확정이 Enter 가 아니라 Ctrl+Enter 인 점만 손에 익히면 됩니다\n" +
        "· 나머지 여섯 개는 다음 단계에서 한꺼번에 넣어 드립니다",
      guide: () => [
        { pts: T.box(32.2, -7.9, 8, 3.6), close: true, note: "여기에 '정지'", noteDy: -5 },
        { pts: EX.terrain, close: false },
      ],
      demo: () => ({ kind: "clicks", pts: [[32.2, -7.9]] }),
      allowNext: true,
      auto: { label: "대신 적어 주기", run: () => placeObjects([newLabelText(32.2, -7.9, "정지", NOTE_MM)], { allowDup: true }) },
      wait: { until: () => countOf("text") >= 1, hint: "'정지'를 적고 Ctrl+Enter" },
    },
    {
      target: () => "#canvas",
      title: "④ 남은 이름표와 위치 점",
      text:
        "p·q 위치 점과 이름표 여섯 개를 한꺼번에 넣습니다. 같은 요령을 여섯 번 반복하는 것뿐입니다.\n\n" +
        "· 위치 점은 타원이 아니라 '점' 도구로 만듭니다 — 크기가 정해져 있어 그림마다 같습니다\n" +
        "· 점 크기를 바꾸려면 점을 고르고 오른쪽 '점 지름'에 숫자를 넣습니다\n" +
        "· 원본처럼 p 는 비탈 꼭대기, q 는 바닥이 시작되는 곳입니다\n" +
        "· 구간 이름의 로마숫자는 {roman1} 처럼 적으면 Ⅰ·Ⅱ·Ⅲ 정체로 나옵니다",
      guide: () => [{ pts: EX.terrain, close: false }],
      auto: {
        label: "이름표 여섯 개 넣기",
        run: () => placeObjects([
          newNode(EX.p[0], EX.p[1]),
          newNode(EX.qDot[0], EX.qDot[1]),
          newLabelText(-55.4, -12.2, "p", MARK_MM),
          newLabelText(-16, 9.9, "q", MARK_MM),
          newLabelText(51.6, 10.6, "수평면", LABEL_MM),
          /* 구간 이름표는 띠에서 한 칸 떨어뜨린다 — 붙이면 글자와 회색 면이 겹쳐 어색하다
           * (사용자 지적). 띠의 아래 모서리에서 최소 1.5mm 아래로 둔다. */
          newLabelText(-43.5, 4.8, "마찰 구간 {roman1}", LABEL_MM),
          newLabelText(-11.4, 11.4, "마찰 구간 {roman2}", LABEL_MM),
          newLabelText(27.4, 4.4, "마찰 구간 {roman3}", LABEL_MM),
        ], { allowDup: true }),
      },
    },

    /* ---------- 국면 3: 치수 ---------- */
    {
      target: () => ['[data-tool="L"]', "#panel-right"],
      title: "⑤ 치수 — 직선을 '길이표시'로 바꿉니다",
      text:
        "5h·h·2h·d 같은 치수는 별도 도구가 아닙니다. 직선을 하나 그은 뒤,\n" +
        "오른쪽 속성 패널에서 선 종류를 '길이표시'로 바꾸면 양끝 막대가 달린 치수선이 됩니다.\n\n" +
        "· 먼저 직선 도구를 켜세요 (단축키 L)\n" +
        "· 길이표시로 바꾸면 가운데에 글자 칸이 생깁니다 — 거기에 5h 를 적습니다",
      demo: () => ({ kind: "clicks", at: ['[data-tool="L"]'] }),
      auto: { label: "직선 도구 켜기", run: () => setActiveTool("L") },
      wait: { until: () => state.get().activeTool === "L", hint: "직선 도구를 눌러 주세요" },
    },
    {
      target: () => ["#canvas", "#panel-right"],
      title: "⑤ 5h 치수선 만들기",
      text:
        "점선 자리에 위아래로 직선을 하나 긋고, 오른쪽 속성에서 '길이표시'를 고른 뒤\n" +
        "글자 칸에 5h 를 적으세요.\n\n" +
        "· Ctrl 을 누른 채 찍으면 완전한 수직이 됩니다\n" +
        "· 막대 모양은 '양쪽 막대'가 기출 관례입니다",
      guide: () => [
        { pts: EX.dim5h, close: false, note: "5h", noteDy: -4 },
        { pts: EX.terrain, close: false },
      ],
      demo: () => ({ kind: "clicks", pts: EX.dim5h, mod: "Ctrl 누른 채" }),
      allowNext: true,
      auto: {
        label: "대신 만들어 주기",
        run: () => placeObjects([newDim(EX.dim5h[0], EX.dim5h[1], "5h")], { allowDup: true }),
      },
      wait: { until: hasDim, hint: "선을 긋고 '길이표시'로 바꿔 주세요" },
    },
    {
      target: () => "#canvas",
      title: "⑤ 남은 치수 h · 2h · d",
      text:
        "같은 방법으로 세 개를 더 넣습니다. h 는 마찰 구간 Ⅰ 의 높이, 2h 는 오른쪽 평지 높이,\n" +
        "d 는 마찰 구간 Ⅲ 의 길이입니다.\n\n" +
        "· 치수는 그림 바깥으로 빼야 선과 겹치지 않고 읽힙니다",
      guide: () => [{ pts: EX.terrain, close: false }],
      auto: {
        label: "치수 세 개 넣기",
        run: () => placeObjects([
          newDim(EX.dimH[0], EX.dimH[1], "h"),
          newDim(EX.dim2h[0], EX.dim2h[1], "2h"),
          newDim(EX.dimD[0], EX.dimD[1], "d"),
        ], { allowDup: true }),
      },
    },

    /* ---------- 국면 4: 마감 ---------- */
    {
      target: () => ["#canvas", "#panel-right"],
      title: "⑥ 마감 — 수평면 점선",
      text:
        "기준선은 실선이 아니라 점선입니다. 그림 전체를 가로지르는 직선을 하나 긋고,\n" +
        "오른쪽 속성의 '선 종류'에서 점선을 고르세요.\n\n" +
        "· Ctrl 을 누른 채 찍으면 완전한 수평입니다\n" +
        "· 점선 길이·간격은 기본값이면 충분합니다",
      guide: () => [
        { pts: EX.groundLine, close: false, note: "수평면", noteDy: 6 },
        { pts: EX.terrain, close: false },
      ],
      demo: () => ({ kind: "clicks", pts: EX.groundLine, mod: "Ctrl 누른 채" }),
      allowNext: true,
      auto: {
        label: "대신 만들어 주기",
        run: () => placeObjects([newDash(EX.groundLine[0], EX.groundLine[1], "d3")], { allowDup: true }),
      },
      wait: { until: hasDash, hint: "선을 긋고 점선으로 바꿔 주세요" },
    },
    {
      target: () => ["#canvas", "#panel-right"],
      title: "⑥ 마찰 구간 회색 채움",
      text:
        "마찰 구간은 표면에 얹힌 회색 띠입니다. 닫힌 꺾은선을 만들고\n" +
        "오른쪽 속성의 '채우기'에서 회색을 고르면 됩니다. 테두리는 없앱니다.\n\n" +
        "· 채우기 종류에 헤칭(빗금)도 있습니다 — 지면 표시에 씁니다\n" +
        "· 높이 안내선(점선)과 속도 화살표도 함께 넣어 드립니다",
      guide: () => [
        { pts: bandQuad(EX.bandI[0], EX.bandI[1], EX.bandIT), close: true, note: "Ⅰ", noteDy: -5 },
        { pts: bandQuad(EX.bandII[0], EX.bandII[1], EX.bandFlatT), close: true, note: "Ⅱ", noteDy: -5 },
        { pts: bandQuad(EX.bandIII[0], EX.bandIII[1], EX.bandFlatT), close: true, note: "Ⅲ", noteDy: -5 },
      ],
      allowNext: true,
      auto: {
        label: "회색 띠 세 개 넣기",
        run: () => placeObjects([
          newBand(EX.bandI[0], EX.bandI[1], EX.bandIT),
          newBand(EX.bandII[0], EX.bandII[1], EX.bandFlatT),
          newBand(EX.bandIII[0], EX.bandIII[1], EX.bandFlatT),
          // 치수선이 어디를 재는지 가리키는 안내선 — 기출 도판의 필수 요소다
          ...EX.guides.map(([a, b]) => newDash(a, b, "d2")),
          // 출발 위치를 나타내는 점선 원 + 속도 화살표(원본에 있다)
          newEllipse(EX.startRing[0], EX.startRing[1], EX.startRingR, { hollow: true, sw: 0.25, dash: 0.25 }),
          newArrow(EX.vArrow[0], EX.vArrow[1]),
          newQuantity(-48.5, -17, "v", NOTE_MM),   // 물리량이므로 세리프 이탤릭(원본과 같게)
        ], { allowDup: true }),
      },
      wait: { until: hasBand, hint: "회색 띠를 만들어 주세요" },
    },

    /* ---------- 국면 5: 비교 · 내보내기 ---------- */
    {
      title: "원본과 비교해 보세요",
      text:
        "다 만들었습니다. 아래 단추를 누르면 기출 원본과 내 그림을 나란히 놓고 볼 수 있습니다.\n\n" +
        "· 선 굵기·글자 크기·치수 위치를 원본과 견주어 보세요\n" +
        "· 다르게 보이는 곳이 있으면 창을 닫고 그 객체만 고치면 됩니다\n" +
        "· 똑같이 만드는 것이 목표가 아닙니다 — 무엇이 도판을 도판답게 하는지 보는 것이 목표입니다",
      compare: EX.id,
      compareNote: "왼쪽이 기출 원본, 오른쪽이 지금 만든 그림입니다.",
    },
    {
      target: () => "#menu-file",
      title: "마지막 — 내보내기",
      text:
        "그림은 파일 → 이미지로 내보내기로 뽑아 한글·워드에 붙입니다.\n" +
        "이것이 실제 작업의 마지막 한 걸음입니다.\n\n" +
        "· 시험지용은 PNG 300dpi, 재편집이 필요하면 SVG 를 고르세요\n" +
        "· 다 보셨으면 [마치기]를 눌러 주세요",
    },
  ],
};

export const COURSES = [
  // 기본 트랙 — 모두가 거치는 순서
  GETTING_READY, BASICS, INCLINE_FIGURE, EXAM_SEARCH,
  // 심화 트랙 — 도구 확장
  TRIM_EXAM, ALIGN_SPACE, TERRAIN_COURSE,
  // 실습 과제 — 시범 과제(P0)를 맨 위에 두어 기존 P1~P10 과 나란히 견줄 수 있게 한다.
  EXAM_TASK_INCLINE,
  ...TASKS,
];

export function getCourse(id) {
  return COURSES.find((c) => c.id === id) || null;
}
