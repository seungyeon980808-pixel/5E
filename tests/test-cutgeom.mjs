// 자르기 기하(가위/칼) 검증. 상대경로로 import → 어느 워크트리에서 실행해도 그 폴더의 모듈을 본다.
import { cutScissors, cutKnife, isCuttable }
  from "../js/cut-geometry.js";

let pass = 0, fail = 0;
const check = (n, c, d = "") => { if (c) { pass += 1; console.log(`  ✅ ${n}`); } else { fail += 1; console.log(`  ❌ ${n}  ${d}`); } };
const polyline = (pts, closed = false) => ({ id: "x", groupId: "g", type: "polyline", points: pts.map(([x, y]) => ({ x, y })), closed, strokeLevel: 0, strokeWidth: 0.3, fillNone: true });
const line = (a, b) => ({ id: "x", type: "line", p1: { x: a[0], y: a[1] }, p2: { x: b[0], y: b[1] }, strokeLevel: 0, strokeWidth: 0.3, arrowHead: "none" });
const noIds = (pcs) => pcs.every((p) => !("id" in p) && !("groupId" in p));

console.log("가위 (scissors)");
{
  // 열린 4점 폴리라인: (0,0)-(10,0)-(20,0)-(30,0), 중간(15,2) 클릭 → 2조각
  const o = polyline([[0,0],[10,0],[20,0],[30,0]]);
  const r = cutScissors(o, { x: 15, y: 2 });
  check("2조각", r && r.length === 2, `got ${r && r.length}`);
  check("타입 polyline 유지", r && r.every((p) => p.type === "polyline"));
  check("id/groupId 제거", r && noIds(r));
  // 왼쪽 조각 끝 ≈ 오른쪽 조각 시작 ≈ (15,0)
  if (r && r.length === 2) {
    const L = r[0].points, R = r[1].points;
    check("절단점 공유(15,0)", Math.abs(L[L.length-1].x - 15) < 0.5 && Math.abs(R[0].x - 15) < 0.5, `${L[L.length-1].x},${R[0].x}`);
  }
}
{
  // line 중간 클릭 → line 2개
  const r = cutScissors(line([0,0],[20,0]), { x: 10, y: 1 });
  check("line → 2 line", r && r.length === 2 && r.every((p) => p.type === "line"), JSON.stringify(r && r.map(p=>p.type)));
}
{
  // 닫힌 폴리라인 클릭 → 열린 1조각
  const o = polyline([[0,0],[10,0],[10,10],[0,10]], true);
  const r = cutScissors(o, { x: 5, y: -1 });
  check("닫힌 → 열린 1조각", r && r.length === 1 && r[0].closed === false, JSON.stringify(r && r.map(p=>p.closed)));
}

console.log("칼 (knife)");
{
  // 수평 폴리라인을 세로선(15, -5)-(15,5)로 자름 → 2조각
  const o = polyline([[0,0],[10,0],[20,0],[30,0]]);
  const r = cutKnife(o, { x: 15, y: -5 }, { x: 15, y: 5 });
  check("2조각", r && r.length === 2, `got ${r && r.length}`);
  if (r && r.length === 2) check("교차점 (15,0)서 분할", Math.abs(r[0].points[r[0].points.length-1].x - 15) < 0.5);
}
{
  // 안 지나가는 칼 → null
  const o = polyline([[0,0],[10,0],[20,0]]);
  check("교차 없으면 null", cutKnife(o, { x: 5, y: 5 }, { x: 15, y: 5 }) === null);
}
{
  // #1: 닫힌 사각형을 가로지르는 칼 → 두 "열린" 호(자동 닫힘 없음)
  const sq = polyline([[0,0],[20,0],[20,20],[0,20]], true);
  const r = cutKnife(sq, { x: -5, y: 10 }, { x: 25, y: 10 });   // y=10 수평 절단
  check("닫힌 사각 → 2조각", r && r.length === 2, `got ${r && r.length}`);
  check("조각은 '열린' polyline(자동 닫힘 X)", r && r.every((p) => p.type === "polyline" && p.closed === false), `closed=${r && r.map(p=>p.closed)}`);
  if (r && r.length === 2) {
    // 두 호의 끝점이 절단선(y=10)의 두 교차점 (0,10)·(20,10)을 공유
    const ends = r.flatMap((p) => [p.points[0], p.points[p.points.length-1]]);
    const near = (P, x, y) => ends.some((e) => Math.abs(e.x-x)<0.5 && Math.abs(e.y-y)<0.5);
    check("끝점이 교차점 (0,10)·(20,10) 공유", near(ends,0,10) && near(ends,20,10), JSON.stringify(ends));
  }
}
{
  // line을 수직으로 자름 → 2 line
  const r = cutKnife(line([0,0],[20,0]), { x:10,y:-5 }, { x:10,y:5 });
  check("line 칼 → 2 line", r && r.length === 2 && r.every(p=>p.type==="line"));
}

console.log("네이티브 도형 (원/상자/삼각형) — #1: 자동 닫힘 없이 열린 호로");
{
  // 원(ellipse) 가로 절단 → 열린 조각 2개
  const el = { id:'e', type:'ellipse', x:-20, y:-20, w:40, h:40, rotation:0, strokeLevel:0, strokeWidth:0.4, fillLevel:255, fillNone:false, fillStyle:'solid' };
  const r = cutKnife(el, { x:-30, y:0 }, { x:30, y:0 });
  check("원 → 2조각", r && r.length === 2, `got ${r && r.length}`);
  check("조각은 '열린' polyline", r && r.every(p => p.type === 'polyline' && p.closed === false), JSON.stringify(r && r.map(p=>p.type+':'+p.closed)));
  check("도형 필드(x/w) 제거", r && r.every(p => !('w' in p) && !('x' in p)));
  check("열린 조각은 fillNone=true(면 채움 없음)", r && r.every(p => p.fillNone === true));
  check("회전 가능 형태(points 배열 + rotation:0)", r && r.every(p => Array.isArray(p.points) && p.points.length >= 2 && p.rotation === 0));
}
{
  // 상자(rect) 세로 절단 → 2 열린 조각
  const rc = { id:'r', type:'rect', x:-15, y:-10, w:30, h:20, rotation:0, strokeLevel:0, strokeWidth:0.4, fillLevel:255, fillNone:false, fillStyle:'solid' };
  const r = cutKnife(rc, { x:0, y:-20 }, { x:0, y:20 });
  check("상자 → 2조각", r && r.length === 2, `got ${r && r.length}`);
  check("조각 열린 polyline", r && r.every(p => p.type === 'polyline' && p.closed === false));
}
{
  // 원을 안 지나가는 칼 → null
  const el = { id:'e', type:'ellipse', x:-20, y:-20, w:40, h:40, rotation:0, strokeLevel:0, strokeWidth:0.4 };
  check("원 밖 칼 → null", cutKnife(el, { x:-40, y:-40 }, { x:-30, y:-30 }) === null);
  check("원은 자르기 대상", isCuttable(el) === true);
  check("image는 자르기 대상 아님", !isCuttable({ type: "image" }));
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
