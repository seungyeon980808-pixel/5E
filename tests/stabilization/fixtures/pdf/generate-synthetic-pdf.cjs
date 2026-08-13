const SYNTHETIC_PDF_PROVENANCE = Object.freeze({
  author: "5E project contributors",
  copyrightStatus: "original-synthetic",
  sourceMaterial: "none",
  generatedAt: "test runtime",
});

function createSyntheticPdf() {
  const pageOne = [
    "q 0.85 g 0 0 30 30 re f Q",
    "q 20 0 0 20 378 278 cm /Im1 Do Q",
    "BT /F1 14 Tf 36 250 Td",
    "(Exam Aster Subject Physics Question 7) Tj",
    "0 -22 Td (photon prism photon photon vector raster edge) Tj ET",
  ].join("\n");
  const pageTwo = [
    "BT /F1 14 Tf 36 250 Td",
    "(Exam Aster Subject Physics Question 8) Tj",
    "0 -22 Td (photon prism orbit rotation) Tj ET",
  ].join("\n");
  const pageThree = "q 0.3 w 0 0 m 400 300 l S 0 300 m 400 0 l S Q";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 7 0 R 9 0 R] /Count 3 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] "
      + "/Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(pageOne, "ascii")} >>\nstream\n${pageOne}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB "
      + "/BitsPerComponent 8 /Filter /ASCIIHexDecode /Length 7 >>\nstream\nE6E6E6>\nendstream",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Rotate 90 "
      + "/Resources << /Font << /F1 5 0 R >> >> /Contents 8 0 R >>",
    `<< /Length ${Buffer.byteLength(pageTwo, "ascii")} >>\nstream\n${pageTwo}\nendstream`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Rotate 270 /Contents 10 0 R >>",
    `<< /Length ${Buffer.byteLength(pageThree, "ascii")} >>\nstream\n${pageThree}\nendstream`,
    "<< /Title (Aster Synthetic Field Exam) /Author (5E project contributors) "
      + "/Subject (Physics) /Keywords (exam question photon prism) "
      + "/Creator (5E deterministic fixture generator) /Producer (5E test harness) "
      + "/CreationDate (D:20000101000000Z) /ModDate (D:20000101000000Z) "
      + "/Exam (Aster 2026) /Question (7-8) >>",
  ];
  let body = "%PDF-1.4\n% Synthetic fixture; independently authored by 5E contributors.\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body, "ascii"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "ascii");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 11 0 R >>\n`;
  body += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "ascii");
}

function serializePageObjects(objects) {
  let body = "%PDF-1.4\n% Synthetic fixture; independently authored by 5E contributors.\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body, "ascii"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "ascii");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "ascii");
}

function createLargeSyntheticPdf(pageCount = 48) {
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 200) {
    throw new RangeError("pageCount must be an integer from 1 through 200");
  }
  const fontId = 3 + pageCount * 2;
  const kids = Array.from({ length: pageCount }, (_, index) => `${3 + index * 2} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`,
  ];
  for (let index = 0; index < pageCount; index += 1) {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    const text = `BT /F1 12 Tf 36 250 Td (Large Synthetic Exam Subject Physics Question ${index + 1} marker) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      `<< /Length ${Buffer.byteLength(text, "ascii")} >>\nstream\n${text}\nendstream`,
    );
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  return serializePageObjects(objects);
}

function createTextlessSyntheticPdf(pageCount = 2) {
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 20) {
    throw new RangeError("pageCount must be an integer from 1 through 20");
  }
  const kids = Array.from({ length: pageCount }, (_, index) => `${3 + index * 2} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`,
  ];
  for (let index = 0; index < pageCount; index += 1) {
    const pageId = 3 + index * 2;
    const content = `q 0.4 w 12 ${24 + index} m 388 ${276 - index} l S Q`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Contents ${pageId + 1} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}\nendstream`,
    );
  }
  return serializePageObjects(objects);
}

function createSyntheticPdfSource() {
  const bytes = createSyntheticPdf();
  return {
    id: "synthetic-pdf-fixture",
    name: "별빛-물리-모의시험-07번.pdf",
    relativePath: "synthetic/별빛-물리-모의시험-07번.pdf",
    size: bytes.length,
    modifiedAt: Date.UTC(2000, 0, 1),
    read: async () => Buffer.from(bytes),
  };
}

function createLargeSyntheticPdfSource(pageCount = 48) {
  const bytes = createLargeSyntheticPdf(pageCount);
  return {
    id: `large-synthetic-pdf-${pageCount}`,
    name: "대형-물리-모의시험.pdf",
    relativePath: "synthetic/대형-물리-모의시험.pdf",
    size: bytes.length,
    modifiedAt: Date.UTC(2000, 0, 1),
    read: async () => Buffer.from(bytes),
  };
}

function createTextlessSyntheticPdfSource(pageCount = 2) {
  const bytes = createTextlessSyntheticPdf(pageCount);
  return {
    id: `textless-synthetic-pdf-${pageCount}`,
    name: "스캔-물리-모의시험.pdf",
    relativePath: "synthetic/스캔-물리-모의시험.pdf",
    size: bytes.length,
    modifiedAt: Date.UTC(2000, 0, 1),
    read: async () => Buffer.from(bytes),
  };
}

module.exports = {
  SYNTHETIC_PDF_PROVENANCE,
  createLargeSyntheticPdfSource,
  createSyntheticPdf,
  createSyntheticPdfSource,
  createTextlessSyntheticPdf,
  createTextlessSyntheticPdfSource,
};
