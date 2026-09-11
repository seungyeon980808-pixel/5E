export function createPdfLibraryFixture() {
  const stream = [
    "q 0.2 0.4 0.8 rg 92 590 160 80 re f Q",
    "BT /F1 14 Tf 72 730 Td (1.) Tj ET",
    "BT /F1 12 Tf 94 730 Td (Momentum experiment alpha) Tj ET",
    "BT /F1 12 Tf 94 705 Td (blue source region) Tj ET",
    "BT /F1 14 Tf 72 500 Td (2.) Tj ET",
    "BT /F1 12 Tf 94 500 Td (Energy experiment beta) Tj ET",
    "BT /F1 14 Tf 320 730 Td (3.) Tj ET",
    "BT /F1 12 Tf 342 730 Td (Wave experiment gamma) Tj ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${new TextEncoder().encode(stream).byteLength} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n%PDFLIB\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(new TextEncoder().encode(body).byteLength);
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = new TextEncoder().encode(body).byteLength;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

export function createKoreanPdfLibraryFixture() {
  const fontPath = [
    "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
    "C:\\Windows\\Fonts\\malgun.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  ].find(existsSync);
  if (!fontPath) throw new Error("A Korean system font is required for the extraction fixture");
  GlobalFonts.registerFromPath(fontPath, "FixtureHangul");
  const pdf = new PDFDocument({ title: "Korean extraction fixture", creator: "5E test" });
  const context = pdf.beginPage(612, 792);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 612, 792);
  context.fillStyle = "#111111";
  context.font = "16px FixtureHangul";
  context.fillText("1.", 72, 80);
  context.fillText("운동량 보존 실험", 96, 80);
  context.fillText("2.", 72, 360);
  context.fillText("파동의 간섭 실험", 96, 360);
  pdf.endPage();
  return new Uint8Array(pdf.close());
}
import { existsSync } from "node:fs";

import { GlobalFonts, PDFDocument } from "@napi-rs/canvas";
