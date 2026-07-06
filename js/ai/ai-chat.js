/* ===== AI CHAT (도움말 챗봇 패널) ===== */
//
// 고급 기능 → "AI 도우미" 버튼으로 여닫는 우하단 비모달 패널.
// docs/ai-reference.md(기능 레퍼런스)를 시스템 프롬프트로 주입해, 레퍼런스에
// 근거한 사용법 답변만 하도록 제한한다. 질문 내용은 외부 무료 AI 서비스
// (Pollinations.AI)로 전송되므로 패널 하단에 상시 고지한다.
// 캔버스 상태(store/state)는 일절 건드리지 않는 독립 UI 모듈이다.

import { chatCompletion, cooldownRemainingMs, getAiToken, setAiToken } from "./ai-client.js?v=0.51.0";

const REFERENCE_URL = "docs/ai-reference.md";
const MAX_HISTORY = 6; // 시스템 프롬프트 제외 최근 6개(3문답)만 전송 — 토큰 상한 관리

// 레퍼런스 fetch 실패 시(오프라인 캐시 등) 최소한의 근거로 쓰는 축약본
const FALLBACK_REFERENCE = [
  "5E는 과학 교사용 시험지 그림 드로잉 웹앱이다.",
  "도구: 선택(V) 사각형(S) 타원(O) 직선(L) 꺾은선(P) 곡선(C) 텍스트(T) 자유그리기(F).",
  "Ctrl+Z 되돌리기, Ctrl+F 검색, 파일 메뉴에서 저장/불러오기/이미지 내보내기.",
  "고급 기능 '이미지 객체화'로 PNG 선화를 편집 가능한 선 객체로 변환할 수 있다.",
].join("\n");

let referenceText = null;   // 로드된 레퍼런스 캐시
let history = [];           // {role, content} — 시스템 프롬프트 제외
let pending = false;
let cooldownTimer = null;

/* ===== SYSTEM PROMPT ===== */
function buildSystemPrompt() {
  return [
    "당신은 5E라는 과학 시험문제 그림 편집 프로그램의 도움말 챗봇입니다.",
    "아래 [레퍼런스]에 있는 내용만 근거로 한국어로 간결하게 답하세요.",
    "레퍼런스에 없는 내용을 물으면 '그 내용은 아직 도움말에 없습니다'라고 답하세요.",
    "프로그램 사용법과 무관한 질문에는 정중히 사용법 질문을 요청하세요.",
    "",
    "[레퍼런스]",
    referenceText || FALLBACK_REFERENCE,
  ].join("\n");
}

async function ensureReference() {
  if (referenceText !== null) return;
  try {
    const res = await fetch(REFERENCE_URL, { cache: "no-cache" });
    referenceText = res.ok ? await res.text() : "";
  } catch {
    referenceText = "";
  }
  if (!referenceText) referenceText = FALLBACK_REFERENCE;
}

/* ===== PANEL DOM ===== */
// index.html을 최소로 건드리기 위해 패널은 여기서 생성해 body에 붙인다.
function buildPanel() {
  const panel = document.createElement("section");
  panel.id = "ai-chat-panel";
  panel.className = "ai-chat-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "AI 도우미");
  panel.innerHTML = `
    <header class="ai-chat-header">
      <span class="ai-chat-title">AI 도우미 <span class="ai-chat-beta">베타</span></span>
      <button type="button" class="ai-chat-close" title="닫기" aria-label="닫기">&times;</button>
    </header>
    <div class="ai-chat-messages" role="log" aria-live="polite"></div>
    <form class="ai-chat-form">
      <textarea class="ai-chat-input" rows="2" placeholder="5E 사용법을 질문하세요"></textarea>
      <button type="submit" class="ai-chat-send">보내기</button>
    </form>
    <footer class="ai-chat-note">질문은 외부 무료 AI(Pollinations.AI)로 전송됩니다.
      학생 개인정보·출제 전 문항은 입력하지 마세요.
      <button type="button" class="ai-chat-token-btn">토큰 설정</button></footer>`;
  document.body.appendChild(panel);
  return panel;
}

function appendMessage(listEl, role, text) {
  const div = document.createElement("div");
  div.className = `ai-chat-msg ai-chat-msg-${role}`;
  div.textContent = text; // textContent 고정 — 응답 HTML 해석 금지
  listEl.appendChild(div);
  listEl.scrollTop = listEl.scrollHeight;
  return div;
}

/* ===== COOLDOWN UI ===== */
// 무료 티어 요청 간격(약 15초) 동안 전송 버튼을 잠그고 남은 초를 표시한다.
function startCooldownDisplay(sendBtn) {
  if (cooldownTimer) clearInterval(cooldownTimer);
  const tick = () => {
    const remain = cooldownRemainingMs();
    if (remain > 0 || pending) {
      sendBtn.disabled = true;
      sendBtn.textContent = pending ? "응답 중…" : `대기 ${Math.ceil(remain / 1000)}초`;
    } else {
      sendBtn.disabled = false;
      sendBtn.textContent = "보내기";
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  };
  tick();
  cooldownTimer = setInterval(tick, 500);
}

/* ===== INIT ===== */
export function initAiChat() {
  const openBtn = document.getElementById("ai-chat-open");
  if (!openBtn) return;

  const panel = buildPanel();
  const listEl = panel.querySelector(".ai-chat-messages");
  const form = panel.querySelector(".ai-chat-form");
  const input = panel.querySelector(".ai-chat-input");
  const sendBtn = panel.querySelector(".ai-chat-send");

  appendMessage(listEl, "assistant",
    "5E 사용법을 물어보세요.\n예: 그림 파일을 편집 가능한 선으로 바꾸려면?");

  openBtn.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      ensureReference(); // 첫 오픈 시 미리 로드 (실패해도 전송 시 재확인)
      input.focus();
    }
  });
  panel.querySelector(".ai-chat-close").addEventListener("click", () => {
    panel.hidden = true;
  });

  // 토큰 설정: enter.pollinations.ai 무료 가입 후 발급받은 토큰을 localStorage에만
  // 저장한다 (코드/저장소에 넣지 않음). 빈 값 입력 시 삭제.
  const tokenBtn = panel.querySelector(".ai-chat-token-btn");
  const refreshTokenLabel = () => {
    tokenBtn.textContent = getAiToken() ? "토큰 설정됨 (변경)" : "토큰 설정";
  };
  refreshTokenLabel();
  tokenBtn.addEventListener("click", () => {
    const cur = getAiToken();
    const next = window.prompt(
      "Pollinations 토큰을 입력하세요.\n(enter.pollinations.ai 무료 가입 → 토큰 발급)\n빈 칸으로 확인하면 저장된 토큰을 삭제합니다.",
      cur
    );
    if (next === null) return; // 취소
    setAiToken(next.trim());
    refreshTokenLabel();
  });

  // Enter 전송, Shift+Enter 줄바꿈 (textarea라 전역 도구 단축키와 충돌 없음)
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const question = input.value.trim();
    if (!question || pending || cooldownRemainingMs() > 0) return;

    input.value = "";
    appendMessage(listEl, "user", question);
    history.push({ role: "user", content: question });

    pending = true;
    startCooldownDisplay(sendBtn);
    const waitEl = appendMessage(listEl, "assistant", "답변을 생각하는 중…");
    try {
      await ensureReference();
      const messages = [
        { role: "system", content: buildSystemPrompt() },
        ...history.slice(-MAX_HISTORY),
      ];
      const answer = await chatCompletion(messages);
      waitEl.textContent = answer;
      history.push({ role: "assistant", content: answer });
    } catch (err) {
      waitEl.textContent = (err && err.message) || "오류가 발생했습니다.";
      waitEl.classList.add("ai-chat-msg-error");
      history.pop(); // 실패한 질문은 문맥에서 제거 — 재전송 시 중복 방지
    } finally {
      pending = false;
      startCooldownDisplay(sendBtn);
      listEl.scrollTop = listEl.scrollHeight;
    }
  });
}
