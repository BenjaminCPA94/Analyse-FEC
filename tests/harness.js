'use strict';
/**
 * Harnais de test Node pour FEC Analyse.
 * Extrait le script principal du fichier HTML et l'exécute dans un
 * bac à sable (vm) avec des stubs DOM / localStorage / Chart.js,
 * afin de tester les fonctions métier hors navigateur.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractMainScript(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(m => ({ full: m[0], body: m[1] }))
    .filter(s => !/<script\s+src=/.test(s.full));
  if (scripts.length !== 1) {
    throw new Error(`Attendu exactement 1 <script> inline sans src, trouvé ${scripts.length}`);
  }
  return scripts[0].body;
}

class FakeClassList {
  constructor() { this._set = new Set(); }
  add(...c) { c.forEach(x => this._set.add(x)); }
  remove(...c) { c.forEach(x => this._set.delete(x)); }
  contains(c) { return this._set.has(c); }
  toggle(c, force) {
    if (force === undefined) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); }
    else if (force) this._set.add(c); else this._set.delete(c);
  }
}

function makeFakeElement(tag = 'div') {
  const el = {
    tagName: tag.toUpperCase(),
    style: {},
    dataset: {},
    children: [],
    childNodes: [],
    attributes: {},
    classList: new FakeClassList(),
    _innerHTML: '',
    _listeners: {},
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) { this._innerHTML = v; },
    textContent: '',
    value: '',
    disabled: false,
    appendChild(child) { this.children.push(child); this.childNodes.push(child); return child; },
    removeChild(child) {
      this.children = this.children.filter(c => c !== child);
      this.childNodes = this.childNodes.filter(c => c !== child);
    },
    remove() {},
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k] ?? null; },
    addEventListener(evt, fn) { (this._listeners[evt] = this._listeners[evt] || []).push(fn); },
    removeEventListener(evt, fn) {
      if (!this._listeners[evt]) return;
      this._listeners[evt] = this._listeners[evt].filter(f => f !== fn);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    focus() {},
    click() {},
    contains() { return false; },
  };
  return el;
}

class FakeStorage {
  constructor() { this._data = new Map(); }
  getItem(k) { return this._data.has(k) ? this._data.get(k) : null; }
  setItem(k, v) {
    if (this._quotaBytes && Buffer.byteLength(String(v), 'utf-8') > this._quotaBytes) {
      const e = new Error('QuotaExceededError');
      e.name = 'QuotaExceededError';
      throw e;
    }
    this._data.set(k, String(v));
  }
  removeItem(k) { this._data.delete(k); }
  clear() { this._data.clear(); }
  key(i) { return [...this._data.keys()][i]; }
  get length() { return this._data.size; }
}

/** Construit un contexte sandbox neuf (état isolé par test). */
function buildSandbox() {
  const fakeDoc = {
    _elements: new Map(),
    getElementById(id) { return this._elements.get(id) || null; },
    createElement(tag) { return makeFakeElement(tag); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
    body: makeFakeElement('body'),
    documentElement: makeFakeElement('html'),
  };

  class FakeChart {
    constructor() { this.data = {}; }
    destroy() {}
    update() {}
  }
  FakeChart.register = () => {};

  const sandbox = {
    console,
    document: fakeDoc,
    localStorage: new FakeStorage(),
    Chart: FakeChart,
    navigator: { userAgent: 'node-test' },
    alert() {},
    confirm() { return true; },
    prompt() { return null; },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
    Blob: class { constructor(parts, opts) { this.parts = parts; this.opts = opts; } },
    FileReader: class {
      readAsText(file) {
        setTimeout(() => this.onload && this.onload({ target: { result: file.__content || '' } }), 0);
      }
    },
    Intl,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    ArrayBuffer,
    Math,
    Date,
    JSON,
    Object,
    Array,
    Map,
    Set,
    Number,
    String,
    Boolean,
    RegExp,
    parseFloat,
    parseInt,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

/**
 * Charge le fichier HTML donné, exécute son script dans un contexte
 * fraîchement créé, et retourne le contexte (accès aux fonctions/variables
 * globales définies par le script, ex: ctx.parseFECFile(...)).
 */
function loadApp(htmlPath) {
  const src = extractMainScript(htmlPath);
  const sandbox = buildSandbox();
  const context = vm.createContext(sandbox);
  vm.runInContext(src, context, { filename: path.basename(htmlPath) });
  return context;
}

/**
 * Exécute une chaîne de code dans le même contexte lexical que le script
 * chargé (nécessaire car les `let`/`const` de haut niveau, comme `ACTIVE`,
 * ne sont pas exposés comme propriétés de l'objet sandbox — même
 * comportement qu'un vrai navigateur).
 */
function runIn(context, code) {
  return vm.runInContext(code, context);
}

/** Récupère une valeur (sérialisable JSON) depuis le contexte par son nom/expression. */
function getJSON(context, expr) {
  return JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, context));
}

module.exports = { extractMainScript, loadApp, buildSandbox, makeFakeElement, FakeStorage, runIn, getJSON };
