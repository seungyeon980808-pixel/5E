const SVG_NS = "http://www.w3.org/2000/svg";

export function createPointerLoupe(sourceSvg, className = "") {
  const host = document.createElement("div");
  host.className = `pointer-loupe ${className}`.trim();
  host.hidden = true;
  host.setAttribute("aria-hidden", "true");
  const view = document.createElementNS(SVG_NS, "svg");
  view.setAttribute("preserveAspectRatio", "xMidYMid slice");
  host.appendChild(view);
  document.body.appendChild(host);
  return {
    element: host,
    update(clientX, clientY, point) {
      if (!point) return;
      // 장면은 제스처 중 정적이므로 처음 보일 때만 복제한다. 매 mousemove마다 큰 SVG
      // 트리를 복제하면 정밀 도구 자체가 버벅이는 역효과가 난다.
      if (host.hidden) view.replaceChildren(...Array.from(sourceSvg.children).map((node) => node.cloneNode(true)));
      const span = 7;
      view.setAttribute("viewBox", `${point.x - span / 2} ${point.y - span / 2} ${span} ${span}`);
      host.style.left = `${Math.max(8, Math.min(window.innerWidth - 124, clientX + 18))}px`;
      host.style.top = `${Math.max(8, Math.min(window.innerHeight - 124, clientY - 132))}px`;
      host.hidden = false;
    },
    hide() { host.hidden = true; view.replaceChildren(); },
  };
}
