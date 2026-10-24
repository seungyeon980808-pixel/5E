/* ===== 오브젝트 창(10-24 시안 20 확정 — 5e-design-mockups/mockups-1024/impl-spec.md · v5.html · obj5.html) =====
 *
 * 캔버스 아래 「오브젝트」 탭으로 여는 창 하나에 왼쪽 칸의 「오브젝트 · 내 오브젝트 · 에셋 라이브러리」를 모은다.
 * 위 탭 셋: 도구(선을 고쳐 쓰는 그림 조각 = 과목 오브젝트) · 그림(삽화 = 에셋 라이브러리) · 내 오브젝트.
 * · 데이터와 넣기 동작은 원래 모듈 것을 그대로 쓴다(subject-objects · asset-library · personal-objects).
 * · 별표: 도구는 왼쪽 칸 「즐겨찾기」와 같은 저장 칸, 그림은 이 브라우저(previewStorage), 내 오브젝트는 그 항목에 저장.
 * · 그림 탭 기본 보기는 「훑어보기」(끝없이 이어지는 격자를 끌어서 둘러보기 · 휠로 확대 · 방향키). 렌즈 효과는 기본 끔,
 *   켜도 그림은 휘지 않고 칸 크기만 바뀐다. 「움직임 줄이기」면 꺼진다.
 * · 캔버스에서 무언가를 고른 채 열면 「내 오브젝트」 탭 맨 위에 저장 카드(이름 · 분류 · 태그 · 별표 → 저장). */
import { previewStorage as localStorage } from "./preview-storage.js?v=1.7.0-four-session-integration";
import { TEMPLATES, renderSymbolsForIds, sizeIconViewBoxes, activateTemplate } from "./templates.js?v=1.7.0-four-session-integration";
import { OBJECT_SUBJECTS, objectFavorites, toggleObjectFavorite } from "./subject-objects.js?v=1.7.0-four-session-integration";
import { assetLibraryItems, assetThumbUrl, insertAssetItem } from "./asset-library.js?v=1.7.0-four-session-integration";
import { personalItems, personalThumbnail, selectedPersonalObjects, savePersonalObject, setPersonalStar, insertPersonalItem, PERSONAL_DEFAULT_CATEGORY } from "./personal-objects.js?v=1.7.0-four-session-integration";
import { showAlert, showPrompt } from "./ui-dialogs.js?v=1.7.0-four-session-integration";

const E = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ICON = {
  obj: '<svg class="ow-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8.5" cy="9" r="4.5"/><path d="M14 4.5 19.5 14h-11z"/><rect x="11" y="13" width="8.5" height="7" rx="1"/></svg>',
  grid: '<svg class="ow-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>',
  gal: '<svg class="ow-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="7" height="12" rx="1"/><rect x="14" y="3" width="7" height="9" rx="1"/><rect x="14" y="15" width="7" height="6" rx="1"/></svg>',
  search: '<svg class="ow-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></svg>',
};
const ASSET_STAR_KEY = "5e.assetFavorites.v1";
const MY_CATS_KEY = "5e.personalCategories.v1";
const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch (_) { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} };
const SUBJECT_NAMES = { p: "물리", c: "화학", b: "생명", e: "지구" };
const hay = (...parts) => parts.flat().filter(Boolean).join(" ").toLowerCase();
const matches = (q, text) => q.trim().toLowerCase().split(/\s+/).filter(Boolean).every((t) => text.includes(t));

export function initObjectWindow(state) {
  const opener = document.getElementById("object-window-open");
  if (!opener) return;
  const st = { tab: "tool", q: "", starOnly: false, cat: { tool: "all", pic: "all", mine: "all" }, view: { tool: "grid", pic: "gal", mine: "grid" }, lens: false, detail: null, save: null, assets: null };
  let back = null, gal = null;

  function toolEntries() {
    const out = [];
    for (const [code, subject] of Object.entries(OBJECT_SUBJECTS)) for (const part of subject.parts) {
      const ids = [];
      for (const [id, def] of Object.entries(TEMPLATES)) {
        if (def.hidden || !part.cats?.includes(def.category)) continue;
        if (def.kind === "group") for (const v of def.variants || []) { if (TEMPLATES[v] && !ids.includes(v)) ids.push(v); }
        else if (!ids.includes(id)) ids.push(id);
      }
      if (ids.length) out.push({ code, part: part.name, ids });
    }
    return out;
  }
  const assetStars = () => new Set(readJson(ASSET_STAR_KEY, []));
  const myCats = () => {
    const used = personalItems().map((it) => it.category || PERSONAL_DEFAULT_CATEGORY);
    return [...new Set([...readJson(MY_CATS_KEY, []), ...used])];
  };

  /* ---------- 창 틀 ---------- */
  function open({ tab } = {}) {
    const sel = selectedPersonalObjects();
    st.save = sel.length ? { objects: sel, name: sel.length === 1 && sel[0].name ? String(sel[0].name) : "새 오브젝트", category: myCats()[0] || PERSONAL_DEFAULT_CATEGORY, tags: [], star: false } : null;
    st.tab = st.save ? "mine" : (tab || st.tab);
    st.detail = null;
    if (!back) {
      back = document.createElement("div");
      back.className = "ow-back";
      back.innerHTML = '<div class="ow" role="dialog" aria-modal="true" aria-label="오브젝트"></div>';
      document.body.append(back);
      back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
      back.addEventListener("click", onClick);
      back.addEventListener("input", onInput);
      back.addEventListener("change", onChange);
    }
    back.hidden = false;
    document.addEventListener("keydown", onKey, true);
    opener.setAttribute("aria-expanded", "true");
    render();
    if (st.tab === "pic" && !st.assets) loadAssets();
    requestAnimationFrame(() => back.querySelector(".ow-q")?.focus({ preventScroll: true }));
  }
  function close() {
    if (!back) return;
    gal?.stop(); gal = null;
    back.hidden = true;
    document.removeEventListener("keydown", onKey, true);
    opener.setAttribute("aria-expanded", "false");
  }
  async function loadAssets() {
    try { st.assets = await assetLibraryItems(); } catch (error) { st.assets = []; st.assetError = error.message; }
    if (back && !back.hidden) render();
  }

  function counts() {
    const tools = toolEntries().reduce((n, g) => n + g.ids.length, 0);
    return { tool: tools, pic: st.assets ? st.assets.length : "", mine: personalItems().length };
  }

  function render() {
    const dlg = back.firstElementChild, c = counts();
    const tab = (k, label) => `<button type="button" role="tab" data-ow-tab="${k}" aria-selected="${st.tab === k}">${label}<small>${c[k]}</small></button>`;
    // 「격자 / 훑어보기」는 세 탭 모두(10-24 결정 12). 그림만 훑어보기가 기본.
    const vw = st.view[st.tab], viewSwitch = `<div class="ow-seg" role="group" aria-label="보기"><button type="button" data-ow-view="grid" aria-pressed="${vw === "grid"}" title="격자">${ICON.grid}격자</button><button type="button" data-ow-view="gal" aria-pressed="${vw === "gal"}" title="훑어보기">${ICON.gal}훑어보기</button></div>`;
    gal?.stop(); gal = null;
    dlg.innerHTML = `<header class="ow-h">
        <span class="ow-title">${ICON.obj}<b>오브젝트</b></span>
        <div class="ow-tabs" role="tablist" aria-label="오브젝트 종류">${tab("tool", "도구")}${tab("pic", "그림")}${tab("mine", "내 오브젝트")}</div>
        <span class="ow-sp"></span>
        <label class="ow-qw">${ICON.search}<input class="ow-q" type="search" placeholder="이름 · 분류 · 태그" value="${E(st.q)}" aria-label="찾기"></label>
        <button type="button" class="ow-staronly" data-ow-staronly aria-pressed="${st.starOnly}">${st.starOnly ? "★" : "☆"} 별표만</button>
        ${viewSwitch}
        <button type="button" class="ow-x" data-ow-close aria-label="닫기" title="닫기 (Esc)">×</button>
      </header>
      <div class="ow-b"><nav class="ow-side" aria-label="분류">${side()}</nav><div class="ow-main">${main()}</div>${st.detail ? detail() : ""}</div>`;
    if (st.tab === "tool") fillToolIcons(dlg);
    if (st.tab === "mine") fillMineThumbs(dlg);
    const stage = dlg.querySelector(".ow-gal");
    if (stage && st.tab === "pic" && st.assets) gal = gallery(stage, picList(), picTile);
    if (stage && st.tab === "tool") gal = gallery(stage, toolList(), toolTile);
    if (stage && st.tab === "mine") gal = gallery(stage, mineList(), mineTile);
  }

  /* ---------- 왼쪽 칸 ---------- */
  function sideBtn(key, label, count) {
    return `<button type="button" data-ow-cat="${E(key)}" aria-pressed="${st.cat[st.tab] === key}"><span>${E(label)}</span><small>${count}</small></button>`;
  }
  function side() {
    if (st.tab === "tool") {
      const groups = toolEntries(), byCode = (code) => groups.filter((g) => g.code === code).reduce((n, g) => n + g.ids.length, 0);
      return `<p class="ow-sl">단원</p>${sideBtn("all", "전체", groups.reduce((n, g) => n + g.ids.length, 0))}${Object.entries(OBJECT_SUBJECTS).map(([code, s]) => sideBtn(code, s.label, byCode(code))).join("")}<p class="ow-note">도구는 선을 고쳐 쓰는 그림 조각입니다. 작은 칸으로 촘촘히, 단원별로 묶어 봅니다.</p>`;
    }
    if (st.tab === "pic") {
      const items = st.assets || [], by = (f) => items.filter(f).length;
      const rows = [["all", "전체", by(() => true)], ...Object.entries(SUBJECT_NAMES).map(([k, v]) => [k, v, by((it) => it.subject === k && it.category !== "인물")]), ["person", "사람", by((it) => it.category === "인물")]];
      return `<p class="ow-sl">과목</p>${rows.filter(([k, , n]) => k === "all" || n).map(([k, l, n]) => sideBtn(k, l, n)).join("")}<p class="ow-note">그림은 삽화라 크게 봐야 고를 수 있습니다. 기본 보기가 「훑어보기」 — 끌어서 둘러보고, 누르면 오른쪽에 크게.<br><br>렌즈 효과(가운데 크게)는 기본 끔.</p>`;
    }
    const items = personalItems(), stars = items.filter((it) => it.star).length;
    return `<p class="ow-sl">내 오브젝트</p>${sideBtn("all", "전체", items.length)}${sideBtn("recent", "최근 만든 것", Math.min(8, items.length))}${sideBtn("star", "★ 별표", stars)}
      <p class="ow-sl">내가 붙인 분류</p>${myCats().map((c) => sideBtn("cat:" + c, c, items.filter((it) => (it.category || PERSONAL_DEFAULT_CATEGORY) === c).length)).join("")}
      <button type="button" class="ow-newcat" data-ow-newcat>＋ 분류 만들기</button><p class="ow-note">캔버스에서 그림을 고른 채 「오브젝트」를 열면 맨 위에 저장 카드가 나옵니다.</p>`;
  }

  /* ---------- 가운데 ---------- */
  function main() {
    if (st.tab === "tool") return toolMain();
    if (st.tab === "pic") return picMain();
    return mineMain();
  }
  const star = (on, attr) => `<button type="button" class="ow-star${on ? " on" : ""}" ${attr} aria-pressed="${on}" aria-label="${on ? "별표 빼기" : "별표"}" title="${on ? "별표 빼기" : "별표"}">${on ? "★" : "☆"}</button>`;
  const empty = (text) => `<p class="ow-empty">${E(text)}</p>`;

  function toolMain() {
    const favs = new Set(objectFavorites()), cat = st.cat.tool;
    const groups = toolEntries().filter((g) => cat === "all" || g.code === cat).map((g) => ({ ...g, ids: g.ids.filter((id) => (!st.starOnly || favs.has(id)) && (!st.q || matches(st.q, hay(TEMPLATES[id].label, g.part, TEMPLATES[id].category, SUBJECT_NAMES[g.code])))) })).filter((g) => g.ids.length);
    if (!groups.length) return empty(st.starOnly ? "별표 친 도구가 없습니다. 카드에 마우스를 올려 ☆를 누르세요." : "찾는 도구가 없습니다.");
    if (st.view.tool === "gal") return galStage("도구 훑어보기");
    return groups.map((g) => `<section class="ow-grp"><h3>${E(g.part)}${cat === "all" ? ` <span class="ow-gs">${E(SUBJECT_NAMES[g.code])}</span>` : ""}<small>${g.ids.length}</small></h3>
      <div class="ow-grid tool">${g.ids.map((id) => `<div class="ow-card" data-ow-tool="${E(id)}" title="${E(TEMPLATES[id].label)} — 누르면 캔버스에 놓을 준비"><button type="button" class="ow-pick" data-ow-tool-pick="${E(id)}" aria-label="${E(TEMPLATES[id].label)}"><span class="ow-pic" data-ow-icon="${E(id)}"></span></button><span class="ow-name">${E(TEMPLATES[id].label)}</span>${star(favs.has(id), `data-ow-star-tool="${E(id)}"`)}</div>`).join("")}</div></section>`).join("");
  }
  // 훑어보기용 평평한 목록(도구): 지금 거르기(단원 · 별표만 · 찾기)를 그대로 따른다.
  function toolList() {
    const favs = new Set(objectFavorites()), cat = st.cat.tool, out = [];
    for (const g of toolEntries()) if (cat === "all" || g.code === cat) for (const id of g.ids)
      if ((!st.starOnly || favs.has(id)) && (!st.q || matches(st.q, hay(TEMPLATES[id].label, g.part, TEMPLATES[id].category, SUBJECT_NAMES[g.code])))) out.push({ id, name: TEMPLATES[id].label, sub: g.part });
    return out;
  }
  const galStage = (label) => `<div class="ow-gal" tabindex="0" aria-label="${label} — 끌어서 둘러보기, 휠로 확대, 방향키"><div class="ow-board"></div>
      <div class="ow-pill"><span>끌어서 둘러보기 · 휠로 확대</span><label class="ow-lens"><input type="checkbox" data-ow-lens ${st.lens ? "checked" : ""}><span class="sw"></span>렌즈 효과</label></div></div>`;
  // 훑어보기 칸 채우기(탭마다): 칸은 같은 모양, 누르면 그 탭의 원래 동작(도구 = 놓을 준비, 그림 = 자세히, 내 오브젝트 = 가운데에 넣기).
  const cap = (name, sub) => `<span class="cap"><b>${E(name)}</b><small>${E(sub || "")}</small></span>`;
  function picTile(el, it) { el.dataset.owAssetPick = it.id; el.title = it.name; el.classList.toggle("on", st.detail === it.id); el.innerHTML = `<span class="pic"><img alt="" draggable="false" src="${E(assetThumbUrl(it))}"></span>${cap(it.name, it.category === "인물" ? "사람" : SUBJECT_NAMES[it.subject] || "")}`; }
  function toolTile(el, it) {
    el.dataset.owToolPick = it.id; el.title = it.name + " — 누르면 캔버스에 놓을 준비"; el.innerHTML = `<span class="pic tool"></span>${cap(it.name, it.sub)}`;
    const tmp = document.createElement("div"), pending = []; renderSymbolsForIds(tmp, [it.id], pending);
    const icon = tmp.querySelector("kbd"); if (icon) el.querySelector(".pic").append(...icon.childNodes);
    requestAnimationFrame(() => sizeIconViewBoxes(pending));
  }
  function mineTile(el, it) { el.dataset.owMinePick = it.id; el.title = it.name + " — 누르면 캔버스 가운데에 넣습니다"; el.innerHTML = `<span class="pic mine"></span>${cap(it.name, it.category || PERSONAL_DEFAULT_CATEGORY)}`; el.querySelector(".pic").append(personalThumbnail(it.objects || [])); }
  function fillToolIcons(dlg) {
    const pending = [];
    for (const slot of dlg.querySelectorAll("[data-ow-icon]")) {
      const tmp = document.createElement("div");
      renderSymbolsForIds(tmp, [slot.dataset.owIcon], pending);
      const icon = tmp.querySelector("kbd");
      if (icon) slot.append(...icon.childNodes);
    }
    requestAnimationFrame(() => sizeIconViewBoxes(pending));
  }

  function picList() {
    const stars = assetStars(), cat = st.cat.pic;
    return (st.assets || []).filter((it) => (cat === "all" || (cat === "person" ? it.category === "인물" : it.subject === cat && it.category !== "인물"))
      && (!st.starOnly || stars.has(it.id)) && (!st.q || matches(st.q, hay(it.name, it.category, it.keywords, SUBJECT_NAMES[it.subject]))));
  }
  function picMain() {
    if (!st.assets) return '<p class="ow-empty">그림 목록을 여는 중…</p>';
    if (st.assetError) return empty("그림 목록을 열지 못했습니다: " + st.assetError);
    const list = picList(), stars = assetStars();
    if (!list.length) return empty(st.starOnly ? "별표 친 그림이 없습니다." : "찾는 그림이 없습니다.");
    if (st.view.pic === "gal") return galStage("그림 훑어보기");
    return `<div class="ow-grid pic">${list.map((it) => `<div class="ow-card${st.detail === it.id ? " on" : ""}" data-ow-asset="${E(it.id)}" title="${E(it.name)} (${E(it.category)})"><button type="button" class="ow-pick" data-ow-asset-pick="${E(it.id)}" aria-label="${E(it.name)}"><span class="ow-pic"><img loading="lazy" alt="" src="${E(assetThumbUrl(it))}"></span></button><span class="ow-name">${E(it.name)}</span>${star(stars.has(it.id), `data-ow-star-asset="${E(it.id)}"`)}</div>`).join("")}</div>`;
  }
  function detail() {
    const it = (st.assets || []).find((x) => x.id === st.detail);
    if (!it) return "";
    const on = assetStars().has(it.id), path = ["그림", SUBJECT_NAMES[it.subject], it.category].filter(Boolean).join(" › ");
    return `<aside class="ow-det" aria-label="그림 자세히"><button type="button" class="ow-x ow-detx" data-ow-detail-close aria-label="닫기">×</button>
      <div class="ow-detpic"><img alt="" src="${E(assetThumbUrl(it))}"></div>
      <div class="ow-detb"><b>${E(it.name)}</b><span class="ow-path">${E(path)}</span>
        <div class="ow-tags">${(it.keywords || []).slice(0, 6).map((k) => `<span class="ow-tag">#${E(k)}</span>`).join("")}</div>
        ${it.referenceExam ? `<span class="ow-path">참고: ${E(it.referenceExam)} · AI 생성 그림</span>` : ""}
        <div class="ow-detacts"><button type="button" class="ow-go" data-ow-insert-asset="${E(it.id)}">캔버스에 넣기</button><button type="button" class="ow-line" data-ow-star-asset="${E(it.id)}" aria-pressed="${on}">${on ? "★ 별표" : "☆ 별표"}</button></div></div></aside>`;
  }

  function mineList() {
    const cat = st.cat.mine, items = personalItems();
    let list = cat === "star" ? items.filter((it) => it.star) : cat.startsWith("cat:") ? items.filter((it) => (it.category || PERSONAL_DEFAULT_CATEGORY) === cat.slice(4)) : items;
    if (st.starOnly) list = list.filter((it) => it.star);
    if (st.q) list = list.filter((it) => matches(st.q, hay(it.name, it.category, it.tags)));
    return list;
  }
  function mineCard(it) {
    return `<div class="ow-card" data-ow-mine="${E(it.id)}" title="${E(it.name)} — 누르면 캔버스 가운데에 넣습니다"><button type="button" class="ow-pick" data-ow-mine-pick="${E(it.id)}" aria-label="${E(it.name)}"><span class="ow-pic tall" data-ow-thumb="${E(it.id)}"></span></button><span class="ow-name">${E(it.name)}</span>${star(!!it.star, `data-ow-star-mine="${E(it.id)}"`)}</div>`;
  }
  function mineMain() {
    const save = st.save ? saveCard() : "", list = mineList(), cat = st.cat.mine;
    if (!list.length) return save + empty(personalItems().length ? "찾는 내 오브젝트가 없습니다." : "저장한 오브젝트가 없습니다. 캔버스에서 그림을 고른 채 「오브젝트」를 열면 저장할 수 있습니다.");
    if (st.view.mine === "gal") return save + galStage("내 오브젝트 훑어보기");
    let groups;
    if (cat === "all" && !st.q && !st.starOnly) {
      const recent = [...list].sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || ""))).slice(0, 8);
      const byCat = new Map(); for (const it of list) { const c = it.category || PERSONAL_DEFAULT_CATEGORY; if (!byCat.has(c)) byCat.set(c, []); byCat.get(c).push(it); }
      groups = [["최근 만든 것", recent], ...byCat];
    } else if (cat === "recent") groups = [["최근 만든 것", [...list].sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || ""))).slice(0, 8)]];
    else groups = [[cat === "star" ? "★ 별표" : cat.startsWith("cat:") ? cat.slice(4) : "찾은 것", list]];
    return save + groups.map(([title, items]) => `<section class="ow-grp"><h3>${E(title)}<small>${items.length}</small></h3><div class="ow-grid mine">${items.map(mineCard).join("")}</div></section>`).join("");
  }
  function fillMineThumbs(dlg) {
    const items = personalItems();
    for (const slot of dlg.querySelectorAll("[data-ow-thumb]")) { const it = items.find((x) => x.id === slot.dataset.owThumb); if (it) slot.append(personalThumbnail(it.objects || [])); }
    const prev = dlg.querySelector("[data-ow-save-thumb]"); if (prev && st.save) prev.append(personalThumbnail(st.save.objects));
  }
  function saveCard() {
    const s = st.save, cats = myCats(), list = cats.length ? cats : [PERSONAL_DEFAULT_CATEGORY];
    return `<section class="ow-save" aria-label="고른 것을 내 오브젝트로 저장"><div class="ow-savepic" data-ow-save-thumb></div>
      <div class="ow-savebody"><div class="ow-savehead"><b>고른 것을 내 오브젝트로 저장</b><span>캔버스에서 고른 그림 ${s.objects.length}개</span></div>
        <div class="ow-saverow"><label>이름<input data-ow-save-name maxlength="40" value="${E(s.name)}"></label>
          <label>분류<select data-ow-save-cat>${list.map((c) => `<option${c === s.category ? " selected" : ""}>${E(c)}</option>`).join("")}<option value="__new">＋ 새 분류…</option></select></label></div>
        <div class="ow-savetags">${s.tags.map((t, i) => `<span class="ow-tag">#${E(t)}<button type="button" data-ow-save-untag="${i}" aria-label="태그 빼기">×</button></span>`).join("")}
          <button type="button" class="ow-mini" data-ow-save-tag>#＋ 태그</button><button type="button" class="ow-mini" data-ow-save-star aria-pressed="${s.star}">${s.star ? "★" : "☆"} 별표</button></div></div>
      <button type="button" class="ow-go ow-savego" data-ow-save>저장</button></section>`;
  }

  /* ---------- 훑어보기(아트갤러리 방식: 끝없이 이어지는 격자) ---------- */
  function gallery(stage, items, tile) {
    if (!stage || !items.length) return null;
    const board = stage.querySelector(".ow-board"), reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 칸(204×222) 안에 카드(188×206) — 사이 16.
    const W0 = 204, H0 = 222, TW = 188, TH = 206, tiles = [];
    let off = { x: 0, y: 0 }, z = 1, raf = 0, drag = null, moved = 0, alive = true;
    const per = Math.max(1, Math.round(Math.sqrt(items.length * 1.6)));
    function build() {
      board.textContent = ""; tiles.length = 0;
      const cols = Math.ceil(stage.clientWidth / (W0 * 0.6)) + 3, rows = Math.ceil(stage.clientHeight / (H0 * 0.6)) + 3;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const el = document.createElement("button"); el.type = "button"; el.className = "ow-tile"; board.append(el); tiles.push({ el, c, r, idx: -1 });
      }
      place();
    }
    function fill(t, idx) {
      if (t.idx === idx) return; t.idx = idx;
      for (const k of ["owAssetPick", "owToolPick", "owMinePick"]) delete t.el.dataset[k];
      tile(t.el, items[idx]);
    }
    function place() {
      const W = stage.clientWidth, H = stage.clientHeight, cw = W0 * z, ch = H0 * z;
      let cols = 0, rows = 0; for (const t of tiles) { cols = Math.max(cols, t.c + 1); rows = Math.max(rows, t.r + 1); }
      const spanX = cols * cw, spanY = rows * ch;
      for (const t of tiles) {
        // 줄마다 엇갈리게(홀수 줄은 반 칸 밀기). 화면 밖으로 나간 칸은 반대쪽으로 돌린다.
        const bx = t.c * cw + off.x + (t.r % 2 ? cw / 2 : 0), by = t.r * ch + off.y;
        let x = ((bx % spanX) + spanX) % spanX - cw, y = ((by % spanY) + spanY) % spanY - ch;
        const gc = Math.round((x - off.x - (t.r % 2 ? cw / 2 : 0)) / cw), gr = Math.round((y - off.y) / ch);
        fill(t, (((gr * per + gc) % items.length) + items.length) % items.length);
        let s = z;
        if (st.lens && !reduce) { const dx = (x + cw / 2 - W / 2) / (W / 2), dy = (y + ch / 2 - H / 2) / (H / 2), d = Math.min(1.4, Math.hypot(dx, dy)); s = z * (1.06 - 0.2 * d * d / 1.96); }
        t.el.style.transform = `translate(${x + (cw - TW) / 2}px,${y + (ch - TH) / 2}px) scale(${s})`;
      }
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (alive) place(); }); };
    const pan = (dx, dy) => { off.x += dx; off.y += dy; schedule(); };
    // 포인터는 실제로 끌기 시작할 때만 잡는다 — 처음부터 잡으면 카드 누름(click)이 무대로 가서 그림이 안 열린다.
    stage.addEventListener("pointerdown", (e) => { if (e.target.closest(".ow-pill")) return; drag = { x: e.clientX, y: e.clientY, id: e.pointerId, held: false }; moved = 0; });
    stage.addEventListener("pointermove", (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; moved += Math.abs(dx) + Math.abs(dy);
      if (!drag.held && moved > 4) { drag.held = true; stage.setPointerCapture(drag.id); stage.classList.add("drag"); }
      drag.x = e.clientX; drag.y = e.clientY; if (drag.held) pan(dx, dy); });
    const end = () => { drag = null; stage.classList.remove("drag"); };
    stage.addEventListener("pointerup", end); stage.addEventListener("pointercancel", end);
    // 끌다가 놓은 것은 누름으로 치지 않는다.
    stage.addEventListener("click", (e) => { if (moved > 6) { e.stopPropagation(); e.preventDefault(); moved = 0; } }, true);
    stage.addEventListener("wheel", (e) => { e.preventDefault(); if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) && !e.shiftKey) { z = Math.min(1.8, Math.max(0.55, z * (e.deltaY > 0 ? 0.92 : 1.08))); schedule(); } else pan(-e.deltaX, -e.deltaY); }, { passive: false });
    stage.addEventListener("keydown", (e) => { const k = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] }[e.key]; if (k) { e.preventDefault(); pan(...k); } });
    const ro = new ResizeObserver(() => build()); ro.observe(stage);
    return { stop() { alive = false; ro.disconnect(); cancelAnimationFrame(raf); }, place: schedule };
  }

  /* ---------- 동작 ---------- */
  function onKey(e) {
    // 창 위에 뜬 확인 창(분류·태그 입력)이 있으면 그 창이 Esc를 받는다.
    if (e.key === "Escape" && ![...document.querySelectorAll(".modal-overlay")].some((o) => !o.hidden && o.getClientRects().length && getComputedStyle(o).display !== "none")) { e.preventDefault(); e.stopPropagation(); if (st.detail) { st.detail = null; render(); } else close(); }
  }
  let qTimer = 0;
  function onInput(e) {
    const t = e.target;
    if (t.matches(".ow-q")) { st.q = t.value; clearTimeout(qTimer); qTimer = setTimeout(() => { const pos = t.selectionStart; render(); const q = back.querySelector(".ow-q"); q?.focus({ preventScroll: true }); q?.setSelectionRange(pos, pos); }, 120); }
    if (t.matches("[data-ow-save-name]") && st.save) st.save.name = t.value;
  }
  function onChange(e) {
    const t = e.target;
    if (t.matches("[data-ow-lens]")) { st.lens = t.checked; gal?.place(); }
    if (t.matches("[data-ow-save-cat]") && st.save) {
      if (t.value === "__new") { newCategory().then((name) => { if (name) st.save.category = name; render(); }); }
      else st.save.category = t.value;
    }
  }
  async function newCategory() {
    const name = String((await showPrompt("새 분류 이름", { title: "분류 만들기", placeholder: "예: 역학 실험", maxLength: 20 })) || "").trim().slice(0, 20);
    if (!name) return null;
    const list = readJson(MY_CATS_KEY, []);
    if (!list.includes(name)) writeJson(MY_CATS_KEY, [...list, name]);
    return name;
  }
  async function onClick(e) {
    const t = e.target, hit = (sel) => t.closest(sel);
    let b;
    if (hit("[data-ow-close]")) { close(); return; }
    if ((b = hit("[data-ow-tab]"))) { st.tab = b.dataset.owTab; st.detail = null; render(); if (st.tab === "pic" && !st.assets) loadAssets(); return; }
    if ((b = hit("[data-ow-cat]"))) { st.cat[st.tab] = b.dataset.owCat; st.detail = null; render(); return; }
    if (hit("[data-ow-staronly]")) { st.starOnly = !st.starOnly; render(); return; }
    if ((b = hit("[data-ow-view]"))) { st.view[st.tab] = b.dataset.owView; render(); return; }
    if (hit("[data-ow-newcat]")) { const name = await newCategory(); if (name) { st.cat.mine = "cat:" + name; render(); } return; }
    // 별표(카드 오른쪽 위 ☆ · 그림 자세히의 「☆ 별표」)
    if ((b = hit("[data-ow-star-tool]"))) { toggleObjectFavorite(b.dataset.owStarTool); render(); return; }
    if ((b = hit("[data-ow-star-asset]"))) { const s = assetStars(), id = b.dataset.owStarAsset; s.has(id) ? s.delete(id) : s.add(id); writeJson(ASSET_STAR_KEY, [...s]); render(); return; }
    if ((b = hit("[data-ow-star-mine]"))) { const it = personalItems().find((x) => x.id === b.dataset.owStarMine); if (it) { await setPersonalStar(it.id, !it.star); render(); } return; }
    // 넣기: 도구는 지금처럼 놓을 준비(캔버스를 누르거나 가운데에 바로 놓임), 내 오브젝트는 캔버스 가운데, 그림은 자세히 패널에서.
    if ((b = hit("[data-ow-tool-pick]"))) { close(); activateTemplate(b.dataset.owToolPick); return; }
    if ((b = hit("[data-ow-mine-pick]"))) { close(); insertPersonalItem(b.dataset.owMinePick); return; }
    if ((b = hit("[data-ow-asset-pick]"))) { st.detail = b.dataset.owAssetPick; if (st.view.pic === "gal" && gal) { back.querySelectorAll(".ow-tile").forEach((x) => x.classList.toggle("on", x.dataset.owAssetPick === st.detail)); const old = back.querySelector(".ow-det"); const html = detail(); if (old) old.outerHTML = html; else back.querySelector(".ow-b").insertAdjacentHTML("beforeend", html); } else render(); return; }
    if (hit("[data-ow-detail-close]")) { st.detail = null; back.querySelector(".ow-det")?.remove(); back.querySelectorAll(".ow-tile.on,.ow-card.on").forEach((x) => x.classList.remove("on")); return; }
    if ((b = hit("[data-ow-insert-asset]"))) { const it = (st.assets || []).find((x) => x.id === b.dataset.owInsertAsset); if (!it) return; close(); try { await insertAssetItem(it); } catch (error) { showAlert("그림을 넣지 못했습니다: " + error.message, { title: "오브젝트" }); } return; }
    // 저장 카드
    if (hit("[data-ow-save-tag]") && st.save) { const tag = String((await showPrompt("태그", { title: "태그 붙이기", placeholder: "예: 실험", maxLength: 20 })) || "").trim().replace(/^#/, "").slice(0, 20); if (tag && !st.save.tags.includes(tag)) st.save.tags.push(tag); render(); return; }
    if ((b = hit("[data-ow-save-untag]")) && st.save) { st.save.tags.splice(Number(b.dataset.owSaveUntag), 1); render(); return; }
    if (hit("[data-ow-save-star]") && st.save) { st.save.star = !st.save.star; render(); return; }
    if (hit("[data-ow-save]") && st.save) {
      const name = st.save.name.trim();
      if (!name) { back.querySelector("[data-ow-save-name]")?.focus(); return; }
      const ok = await savePersonalObject({ name, category: st.save.category, tags: st.save.tags, star: st.save.star, objects: st.save.objects });
      if (!ok) { showAlert("저장 공간이 부족해 오브젝트를 저장하지 못했습니다. 이미지가 큰 오브젝트를 줄이거나 기존 항목을 삭제한 뒤 다시 시도하세요.", { title: "오브젝트 저장" }); return; }
      st.save = null; st.cat.mine = "all"; render();
    }
  }

  opener.addEventListener("click", () => (back && !back.hidden ? close() : open()));
  window.addEventListener("5e:open-object-window", (e) => open(e.detail || {}));
}
