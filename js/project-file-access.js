import { showConfirm } from "./ui-dialogs.js?v=1.4.0";
import { migrate, serialize } from "./project-format.js?v=1.4.0";

export async function saveProject(state, filename, fileTypes) {
  const json = JSON.stringify(serialize(state.get()), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: filename, types: fileTypes });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function openProject(state, file, applyLoaded) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = migrate(JSON.parse(reader.result));
      if (
        !data ||
        typeof data !== "object" ||
        !Array.isArray(data.pages) ||
        data.pages.length === 0 ||
        !data.pages.every((page) => page && Array.isArray(page.objects))
      ) {
        throw new Error("필요한 데이터(pages) 형식이 올바르지 않습니다.");
      }
      const confirmed = await showConfirm(
        "현재 작업을 이 프로젝트 파일로 대체할까요?\n저장하지 않은 현재 작업은 사라집니다.",
        { title: "프로젝트 열기", okText: "열기", cancelText: "취소" },
      );
      if (!confirmed) return;
      applyLoaded(state, data);
    } catch (error) {
      alert("프로젝트 파일을 열 수 없습니다.\n" + (error && error.message ? error.message : error));
    }
  };
  reader.onerror = () => alert("파일을 읽는 중 오류가 발생했습니다.");
  reader.readAsText(file);
}
