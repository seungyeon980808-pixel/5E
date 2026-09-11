export function defaultRecentThreePack(location = globalThis.location, deployedBaseUrl = globalThis.FIVE_E_PDF_PACK_BASE_URL) {
  if (typeof deployedBaseUrl === "string" && deployedBaseUrl.trim() !== "") {
    const configured = new URL(deployedBaseUrl, location?.href);
    const explicitAbsolute = /^[a-z][a-z\d+.-]*:/i.test(deployedBaseUrl);
    const loopback = configured.hostname === "127.0.0.1" || configured.hostname === "localhost" || configured.hostname === "::1";
    if (explicitAbsolute && configured.protocol !== "https:" && !(configured.protocol === "http:" && loopback)) {
      throw new TypeError("PDF pack URL must use HTTPS or a relative candidate path.");
    }
    return Object.freeze({ status: "configured", baseUrl: configured.href, message: "" });
  }
  return Object.freeze({
    status: "unconfigured", baseUrl: "",
    message: "기본 최근 3개 학년도 자료팩 주소가 아직 배포 설정되지 않았습니다. 자료팩 폴더를 설치해 사용할 수 있습니다.",
  });
}
