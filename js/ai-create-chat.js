// 11-19 그림 생성 화면(승인 시안 그림생성화면 v4)의 화면 없는 조각: 대화 진행 줄 글, 결과 카드 칩, 결과 설명 줄,
// 라벨 힌트 대체, 그림 속 글자만 지우기. 화면 코드(ai-panel.js)가 부르고, 단위 검사가 그대로 돌린다.

/** 진행 상태 줄(태그 9) — 단계 신호 → 「하는 중」/「했어요」. 같은 줄 키(row)는 한 줄로 합친다. */
export const CREATE_STATUS_ROWS = Object.freeze({
  // 새로 그리기(그림 엔진 makeFigureSet 단계)
  index: { row: 'expand', doing: '요청을 그림 설계로 바꾸는 중', done: '요청을 그림 설계로 바꿨어요' },
  expand: { row: 'expand', doing: '요청을 그림 설계로 바꾸는 중', done: '요청을 그림 설계로 바꿨어요' },
  scene: { row: 'scene', doing: '그릴 준비를 하는 중', done: '그릴 준비를 마쳤어요' },
  draw: { row: 'draw', doing: '그림을 그리는 중', done: '그림을 그렸어요' },
  strip: { row: 'strip', doing: '그림 속 설명 글을 지우는 중', done: '그림 속 설명 글을 지웠어요' },
  grayscale: { row: 'grayscale', doing: '흑백으로 정리하는 중', done: '흑백으로 정리했어요' },
  // 이 그림 고치기(엔진 editFigure 단계, EDIT_PHASES)
  'edit-find': { row: 'edit-find', doing: '고칠 곳을 찾는 중', done: '고칠 곳을 찾았어요' },
  'edit-apply': { row: 'edit-apply', doing: '그 부분을 고치는 중', done: '그 부분을 고쳤어요' },
  'edit-verify': { row: 'edit-verify', doing: '나머지가 그대로인지 확인하는 중', done: '나머지가 그대로인지 확인했어요' },
  'edit-finish': { row: 'edit-finish', doing: '마무리하는 중', done: '마무리했어요' },
  // 확정하고 라벨 살리기(태그 28)
  'label-read': { row: 'label-read', doing: '그림 속 글자를 읽는 중', done: '그림 속 글자를 읽었어요' },
  'label-erase': { row: 'label-erase', doing: '그림 속 글자 지우는 중', done: '그림 속 글자를 지웠어요' },
  'label-place': { row: 'label-place', doing: '라벨 자리를 맞추는 중', done: '라벨 자리를 맞췄어요' },
  'label-check': { row: 'label-check', doing: '라벨을 넣고 확인하는 중', done: '라벨을 넣고 확인했어요' },
});

/** 진행 줄 목록에 단계 하나를 더한다(앞 줄은 끝남으로). 같은 줄이면 그대로. 순수 함수. */
export function advanceStatusRows(rows, phase, { text } = {}) {
  const spec = CREATE_STATUS_ROWS[phase];
  if (!spec) return rows;
  const list = Array.isArray(rows) ? rows.map(row => ({ ...row })) : [];
  const existing = list.find(row => row.key === spec.row);
  if (existing) { if (text) existing.text = text; return list; }
  for (const row of list) settleRow(row);
  list.push({ key: spec.row, state: 'current', ...(text ? { text } : {}) });
  return list;
}
// 끝난 줄: 「…하는 중」으로 바꿔 둔 글은 버리고 단계의 끝난 글을 쓴다.
function settleRow(row) { row.state = 'done'; if (typeof row.text === 'string' && /중$/.test(row.text.trim())) delete row.text; return row; }
/** 줄을 모두 끝남으로(완료). */
export const settleStatusRows = rows => (Array.isArray(rows) ? rows.map(row => settleRow({ ...row })) : []);
/** 줄 하나의 보이는 글. */
export function statusRowText(row) {
  if (row?.text) return row.text;
  const spec = Object.values(CREATE_STATUS_ROWS).find(item => item.row === row?.key);
  return spec ? (row.state === 'current' ? spec.doing : spec.done) : '';
}

/** 「1분 3초」가 아니라 시안처럼 「0:52」. */
export const clockText = ms => {
  const s = Math.max(0, Math.round(Number(ms) / 1000) || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** 결과 번호(「생성 결과 2 · 라벨」 → 2). 이름에 번호가 없으면 목록 순서. */
export function resultNumber(item, items = []) {
  const match = /생성 결과\s*(\d+)/.exec(String(item?.name || ''));
  if (match) return Number(match[1]);
  const index = items.indexOf(item);
  return index >= 0 ? index + 1 : null;
}

/** 결과 카드 둘째 줄(태그 19): 「0:52」 / 「1에서 고침 · T만 지움 · 0:18」 / 「2를 확정 · 라벨 16개 · 그림은 그대로 · 0:21」. */
export function resultSubline(item, items = []) {
  const ui = item?.meta?.ui || {};
  const from = ui.from ? items.find(other => other.id === ui.from) : null;
  const fromNo = from ? resultNumber(from, items) : null;
  const time = Number.isFinite(ui.elapsedMs) ? clockText(ui.elapsedMs) : null;
  if (ui.kind === 'label') {
    const count = Number(ui.labelCount) || 0;
    return [fromNo ? `${fromNo}를 확정` : null, `라벨 ${count}개`, '그림은 그대로', time].filter(Boolean).join(' · ');
  }
  if (ui.kind === 'edit') return [fromNo ? `${fromNo}에서 고침` : '앞 그림에서 고침', ui.summary || null, time].filter(Boolean).join(' · ');
  // 11-20 사용자 결정: 참고한 기출 수(「기출 3장 참고」)는 화면에 적지 않는다.
  return time || '';
}

/**
 * 결과 카드의 칩(태그 5·14·23·26·27·30). 보는 중인 카드에만 칩, 나머지는 「비교」.
 * kind: 'fill'(입력칸에 말만 넣기 — 시안 「칩을 누르면 입력칸에 말만 넣기」) | 'action'(바로 동작).
 */
export function resultChips(item, { viewing = false, items = [], comparing = false, side = null, labelsOn = true, canLabel = true } = {}) {
  if (!item) return [];
  if (!viewing) return [];
  const ui = item.meta?.ui || {};
  const chips = [];
  if (comparing && side === 'right') chips.push({ id: 'compare-close', label: '비교 닫기', kind: 'action' });
  const from = ui.from ? items.find(other => other.id === ui.from) : null;
  const fromNo = from ? resultNumber(from, items) : null;
  if (ui.kind === 'label' || (item.meta?.figureLabelMode === 'editable' && !canLabel)) {
    chips.push({ id: 'label-toggle', label: labelsOn ? '라벨 끄고 보기' : '라벨 켜고 보기', kind: 'action' });
    chips.push({ id: 'label-edit', label: '라벨 편집', kind: 'action' });
    if (ui.kind === 'label') {
      if (from) chips.push({ id: 'revert', label: `되돌리기(${fromNo}로)`, kind: 'action', target: from.id });
      return chips;
    }
  }
  // 11-27: 라벨 살리기는 글자를 그림에 그린 결과(그림 속 글자)에만 — 라벨 없음·편집 라벨 결과에는 살릴 글자가 없다.
  const embedded = !['editable', 'none'].includes(item.meta?.figureLabelMode);
  if (!comparing && canLabel && embedded) chips.push({ id: 'label-restore', label: '확정하고 라벨 살리기', kind: 'action', strong: true });
  if (from) chips.push({ id: 'revert', label: `되돌리기(${fromNo}로)`, kind: 'action', target: from.id });
  else if (!comparing && embedded) chips.push({ id: 'drop-labels', label: '라벨 빼기', kind: 'fill', text: '그림 속 라벨 글자를 모두 빼 줘' });
  chips.push({ id: 'bolder', label: '선 진하게', kind: 'fill', text: '선을 조금 더 진하게 해 줘' });
  if (!from && !comparing) chips.push({ id: 'angle', label: '각도 바꾸기', kind: 'fill', text: '보는 각도를 바꿔 줘: ' });
  chips.push({ id: 'redraw', label: '새로 그리기', kind: 'new' });
  return chips;
}

const SYMBOL_HINT = /(?:^|[^A-Za-z0-9_])((?:\d+(?:\.\d+)?\s?[a-zA-Zθαβγλμ°]{1,2}|[A-Zθαβγλμ][′']?(?:_\{[^}]{1,6}\}|_[A-Za-z0-9가-힣]{1,3}|[₀-₉]{1,2})?))(?=$|[^A-Za-z0-9_{])/gu;
/** 엔진이 labelHintsFromRequest를 주지 않을 때(엔진 갈래 합치기 전)의 대체: 요청 글의 한 글자 기호·값+단위를 뽑는다. */
export function labelHintsFallback(text) {
  const out = [];
  for (const match of String(text || '').matchAll(SYMBOL_HINT)) {
    const value = match[1].replace(/\s+/g, '');
    if (value && !out.includes(value)) out.push(value);
  }
  return out.slice(0, 40);
}

/** 글자 읽기 지시에 덧붙일 힌트 문단(태그 29). */
export function labelHintPrompt(hints = []) {
  const list = hints.filter(Boolean).slice(0, 40);
  if (!list.length) return '';
  return `\n참고: 이 그림은 교사가 다음 라벨을 적어 달라고 요청해 그린 것이다 — ${list.join(', ')}. 그림에 보이는 글자를 읽을 때 이 목록의 표기(대소문자·첨자·단위)를 우선 기준으로 삼되, 목록에 없는 글자가 그림에 있으면 그것도 빠짐없이 적는다. 목록에 있어도 그림에 없으면 적지 않는다.`;
}

/**
 * 그림 속 글자만 지우기(태그 28 「글자 지우기」, 그림은 다시 그리지 않음).
 * 상자(0~1 비율)마다 조금 넓힌 칸 안에서 진한 점 덩어리를 찾아, 칸 테두리에 닿지 않는 덩어리(= 글자)만 바탕색으로 칠한다.
 * 칸을 가로지르는 선(테두리에 닿는 덩어리)은 남긴다. rgba: Uint8ClampedArray(width*height*4), 제자리에서 바꾼다.
 * @returns {{ erasedPixels: number, boxes: number }}
 */
export function eraseGlyphsInBoxes(rgba, width, height, boxes = [], { threshold = 170, pad = 0.18, minPad = 3 } = {}) {
  let erasedPixels = 0, used = 0;
  const dark = i => { const a = rgba[i + 3]; if (a < 40) return false; return (rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114) < threshold; };
  for (const box of boxes) {
    const bw = Number(box?.w) * width, bh = Number(box?.h) * height;
    if (!(bw > 0 && bh > 0)) continue;
    const px = Math.max(minPad, Math.round(bw * pad)), py = Math.max(minPad, Math.round(bh * pad));
    const x0 = Math.max(0, Math.floor(Number(box.x) * width) - px), y0 = Math.max(0, Math.floor(Number(box.y) * height) - py);
    const x1 = Math.min(width - 1, Math.ceil((Number(box.x) + Number(box.w)) * width) + px), y1 = Math.min(height - 1, Math.ceil((Number(box.y) + Number(box.h)) * height) + py);
    if (x1 <= x0 || y1 <= y0) continue;
    used++;
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const seen = new Uint8Array(w * h), erased = new Uint8Array(w * h);
    const stack = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const local = (y - y0) * w + (x - x0);
      if (seen[local] || !dark((y * width + x) * 4)) continue;
      const component = []; let touches = false;
      seen[local] = 1; stack.push(x, y);
      while (stack.length) {
        const cy = stack.pop(), cx = stack.pop();
        component.push(cx, cy);
        if (cx === x0 || cx === x1 || cy === y0 || cy === y1) touches = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
          const nl = (ny - y0) * w + (nx - x0);
          if (seen[nl] || !dark((ny * width + nx) * 4)) continue;
          seen[nl] = 1; stack.push(nx, ny);
        }
      }
      if (touches) continue;
      for (let k = 0; k < component.length; k += 2) erased[(component[k + 1] - y0) * w + (component[k] - x0)] = 1;
    }
    // 글자 가장자리의 옅은 번짐까지 지울 자리에 넣는다 — 진한 점(남길 선)과 그 바로 옆 점은 넣지 않는다.
    // LEADERFIX(11-20 사용자 「유리 막대」「식물 잎」 글자 자국): 번짐이 3점보다 넓은 그림(흐릿하게 키운 생성 그림)에서
    // 3점만 지우면 옅은 회색 윤곽이 남고, 그 회색이 채우기에 섞여 글자 모양 자국이 됐다.
    // 첫 1점은 무조건, 그다음은 둘레 바탕(창 테두리의 밝은 점 가운데값)과 3 넘게 다른 점만 최대 8점 더 넣는다.
    const lumAt = i => rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
    const border = [];
    for (let lx = 0; lx < w; lx++) for (const ly of [0, h - 1]) { const i = ((ly + y0) * width + (lx + x0)) * 4; if (!dark(i)) border.push(lumAt(i)); }
    for (let ly = 1; ly < h - 1; ly++) for (const lx of [0, w - 1]) { const i = ((ly + y0) * width + (lx + x0)) * 4; if (!dark(i)) border.push(lumAt(i)); }
    border.sort((a, b) => a - b);
    const paper = border.length ? border[border.length >> 1] : 255;
    const nearKept = (lx, ly) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = lx + dx, ny = ly + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || erased[ny * w + nx]) continue;
        if (dark(((ny + y0) * width + (nx + x0)) * 4)) return true;
      }
      return false;
    };
    for (let ring = 0; ring < 9; ring++) {
      const grow = [];
      for (let ly = 1; ly < h - 1; ly++) for (let lx = 1; lx < w - 1; lx++) {
        const local = ly * w + lx;
        if (erased[local]) continue;
        const i = ((ly + y0) * width + (lx + x0)) * 4;
        if (dark(i)) continue;
        if (!(erased[local - 1] === 1 || erased[local + 1] === 1 || erased[local - w] === 1 || erased[local + w] === 1)) continue;
        if (nearKept(lx, ly)) continue;
        if (ring > 0 && Math.abs(lumAt(i) - paper) <= 3) continue;
        grow.push(local);
      }
      if (!grow.length) break;
      for (const local of grow) erased[local] = 2;
      for (const local of grow) erased[local] = 1;
    }
    // 선명하게 만든 그림은 글자 둘레에 밝은 테·옅은 회색 어깨가 고르지 않게 남는다 → 4점 더 넓혀(남길 선 옆은 빼고) 글자 모양 경계를 없앤다.
    for (let ring = 0; ring < 4; ring++) {
      const grow = [];
      for (let ly = 1; ly < h - 1; ly++) for (let lx = 1; lx < w - 1; lx++) {
        const local = ly * w + lx;
        if (erased[local]) continue;
        if (!(erased[local - 1] === 1 || erased[local + 1] === 1 || erased[local - w] === 1 || erased[local + w] === 1)) continue;
        if (dark(((ly + y0) * width + (lx + x0)) * 4) || nearKept(lx, ly)) continue;
        grow.push(local);
      }
      if (!grow.length) break;
      for (const local of grow) erased[local] = 2;
      for (const local of grow) erased[local] = 1;
    }
    // 지울 자리를 둘레 바탕색으로 안쪽까지 채운다(흰 바탕은 흰색, 회색 막대 안은 회색).
    let pending = 0;
    for (let k = 0; k < erased.length; k++) if (erased[k]) pending++;
    erasedPixels += pending;
    // 둘레(지울 자리 바로 바깥 3점)의 바탕이 고르면 그 가운데 색 한 가지로 채운다 — 이웃 평균으로 번져 들어가면
    // 남은 테의 밝기 차이가 글자 모양으로 따라 들어와 자국이 됐다(11-20 사용자 「식물 잎」).
    if (pending > 0) {
      const ringPx = [];
      for (let ly = 0; ly < h; ly++) for (let lx = 0; lx < w; lx++) {
        const local = ly * w + lx;
        if (erased[local]) continue;
        const i = ((ly + y0) * width + (lx + x0)) * 4;
        if (dark(i)) continue;
        let near = false;
        for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3; dx++) {
          const nx = lx + dx, ny = ly + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && erased[ny * w + nx]) { near = true; break; }
        }
        if (near && !nearKept(lx, ly)) ringPx.push(i);
      }
      if (ringPx.length >= 12) {
        const lums = ringPx.map(lumAt).sort((a, b) => a - b);
        const p10 = lums[Math.floor(lums.length * 0.1)], p90 = lums[Math.floor(lums.length * 0.9)];
        if (p90 - p10 <= 10) {
          const mid = c => { const v = ringPx.map(i => rgba[i + c]).sort((a, b) => a - b); return v[v.length >> 1]; };
          const r = mid(0), gg = mid(1), b = mid(2);
          for (let k = 0; k < erased.length; k++) {
            if (!erased[k]) continue;
            const i = ((Math.floor(k / w) + y0) * width + (k % w + x0)) * 4;
            rgba[i] = r; rgba[i + 1] = gg; rgba[i + 2] = b; rgba[i + 3] = 255;
            erased[k] = 0;
          }
          pending = 0;
        }
      }
    }
    for (let pass = 0; pending > 0 && pass < 64; pass++) {
      const fills = [];
      for (let ly = 0; ly < h; ly++) for (let lx = 0; lx < w; lx++) {
        const local = ly * w + lx;
        if (!erased[local]) continue;
        let r = 0, gg = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = lx + dx, ny = ly + dy;
          if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= w || ny >= h || erased[ny * w + nx]) continue;
          const j = ((ny + y0) * width + (nx + x0)) * 4;
          if (dark(j)) continue;
          r += rgba[j]; gg += rgba[j + 1]; b += rgba[j + 2]; n++;
        }
        if (n) fills.push(local, Math.round(r / n), Math.round(gg / n), Math.round(b / n));
      }
      if (!fills.length) break;
      for (let k = 0; k < fills.length; k += 4) {
        const local = fills[k], i = ((Math.floor(local / w) + y0) * width + (local % w + x0)) * 4;
        rgba[i] = fills[k + 1]; rgba[i + 1] = fills[k + 2]; rgba[i + 2] = fills[k + 3]; rgba[i + 3] = 255;
        erased[local] = 0; pending--;
      }
    }
    // 둘레가 모두 진한 점이라 못 채운 자리는 흰색.
    if (pending > 0) for (let k = 0; k < erased.length; k++) if (erased[k]) { const i = ((Math.floor(k / w) + y0) * width + (k % w + x0)) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = 255; }
  }
  return { erasedPixels, boxes: used };
}
