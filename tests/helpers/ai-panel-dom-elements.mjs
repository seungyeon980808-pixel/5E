import { attributeValue, dataKey, descendants, matchesSelector } from './ai-panel-dom-selectors.mjs';

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

export class TestElement {
  constructor(tagName, ownerDocument) {
    this.localName = String(tagName).toLowerCase();
    this.tagName = this.localName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentElement = null;
    this.children = [];
    this.attributes = new Map();
    this.style = {};
    this._className = '';
    this._textContent = '';
    this._value = '';
    this._listeners = new Map();
    this.classList = new ClassList(this);
    this.dataset = new Proxy({}, {
      set: (target, key, value) => {
        target[key] = String(value);
        this.ownerDocument?._notifyChange(this);
        return true;
      },
      deleteProperty: (target, key) => {
        delete target[key];
        this.ownerDocument?._notifyChange(this);
        return true;
      },
    });
  }

  get className() { return this._className; }
  set className(value) { this._className = String(value || ''); this.ownerDocument?._notifyChange(this); }
  get textContent() { return this._textContent + this.children.map(child => child.textContent).join(''); }
  set textContent(value) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this._textContent = String(value ?? '');
    this.ownerDocument?._notifyChange(this);
  }
  get value() { return this._value; }
  set value(value) { this._value = String(value ?? ''); this.ownerDocument?._notifyChange(this); }
  get childNodes() { return this.children; }
  get firstChild() { return this.children[0] || null; }
  get options() { return this.localName === 'select' ? this.children.filter(child => child.localName === 'option') : undefined; }
  get selectedOptions() { return (this.options || []).filter(option => option.value === this.value).slice(0, 1); }
  get isConnected() {
    let current = this;
    while (current) {
      if (current === this.ownerDocument?.body) return true;
      current = current.parentElement;
    }
    return false;
  }
  get innerHTML() { return this._innerHTML || ''; }
  set innerHTML(value) {
    this._innerHTML = String(value || '');
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    const selectMatch = this._innerHTML.match(/<select([^>]*)>([\s\S]*?)<\/select>/i);
    if (!selectMatch) { this.ownerDocument?._notifyChange(this); return; }
    const select = this.ownerDocument.createElement('select');
    for (const attribute of selectMatch[1].matchAll(/([\w-]+)(?:=["']([^"']*)["'])?/g)) {
      select.setAttribute(attribute[1], attribute[2] ?? '');
    }
    for (const optionMatch of selectMatch[2].matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/gi)) {
      const option = this.ownerDocument.createElement('option');
      for (const attribute of optionMatch[1].matchAll(/([\w-]+)(?:=["']([^"']*)["'])?/g)) {
        option.setAttribute(attribute[1], attribute[2] ?? '');
      }
      option.textContent = optionMatch[2];
      select.append(option);
      if (optionMatch[1].includes('selected')) select.value = option.value;
    }
    this.append(select);
  }

  append(...nodes) { for (const node of nodes) this._insert(node, this.children.length); }
  appendChild(node) { this.append(node); return node; }
  prepend(...nodes) { nodes.slice().reverse().forEach(node => this._insert(node, 0)); }
  insertBefore(node, reference) {
    const index = reference ? this.children.indexOf(reference) : this.children.length;
    this._insert(node, index < 0 ? this.children.length : index);
    return node;
  }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...nodes);
    this.ownerDocument?._notifyChange(this);
  }
  before(...nodes) {
    if (!this.parentElement) return;
    let index = this.parentElement.children.indexOf(this);
    for (const node of nodes) this.parentElement._insert(node, index++);
  }
  after(...nodes) {
    if (!this.parentElement) return;
    let index = this.parentElement.children.indexOf(this) + 1;
    for (const node of nodes) this.parentElement._insert(node, index++);
  }
  replaceWith(node) {
    if (!this.parentElement) return;
    const parent = this.parentElement;
    const index = parent.children.indexOf(this);
    this.remove();
    parent._insert(node, index);
  }
  remove() {
    if (!this.parentElement) return;
    const parent = this.parentElement;
    parent.children.splice(parent.children.indexOf(this), 1);
    this.parentElement = null;
    this.ownerDocument?._notifyChange(parent);
  }
  _insert(node, index) {
    if (!(node instanceof TestElement)) throw new TypeError('The test DOM accepts element nodes only.');
    node.remove();
    node.parentElement = this;
    this.children.splice(index, 0, node);
    this.ownerDocument?._notifyAdded(node);
  }

  setAttribute(name, value) {
    const stringValue = String(value ?? '');
    if (name === 'id') this.id = stringValue;
    else if (name === 'class') this.className = stringValue;
    else if (name === 'open') this.open = true;
    else if (name.startsWith('data-')) this.dataset[dataKey(name)] = stringValue;
    else this.attributes.set(name, stringValue);
    this.ownerDocument?._notifyChange(this);
  }
  getAttribute(name) { return attributeValue(this, name); }
  hasAttribute(name) { return attributeValue(this, name) !== null; }
  removeAttribute(name) {
    if (name === 'open') this.open = false;
    else if (name.startsWith('data-')) delete this.dataset[dataKey(name)];
    else this.attributes.delete(name);
    this.ownerDocument?._notifyChange(this);
  }

  querySelectorAll(selector) {
    const selectors = selector.split(',').map(part => part.trim()).filter(Boolean);
    return descendants(this).filter(node => selectors.some(part => matchesSelector(node, part)));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  matches(selector) { return selector.split(',').some(part => matchesSelector(this, part)); }
  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }
  contains(node) {
    for (let current = node; current; current = current.parentElement) if (current === this) return true;
    return false;
  }

  addEventListener(type, listener, options = {}) {
    const listeners = this._listeners.get(type) || [];
    listeners.push({ listener, once: options === true ? false : options?.once === true });
    this._listeners.set(type, listeners);
  }
  removeEventListener(type, listener) {
    this._listeners.set(type, (this._listeners.get(type) || []).filter(entry => entry.listener !== listener));
  }
  dispatchEvent(input) {
    const event = input && typeof input === 'object' && !(input.target)
      ? {
          type: input.type,
          detail: input.detail,
          bubbles: input.bubbles === true,
          target: this,
          currentTarget: this,
          defaultPrevented: false,
          preventDefault() { this.defaultPrevented = true; },
          stopPropagation() { this.cancelBubble = true; },
          stopImmediatePropagation() { this.cancelBubble = true; this.immediatePropagationStopped = true; },
        }
      : input;
    if (!event?.type) throw new TypeError('An event type is required.');
    if (!event.target) event.target = this;
    event.currentTarget = this;
    const propertyHandler = this[`on${event.type}`];
    if (typeof propertyHandler === 'function') propertyHandler.call(this, event);
    for (const entry of [...(this._listeners.get(event.type) || [])]) {
      entry.listener.call(this, event);
      if (entry.once) this.removeEventListener(event.type, entry.listener);
      if (event.immediatePropagationStopped) break;
    }
    if (event.bubbles && !event.cancelBubble) this.parentElement?.dispatchEvent(event);
    return !event.defaultPrevented;
  }
  click() {
    if (this.disabled) return;
    this.dispatchEvent({ type: 'click', bubbles: true, target: this, shiftKey: false,
      preventDefault() {}, stopPropagation() { this.cancelBubble = true; } });
  }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument?.activeElement === this) this.ownerDocument.activeElement = null; }
  showModal() { this.open = true; this.ownerDocument?._notifyChange(this); }
  close() { this.open = false; this.ownerDocument?._notifyChange(this); }
  add(option) { this.append(option); if (!this.value) this.value = option.value; }
  getBoundingClientRect() {
    const width = Number(this.width || this.naturalWidth) || 100;
    const height = Number(this.height || this.naturalHeight) || 100;
    return { left: 0, top: 0, right: width, bottom: height, width, height };
  }
  cloneNode(deep = false) {
    const clone = new TestElement(this.localName, this.ownerDocument);
    clone.id = this.id;
    clone.className = this.className;
    clone._textContent = this._textContent;
    clone._value = this._value;
    clone.type = this.type;
    clone.hidden = this.hidden;
    clone.disabled = this.disabled;
    clone.checked = this.checked;
    clone.open = this.open;
    clone.attributes = new Map(this.attributes);
    for (const [key, value] of Object.entries(this.dataset)) clone.dataset[key] = value;
    if (deep) clone.append(...this.children.map(child => child.cloneNode(true)));
    return clone;
  }
}
