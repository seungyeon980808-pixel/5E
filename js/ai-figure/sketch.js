// 1.7.3 그림 고침 B: 손그림 → 평가원 수준의 상세한 그림.
// 교사 손그림은 「배치·위치·개수·라벨」만 알려 주는 밑그림이다. 내용과 세부는 그 대상을 평가원 기출이 그리는 방식으로 채운다
// (예: 화산 단면이면 화구·화도·마그마굄 모양, 용암·화산재 층, 주변 암석 무늬 관례). 손그림을 깨끗이 베끼는 것이 목표가 아니다.
//
// 길: 손그림을 보는 글 AI 한 번(readSketchPlan)으로 ① 배치(물체·개수·위치·라벨) ② 그 대상의 평가원 관례 세부 ③ 같은 종류 기출 검색어를
// 함께 뽑는다(구체화·분류 AI를 따로 부르지 않음). 그 뒤 같은 종류 기출을 참고로 붙여 그린다.
//   fix.sketchPlan 1 = 손그림을 배치 안내로 함께 붙임, 2 = 손그림은 붙이지 않고 글 배치만(보통 그리기 길).
// 글자 모양(가는 고딕 한글 등)은 prompt.js의 글자 규칙을 그대로 따르고, 여기서는 덮어쓰지 않는다.
import { tryParseJson } from './retrieve.js';

const SUBJECTS = ['물리학Ⅰ', '물리학Ⅱ', '화학Ⅰ', '화학Ⅱ', '생명과학Ⅰ', '생명과학Ⅱ', '지구과학Ⅰ', '지구과학Ⅱ'];

/** 손그림을 보는 글 AI에 줄 지시문. types = 기출 그림 종류 목록(검색용). */
export function sketchPlanPrompt({ request, subject = '', types = [] }) {
  const typeList = types.length ? `\n그림 종류 목록: ${types.join(' / ')}` : '';
  return `너는 평가원 ${subject || '과학탐구'} 시험지 그림을 설계한다. 첨부는 교사가 손으로 대강 그린 밑그림이다. 교사 요청: 「${request}」
이 밑그림은 배치만 알려 준다(무엇이 어디에 몇 개, 라벨이 무엇을 가리키는지). 실제 그림은 그 대상을 평가원 기출 그림이 그리는 방식으로 자세하게 새로 그린다.
JSON 하나로만 답한다(설명 글 없이):
{"target":"무엇의 그림인지 한 줄(예: 성층 화산 단면)",
 "subject":"${SUBJECTS.join('|')} 중 하나",
 "types":[목록에서 가까운 순서로 1~2개], "keywords":[기출 검색 낱말 3~6개],
 "layout":["물체·부분: 개수, 틀 기준 위치(가로·세로 %)와 크기 비율, 닿음·연결 관계 — 한 줄에 하나, 8줄 이하"],
 "labels":["「글자」 → 가리키는 대상(곧은 지시선이면 「지시선」), 글자 자리(틀 기준 %)"],
 "details":["평가원 기출이 이 대상을 그릴 때 늘 넣는 세부 4~7개 — 모양·내부 구조·층·부품·관례 기호·회색 면·무늬를 구체적으로"]}
규칙:
1. layout·labels는 밑그림 그대로다. 물체 개수·위치·연결을 바꾸거나 빼거나 더하지 않는다. 교사 요청에 적힌 라벨은 빠짐없이 넣는다.
2. details는 대상의 평가원 관례 세부다(예: 화산 단면 → 꼭대기의 오목한 화구, 화구에서 마그마굄까지 이어진 좁은 화도, 납작한 렌즈 모양의 마그마굄, 화산체 안 용암층·화산재층이 비탈을 따라 번갈아 쌓인 층리, 지표 아래 기반암 지층의 수평 층리·암석 무늬; 세포 → 핵막·인, 미토콘드리아 내막 주름; 실험 장치 → 유리 두께, 눈금, 받침·스탠드; 회로 → 표준 회로 기호). 손그림의 단순한 윤곽을 그대로 두지 않는다.
3. details는 모양·구조만 적는다. 교사가 말하지 않은 이름·라벨·기호·수치·설명 글은 어디에도 새로 쓰지 않는다(그림에 글자로 넣을 것은 labels뿐).
4. 손 떨림·물결선·이중선은 적지 않는다(모든 선은 깨끗한 직선·매끈한 곡선).${typeList}`;
}

/** 글 AI 답 → 계획 객체(쓸 것이 없으면 null). */
export function normalizeSketchPlan(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const list = (v, n) => (Array.isArray(v) ? v.map((s) => String(s ?? '').trim()).filter(Boolean).slice(0, n) : []);
  const plan = {
    target: typeof parsed.target === 'string' ? parsed.target.trim() : '',
    subject: SUBJECTS.includes(parsed.subject) ? parsed.subject : '',
    types: list(parsed.types, 2),
    keywords: list(parsed.keywords, 6),
    layout: list(parsed.layout, 10),
    labels: list(parsed.labels, 12),
    details: list(parsed.details, 8),
  };
  return plan.layout.length || plan.details.length ? plan : null;
}

/** 손그림을 보는 글 AI 한 번. readText(prompt, attachments) → 글. 실패는 던진다(부르는 쪽이 보통 길로 돌아간다). */
export async function readSketchPlan({ readText, request, subject = '', types = [], sketches = [] }) {
  return normalizeSketchPlan(tryParseJson(await readText(sketchPlanPrompt({ request, subject, types }), sketches)));
}

/** 계획 → 기출 검색 조건(retrieve의 classification). 검색할 낱말이 없으면 null. */
export function sketchClassification(plan, subject = '') {
  if (!plan || (!plan.types.length && !plan.keywords.length)) return null;
  return { subject: plan.subject || subject, types: plan.types, keywords: plan.keywords, fromExpand: true };
}

/** 계획 → 장면 요청 뒤에 붙일 글. attached = 손그림을 그리기 AI에도 붙이는지.
 *  손그림을 붙일 때는 make-figure의 'sketchLayout' 역할 문장이 「[밑그림 명세]대로」를 가리키므로 같은 이름을 쓴다. */
export function sketchPlanText(plan, { attached = true, refs = true } = {}) {
  if (!plan) return '';
  const out = [];
  if (plan.target) out.push(`\n\n[그릴 대상] ${plan.target} — 평가원 기출 그림 수준으로 자세히 그린다.`);
  const lay = [...plan.layout.map((s) => '- ' + s), ...plan.labels.map((s) => '- 라벨: ' + s)];
  if (lay.length) out.push(`\n\n[밑그림 명세 — 교사 손그림에서 읽은 배치, 위치는 그림 틀 기준 %]\n${lay.join('\n')}\n이 배치(물체 수·상대 위치·크기 비율·라벨과 곧은 지시선)는 지킨다.${attached ? ' 첨부 손그림은 배치 확인용일 뿐, 그 단순한 윤곽과 손 떨림을 따라 그리지 않는다.' : ''}`);
  if (plan.details.length) out.push(`\n\n[평가원 수준 세부 — 꼭 넣는다]\n${plan.details.map((s) => '- ' + s).join('\n')}\n윤곽선만 있는 단순한 그림으로 끝내지 말고, 위 세부를 평가원 그림처럼 가는 고른 선과 연회색 평면(필요하면 관례 무늬)으로 그린다. 굵은 해칭·사진 질감·입체 음영은 쓰지 않는다.`);
  if (refs) out.push('\n\n[같은 종류 기출 참고] 뒤에 붙인 평가원 그림은 이 대상을 평가원이 어떻게 그리는지(층·무늬·부품의 표현, 회색 단계, 선 굵기)를 보여 준다. 그 표현 방식은 따르되, 물체 배치·개수·글자는 위 명세와 교사 요청을 따른다(기출의 글자·이름을 옮기지 않는다).');
  out.push('\n라벨은 교사가 말한 것만, 글자 규칙대로 쓴다. 그 밖의 이름·설명 글은 넣지 않는다.');
  return out.join('');
}
