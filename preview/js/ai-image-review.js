import { planImageReferences } from "./ai-reference-roles.js?v=1.6.0-preview-labeler-0917-1111";

export const AI_IMAGE_REVIEW_VERSION = "1.6.0";
export const AI_IMAGE_REVIEW_MODEL = "gpt-5.6-sol";
export const AI_IMAGE_REVIEW_EFFORT = "high";
export const AI_IMAGE_GENERATION_EFFORT = "medium";
export const AI_IMAGE_MAX_GENERATIONS = 2;

const REQUIRED_CHECKS = Object.freeze([
  ["object-counts", "객체·부품 수"],
  ["inside-outside", "안/밖 및 포함 관계"],
  ["liquid-occupancy", "액체 점유와 경계"],
  ["connections", "연결·접촉·분기"],
  ["composition-state", "방향·상대 배치·패널 상태"],
  ["black-fill-meaning", "검은 채움의 의미 구분"],
  ["presentation", "문자·질감·배경 표현"],
  ["request-scope", "요청 반영·요청 외 보존"],
]);

const text = (value) => value == null ? "" : String(value).trim();
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

export function buildStructuralInventory({ request = "", references = [], structureContract = "" } = {}) {
  const names = references.map((item, index) => `${index + 1}. ${text(item?.name) || `원본 참고 ${index + 1}`}`);
  return [
    "내부 구조 목록(그림에 출력하지 않음):",
    text(structureContract),
    names.length ? `원본 참고 순서:\n${names.join("\n")}` : "원본 참고 없음: 사용자 요청만 구조 근거로 사용",
    `요청 핵심: ${text(request) || "명시된 요청 없음"}`,
    "생성 전에 내부적으로 객체·부품 수, 안/밖, 액체 점유, 연결·접촉·분기, 층 순서, 검은 채움의 의미를 짧게 열거하고 서로 모순이 없는지 확인한다. 이 목록이나 설명은 최종 이미지에 쓰지 않는다.",
  ].join("\n");
}

// Header metadata only, not PNG integrity validation or pixel processing.
// Read the prepared attachment, never the pre-resize candidate or a STYLE image.
export function readReviewPngDimensions(data) {
  if (typeof data !== "string") return null;
  const prefix = /^data:image\/png;base64,/i.exec(data);
  if (!prefix) return null;
  try {
    const header = atob(data.slice(prefix[0].length, prefix[0].length + 44));
    if (header.length < 33) return null;
    const b = Array.from(header, (c) => c.charCodeAt(0));
    if ([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82].some((v, i) => b[i] !== v)) return null;
    const uint32 = (i) => b[i] * 16777216 + b[i+1] * 65536 + b[i+2] * 256 + b[i+3];
    const width = uint32(16), height = uint32(20);
    if (!width || !height || width > 2147483647 || height > 2147483647) return null;
    return { width, height };
  } catch { return null; }
}

export function buildImageReviewPrompt({
  request = "", structuralInventory = "", referenceNames = [], candidateName = "현재 후보", candidateAttachmentData = "", markPolicyContract = "", referenceRoleContract = "",
} = {}) {
  const dimensions = readReviewPngDimensions(candidateAttachmentData);
  const referenceList = referenceNames.length
    ? referenceNames.map((name, index) => `${index + 1}. ${text(name) || `원본 참고 ${index + 1}`}`).join("\n")
    : "(원본 참고 이미지 없음: 사용자 요청만 기준으로 사용)";
  return `5E 과학 도식 독립 시각 검수 규칙 v${AI_IMAGE_REVIEW_VERSION}
역할: 새 대화에서 원본 참고 이미지들과 현재 후보 이미지를 직접 대조하는 독립 검수자다. ${text(referenceRoleContract) ? `첨부 순서와 역할은 다음 계약을 따른다. STYLE_REFERENCE를 원본 또는 후보로 계수하지 않는다.\n${text(referenceRoleContract)}` : `첨부 순서는 원본 참고 이미지 전부가 먼저이고 마지막 첨부가 현재 후보 "${text(candidateName) || "현재 후보"}"다.`}

원본 참고 목록:
${referenceList}

사용자 원래 요청:
${text(request)}

${text(structuralInventory)}

${text(markPolicyContract)}

판정 원칙:
- 명시된 수정 요청을 판정 기준에 먼저 반영한다. 사용자가 의도한 개수·위치·연결 변경을 단순히 원본과 다르다는 이유로 실패 처리하지 않는다.
- 이름이 '수정 전 선택 버전'인 첨부는 추가 물체나 패널이 아니라 수정 전 기준 이미지다. 최초 원본은 과학적 의미의 근거, 수정 전 버전은 요청 밖 부분의 보존 근거로 구분한다.
- request-scope: 위치별 코멘트와 이번 요청이 각각 반영됐는가. 수정 전 버전이 있으면 요청하지 않은 부분의 물체·형태·색조·배치가 불필요하게 바뀌지 않았는가. 최초 생성이면 평가원식 표현 변경은 허용하되 요청과 원본 구조를 보존했는지 확인한다. 관찰할 수 없으면 uncertain이다.
- 점수나 임의의 95점 기준을 만들지 않는다. 아래 구조적 하드 게이트를 각각 시각적으로 확인한다.
- object-counts: 의미 있는 객체·부품·층·패널의 수가 원본과 같은가. 단계별 묘사 수와 동시 존재 개체 수를 구별하고 작은 내부/하층 요소도 대조한다. 자동 관찰 명세는 정답이 아니므로 원본을 직접 확인한다. 명세의 null/불확실 관찰을 임의의 확정 개수나 fail 근거로 사용하지 않는다.
- inside-outside: 무엇이 무엇의 안/밖에 있는지, 포함·중첩·통과 관계가 같은가.
- liquid-occupancy: 액체가 어느 용기의 어느 구획을 얼마나 채우는지, 액면·경계·빈 공간의 위치가 같은가. 액체가 없으면 해당 없음의 근거를 detail에 쓴 뒤 pass로 표시한다.
- connections: 도선·관·막대·경계의 연결, 접촉, 교차, 분기, 단절이 원본과 같은가. 상태 변화/발생 과정의 방향 화살표는 의미 관계지만, 표시선 선택이 제거이면 의도적 제거로 판정한다. 유지로 선택한 표시와 실제 도선·관의 연결은 보존해야 한다.
- composition-state: 방향, 좌우·상하 상대 배치, 패널 순서와 각 패널의 상태·변화가 원본과 같은가. 크기 순서만 같다고 상대 크기 비율까지 pass로 판정하지 않는다. 전체 그림의 균일 확대·이동과 특정 객체의 확대·플롯 종횡비 변경을 구별한다. 그래프는 축 구획 내 교점·끝점·직선 전환 위치를 대조하고, 강조면의 상·하·좌·우 경계를 곡선과 별개로 확인한다. 모델 관찰의 경계 설명을 복사하지 말고 원본에서 재확인하며 불명확하면 uncertain이다.
- 회로·관·분기망의 형상 추가 대조(composition-state/request-scope): 전기적·기능적 연결이 같아 connections가 pass여도 실제 경로와 비율은 따로 판정한다. 각 분기 묶음·폐회로의 실제 실선 외곽 폭/높이, 내부 분기 위치, 별도 연결선과 중간 연결 구간, 빈 간격과 꺾임을 원본과 후보에서 직접 짝지어 대조한다. 전체 이미지 픽셀 크기나 제거된 문자·점선 주석을 크기 기준으로 쓰지 않는다. 같은 폭 또는 같은 외곽 범위로 정규화했을 때 국소 종횡비와 접점 배치가 유지되는지 확인한다. 명시 요청 없이 별도 연결선이 외곽선에 합쳐지거나 국소 비율·배선이 바뀌면 composition-state/request-scope 실패이며, 전기적 연결 오류와 구분해 설명한다. 패널 순서나 전기적 등가만으로 이 항목을 pass하지 않는다. detail에는 직접 비교한 경로·외곽 기준과 관찰 근거를 쓰고, 픽셀 수치를 측정하지 못했으면 정밀 수치를 발명하지 않는다. 기준 경계를 판독할 수 없으면 uncertain이다. 자동 관찰 명세가 경로를 단순화했더라도 원본 이미지가 우선한다.
- black-fill-meaning: 원본의 검은 물질·재료는 후보에서 흰 면+검정 윤곽으로 표현되었는가. 검은 채움이 실제 물질 의미인지 단순 윤곽/인쇄색인지 구분했는가. 과학적 구분에 필요한 제한적 중성 회색만 허용되었는가.
- 계측 표식 대조(presentation/request-scope): 실제 자·계기·눈금실린더·좌표축의 눈금선은 숫자·단위·문자와 구별한다. 명시적인 눈금 삭제 요청이 없으면 보존 대상이며, 보조선·지시선 제거 선택이나 반복 표식이라는 이유로 삭제를 요구하지 않는다. 원본에 실제 눈금이 보이는데 후보가 빈 막대·빈 계기로 바뀌면 이 기능 표식의 누락을 실패로 기록한다. 반대로 실제 눈금이 남아 있음을 문자 잔존 실패로 오판하지 않는다. 자동 관찰이 annotation으로 분류했어도 원본에서 기능과 위치를 다시 확인한다. 확인할 수 없는 개별 눈금 수를 발명하지 않는다.
- presentation: 문자·라벨·로고·워터마크가 없고, 배경은 불투명 순백색이며, 불필요한 해칭·그림자·질감·착색이 없는가.
- 원본의 색 자체는 충실도 기준이 아니다. 색을 보존하라는 이유로 실패 처리하지 않는다. 흰 배경 도식화에서 과학적 의미가 없는 것으로 확인된 배경장식의 제거는 객체 누락으로 오판하지 않는다. 실제 좌표틀·자료 구획·강조면·층은 배경장식과 다르며 보존해야 한다. 자동 decorative 분류도 정답이 아니므로 원본 근거 없이 삭제를 허용하지 않는다.
- 불확실하거나 가려져 확인할 수 없는 하드 게이트는 pass로 추정하지 말고 uncertain으로 판정한다.
- 모든 check에는 원본과 후보를 직접 관찰한 구체적 근거를 detail에 쓴다. 빈 detail이나 단순 결론 반복은 관찰 근거가 아니다.

도구 금지: 이 검수 턴에는 imagegen 또는 다른 이미지 생성·편집 도구를 호출하지 않는다. 웹 검색, 파일 읽기, 코드 실행 등 다른 도구도 호출하지 않는다. 첨부 이미지를 보고 JSON 보고서만 작성한다.

출력: 코드 펜스나 설명 없이 아래 모양의 엄격한 JSON 객체 하나만 출력한다.
{"verdict":"pass|fail|uncertain","checks":[{"id":"object-counts","label":"객체·부품 수","status":"pass|fail|uncertain","detail":"관찰 근거"},{"id":"inside-outside","label":"안/밖 및 포함 관계","status":"pass|fail|uncertain","detail":"관찰 근거"},{"id":"liquid-occupancy","label":"액체 점유와 경계","status":"pass|fail|uncertain","detail":"관찰 근거"},{"id":"connections","label":"연결·접촉·분기","status":"pass|fail|uncertain","detail":"관찰 근거"},{"id":"composition-state","label":"방향·상대 배치·패널 상태","status":"pass|fail|uncertain","detail":"관찰 근거"},{"id":"black-fill-meaning","label":"검은 채움의 의미 구분","status":"pass|fail|uncertain","detail":"관찰 근거"},{"id":"presentation","label":"문자·질감·배경 표현","status":"pass|fail|uncertain","detail":"관찰 근거"},{"id":"request-scope","label":"요청 반영·요청 외 보존","status":"pass|fail|uncertain","detail":"각 요청과 요청 밖 부분을 대조한 관찰 근거"}],"issues":[{"message":"문제 설명","bbox":{"x":0.0,"y":0.0,"width":1.0,"height":1.0},"severity":"critical|major|minor"}]}
${dimensions ? `후보 첨부 PNG 헤더의 해상도는 ${dimensions.width}×${dimensions.height}px이다. x/width는 ${dimensions.width}, y/height는 ${dimensions.height}를 각각 분모로 사용한다.` : "후보 해상도 헤더를 확인하지 못했다. 해상도나 좌표 수치를 추측하지 않는다."}
bbox는 후보 전체 이미지의 왼쪽 위가 (0,0), 오른쪽 아래가 (1,1)인 좌표다. x와 width는 후보 전체 너비로, y와 height는 후보 전체 높이로 각각 나눈다. 세로 좌표를 너비로 나누거나 정사각형 패딩·화면 미리보기·부분 crop의 좌표를 쓰지 않는다. 위에서 형상 비교를 위해 폭을 맞춘 것과 bbox 좌표계는 별개다. 좌표 값은 JSON 숫자로만 작성한다. 위치를 확신할 때만 bbox를 넣고, 불명확하면 bbox를 생략하고 문제 설명만 남긴다. 문제가 없으면 issues는 빈 배열이다. 모든 필수 하드 게이트가 pass이고 중대한 문제가 없을 때만 verdict를 pass로 한다.`;
}

function normalizeBbox(value) {
  let bbox = value;
  if (Array.isArray(value) && value.length === 4) {
    bbox = { x: value[0], y: value[1], width: value[2], height: value[3] };
  }
  if (!bbox || typeof bbox !== "object") return undefined;
  const normalized = {};
  for (const key of ["x", "y", "width", "height"]) {
    const number = Object.hasOwn(bbox, key) ? bbox[key] : (key === "width" ? bbox.w : key === "height" ? bbox.h : undefined);
    if (typeof number !== "number" || !Number.isFinite(number) || number < 0 || number > 1) return undefined;
    normalized[key] = number;
  }
  if (normalized.width <= 0 || normalized.height <= 0) return undefined;
  if (normalized.x >= 1 || normalized.y >= 1) return undefined;
  if (normalized.x + normalized.width > 1 || normalized.y + normalized.height > 1) return undefined;
  return normalized;
}

export function parseImageReviewReport(raw) {
  let value;
  try {
    value = JSON.parse(text(raw));
  } catch {
    return { ok: false, error: "검수 응답이 엄격한 JSON 객체가 아닙니다." };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "검수 응답 최상위 값이 객체가 아닙니다." };
  }
  const verdict = text(value.verdict).toLowerCase();
  if (!new Set(["pass", "fail", "uncertain"]).has(verdict) || !Array.isArray(value.checks) || !Array.isArray(value.issues)) {
    return { ok: false, error: "검수 verdict, checks 또는 issues 형식이 잘못되었습니다." };
  }
  const checks = value.checks.map((check) => ({
    id: text(check?.id), label: text(check?.label), status: text(check?.status).toLowerCase(), detail: text(check?.detail),
  }));
  if (checks.some((check) => !check.id || !check.label || !check.detail || !new Set(["pass", "fail", "uncertain"]).has(check.status))) {
    return { ok: false, error: "검수 checks 항목 형식 또는 관찰 근거가 잘못되었습니다." };
  }
  const ids = checks.map((check) => check.id);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "검수 check id가 중복되었습니다." };
  }
  const byId = new Map(checks.map((check) => [check.id, check]));
  if (REQUIRED_CHECKS.some(([id]) => !byId.has(id))) {
    return { ok: false, error: "필수 구조 하드 게이트가 누락되었습니다." };
  }
  const issues = [];
  for (const issue of value.issues) {
    const message = text(issue?.message);
    if (!message) return { ok: false, error: "검수 issue에 message가 없습니다." };
    const normalized = { message };
    const bbox = normalizeBbox(issue?.bbox);
    if (issue?.bbox != null && !bbox) return { ok: false, error: "검수 issue bbox가 유효한 0~1 양수 영역이 아닙니다." };
    if (bbox) normalized.bbox = bbox;
    const severity = text(issue?.severity).toLowerCase();
    if (severity && new Set(["critical", "major", "minor"]).has(severity)) normalized.severity = severity;
    issues.push(normalized);
  }
  const hardGateUnclear = REQUIRED_CHECKS.some(([id]) => byId.get(id)?.status !== "pass");
  const anyCheckUnclear = checks.some((check) => check.status !== "pass");
  const hasAnyIssue = issues.length > 0;
  const safeVerdict = verdict === "pass" && (hardGateUnclear || anyCheckUnclear || hasAnyIssue) ? "uncertain" : verdict;
  return { ok: true, report: { verdict: safeVerdict, checks, issues } };
}

export function buildImageCorrectionRequest({ request = "", report } = {}) {
  const issues = (report?.issues || []).map((issue, index) => {
    const box = issue.bbox ? ` [bbox x=${issue.bbox.x}, y=${issue.bbox.y}, width=${issue.bbox.width}, height=${issue.bbox.height}]` : "";
    return `${index + 1}. ${issue.message}${box}`;
  });
  const failedChecks = (report?.checks || [])
    .filter((check) => check.status !== "pass")
    .map((check) => `- ${check.label}: ${check.detail || check.status}`);
  return `${text(request)}

독립 검수에서 명시적으로 실패한 부분만 한 번 교정한다. 원본 참고와 현재 후보를 다시 대조하고, 맞는 영역은 그대로 보존한다.
검수 bbox는 AI의 위치 가설이며 검증된 마스크가 아니다. 후보 전체 너비/높이에 각각 정규화된 좌표로 읽되, 문제 설명과 실제 대상의 위치가 맞는지 먼저 확인한다. 맞지 않거나 불명확한 bbox를 임의 재척도하거나 그 영역을 삭제·재설계하는 허가로 사용하지 않는다.
${failedChecks.join("\n")}
${issues.length ? `구체적 문제:\n${issues.join("\n")}` : ""}`.trim();
}

const emptyReport = () => ({ verdict: "uncertain", checks: [], issues: [] });

export function createAiImageReviewController({ transport, onState = () => {}, now = () => Date.now() } = {}) {
  if (!transport || typeof transport.send !== "function") throw new TypeError("review transport.send is required");
  let activeRun = null;
  let serial = 0;
  let turnSerial = 0;
  const retiredTurnIds = new Set();
  const retiredThreadIds = new Set();

  const isCurrent = (owner, turn = null) => Boolean(
    owner && activeRun === owner && !owner.done && !owner.cancelled && (!turn || owner.turn === turn),
  );

  const emit = (owner, state, extra = {}) => {
    if (!owner || activeRun !== owner) return;
    const detail = {
      state,
      candidateId: owner.candidate?.id || null,
      report: clone(extra.report || owner.report || emptyReport()),
      generationCount: owner.generationCount,
      reviewCount: owner.reviewCount,
      model: AI_IMAGE_REVIEW_MODEL,
      effort: AI_IMAGE_REVIEW_EFFORT,
      elapsedMs: Math.max(0, now() - owner.startedAt),
    };
    owner.state = state;
    owner.report = detail.report;
    onState(detail, owner.candidate);
  };

  const rememberTurn = (turn) => {
    if (turn?.turnId) retiredTurnIds.add(turn.turnId);
    if (turn?.threadId) retiredThreadIds.add(turn.threadId);
  };

  const finish = (owner, state, report) => {
    if (!isCurrent(owner)) return false;
    rememberTurn(owner.turn);
    if (owner.turn) owner.turn.closed = true;
    owner.done = true;
    emit(owner, state, { report });
    return true;
  };

  const failureReport = (message, report = null) => ({
    verdict: "uncertain",
    checks: report?.checks || [],
    issues: [...(report?.issues || []), { message: text(message) || "독립 검수 작업 실패", severity: "major" }],
  });

  function route(owner, turn, event) {
    if (!isCurrent(owner, turn) || turn.closed) return;
    // Desktop stops trailing narration after a completed image. This scoped
    // marker is not a user cancellation and must survive the terminal interrupt.
    if (event.kind === "finalization" && turn.kind === "correction") {
      if (event.state === "interrupting") turn.autoImageFinalization = true;
      if (event.state === "recovering" && turn.autoImageFinalization) turn.recoveringImage = true;
    }
    if (event.kind === "assistant" && turn.kind === "review") {
      turn.assistantText = text(event.text);
      return;
    }
    if (event.kind === "error") {
      turn.errorText = text(event.text) || "작업 오류";
      return;
    }
    if (event.kind === "image") {
      if (turn.kind === "review") {
        turn.errorText = "검수 전용 턴에서 예기치 않은 이미지 생성 이벤트가 발생했습니다.";
        turn.closed = true;
        finish(owner, "failed", failureReport(turn.errorText, owner.report));
        return;
      }
      if (turn.kind === "correction" && event.src && !turn.pendingCandidatePromise) {
        const capturedRun = owner;
        const capturedTurn = turn;
        turn.pendingCandidatePromise = Promise.resolve()
          .then(() => capturedRun.acceptCorrectionImage(event.src, capturedRun.generationCount, { rendererPrompt: event.rendererPrompt }))
          .then((candidate) => {
            if (!isCurrent(capturedRun, capturedTurn) || capturedTurn.closed || !candidate?.id) return null;
            if (!candidateUnchanged(capturedRun)) return null;
            capturedTurn.pendingCandidate = candidate;
            capturedRun.candidate = candidate;
            capturedRun.candidateBinding = candidateBinding(candidate);
            capturedRun.report = emptyReport();
            emit(capturedRun, "correcting");
            return candidate;
          })
          .catch((error) => {
            if (isCurrent(capturedRun, capturedTurn) && !capturedTurn.closed) {
              capturedTurn.errorText = error?.message || String(error);
            }
            return null;
          });
      }
      return;
    }

    let terminal = null;
    if (event.kind === "done") {
      terminal = event;
    } else if (event.kind === "finalization" && ["confirmed", "recovered"].includes(event.state)) {
      terminal = { ...event, kind: "done", status: event.status || "completed" };
    } else if (event.kind === "finalization" && event.state === "recoveryFailed") {
      turn.errorText = text(event.message) || "작업 종료 확인 실패";
      terminal = { ...event, kind: "done", status: "failed" };
    }
    if (!terminal || turn.terminalStarted) return;
    turn.terminalStarted = true;
    if (turn.kind === "review") void completeReview(owner, turn, terminal);
    else if (turn.kind === "correction") void completeCorrection(owner, turn, terminal);
  }

  async function sendBoundTurn(owner, kind, payload) {
    if (!isCurrent(owner)) return false;
    rememberTurn(owner.turn);
    const turn = {
      token: ++turnSerial,
      kind,
      turnId: null,
      threadId: null,
      awaiting: true,
      queued: [],
      assistantText: "",
      errorText: "",
      pendingCandidate: null,
      pendingCandidatePromise: null,
      terminalStarted: false,
      closed: false,
    };
    owner.turn = turn;
    try {
      const result = await transport.send(payload);
      if (!isCurrent(owner, turn) || turn.closed) return false;
      turn.turnId = result?.turnId || null;
      turn.threadId = result?.renderThreadId || result?.threadId || null;
      turn.awaiting = false;
      const queued = turn.queued;
      turn.queued = [];
      for (const event of queued) {
        if (!isCurrent(owner, turn) || turn.closed) break;
        const sameTurn = !event.turnId || !turn.turnId || event.turnId === turn.turnId;
        const sameThread = !event.threadId || !turn.threadId || event.threadId === turn.threadId;
        if (sameTurn && sameThread) route(owner, turn, event);
      }
      return isCurrent(owner, turn) && !turn.closed;
    } catch (error) {
      if (isCurrent(owner, turn) && !turn.closed) {
        finish(owner, "failed", failureReport(error?.message || String(error), owner.report));
      }
      return false;
    }
  }

  const candidateBinding = item => ({id:item?.id, name:item?.name, data:item?.data});
  const candidateUnchanged = owner => {
    if (Object.keys(owner.candidateBinding).every(key => owner.candidate?.[key] === owner.candidateBinding[key])) return true;
    finish(owner, "failed", failureReport("검수 도중 후보가 변경되어 결과를 적용하지 않았습니다.", owner.report));
    return false;
  };

  async function sendReview(owner) {
    if (!isCurrent(owner) || !candidateUnchanged(owner)) return false;
    owner.reviewCount += 1;
    emit(owner, "reviewing");
    const capturedCandidate = owner.candidate;
    let candidateAttachment;
    let referencePlan = null;
    try {
      candidateAttachment = await owner.prepareCandidateAttachment(capturedCandidate);
      if (owner.styleAttachments.length) referencePlan = planImageReferences({
        inputs: owner.originalAttachments, styleReferences: owner.styleAttachments, candidate: candidateAttachment,
      });
    } catch (error) {
      if (isCurrent(owner)) finish(owner, "failed", failureReport(error?.message || String(error), owner.report));
      return false;
    }
    if (!isCurrent(owner) || owner.candidate !== capturedCandidate || !candidateUnchanged(owner)) return false;
    // Desktop currently normalizes purpose:"chat" + ephemeralRender:true to
    // actual purpose "image". conversationId:null + resetConversation:true still
    // creates a fresh thread. The prompt forbids imagegen, and any image event
    // received on this review turn fails closed above.
    return sendBoundTurn(owner, "review", {
      text: buildImageReviewPrompt({
        request: owner.request,
        structuralInventory: owner.structuralInventory,
        referenceNames: owner.referenceNames,
        candidateName: owner.candidate?.name,
        candidateAttachmentData: candidateAttachment?.data,
        markPolicyContract: owner.markPolicyContract,
        referenceRoleContract: referencePlan?.roleContract || "",
      }),
      attachments: referencePlan?.attachments || [...owner.originalAttachments, candidateAttachment],
      conversationId: null,
      resetConversation: true,
      purpose: "chat",
      ephemeralRender: true,
      model: AI_IMAGE_REVIEW_MODEL,
      effort: AI_IMAGE_REVIEW_EFFORT,
      serviceTier: owner.serviceTier || null,
    });
  }

  async function sendCorrection(owner, report) {
    if (!isCurrent(owner) || !candidateUnchanged(owner)) return false;
    if (owner.generationCount >= AI_IMAGE_MAX_GENERATIONS) {
      finish(owner, "needs-attention", report);
      return false;
    }
    owner.generationCount += 1;
    emit(owner, "correcting", { report });
    const capturedCandidate = owner.candidate;
    let payload;
    try {
      const referencePlan = owner.styleAttachments.length ? planImageReferences({
        inputs: owner.originalAttachments, styleReferences: owner.styleAttachments,
        candidate: await owner.prepareCandidateAttachment(capturedCandidate),
      }) : null;
      if (!isCurrent(owner) || owner.candidate !== capturedCandidate || !candidateUnchanged(owner)) return false;
      payload = await owner.makeCorrectionPayload({
        report: clone(report), candidate: capturedCandidate, generationCount: owner.generationCount,
        referenceRoleContract: referencePlan?.roleContract || "",
      });
      if (referencePlan) {
        if (!text(payload?.text)) throw new TypeError("Correction prompt is required");
        // The controller owns ordered images; callback cannot drop/reorder styles
        // or accidentally retain a previous candidate. Roles travel with them.
        payload = { ...payload, attachments: referencePlan.attachments,
          text: `${[referencePlan.roleContract, owner.markPolicyContract].filter(Boolean).join("\n\n")}\n\n${payload.text}` };
      }
    } catch (error) {
      if (isCurrent(owner) && owner.candidate === capturedCandidate) {
        finish(owner, "failed", failureReport(error?.message || String(error), report));
      }
      return false;
    }
    if (!isCurrent(owner) || owner.candidate !== capturedCandidate || !candidateUnchanged(owner)) return false;
    return sendBoundTurn(owner, "correction", payload);
  }

  async function completeReview(owner, turn, event) {
    if (!isCurrent(owner, turn) || turn.closed) return;
    const status = text(event.status).toLowerCase();
    if (["cancelled", "canceled", "interrupted"].includes(status)) {
      turn.closed = true;
      finish(owner, "cancelled", owner.report || emptyReport());
      return;
    }
    if (["failed", "error"].includes(status) || turn.errorText) {
      turn.closed = true;
      finish(owner, "failed", failureReport(turn.errorText || event.error || "검수 작업 실패", owner.report));
      return;
    }
    if (!candidateUnchanged(owner)) return;
    const parsed = parseImageReviewReport(turn.assistantText);
    if (!parsed.ok) {
      turn.closed = true;
      finish(owner, "failed", failureReport(parsed.error, owner.report));
      return;
    }
    owner.report = parsed.report;
    turn.closed = true;
    rememberTurn(turn);
    if (parsed.report.verdict === "pass") {
      finish(owner, "passed", parsed.report);
    } else if (parsed.report.verdict === "fail" && owner.generationCount < AI_IMAGE_MAX_GENERATIONS) {
      await sendCorrection(owner, parsed.report);
    } else {
      finish(owner, "needs-attention", parsed.report);
    }
  }

  async function completeCorrection(owner, turn, event) {
    if (!isCurrent(owner, turn) || turn.closed) return;
    const pending = turn.pendingCandidatePromise;
    if (pending) await pending;
    if (!isCurrent(owner, turn) || turn.closed) return;
    const status = text(event.status).toLowerCase();
    const completedImageStop = status === "interrupted" && turn.autoImageFinalization && turn.pendingCandidate && !turn.errorText;
    if (["cancelled", "canceled", "interrupted"].includes(status) && !completedImageStop) {
      turn.closed = true;
      finish(owner, "cancelled", owner.report || emptyReport());
      return;
    }
    if (["failed", "error"].includes(status) || turn.errorText || !turn.pendingCandidate) {
      turn.closed = true;
      finish(owner, "failed", failureReport(turn.errorText || event.error || "교정 이미지 결과가 없습니다.", owner.report));
      return;
    }
    if (!candidateUnchanged(owner)) return;
    const correctedCandidate = turn.pendingCandidate;
    turn.closed = true;
    rememberTurn(turn);
    owner.candidate = correctedCandidate;
    owner.candidateBinding = candidateBinding(correctedCandidate);
    await sendReview(owner);
  }

  const handleEvent = (event) => {
    const turnId = event?.turnId || null;
    const threadId = event?.threadId || null;
    if (turnId && retiredTurnIds.has(turnId)) return true;
    if (threadId && retiredThreadIds.has(threadId)) return true;
    const owner = activeRun;
    const turn = owner?.turn;
    if (!isCurrent(owner, turn) || turn.closed || (!turnId && !threadId)) return false;
    if (turn.awaiting && !turn.turnId) {
      turn.queued.push(event);
      return true;
    }
    if (turnId && turn.turnId && turnId !== turn.turnId) return false;
    if (threadId && turn.threadId && threadId !== turn.threadId) return false;
    if ((turnId && turn.turnId === turnId) || (threadId && turn.threadId === threadId)) {
      route(owner, turn, event);
      return true;
    }
    return false;
  };

  const start = async (options = {}) => {
    if (!options.candidate?.id) throw new TypeError("review candidate is required");
    if (typeof options.prepareCandidateAttachment !== "function") throw new TypeError("prepareCandidateAttachment is required");
    if (typeof options.makeCorrectionPayload !== "function") throw new TypeError("makeCorrectionPayload is required");
    if (typeof options.acceptCorrectionImage !== "function") throw new TypeError("acceptCorrectionImage is required");
    // Validate before replacing an active run. Snapshot bytes/names, not caller objects.
    const requestedStyles = options.styleAttachments ?? [];
    if (!Array.isArray(requestedStyles)) throw new TypeError("styleAttachments must be an array");
    const initialPlan = requestedStyles.length ? planImageReferences({
      inputs: options.originalAttachments || [], styleReferences: requestedStyles,
    }) : null;
    if (activeRun && !activeRun.done && !activeRun.cancelled) {
      const prior = activeRun;
      prior.cancelled = true;
      rememberTurn(prior.turn);
      emit(prior, "cancelled");
      prior.done = true;
    }
    const owner = {
      id: ++serial,
      candidate: options.candidate,
      candidateBinding: candidateBinding(options.candidate),
      request: text(options.request),
      structuralInventory: text(options.structuralInventory),
      markPolicyContract: text(options.markPolicyContract),
      referenceNames: initialPlan ? [...initialPlan.sourceNames] : [...(options.referenceNames || [])],
      originalAttachments: initialPlan ? initialPlan.analysisAttachments : [...(options.originalAttachments || [])],
      styleAttachments: initialPlan ? initialPlan.attachments.slice(initialPlan.analysisAttachments.length).map(item => ({...item})) : [],
      prepareCandidateAttachment: options.prepareCandidateAttachment,
      makeCorrectionPayload: options.makeCorrectionPayload,
      acceptCorrectionImage: options.acceptCorrectionImage,
      serviceTier: options.serviceTier || null,
      generationCount: Math.max(1, Number(options.generationCount || 1)),
      reviewCount: 0,
      startedAt: Number.isFinite(options.startedAt) && options.startedAt >= 0 ? Math.min(options.startedAt, now()) : now(),
      report: emptyReport(),
      state: "idle",
      done: false,
      cancelled: false,
      turn: null,
    };
    activeRun = owner;
    if (options.modelAvailable !== true) {
      finish(owner, "failed", failureReport(`${AI_IMAGE_REVIEW_MODEL} high 검수 모델을 사용할 수 없습니다. 다른 모델로 자동 대체하지 않았습니다.`));
      return false;
    }
    return sendReview(owner);
  };

  const cancel = () => {
    const owner = activeRun;
    if (!owner || owner.done || owner.cancelled) return false;
    owner.cancelled = true;
    rememberTurn(owner.turn);
    if (owner.turn) owner.turn.closed = true;
    emit(owner, "cancelled");
    owner.done = true;
    return true;
  };

  return {
    start,
    cancel,
    handleEvent,
    isRecoveringImageTurn: () => Boolean(isCurrent(activeRun, activeRun?.turn) && activeRun.turn.kind === "correction" && activeRun.turn.autoImageFinalization && activeRun.turn.recoveringImage && activeRun.turn.pendingCandidatePromise && !activeRun.turn.closed),
    isActive: () => Boolean(activeRun && !activeRun.done && !activeRun.cancelled),
    getState: () => activeRun ? {
      state: activeRun.state,
      candidateId: activeRun.candidate?.id || null,
      generationCount: activeRun.generationCount,
      reviewCount: activeRun.reviewCount,
      report: clone(activeRun.report),
    } : null,
  };
}
