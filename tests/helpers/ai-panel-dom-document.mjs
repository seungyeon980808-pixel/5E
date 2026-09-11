import { decodeTestPng, encodeTestRgbaPng } from './scoped-edit-png-fixture.mjs';
import { TestElement } from './ai-panel-dom-elements.mjs';
import { descendants } from './ai-panel-dom-selectors.mjs';

export class TestImage extends TestElement {
  constructor(ownerDocument) {
    super('img', ownerDocument);
    this._src = '';
    this._decodePromise = Promise.resolve();
  }
  get src() { return this._src; }
  set src(value) {
    this._src = String(value || '');
    this._decodePromise = new Promise((resolve, reject) => {
      queueMicrotask(() => {
        try {
          if (/^data:image\/png;base64,/i.test(this._src)) {
            const encoded = this._src.slice(this._src.indexOf(',') + 1);
            const png = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
            this._decoded = decodeTestPng(png);
            this.naturalWidth = this._decoded.width;
            this.naturalHeight = this._decoded.height;
          }
          this.onload?.();
          this.dispatchEvent({ type: 'load', target: this });
          resolve();
        } catch (error) {
          this.onerror?.(error);
          reject(error);
        }
      });
    });
    this._decodePromise.catch(() => {});
  }
  decode() { return this._decodePromise; }
  cloneNode() {
    const clone = new TestImage(this.ownerDocument);
    clone.id = this.id;
    clone.className = this.className;
    for (const [key, value] of Object.entries(this.dataset)) clone.dataset[key] = value;
    if (this.src) clone.src = this.src;
    return clone;
  }
}

class TestCanvas extends TestElement {
  constructor(ownerDocument) {
    super('canvas', ownerDocument);
    this._width = 300;
    this._height = 150;
    this._pixels = new Uint8ClampedArray(this._width * this._height * 4);
    this._context = {
      createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
      drawImage: image => {
        this.ownerDocument.rasterDrawCount += 1;
        this._pixels = new Uint8ClampedArray(image._decoded?.data || this._width * this._height * 4);
      },
      getImageData: () => ({ data: new Uint8ClampedArray(this._pixels), width: this._width, height: this._height }),
      clearRect: () => { this._pixels.fill(0); },
      putImageData: image => { this._pixels = new Uint8ClampedArray(image.data); this.imageData = image; },
    };
  }
  get width() { return this._width; }
  set width(value) { this._width = Number(value); this._pixels = new Uint8ClampedArray(this._width * this._height * 4); }
  get height() { return this._height; }
  set height(value) { this._height = Number(value); this._pixels = new Uint8ClampedArray(this._width * this._height * 4); }
  getContext() { return this._context; }
  toDataURL() {
    return `data:image/png;base64,${Buffer.from(encodeTestRgbaPng({
      width: this._width,
      height: this._height,
      data: new Uint8Array(this._pixels),
    })).toString('base64')}`;
  }
}

export class TestDocument {
  constructor() {
    this.activeElement = null;
    this.visibilityState = 'visible';
    this.rasterDrawCount = 0;
    this._listeners = new Map();
    this._waiters = new Set();
    this.body = new TestElement('body', this);
  }
  createElement(tagName) {
    const name = String(tagName).toLowerCase();
    if (name === 'img') return new TestImage(this);
    if (name === 'canvas') return new TestCanvas(this);
    return new TestElement(name, this);
  }
  createElementNS(_namespace, tagName) { return this.createElement(tagName); }
  getElementById(id) { return [this.body, ...descendants(this.body)].find(node => node.id === id) || null; }
  querySelector(selector) { return this.body.matches(selector) ? this.body : this.body.querySelector(selector); }
  querySelectorAll(selector) { return [this.body, ...this.body.querySelectorAll(selector)].filter(node => node.matches(selector)); }
  addEventListener(type, listener) {
    const listeners = this._listeners.get(type) || [];
    listeners.push(listener);
    this._listeners.set(type, listeners);
  }
  removeEventListener(type, listener) {
    this._listeners.set(type, (this._listeners.get(type) || []).filter(candidate => candidate !== listener));
  }
  dispatchEvent(event) { for (const listener of this._listeners.get(event.type) || []) listener(event); }
  _notifyAdded(node) {
    for (const added of [node, ...descendants(node)]) this._notify({ type: 'added', node: added });
    this._notifyChange(node);
  }
  _notifyChange(node) { this._notify({ type: 'change', node }); }
  _notify(change) {
    for (const waiter of [...this._waiters]) {
      let value;
      try { value = waiter.match(change); } catch (error) { waiter.reject(error); continue; }
      if (value) waiter.resolve(value === true ? change.node : value);
    }
  }
  _wait(match, timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
      const waiter = {
        match,
        resolve: value => { clearTimeout(timer); this._waiters.delete(waiter); resolve(value); },
        reject: error => { clearTimeout(timer); this._waiters.delete(waiter); reject(error); },
      };
      const timer = setTimeout(() => waiter.reject(new Error('Timed out waiting for the test DOM state.')), timeoutMs);
      this._waiters.add(waiter);
    });
  }
  waitForAdded(match, timeoutMs) {
    const predicate = typeof match === 'string' ? node => node.matches(match) : match;
    return this._wait(change => change.type === 'added' && predicate(change.node), timeoutMs);
  }
  waitForState(predicate, timeoutMs) {
    const current = predicate();
    if (current) return Promise.resolve(current);
    return this._wait(() => predicate(), timeoutMs);
  }
}
