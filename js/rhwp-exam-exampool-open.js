// 5E_hwp 「파일 → ExamPool 시험지 열기」(10-21 밤). ExamPool이 저장한 자료(IndexedDB)를 읽어
// ExamPool의 「한글로 보내기」와 같은 조판 엔진(exam-build)으로 시험지 HWPX를 만든다. ExamPool 창을 열지 않아도 된다.
import { migrate } from '../assets/exampool/sheet/model.js';
import { buildExamDocument } from '../assets/exampool/sheet/exam-build.js';
import { exportLayoutHwpx } from '../assets/exampool/sheet/native-hwpx.js?v=1014-compact-panel';
import { examPlan } from '../assets/exampool/sheet/exam-layout.js';

// ExamPool 화면과 같은 저장소 이름(프리뷰 주소면 「5e.preview:」가 붙는다).
const storeName = () => (/^\/preview(?:\/|$)/.test(location.pathname) ? '5e.preview:' : '') + '5e-exampool-structure';

function readDraft() {
  return new Promise((resolve, reject) => {
    // 판 번호 없이 연다 — ExamPool이 올린 판 그대로(낮은 판으로 열어 저장소를 바꾸지 않는다).
    const request = indexedDB.open(storeName());
    request.onupgradeneeded = () => { request.transaction.abort(); };
    request.onerror = () => reject(new Error('ExamPool 저장소를 열지 못했습니다. 맨 위 「exam」에서 한 번 연 뒤 다시 시도하세요.'));
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('state')) { db.close(); resolve(null); return; }
      const get = db.transaction('state').objectStore('state').get('draft');
      get.onsuccess = () => { db.close(); resolve(get.result || null); };
      get.onerror = () => { db.close(); reject(get.error); };
    };
  });
}

// [{id, title, count, missing}] — missing = 조판을 저장하지 않은 문항 수(만들 수 없음).
export async function listExamPoolExams() {
  const raw = await readDraft();
  if (!raw) return { data: null, exams: [] };
  const data = migrate(raw);
  const exams = (data.exams || []).filter(e => e.items?.length).map(e => {
    const plan = examPlan(data, e);
    return { id: e.id, title: e.title || '이름 없는 시험지', count: plan.items.length, missing: plan.missing.length, mixed: !!plan.mixed };
  });
  return { data, exams };
}

async function ensureCFB() {
  if (window.XLSX?.CFB) return window.XLSX.CFB;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('../assets/exampool/sheet/vendor/xlsx.full.min.js', import.meta.url).href;
    script.onload = resolve; script.onerror = () => reject(new Error('한글 저장 도구를 불러오지 못했습니다.'));
    document.head.append(script);
  });
  return window.XLSX.CFB;
}

// 고른 시험지를 HWPX 바이트로. Document = 지금 한글 문서 손잡이의 생성자.
export async function buildExamPoolHwpx(Document, data, examId) {
  const exam = (data.exams || []).find(e => e.id === examId);
  if (!exam) throw new Error('그 시험지를 찾지 못했습니다. ExamPool에서 지워졌을 수 있습니다.');
  const CFB = await ensureCFB();
  const { document } = await buildExamDocument(Document, data, exam);
  try { return { bytes: exportLayoutHwpx(document, CFB), title: exam.title || '시험지' }; }
  finally { document.free(); }
}
