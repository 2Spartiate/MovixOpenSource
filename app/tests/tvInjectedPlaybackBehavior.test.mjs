import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function harness(tvMode = true) {
  const source = await readFile(new URL('../src/injection/tv-playback-runtime.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports });

  let document;
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.attributes = {};
      this.listeners = {};
      this.className = '';
      this.textContent = '';
      this.parentElement = null;
      this.isConnected = true;
      this.clicks = 0;
    }
    set innerHTML(value) { this.textContent = value.replace(/<[^>]*>/g, ' '); }
    setAttribute(key, value) { this.attributes[key] = value; }
    getAttribute(key) { return this.attributes[key] ?? null; }
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
    remove() { this.parentElement?.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; this.isConnected = false; }
    getBoundingClientRect() { return { width: 320, height: 180 }; }
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
    click() { this.clicks++; for (const callback of this.listeners.click || []) callback(); }
    contains(target) { return target === this || this.children.some(child => child.contains(target)); }
    focus() { document.activeElement = this; document.emit('focusin', { target: this }); }
    closest(selector) { return selector === '[data-hls-player-root]' ? this.playerRoot || null : null; }
    querySelectorAll(selector) {
      const all = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
      if (selector === '*') return all;
      if (selector === '.movix-tv-menu-action') return all.filter(element => element.className.includes('movix-tv-menu-action'));
      if (selector === 'button, [role="button"]' || selector === 'button') return all.filter(element => element.tagName === 'BUTTON');
      return [];
    }
    querySelector(selector) {
      if (selector === '[data-tv-settings-tab="quality"]') return this.querySelectorAll('*').find(element => element.getAttribute('data-tv-settings-tab') === 'quality') || null;
      if (selector === 'button') return this.querySelectorAll('button')[0] || null;
      return null;
    }
  }
  class Video extends Element { constructor() { super('video'); this.currentTime = 30; this.duration = 100; this.textTracks = []; } }
  const body = new Element('body');
  const head = new Element('head');
  const root = new Element('div');
  root.setAttribute('data-hls-player-root', '');
  const video = new Video();
  video.playerRoot = root;
  root.appendChild(video);
  body.appendChild(root);
  const playPause = new Element('button');
  playPause.setAttribute('data-tv-player-play-pause', '');
  root.appendChild(playPause);
  const settings = new Element('button');
  settings.setAttribute('data-tv-player-menu-trigger', 'settings');
  root.appendChild(settings);
  settings.addEventListener('click', () => {
    const panel = new Element('section');
    panel.className = 'settings-menu';
    const quality = new Element('button');
    quality.setAttribute('data-tv-settings-tab', 'quality');
    panel.appendChild(quality);
    body.appendChild(panel);
  });

  const listeners = {};
  document = {
    body, head, documentElement: new Element('html'), activeElement: body, readyState: 'loading',
    fullscreenElement: null, webkitFullscreenElement: null,
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    removeEventListener(name, fn) { listeners[name] = (listeners[name] || []).filter(item => item !== fn); },
    emit(name, event) { for (const fn of listeners[name] || []) fn(event); },
    createElement(tag) { return new Element(tag); },
    getElementById(id) { return [body, head].flatMap(node => [node, ...node.querySelectorAll('*')]).find(node => node.id === id) || null; },
    querySelectorAll(selector) { return selector === 'video' ? [video] : []; },
    querySelector(selector) {
      if (selector === '[data-tv-player-menu-trigger="settings"]') return settings;
      if (selector.startsWith('.settings-menu')) return body.querySelectorAll('*').find(element => element.className === 'settings-menu') || null;
      return null;
    },
  };
  document.documentElement.classList = { add() {}, remove() {} };

  const windowListeners = {};
  const storage = new Map();
  const window = {
    MOVIX_TV: tvMode, location: { pathname: '/watch', search: '' },
    getComputedStyle() { return { display: 'block', visibility: 'visible', opacity: '1' }; },
    addEventListener(name, fn) { (windowListeners[name] ||= []).push(fn); },
    removeEventListener(name, fn) { windowListeners[name] = (windowListeners[name] || []).filter(item => item !== fn); },
    dispatchEvent(event) { for (const fn of windowListeners[event.type] || []) fn(event); },
  };
  const context = vm.createContext({
    window, document, HTMLElement: Element, HTMLVideoElement: Video,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    Event: class { constructor(type) { this.type = type; } },
    performance: { now: () => Date.now() },
    requestAnimationFrame: callback => callback(), setTimeout, clearTimeout,
  });
  vm.runInContext(module.exports.buildTvPlaybackRuntime(), context);

  function press(key, code = key, keyCode = 0) {
    const event = { key, code, keyCode, preventDefault() { this.prevented = true; }, stopPropagation() {}, stopImmediatePropagation() {} };
    for (const fn of windowListeners.keydown || []) fn(event);
    return event;
  }
  const actions = () => document.getElementById('movix-tv-injected-playback-menu')?.querySelectorAll('.movix-tv-menu-action') || [];
  return { press, actions, document, playPause, settings, video, window, storage };
}

test('packaged TV script owns D-pad focus and transport while the injected menu is visible', async () => {
  const app = await harness();
  assert.equal(app.press('0', 'Digit0').prevented, true);
  await new Promise(resolve => setImmediate(resolve));
  const rows = app.actions();
  assert.equal(rows.length, 3);
  assert.equal(app.document.activeElement, rows[0]);
  assert.equal(app.press('ArrowDown').prevented, true);
  assert.equal(app.document.activeElement, rows[1]);
  app.playPause.focus(); // Simulate a delayed remote React autofocus.
  assert.equal(app.document.activeElement, rows[1]);
  app.press('ArrowUp');
  assert.equal(app.document.activeElement, rows[0]);
  const time = app.video.currentTime;
  assert.equal(app.press('ArrowRight').prevented, true);
  assert.equal(app.video.currentTime, time);
  assert.equal(app.press('ArrowDown').prevented, true);
  app.press('Enter');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.settings.clicks, 1);
  assert.equal(app.actions().length, 0);
  assert.equal(app.document.activeElement.getAttribute('data-tv-settings-tab'), 'quality');
});

test('0 and Back close the TV menu and non-TV never installs this listener', async () => {
  const app = await harness();
  app.press('0', 'Digit0');
  await new Promise(resolve => setImmediate(resolve));
  app.press('0', 'Digit0');
  assert.equal(app.actions().length, 0);
  app.press('0', 'Digit0');
  await new Promise(resolve => setImmediate(resolve));
  app.window.dispatchEvent({ type: 'movix-tv-back', cancelable: true, preventDefault() { this.prevented = true; } });
  assert.equal(app.actions().length, 0);
  const handheld = await harness(false);
  assert.equal(handheld.press('0', 'Digit0').prevented, undefined);
  assert.equal(handheld.actions().length, 0);
});
