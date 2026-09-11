export const dataKey = name => name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

class ClassList {
  constructor(element) { this.element = element; }
  values() { return this.element._className.split(/\s+/).filter(Boolean); }
  contains(name) { return this.values().includes(name); }
  add(...names) { this.element.className = [...new Set([...this.values(), ...names])].join(' '); }
  remove(...names) { this.element.className = this.values().filter(name => !names.includes(name)).join(' '); }
  toggle(name, force) {
    const enabled = force === undefined ? !this.contains(name) : Boolean(force);
    if (enabled) this.add(name); else this.remove(name);
    return enabled;
  }
}

export function attributeValue(element, name) {
  if (name === 'id') return element.id || null;
  if (name === 'class') return element.className || null;
  if (name === 'open') return element.open ? '' : null;
  if (name.startsWith('data-')) {
    const value = element.dataset[dataKey(name)];
    return value === undefined ? null : value;
  }
  if (name === 'type' && element.type) return element.type;
  return element.attributes.has(name) ? element.attributes.get(name) : null;
}

function matchesSimple(element, selector) {
  const source = selector.trim();
  if (!source || source === '*') return true;
  const tag = source.match(/^[a-zA-Z][\w-]*/)?.[0];
  if (tag && element.localName !== tag.toLowerCase()) return false;
  const id = source.match(/#([\w-]+)/)?.[1];
  if (id && element.id !== id) return false;
  for (const match of source.matchAll(/\.([\w-]+)/g)) {
    if (!element.classList.contains(match[1])) return false;
  }
  for (const match of source.matchAll(/\[([^\]=\s]+)(?:\s*=\s*["']?([^\]"']*)["']?)?\]/g)) {
    const actual = attributeValue(element, match[1]);
    if (actual === null || (match[2] !== undefined && String(actual) !== match[2])) return false;
  }
  return true;
}

export function matchesSelector(element, selector) {
  const parts = selector.trim().split(/\s+/);
  let current = element;
  if (!matchesSimple(current, parts.pop())) return false;
  while (parts.length) {
    const part = parts.pop();
    current = current.parentElement;
    while (current && !matchesSimple(current, part)) current = current.parentElement;
    if (!current) return false;
  }
  return true;
}

export function descendants(root) {
  return root.children.flatMap(child => [child, ...descendants(child)]);
}
