#!/usr/bin/env node
/* ===== MCP SERVER — 5E 도면 생성기 =====
 *
 * stdio JSON-RPC 2.0(줄 단위). SDK를 쓰지 않고 직접 구현한 이유: 5E는 "빌드 없음 ·
 * 의존성 없음"이 규칙이고, 이 서버가 쓰는 프로토콜 표면은 initialize / tools/list /
 * tools/call 셋뿐이라 node_modules를 끌어올 이유가 없다.
 *
 * 실행:  node tools/mcp-5e/server.js
 * 등록:  claude mcp add 5e -- node "<이 파일의 절대경로>"
 */

import {
  makeProject, loadProject, saveProject, resolveProjectPath, pickPage,
  appendObjects, validateData, summarize, newObjectId, DEFAULT_ARTBOARD,
} from "./lib/project.js";
import { OBJECT_TYPE_IDS, TYPE_DOC, describeType, normalizeObject } from "./lib/schema.js";
import { buildCircuitLoop, buildCircuitPath, buildGraph, buildDimension,
         buildFieldRegion } from "./lib/builders.js";
import { buildInclineScene, LINE_KIND_NAMES } from "./lib/scene.js";
import { buildSafePart, safePartsSummary } from "./lib/parts.js";
import { buildStandRig } from "./lib/rig.js";
import { startBridge, sendToApp, bridgeStatus } from "./lib/bridge.js";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { inlineImages } from "./lib/images.js";

const PROTOCOL_VERSION = "2024-11-05";

/* ===== 툴 정의 ===== */
const XY = { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] };
const BOX = {
  type: "object",
  properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } },
  required: ["x", "y", "w", "h"],
};
const PATH_PROP = { type: "string", description: "프로젝트 .json 파일의 절대경로" };
// 그리기 툴에서는 path가 선택 항목이다 — 생략하면 지금 열려 있는 앱 화면에 바로 들어간다.
const TARGET_PATH_PROP = {
  type: "string",
  description: "대상 .json 파일의 절대경로. **생략하면 지금 열려 있는 5E 화면에 바로 그린다**(기본).",
};
/* 묶음 — AI 는 초안까지만 그리고 위치 조정은 사람이 한다. 낱개로 넘기면 검전기 하나를
 * 옮기는 데 16개를 골라야 해서 편집이 막힌다. 한 번에 만든 한 벌은 묶어서 넘긴다. */
const GROUP_PROP = {
  type: "boolean",
  description: "만든 것들을 한 덩어리로 묶을지. 통째로 옮기기 편해진다(앱에서 해제 가능). " +
    "낱개로 만지고 싶으면 false.",
};
const PAGE_PROP = {
  description: "페이지 인덱스(0부터) 또는 이름/id. 생략하면 활성 페이지. " +
    "앱에 그릴 때도 동작한다 — 없는 페이지면 그 이름/번호로 새 탭을 만들어 옮긴 뒤 그린다. " +
    "그림을 여러 장 그릴 때는 장마다 다른 page를 줘서 겹치지 않게 한다.",
};

const TOOLS = [
  {
    name: "describe_schema",
    description:
      "5E 객체 타입 정보를 조회한다. type 없이 호출하면 21종 요약 목록, type을 주면 그 타입의 " +
      "기하 형식·기본값·허용값(enum)을 돌려준다. add_objects를 쓰기 전에 반드시 한 번 확인할 것.",
    inputSchema: {
      type: "object",
      properties: { type: { type: "string", enum: OBJECT_TYPE_IDS, description: "조회할 타입" } },
    },
  },
  {
    name: "create_project",
    description:
      "빈 5E 프로젝트 파일(.json)을 만든다. 단위는 mm(1 world unit = 1mm)이고 좌표 원점은 " +
      "아트보드 '중앙'(+x 오른쪽, +y 아래쪽)이다. 기본 아트보드 90×60mm → 그릴 수 있는 " +
      "범위는 x -45~45, y -30~30.",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROP,
        artboard: { type: "object", properties: { w: { type: "number" }, h: { type: "number" } }, description: "페이지 크기(mm). 기본 90×60" },
        pageNames: { type: "array", items: { type: "string" }, description: "여러 페이지를 한 번에 만들 때" },
        overwrite: { type: "boolean", description: "기존 파일 덮어쓰기(기본 false)" },
      },
      required: ["path"],
    },
  },
  {
    name: "add_objects",
    description:
      "객체를 추가한다. path를 생략하면 지금 열려 있는 5E 화면에 즉시 나타난다(권장). " +
      "필드가 틀리면 하나도 넣지 않고 오류를 돌려준다(반쯤 들어간 도면을 만들지 않기 위해). " +
      "id/order는 자동 부여된다. 타입별 필드는 describe_schema 참고. " +
      "**이미지**: {type:\"image\", x, y, srcPath:\"<로컬 파일 절대경로>\"} 로 넣으면 서버가 읽어 " +
      "내장(data URI)한다. w/h를 생략하면 원본 비율로 채운다(기본 폭 60mm). " +
      "기출 삽화를 잘라 쓸 때는 미리 잘라둔 파일 경로를 준다.",
    inputSchema: {
      type: "object",
      properties: {
        path: TARGET_PATH_PROP,
        page: PAGE_PROP, group: GROUP_PROP,
        objects: {
          type: "array",
          description: "추가할 객체 배열. 각 원소는 최소한 type과 기하 필드를 가져야 한다",
          items: { type: "object", properties: { type: { type: "string", enum: OBJECT_TYPE_IDS } }, required: ["type"] },
        },
      },
      required: ["objects"],
    },
  },
  {
    name: "add_circuit",
    description:
      "사각 폐회로를 만든다. box 둘레에 소자를 놓고 빈 구간은 도선으로 잇는다. " +
      "전원은 기본으로 왼쪽 변, 나머지는 윗변에 균등 배치된다. " +
      "branches를 주면 병렬 가지가 추가된다. path 생략 = 열린 화면에 바로.\n" +
      "**사각형이 아닌 배선**(삼각형·대각선·격자)은 box 대신 wires 를 준다 — " +
      "구간마다 두 점을 찍고 소자를 얹으면 사선 위에서도 저항 지그재그가 알아서 기울어진다.\n" +
      "예) 삼각형 회로 — 각 변에 R, 가운데 줄에 R과 전류계, 밑변에 전지:\n" +
      '  { wires:[ {from:[0,-24], to:[-16,-2], elements:[{element:"resistor",label:"R"}]},\n' +
      '            {from:[-16,-2], to:[16,-2], elements:[{element:"resistor",t:0.3,label:"R"},\n' +
      '                                                  {element:"ammeter",t:0.72,span:11}]},\n' +
      '            {from:[-32,20], to:[32,20], elements:[{element:"dc_source",label:"V",span:10}]} ] }',
    inputSchema: {
      type: "object",
      properties: {
        path: TARGET_PATH_PROP,
        page: PAGE_PROP, group: GROUP_PROP,
        box: { ...BOX, description: "회로 사각형의 좌상단과 크기(mm). wires 를 쓰면 필요 없다" },
        wires: {
          type: "array",
          description: "임의 배선 — 구간마다 두 점과 그 위에 놓을 소자. 사각형이 아닌 회로는 이걸 쓴다",
          items: {
            type: "object",
            properties: {
              from: { description: "구간 시작 [x,y] 또는 {x,y}" },
              to: { description: "구간 끝" },
              elements: {
                type: "array",
                description: "이 구간에 놓을 소자들 (element, t 0~1, span mm, label)",
                items: { type: "object" },
              },
            },
            required: ["from", "to"],
          },
        },
        elements: {
          type: "array",
          description: "회로 소자들",
          items: {
            type: "object",
            properties: {
              element: { type: "string", description: "resistor|dc_source|ac_source|capacitor|inductor|diode|lamp|led|ammeter|voltmeter|galvanometer|motor|unknown" },
              side: { type: "string", enum: ["top", "right", "bottom", "left"], description: "놓을 변(생략 시 자동)" },
              t: { type: "number", description: "그 변에서의 위치 0~1(생략 시 균등 분포)" },
              span: { type: "number", description: "단자 간 거리 mm(기본 14)" },
              label: { type: "string", description: "소자 옆 라벨 (예: R_1)" },
            },
            required: ["element"],
          },
        },
        bodyScale: {
          type: "number",
          description: "소자 크기 배율(전체 적용, 기본 1). 몸통·원·기호가 함께 커지고 단자는 그대로. 개별 소자에 bodyScale을 주면 그게 우선",
        },
        branches: {
          type: "array",
          description: "병렬 가지(위·아래 변을 잇는 세로선)",
          items: {
            type: "object",
            properties: {
              at: { type: "number", description: "가로 위치 0~1 (기본 0.5)" },
              elements: { type: "array", items: { type: "object" } },
            },
          },
        },
      },
      required: [],
    },
  },
  {
    name: "add_graph",
    description:
      "좌표평면과 함수 그래프를 만든다. 수식은 앱과 같은 파서를 쓴다(sin cos tan log ln exp " +
      "sqrt abs, 상수 pi e, 연산자 + - * / ^, 각도는 라디안). 점 좌표는 앱과 동일한 샘플러로 " +
      "계산되므로 앱에서 열어도 모양이 어긋나지 않는다. path를 생략하면 열려 있는 화면에 바로 그린다.",
    inputSchema: {
      type: "object",
      properties: {
        path: TARGET_PATH_PROP,
        page: PAGE_PROP, group: GROUP_PROP,
        at: { ...XY, description: "평면의 중심 좌표(mm)" },
        plane: {
          type: "object",
          description: "평면 설정. xMin/xMax/yMin/yMax(기본 -5..5), " +
            "cellMm(한 칸 mm, 기본 4.8) — 축마다 다르게 하려면 cellMmX/cellMmY " +
            "(시간축처럼 값 범위가 좁은 축을 물리적으로 늘려 읽기 쉽게), " +
            "axisVariant(cross|quadrant|single), showGrid, labelX, labelY, showTickLabels, " +
            "richLabels(축 이름 글씨체 — 그래프 도구와 같게 하려면 true), " +
            "seriesLock(좌표·함수 묶기, 기본 true), " +
            "annGuides(수선의 발 [{x,y}] — 앱 ③표시 탭과 같은 평면 요소), " +
            "guideLines(가이드라인 [{x1,y1,x2,y2}] — 계단 불연속 연결 등), " +
            "annMarkers(표시점 [{x,y}]) 등. 좌표는 전부 수학 좌표. " +
            "글자 크기는 칸 크기에 비례한다: axisLabelSize=cellX*0.8-0.35, tickLabelSize=cellX*0.68-0.35. " +
            "문자 눈금: tickLabelMode:'text' + tickTextX/tickTextY(배열, 축 끝→위/오른쪽 순, " +
            "빈칸은 '' — 예: ['t_0','2t_0','3t_0']). 수식 첨자 가능. " +
            "labelXOffset/labelYOffset({dx,dy})로 축 이름 미세이동",
        },
        functions: {
          type: "array",
          description: "그릴 함수들. 비우면 빈 좌표평면만 만든다",
          items: {
            type: "object",
            properties: {
              expr: { type: "string", description: "예: sin(x), x^2, 2*x+1" },
              domain: { type: "object", properties: { min: { type: "number" }, max: { type: "number" } } },
              range: { type: "object", properties: { min: { type: "number" }, max: { type: "number" } } },
              strokeWidth: { type: "number", description: "선 두께 mm(기본 0.3)" },
              dashLength: { type: "number" },
              dashGap: { type: "number" },
              label: { type: "string", description: "곡선 끝 라벨" },
              area: {
                type: "object",
                description: "곡선 아래 면적 채움(이 함수에만 붙는다). from·to는 정의역 값 — 생략하면 정의역 전체. x축까지 채운다",
                properties: {
                  from: { type: "number", description: "채울 구간 시작(정의역 값)" },
                  to: { type: "number", description: "채울 구간 끝(정의역 값)" },
                  level: { type: "number", description: "회색 명도 0~255 (기본 220)" },
                  edges: { type: "boolean", description: "구간 양 끝을 곡선→축까지 가는 실선으로 내릴지(기본 true)" },
                  label: { type: "string", description: "면적 안에 넣을 글자(예: 이동 거리)" },
                },
              },
              guides: {
                type: "array",
                description: "수선의 발 — 이 점에서 x축·y축으로 내리는 가는 파선. 수학 좌표 {x,y}. " +
                  "직선 도구로 따로 긋지 말고 이걸 쓴다(평면에 종속돼 함께 움직인다)",
                items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] },
              },
              markers: {
                type: "array",
                description: "곡선 위 표시점(●). 수학 좌표 {x,y}",
                items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] },
              },
            },
            required: ["expr"],
          },
        },
        series: {
          type: "array",
          description: "점 계열(꺾은선) — 수식이 아니라 좌표를 직접 찍는 계열. " +
            "v-t 계단·꺾은선 그래프는 이걸 쓴다(직선 도구로 긋지 않는다). " +
            "점은 수학 좌표. 그래프 편집 모달에서 '꺾은선 N점'으로 재편집된다",
          items: {
            type: "object",
            properties: {
              points: {
                type: "array",
                description: "꼭짓점 [[x,y], ...] 또는 [{x,y}, ...] (수학 좌표, 2개 이상)",
                items: {},
              },
              curveStyle: { type: "string", enum: ["straight", "smooth"], description: "기본 straight(꺾은선). smooth = 곡선 보간" },
              strokeWidth: { type: "number", description: "선 두께 mm(기본 0.4)" },
              dashLength: { type: "number", description: "둘째 계열 파선은 1.9" },
              dashGap: { type: "number", description: "둘째 계열 파선은 0.9" },
              endLabel: { type: "string", description: "계열 끝 라벨(예: I, II)" },
              guides: {
                type: "array",
                description: "수선의 발 {x,y} — functions 의 guides 와 동일",
                items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] },
              },
              markers: {
                type: "array",
                description: "표시점(●) {x,y}",
                items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] },
              },
            },
            required: ["points"],
          },
        },
      },
      required: ["at"],
    },
  },
  {
    name: "add_part",
    description:
      "감사된 기출 장면에서만 출처 잠금된 손 삽화 부품을 넣는다. 범용 손 생성기가 아니다. " +
      "part를 빼고 부르면 허용 부품과 제약 목록이 온다. purpose, examId, panelRef, context를 " +
      "모두 정확히 지정해야 하며 diagram 모드의 문자·숫자·기호·화살표 금지를 강제한다. " +
      "원본 래스터 해시를 검증하고, hand_grip의 고립 표식은 원본을 고치지 않고 cutout으로 가린다.\n" +
      "예) 감사된 2025년 6월 19번 경사 블록을 쥔 손:\n" +
      '  { part:"hand_grip", purpose:"reference-reconstruction", mode:"diagram",\n' +
      '    examId:"p1_2025_06_19", panelRef:"p1_2025_06_19#panel-1",\n' +
      '    context:"inclined-block-grip", gripAt:{x:0,y:0}, w:12,\n' +
      '    between:[{ type:"rect", x:0, y:-4, w:8, h:8, fillLevel:255 }] }',
    inputSchema: {
      type: "object",
      properties: {
        path: TARGET_PATH_PROP,
        page: PAGE_PROP, group: GROUP_PROP,
        part: { type: "string", description: "부품 id (예: hand_grip, hand_press). 생략하면 목록만 돌려준다" },
        purpose: { type: "string", enum: ["reference-reconstruction"], description: "기존 감사 장면 재구성 전용" },
        mode: { type: "string", enum: ["diagram"], description: "문자 없는 그림형만 허용" },
        examId: { type: "string", description: "감사 매니페스트의 정확한 문항 id" },
        panelRef: { type: "string", description: "감사 매니페스트의 정확한 panel ref" },
        context: {
          type: "string",
          enum: ["inclined-block-grip", "dashed-two-finger-spring-compression"],
          description: "부품별로 승인된 접촉·동작 문맥",
        },
        at: { ...XY, description: "좌상단 좌표(mm)" },
        gripAt: {
          ...XY,
          description: "쥐는 선(앞/뒤 경계)을 맞출 점 — 쥐는 물체의 모서리 좌표를 그대로 준다. " +
            "세로는 중심 정렬이라 물체 한가운데를 쥔 모양이 된다. at 보다 이걸 권한다",
        },
        w: { type: "number", description: "가로 mm. 생략하면 기출 인쇄 크기(비율 유지)" },
        h: { type: "number", description: "세로 mm" },
        layer: { type: "string", enum: ["both"], description: "안전 래퍼는 양쪽 조각을 항상 함께 사용" },
        between: {
          type: "array",
          description: "뒤 조각과 앞 조각 사이에 낄 객체들(= 쥐는 대상). add_objects 와 같은 형식",
          items: { type: "object", properties: { type: { type: "string", enum: OBJECT_TYPE_IDS } }, required: ["type"] },
        },
      },
    },
  },
  {
    name: "add_stand_rig",
    description:
      "스탠드·레일에 장치를 매달거나 얹는다(기출 13장). 스탠드·용수철·블록은 원래 다 있는데 " +
      "**부착 관계**가 없어서 좌표를 다섯 번씩 손으로 맞춰야 했다 — 그 계산을 대신한다.\n" +
      "매다는 위치는 가로대에서의 s(0~1)로만 준다(0=기둥 쪽, 1=바깥 끝). mm 를 계산하지 않는다.\n" +
      "예1) 스탠드 가로대에 용수철저울을 매달고 그 끝에 질량 m 블록:\n" +
      '  { at:{x:0,y:16}, hang:[{ s:0.75, kind:"spring", length:14, label:"k",\n' +
      '                          block:{size:8, label:"m"} }] }' + "\n" +
      "예2) 레일 위에 바퀴 달린 운반대 A·B:\n" +
      '  { rail:{ y:10, from:-34, to:34, items:[{at:0.3,size:9,label:"A"},{at:0.7,size:9,label:"B"}] } }',
    inputSchema: {
      type: "object",
      properties: {
        path: TARGET_PATH_PROP,
        page: PAGE_PROP, group: GROUP_PROP,
        at: { ...XY, description: "스탠드 받침 바닥의 가운데 좌표(mm)" },
        stand: { ...BOX, description: "스탠드 상자를 직접 줄 때(생략하면 at 기준 18×34)" },
        hang: {
          type: "array",
          description: "가로대에 매다는 것들",
          items: {
            type: "object",
            properties: {
              s: { type: "number", description: "가로대에서의 위치 0~1 (0=기둥 쪽, 기본 0.75)" },
              kind: { type: "string", enum: ["spring", "string"], description: "용수철(기본) 또는 실" },
              length: { type: "number", description: "매단 길이 mm (기본 14)" },
              label: { type: "string", description: "용수철 옆 라벨 (예: k)" },
              block: { type: "object", description: "끝에 거는 블록 { size, label }" },
            },
          },
        },
        rail: {
          type: "object",
          description: "레일(이중선) 위에 얹는 것 — { y, from, to, items:[{at 0~1, size, label, wheels}] }",
        },
      },
    },
  },
  {
    name: "add_dimension",
    description:
      "치수 표시(치수선 + 점선 연장선)를 그린다. 길이·높이·간격을 재는 표시는 전부 이 툴을 쓴다 — " +
      "직선 두세 개를 손으로 맞추지 않는다. **재는 두 점을 그대로 준다**(치수선이 놓일 위치가 아니라). " +
      "치수선은 side 쪽으로 offset 만큼 밀려나고, 두 기준점에서 치수선까지 뻗는 점선 연장선이 " +
      "자동으로 그어진다(치수보조선 표준: 굵기 0.35, 점선 1.0/0.3). " +
      "dims 배열로 여러 개를 한 번에 주면 같은 기준점을 쓰는 연장선은 한 번만 그린다(연속 치수).\n" +
      "예1) 블록 두 개 사이 거리 d 를 아래쪽에 표시:\n" +
      '  { from:{x:-20,y:6}, to:{x:4,y:6}, label:"d" }\n' +
      "예2) 높이 h 를 왼쪽에, 끝 캡을 넣어서:\n" +
      '  { from:{x:-18,y:-14}, to:{x:-18,y:6}, direction:"vertical", side:"left", label:"h", caps:"bothBars" }\n' +
      "예3) 연속 치수 L, 2L (기준점 공유):\n" +
      '  { dims:[ {from:[-20,10],to:[0,10],label:"L"}, {from:[0,10],to:[40,10],label:"2L"} ] }',
    inputSchema: {
      type: "object",
      properties: {
        path: TARGET_PATH_PROP,
        page: PAGE_PROP, group: GROUP_PROP,
        from: { ...XY, description: "재기 시작하는 기준점(그림 위 실제 점). [x,y] 배열도 된다" },
        to: { ...XY, description: "재기 끝나는 기준점" },
        label: { type: "string", description: "치수 라벨(기본 \"d\"). 첨자 가능: d_1, 2t_0" },
        direction: {
          type: "string", enum: ["auto", "horizontal", "vertical", "parallel"],
          description: "치수선 방향. auto(기본) = 두 점이 거의 가로면 가로, 거의 세로면 세로, " +
            "비스듬하면 두 점을 잇는 방향과 평행",
        },
        side: {
          type: "string", enum: ["above", "below", "left", "right"],
          description: "치수선을 어느 쪽으로 뺄지. 가로 치수는 above|below(기본 below), " +
            "세로·빗변 치수는 left|right(기본 left)",
        },
        offset: { type: "number", description: "기준점에서 치수선까지 거리 mm(기본 8, 권장 6~10)" },
        overshoot: { type: "number", description: "연장선이 치수선을 넘어 더 뻗는 길이 mm(기본 1.5)" },
        gap: { type: "number", description: "기준점에서 연장선이 떨어져 시작하는 간격 mm(기본 0)" },
        caps: {
          type: "string", enum: ["basic", "rightBar", "leftBar", "bothBars"],
          description: "치수선 끝 캡(기본 basic = 화살촉만). bothBars = 양끝에 짧은 세로 막대",
        },
        labelPos: {
          type: "string", enum: ["center", "above", "below", "left", "right"],
          description: "라벨 위치. 기본 center(치수선 가운데에 흰 테두리로 얹힘). " +
            "치수선이 짧아 화살촉이 라벨을 덮을 때만 옆으로 뺀다",
        },
        labelSize: { type: "number", description: "라벨 글자 크기 mm(기본 4.2)" },
        labelType: { type: "string", description: "라벨 글씨체 종류(quantity=물리량 이탤릭 등). 생략 시 기본" },
        extLines: { type: "boolean", description: "점선 연장선을 그릴지(기본 true). 도형의 변이 이미 연장선 노릇을 하면 false" },
        dims: {
          type: "array",
          description: "여러 치수를 한 번에. 각 원소는 위의 from/to/label/direction/side/offset… 을 그대로 갖는다",
          items: { type: "object" },
        },
      },
    },
  },
  {
    name: "add_incline_scene",
    description:
      "경사면 장면을 한 번에 그린다. 경사면 문항(빗면 위 블록·마찰 구간·각도·치수)은 이 툴을 쓴다 — " +
      "add_objects 로 직접 조립하지 않는다. **좌표(mm)를 계산해서 넣지 않는다**: 물체 위치는 면 위 " +
      "s(0~1)로만 주고, 접촉점·기울기·법선 방향·그리는 순서는 이 툴이 계산한다. " +
      "면 이름은 둘뿐이다 — \"경사면\"(s=0 아래끝, s=1 꼭대기), \"수평면\"(s=0 경사면 아래끝, s=1 바깥쪽 끝). " +
      "빗면은 triangle 자산, 선 굵기 0.35, 마찰 띠는 면 안쪽, 블록은 면 바깥쪽으로 자동 배치되며 " +
      "응답에 접촉 거리·각도·글자 간격 검산 결과가 함께 온다. path 생략 = 열려 있는 화면에 바로.\n" +
      "예1) 30° 경사면 위 질량 m 인 물체 A, 아래쪽 절반이 마찰 구간, 각도 표시:\n" +
      '  { incline:{angleDeg:30, length:40, apex:"left"}, ground:{length:40},\n' +
      '    blocks:[{on:"경사면", s:0.7, size:8, labelInner:"m", labelOuter:"A"}],\n' +
      '    friction:[{on:"경사면", from:0, to:0.5}], angleArc:true,\n' +
      '    captions:[{text:"수평면", on:"수평면", s:0.75}] }\n' +
      "예2) 수평면 위 두 물체를 실로 잇고, 경사면 높이에 치수선 h, 가상선(이동 후 위치) 블록:\n" +
      '  { incline:{angleDeg:37, height:20, apex:"right"},\n' +
      '    blocks:[{on:"수평면", s:0.3, size:8, labelInner:"2m"},\n' +
      '            {on:"수평면", s:0.6, size:8, labelInner:"m"},\n' +
      '            {on:"경사면", s:0.8, size:8, phantom:true}],\n' +
      '    connectors:[{from:0, to:1, kind:"실"}], dims:[{kind:"height", label:"h"}] }',
    inputSchema: {
      type: "object",
      properties: {
        path: TARGET_PATH_PROP,
        page: PAGE_PROP, group: GROUP_PROP,
        at: { ...XY, description: "장면 전체의 중심(mm). 생략하면 아트보드 중앙" },
        incline: {
          type: "object",
          description: "경사면(빗면). 크기는 length 또는 height 중 하나만 주면 된다",
          properties: {
            angleDeg: { type: "number", description: "경사각(도). 기본 30" },
            length: { type: "number", description: "빗면 길이 mm(기본 42)" },
            height: { type: "number", description: "높이 mm — length 대신 이걸 주면 각도에서 길이를 역산한다" },
            apex: { type: "string", enum: ["left", "right"], description: "꼭대기가 왼쪽인지 오른쪽인지(기본 left = 왼쪽이 높고 오른쪽으로 내려온다)" },
          },
        },
        ground: {
          type: "object",
          description: "수평면",
          properties: {
            length: { type: "number", description: "경사면 아래끝에서 바깥쪽으로 뻗는 길이 mm(기본 45)" },
            extendBack: { type: "number", description: "빗면 뒤쪽으로 더 뻗는 길이 mm(기본 0)" },
          },
        },
        blocks: {
          type: "array",
          description: "면 위의 물체(§15 사각 블록). 면에 정확히 접하도록 자동 스냅된다",
          items: {
            type: "object",
            properties: {
              on: { type: "string", description: "\"경사면\" 또는 \"수평면\"" },
              s: { type: "number", description: "면 위 위치 0~1 (기본 0.5)" },
              size: { type: "number", description: "한 변 mm(기본 8, 창작 도판은 정사각형이 기본)" },
              w: { type: "number", description: "기출 재현으로 직사각형이 필요할 때만" },
              h: { type: "number" },
              labelInner: { type: "string", description: "상자 안 글자 — 물리량(m, 2m, m_B). 첨자로 렌더된다" },
              labelOuter: { type: "string", description: "상자 밖 이름표 — A, B, P" },
              labelOuterPos: { type: "string", enum: ["above", "below", "left", "right"], description: "기본 above" },
              phantom: { type: "boolean", description: "true면 가상선(이동 후·가상 위치)의 파선 상자로 그린다(§17)" },
              fillLevel: { type: "number", description: "채움 0(검정)~255(흰색). 기본 255" },
            },
            required: ["on"],
          },
        },
        friction: {
          type: "array",
          description: "마찰 구간 회색 띠. 면 '안쪽'으로 깔린다(§11) — 물체가 지나갈 자리를 막지 않는다",
          items: {
            type: "object",
            properties: {
              on: { type: "string", description: "\"경사면\" 또는 \"수평면\"" },
              from: { type: "number", description: "시작 s (0~1)" },
              to: { type: "number", description: "끝 s (0~1)" },
              thickness: { type: "number", description: "띠 두께 mm(기본 2)" },
              level: { type: "number", description: "회색 0~255(기본 205 — 기출 실측값)" },
            },
            required: ["on", "from", "to"],
          },
        },
        connectors: {
          type: "array",
          description: "블록끼리 잇는 실·용수철. 블록 변에 정확히 접한다(§10). 지금은 같은 면 위의 두 블록만",
          items: {
            type: "object",
            properties: {
              from: { type: "number", description: "blocks 배열의 번호(0부터)" },
              to: { type: "number", description: "blocks 배열의 번호(0부터)" },
              kind: { type: "string", enum: ["실", "용수철"], description: "기본 실" },
              turns: { type: "number", description: "용수철 감은 수(기본 8) — 원본에서 세서 넣는다(§14)" },
              label: { type: "string" },
            },
            required: ["from", "to"],
          },
        },
        panel: {
          type: "string",
          description: "패널 이름 — 장면 아래 가운데에 붙는다(예: \"(가)\"). 기출 장면의 52%가 단다",
        },
        autoName: {
          type: "boolean",
          description: "이름 없는 블록에 A·B·C 를 자동으로 붙일지(기본 true). " +
            "기출 장면의 90%가 물체에 이름표를 달아서 기본값을 켜 뒀다. 끄려면 false",
        },
        angleArc: {
          description: "경사각 호. true 면 기본(label θ). {label, radius, showLabel} 로 세부 지정",
        },
        dims: {
          type: "array",
          description: "치수선(내장 치수선을 쓴다 — 화살표와 글자를 손으로 조립하지 않는다, §14)",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["height", "along"], description: "height=경사면 높이, along=면 위 구간 길이" },
              on: { type: "string", description: "along 일 때의 면 이름" },
              from: { type: "number", description: "along 일 때 시작 s" },
              to: { type: "number", description: "along 일 때 끝 s" },
              label: { type: "string", description: "치수 글자 (h, 2d, L)" },
              labelSize: { type: "number", description: "치수 글자 크기 mm(기본 4.2 — 이름표와 같은 크기)" },
              offset: { type: "number", description: "면에서 띄우는 거리 mm(기본 8)" },
            },
            required: ["kind"],
          },
        },
        arrows: {
          type: "array",
          description: "움직임 화살표. 길이는 표준 5mm 고정 — 위치와 방향만 준다(§17)",
          items: {
            type: "object",
            properties: {
              on: { type: "string" },
              s: { type: "number" },
              direction: { type: "string", enum: ["up", "down"], description: "면을 따라 위/아래(기본 up = s가 커지는 쪽)" },
              gap: { type: "number", description: "면에서 띄우는 거리 mm(기본 6)" },
              label: { type: "string" },
            },
            required: ["on"],
          },
        },
        guides: {
          type: "array",
          description: "보조선(기준선·궤적선 등). 굵기·점선 규격은 이름으로 고른다 — 숫자를 넣지 않는다",
          items: {
            type: "object",
            properties: {
              on: { type: "string" },
              s: { type: "number" },
              length: { type: "number", description: "mm(기본 20)" },
              back: { type: "number", description: "반대쪽으로도 뻗는 길이 mm" },
              direction: { type: "string", enum: ["horizontal", "vertical"], description: "기본 horizontal" },
              lineKind: { type: "string", enum: LINE_KIND_NAMES, description: "기본 기준선" },
            },
            required: ["on"],
          },
        },
        captions: {
          type: "array",
          description: "한글 설명 글자(수평면, 마찰 구간 …). 선·띠에서 자동으로 떨어뜨리고 간격을 검산한다(§11)",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              on: { type: "string" },
              s: { type: "number", description: "기본 0.8" },
              side: { type: "string", enum: ["above", "below"], description: "면의 위/아래(기본 below)" },
              gap: { type: "number", description: "면에서 띄우는 거리 mm(기본 3)" },
              fontSize: { type: "number", description: "mm(기본 3.7)" },
            },
            required: ["text", "on"],
          },
        },
      },
      required: ["incline"],
    },
  },
  {
    name: "app_status",
    description:
      "지금 열려 있는 5E 앱과 연결돼 있는지 확인한다. 앱에 바로 그리기 전에 이걸 먼저 부르고, " +
      "연결이 안 돼 있으면 안내 문구를 그대로 사용자에게 전달한다.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "read_app",
    description:
      "지금 화면에 그려져 있는 것을 읽어 온다(객체 id·타입·좌표·아트보드 범위). 사용자가 " +
      "'이거 옆에 화살표 하나만 더' 처럼 현재 그림을 기준으로 말할 때 먼저 호출한다.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "save_project",
    description:
      "현재 열려 있는 5E 편집 상태 전체를 지정한 .json 프로젝트 파일에 저장한다. " +
      "ExamPool에서 '편집 내용 가져오기'를 누를 때 PNG와 편집 가능한 원본을 함께 갱신하는 용도다.",
    inputSchema: {
      type: "object",
      properties: { path: PATH_PROP },
      required: ["path"],
    },
  },
  {
    name: "load_project",
    description:
      "저장된 5E 프로젝트의 pages[] 전체를 현재 앱에 열어 각 페이지를 탭으로 복원한다. " +
      "ExamPool에서 여러 그림을 한 번에 편집할 때 사용한다.",
    inputSchema: {
      type: "object",
      properties: { path: PATH_PROP },
      required: ["path"],
    },
  },
  {
    name: "export_image",
    description:
      "지금 화면에 그려진 그림을 **PNG 이미지로 받아 눈으로 확인한다**. read_app 은 좌표만 " +
      "주기 때문에 선이 안 이어졌는지·라벨이 도형을 뚫었는지·화살표 방향이 반대인지를 알 수 " +
      "없다. 그릴 때마다 이걸 불러 결과를 보고 고친다. 문서를 바꾸지 않고 파일도 만들지 않는다. " +
      "이미지는 토큰을 많이 먹으므로 기본 가로 600px 로 보고, 자세히 봐야 할 때만 올린다.",
    inputSchema: {
      type: "object",
      properties: {
        widthPx: {
          type: "number",
          description: "결과 가로 픽셀 (200~2000, 기본 600). 세부를 볼 때만 키운다.",
        },
      },
    },
  },
  {
    name: "add_field_region",
    description:
      "종이면에 수직인 **균일 자기장 영역**을 그린다 — 파선 테두리 + ⊗(들어감)/⊙(나옴) 기호 격자 " +
      "+ **범례 문장**(기본 자동). 기출에서 자기장·전자기는 87장으로 두 번째로 많은 유형이다.\n" +
      "이 구도를 쓰는 이유: 자기장이 종이면에 수직이면 도선과 그 도선이 받는 힘을 둘 다 " +
      "면 안의 화살표로 정직하게 그릴 수 있다. 자기장을 면 안에 그리면 힘이 면 밖으로 나가 " +
      "화살표로 표현할 수 없다.\n" +
      "예) 영역 안에 수평 도선과 위로 받는 힘:\n" +
      "  add_field_region { box:{x:-30,y:-18,w:60,h:36}, direction:\"into\" }\n" +
      "  add_objects [{type:\"line\", p1:{x:-34,y:0}, p2:{x:34,y:0}, lineMode:\"middleArrow\", strokeWidth:0.5},\n" +
      "               {type:\"line\", p1:{x:0,y:0}, p2:{x:0,y:-14}, lineMode:\"arrow\", strokeWidth:0.6}]",
    inputSchema: {
      type: "object",
      properties: {
        path: TARGET_PATH_PROP, page: PAGE_PROP, group: GROUP_PROP,
        box: { ...BOX, description: "자기장 영역의 좌상단과 크기(mm)" },
        direction: {
          type: "string", enum: ["into", "out"],
          description: "into = ⊗ 종이면으로 들어감(기본), out = ⊙ 나옴",
        },
        spacing: { type: "number", description: "기호 격자 간격 mm (기본 8)" },
        symbolSize: { type: "number", description: "기호 크기 mm (기본 간격의 0.45배)" },
        boundary: {
          type: "string", enum: ["dashed", "solid", "none"],
          description: "영역 테두리 (기본 dashed — 기출 표준)",
        },
        label: { type: "string", description: "영역 이름(예: 영역 Ⅰ). 좌상단 안쪽에 놓인다" },
        plane: { type: "string", description: "범례에 쓸 면 이름 (기본 \"종이면\", 수능은 \"xy 평면\")" },
        legend: {
          description: "범례 문장. 기본 true(자동 생성), 문자열이면 그 문장, false 면 생략(권장하지 않음)",
        },
        legendAt: { ...XY, description: "범례 위치(생략하면 영역 왼쪽 아래)" },
        avoid: {
          type: "array",
          description:
            "기호를 찍지 않을 사각형들 — 도선·물체가 지나가는 자리를 비운다(기출 도판도 비운다). " +
            "예: 도선이 y=4 를 지나면 [{x:-32,y:0,w:64,h:8}]",
          items: BOX,
        },
      },
      required: ["box"],
    },
  },
  {
    name: "fit_artboard",
    description:
      "그린 내용에 맞춰 아트보드를 줄이고 그림을 가운데로 옮긴다. **export_image·save_image 직전에 부른다.** " +
      "두 가지를 막는다 — ① 축 이름·한글 라벨은 도형 바깥에 놓이는데 아트보드를 눈대중으로 정하면 " +
      "밖으로 나가 **잘린다** ② 여백이 넓으면 그만큼 그림이 작아진다(PNG 실제 크기가 곧 시험지에 들어가는 크기다). " +
      "글자 폭은 앱이 화면에 그려진 것을 재므로 한글 라벨도 정확하다. 되돌리기(Ctrl+Z) 가능.",
    inputSchema: {
      type: "object",
      properties: {
        margin: { type: "number", description: "그림 둘레에 남길 여백 mm (기본 2)" },
        recenter: {
          type: "boolean",
          description: "그림을 가운데로 옮길지(기본 true). false 면 좌표를 그대로 두고 아트보드만 넓힌다",
        },
      },
    },
  },
  {
    name: "save_image",
    description:
      "지금 화면에 그려진 그림을 **인쇄 품질 PNG 파일로 저장**한다(기본 300dpi, pHYs 기록 — " +
      "한글/워드에 실제 크기로 들어간다). ExamMaker 파이프라인용: 파일명은 페이지 이름을 " +
      "따르므로, 페이지 이름을 파일명 규약({세트약칭}_{번호2자리})으로 먼저 맞춘다. " +
      "export_image 로 눈 확인을 마친 뒤에 저장할 것. 같은 이름이 있으면 덮어쓴다 — " +
      "그림을 고쳐 다시 저장하는 흐름이 그래야 성립한다.",
    inputSchema: {
      type: "object",
      properties: {
        dir: {
          type: "string",
          description: "저장할 폴더의 절대경로 (hwpPalette 사진 폴더, 예: C:\\...\\사진\\26-1기말). 없으면 만든다.",
        },
        name: {
          type: "string",
          description: "파일명(확장자 없이). 생략하면 현재 페이지 이름을 쓴다(권장 — 규약과 일치).",
        },
        dpi: { type: "number", description: "해상도 (72~600, 기본 300)." },
      },
      required: ["dir"],
    },
  },
  {
    name: "remove_from_app",
    description: "열려 있는 화면에서 id로 객체를 지운다. 앱에서 Ctrl+Z로 되돌릴 수 있다.",
    inputSchema: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string" } } },
      required: ["ids"],
    },
  },
  {
    name: "clear_app",
    description: "열려 있는 화면의 현재 페이지를 비운다. 되돌리기(Ctrl+Z) 가능.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_pages",
    description:
      "열려 있는 앱의 페이지(탭) 목록과 각 페이지의 객체 수·아트보드를 본다. " +
      "그림을 여러 장 그릴 때 어느 탭이 비어 있는지 확인하는 용도.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "set_page",
    description:
      "열려 있는 앱의 페이지(탭)를 전환한다. 그림 한 장당 한 페이지를 쓰면 서로 겹치지 않는다. " +
      "page: 인덱스(0부터) | 페이지 이름 | 페이지 id. 없는 페이지면 create:true로 새로 만든다" +
      "(이름을 주면 그 이름으로 생성). 전환 후 add_objects/add_graph는 그 페이지에 그려진다.",
    inputSchema: {
      type: "object",
      properties: {
        page: { description: "인덱스(0부터) 또는 이름 또는 id" },
        create: { type: "boolean", description: "없으면 새로 만들기(기본 false)" },
      },
      required: ["page"],
    },
  },
  {
    name: "set_artboard",
    description:
      "열려 있는 화면의 아트보드(페이지) 크기를 mm로 바꾼다. 기출 그림을 재현할 때 원본의 " +
      "가로세로 비율을 먼저 맞추는 용도 — 정사각형에 가까운 원본을 기본 90×60에 그리면 " +
      "그림이 눌려 보인다. 크기를 바꾸면 그릴 수 있는 좌표 범위도 함께 바뀐다(±w/2, ±h/2).",
    inputSchema: {
      type: "object",
      properties: {
        w: { type: "number", description: "가로 mm" },
        h: { type: "number", description: "세로 mm" },
      },
      required: ["w", "h"],
    },
  },
  {
    name: "list_objects",
    description: "프로젝트에 들어 있는 페이지·객체 목록을 요약해서 본다. 수정 대상 id를 찾을 때 쓴다.",
    inputSchema: { type: "object", properties: { path: PATH_PROP }, required: ["path"] },
  },
  {
    name: "remove_objects",
    description: "id로 객체를 지운다.",
    inputSchema: {
      type: "object",
      properties: { path: PATH_PROP, page: PAGE_PROP, ids: { type: "array", items: { type: "string" } } },
      required: ["path", "ids"],
    },
  },
  {
    name: "validate_project",
    description:
      "저장된 파일이 5E에서 제대로 열릴지 검사한다. 앱의 로드 경로는 매우 관대해서 필드가 틀려도 " +
      "조용히 넘어가고 그림만 이상해지므로, 파일을 만든 뒤에는 항상 이걸로 확인한다.",
    inputSchema: { type: "object", properties: { path: PATH_PROP }, required: ["path"] },
  },
];

/* ===== 전달 경로: 파일이냐, 열려 있는 앱이냐 =====
 * path를 주면 .json 파일에 쓰고, 생략하면 지금 열려 있는 5E 화면에 바로 넣는다.
 * 검증은 두 경로 모두 똑같이 거친다 — 앱에 직접 넣는다고 규칙이 느슨해지지는 않는다.
 */
async function deliver({ path, page, group }, objects, label) {
  if (path) {
    const { abs, data } = await loadProject(path);
    const pg = pickPage(data, page);
    const r = appendObjects(pg, objects);
    if (!r.ok) throw new Error("추가하지 않았습니다 — 다음을 고치세요:\n" + r.errors.join("\n"));
    await saveProject(abs, data);
    return { where: `파일 ${pg.name}`, count: r.ids.length, total: pg.objects.length, warnings: r.warnings };
  }

  // 앱 모드에서도 page를 존중한다 — 없으면 만들어서 그 탭으로 옮긴 뒤 그린다.
  // (종전엔 파일 모드에서만 쓰이고 앱 모드에선 조용히 무시돼, 그림 여러 장을 한 페이지에
  //  겹쳐 그릴 수밖에 없었다. 그림 한 장 = 한 탭이 기본이다.)
  if (page !== undefined && page !== null && page !== "") {
    await sendToApp("setPage", { page, create: true });
  }
  const info = await sendToApp("ping");        // 앱이 붙어 있는지 + 아트보드 확인
  const errors = [], warnings = [], normalized = [];
  objects.forEach((raw, i) => {
    const n = normalizeObject(raw, { artboard: info.artboard });
    n.errors.forEach((e) => errors.push(`[${i}] ${e}`));
    n.warnings.forEach((w) => warnings.push(`[${i}] ${raw && raw.type}: ${w}`));
    if (n.obj) normalized.push(n.obj);
  });
  if (errors.length) throw new Error("보내지 않았습니다 — 다음을 고치세요:\n" + errors.join("\n"));
  const res = await sendToApp("addObjects", { objects: normalized, group });
  return {
    where: `열려 있는 앱(${info.page})`, count: res.added,
    total: info.objects + res.added, warnings, grouped: res.grouped || 0,
  };
}

function deliverReport(head, d, extra = []) {
  return [
    `${head} → ${d.where} (총 ${d.total}개)`,
    ...(d.grouped ? [`  · ${d.grouped}개를 한 덩어리로 묶었습니다 — 통째로 옮길 수 있습니다(앱에서 해제 가능)`] : []),
    ...extra,
    ...(d.warnings.length ? ["", "경고:", ...d.warnings] : []),
  ].join("\n");
}

/* ===== 툴 구현 ===== */
const HANDLERS = {
  async describe_schema({ type }) {
    if (!type) {
      const lines = OBJECT_TYPE_IDS.map((t) => `- ${t}: ${TYPE_DOC[t]?.summary || ""} (필수: ${TYPE_DOC[t]?.required || "?"})`);
      return [
        `5E 객체 타입 ${OBJECT_TYPE_IDS.length}종 — 단위는 mm, 원점은 아트보드 '중앙', +x 오른쪽 / +y 아래쪽.`,
        "90×60mm 아트보드라면 그릴 수 있는 범위는 x -45~45, y -30~30 입니다.",
        ...lines,
        "",
        "자세한 필드는 describe_schema에 type을 지정해 다시 호출하세요.",
      ].join("\n");
    }
    const d = describeType(type);
    if (!d) return `알 수 없는 타입: ${type}`;
    return JSON.stringify(d, null, 2);
  },

  async create_project({ path, artboard, pageNames, overwrite }) {
    const abs = resolveProjectPath(path);
    if (existsSync(abs) && !overwrite) {
      throw new Error(`이미 있는 파일입니다: ${abs} (덮어쓰려면 overwrite: true)`);
    }
    const data = makeProject({
      artboard: artboard && artboard.w > 0 && artboard.h > 0 ? artboard : DEFAULT_ARTBOARD,
      pageNames: Array.isArray(pageNames) && pageNames.length ? pageNames : ["페이지 1"],
    });
    await saveProject(abs, data);
    const ab = data.pages[0].artboard;
    return [
      `만들었습니다: ${abs}`,
      `아트보드 ${ab.w}×${ab.h}mm, 페이지 ${data.pages.length}개`,
      `좌표계: 원점 (0,0)은 아트보드 '중앙', +x 오른쪽 / +y 아래쪽, 단위 mm`,
      `그릴 수 있는 범위: x ${-ab.w / 2} ~ ${ab.w / 2}, y ${-ab.h / 2} ~ ${ab.h / 2}`,
    ].join("\n");
  },

  async add_objects({ path, page, objects, group }) {
    if (!Array.isArray(objects) || !objects.length) throw new Error("objects 배열이 비었습니다");
    // 묶음은 명시할 때만 — 한 번의 호출에 서로 무관한 것이 섞일 수 있다.
    const d = await deliver({ path, page, group: group === true }, inlineImages(objects));
    return deliverReport(`${d.count}개 추가`, d);
  },

  async add_circuit({ path, page, box, elements, branches, bodyScale, wires, group }) {
    // 회로 한 벌은 개념적으로 한 덩어리다 — 기본으로 묶어 넘긴다(group:false 로 해제).
    const g = group !== false;
    if (Array.isArray(wires) && wires.length) {
      const b = buildCircuitPath({ wires, bodyScale });
      const dd = await deliver({ path, page, group: g }, b.objects);
      return deliverReport(
        `배선 ${dd.count}개 객체 추가 (구간 ${wires.length}개)`, dd,
        b.warnings.length ? ["", "배치 경고:", ...b.warnings] : [],
      );
    }
    if (!box) throw new Error("box 또는 wires 중 하나는 있어야 합니다");
    const built = buildCircuitLoop({ box, elements: elements || [], branches: branches || [], bodyScale });
    const d = await deliver({ path, page, group: g }, built.objects);
    return deliverReport(
      `회로 ${d.count}개 객체 추가 (소자 ${(elements || []).length}개 + 도선)`, d,
      built.warnings.length ? ["", "배치 경고:", ...built.warnings] : [],
    );
  },

  async add_graph({ path, page, at, plane, functions, series, group }) {
    const planeId = newObjectId();
    const built = buildGraph({
      at, plane: plane || {}, functions: functions || [], series: series || [], planeId,
    });
    if (built.error) throw new Error(built.error);
    // 평면·곡선은 seriesLock 이 이미 묶는다. group 은 남는 것이 있을 때만 쓰인다.
    const d = await deliver({ path, page, group: group !== false },
                            [built.plane, ...built.graphs]);
    return deliverReport(
      `좌표평면 1개 + 계열 ${built.graphs.length}개 추가`, d,
      [`평면 id: ${planeId} (${built.plane.w.toFixed(1)}×${built.plane.h.toFixed(1)}mm)`,
        ...(built.warnings.length ? ["", "샘플링 경고:", ...built.warnings] : [])],
    );
  },

  /* 오려낸 삽화 부품. part 없이 부르면 목록만 — 모델이 뭘 쓸 수 있는지 먼저 보게 한다. */
  async add_part({ path, page, part, group, ...spec }) {
    if (!part) return safePartsSummary();
    const built = buildSafePart({ part, ...spec });
    if (built.error) throw new Error(built.error);
    const d = await deliver({ path, page, group: group !== false }, inlineImages(built.objects));
    return deliverReport(`부품 ${d.count}개 객체 추가`, d, [
      ...built.notes.map((t) => `  · ${t}`),
      ...(built.warnings.length ? ["", ...built.warnings.map((t) => `  ⚠ ${t}`)] : []),
    ]);
  },

  /* 스탠드·레일 부착. 만든 위치를 문장으로 돌려준다 — 가로대 y·x 범위를 알아야
   * 그 옆에 치수선이나 이름표를 붙일 수 있다. */
  async add_stand_rig({ path, page, group, ...spec }) {
    const built = buildStandRig(spec);
    if (built.errors.length) throw new Error("그리지 않았습니다 — 다음을 고치세요:\n" + built.errors.join("\n"));
    if (!built.objects.length) throw new Error("그릴 것이 없습니다 — hang 또는 rail 을 주세요");
    const d = await deliver({ path, page, group: group !== false }, built.objects);
    return deliverReport(`장치 ${d.count}개 객체 추가`, d, built.notes.map((t) => `  · ${t}`));
  },

  /* 치수 표시. 만든 값(길이·오프셋·연장선 수)을 문장으로 돌려준다 —
   * 그림 판독이 약한 모델도 "치수선이 반대쪽에 붙었다"를 글로 읽고 고칠 수 있게. */
  async add_dimension({ path, page, group, ...spec }) {
    const built = buildDimension(spec);
    if (built.errors.length) throw new Error("그리지 않았습니다 — 다음을 고치세요:\n" + built.errors.join("\n"));
    if (!built.objects.length) throw new Error("그릴 치수가 없습니다 — from·to 를 주세요");
    // 치수선·연장선·라벨은 따로 놀면 안 된다 — 항상 함께 움직여야 한다.
    const d = await deliver({ path, page, group: group !== false }, built.objects);
    return deliverReport(`치수 표시 ${d.count}개 객체 추가`, d, [
      ...built.notes.map((t) => `  · ${t}`),
      ...(built.warnings.length ? ["", "경고:", ...built.warnings.map((t) => `  ⚠ ${t}`)] : []),
    ]);
  },

  /* 경사면 장면. 검산 리포트를 '항상' 붙인다 — 그림 판독이 약한 모델도 글로 읽고 고칠 수 있게. */
  async add_incline_scene({ path, page, group, ...spec }) {
    const built = buildInclineScene(spec);
    if (built.errors.length) throw new Error("그리지 않았습니다 — 다음을 고치세요:\n" + built.errors.join("\n"));
    const d = await deliver({ path, page, group: group !== false }, built.objects);
    const layers = Object.entries(built.counts).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(" · ");
    return deliverReport(`경사면 장면 ${d.count}개 객체 추가`, d, [
      `층(§19): ${layers}`,
      `장면 크기: ${built.size.w.toFixed(1)}×${built.size.h.toFixed(1)}mm — 아트보드보다 크면 set_artboard로 넓히세요`,
      "",
      "검산(§16·§11·§17):",
      ...built.checks.map((c) => `  ${c.ok ? "✔" : "⚠"} ${c.text}`),
      ...(built.checks.every((c) => c.ok) ? [] : ["", "⚠ 표시가 있으면 값을 고쳐 다시 부르세요(같은 page로 다시 부르면 겹칩니다 — remove_from_app 먼저)."]),
    ]);
  },

  /* ----- 열려 있는 앱 직결 ----- */
  async app_status() {
    const b = bridgeStatus();
    if (!b.port) return "❌ 로컬 통로를 열지 못했습니다 (포트 8579~8583 사용중)";
    if (!b.connected) {
      return [
        `통로는 열려 있습니다 (127.0.0.1:${b.port}) — 하지만 5E 앱이 붙어 있지 않습니다.`,
        "",
        "확인할 것:",
        "1. 앱을 http://localhost:… 로 열었는지 (파일 더블클릭(file://)으로는 안 됩니다)",
        "2. 이미 열었다면 새로고침 — 앱은 켜질 때 한 번만 통로를 찾습니다",
        "3. 연결되면 화면 왼쪽 아래에 'MCP 연결됨' 배지가 뜹니다",
      ].join("\n");
    }
    const info = await sendToApp("ping");
    /* 어느 창에 붙었는지 반드시 밝힌다. 5E 를 두 개 열어 두면 나중에 연 쪽이 통로를
     * 가져가는데, 예전에는 그걸 알 수 없어 교사가 쓰던 문서에 그림을 그려 넣는 사고가 났다.
     * 창 표식(cid)과 주소를 같이 보여줘야 "내가 만든 창이 맞나"를 판단할 수 있다. */
    const c = b.client || {};
    return [
      `✅ 연결됨 (127.0.0.1:${b.port})`,
      `   창: ${c.clientId || "?"}  ${c.href || c.origin || ""}`,
      `   내용: ${info.page}, 객체 ${info.objects}개, 아트보드 ${info.artboard.w}×${info.artboard.h}mm`,
      "",
      "⚠️ 이 창이 내가 의도한 창인지 확인하고 그릴 것. 5E 를 여러 개 열어 두면",
      "   가장 마지막에 연 창이 통로를 가져간다(이전 창에는 그려지지 않는다).",
    ].join("\n");
  },

  async read_app() {
    const s = await sendToApp("getState");
    return JSON.stringify(s, null, 2);
  },

  async save_project({ path }) {
    const abs = resolveProjectPath(path);
    const data = await sendToApp("getProject");
    const checked = validateData(data);
    if (!checked.ok) {
      throw new Error("현재 5E 프로젝트를 저장할 수 없습니다:\n" + checked.errors.join("\n"));
    }
    await saveProject(abs, data);
    const total = (data.pages || []).reduce((n, page) => n + (page.objects || []).length, 0);
    return `저장했습니다: ${abs} (페이지 ${data.pages.length}개, 객체 ${total}개)`;
  },

  async load_project({ path }) {
    const { abs, data } = await loadProject(path);
    const checked = validateData(data);
    if (!checked.ok) {
      throw new Error("5E 프로젝트를 열 수 없습니다:\n" + checked.errors.join("\n"));
    }
    const result = await sendToApp("loadProject", { project: data });
    return `열었습니다: ${abs} (탭 ${result.pages}개, 현재 ${result.name})`;
  },

  /* 그림을 이미지로 받아 본다. 응답에 image 파트를 실어야 하므로 문자열이 아니라
   * { content: [...] } 를 통째로 돌려준다(디스패처가 그대로 내보낸다). */
  async export_image({ widthPx } = {}) {
    const r = await sendToApp("exportImage", { widthPx });
    return {
      content: [
        { type: "image", data: r.base64, mimeType: r.mimeType },
        {
          type: "text",
          text: `${r.page} — 객체 ${r.objects}개, 아트보드 ` +
                `${r.artboardMm.w}×${r.artboardMm.h}mm, 이미지 ${r.widthPx}×${r.heightPx}px`,
        },
      ],
    };
  },

  async add_field_region({ path, page, group, ...spec }) {
    const built = buildFieldRegion(spec);
    if (built.errors.length) {
      throw new Error("그리지 않았습니다 — 다음을 고치세요:\n" + built.errors.join("\n"));
    }
    const d = await deliver({ path, page, group: group !== false }, built.objects);
    return deliverReport(`자기장 영역 ${d.count}개 객체 추가`, d, [
      ...built.notes.map((t) => `  · ${t}`),
      ...(built.warnings.length ? ["", ...built.warnings.map((t) => `  ⚠ ${t}`)] : []),
    ]);
  },

  async fit_artboard({ margin, recenter } = {}) {
    const r = await sendToApp("fitArtboard", { margin, recenter });
    const mv = (r.moved && (r.moved.dx || r.moved.dy))
      ? `, 그림을 (${r.moved.dx}, ${r.moved.dy})mm 옮겨 가운데 정렬` : "";
    return [
      `아트보드 ${r.before.w}×${r.before.h} → ${r.artboard.w}×${r.artboard.h}mm (객체 ${r.objects}개${mv})`,
      "이제 export_image 로 눈 확인 → save_image 로 저장하세요.",
    ].join("\n");
  },

  /* 화면 그림을 PNG 파일로 저장 — 앱이 만든 base64(pHYs 포함)를 받아 서버가 쓴다.
   * 그림 파일이 사람 손을 거치지 않고 hwpPalette 사진 폴더에 도착하는 유일한 통로. */
  async save_image({ dir, name, dpi } = {}) {
    if (!dir || !isAbsolute(dir)) throw new Error("dir 는 절대경로여야 합니다");
    const r = await sendToApp("saveImagePng", { dpi });
    // 파일명은 페이지 이름 기본 — Windows 금지 문자만 걷어낸다(규약 이름은 애초에 안전).
    const base = String(name || r.page || "그림").replace(/[\\/:*?"<>|]/g, "_").trim();
    if (!base) throw new Error("파일명이 비었습니다");
    await mkdir(dir, { recursive: true });
    const abs = join(dir, base + ".png");
    const buf = Buffer.from(r.base64, "base64");
    await writeFile(abs, buf);
    return [
      `저장했습니다: ${abs}`,
      `  ${r.dpi}dpi, ${r.widthPx}×${r.heightPx}px, 아트보드 ${r.artboardMm.w}×${r.artboardMm.h}mm, ${Math.round(buf.length / 1024)}KB`,
      `  페이지: ${r.page} (객체 ${r.objects}개)`,
      "hwpPalette 사진 폴더 목록에 이 폴더가 등록돼 있어야 \\" + base + "\\ 로 삽입된다.",
    ].join("\n");
  },

  async clear_app() {
    const r = await sendToApp("clear");
    return `${r.removed}개 지웠습니다 — 앱에서 Ctrl+Z로 되돌릴 수 있습니다.`;
  },

  async list_pages() {
    const r = await sendToApp("listPages");
    const rows = r.pages.map((p) =>
      `${p.id === r.active ? "▶" : " "} [${p.index}] ${p.name} — 객체 ${p.objects}개, ` +
      `아트보드 ${p.artboard ? `${p.artboard.w}×${p.artboard.h}mm` : "?"}`);
    return [`페이지 ${r.pages.length}장 (▶ = 현재)`, ...rows].join("\n");
  },

  async set_page({ page, create }) {
    const r = await sendToApp("setPage", { page, create: !!create });
    return `${r.created ? "새 페이지를 만들어 " : ""}"${r.name}"(으)로 이동했습니다 — 이제 여기에 그려집니다.`;
  },

  async set_artboard({ w, h }) {
    const r = await sendToApp("setArtboard", { w, h });
    const a = r.artboard;
    return [
      `아트보드를 ${a.w}×${a.h}mm로 바꿨습니다.`,
      `그릴 수 있는 범위: x ${-a.w / 2} ~ ${a.w / 2}, y ${-a.h / 2} ~ ${a.h / 2}`,
    ].join("\n");
  },

  async remove_from_app({ ids }) {
    const r = await sendToApp("removeObjects", { ids });
    return `${r.removed}개 지웠습니다 (Ctrl+Z로 되돌리기 가능)`;
  },

  async list_objects({ path }) {
    const { data } = await loadProject(path);
    return JSON.stringify(summarize(data), null, 2);
  },

  async remove_objects({ path, page, ids }) {
    const { abs, data } = await loadProject(path);
    const pg = pickPage(data, page);
    const before = pg.objects.length;
    const set = new Set(ids);
    pg.objects = pg.objects.filter((o) => !set.has(o.id));
    pg.objects.forEach((o, i) => { o.order = i; });
    await saveProject(abs, data);
    return `${before - pg.objects.length}개 삭제 (남은 ${pg.objects.length}개)`;
  },

  async validate_project({ path }) {
    const { data } = await loadProject(path);
    const r = validateData(data);
    return [
      r.ok ? "✅ 이상 없음 — 5E에서 열 수 있습니다." : `❌ 오류 ${r.errors.length}건`,
      ...(r.errors.length ? ["", "오류:", ...r.errors] : []),
      ...(r.warnings.length ? ["", "경고:", ...r.warnings] : []),
    ].join("\n");
  },
};

/* ===== 로컬 통로 기동 =====
 * 서버가 뜰 때 바로 연다. 앱은 켜질 때 이 포트를 찾아 붙으므로, 통로가 먼저 있어야
 * "앱을 열어 두면 바로 그려지는" 흐름이 성립한다. 포트가 전부 막혀 있어도 파일 경로는
 * 그대로 동작하므로 서버를 죽이지는 않는다. */
await startBridge();

/* ===== JSON-RPC over stdio ===== */
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
function reply(id, result) { send({ jsonrpc: "2.0", id, result }); }
function replyError(id, code, message) { send({ jsonrpc: "2.0", id, error: { code, message } }); }

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    const requested = params && typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL_VERSION;
    return reply(id, {
      protocolVersion: requested,
      capabilities: { tools: {} },
      serverInfo: { name: "mcp-5e", version: "0.1.0" },
    });
  }
  if (method === "ping") return reply(id, {});
  if (method === "tools/list") return reply(id, { tools: TOOLS });
  if (method === "tools/call") {
    const name = params && params.name;
    const fn = HANDLERS[name];
    if (!fn) return replyError(id, -32601, `알 수 없는 툴: ${name}`);
    try {
      const out = await fn((params && params.arguments) || {});
      // 핸들러는 보통 문자열을 돌려준다. export_image 처럼 이미지를 실어야 하는 툴만
      // { content: [...] } 를 통째로 돌려주고, 그건 그대로 내보낸다.
      if (out && typeof out === "object" && Array.isArray(out.content)) return reply(id, out);
      return reply(id, { content: [{ type: "text", text: String(out) }] });
    } catch (e) {
      // 툴 오류는 프로토콜 오류가 아니라 isError 결과로 돌려준다 — 모델이 읽고 고칠 수 있게.
      return reply(id, { content: [{ type: "text", text: `오류: ${e.message}` }], isError: true });
    }
  }
  if (typeof id === "number" || typeof id === "string") {
    return replyError(id, -32601, `지원하지 않는 메서드: ${method}`);
  }
  // notification(id 없음)은 응답하지 않는다.
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); }
    catch { replyError(null, -32700, "JSON 파싱 실패"); continue; }
    handle(msg).catch((e) => replyError(msg.id ?? null, -32603, e.message));
  }
});
process.stdin.on("end", () => process.exit(0));
