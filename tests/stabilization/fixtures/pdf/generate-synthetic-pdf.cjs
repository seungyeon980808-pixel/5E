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

function createSyntheticPdfSource() {
  const bytes = createSyntheticPdf();
  return {
    id: "synthetic-pdf-fixture",
    name: "aster-physics-exam-q07.pdf",
    relativePath: "synthetic/aster-physics-exam-q07.pdf",
    size: bytes.length,
    modifiedAt: Date.UTC(2000, 0, 1),
    read: async () => Buffer.from(bytes),
  };
}

module.exports = {
  SYNTHETIC_PDF_PROVENANCE,
  createSyntheticPdf,
  createSyntheticPdfSource,
};
