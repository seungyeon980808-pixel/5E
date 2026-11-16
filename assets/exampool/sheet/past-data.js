// OmO 작성 · 출처·과목별 기출을 고를 때만 읽는다. 처음에는 기존 모평·수능만 받는다.
import { F, MONTH, shortTitle } from './past-search.js';

export const EXAM_SOURCES = [
  ['', '모평·수능'], ['hakpyeong', '학평 전체'],
  ...[3, 4, 5, 7, 10].map(month => [String(month), `${month}월 학평`]),
  ['all', '모든 기출'],
];
const indexes = new Map(), subjects = new Map(), selections = new Map();
const base = new URL('../convert/data/', import.meta.url);

async function json(path) {
  const response = await fetch(new URL(path, base));
  if (!response.ok) throw new Error('기출 목록을 불러오지 못했습니다. 다시 시도해 주세요.');
  if (path.endsWith('.gz')) return JSON.parse(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).text());
  return response.json();
}

function indexOf(source) {
  if (!indexes.has(source)) {
    const work = json(source ? 'hakpyeong/index.json' : 'index.json');
    indexes.set(source, work);
    work.catch(() => indexes.delete(source));
  }
  return indexes.get(source);
}

async function subjectItems(source, code) {
  const key = `${source}:${code}`;
  if (!subjects.has(key)) {
    const work = (async () => {
      const index = await indexOf(source);
      const label = index.subjects.find(subject => subject[0] === code)?.[1] || code;
      const rows = await json(source ? `hakpyeong/${code}.json.gz` : `${code}.json`);
      return rows.map(row => {
        const id = row[F.id], year = row[F.year], month = row[F.month], no = row[F.no];
        return {
          id, subject: code, subjectLabel: label, year, month, no, page: row[F.page],
          box: row[F.box], pdfFile: row[F.pdfFile], publicPath: index.files[row[F.pdfFile]],
          parts: row[F.parts] || [], tags: row[F.tags] || [], hasFigure: !!row[F.hasFigure],
          record: row[F.record], text: row[F.text] || '',
          title: `${year}학년도 ${MONTH[month] || month + '월'} ${label} ${no}번`,
          short: shortTitle(year, month, label, no),
          ...(source ? {card: index.cards.replace('{id}', encodeURIComponent(id))} : {}),
          ...(row[F.nativeImageBoxes]?.length ? { nativeImageBoxes: row[F.nativeImageBoxes] } : {}),
        };
      });
    })();
    subjects.set(key, work);
    work.catch(() => subjects.delete(key));
  }
  return subjects.get(key);
}

export async function loadPastQuestions(codes = [], source = '') {
  const key = `${source}:${codes.join(',')}`;
  if (!selections.has(key)) {
    const work = (async () => {
      const sources = source === 'all' ? ['', 'hakpyeong'] : [source ? 'hakpyeong' : ''];
      const catalogs = await Promise.all(sources.map(indexOf));
      const index = {
        ...catalogs[0],
        subjects: catalogs[0].subjects.map(([code, label]) => [code, label, catalogs.reduce((n, catalog) => n + (catalog.subjects.find(subject => subject[0] === code)?.[2] || 0), 0)]),
      };
      const wanted = codes.length ? codes : index.subjects.map(subject => subject[0]);
      const lists = await Promise.all(sources.flatMap(origin => wanted.map(code => subjectItems(origin, code))));
      const month = Number(source);
      const items = lists.flat().filter(item => !month || item.month === month)
        .sort((a, b) => b.year - a.year || String(a.month).localeCompare(String(b.month)) || a.subject.localeCompare(b.subject) || a.no - b.no);
      return { index, items };
    })();
    selections.set(key, work);
    work.catch(() => selections.delete(key));
  }
  return selections.get(key);
}
