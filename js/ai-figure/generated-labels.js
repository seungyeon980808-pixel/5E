import { tryParseJson } from './retrieve.js';

const roles = new Set(['text', 'name', 'quantity', 'coef', 'unit', 'chemical']);
const kinds = new Set(['in', 'beside', 'leader', 'dim', 'angle']);

export const BARE_FIGURE_LABEL_NOTE = '\n[글자 분리] 이름·기호·값 라벨과 설명 지시선을 그리지 않는다. 각도 호와 치수 화살표는 남긴다. 치수선은 화살촉 사이를 끊기지 않게 그린다. 숫자 없는 단독 전하, 자석 N·S, 단자 +/−, 장치·축 눈금과 단위, 계기 화면은 요청한 위치에 남긴다. 이온식이 들어갈 원은 비워 둔다.';

export function normalizeGeneratedLabels(value) {
  if (!Array.isArray(value)) return null;
  const labels = [];
  for (const item of value.slice(0, 128)) {
    const text = typeof item?.text === 'string' ? item.text.trim() : '';
    const target = typeof item?.target === 'string' ? item.target.trim() : '';
    if (!text || text.length > 80 || !target || !kinds.has(item.kind)) continue;
    labels.push({ text, target: target.slice(0, 400), kind: item.kind, role: roles.has(item.role) ? item.role : 'text' });
  }
  return value.length && !labels.length ? null : labels;
}

export function generatedLabelLocationPrompt(labels) {
  return `첨부는 라벨을 올릴 시험지 그림이다. 왼쪽 위 [0,0], 오른쪽 아래 [1,1] 기준으로 자리를 찾아라.
- in: 대상 면 안의 중심. beside: 대상 바로 옆 흰 여백.
- leader: anchor는 대상 안쪽, pos는 대상 밖 흰 여백(그림 폭 8~20% 길이, 다른 물체나 지시선을 가로지르지 않게).
- dim: 실제 치수선의 중점. 알고 있으면 치수 화살촉 끝점 두 개를 ends에 넣는다.
- angle: 두 변 사이에서 각도 호 바로 바깥. 각 밖이나 화살촉 근처로 빼지 않는다.
- 보이지 않는 대상은 건너뛴다. 같은 이름이어도 대상이 다르면 각각 찾는다. i는 목록 번호다.
${labels.map((label, i) => `${i}. 「${label.text}」(${label.kind}): ${label.target}`).join('\n')}
JSON 하나: {"items":[{"i":0,"anchor":[0.4,0.5],"pos":[0.5,0.6],"ends":[[0.2,0.5],[0.8,0.5]]}]} (ends는 dim에서만)`;
}

function point(value) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(v => Number.isFinite(v) && v >= -.15 && v <= 1.15)) return null;
  return { x: value[0], y: value[1] };
}

export async function locateGeneratedLabels(labels, image, readText) {
  const parsed = tryParseJson(await readText(generatedLabelLocationPrompt(labels), [image]));
  const positions = new Map();
  for (const item of Array.isArray(parsed?.items) ? parsed.items : []) {
    if (!Number.isInteger(item?.i) || !labels[item.i] || positions.has(item.i)) continue;
    const pos = point(item.pos), anchor = point(item.anchor);
    if (!pos || (labels[item.i].kind === 'leader' && !anchor)) continue;
    const ends = Array.isArray(item.ends) && item.ends.length === 2 ? item.ends.map(point) : [];
    positions.set(item.i, { ...labels[item.i], position: pos, anchor: anchor || pos, ...(ends.length && ends.every(Boolean) ? { ends } : {}) });
  }
  return { labels: [...positions.entries()].sort(([a], [b]) => a - b).map(([, label]) => label), missing: labels.length - positions.size };
}
