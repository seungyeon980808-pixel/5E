import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ADMINISTRATIONS = Object.freeze({
  "0601": "june", "0604": "june",
  "0903": "september", "0904": "september", "0906": "september",
  "1113": "csat", "1114": "csat", "1116": "csat",
});
const SUBJECTS = Object.freeze({
  bio1: "생명과학 I", bio2: "생명과학 II",
  che1: "화학 I", che2: "화학 II",
  ear1: "지구과학 I", ear2: "지구과학 II",
  phy1: "물리학 I", phy2: "물리학 II",
});

function argumentsFromProcess() {
  const inputIndex = process.argv.indexOf("--catalog");
  const outputIndex = process.argv.indexOf("--output");
  if (inputIndex < 0 || outputIndex < 0 || !process.argv[inputIndex + 1] || !process.argv[outputIndex + 1]) {
    throw new Error("Usage: create-recent-three-spec.mjs --catalog catalog.jsonl --output spec.json");
  }
  return { catalog: path.resolve(process.argv[inputIndex + 1]), output: path.resolve(process.argv[outputIndex + 1]) };
}

function metadata(row, index) {
  if (!row || typeof row.url !== "string" || typeof row.file !== "string") throw new Error(`Invalid catalog row ${index + 1}`);
  const dateMatch = /\/01exam\/(\d{4})(\d{2})(\d{2})\/go3\//u.exec(row.url);
  const subjectMatch = /\/g_(bio|che|ear|phy)([12])_mun_/u.exec(row.url);
  if (!dateMatch || !subjectMatch) throw new Error(`Unrecognized official URL metadata at row ${index + 1}`);
  const academicYear = Number(dateMatch[1]) + 1;
  const administration = ADMINISTRATIONS[`${dateMatch[2]}${dateMatch[3]}`];
  const subject = `${subjectMatch[1]}${subjectMatch[2]}`;
  if (!administration || !SUBJECTS[subject]) throw new Error(`Unsupported administration or subject at row ${index + 1}`);
  return { academicYear, administration, subject, subjectTitle: SUBJECTS[subject] };
}

async function main() {
  const options = argumentsFromProcess();
  const rows = (await readFile(options.catalog, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  const seen = new Set();
  const documents = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const item = metadata(row, index);
    const id = `${item.academicYear}-${item.administration}-${item.subject}`;
    if (seen.has(id)) throw new Error(`Duplicate corpus slot: ${id}`);
    seen.add(id);
    const source = path.resolve(row.file);
    const magic = (await readFile(source)).subarray(0, 5).toString("ascii");
    if (magic !== "%PDF-") throw new Error(`Source is not a PDF: ${row.file}`);
    documents.push({
      id,
      title: `${item.academicYear}학년도 ${item.administration === "csat" ? "대학수학능력시험" : `${item.administration === "june" ? "6월" : "9월"} 모의평가`} ${item.subjectTitle}`,
      source: path.relative(path.dirname(options.output), source),
      destination: `documents/${id}.pdf`,
      metadata: {
        academicYear: item.academicYear,
        administration: item.administration,
        subject: item.subject,
        sourceUrl: row.url
      },
    });
  }
  const years = [2024, 2025, 2026];
  const subjects = Object.keys(SUBJECTS);
  const administrations = ["june", "september", "csat"];
  const expected = years.flatMap((year) => administrations.flatMap((administration) => subjects.map((subject) => `${year}-${administration}-${subject}`)));
  const missing = expected.filter((id) => !seen.has(id));
  if (rows.length !== expected.length || missing.length) throw new Error(`Corpus is incomplete: ${rows.length}/${expected.length}, missing ${missing.join(", ")}`);
  const spec = {
    id: "ebsi.recent-three.science",
    version: "1.0.0",
    title: "최근 3개 학년도 과학탐구",
    kind: "exam",
    subjects,
    academicYears: years,
    createdAt: "2026-09-10T09:00:00.000Z",
    minAppVersion: "1.5.3",
    documents,
  };
  await writeFile(options.output, `${JSON.stringify(spec, null, 2)}\n`);
  process.stdout.write(`Verified corpus coverage: ${rows.length} PDFs, ${years.length} years, ${subjects.length} subjects, ${administrations.length * years.length} exam dates\n`);
}

await main();
