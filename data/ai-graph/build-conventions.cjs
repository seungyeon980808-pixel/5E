// 과목별 평가원 그래프 관례 목록 다시 만들기 → assets/ai-graph/conventions.json
// image_generator graphdraw/build-conventions.cjs를 옮겼다. 기출 그래프 꼬리표(desc·tags)를 과목마다 모아
// AI가 자주 나오는 그래프 종류와 그리는 관례를 정리한다. AI를 부르므로 손으로만 돌린다(검사·빌드에서 돌지 않음).
//   node data/ai-graph/build-conventions.cjs <image_generator의 catalog/tags.jsonl 경로> [--model gpt-6.1-sol]
// AI는 설치판과 같은 맥의 Codex 로그인(desktop/ai-direct-image.cjs)을 쓴다.
const fs = require('node:fs');
const path = require('node:path');
const { createDirectImageClient } = require('../../desktop/ai-direct-image.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'assets', 'ai-graph', 'conventions.json');
const SUBJ = { p1: '물리학Ⅰ', c1: '화학Ⅰ', b1: '생명과학Ⅰ', e1: '지구과학Ⅰ', p2: '물리학Ⅱ', c2: '화학Ⅱ', b2: '생명과학Ⅱ', e2: '지구과학Ⅱ' };

function parseJson(t) {
  t = String(t).replace(/```(json)?/g, '');
  const s = Math.min(...['{', '['].map((c) => { const i = t.indexOf(c); return i < 0 ? 1e9 : i; }));
  const e = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  return JSON.parse(t.slice(s, e + 1));
}

async function main() {
  const args = process.argv.slice(2);
  const tagsFile = args.find((a) => !a.startsWith('--'));
  const model = args.includes('--model') ? args[args.indexOf('--model') + 1] : 'gpt-6.1-sol';
  if (!tagsFile) { console.error('사용법: node data/ai-graph/build-conventions.cjs <catalog/tags.jsonl> [--model 이름]'); process.exit(1); }
  const T = fs.readFileSync(tagsFile, 'utf8').trim().split('\n')
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((t) => t && /그래프/.test(t.type || ''));
  const client = createDirectImageClient({ timeoutMs: 300000 });
  const text = async (prompt) => {
    for (let a = 1; a <= 3; a++) { try { return (await client.readText({ model, text: prompt })).text; } catch (e) { if (a === 3) throw e; } }
    return '';
  };
  const out = {};
  await Promise.all(Object.entries(SUBJ).map(async ([code, name]) => {
    const list = T.filter((t) => t.id.startsWith(code + '_')).map((t) => `- ${t.desc} [${(t.tags || []).join(', ')}]`).join('\n').slice(0, 24000);
    const r = await text(`아래는 평가원 ${name} 기출의 그래프 그림 설명 목록이다. 자주 나오는 그래프 종류를 10~16개로 묶고, 종류마다 평가원이 그리는 관례를 적는다(축 이름·단위, 축 방향(역방향·로그), 원점, 곡선 모양(직선·꺾은선·지수·포화·종 모양 등), 곡선 이름 붙이는 법, 자주 넣는 보조선·점, 흔한 실수).
JSON 배열로만: [{"name":"그래프 종류(예: 막전위-시간)","keywords":["요청에서 이 종류를 알아볼 낱말"],"rules":"그리는 관례 3~6줄"}]
목록:
${list}`);
    try { out[name] = parseJson(r) || []; } catch { out[name] = []; }
    console.log(name, out[name].length);
  }));
  // 한 과목이라도 비면 옛 파일을 지키고 새 결과는 옆에 둔다(실패로 덮어쓰지 않음).
  const empty = Object.values(SUBJ).filter((name) => !out[name]?.length);
  const target = empty.length ? OUT.replace(/\.json$/, '.new.json') : OUT;
  fs.writeFileSync(target, JSON.stringify(out, null, 1));
  console.log(empty.length ? `빈 과목 ${empty.join(', ')} — 옛 파일 유지, 새 결과: ${target}` : `저장: ${target}`);
}

main().catch((e) => { console.error('실패:', e.message); process.exit(1); });
