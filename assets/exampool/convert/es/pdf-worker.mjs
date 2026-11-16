import './stream-iterator-polyfill.mjs';
// 진짜 작업자(Worker)가 한 번 실패하면 pdf.js는 같은 주소를 메인 스레드에서 불러 WorkerMessageHandler를 꺼내 쓴다.
// 예전 감싸개는 그것을 내보내지 않아, 그 뒤로 그 창의 PDF가 모두 열리지 않았다(10-21 점검 하).
export { WorkerMessageHandler } from './vendor/pdfjs/pdf.worker.mjs';
