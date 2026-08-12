export function initAiInstallGuide({ openDesktopPanel } = {}) {
  const openButton = document.getElementById("ai-image-install-open");
  if (!openButton) return;

  openButton.addEventListener("click", () => {
    if (typeof openDesktopPanel === "function") openDesktopPanel();
  });
}
