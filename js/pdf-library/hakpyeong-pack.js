// OmO 작성 · 자료실에서도 문항 카드와 같은 압축 색인을 필요할 때만 읽는다.
import {loadPastQuestions} from '../../assets/exampool/sheet/past-data.js';
import {downloadDriveFile} from '../../assets/exampool/convert/es/drive-source.mjs';
import {createDocumentRecord} from './contract.js?v=1.7.0-four-session-integration';
import {sha256Hex} from './pack-store.js?v=1.7.0-four-session-integration';

const ID = '5e.hakpyeong';
const WORDS_BASE = new URL('../../assets/exampool/convert/data/hakpyeong/words/', import.meta.url);

// 11-09: 학평 문항 낱말 위치(맥 Vision OCR, 문항 상자 안만) — 검색 형광 상자를 그리는 데 쓴다.
// 못 읽어도 검색은 그대로 되게 빈 목록으로 넘어간다(형광만 없음).
async function loadSubjectWords(code) {
  try {
    const response = await fetch(new URL(`${code}.json.gz`, WORDS_BASE));
    if (!response.ok) return null;
    const data = JSON.parse(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).text());
    return data?.v === 1 && data.items && typeof data.items === 'object' ? data : null;
  } catch { return null; }
}

// 낱말 상자는 문항 칸 안으로 자른다 — 학평 카드는 미리 만든 그림이라, 낱말이 칸 밖으로 조금 넘치면
// 칸을 늘려 잡는 규칙(coverItemWords)이 그림과 어긋나 형광이 아래로 갈수록 밀렸다.
function compactWordsOf(wordsBySubject, item, rect) {
  const data = wordsBySubject.get(item.subject), list = data?.items?.[item.id];
  if (!Array.isArray(list)) return [];
  const scale = Number(data.scale) || 10000;
  const [bx, by, bw, bh] = rect, right = bx + bw, bottom = by + bh;
  return list.flatMap(word => {
    if (!Array.isArray(word) || word.length !== 5 || typeof word[0] !== 'string' || !word[0]) return [];
    const [x, y, w, h] = word.slice(1).map(value => Number(value) / scale);
    if (![x, y, w, h].every(Number.isFinite)) return [];
    const x0 = Math.max(x, bx), y0 = Math.max(y, by), x1 = Math.min(x + w, right), y1 = Math.min(y + h, bottom);
    return x1 > x0 && y1 > y0 && x0 >= 0 && y0 >= 0 && x1 <= 1 && y1 <= 1 ? [[word[0], x0, y0, x1 - x0, y1 - y0]] : [];
  });
}

export async function loadHakpyeongPack(subjects = []) {
  const [{index, items}, wordsBySubject] = await Promise.all([
    loadPastQuestions(subjects, 'hakpyeong'),
    (async () => {
      const codes = subjects.length ? subjects : (await loadPastQuestions([], 'hakpyeong')).index.subjects.map(subject => subject[0]);
      return new Map(await Promise.all(codes.map(async code => [code, await loadSubjectWords(code)])));
    })(),
  ]);
  const wanted = new Set(items.map(item => item.pdfFile));
  const byFile = new Map(index.documents.filter(file => wanted.has(file.file)).map(file => [file.file, file]));
  const documents = [...byFile.values()].map(file => {
    const id = `${ID}::${file.file.slice(0, -4)}`;
    return Object.freeze({
      ...createDocumentRecord({
        id, title: file.file, pageCount: file.pages, status: 'indexed',
        source: {kind: 'pack', locator: `${ID}/${file.publicPath.replace(/^학력평가\//, '')}`, relativePath: file.publicPath, displayName: file.file, sha256: file.sha256},
        pages: file.pageSizes.map(([widthPoints, heightPoints], number) => ({documentId: id, pageNumber: number + 1, widthPoints, heightPoints, text: '', words: [], items: []})),
      }),
      packId: ID,
      driveFolder: Object.freeze({id: ID, title: '학력평가 과학탐구'}),
      metadata: Object.freeze({subject: file.subject, academicYear: file.year, executionYear: file.executionYear, administration: String(file.month).padStart(2, '0'), category: 'past-exams'}),
    });
  });
  const entries = items.map(item => {
    const file = byFile.get(item.pdfFile), documentId = `${ID}::${item.pdfFile.slice(0, -4)}`;
    const [width, height] = file.pageSizes[item.page - 1], [x0, y0, x1, y1] = item.box;
    // 학평 카드 그림은 문항 칸 위·폭은 그대로, 아래 빈 곳만 잘라 낸 그림이다(11-09 카드 11,200장 크기로 확인).
    // 칸 높이를 카드와 같게 줄여야 형광·미리보기·자르기가 카드 그림과 맞는다(전에는 형광이 아래로 갈수록 위로 밀림).
    const cardHeight = Number(wordsBySubject.get(item.subject)?.cardHeight?.[item.id]);
    const heightScale = cardHeight > 0.05 && cardHeight < 1 ? cardHeight : 1;
    const rect = [x0 / width, y0 / height, (x1 - x0) / width, (y1 - y0) / height * heightScale];
    return Object.freeze({
      documentId, documentTitle: item.title, pageNumber: item.page, itemId: `${ID}::${item.id}`, itemNumber: item.no,
      text: item.text, normalized: item.text.normalize('NFKC').toLocaleLowerCase('ko'), words: [], compactWords: compactWordsOf(wordsBySubject, item, rect),
      source: {documentId, pageNumber: item.page, rect, fullPageFallback: false},
      metadata: {subject: item.subject, academicYear: item.year, administration: String(item.month).padStart(2, '0')},
    });
  });
  const downloadDocument = async document => {
    const bytes = new Uint8Array(await downloadDriveFile(document.source.relativePath));
    if (await sha256Hex(bytes) !== document.source.sha256) throw new Error('학평 원문이 색인과 다릅니다. 자료를 갱신한 뒤 다시 열어 주세요.');
    return {bytes, fileName: document.source.displayName, mimeType: 'application/pdf'};
  };
  return Object.freeze({
    id: ID, title: '학력평가 과학탐구', documents: Object.freeze(documents),
    searchIndex: Object.freeze({schemaVersion: 'pdf-search-index-v1', entries: Object.freeze(entries)}),
    downloadDocument,
    async openDocument(runtime, document) {
      const resource = await downloadDocument(document);
      return runtime.openDocumentResource({id: document.id, title: document.title, source: document.source, metadata: document.metadata, data: resource.bytes}, document);
    },
  });
}
