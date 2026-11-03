// OmO 작성 · 자료실에서도 문항 카드와 같은 압축 색인을 필요할 때만 읽는다.
import {loadPastQuestions} from '../../assets/exampool/sheet/past-data.js';
import {downloadDriveFile} from '../../assets/exampool/convert/es/drive-source.mjs';
import {createDocumentRecord} from './contract.js?v=1.7.0-four-session-integration';
import {sha256Hex} from './pack-store.js?v=1.7.0-four-session-integration';

const ID = '5e.hakpyeong';
export async function loadHakpyeongPack(subjects = []) {
  const {index, items} = await loadPastQuestions(subjects, 'hakpyeong');
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
    return Object.freeze({
      documentId, documentTitle: item.title, pageNumber: item.page, itemId: `${ID}::${item.id}`, itemNumber: item.no,
      text: item.text, normalized: item.text.normalize('NFKC').toLocaleLowerCase('ko'), words: [],
      source: {documentId, pageNumber: item.page, rect: [x0 / width, y0 / height, (x1 - x0) / width, (y1 - y0) / height], fullPageFallback: false},
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
