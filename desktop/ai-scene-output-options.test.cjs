const test = require("node:test");
const assert = require("node:assert/strict");

class FakeSvgNode {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = {};
    this.children = [];
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  insertBefore(child, reference) {
    const index = this.children.indexOf(reference);
    this.children.splice(index < 0 ? this.children.length : index, 0, child);
    return child;
  }
}

function serialize(node) {
  const attributes = Object.entries(node.attributes).map(([name, value]) => ` ${name}="${value}"`).join("");
  return `<${node.tagName}${attributes}>${node.children.map(serialize).join("")}</${node.tagName}>`;
}

test("editable SVG previews honor white background and output scale", async () => {
  global.document = { createElementNS: (_namespace, tagName) => new FakeSvgNode(tagName) };
  global.XMLSerializer = class XMLSerializer {
    serializeToString(node) {
      return serialize(node);
    }
  };
  const { fastSceneToSvgDataUrl } = await import("../js/ai-scene-preview.js");

  const data = fastSceneToSvgDataUrl(
    { objects: [], artboard: { w: 100, h: 50 } },
    { backgroundMode: "white", outputScale: 2 },
  );
  const svg = decodeURIComponent(data.split(",")[1]);

  assert.match(svg, /width="1600"/);
  assert.match(svg, /height="800"/);
  assert.match(svg, /<rect[^>]*fill="white"/);
});
