const test = require("node:test");
const assert = require("node:assert/strict");

// PDF.js only needs these browser geometry types while its module initializes;
// text extraction in these tests does not invoke their rendering methods.
globalThis.DOMMatrix ??= class DOMMatrix {};
globalThis.ImageData ??= class ImageData {};
globalThis.Path2D ??= class Path2D {};

function onePagePdf(text) {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Uint8Array.from(Buffer.from(pdf));
}

test("shared PDF engine extracts searchable text page-by-page", async () => {
  const { extractPdfPages, clearPdfDocumentCache } = await import("../js/pdf-document-index.mjs");
  clearPdfDocumentCache();
  const source = {
    id: "fixture", name: "optics.pdf", relativePath: "lesson/optics.pdf",
    size: 1, modifiedAt: 1, read: async () => onePagePdf("Light lens refraction"),
  };
  const pages = await extractPdfPages(source);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].pageNumber, 1);
  assert.match(pages[0].text, /Light lens refraction/);
});

test("shared PDF engine accepts the Node Buffer returned by desktop file reads", async () => {
  const { extractPdfPages, clearPdfDocumentCache } = await import("../js/pdf-document-index.mjs");
  clearPdfDocumentCache();
  const source = {
    id: "desktop-buffer", name: "desktop.pdf", size: 2, modifiedAt: 2,
    read: async () => Buffer.from(onePagePdf("Desktop PDF text")),
  };
  const pages = await extractPdfPages(source);
  assert.match(pages[0].text, /Desktop PDF text/);
});
