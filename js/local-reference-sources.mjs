const IMAGE_PATTERN = /\.(png|jpe?g|webp|gif|bmp|svg)$/i;
const PDF_PATTERN = /\.pdf$/i;

function fileId(file, relativePath) {
  return `web:${relativePath}:${file.size}:${file.lastModified}`;
}

export function sourcesFromWebFiles(files) {
  const images = [];
  const pdfs = [];
  for (const file of Array.from(files || [])) {
    const relativePath = file.webkitRelativePath || file.name;
    if (IMAGE_PATTERN.test(file.name)) {
      images.push({
        id: fileId(file, relativePath), name: file.name, relativePath,
        size: file.size, modifiedAt: file.lastModified, file, kind: "image",
      });
    } else if (PDF_PATTERN.test(file.name)) {
      pdfs.push({
        id: fileId(file, relativePath), name: file.name, relativePath,
        size: file.size, modifiedAt: file.lastModified, file, kind: "pdf",
        read: () => file.arrayBuffer(),
      });
    }
  }
  return { images, pdfs };
}

export function sourcesFromDesktopResult(result, desktop) {
  const pdfs = (result.pdfs || []).map((item) => ({
    ...item,
    id: `desktop:${item.path}`,
    read: () => desktop.readLocalPdf(item.path),
  }));
  return { images: result.items || [], pdfs };
}

export function readWebImage(item) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("이미지 파일을 읽지 못했습니다."));
    reader.readAsDataURL(item.file);
  });
}
