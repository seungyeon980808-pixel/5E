import { CATALOG } from "./catalog.js";
import { IMAGE_STYLES, physicalImageSize } from "./image.js";
import {
  PaletteStore,
  CATEGORIES,
  clone,
  unique,
  walkBlocks,
  blockLabel,
  resolvedItem,
  libraryLookup,
  findFreeSpot,
  labelOf,
  itemBytes,
  bytesToBase64,
  readChip,
  installChip,
  exportChip,
  importProfile,
  mergeLegacyFiles,
  removeItem,
  styleActions,
  unzipPalette,
} from "./model.js";
import { NativePalette } from "./native.js";
import {
  buildWorkbook,
  workbookToMarkdown,
  answerText,
  QUESTION_HEADERS,
  blockRows,
  buildMacroWorkbook,
  blocksToMarkdown,
  buildQuestionWorkbook,
  excelStyles,
  slotNamesFor,
} from "./workbook.js";
const safe = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const htmlButton = (text, action, extra = "") =>
  `<button type="button" data-palette-action="${action}" ${extra}>${text}</button>`;
const icon = (name) =>
  `<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${{ settings: '<path d="M4 5h12M4 10h12M4 15h12"/><circle cx="7" cy="5" r="2" fill="var(--bg-panel)"/><circle cx="13" cy="10" r="2" fill="var(--bg-panel)"/><circle cx="8" cy="15" r="2" fill="var(--bg-panel)"/>', search: '<circle cx="8" cy="8" r="5"/><path d="m12 12 5 5"/>', help: '<circle cx="10" cy="10" r="8"/><path d="M8 7a2 2 0 1 1 3 2l-1 1m0 3v.2"/>', undo: '<path d="m6 4-4 4 4 4M2 8h10a5 5 0 0 1 0 10"/>', redo: '<path d="m14 4 4 4-4 4M18 8h-10a5 5 0 0 0 0 10"/>' }[name] || ""}</svg>`;
const PROFILE_LABELS = {
  layout: "단 너비",
  font: "글꼴",
  material_box: "자료 박스",
  photo_box: "사진 박스",
  experiment_box: "실험 박스",
  bogi_box: "보기 박스",
  choices: "선지",
  stem: "발문",
  question: "질문",
  border: "테두리",
  exam_image_style: "그림 스타일",
  column_width_mm: "단 너비 (mm)",
  apply: "기본 글꼴 적용",
  name: "글꼴",
  size_pt: "글씨 크기 (pt)",
  row1_height_mm: "첫 행 높이 (mm)",
  row2_height_mm: "둘째 행 높이 (mm)",
  height_mm: "높이 (mm)",
  label: "머리말",
  title_height_mm: "제목 높이 (mm)",
  gap_height_mm: "제목 아래 간격 (mm)",
  content_height_mm: "내용 높이 (mm)",
  title: "제목",
  line_spacing: "줄 간격 (%)",
  cell_margin_left_mm: "셀 왼쪽 여백 (mm)",
  cell_margin_right_mm: "셀 오른쪽 여백 (mm)",
  cell_margin_top_mm: "셀 위쪽 여백 (mm)",
  cell_margin_bottom_mm: "셀 아래쪽 여백 (mm)",
  row_height_mm: "행 높이 (mm)",
  indentation: "들여쓰기 (+)·내어쓰기 (−) (pt)",
  prev_spacing: "위 간격 (pt)",
  next_spacing: "아래 간격 (pt)",
  material_type: "자료 테두리",
  bogi_type: "보기 테두리",
  experiment_type: "실험 테두리",
};
const profileDisplay = (key, value) =>
  ["indentation", "prev_spacing", "next_spacing"].includes(key)
    ? value / 100
    : value;
const TYPE_CATEGORY = {
  char: "문자",
  function: "서식",
  template: "템플릿",
  form: "양식",
};
export function initPaletteWorkspace(panel, services) {
  const mount = document.createElement("section");
  mount.id = "exam-palette";
  mount.className = "palette-dock";
  mount.setAttribute("aria-label", "조판 팔레트");
  panel.querySelector(".exam-header").after(mount);
  const store = new PaletteStore(),
    native = new NativePalette(services.getBridge, store, {
      replaceDocument: services.replaceDocument,
      notify: services.notify,
    });
  let activeTab = "학교 시험지",
    editing = false,
    manager = null,
    managerCategory = "템플릿",
    filter = "",
    subcat = "",
    symbolGroup = "",
    symbolLimit = 80,
    selectedItem = null,
    dragging = null,
    restoreContent = null,
    boundFrame = null;
  const perform = (task) =>
    services.run(async () => {
      try {
        await task();
      } catch (e) {
        services.notify(e.message, true);
        throw e;
      }
    });
  const getTab = () =>
    store.state.config.palette_tabs.find((t) => t.name === activeTab) ||
    store.state.config.palette_tabs[0];
  const download = services.download;
  function dialog(
    title,
    content,
    { submit = null, label = "저장", wide = false } = {},
  ) {
    const box = document.createElement("dialog");
    box.className = "palette-dialog" + (wide ? " palette-dialog-wide" : "");
    box.setAttribute("aria-label", title);
    box.innerHTML = `<form><header><h2>${safe(title)}</h2><button type="button" data-close aria-label="닫기">닫기</button></header><div class="palette-dialog-body">${content}</div><footer><span data-dialog-status role="status"></span>${submit ? `<button class="exam-primary" type="submit">${safe(label)}</button>` : ""}</footer></form>`;
    document.body.append(box);
    box.querySelector("[data-close]").onclick = () => box.close();
    box.addEventListener("close", () => box.remove());
    box.querySelector("form").onsubmit = (event) => {
      event.preventDefault();
      if (!submit) return;
      const buttons = box.querySelectorAll("button");
      buttons.forEach((b) => (b.disabled = true));
      void Promise.resolve()
        .then(() => submit(box))
        .then(() => box.close())
        .catch((e) => {
          box.querySelector("[data-dialog-status]").textContent = e.message;
          buttons.forEach((b) => (b.disabled = false));
        });
    };
    box.showModal();
    return box;
  }
  const field = (label, name, value = "", type = "text") =>
    `<label class="palette-field"><span>${safe(label)}</span><input name="${name}" type="${type}" value="${safe(value)}"></label>`;
  const textField = (label, name, value = "") =>
    `<label class="palette-field"><span>${safe(label)}</span><textarea name="${name}" rows="4">${safe(value)}</textarea></label>`;
  const filePicker = ({
    accept = "",
    multiple = false,
    directory = false,
  } = {}) =>
    new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.multiple = multiple;
      input.hidden = true;
      if (directory) {
        input.setAttribute("webkitdirectory", "");
        input.setAttribute("directory", "");
        input.multiple = true;
      }
      input.onchange = () => {
        const files = [...input.files];
        input.remove();
        resolve(files);
      };
      input.oncancel = () => {
        input.remove();
        resolve([]);
      };
      document.body.append(input);
      input.click();
    });
  function blockMarkup(b) {
    const customColor = /^#[\da-f]{6}$/i.test(b.color || "");
    const channels = customColor
      ? b.color
          .slice(1)
          .match(/../g)
          .map((v) => {
            const c = parseInt(v, 16) / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          })
      : [];
    const luminance = customColor
      ? channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
      : 0;
    const ink = luminance > 0.179 ? "#000000" : "#ffffff";
    return `<button type="button" class="palette-block${b.type === "builtin" ? " palette-tool" : ""}" data-block="${safe(b.id)}" ${editing ? 'draggable="true"' : ""} style="grid-column:${b.col + 1}/span ${b.span};grid-row:${b.row + 1}/span ${b.rows};${customColor ? `--block-color:${b.color};--block-ink:${ink};` : ""}" title="${safe(blockLabel(b))}" aria-label="${safe(blockLabel(b))}"><span>${safe(blockLabel(b))}</span>${b.type === "stack" ? "<small>겹치기</small>" : ""}${editing ? '<i class="palette-resize" aria-label="크기 조절"></i>' : ""}</button>`;
  }
  function render() {
    if (!store.state) return;
    const tabs = store.state.config.palette_tabs,
      tab = getTab(),
      main = tabs.find((t) => t.name === "메인");
    activeTab = tab.name;
    mount.innerHTML = `<div class="palette-toolbar"><h2>조판 팔레트</h2>${htmlButton(icon("search"), "search", 'title="통합 찾기" aria-label="물감 통합 찾기"')}${htmlButton(icon("settings"), "manager", 'title="팔레트·물감 설정" aria-label="팔레트와 물감 설정"')}${htmlButton(icon("help"), "help", 'title="사용법" aria-label="팔레트 사용법"')}</div><div class="palette-common" aria-label="공통 도구">${main.blocks.map((b) => htmlButton(safe(blockLabel(b)), "common", `data-common="${safe(b.id)}"`)).join("")}</div><label class="palette-tab-select"><span class="palette-visually-hidden">사용할 팔레트</span><select data-palette-tab>${tabs.map((t) => `<option ${t.name === tab.name ? "selected" : ""}>${safe(t.name)}</option>`).join("")}</select></label><div class="palette-grid" data-grid style="--palette-cols:${tab.cols}" aria-label="${safe(tab.name)} 물감">${tab.blocks.map(blockMarkup).join("")}</div><div class="palette-shortcuts">${htmlButton(icon("undo"), "document-undo", 'aria-label="문서 실행 취소" title="문서 실행 취소"')}${htmlButton(icon("redo"), "document-redo", 'aria-label="문서 다시 실행" title="문서 다시 실행"')}${htmlButton("마크다운 입력", "markdown")}${htmlButton("문항 번호", "number", `title="다음 문항 번호 ${store.state.config.next_number}"`)}</div>`;
    if (manager?.isConnected) renderManager();
  }
  async function execute(block, context = null) {
    if (block.type === "stack") {
      const box = dialog(
        blockLabel(block),
        `<div class="palette-stack-list">${(block.items || []).map((b, i) => htmlButton(safe(blockLabel(b)), "stack-use", `data-index="${i}"`)).join("")}</div>`,
      );
      box.querySelectorAll("[data-index]").forEach(
        (button) =>
          (button.onclick = () => {
            box.close();
            void perform(() =>
              execute(block.items[+button.dataset.index], context),
            );
          }),
      );
      return;
    }
    if (block.type === "builtin") {
      const actions = {
        convert: () => {
          const ctx = context || native.capture();
          return ctx.text.trim()
            ? native.convert(null, ctx)
            : openMarkdown(ctx);
        },
        spacing_fit: () => native.fitSpacing(),
        photo: () => openManager("사진"),
        special: () => openManager("특수기호"),
        form_fill: () => openManager("양식"),
        exam_excel: openExcel,
        search: () => openManager("전체"),
      };
      if (!actions[block.key])
        throw new Error(`알 수 없는 도구입니다: ${block.key}`);
      return actions[block.key]();
    }
    const item = resolvedItem(store.state, block);
    if (block.type === "char")
      return native.insertChar(
        item?.text ?? block.value ?? "",
        context || native.capture(),
      );
    if (block.type === "function")
      return native.applyFunctions(
        item ? styleActions(item) : block.actions || [],
        context || native.capture(),
      );
    if (!item)
      throw new Error(
        "연결된 물감을 찾지 못했습니다. 물감 창고에서 다시 연결해주세요.",
      );
    const ctx = context || native.capture();
    if (item.slot_count > 0) return fillItem(item, block.type === "form", ctx);
    return native.useItem(item, { form: block.type === "form", context: ctx });
  }
  function fillItem(item, form, context) {
    const names =
      item.slot_names?.length === item.slot_count
        ? item.slot_names
        : Array.from({ length: item.slot_count }, (_, i) => `빈칸 ${i + 1}`);
    dialog(
      `${item.name} · 채워 넣기`,
      `<p class="palette-description">비워 둔 칸은 빈칸으로 남습니다. 여러 줄·서식 명령·사진 라벨을 넣을 수 있습니다.</p><div class="palette-slot-fields">${names.map((name, i) => textField(name || `빈칸 ${i + 1}`, `slot-${i}`)).join("")}</div>`,
      {
        label: form ? "새 시험지로 열기" : "커서에 삽입",
        wide: true,
        submit: async (box) => {
          const lookup = libraryLookup(store.state),
            { buildLibraryPlan } = await import("./parser.js");
          const fills = names.map((_, i) => {
            const value = box.querySelector(`[name="slot-${i}"]`).value;
            if (!value.trim()) return null;
            const plan = buildLibraryPlan(value, lookup);
            if (plan.ops.some((op) => ["template", "form"].includes(op[0])))
              throw new Error(
                "빈칸 안에는 문구·서식·사진·표를 넣어주세요. 템플릿은 따로 삽입합니다.",
              );
            if (plan.ops.length === 1 && plan.ops[0][0] !== "table")
              return plan.ops[0][1];
            return {
              kind: "multiline",
              lines: plan.ops.map((op) =>
                op[0] === "table"
                  ? { kind: "table", rows: op[1], cols: op[2], grid: op[3] }
                  : op[1],
              ),
            };
          });
          await services.withBusy(() =>
            native.useItem(item, { form, fills, context }),
          );
        },
      },
    );
  }
  function openMarkdown(context = native.capture(), value = context.text) {
    dialog(
      "마크다운 변환",
      `<p class="palette-description">문항 문법 또는 물감 라벨로 작성한 내용을 현재 위치에 넣습니다. 선택한 원문은 결과로 바뀝니다.</p>${textField("변환할 내용", "markdown", value)}`,
      {
        label: "시험지에 변환",
        wide: true,
        submit: (box) =>
          services.withBusy(() =>
            native.convert(
              box.querySelector('[name="markdown"]').value,
              context,
            ),
          ),
      },
    );
  }
  function number() {
    dialog(
      "문항 번호",
      `${field("다음 번호", "number", store.state.config.next_number, "number")}<label class="palette-check"><input name="use-number" type="checkbox" ${store.state.config.use_number ? "checked" : ""}>문항 번호 자동 넣기</label>`,
      {
        submit: (box) =>
          store.update((s) => {
            const num = Number(box.querySelector('[name="number"]').value);
            if (!Number.isSafeInteger(num) || num < 1)
              throw new Error("문항 번호는 1 이상의 정수로 입력해주세요.");
            s.config.next_number = num;
            s.config.use_number = box.querySelector(
              '[name="use-number"]',
            ).checked;
          }),
      },
    );
  }
  const actionsForm = (actions) =>
    `<div class="palette-format-actions">${CATALOG.functions
      .map((f) => {
        const got = actions.find((a) => a.func === f.key),
          value =
            got?.value ??
            CATALOG.defaults[f.key] ??
            (f.kind === "font"
              ? "함초롬바탕"
              : f.kind === "color"
                ? "#000000"
                : "");
        return `<label class="palette-format-row"><span><input type="checkbox" data-function="${safe(f.key)}" ${got ? "checked" : ""}>${safe(f.key)}</span>${f.kind === "toggle" || f.kind === "para" ? "<span>선택 영역에 적용</span>" : `<input data-function-value="${safe(f.key)}" ${f.kind === "number" ? `type="number" min="${CATALOG.spin[f.key][0]}" max="${CATALOG.spin[f.key][1]}" step="${CATALOG.spin[f.key][2]}"` : f.kind === "color" ? 'type="color"' : 'list="palette-fonts"'} value="${safe(value)}" aria-label="${safe(f.key)} 값">`}<small>${safe(f.unit || "")}</small></label>`;
      })
      .join(
        "",
      )}</div><datalist id="palette-fonts">${CATALOG.fonts.map((f) => `<option value="${safe(f)}">`).join("")}</datalist>`;
  function readActions(box) {
    return [...box.querySelectorAll("[data-function]:checked")].map((check) => {
      const f = CATALOG.functions.find((f) => f.key === check.dataset.function),
        input = box.querySelector(`[data-function-value="${f.key}"]`);
      return {
        func: f.key,
        ...(input
          ? { value: f.kind === "number" ? Number(input.value) : input.value }
          : {}),
      };
    });
  }
  async function editItem(cat, item = null) {
    let captured, bytes;
    if (["템플릿", "양식"].includes(cat) && !item) {
      const choice = dialog(
        `${cat} 등록`,
        `<p>현재 선택한 문서 영역을 저장하거나 한글 파일을 등록합니다.</p><div class="palette-choice-list">${cat === "템플릿" ? htmlButton("선택 영역 캡처", "capture") : ""}${htmlButton("한글 파일 가져오기", "file")}</div>`,
      );
      const picked = await new Promise((resolve) => {
        choice.addEventListener("close", () => resolve(null), { once: true });
        choice
          .querySelector('[data-palette-action="capture"]')
          ?.addEventListener("click", () => {
            resolve("capture");
            choice.close();
          });
        choice.querySelector('[data-palette-action="file"]').onclick = () => {
          resolve("file");
          choice.close();
        };
      });
      if (!picked) return;
      if (picked === "capture") {
        captured = await native.captureTemplate();
        bytes = captured.bytes;
      } else {
        const [file] = await filePicker({ accept: ".hwp,.hwpx" });
        if (!file) return;
        bytes = new Uint8Array(await file.arrayBuffer());
        captured = await native.inspectFile(bytes);
        captured.file = file.name;
      }
    }
    const box = dialog(
      item ? `${item.name} · 물감 수정` : `${cat} 물감 등록`,
      `${field("이름", "name", item?.name || captured?.file?.replace(/\.(hwp|hwpx)$/i, "") || "")}${field("마크다운 라벨", "label", item?.label || "")}${field("태그 (쉼표로 구분)", "tags", (item?.tags || []).join(", "))}${field("하위 분류", "subcat", item?.subcat || subcat)}${cat === "문자" ? textField("기호·문구", "text", item?.text || "") : cat === "서식" ? `${htmlButton("현재 문서의 서식 가져오기", "capture-format")}${actionsForm(item ? styleActions(item) : [])}` : `${textField("빈칸 이름 (한 줄에 하나)", "slots", (item?.slot_names || captured?.slot_names || []).map((n, i) => n || `빈칸 ${i + 1}`).join("\n"))}<p>${item?.slot_count ?? captured?.slot_count ?? 0}개 빈칸 · 표·병합·글자 모양을 함께 저장합니다.</p>`}`,
      {
        wide: cat === "서식",
        submit: async (box) => {
          const name = box.querySelector('[name="name"]').value.trim(),
            label = labelOf(box.querySelector('[name="label"]').value || name);
          if (!name || !label) throw new Error("이름과 라벨을 입력해주세요.");
          const owner = CATEGORIES.flatMap((c) => store.state.library[c]).find(
            (i) => i.label === label && i.id !== item?.id,
          );
          if (owner)
            throw new Error(`'${label}' 라벨은 ${owner.name}에서 사용합니다.`);
          await store.update((s) => {
            const updated = {
              ...clone(item || {}),
              id: item?.id || crypto.randomUUID(),
              name,
              label,
              tags: box
                .querySelector('[name="tags"]')
                .value.split(/[#,\s]+/)
                .filter(Boolean),
              subcat: box.querySelector('[name="subcat"]').value.trim(),
            };
            if (cat === "문자")
              updated.text = box.querySelector('[name="text"]').value;
            else if (cat === "서식") {
              updated.actions = readActions(box);
              delete updated.fields;
            } else {
              updated.slot_names = box
                .querySelector('[name="slots"]')
                .value.split("\n");
              updated.slot_count =
                item?.slot_count ?? captured?.slot_count ?? 0;
              if (updated.slot_names.length !== updated.slot_count)
                throw new Error(
                  "빈칸 이름은 실제 빈칸 수에 맞춰 입력해주세요.",
                );
              if (bytes) {
                updated.asset = crypto.randomUUID();
                s.assets[updated.asset] = bytesToBase64(bytes);
                updated.file = captured.file || "capture.hwpx";
                updated.preview = captured.preview;
                delete updated.assetUrl;
              }
            }
            const idx = s.library[cat].findIndex((i) => i.id === updated.id);
            if (idx >= 0) s.library[cat][idx] = updated;
            else s.library[cat].push(updated);
            selectedItem = updated.id;
          });
        },
      },
    );
    box
      .querySelector('[data-palette-action="capture-format"]')
      ?.addEventListener("click", () => {
        const actions = native.currentFormat();
        box.querySelector(".palette-format-actions").outerHTML =
          actionsForm(actions).split("<datalist")[0];
      });
  }
  function toBlock(cat, item) {
    return {
      id: crypto.randomUUID(),
      type: {
        문자: "char",
        서식: "function",
        템플릿: "template",
        양식: "form",
      }[cat],
      ref: item.id,
      name: item.name,
      ...(cat === "문자" ? { value: item.text } : {}),
      span: 4,
      rows: 2,
    };
  }
  async function addBlock(cat, item, position = null) {
    await store.update((s) => {
      const t = s.config.palette_tabs.find((t) => t.name === activeTab);
      const b = toBlock(cat, item);
      Object.assign(
        b,
        position || findFreeSpot(t.blocks, t.cols, b.span, b.rows),
      );
      t.blocks.push(b);
    });
  }
  function editBlock(block) {
    const t = getTab();
    const box = dialog(
      "물감 블럭 설정",
      `${field("표시 이름", "name", block.name || blockLabel(block))}${field("가로 칸", "span", block.span, "number")}${field("세로 칸", "rows", block.rows, "number")}${field("행 (0부터)", "row", block.row, "number")}${field("열 (0부터)", "col", block.col, "number")}${field("색", "color", block.color || "#e6edf5", "color")}${block.type === "char" && !block.ref ? textField("삽입할 기호·문구", "value", block.value) : ""}${block.type === "function" && !block.ref ? actionsForm(block.actions || []) : ""}<div class="palette-choice-list">${htmlButton("복제", "duplicate")}${htmlButton("삭제", "delete")}${block.type === "stack" ? htmlButton("겹친 물감 풀기", "unstack") : ""}</div>`,
      {
        submit: async (box) =>
          store.update((s) => {
            const tab = s.config.palette_tabs.find((x) => x.name === t.name),
              b = tab.blocks.find((x) => x.id === block.id);
            b.name = box.querySelector('[name="name"]').value;
            b.span = Number(box.querySelector('[name="span"]').value);
            b.rows = Number(box.querySelector('[name="rows"]').value);
            b.row = Number(box.querySelector('[name="row"]').value);
            b.col = Number(box.querySelector('[name="col"]').value);
            if (
              b.span < 1 ||
              b.span > tab.cols ||
              b.rows < 1 ||
              b.rows > 16 ||
              b.col + b.span > tab.cols ||
              b.row < 0 ||
              b.col < 0
            )
              throw new Error(
                "블럭이 팔레트 격자 안에 들어가도록 입력해주세요.",
              );
            const overlap = tab.blocks.some(
              (x) =>
                x !== b &&
                b.row < x.row + x.rows &&
                b.row + b.rows > x.row &&
                b.col < x.col + x.span &&
                b.col + b.span > x.col,
            );
            if (overlap)
              throw new Error("다른 블럭과 겹칩니다. 빈 칸을 선택해주세요.");
            b.color = box.querySelector('[name="color"]').value;
            if (b.type === "char" && !b.ref)
              b.value = box.querySelector('[name="value"]').value;
            if (b.type === "function" && !b.ref) b.actions = readActions(box);
          }),
      },
    );
    box.querySelector('[data-palette-action="duplicate"]').onclick = () =>
      void perform(async () => {
        await store.update((s) => {
          const tab = s.config.palette_tabs.find((x) => x.name === t.name),
            copy = clone(block);
          copy.id = crypto.randomUUID();
          Object.assign(
            copy,
            findFreeSpot(tab.blocks, tab.cols, copy.span, copy.rows),
          );
          tab.blocks.push(copy);
        });
        box.close();
      });
    box.querySelector('[data-palette-action="delete"]').onclick = () =>
      void perform(async () => {
        if (
          block.type === "builtin" &&
          block.key === "convert" &&
          [
            ...walkBlocks(
              store.state.config.palette_tabs.find((x) => x.name === "메인")
                .blocks,
            ),
          ].filter((b) => b.type === "builtin" && b.key === "convert")
            .length === 1
        )
          throw new Error("마지막 마크다운 변환 도구는 삭제할 수 없습니다.");
        await store.update(
          (s) =>
            (s.config.palette_tabs.find((x) => x.name === t.name).blocks =
              s.config.palette_tabs
                .find((x) => x.name === t.name)
                .blocks.filter((b) => b.id !== block.id)),
        );
        box.close();
      });
    box.querySelector('[data-palette-action="unstack"]')?.addEventListener(
      "click",
      () =>
        void perform(async () => {
          await store.update((s) => {
            const tab = s.config.palette_tabs.find((x) => x.name === t.name);
            tab.blocks = tab.blocks.filter((b) => b.id !== block.id);
            for (const it of block.items || [])
              tab.blocks.push({
                ...it,
                ...findFreeSpot(
                  tab.blocks,
                  tab.cols,
                  it.span || 2,
                  it.rows || 1,
                ),
              });
          });
          box.close();
        }),
    );
  }
  function tabSettings(add = false) {
    const tab = getTab();
    const box = dialog(
      add ? "새 팔레트" : "팔레트 설정",
      `${field("팔레트 이름", "name", add ? "" : tab.name)}${field("가로 칸 (8~32)", "cols", add ? 8 : tab.cols, "number")}<div class="palette-choice-list">${add ? "" : htmlButton("앞으로", "tab-up") + htmlButton("뒤로", "tab-down") + htmlButton("팔레트 복제", "tab-copy") + htmlButton("팔레트 삭제", "tab-delete")}</div>`,
      {
        submit: async (box) =>
          store.update((s) => {
            const name = box.querySelector('[name="name"]').value.trim(),
              cols = Number(box.querySelector('[name="cols"]').value);
            if (!name || cols < 8 || cols > 32 || !Number.isInteger(cols))
              throw new Error("이름과 8~32 사이의 가로 칸 수를 입력해주세요.");
            if (
              s.config.palette_tabs.some(
                (t) => t.name === name && (add || t.name !== tab.name),
              )
            )
              throw new Error("같은 이름의 팔레트가 있습니다.");
            if (!add && tab.name === "메인" && name !== "메인")
              throw new Error("공통 도구 팔레트의 이름은 메인입니다.");
            const next = add
              ? { name, cols, blocks: [] }
              : s.config.palette_tabs.find((t) => t.name === tab.name);
            next.name = name;
            next.cols = cols;
            if (add) s.config.palette_tabs.push(next);
            activeTab = name;
          }),
      },
    );
    for (const action of ["tab-up", "tab-down", "tab-copy", "tab-delete"])
      box.querySelector(`[data-palette-action="${action}"]`)?.addEventListener(
        "click",
        () =>
          void perform(async () => {
            await store.update((s) => {
              const tabs = s.config.palette_tabs,
                index = tabs.findIndex((t) => t.name === tab.name);
              if (action === "tab-delete") {
                if (tab.name === "메인")
                  throw new Error("공통 도구 팔레트는 삭제할 수 없습니다.");
                tabs.splice(index, 1);
                activeTab = tabs[0].name;
              } else if (action === "tab-copy") {
                const copy = clone(tab);
                copy.name = unique(tab.name, new Set(tabs.map((t) => t.name)));
                for (const b of walkBlocks(copy.blocks))
                  b.id = crypto.randomUUID();
                tabs.splice(index + 1, 0, copy);
                activeTab = copy.name;
              } else {
                const target = index + (action === "tab-up" ? -1 : 1);
                if (target >= 0 && target < tabs.length)
                  [tabs[index], tabs[target]] = [tabs[target], tabs[index]];
              }
            });
            box.close();
          }),
      );
  }
  function openManager(category = "템플릿") {
    if (!store.state) return;
    if (manager) {
      managerCategory = category;
      renderManager();
      manager.focus();
      return;
    }
    managerCategory = category;
    editing = true;
    manager = document.createElement("section");
    manager.id = "palette-manager";
    manager.className = "palette-manager";
    manager.tabIndex = -1;
    manager.setAttribute("aria-label", "팔레트와 물감 설정");
    panel.append(manager);
    render();
    manager.focus();
  }
  function closeManager() {
    manager?.remove();
    manager = null;
    editing = false;
    render();
  }
  function managerItems() {
    const q = filter.toLowerCase();
    let pairs =
      managerCategory === "전체"
        ? CATEGORIES.flatMap((c) => store.state.library[c].map((it) => [c, it]))
        : CATEGORIES.includes(managerCategory)
          ? store.state.library[managerCategory].map((it) => [
              managerCategory,
              it,
            ])
          : [];
    return pairs.filter(
      ([, it]) =>
        (!subcat || it.subcat === subcat) &&
        (!q ||
          [it.name, it.label, ...(it.tags || []), it.preview || ""]
            .join(" ")
            .toLowerCase()
            .includes(q)),
    );
  }
  function renderManager() {
    const tab = getTab(),
      pairs = managerItems(),
      categories = [
        "전체",
        ...CATEGORIES,
        "특수기호",
        "사진",
        "도구",
        "조판 설정",
        "문서 해체",
      ];
    manager.innerHTML = `<header class="palette-manager-head"><h2>팔레트와 물감</h2>${htmlButton("닫기", "manager-close")}</header><div class="palette-manager-toolbar">${htmlButton("새 팔레트", "new-tab")}${htmlButton("팔레트 설정", "tab-settings")}${htmlButton("설정 되돌리기", "settings-undo", store.undo.length ? "" : "disabled")}${htmlButton("다시 실행", "settings-redo", store.redo.length ? "" : "disabled")}${htmlButton("칩 가져오기", "chip-import")}${htmlButton("팔레트 보내기", "chip-export")}${htmlButton("기존 설정 가져오기", "legacy-import")}${htmlButton("전체 설정 백업", "backup")}${htmlButton("이전 저장 복구", "recover")}</div><nav class="palette-categories" aria-label="물감 종류">${categories.map((c) => htmlButton(safe(c), "category", `data-category="${safe(c)}" aria-pressed="${c === managerCategory}"`)).join("")}</nav><div class="palette-find"><label><span class="palette-visually-hidden">물감 검색</span><input data-palette-search type="search" value="${safe(filter)}" placeholder="이름·라벨·태그로 찾기"></label><label><span class="palette-visually-hidden">하위 분류</span><select data-subcat><option value="">모든 분류</option>${[...new Set(pairs.map(([, it]) => it.subcat).filter(Boolean))].map((c) => `<option ${c === subcat ? "selected" : ""}>${safe(c)}</option>`).join("")}</select></label>${CATEGORIES.includes(managerCategory) ? htmlButton("물감 등록", "item-add") + htmlButton("분류·태그 수정", "organize") : ""}</div><div class="palette-manager-content">${managerCategory === "특수기호" ? symbolMarkup() : managerCategory === "사진" ? photoMarkup() : managerCategory === "도구" ? toolsMarkup() : managerCategory === "조판 설정" ? profileMarkup() : managerCategory === "문서 해체" ? decomposeMarkup() : `<div class="palette-library-list">${pairs.length ? pairs.map(([cat, it]) => `<button type="button" class="palette-library-item" data-item="${safe(it.id)}" data-category="${cat}" draggable="true" aria-pressed="${it.id === selectedItem}"><strong>${safe(it.name)}</strong><span>${safe(cat)} · \\${safe(it.label)}\\</span><small>${safe(it.subcat || "")}${it.tags?.length ? " · " + safe(it.tags.join(" ")) : ""}</small></button>`).join("") : '<p class="palette-description">등록된 물감이 없습니다. 물감 등록으로 기호·서식·한글 조각을 저장하세요.</p>'}</div><div class="palette-item-inspector">${inspectorMarkup(pairs.find(([, it]) => it.id === selectedItem))}</div>`}</div><p class="palette-manager-hint">물감을 왼쪽 팔레트에 끌어 놓으세요. 블럭을 클릭하면 실행하고, 우클릭하면 이름·색·크기를 고칩니다. 다른 블럭 위에 놓으면 겹치기가 됩니다.</p>`;
    bindManager();
  }
  function inspectorMarkup(pair) {
    if (!pair)
      return '<p class="palette-description">물감을 선택하면 내용과 빈칸을 볼 수 있습니다.</p>';
    const [cat, item] = pair;
    return `<h3>${safe(item.name)}</h3><p class="palette-description">${safe(item.slot_count ? `${item.slot_count}개 빈칸 · ` : "")}${safe(item.from_chip || item.subcat || cat)}</p><pre>${safe(
      item.preview ||
        item.text ||
        item.slot_names?.map((n, i) => `${i + 1}. ${n || "빈칸"}`).join("\n") ||
        styleActions(item)
          .map((a) => `${a.func} ${a.value ?? ""}`)
          .join("\n"),
    )}</pre><div class="palette-item-actions">${htmlButton("팔레트에 추가", "item-block")}${htmlButton("바로 사용", "item-use")}${htmlButton("정보 수정", "item-edit")}${["템플릿", "양식"].includes(cat) && !item.mix ? htmlButton("꺼내서 고치기", "item-content") : ""}${cat === "템플릿" ? htmlButton("꾸러미 만들기", "mix") : ""}${["템플릿", "양식"].includes(cat) ? htmlButton("AI 프롬프트 복사", "prompt") : ""}${htmlButton("물감 보내기", "item-export")}${htmlButton("삭제", "item-delete")}</div>`;
  }
  function symbolMarkup() {
    const q = filter.toLowerCase(),
      symbols = CATALOG.builtins.filter(
        (s) =>
          (!symbolGroup || s.group === symbolGroup) &&
          (!q ||
            [s.label, s.text, s.group].join(" ").toLowerCase().includes(q)),
      );
    return `<div class="palette-symbol-pane"><label class="palette-field"><span>기호 분류</span><select data-symbol-group><option value="">모든 기호</option>${[...new Set(CATALOG.builtins.map((b) => b.group))].map((g) => `<option ${g === symbolGroup ? "selected" : ""}>${safe(g)}</option>`).join("")}</select></label><div class="palette-symbol-grid">${symbols
      .slice(0, symbolLimit)
      .map(
        (s) =>
          `<button type="button" data-symbol="${safe(s.label)}" title="\\${safe(s.label)}\\ · ${safe(s.group)}"><span>${safe(s.text)}</span><small>${safe(s.label)}</small></button>`,
      )
      .join(
        "",
      )}</div>${symbols.length > symbolLimit ? htmlButton("기호 더 보기", "symbols-more") : ""}<p>기호를 누르면 현재 커서에 넣습니다. 우클릭하면 팔레트에 추가합니다.</p></div>`;
  }
  function photoMarkup() {
    return `<div class="palette-photo-pane"><div class="palette-choice-list">${htmlButton("사진 폴더 연결", "photo-folder")}${htmlButton("그림 파일 추가", "photo-files")}</div><p class="palette-description">같은 그림 이름은 먼저 연결한 폴더에서 찾습니다. 파일은 이 브라우저에 저장되며 폴더 변경 후 다시 연결하여 갱신합니다.</p><div class="palette-photo-folders">${[...new Set(store.state.photos.map((p) => p.folder))].map((folder, i) => `<div>${i + 1}. ${safe(folder || "그림 파일")} <button type="button" data-folder-up="${safe(folder)}" ${i ? "" : "disabled"}>우선순위 올리기</button><button type="button" data-folder-delete="${safe(folder)}">연결 해제</button></div>`).join("")}</div><div class="palette-photo-list">${store.state.photos
      .filter(
        (p) => !filter || p.label.toLowerCase().includes(filter.toLowerCase()),
      )
      .map(
        (p) =>
          `<div><button type="button" data-photo="${safe(p.id)}"><img src="data:image/${p.extension === "jpg" ? "jpeg" : p.extension};base64,${safe(store.state.assets[p.asset] || "")}" alt=""><span>${safe(p.label)}</span><small>${safe(p.folder || "그림 파일")}</small></button><button type="button" data-photo-size="${safe(p.id)}">삽입 너비 ${Math.round((p.widthMm || p.physicalSize?.widthMm || (p.width * 25.4) / 96) * 10) / 10} mm</button><button type="button" data-photo-delete="${safe(p.id)}" aria-label="${safe(p.label)} 삭제">삭제</button></div>`,
      )
      .join("")}</div></div>`;
  }
  function toolsMarkup() {
    return `<div class="palette-library-list">${CATALOG.tools
      .filter((t) => !t.hidden)
      .map(
        (t) =>
          `<button type="button" data-tool="${t.key}" draggable="true"><strong>${safe(t.name)}</strong><span>${safe(t.hint)}</span></button>`,
      )
      .join(
        "",
      )}</div><p>도구를 누르면 현재 팔레트에 추가합니다. 설정 도구는 위의 물감 종류에서 열 수 있습니다.</p>`;
  }
  function profileMarkup() {
    const config = store.state.config,
      spec = config.profiles[config.active_profile];
    return `<div class="palette-profile-pane"><label class="palette-field"><span>조판 프리셋</span><select data-profile>${Object.keys(
      config.profiles,
    )
      .map(
        (n) =>
          `<option ${n === config.active_profile ? "selected" : ""}>${safe(n)}</option>`,
      )
      .join(
        "",
      )}</select></label><div class="palette-choice-list">${htmlButton("설정 수정", "profile-edit")}${htmlButton("설정 삭제", "profile-delete")}${htmlButton("설정 복제", "profile-copy")}${htmlButton("설정 보내기", "profile-export")}${htmlButton("설정 가져오기", "profile-import")}</div><dl>${Object.entries(
      spec,
    )
      .map(
        ([group, value]) =>
          `<dt>${safe(PROFILE_LABELS[group] || group)}</dt><dd>${safe(
            typeof value === "object"
              ? Object.entries(value)
                  .map(
                    ([k, v]) =>
                      `${PROFILE_LABELS[k] || k}: ${profileDisplay(k, v) === true ? "적용" : profileDisplay(k, v) === false ? "해제" : profileDisplay(k, v)}`,
                  )
                  .join(" · ")
              : value || "원본 유지",
          )}</dd>`,
      )
      .join("")}</dl></div>`;
  }
  function bindManager() {
    manager.querySelectorAll("[data-piece-focus]").forEach(
      (button) =>
        (button.onclick = () => {
          native.assertContext(decomposeContext);
          native
            .bridge()
            .input.cursor.moveTo(
              decomposition[+button.dataset.pieceFocus].position,
            );
        }),
    );
    manager.querySelector("[data-palette-search]").oninput = (e) => {
      filter = e.target.value;
      const focus = e.target.selectionStart;
      renderManager();
      const input = manager.querySelector("[data-palette-search]");
      input.focus();
      if (input.type !== "search") input.setSelectionRange(focus, focus);
    };
    manager.querySelector("[data-subcat]").onchange = (e) => {
      subcat = e.target.value;
      renderManager();
    };
    manager
      .querySelector("[data-symbol-group]")
      ?.addEventListener("change", (e) => {
        symbolGroup = e.target.value;
        symbolLimit = 80;
        renderManager();
      });
    manager.querySelector("[data-profile]")?.addEventListener(
      "change",
      (e) =>
        void perform(() =>
          store.update((s) => {
            s.config.active_profile = e.target.value;
          }),
        ),
    );
    manager.querySelectorAll("[data-item]").forEach((button) => {
      button.onclick = () => {
        selectedItem = button.dataset.item;
        renderManager();
      };
      button.ondblclick = () =>
        void perform(() =>
          execute(
            toBlock(
              button.dataset.category,
              store.state.library[button.dataset.category].find(
                (i) => i.id === button.dataset.item,
              ),
            ),
          ),
        );
    });
    manager.querySelectorAll("[data-symbol]").forEach((button) => {
      button.onclick = () =>
        void perform(() =>
          native.insertChar(
            CATALOG.builtins.find((b) => b.label === button.dataset.symbol)
              .text,
          ),
        );
      button.oncontextmenu = (e) => {
        e.preventDefault();
        void perform(() =>
          store.update((s) => {
            const t = s.config.palette_tabs.find((t) => t.name === activeTab),
              sym = CATALOG.builtins.find(
                (b) => b.label === button.dataset.symbol,
              ),
              block = {
                id: crypto.randomUUID(),
                type: "char",
                name: sym.text,
                value: sym.text,
                span: 1,
                rows: 1,
              };
            t.blocks.push({ ...block, ...findFreeSpot(t.blocks, t.cols) });
          }),
        );
      };
    });
    manager.querySelectorAll("[data-tool]").forEach(
      (button) =>
        (button.onclick = () =>
          void perform(() =>
            store.update((s) => {
              const t = s.config.palette_tabs.find((t) => t.name === activeTab),
                tool = CATALOG.tools.find((a) => a.key === button.dataset.tool);
              t.blocks.push({
                id: crypto.randomUUID(),
                type: "builtin",
                key: tool.key,
                name: tool.name,
                span: 4,
                rows: 2,
                ...findFreeSpot(t.blocks, t.cols, 4, 2),
              });
            }),
          )),
    );
    manager.querySelectorAll("[data-photo]").forEach(
      (button) =>
        (button.onclick = () =>
          void perform(async () => {
            const p = store.state.photos.find(
              (p) => p.id === button.dataset.photo,
            );
            const { buildLibraryPlan } = await import("./parser.js");
            await native.executePlan({
              ops: [["rich_line", [{ text: "", style: null, image: p.id }]]],
              warnings: [],
            });
          })),
    );
    manager.querySelectorAll("[data-folder-up]").forEach(
      (button) =>
        (button.onclick = () =>
          void perform(() =>
            store.update((s) => {
              const folders = [...new Set(s.photos.map((p) => p.folder))],
                index = folders.indexOf(button.dataset.folderUp);
              if (index < 1) return;
              [folders[index - 1], folders[index]] = [
                folders[index],
                folders[index - 1],
              ];
              s.photos.sort(
                (a, b) => folders.indexOf(a.folder) - folders.indexOf(b.folder),
              );
            }),
          )),
    );
    manager.querySelectorAll("[data-folder-delete]").forEach(
      (button) =>
        (button.onclick = () =>
          void perform(() =>
            store.update((s) => {
              s.photos = s.photos.filter(
                (p) => p.folder !== button.dataset.folderDelete,
              );
            }),
          )),
    );
    manager.querySelectorAll("[data-photo-size]").forEach(
      (button) =>
        (button.onclick = () => {
          const photo = store.state.photos.find(
            (p) => p.id === button.dataset.photoSize,
          );
          dialog(
            "그림 삽입 크기",
            field(
              "너비 (mm)",
              "width",
              Math.round(
                (photo.widthMm ||
                  photo.physicalSize?.widthMm ||
                  (photo.width * 25.4) / 96) * 10,
              ) / 10,
              "number",
            ),
            {
              submit: (box) =>
                store.update((s) => {
                  const width = Number(
                    box.querySelector('[name="width"]').value,
                  );
                  if (width <= 0 || width > 180)
                    throw new Error("너비는 0~180 mm 범위로 입력해주세요.");
                  s.photos.find((p) => p.id === photo.id).widthMm = width;
                }),
            },
          );
        }),
    );
    manager.querySelectorAll("[data-photo-delete]").forEach(
      (button) =>
        (button.onclick = () =>
          void perform(() =>
            store.update((s) => {
              s.photos = s.photos.filter(
                (p) => p.id !== button.dataset.photoDelete,
              );
            }),
          )),
    );
    manager.ondragstart = (e) => {
      const item = e.target.closest("[data-item]"),
        tool = e.target.closest("[data-tool]");
      if (item)
        dragging = { category: item.dataset.category, ref: item.dataset.item };
      else if (tool) dragging = { tool: tool.dataset.tool };
      if (dragging) e.dataTransfer.setData("text/plain", "5e-palette");
    };
  }
  async function photos(directory) {
    const files = await filePicker({
      accept: "image/*",
      multiple: true,
      directory,
    });
    if (!files.length) return;
    const records = [],
      assets = {};
    for (const file of files) {
      if (
        file.webkitRelativePath &&
        file.webkitRelativePath.split("/").length > 2
      )
        continue;
      if (!/\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name)) continue;
      if (file.size > 32 * 1024 * 1024)
        throw new Error(`${file.name}: 그림 파일은 32 MB 이하여야 합니다.`);
      const bitmap = await createImageBitmap(file);
      const asset = crypto.randomUUID(),
        bytes = new Uint8Array(await file.arrayBuffer());
      assets[asset] = bytesToBase64(bytes);
      records.push({
        id: crypto.randomUUID(),
        asset,
        label: file.name.replace(/\.[^.]+$/, ""),
        folder: file.webkitRelativePath?.split("/")[0] || "",
        extension: file.name.split(".").pop().toLowerCase(),
        width: bitmap.width,
        height: bitmap.height,
        physicalSize: physicalImageSize(bytes, bitmap.width, bitmap.height),
      });
      bitmap.close();
    }
    await store.update((s) => {
      for (const r of records) {
        const old = s.photos.findIndex(
          (p) => p.label === r.label && p.folder === r.folder,
        );
        if (old >= 0) s.photos[old] = r;
        else s.photos.push(r);
      }
      Object.assign(s.assets, assets);
    });
    services.notify(`${records.length}개 그림을 연결했습니다.`);
  }
  async function importChipFlow() {
    const [file] = await filePicker({ accept: ".hwpal,.hwpc,.zip" });
    if (!file) return;
    const chip = readChip(new Uint8Array(await file.arrayBuffer())),
      preview = installChip(store.state, chip);
    dialog(
      "물감 칩 가져오기",
      `<h3>${safe(chip.manifest.name || file.name)}</h3><p>${safe(chip.manifest.note || "")}</p><p>${preview.report.added}개 추가 · ${preview.report.reused}개 기존 물감 재사용${chip.tab ? " · 팔레트 포함" : ""}</p><ul>${chip.items.map((i) => `<li>${safe(i.category)} · ${safe(i.name)}</li>`).join("")}</ul>${preview.report.renamed.length ? "<p>겹치는 이름과 라벨에는 번호를 붙입니다.</p>" : ""}${preview.report.lost ? `<p>${preview.report.lost}개 연결이 빠져 있습니다. 원본 칩의 조각 파일을 확인해주세요.</p>` : ""}`,
      {
        label: "등록",
        submit: () => store.commit(installChip(store.state, chip).state),
      },
    );
  }
  async function importLegacy() {
    const files = await filePicker({
      accept: ".json,.hwp,.hwpx,.zip",
      multiple: true,
    });
    if (!files.length) return;
    const jsons = [],
      assets = {};
    for (const file of files) {
      if (/\.json$/i.test(file.name))
        jsons.push([file.name, JSON.parse(await file.text())]);
      else if (/\.zip$/i.test(file.name)) {
        for (const [path, bytes] of Object.entries(
          unzipPalette(new Uint8Array(await file.arrayBuffer())),
        )) {
          const name = path.split("/").at(-1);
          if (/\.json$/i.test(name))
            jsons.push([name, JSON.parse(new TextDecoder().decode(bytes))]);
          else if (/\.(hwp|hwpx)$/i.test(name)) assets[name] = bytes;
        }
      } else assets[file.name] = new Uint8Array(await file.arrayBuffer());
    }
    const modern = jsons.find(([, data]) => data.format === "5e-hwp-palette");
    if (modern) {
      await store.commit(modern[1]);
      return;
    }
    const config = jsons.find(
        ([name, data]) => name === "config.json" || data.palette_tabs,
      )?.[1],
      library = jsons.find(
        ([name, data]) =>
          name === "library.json" ||
          CATEGORIES.some((c) => Array.isArray(data[c])),
      )?.[1];
    if (!config && !library)
      throw new Error(
        "config.json 또는 library.json과 조각 파일을 함께 선택해주세요.",
      );
    await store.commit(mergeLegacyFiles(store.state, config, library, assets));
  }
  async function promptCopy(item) {
    let structure = item.preview;
    if (!structure && !item.mix)
      structure = (await native.inspectFile(await itemBytes(store.state, item)))
        .preview;
    let n = 0;
    const marked = (structure || item.slot_names?.join("\n") || "").replace(
      /\\([0-9A-Za-z가-힣_]{1,20})?\\|\\/g,
      (match, name) =>
        name === "본문"
          ? "〔여기부터 본문〕"
          : `【빈칸${++n}${name ? ":" + name : ""}】`,
    );
    const text = `다음은 한글 문서 양식 '${item.name}'의 참고 구조입니다. 표·병합·글자 모양은 원본 양식으로 출력됩니다.\n${marked}\n빈칸은 ${item.slot_count || 0}개입니다. 첫 줄은 \\${item.label}\\, 다음 줄부터 빈칸 순서대로 한 줄에 하나씩 답하세요. 여러 줄은 { }로 묶고 비울 칸에는 -만 씁니다. 설명·인사말은 넣지 마세요.`;
    await navigator.clipboard.writeText(text);
    services.notify("AI 프롬프트를 복사했습니다.");
  }
  async function mix(item, edit = false) {
    const items = store.state.library["템플릿"].filter((i) => !i.mix),
      refs = edit ? [...item.mix] : item ? [item.id] : [];
    const box = dialog(
      edit ? "꾸러미 수정" : "템플릿 꾸러미",
      `${field("꾸러미 이름", "name", edit ? item.name : item ? item.name + " 꾸러미" : "")}${field("마크다운 라벨", "label", edit ? item.label : "")}<p>조각을 고른 순서대로 이어 붙입니다. 위·아래 버튼으로 순서를 바꿀 수 있습니다.</p><div data-mix-members></div><div class="palette-mix-list">${items.map((i) => `<label><input type="checkbox" data-mix-ref="${safe(i.id)}" ${refs.includes(i.id) ? "checked" : ""}>${safe(i.name)} · ${i.slot_count || 0}칸</label>`).join("")}</div>`,
      {
        submit: async (box) => {
          const name = box.querySelector('[name="name"]').value.trim(),
            label = labelOf(box.querySelector('[name="label"]').value || name);
          if (!refs.length || !name || !label)
            throw new Error("이름과 조각을 선택해주세요.");
          const members = refs.map((ref) => items.find((i) => i.id === ref));
          await store.update((s) => {
            if (
              CATEGORIES.flatMap((c) => s.library[c]).some(
                (i) => i.label === label && (!edit || i.id !== item.id),
              )
            )
              throw new Error("이미 사용 중인 라벨입니다.");
            const next = {
              ...clone(edit ? item : {}),
              id: edit ? item.id : crypto.randomUUID(),
              name,
              label,
              mix: [...refs],
              slot_count: members.reduce(
                (sum, it) => sum + (+it.slot_count || 0),
                0,
              ),
              slot_names: members.flatMap((it) => it.slot_names || []),
              tags: item?.tags || [],
              subcat: item?.subcat || subcat,
            };
            if (edit)
              s.library["템플릿"][
                s.library["템플릿"].findIndex((i) => i.id === item.id)
              ] = next;
            else s.library["템플릿"].push(next);
          });
        },
      },
    );
    function draw() {
      const area = box.querySelector("[data-mix-members]");
      area.innerHTML = refs
        .map(
          (id, index) =>
            `<div>${index + 1}. ${safe(items.find((i) => i.id === id)?.name)} <button type="button" data-mix-up="${index}" ${index ? "" : "disabled"}>위로</button><button type="button" data-mix-down="${index}" ${index < refs.length - 1 ? "" : "disabled"}>아래로</button></div>`,
        )
        .join("");
      area.onclick = (e) => {
        const button = e.target.closest("button");
        if (!button) return;
        const from = Number(button.dataset.mixUp ?? button.dataset.mixDown),
          to = from + (button.dataset.mixUp !== undefined ? -1 : 1);
        [refs[from], refs[to]] = [refs[to], refs[from]];
        draw();
      };
    }
    box.querySelectorAll("[data-mix-ref]").forEach(
      (check) =>
        (check.onchange = () => {
          const index = refs.indexOf(check.dataset.mixRef);
          if (check.checked && index < 0) refs.push(check.dataset.mixRef);
          else if (!check.checked && index >= 0) refs.splice(index, 1);
          draw();
        }),
    );
    draw();
  }
  let decomposition = [],
    decomposeContext = null;
  function decomposeMarkup() {
    if (
      !decomposeContext ||
      decomposeContext.revision !== native.bridge().revision ||
      decomposeContext.generation !== native.bridge().generation
    ) {
      decomposition = native.scanDocument();
      decomposeContext = native.capture();
    }
    return `<div class="palette-decompose-pane"><p class="palette-description">표 안 문단은 표에 포함됩니다. 문서에서 빈칸을 넣은 뒤 조각을 저장하면 문항 틀로 다시 사용할 수 있습니다.</p><div class="palette-choice-list">${htmlButton("다시 훑기", "scan")}${htmlButton("커서에 빈칸 넣기", "slot")}${htmlButton("고른 조각 각각 담기", "take-each")}${htmlButton("잇닿은 조각 묶어 담기", "take-bundle")}</div>${field("저장할 하위 분류", "decompose-subcat", subcat)}<div class="palette-decompose-list">${decomposition.map((p, i) => `<label><input type="checkbox" data-piece="${i}"><button type="button" data-piece-focus="${i}">${p.kind} · ${safe(p.preview)}</button></label>`).join("")}</div></div>`;
  }
  async function takePieces(bundle) {
    native.assertContext(decomposeContext);
    const indices = [...manager.querySelectorAll("[data-piece]:checked")].map(
      (input) => +input.dataset.piece,
    );
    if (!indices.length) throw new Error("저장할 조각을 고르세요.");
    const groups = [];
    for (const index of indices) {
      const last = groups.at(-1);
      if (
        bundle &&
        last &&
        index === last.at(-1) + 1 &&
        decomposition[index].position.sectionIndex ===
          decomposition[last[0]].position.sectionIndex
      )
        last.push(index);
      else groups.push([index]);
    }
    if (bundle && groups.every((g) => g.length < 2))
      throw new Error("잇닿은 조각을 두 개 이상 고르세요.");
    const category = manager
        .querySelector('[name="decompose-subcat"]')
        .value.trim(),
      captured = [];
    for (const group of groups) {
      const first = decomposition[group[0]],
        last = decomposition[group.at(-1)],
        start = clone(first.position),
        end = { ...clone(last.position), charOffset: last.length },
        info = await native.captureTemplate({
          ...decomposeContext,
          position: start,
          selection: { start, end },
        });
      captured.push({
        info,
        name: first.preview.slice(0, 24) + (group.length > 1 ? " 묶음" : ""),
      });
    }
    await store.update((s) => {
      for (const { info, name } of captured) {
        const finalName = unique(
            name,
            new Set(s.library["템플릿"].map((i) => i.name)),
          ),
          asset = crypto.randomUUID(),
          id = crypto.randomUUID();
        s.assets[asset] = bytesToBase64(info.bytes);
        s.library["템플릿"].push({
          id,
          asset,
          name: finalName,
          label: unique(
            labelOf(finalName),
            new Set([...libraryLookup(s).keys()]),
            false,
          ),
          file: "capture.hwpx",
          slot_count: info.slot_count,
          slot_names: info.slot_names,
          preview: info.preview,
          tags: [],
          subcat: category,
        });
      }
    });
    services.notify(`${captured.length}개 조각을 물감 창고에 담았습니다.`);
  }
  function organize() {
    const cat = managerCategory;
    dialog(
      "하위 분류·태그 정리",
      `<p>현재 물감 종류에 속한 항목을 함께 수정합니다. 비워 두면 이름표를 지웁니다.</p>${field("바꿀 하위 분류", "old-subcat", subcat)}${field("새 하위 분류", "new-subcat", subcat)}${field("바꿀 태그", "old-tag")}${field("새 태그", "new-tag")}`,
      {
        submit: (box) =>
          store.update((s) => {
            const oldCategory = box
                .querySelector('[name="old-subcat"]')
                .value.trim(),
              newCategory = box
                .querySelector('[name="new-subcat"]')
                .value.trim(),
              oldTag = box
                .querySelector('[name="old-tag"]')
                .value.trim()
                .replace(/^#/, ""),
              newTag = box
                .querySelector('[name="new-tag"]')
                .value.trim()
                .replace(/^#/, "");
            for (const item of s.library[cat]) {
              if (oldCategory && item.subcat === oldCategory)
                item.subcat = newCategory;
              if (oldTag)
                item.tags = [
                  ...new Set(
                    item.tags.flatMap((t) =>
                      t === oldTag ? (newTag ? [newTag] : []) : [t],
                    ),
                  ),
                ];
            }
            subcat = newCategory;
          }),
      },
    );
  }
  function editProfile() {
    const config = store.state.config,
      name = config.active_profile,
      spec = config.profiles[name];
    dialog(
      "조판 설정 수정",
      `${field("프리셋 이름", "name", name)}${Object.entries(spec)
        .map(
          ([group, values]) =>
            `<fieldset><legend>${safe(PROFILE_LABELS[group] || group)}</legend>${
              typeof values === "object"
                ? Object.entries(values)
                    .map(([key, value]) =>
                      typeof value === "boolean"
                        ? `<label class="palette-check"><input type="checkbox" data-profile-key="${group}.${key}" ${value ? "checked" : ""}>${safe(PROFILE_LABELS[key] || key)}</label>`
                        : field(
                            PROFILE_LABELS[key] || key,
                            `${group}.${key}`,
                            profileDisplay(key, value),
                            typeof value === "number" ? "number" : "text",
                          ),
                    )
                    .join("")
                : group === "exam_image_style"
                  ? `<label class="palette-field"><span>삽입 그림 스타일</span><select name="exam_image_style">${Object.entries(
                      IMAGE_STYLES,
                    )
                      .map(
                        ([key, label]) =>
                          `<option value="${key}" ${key === values ? "selected" : ""}>${label}</option>`,
                      )
                      .join("")}</select></label>`
                  : field(PROFILE_LABELS[group] || group, group, values)
            }</fieldset>`,
        )
        .join("")}`,
      {
        wide: true,
        submit: async (box) =>
          store.update((s) => {
            const next = clone(spec),
              newName = box.querySelector('[name="name"]').value.trim();
            if (!newName) throw new Error("프리셋 이름을 입력해주세요.");
            for (const input of box.querySelectorAll(
              '[name]:not([name="name"]),[data-profile-key]',
            )) {
              const keys = (input.dataset.profileKey || input.name).split("."),
                parent = keys.length === 2 ? next[keys[0]] : next,
                key = keys.at(-1);
              parent[key] =
                input.type === "checkbox"
                  ? input.checked
                  : input.type === "number"
                    ? Number(input.value) *
                      (["indentation", "prev_spacing", "next_spacing"].includes(
                        key,
                      )
                        ? 100
                        : 1)
                    : input.value;
            }
            if (newName !== name && s.config.profiles[newName])
              throw new Error("같은 이름의 프리셋이 있습니다.");
            delete s.config.profiles[name];
            s.config.profiles[newName] = next;
            s.config.active_profile = newName;
          }),
      },
    );
  }
  async function editContent(item) {
    const context = native.capture(),
      bytes = await itemBytes(store.state, item);
    const restore = await services.beginContentEdit(bytes, item.name);
    restoreContent = restore;
    closeManager();
    const bar = document.createElement("div");
    bar.className = "palette-content-edit";
    bar.innerHTML = `<strong>${safe(item.name)} · 조각 편집</strong>${htmlButton("수정 저장하고 돌아가기", "content-save")}${htmlButton("돌아가기", "content-cancel")}`;
    panel.append(bar);
    bar.querySelector('[data-palette-action="content-save"]').onclick = () =>
      void perform(async () => {
        const bytes = new Uint8Array(await services.getBridge().exportHwpx()),
          info = await native.inspectFile(bytes);
        await store.update((s) => {
          const cat = CATEGORIES.find((c) =>
              s.library[c].some((i) => i.id === item.id),
            ),
            next = s.library[cat].find((i) => i.id === item.id);
          next.asset = crypto.randomUUID();
          s.assets[next.asset] = bytesToBase64(bytes);
          delete next.assetUrl;
          Object.assign(next, info);
          next.file = "edited.hwpx";
        });
        await restore();
        bar.remove();
        restoreContent = null;
        openManager(
          CATEGORIES.find((c) =>
            store.state.library[c].some((i) => i.id === item.id),
          ) || "템플릿",
        );
      });
    bar.querySelector('[data-palette-action="content-cancel"]').onclick = () =>
      void perform(async () => {
        await restore();
        bar.remove();
        restoreContent = null;
        openManager("템플릿");
      });
  }
  function openExcel() {
    const lookup = libraryLookup(store.state),
      styles = excelStyles(store.state),
      templates = [...lookup].filter(
        ([, e]) => e[0] === "템플릿" && e[1].slot_count > 0,
      );
    const context = native.capture();
    let result = null,
      blocks = [];
    const box = dialog(
      "문항 엑셀",
      `<p class="palette-description">가로 문항 표와 기존 덩어리 XLSM을 읽습니다. 정답표를 확인한 뒤 시험지로 변환하세요.</p>${Object.entries(
        styles,
      )
        .map(
          ([q, names]) =>
            `<label class="palette-field"><span>${safe(q)} 출력 스타일</span><select data-excel-style="${q}">${names.map((n) => `<option>${safe(n)}</option>`).join("")}</select></label>`,
        )
        .join(
          "",
        )}<div class="palette-choice-list">${htmlButton("가로 문항 XLSX 내려받기", "excel-template")}${htmlButton("기존 덩어리 XLSM 내려받기", "excel-macro")}${htmlButton("작성한 엑셀 불러오기", "excel-import")}</div><label class="palette-field"><span>덩어리 템플릿</span><select data-excel-pack>${templates.map(([l, [, i]]) => `<option value="${safe(l)}">${safe(i.name)}</option>`).join("")}</select></label>${htmlButton("덩어리 추가", "excel-block-add")}<div data-excel-blocks></div><div class="palette-choice-list">${htmlButton("덩어리 XLSX 저장", "excel-block-save")}${htmlButton("마크다운 복사", "excel-copy")}${htmlButton("정답표 내려받기", "excel-answers")}</div><pre data-excel-report></pre>${textField("시험지 마크다운", "markdown")}`,
      {
        wide: true,
        label: "시험지에 변환",
        submit: (box) =>
          services.withBusy(() =>
            native.convert(
              box.querySelector('[name="markdown"]').value,
              context,
            ),
          ),
      },
    );
    box.querySelector('[data-palette-action="excel-template"]').onclick = () =>
      download(
        buildQuestionWorkbook(
          store.state,
          Object.fromEntries(
            [...box.querySelectorAll("[data-excel-style]")].map((input) => [
              input.dataset.excelStyle,
              input.value,
            ]),
          ),
        ),
        "문항작성양식.xlsx",
      );
    box.querySelector('[data-palette-action="excel-macro"]').onclick = () =>
      void perform(async () => {
        const bytes = new Uint8Array(
          await (
            await fetch(
              new URL(
                "../../assets/hwp-palette/excel_block_template.xlsm",
                import.meta.url,
              ),
            )
          ).arrayBuffer(),
        );
        download(buildMacroWorkbook(bytes, store.state), "문항덩어리양식.xlsm");
      });
    box.querySelector('[data-palette-action="excel-import"]').onclick = () =>
      void perform(async () => {
        const [file] = await filePicker({ accept: ".xlsx,.xlsm" });
        if (!file) return;
        result = workbookToMarkdown(
          new Uint8Array(await file.arrayBuffer()),
          store.state,
        );
        box.querySelector("[data-excel-report]").textContent =
          result.report.join("\n");
        box.querySelector('[name="markdown"]').value = result.markdown;
      });
    box.querySelector('[data-palette-action="excel-block-add"]').onclick =
      () => {
        const label = box.querySelector("[data-excel-pack]").value,
          item = lookup.get(label)?.[1];
        if (!item) return;
        blocks = readBlocks();
        blocks.push([
          label,
          (slotNamesFor(label, item).length
            ? slotNamesFor(label, item)
            : Array.from({ length: item.slot_count }, (_, i) => `빈칸 ${i + 1}`)
          ).map((n) => [n, ""]),
        ]);
        const area = box.querySelector("[data-excel-blocks]");
        area.innerHTML = blocks
          .map(
            ([l, slots], i) =>
              `<fieldset><legend>${safe(l)}</legend>${slots.map(([n, v], j) => textField(n || `빈칸 ${j + 1}`, `block-${i}-${j}`, v)).join("")}</fieldset>`,
          )
          .join("");
        updateBlocks();
      };
    const updateBlocks = () => {
      result = blocksToMarkdown(readBlocks());
      box.querySelector('[name="markdown"]').value = result.markdown;
      box.querySelector("[data-excel-report]").textContent =
        result.report.join("\n");
    };
    box.querySelector("[data-excel-blocks]").oninput = updateBlocks;
    const readBlocks = () =>
      blocks.map(([l, slots], i) => [
        l,
        slots.map(([n], j) => [
          n,
          box.querySelector(`[name="block-${i}-${j}"]`).value,
        ]),
      ]);
    box.querySelector('[data-palette-action="excel-block-save"]').onclick =
      () =>
        download(
          buildWorkbook(new Map([["시험지", blockRows(readBlocks())]])),
          "문항덩어리.xlsx",
        );
    box.querySelector('[data-palette-action="excel-copy"]').onclick = () =>
      void navigator.clipboard.writeText(
        box.querySelector('[name="markdown"]').value,
      );
    box.querySelector('[data-palette-action="excel-answers"]').onclick = () => {
      if (!result) throw new Error("작성한 엑셀을 먼저 불러오세요.");
      download(
        new Blob([answerText(result.answers)], {
          type: "text/tab-separated-values;charset=utf-8",
        }),
        "정답표.tsv",
      );
    };
  }
  function help() {
    dialog(
      "조판 팔레트 사용법",
      `<ol><li>시험지에 마크다운을 입력하고 선택한 뒤 <strong>마크다운 변환</strong>을 누르세요. Ctrl+Alt+T도 사용할 수 있습니다.</li><li>발문:, 자료:, 사진자료:, 실험자료:, 질문:, 보기:, 선지1:·선지3:·선지5: 문법을 지원합니다. 보기는 입력한 순서를 유지합니다.</li><li>등록한 물감은 <code>\\라벨\\</code>로 부릅니다. 템플릿 아래에는 빈칸 순서대로 내용을 씁니다. 비울 칸은 -, 여러 줄은 { }로 묶습니다.</li><li><code>\\굵게{내용}</code>, <code>\\크기15{내용}</code>, <code>\\색빨강{내용}</code>, <code>\\수식{c = Q over {m Δ T}}</code>처럼 서식·수식을 섞을 수 있습니다.</li><li><code>\\표3*3\\</code> 뒤에는 한 줄에 한 행, &amp;로 셀을 나눕니다. 글자 &amp;는 &amp;&amp;로 씁니다.</li><li>물감 설정에서 조각을 캡처하고, 서식·문구·양식·사진을 등록하세요. 블럭을 끌어서 배치하고 우클릭으로 크기와 색을 바꿉니다.</li><li>겹치기는 그중 하나를 고르고, 꾸러미는 여러 템플릿을 이어 붙입니다.</li><li>문서 실행 취소는 한글 편집기의 Ctrl+Z 또는 Ctrl+Alt+Z입니다. 팔레트 설정의 실행 취소는 설정 되돌리기로 구분합니다.</li><li>Ctrl+1~9로 현재 팔레트 블럭을 순서대로 실행합니다. Ctrl+F는 물감 찾기, Ctrl++는 팔레트 설정입니다. Esc로 열린 입력창을 닫습니다.</li><li>한글과의 도킹은 이 작업 공간의 팔레트가 대신합니다. 외부 한글 프로그램을 연결하지 않아도 됩니다.</li></ol><p>그림은 5E에서 삽입하고 문서에서 더블클릭하여 편집할 수 있습니다. 기존 .hwpal 칩과 config.json·library.json·조각 파일도 가져올 수 있습니다.</p>`,
      { wide: true },
    );
  }
  async function dispatch(action, target) {
    const pair = managerItems().find(([, i]) => i.id === selectedItem);
    const map = {
      "document-undo": () => native.bridge().input.performUndo(),
      "document-redo": () => native.bridge().input.performRedo(),
      organize,
      scan: () => {
        decomposeContext = null;
        renderManager();
      },
      slot: async () => {
        await native.insertChar("\\\\");
        decomposeContext = null;
        renderManager();
      },
      "take-each": () => takePieces(false),
      "take-bundle": () => takePieces(true),
      manager: () => openManager(),
      search: () => {
        openManager("전체");
        manager.querySelector("[data-palette-search]").focus();
      },
      help,
      markdown: () => openMarkdown(),
      number,
      "manager-close": closeManager,
      "new-tab": () => tabSettings(true),
      "tab-settings": () => tabSettings(),
      "settings-undo": () => store.undoChange(),
      "settings-redo": () => store.redoChange(),
      "chip-import": importChipFlow,
      "chip-export": async () =>
        download(
          await exportChip(store.state, { tab: getTab() }),
          getTab().name + ".hwpal",
        ),
      "legacy-import": importLegacy,
      backup: () =>
        download(
          new Blob([JSON.stringify(store.state, null, 2)], {
            type: "application/json",
          }),
          "5E-팔레트설정.json",
        ),
      recover: () => store.recover(),
      category: () => {
        managerCategory = target.dataset.category;
        subcat = "";
        selectedItem = null;
        renderManager();
      },
      "item-add": () => editItem(managerCategory),
      "item-block": () => pair && addBlock(...pair),
      "item-use": () => pair && execute(toBlock(...pair)),
      "item-edit": () =>
        pair && (pair[1].mix ? mix(pair[1], true) : editItem(...pair)),
      "item-content": () => pair && editContent(pair[1]),
      mix: () => mix(pair?.[1]),
      prompt: () => pair && promptCopy(pair[1]),
      "item-export": async () =>
        pair &&
        download(
          await exportChip(store.state, { items: [pair], name: pair[1].name }),
          pair[1].name + ".hwpal",
        ),
      "item-delete": () =>
        pair && store.update((s) => removeItem(s, pair[0], pair[1].id)),
      "photo-folder": () => photos(true),
      "photo-files": () => photos(false),
      "symbols-more": () => {
        symbolLimit += 80;
        renderManager();
      },
      "profile-delete": () =>
        store.update((s) => {
          const names = Object.keys(s.config.profiles);
          if (names.length < 2)
            throw new Error("마지막 조판 설정은 삭제할 수 없습니다.");
          delete s.config.profiles[s.config.active_profile];
          s.config.active_profile = names.find((n) => s.config.profiles[n]);
        }),
      "profile-edit": editProfile,
      "profile-copy": () =>
        store.update((s) => {
          const name = unique(
            s.config.active_profile,
            new Set(Object.keys(s.config.profiles)),
          );
          s.config.profiles[name] = clone(
            s.config.profiles[s.config.active_profile],
          );
          s.config.active_profile = name;
        }),
      "profile-export": () =>
        download(
          new Blob(
            [
              JSON.stringify(
                {
                  exam_scribe_profile: store.state.config.active_profile,
                  spec: store.state.config.profiles[
                    store.state.config.active_profile
                  ],
                },
                null,
                2,
              ),
            ],
            { type: "application/json" },
          ),
          store.state.config.active_profile + ".json",
        ),
      "profile-import": async () => {
        const [file] = await filePicker({ accept: ".json" });
        if (file)
          await store.commit(
            importProfile(store.state, JSON.parse(await file.text())),
          );
      },
    };
    if (map[action]) await map[action]();
    else if (action === "common") {
      const b = store.state.config.palette_tabs
        .find((t) => t.name === "메인")
        .blocks.find((b) => b.id === target.dataset.common);
      await execute(b);
    }
  }
  mount.addEventListener("change", (e) => {
    if (e.target.matches("[data-palette-tab]")) {
      activeTab = e.target.value;
      render();
    }
  });
  panel.addEventListener("click", (e) => {
    const target = e.target.closest("[data-palette-action]");
    if (target && target.closest("#exam-palette,#palette-manager"))
      void perform(() => dispatch(target.dataset.paletteAction, target));
  });
  mount.addEventListener("click", (e) => {
    const button = e.target.closest("[data-block]");
    if (button) {
      if (e.target.closest(".palette-resize")) return;
      const b = getTab().blocks.find((b) => b.id === button.dataset.block);
      void perform(() => execute(b));
    }
  });
  mount.addEventListener("contextmenu", (e) => {
    const button = e.target.closest("[data-block]");
    if (button) {
      e.preventDefault();
      editBlock(getTab().blocks.find((b) => b.id === button.dataset.block));
    } else if (e.target.closest("[data-grid]")) {
      e.preventDefault();
      const box = dialog(
        "새 물감 블럭",
        '<label class="palette-field"><span>종류</span><select name="kind"><option value="문자">문자·문구</option><option value="서식">서식 조합</option><option value="템플릿">템플릿</option><option value="양식">양식</option></select></label>',
        {
          label: "등록하기",
          submit: (box) => editItem(box.querySelector('[name="kind"]').value),
        },
      );
    }
  });
  mount.addEventListener("dragstart", (e) => {
    const button = e.target.closest("[data-block]");
    if (button) {
      dragging = { block: button.dataset.block, tab: getTab().name };
      e.dataTransfer.setData("text/plain", "5e-palette");
    }
  });
  mount.addEventListener("dragover", (e) => {
    if (dragging) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  });
  mount.addEventListener("drop", (e) => {
    if (!dragging) return;
    e.preventDefault();
    const grid = mount.querySelector("[data-grid]"),
      rect = grid.getBoundingClientRect(),
      tab = getTab(),
      size = rect.width / tab.cols,
      pos = {
        col: Math.max(
          0,
          Math.min(tab.cols - 1, Math.floor((e.clientX - rect.left) / size)),
        ),
        row: Math.max(0, Math.floor((e.clientY - rect.top) / size)),
      },
      drop = e.target.closest("[data-block]")?.dataset.block,
      source = dragging;
    dragging = null;
    void perform(() =>
      store.update((s) => {
        const tab = s.config.palette_tabs.find((t) => t.name === activeTab);
        let b;
        if (source.block) {
          const old = s.config.palette_tabs.find((t) => t.name === source.tab);
          b = old.blocks.find((b) => b.id === source.block);
          if (drop === b.id) return;
          old.blocks = old.blocks.filter((x) => x !== b);
        } else if (source.tool) {
          const tool = CATALOG.tools.find((t) => t.key === source.tool);
          b = {
            id: crypto.randomUUID(),
            type: "builtin",
            key: tool.key,
            name: tool.name,
            span: 4,
            rows: 2,
          };
        } else
          b = toBlock(
            source.category,
            s.library[source.category].find((i) => i.id === source.ref),
          );
        const target = tab.blocks.find((b) => b.id === drop);
        if (target) {
          if (target.type === "stack") target.items.push(b);
          else {
            const items = [clone(target), b];
            Object.assign(target, { type: "stack", name: "겹친 물감", items });
            delete target.ref;
          }
        } else {
          b.col = Math.min(pos.col, tab.cols - b.span);
          b.row = pos.row;
          if (
            tab.blocks.some(
              (x) =>
                b.row < x.row + x.rows &&
                b.row + b.rows > x.row &&
                b.col < x.col + x.span &&
                b.col + b.span > x.col,
            )
          )
            Object.assign(
              b,
              findFreeSpot(tab.blocks, tab.cols, b.span, b.rows),
            );
          tab.blocks.push(b);
        }
      }),
    );
  });
  mount.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest(".palette-resize");
    if (!handle) return;
    e.preventDefault();
    e.stopPropagation();
    const button = handle.closest("[data-block]"),
      tab = getTab(),
      block = tab.blocks.find((b) => b.id === button.dataset.block),
      grid = mount.querySelector("[data-grid]"),
      rect = grid.getBoundingClientRect(),
      size = rect.width / tab.cols,
      start = {
        x: e.clientX,
        y: e.clientY,
        span: block.span,
        rows: block.rows,
      };
    handle.setPointerCapture(e.pointerId);
    const up = (event) => {
      handle.removeEventListener("pointerup", up);
      const span = Math.max(
          1,
          Math.min(
            tab.cols - block.col,
            start.span + Math.round((event.clientX - start.x) / size),
          ),
        ),
        rows = Math.max(
          1,
          Math.min(
            16,
            start.rows + Math.round((event.clientY - start.y) / size),
          ),
        );
      void perform(() =>
        store.update((s) => {
          const tab = s.config.palette_tabs.find((t) => t.name === activeTab),
            b = tab.blocks.find((b) => b.id === block.id);
          b.span = span;
          b.rows = rows;
          if (
            tab.blocks.some(
              (x) =>
                x !== b &&
                b.row < x.row + x.rows &&
                b.row + b.rows > x.row &&
                b.col < x.col + x.span &&
                b.col + b.span > x.col,
            )
          )
            Object.assign(b, findFreeSpot(tab.blocks, tab.cols, span, rows, b));
        }),
      );
    };
    handle.addEventListener("pointerup", up);
  });
  function keydown(e) {
    if (panel.hidden || e.isComposing || e.defaultPrevented || e.shiftKey)
      return;
    if (
      e.target.closest?.(".palette-dialog") ||
      (e.target.ownerDocument === document &&
        e.target.closest?.("input,textarea,select") &&
        !e.altKey)
    )
      return;
    const key = /^Key[A-Z]$/.test(e.code)
      ? e.code.slice(3).toLowerCase()
      : e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    if (e.altKey && key === "z") {
      e.preventDefault();
      void perform(() => native.bridge().input.performUndo());
    } else if (key === "t" && !e.metaKey) {
      e.preventDefault();
      void perform(() => execute({ type: "builtin", key: "convert" }));
    } else if (
      key === "f" &&
      (e.altKey || e.target.closest?.("#exam-palette,#palette-manager"))
    ) {
      e.preventDefault();
      openManager("전체");
      manager.querySelector("[data-palette-search]").focus();
    } else if (
      (e.key === "+" || e.key === "=") &&
      e.target.closest?.("#exam-palette,#palette-manager")
    ) {
      e.preventDefault();
      openManager();
    } else if (/^[1-9]$/.test(e.key) && !e.altKey) {
      e.preventDefault();
      const block = [...getTab().blocks].sort(
        (a, b) => a.row - b.row || a.col - b.col,
      )[+e.key - 1];
      if (block) void perform(() => execute(block));
    }
  }
  document.addEventListener("keydown", keydown);
  const ready = store
    .open()
    .then(() => {
      store.subscribe(render);
      render();
    })
    .catch((e) => {
      mount.innerHTML = `<p role="alert">팔레트 설정을 열지 못했습니다. ${safe(e.message)}</p>`;
      services.notify(
        "팔레트 설정을 읽지 못했습니다. 기존 설정을 보존했습니다.",
        true,
      );
    });
  return {
    ready,
    store,
    native,
    openManager,
    async attach() {
      await ready;
      const frame = services.getBridge()?.editor.element;
      if (frame?.contentDocument && frame !== boundFrame) {
        boundFrame = frame;
        frame.contentDocument.addEventListener("keydown", keydown);
      }
    },
    get contentEditing() {
      return !!restoreContent;
    },
    snapshot: () => clone(store.state),
  };
}
