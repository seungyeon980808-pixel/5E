function serializeSvg(node) {
  const attributes = Object.fromEntries([...node.attributes].sort(([left], [right]) => left.localeCompare(right)));
  const dataset = Object.fromEntries(Object.entries(node.dataset).sort(([left], [right]) => left.localeCompare(right)));
  return {
    tag: node.tagName,
    attributes,
    dataset,
    text: node._text,
    children: node.children.map(serializeSvg),
  };
}

function svgTokens(node) {
  const tokens = [];
  const visit = (item) => {
    tokens.push(`tag:${item.tag}`);
    for (const [name, value] of Object.entries(item.attributes)) tokens.push(`attr:${name}=${value}`);
    for (const [name, value] of Object.entries(item.dataset)) tokens.push(`data:${name}=${value}`);
    if (item.text) tokens.push(`text:${item.text}`);
    item.children.forEach(visit);
  };
  visit(serializeSvg(node));
  return tokens.sort();
}

module.exports = { svgTokens };
