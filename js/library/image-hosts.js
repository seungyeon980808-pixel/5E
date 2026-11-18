// 그림 주소를 정하는 한 곳(1.7.1).
// 5E가 불러오는 그림 세 묶음(교과서·기출 쪽 미리보기, 과학 부품 SVG, 기출 문항 그림)과
// 기출 카드 그림(exam-search)의 주소는 모두 여기서 만든다. 다른 파일은 주소를 직접 쓰지 않는다.
//
// ▶ Cloudflare 그림 Worker가 생기면 아래 IMAGE_WORKER_BASE 한 줄만 바꾼다.
//   예: "https://5e-images.<계정>.workers.dev/"  (끝에 / 를 붙인다)
//   그 Worker는 `data/images/` 묶음(scripts: data/images/build-bundle.mjs)과 같은 경로를 내놓는다:
//     previews/<sha>/<쪽>[-thumb].webp   ← assets/pdf-library/previews
//     parts/<파일>.svg                   ← assets/parts-library/svg
//     exam/<문항 id>.png                 ← assets/exam-library/images
//   비어 있으면 지금 주소 그대로 동작한다.
export const IMAGE_WORKER_BASE = "https://5e-images.5e-desktop.workers.dev/";

// 설치판이 원격으로 받을 때 쓰는 사이트 주소(Worker가 없을 때). 그림 파일 이름은 바뀌지 않으므로(쪽 미리보기는 PDF sha 기준)
// 웹 사이트에 올라간 같은 파일을 받는다.
export const SITE_BASE = "https://www.5e.ai.kr/";

// 기출 카드 그림(별도 저장소 exam-search). 평가원 색인(assets/exampool/convert/data/index.json)과
// 학평 색인(…/hakpyeong/index.json)의 `cards` 칸과 같은 값이다. 둘이 다른 곳을 가리키는 것은 1.7.0 그대로다.
export const EXAM_CARD_TEMPLATES = Object.freeze({
  kice: "https://seungyeon980808-pixel.github.io/exam-search/cards/{id}.webp",
  hakpyeong: "https://raw.githubusercontent.com/seungyeon980808-pixel/exam-search/main/cards/{id}.webp",
});

const APP_ROOT = new URL("../../", import.meta.url);
const workerBase = () => IMAGE_WORKER_BASE ? IMAGE_WORKER_BASE.replace(/\/?$/u, "/") : "";

// 설치판(Electron) 창인지: 본 창은 fiveEDesktop, 시험지 창은 fiveEExam이 미리 놓인다(desktop/preload.cjs·exam-preload.cjs).
export function isInstalledApp(scope = globalThis) {
  return Boolean(scope?.fiveEDesktop || scope?.fiveEExam);
}

// 설치판에 싣지 않는 묶음(쪽 미리보기·기출 문항 그림)은 설치판에서 사이트 주소로, 웹에서는 지금처럼 같은 사이트의 상대 경로로.
function shippedElsewhere(path, scope) {
  return new URL(path, isInstalledApp(scope) ? SITE_BASE : APP_ROOT).href;
}

/** 교과서·기출 PDF 쪽 미리보기. name 예: "3.webp", "3-thumb.webp". 설치판에는 없다(원격). */
export function pagePreviewUrl(sha, name, scope = globalThis) {
  const tail = `${sha}/${name}`;
  const worker = workerBase();
  return worker ? `${worker}previews/${tail}` : shippedElsewhere(`assets/pdf-library/previews/${tail}`, scope);
}

/** 과학 부품 SVG. 설치판에는 그대로 실려 있으므로 설치판은 늘 자기 파일을 쓴다. 웹은 Worker가 생기면 Worker로. */
export function partsSvgUrl(file, scope = globalThis) {
  const name = encodeURIComponent(file);
  const worker = workerBase();
  return worker && !isInstalledApp(scope) ? `${worker}parts/${name}` : `assets/parts-library/svg/${name}`;
}

/** 기출 문항 그림(원본 PNG). 설치판에는 없다(원격). */
export function examFigureUrl(id, scope = globalThis) {
  const name = `${encodeURIComponent(id)}.png`;
  const worker = workerBase();
  return worker ? `${worker}exam/${name}` : shippedElsewhere(`assets/exam-library/images/${name}`, scope);
}

/** 기출 카드 그림. template은 색인의 `cards` 값(없으면 평가원 것). */
export function examCardUrl(id, template = EXAM_CARD_TEMPLATES.kice) {
  return String(template || EXAM_CARD_TEMPLATES.kice).replace("{id}", encodeURIComponent(id));
}

/** 기출 카드 그림 주소인지(github.io·raw 두 모양 모두). 카드 그림만 문항 부분으로 잘라 보일 때 쓴다. */
export function isExamCardUrl(url) {
  return /\/exam-search\/(?:main\/)?cards\/[^/]+\.webp(?:[?#]|$)/u.test(String(url || ""));
}

/** 다른 출처 그림을 canvas에 그릴 때 필요한지(같은 출처·data:·blob:·file:은 필요 없음). */
export function needsCors(url, scope = globalThis) {
  if (!/^https?:/iu.test(String(url || ""))) return false;
  const here = scope?.location?.origin;
  return !here || new URL(url).origin !== here;
}

// 미리 변환한 기출 문항 JSON(Cloudflare 정적 파일 Worker 5e-exam-pdf·5e-exam-hak의 /q/<문항>.json).
// 그림 엔진(js/ai-figure/reference-images.js)이 참고 기출 그림을 여기서 꺼낸다. 문항 JSON 안 figure 블록에 data URL이 들어 있다.
// assets/exampool/sheet/preconverted.js의 HOSTS와 같은 값이다(그쪽은 1.7.1 그대로 둠).
export const EXAM_QUESTION_HOSTS = Object.freeze({
  kice: "https://5e-exam-pdf.5e-desktop.workers.dev/q/",
  hak: "https://5e-exam-hak.5e-desktop.workers.dev/q/",
});

/** 기출 문항 JSON 주소. src는 그림 색인 줄의 src('kice'|'hak'). */
export function examQuestionJsonUrl(item, src = "kice") {
  const base = src === "hak" ? EXAM_QUESTION_HOSTS.hak : EXAM_QUESTION_HOSTS.kice;
  return `${base}${encodeURIComponent(item)}.json`;
}
