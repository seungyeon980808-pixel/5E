import { GRAPH_PLAN_SCHEMA } from './reconstruction-contract.js?v=1.7.0-four-session-integration';
import { physicsFunctionReference } from './physics-function-reference.js?v=1.7.0-four-session-integration';

export const GRAPH_DESCRIPTION_VERSION = 'graph-description-v11-structured-revisions';

export function compactGraphDescriptionObjects(objects) {
  if (!Array.isArray(objects)) return objects;
  return objects.map(object => {
    const draft = structuredClone(object);
    // An analytic curve is defined by expr/domain/offset, never its cached
    // tessellation. Raw measured/observed point series remain lossless.
    if (draft.type === 'funcgraph' && typeof draft.expr === 'string' && draft.expr.trim()) {
      delete draft.points;
      delete draft.mathPoints;
    }
    if (draft.reconstruction) {
      for (const key of ['quality', 'review', 'source', 'annotations']) delete draft.reconstruction[key];
    }
    return draft;
  });
}
export function buildGraphImageRevisionContext(priorPlan, priorObjects) {
  if (!priorPlan) return '';
  return `\n\n현재 편집 그래프의 구조를 기준으로 부분 수정한다. 아래 plan의 source.plotBox, 계열 id, 좌표, 수식, 정의역, 곡선 핸들, 화살표와 표기를 요청하지 않았다면 그대로 복사한다. 선 종류·이름 등 표현만 바꾸는 요청에서는 원본 이미지를 다시 추적하거나 점을 재표본화하지 않는다. 원본 이미지는 요청한 부분의 확인용이며 현재 그래프의 구조를 원본으로 되돌리는 근거가 아니다. 현재 네이티브 객체에 수동 편집이 있으면 그 편집 내용만 이전 plan에 반영한다. 네이티브 객체의 x/y/w/h와 points, labelXPos/labelYPos는 화면상의 mm 좌표·배치값이며 plan의 데이터값이나 normalized 좌표가 아니다. 이를 plan의 좌표에 대입하지 않는다. 함수의 expr·domainMin/domainMax와 원자료 mathPoints만 그 계열의 수학 좌표다. 축·프레임·표시를 바꾸라는 요청이 없으면 이전 plan의 axes, axisPlacement, source.plotBox와 모든 annotation의 좌표·coordinateSpace를 정확히 그대로 유지한다. 정확한 데이터가 없는 관찰 좌표를 실제 물리 수치로 승격하지 않는다. 출력은 동일한 완전한 그래프 plan JSON이다.\n이전 생성 plan JSON:\n${JSON.stringify(priorPlan)}\n현재 네이티브 객체 JSON:\n${JSON.stringify(compactGraphDescriptionObjects(priorObjects))}`;
}
export async function graphDescriptionSource(description, priorPlan = null, priorObjects = null) {
  if (typeof description !== 'string' || !description.trim() || description.length > 20000) throw new Error('그래프의 축과 모양을 20,000자 이내로 설명해 주세요.');
  const bytes = new TextEncoder().encode(JSON.stringify([GRAPH_DESCRIPTION_VERSION, description.trim(), priorPlan, priorObjects]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = 'sha256:' + [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  // This binds a text draft and a rendering viewport, never a photographed graph.
  return { id: 'description-' + hash.slice(7, 23), hash, width: 1280, height: 900 };
}

export function buildGraphDescriptionPrompt(source, description, priorPlan = null, priorObjects = null) {
  const bound = { ...source, plotBox: { x: 170, y: 170, w: 800, h: 540 } };
  const axis = title => ({ scale: 'unknown', title, unit: '', min: null, max: null, step: null, ticks: [], orientation: 'horizontal' });
  const qualitative = {
    schema: GRAPH_PLAN_SCHEMA, variant: 'cartesian', coordinateMode: 'observed', source: bound,
    axes: { x: axis('시간'), y: axis('속도') },
    frame: { variant: 'quadrant', arrowX: true, arrowY: true },
    series: [{ id: 's1', kind: 'points', axis: 'y', certainty: 'observed', coordinateSpace: 'normalized',
      points: [{ x: 0, y: .15 }, { x: .4, y: .7 }, { x: .9, y: .7 }], curveStyle: 'straight', markerShape: 'none', breaks: [], endpoints: [] }],
    annotations: [], review: [],
  };
  const numeric = { ...qualitative, coordinateMode: 'data',
    axes: { x: { scale: 'linear', title: 'x', unit: '', min: 0, max: 4, step: 1, ticks: [0,1,2,3,4].map(value => ({ value, label: String(value) })) }, y: { scale: 'linear', title: 'y', unit: '', min: 0, max: 16, step: 4, ticks: [0,4,8,12,16].map(value => ({ value, label: value ? String(value) : '' })) } },
    series: [{ id: 's1', kind: 'expression', axis: 'y', certainty: 'exact', coordinateSpace: 'data', expression: 'x^2', domain: { min: 0, max: 4 } }],
  };
  return `사용자의 한글 설명으로 시험 문항용 편집 그래프를 새로 설계한다. 이미지나 코드가 아니라 ${GRAPH_PLAN_SCHEMA} JSON 하나만 반환한다. 도구·검색·파일·이미지 생성을 호출하지 않는다. 이 작업에는 원본 이미지가 없다. source는 아래 설명의 해시와 렌더링 화면 크기이며, 관찰한 이미지가 있다는 주장을 하지 않는다.
SOURCE_BINDING: ${JSON.stringify(bound)}

규칙:
- 축 이름·단위·범위·점·수식·증감·구간·선 모양은 사용자 설명을 우선한다. 함수식 또는 좌표가 있으면 정확한 데이터로 표현한다. 물리 법칙·실험 수치·계수를 발명하지 않는다.
- 숫자 없는 '증가하다 일정', '봉우리 하나' 등은 coordinateMode:'observed', 축 scale:'unknown', min/max/step:null, ticks:[]의 정성적 모식도로 만든다. 내부 0..1 좌표를 실제 눈금·단위로 인쇄하지 않는다. series는 points, certainty:'observed', coordinateSpace:'normalized'. 직선 구간은 curveStyle:'straight', 곡선은 'smooth', 혼합이면 segmentModes:['line'|'smooth', ...]를 각 점 사이에 둔다. 16~32개의 적절한 곡선 점으로 극값·연속성을 보존한다.
- 정량 축의 눈금은 step만 지정하면 라벨이 생기지 않는다. 숫자를 숨기라는 요청이 없으면 axes.x/y.ticks에 표시할 모든 {value:실제값,label:문자열}을 명시한다. 0 라벨은 한 축에만 넣고 다른 축의 0은 label:""로 둔다. 수정 시 이전 숫자 눈금과 간격을 빠뜨리지 않는다.
- 수식·정량 데이터는 coordinateMode:'data', 선형 또는 로그 축의 유한한 증가 min/max 및 양수 step을 사용한다. 사용자 지정 범위가 없으면 수식을 보여 줄 표시 범위를 고를 수 있지만 새 물리 조건으로 주장하지 않는다. 모든 점과 수식값이 표시 범위에 들어가야 한다. 수식은 kind:'expression', certainty:'exact', coordinateSpace:'data', expression에는 x를 쓰는 우변만, domain:{min,max}. 지원 연산 + - * / ^, sqrt, sin, cos, exp, abs, ln(자연로그), log(상용로그), 상수 pi와 e. 각도는 라디안이다. 지수 표기 1e-6 대신 0.000001 또는 10^(-6)을 쓴다. JavaScript나 함수 정의 금지. 끊어진 정의역은 계열을 분리한다.
- 명시한 정량 좌표는 points, certainty:'exact', coordinateSpace:'data'. 산점도는 lineVisible:false, markerShape:'circle'. 막대는 kind:'bar', certainty:'exact', coordinateSpace:'data', items:[{label:'',value:3,x:1},{label:'',value:5,x:2}], widthRatio:0.6. 범주 이름은 x축 ticks의 label에 둔다.
- 흰 바탕·검정 선·보통 굵기 글자, 장식·3D·그라데이션·불필요한 격자·라벨·눈금은 생략한다. style:{fontSizePx:26,labelWeight:400,strokeWidth:0.35}. 가는 축과 보조선. frame.variant:'quadrant' 또는 'cross' 또는 'box'. 축 이름은 짧게, 단위는 지정된 경우만 쓴다.
- 축의 물리량 기호·이름은 title (수식 표기는 displayMath), 단위는 unit에 분리한다. 예: V_C(V)는 title:'V_C', unit:'V'로 쓴다. title/displayTitle/displayMath에 단위를 중복하지 않는다. 출력기는 가로축을 '문자(단위)' 한 줄, 세로축을 '물리량 위·(단위) 아래' 가운데 정렬 두 줄로 표시한다. 단위가 없으면 한 줄이다. 기본 orientation:'horizontal'.
- 글자는 출력기가 물리량 기호는 기울임꼴, 단위·숫자·점/계열 이름 A/B는 정자로 구분한다. 물리량 전체를 \\mathrm로 감싸지 않는다. 뜻이 확실한 설명용 아래첨자만 정자로 표시한다. 예: 축전기 전압은 displayMath:'V_{\\mathrm{C}}', 숫자 아래첨자 t_0는 그대로. 변수인 아래첨자는 임의 정자화하지 않는다.
- 축 이름 titlePosition/titleAnchor는 사용자가 위치를 지정하거나 수동 편집한 경우만 보존한다. 기본 위치는 출력기가 글자 폭과 여백을 측정해 y축 화살표 왼쪽, x축 화살표 아래쪽에 배치한다. 기본 좌표나 정렬을 임의 지정하지 않는다. 숫자 눈금과 축 이름을 같은 위치에 놓지 않는다. 지정 범위가 없으면 마지막 데이터·눈금과 축 화살촉 사이에 여유를 둔다. 계열 이름은 A/B 등 짧게 표시하고 의미는 필요하면 범례에 둔다.
- 축선 위치를 axisPlacement:{x:{mode:'fraction',value:가로축의 정규화 y},y:{mode:'fraction',value:세로축의 정규화 x}}로 명시한다. 특히 숫자 없는 정성 그래프에서는 mode:'zero'로 원점을 추측하지 않는다. 음의 전압/시간/변위 구간이 있으면 세로축을 프레임 왼쪽에 두지 말고 V=0/시간=0 위치에 둔다. O/0의 기준 좌표는 두 축의 교점과 같아야 하며 글자는 그 교점 옆으로 옮겨 겹침을 피한다. 정량 그래프에서만 mode:'zero'를 쓸 수 있다. 기호 눈금 f_A, -V_s 등은 axes의 ticks:{value:null,label:기호,position:정규화 위치}로 두어 축 아래에 표시한다.
- 물리 개략도는 설명이 결정하는 관계를 보존한다. 광전효과의 금속별 최대 운동 에너지-진동수 직선은 같은 기울기이며 일함수가 큰 쪽의 문턱진동수가 크다. 같은 금속·같은 진동수에서 빛 세기 2배는 같은 저지전압, 포화전류 2배이며 정확한 전류-전압 곡선식은 발명하지 않는다. 실험 자료는 입력한 모든 점을 그대로 보존한다. 최소제곱선을 요청하면 그 자료에서 계산하며, 원점 통과 여부를 따른다. 오차 막대는 입력된 오차만 점 주위에 kind:'guide',to:{x,y},dashLength:0,dashGap:0으로 그리되 세로 구간의 orientation:'vertical', 양끝의 짧은 가로 캡은 orientation:'horizontal'로 실제 방향과 맞춘다. 단위가 다른 축의 변환을 빠뜨리지 않는다. 긴 계열 이름은 곡선 끝을 오른쪽 여백까지 늘리지 말고 글자 폭만큼 안쪽에 배치한다.
- 계열은 axis:'y'|'y2', id는 고유 문자열. 각 points 계열은 breaks:[], endpoints:[], markerShape:'none'이 기본. 연속 곡선의 모든 앵커에 점을 찍지 않는다. 점 마커는 요청한 경우만 endpoints:[{index,kind:'open'|'closed'}]. 점선은 lineStyle:'dashed'.
- annotations는 [{id,kind:'text'|'point'|'guide'|'arrow',text,x,y,axis:'y',coordinateSpace:'data'|'normalized',orientation:'horizontal',endStyle:'none',to?:{x,y}}]. 정성 도식의 annotation 좌표도 normalized. 직접 배치하는 물체·점·계열 이름 A/B/P/Q는 text:'A', displayMath:'\\\\mathrm{A}'처럼 정자를 명시한다. 물리량이나 수식 annotation은 기울임을 유지하며 이름표로 취급하지 않는다. 계열 이름은 series.label에도 같은 원문을 기록하되 출력 위치는 annotation 한 곳만 사용한다. 보조선과 화살표는 요청한 경우만. series.label/endLabel/annotation에 같은 표기를 중복 출력하지 않는다.
- source 바인딩과 plotBox를 정확히 복사한다. 틀린 수식·서로 모순되는 조건·지원하지 않는 원형/3D 그래프는 임의 대체하지 말고 QUALITATIVE_EXAMPLE의 전체 JSON 형태를 복사한 뒤 series:[], annotations:[], review:[{path:'request',reason:'사용자가 고쳐 쓸 수 있는 구체적인 이유'}]로 바꿔 반환한다. 거절할 때도 schema/source/axes는 생략하지 않는다. 축은 scale:'unknown', min/max/step:null, ticks:[]로 두며 모순된 숫자 범위를 적용하지 않는다.
- 수정 요청이면 아래 이전 plan의 요청하지 않은 축·범위·계열을 유지하고 바인딩만 이번 source로 교체한다. 이전 정성 모양을 정확한 수식으로 승격하지 않는다. 예시의 축·수식·숫자는 형식 예시이며 사용자 조건이 아니다.
- 후속 수정에서는 기존 계열 id를 유지한다. 이름·단위·눈금·선 모양을 바꾸어도 같은 계열의 id는 바꾸지 않는다. 요청하지 않은 style/fontSizePx와 frame/series의 스타일 필드는 그대로 유지하고 기본값을 새로 덧붙이지 않는다. 특정 계열의 선 굵기를 바꾸라는 요청은 그 계열의 strokeWidth만 현재 그래프 폭 기준 mm로 지정한다. 현재 그래프의 기본 곡선 굵기는 0.5*폭/70 mm이며 두 배 요청이면 그 두 배다. 글자 크기를 바꾸라는 요청은 style.fontSizePx의 이전 값(없으면 26)에 배율을 적용한다. 화살표 길이를 바꾸라는 요청은 frame.arrowLength를 70 mm 축 폭 기준으로 지정하며 기본 생성 값은 5.22이다. 수동으로 조정한 글자 비율·화살표·선 굵기·축 제목 위치는 현재 객체를 우선한다.
QUALITATIVE_EXAMPLE: ${JSON.stringify(qualitative)}
NUMERIC_EXAMPLE: ${JSON.stringify(numeric)}
${physicsFunctionReference(description)}
${priorPlan ? '이전 생성 plan JSON:\n' + JSON.stringify(priorPlan) : ''}
${priorObjects ? '사용자가 마지막으로 편집한 현재 네이티브 객체 JSON (이전 plan과 다르면 현재 객체를 우선한다. coordplane의 labelX/labelY·눈금·범위·표시와 funcgraph의 함수·곡선·표기를 읽어 요청하지 않은 수동 편집을 보존한다. 해석적 함수는 expr·domainMin/domainMax·offset이 원본이며 중복된 화면 샘플 좌표는 생략했다. 측정값·관찰점은 생략하거나 반올림하지 않는다. 객체의 화면 위치/크기는 데이터값으로 해석하지 않는다. 출력은 위 그래프 plan 스키마 하나이며 네이티브 객체를 출력하지 않는다.):\n' + JSON.stringify(compactGraphDescriptionObjects(priorObjects)) : ''}
사용자의 그래프 설명:\n${description.trim()}`;
}

// Automatic title placement belongs to the renderer, which measures text at
// the export font size. Explicit positions (including manual edits) survive.
export function prepareGraphDescriptionPlan(plan) {
  const prepared = structuredClone(plan);
  // The bar renderer prints item labels too. Category ticks already carry
  // these names, so keep each category visible in exactly one place.
  for (const series of prepared.series || []) {
    if (series.kind !== 'bar') continue;
    for (const item of series.items || []) {
      if ((prepared.axes.x.ticks || []).some(t => t.value === item.x && t.label === item.label)) item.label = '';
    }
  }
  return prepared;
}
