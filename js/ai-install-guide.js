import { showConfirm } from "./ui-dialogs.js?v=1.4.0";

const DESKTOP_RELEASE_URL = "https://github.com/seungyeon980808-pixel/5E/releases/latest";

export function initAiInstallGuide({ openDesktopPanel } = {}) {
  const openButton = document.getElementById("ai-image-install-open");
  if (!openButton) return;

  openButton.addEventListener("click", async () => {
    if (window.fiveEDesktop && typeof openDesktopPanel === "function") {
      openDesktopPanel();
      return;
    }
    const download = await showConfirm(
      "AI 이미지 생성은 Windows용 5E 데스크톱 앱에서 사용할 수 있습니다.\n\nGitHub 릴리스의 Assets에서 최신 설치 파일(.exe)을 내려받아 설치해 주세요.",
      { title: "데스크톱 앱 설치 필요", okText: "설치 파일 받기", cancelText: "나중에" },
    );
    if (download) window.open(DESKTOP_RELEASE_URL, "_blank", "noopener,noreferrer");
  });
}
