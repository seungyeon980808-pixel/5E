export const PDF_INDEX_STATE_SCHEMA = "pdf-index-state-v1";
export const PDF_INDEX_STATES = Object.freeze(["reading", "searchable", "needs-ocr", "failed", "excluded"]);

function requiredText(value, field) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${field} must be a non-empty string`);
  return value;
}

function diagnosticRecord(input) {
  if (input == null) return null;
  if (typeof input !== "object" || Array.isArray(input)) throw new TypeError("diagnostic must be an object or null");
  const value = {
    code: requiredText(input.code, "diagnostic.code"),
    message: requiredText(input.message, "diagnostic.message"),
  };
  if (input.stage !== undefined) value.stage = requiredText(input.stage, "diagnostic.stage");
  if (input.recoverable !== undefined) {
    if (typeof input.recoverable !== "boolean") throw new TypeError("diagnostic.recoverable must be a boolean");
    value.recoverable = input.recoverable;
  }
  return Object.freeze(value);
}

export function createPdfIndexState(input) {
  const state = input?.state;
  if (!PDF_INDEX_STATES.includes(state)) throw new TypeError("indexState.state is invalid");
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(updatedAt))) throw new TypeError("indexState.updatedAt must be an ISO date");
  return Object.freeze({
    schemaVersion: PDF_INDEX_STATE_SCHEMA,
    documentId: requiredText(input.documentId, "indexState.documentId"),
    version: requiredText(input.version, "indexState.version"),
    state,
    diagnostic: diagnosticRecord(input.diagnostic),
    updatedAt,
  });
}

export function projectPdfIndexState(document, savedState) {
  if (!document || typeof document.documentId !== "string" || typeof document.version !== "string") {
    throw new TypeError("A personal PDF document projection is required");
  }
  if (savedState?.documentId === document.documentId && savedState?.version === document.version) {
    return createPdfIndexState(savedState);
  }
  return createPdfIndexState({
    documentId: document.documentId,
    version: document.version,
    state: "reading",
    diagnostic: null,
  });
}

export function indexStateLabel(state) {
  return Object.freeze({
    reading: "읽는 중",
    searchable: "검색 가능",
    "needs-ocr": "문자 인식 필요",
    failed: "실패",
    excluded: "검색 제외",
  })[state] ?? "";
}
