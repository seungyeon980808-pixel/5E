import { matchesPaper } from './paper-profile.mjs';

export function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('ko');
}

const scienceSubjects = new Set(['p1', 'p2', 'c1', 'c2', 'b1', 'b2', 'e1', 'e2']);
const generalSubjects = new Map([['kor', '국어'], ['eng', '영어'], ['math', '수학']]);
const socialSubjects = new Set(['east_asia_history', 'economics', 'ethics_thought',
  'korea_geography', 'law_politics', 'life_ethics', 'politics_law',
  'society_culture', 'world_geography', 'world_history']);

export function subjectGroup(code) {
  if (scienceSubjects.has(code)) return { value: 'science', label: '과학탐구', hasDetails: true };
  if (generalSubjects.has(code)) return { value: code, label: generalSubjects.get(code), hasDetails: false };
  if (socialSubjects.has(code)) return { value: 'social', label: '사회탐구', hasDetails: true };
  return { value: 'other', label: '기타', hasDetails: true };
}

export function parseTokens(query) {
  const tokens = normalize(query).trim().split(/[#，,\s]+/u).filter(Boolean);
  if (tokens.length > 3) throw new RangeError('검색어는 최대 3개까지 입력할 수 있습니다.');
  return [...new Set(tokens)];
}

function searchableText(item, synonyms = {}) {
  const related = [...(item.tags || []), ...(item.parts || [])]
    .flatMap((name) => synonyms[name] || []);
  // Answers and curriculum metadata must not affect question-body search results.
  return normalize([
    item.id, item.title, item.textQuality === 'unreadable' ? '' : item.text,
    ...(item.tags || []), ...(item.parts || []), ...related,
  ].join(' '));
}

// The 2015 revision first applied to the CSAT cohort in academic year 2021.
// Keep legacy mappings visible for audit, but never treat them as applicable links.
export function curriculumYearMismatch(item) {
  return Number(item.year) < 2021 && /2015/u.test(item.curriculum?.framework || '');
}

export function curriculumDisplayState(item) {
  const standards = item.curriculum?.standards || [];
  const yearMismatch = curriculumYearMismatch(item);
  const verifiedCount = yearMismatch ? 0 : standards.filter((standard) =>
    item.curriculum?.reviewStatus === 'verified' && standard.reviewStatus === 'verified').length;
  return { yearMismatch, verifiedCount, candidateCount: standards.length - verifiedCount };
}

export function prepareQuestions(items, synonyms = {}) {
  return items.map((item) => {
    const hay = searchableText(item, synonyms);
    return { ...item, _hay: hay, _hayNs: hay.replace(/\s+/gu, '') };
  });
}

// One normalized string, with ranges for ranking. Do not duplicate the body in
// downloaded assets or include conversion geometry in the search index.
export function compactSearchRecord(item, synonyms = {}) {
  const hay = searchableText(item, synonyms);
  const parts = [normalize(item.id), normalize(item.title),
    normalize(item.textQuality === 'unreadable' ? '' : item.text), normalize((item.tags || []).join(' '))];
  let start = 0;
  for (const part of parts) {
    if (hay.slice(start, start + part.length) !== part) throw new Error(`Search span mismatch: ${item.id}`);
    start += part.length + 1;
  }
  const record = [item.id, hay, ...parts.map(part => part.length)];
  if (item.textQuality === 'unreadable') record.push(normalize(item.text));
  return record;
}

export function attachSearchRecord(item, record) {
  const [id, hay, idLength, titleLength, textLength, tagsLength, unreadableText] = record;
  if (id !== item.id) throw new Error('검색 자료의 문항 번호가 일치하지 않습니다.');
  const titleAt = idLength + 1, textAt = titleAt + titleLength + 1, tagsAt = textAt + textLength + 1;
  return {...item, _hay:hay, _hayNs:hay.replace(/\s+/gu, ''),
    _scoreTitle:hay.slice(titleAt, titleAt + titleLength),
    _scoreText:unreadableText ?? hay.slice(textAt, textAt + textLength),
    _scoreTags:hay.slice(tagsAt, tagsAt + tagsLength)};
}

export function searchQuestions(items, query, filters = {}) {
  const tokens = parseTokens(query);
  const prepared = tokens.length && items[0]?._hay === undefined ? prepareQuestions(items) : items;
  const yearFrom = Number(filters.yearFrom) || 0;
  const yearTo = Number(filters.yearTo) || Infinity;
  const month = Number(filters.month) || 0;
  const hits = prepared.filter((item) => {
    if (filters.group && subjectGroup(item.subject).value !== filters.group) return false;
    if (filters.subject && item.subject !== filters.subject) return false;
    if (item.year < yearFrom || item.year > yearTo) return false;
    if (month && item.month !== month) return false;
    if (!matchesPaper(item, filters)) return false;
    const curriculum = item.curriculum || {};
    // A mismatched legacy link cannot qualify a framework, unit, or standard filter.
    if ((filters.framework || filters.unit || filters.standard) && curriculumYearMismatch(item)) return false;
    if (filters.framework && curriculum.framework !== filters.framework) return false;
    if (filters.unit && curriculum.unit !== filters.unit && !(curriculum.unit || '').split(/\s*·\s*/u).includes(filters.unit)
      && !(curriculum.standards || []).some((standard) => standard.unit === filters.unit)) return false;
    if (filters.standard && !(curriculum.standards || [])
      .some((standard) => standard.code === filters.standard)) return false;
    return tokens.every((token) => item._hay.includes(token) || item._hayNs.includes(token));
  });
  const scores = new Map();
  const score = (item) => {
    if (scores.has(item.id)) return scores.get(item.id);
    const value = tokens.reduce((sum, token) => {
    const title = item._scoreTitle ?? normalize(item.title);
    const tags = item._scoreTags ?? normalize((item.tags || []).join(' '));
    return sum + (title.includes(token) ? 8 : 0) + (tags.includes(token) ? 5 : 0)
      + ((item._scoreText ?? normalize(item.text)).includes(token) ? 1 : 0);
    }, 0);
    scores.set(item.id, value);
    return value;
  };
  return hits.sort((a, b) => score(b) - score(a)
    || b.year - a.year || b.month - a.month || a.no - b.no || (a._sourceOrder || 0) - (b._sourceOrder || 0));
}

const namePattern = /^([pbce][12])_(\d{4})_(06|09|11)\.pdf$/u;
const subjects = {
  p1: '물리학Ⅰ', p2: '물리학Ⅱ', c1: '화학Ⅰ', c2: '화학Ⅱ',
  b1: '생명과학Ⅰ', b2: '생명과학Ⅱ', e1: '지구과학Ⅰ', e2: '지구과학Ⅱ',
};

export function catalogFiles(records, questions) {
  const grouped = new Map();
  for (const item of questions) {
    if (!grouped.has(item.pdfFile)) grouped.set(item.pdfFile, []);
    grouped.get(item.pdfFile).push(item);
  }
  return records.flatMap((record) => {
    const pdfFile = typeof record === 'string' ? record : record.pdfFile;
    const match = namePattern.exec(pdfFile);
    const first = grouped.get(pdfFile)?.[0];
    const subject = record.subject || first?.subject || match?.[1];
    const year = Number(record.year || first?.year || match?.[2]);
    const month = Number(record.month || first?.month || match?.[3]);
    if (!subject || !year || !month) return [];
    return [{ pdfFile, subject, subjectLabel: record.subjectLabel || first?.subjectLabel || subjects[subject] || subject,
      year, month, exam: record.exam || first?.exam || `${year}학년도 ${month === 11 ? '수능' : `${month}월 모평`}`,
      questionCount: grouped.get(pdfFile)?.length || 0 }];
  }).sort((a, b) => b.year - a.year || b.month - a.month || a.subject.localeCompare(b.subject));
}

export function searchFiles(files, questions, query, filters = {}) {
  const tokens = parseTokens(query);
  const yearFrom = Number(filters.yearFrom) || 0;
  const yearTo = Number(filters.yearTo) || Infinity;
  const month = Number(filters.month) || 0;
  const eligible = files.filter((file) => (!filters.group || subjectGroup(file.subject).value === filters.group)
    && (!filters.subject || file.subject === filters.subject)
    && file.year >= yearFrom && file.year <= yearTo && (!month || file.month === month));
  const counts = new Map();
  for (const item of questions) if (matchesPaper(item, filters)) {
    const entry = counts.get(item.pdfFile) || { questionCount: 0, firstMatchPage: item.page || 1 };
    entry.questionCount += 1;
    entry.firstMatchPage = Math.min(entry.firstMatchPage, item.page || 1);
    counts.set(item.pdfFile, entry);
  }
  const scoped = eligible.filter((file) => file.questionCount === 0 || counts.has(file.pdfFile))
    .map((file) => ({ ...file, ...(counts.get(file.pdfFile) || {}) }));
  if (!tokens.length && !filters.framework && !filters.unit && !filters.standard) {
    return scoped.map((file) => ({ ...file, matchedCount: file.questionCount }));
  }
  const byName = new Map(scoped.map((file) => [file.pdfFile, file]));
  const matches = new Map();
  for (const item of searchQuestions(questions, query, filters)) {
    if (!byName.has(item.pdfFile)) continue;
    const current = matches.get(item.pdfFile);
    if (current) current.matchedCount += 1;
    else matches.set(item.pdfFile, { matchedCount: 1, firstMatchPage: item.page || 1 });
  }
  return [...matches].map(([name, match]) => ({ ...byName.get(name), ...match }));
}
export function fileQuestions(questions, pdfFile, page = null, filters = { allProfiles: true }) {
  return questions.filter((item) => item.pdfFile === pdfFile && (page === null || item.page === page) && matchesPaper(item, filters))
    .sort((a, b) => a.page - b.page || a.no - b.no || a.id.localeCompare(b.id));
}
