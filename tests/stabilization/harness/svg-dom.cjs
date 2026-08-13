class SvgNode {
  constructor(tagName, namespaceURI = null) {
    this.tagName = tagName;
    this.namespaceURI = namespaceURI;
    this.attributes = new Map();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.parentNode = null;
    this._text = "";
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
  querySelectorAll(selector) {
    const tags = new Set(selector.split(",").map((tag) => tag.trim().toLowerCase()));
    const found = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (tags.has(child.tagName.toLowerCase())) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(""); }
}

class CanvasNode extends SvgNode {
  getContext() {
    return { font: "", measureText: (text) => ({ width: String(text).length * 6 }) };
  }
}

function installSvgDom() {
  const inspectorRoot = new SvgNode("aside");
  const empty = inspectorRoot.appendChild(new SvgNode("div"));
  const content = inspectorRoot.appendChild(new SvgNode("div"));
  empty.parentElement = inspectorRoot;
  content.parentElement = inspectorRoot;
  const elements = new Map([["inspector-empty", empty], ["inspector-content", content]]);
  global.document = {
    createElementNS(namespaceURI, tagName) { return new SvgNode(tagName, namespaceURI); },
    createElement(tagName) { return tagName === "canvas" ? new CanvasNode(tagName) : new SvgNode(tagName); },
    createTextNode(text) { const node = new SvgNode("#text"); node.textContent = text; return node; },
    getElementById(id) { return elements.get(id) || null; },
  };
}

module.exports = { installSvgDom };
