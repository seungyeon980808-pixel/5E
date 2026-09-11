const SUBJECT_ALIASES = Object.freeze({
  p1: "p1", p2: "p2", phy1: "p1", phy2: "p2", physics1: "p1", physics2: "p2",
  c1: "c1", c2: "c2", che1: "c1", che2: "c2", chemistry1: "c1", chemistry2: "c2",
  b1: "b1", b2: "b2", bio1: "b1", bio2: "b2", biology1: "b1", biology2: "b2",
  e1: "e1", e2: "e2", ear1: "e1", ear2: "e2", earth1: "e1", earth2: "e2",
});

const ADMINISTRATION_ALIASES = Object.freeze({
  "06": "06", "6": "06", june: "06", "6월": "06", "6월 모평": "06", "6월 모의평가": "06",
  "09": "09", "9": "09", september: "09", "9월": "09", "9월 모평": "09", "9월 모의평가": "09",
  "11": "11", csat: "11", suneung: "11", "수능": "11", "대학수학능력시험": "11",
});

function canonicalSubject(value) {
  return SUBJECT_ALIASES[String(value ?? "").trim().toLowerCase()] ?? null;
}

function canonicalAdministration(value) {
  return ADMINISTRATION_ALIASES[String(value ?? "").trim().toLowerCase()] ?? null;
}

function codeResult(subject, academicYear, administration, itemNumber) {
  const documentCode = `${subject}${String(academicYear).slice(-2)}${administration}`;
  return Object.freeze({
    subject, academicYear, administration, itemNumber,
    documentCode,
    itemCode: itemNumber === null ? null : `${documentCode}${String(itemNumber).padStart(2, "0")}`,
  });
}

export function parseCompactExamCode(value) {
  const match = /^([pbce][12])(\d{2})(06|09|11)(\d{2})?(?:\.pdf)?$/iu.exec(String(value ?? "").trim());
  if (!match) return null;
  const itemNumber = match[4] === undefined ? null : Number(match[4]);
  if (itemNumber !== null && (itemNumber < 1 || itemNumber > 40)) return null;
  return codeResult(match[1].toLowerCase(), 2000 + Number(match[2]), match[3], itemNumber);
}

export function deriveExamMetadata(input = {}) {
  const sourceFileName = String(input.source?.displayName ?? input.fileName ?? "").split(/[\\/]/u).at(-1) || null;
  const direct = parseCompactExamCode(sourceFileName ?? "");
  if (direct) {
    const { itemNumber: _itemNumber, itemCode: _itemCode, ...documentMetadata } = direct;
    return Object.freeze({ ...documentMetadata, sourceFileName });
  }
  const metadata = input.metadata ?? {};
  const subject = canonicalSubject(metadata.subject ?? input.subject);
  const academicYear = Number(metadata.academicYear ?? input.academicYear ?? input.year);
  const administration = canonicalAdministration(metadata.administration ?? input.administration ?? input.month);
  if (!subject || !Number.isInteger(academicYear) || academicYear < 2000 || academicYear > 2099 || !administration) return null;
  const result = codeResult(subject, academicYear, administration, null);
  return Object.freeze({
    subject: result.subject, academicYear: result.academicYear, administration: result.administration,
    documentCode: result.documentCode, sourceFileName,
  });
}

export function examMetadataMatches(actual, expected) {
  if (!actual || !expected) return false;
  return actual.subject === expected.subject
    && actual.academicYear === expected.academicYear
    && actual.administration === expected.administration;
}
