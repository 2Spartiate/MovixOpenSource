import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/injection/tv-dpad-runtime.ts', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { module, exports: module.exports });

function tvPage(pathname) {
  let document;
  class Element {
    constructor(tag = 'div', parent = null, attributes = {}) {
      this.tagName = tag.toUpperCase();
      this.parentElement = parent;
      this.attributes = { ...attributes };
      this.isConnected = true;
      this.offsetParent = parent;
      this.style = { setProperty() {} };
      this.clicks = 0;
      this.rect = { left: 0, top: 0, right: 500, bottom: 300, width: 500, height: 300 };
    }
    getAttribute(name) { return this.attributes[name] ?? null; }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
    getBoundingClientRect() { return this.rect; }
    closest(selectors) {
      for (let node = this; node; node = node.parentElement) {
        if (selectors.split(',').some(selector => {
          const value = selector.trim();
          if (value === 'header') return node.tagName === 'HEADER';
          if (value === '.video-container') return node.hasAttribute('video-container');
          if (value.startsWith('[data-')) return node.hasAttribute(value.slice(1, -1).split('=')[0]);
          return false;
        })) return node;
      }
      return null;
    }
    contains(other) { return other === this || other?.closest('header') === this ||
      Array.from((function* (node) { while (node) { yield node; node = node.parentElement; } })(other))
        .includes(this); }
    focus() { document.activeElement = this; }
    click() { this.clicks++; }
    scrollIntoView() {}
    querySelector(selector) {
      const name = selector.match(/data-tv-header-shortcut="([^"]+)"/)?.[1];
      return name ? [search, account, explore].find(item => item.getAttribute('data-tv-header-shortcut') === name) : null;
    }
    querySelectorAll() { return []; }
  }
  class Input extends Element { select() {} }
  class Anchor extends Element {}
  const body = new Element('body');
  const header = new Element('header', body);
  const search = new Input('input', header, { 'data-tv-header-shortcut': 'search', type: 'text' });
  const account = new Element('button', header, { 'data-tv-header-shortcut': 'account' });
  const explore = new Element('button', header, { 'data-tv-header-shortcut': 'explore' });
  const playerRoot = new Element('section', body, { 'data-hls-player-root': '' });
  const playPause = new Element('button', playerRoot, { 'data-tv-player-control': '' });
  const row = new Element('div', playerRoot, { 'data-tv-carousel-row': '' });
  const first = new Anchor('a', row, { 'data-tv-card': '', 'data-tv-focus-id': 'first', href: '/movie/1' });
  const second = new Anchor('a', row, { 'data-tv-card': '', 'data-tv-focus-id': 'second', href: '/movie/2' });
  first.rect = { left: 20, right: 120, top: 60, bottom: 210, width: 100, height: 150 };
  second.rect = { left: 140, right: 240, top: 60, bottom: 210, width: 100, height: 150 };
  const focusables = [first, second, playPause];
  const listeners = {};
  document = {
    body, documentElement: new Element('html'), activeElement: first, readyState: 'loading',
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    removeEventListener(name, fn) { listeners[name] = (listeners[name] || []).filter(item => item !== fn); },
    querySelector(selector) { return selector === 'header' ? header : null; },
    querySelectorAll() { return []; },
  };
  const window = {
    MOVIX_TV: true, location: { pathname }, scrollX: 0, scrollY: 0, innerWidth: 1920,
    __MOVIX_TV_FOCUS: {}, addEventListener() {}, removeEventListener() {},
    getComputedStyle() { return { overflowX: 'visible', overflowY: 'visible' }; },
    scrollTo() {},
  };
  const discovery = `(() => {
    const api = window.__MOVIX_TV_FOCUS;
    api.getTVFocusableElements = () => focusables;
    api.getTVFocusCandidates = () => focusables.map(element => {
      const rect = element.getBoundingClientRect();
      return { element, rect: { ...rect, centerX: (rect.left + rect.right) / 2,
        centerY: (rect.top + rect.bottom) / 2 } };
    });
  })();`;
  const context = vm.createContext({
    document, window, focusables, HTMLElement: Element, HTMLAnchorElement: Anchor,
    HTMLInputElement: Input, HTMLImageElement: Element,
    requestAnimationFrame() {}, cancelAnimationFrame() {},
    setTimeout, clearTimeout, performance: { now: () => 0 },
  });
  vm.runInContext(module.exports.buildTvDpadRuntime('() => null', discovery), context);
  const api = window.__MOVIX_TV_FOCUS;
  const press = (key, code = key) => {
    const event = {
      key, code, target: document.activeElement,
      preventDefault() { this.prevented = true; },
      stopPropagation() {}, stopImmediatePropagation() {},
    };
    api.handleDpadKeydown(event);
    return event;
  };
  return { api, document, first, second, playPause, search, account, explore, press };
}

test('real D-pad runtime traverses posters on Home and both detail routes', () => {
  for (const route of ['/', '/movie/123', '/tv/123']) {
    const page = tvPage(route);
    assert.equal(page.press('ArrowRight').prevented, true, route);
    assert.equal(page.document.activeElement, page.second, route);
    page.press('ArrowLeft');
    assert.equal(page.document.activeElement, page.first, route);
  }
});

test('1/2/3 activate the real header targets from a poster or player control', () => {
  for (const route of ['/', '/movie/123', '/tv/123', '/watch/tv/123/s/1/e/1']) {
    const page = tvPage(route);
    page.playPause.focus();
    assert.equal(page.press('1', 'Digit1').prevented, true, route);
    assert.equal(page.document.activeElement, page.search, route);
    page.first.focus();
    assert.equal(page.press('2', 'Digit2').prevented, true, route);
    assert.equal(page.account.clicks, 1, route);
    page.first.focus();
    assert.equal(page.press('3', 'Digit3').prevented, true, route);
    assert.equal(page.explore.clicks, 1, route);
  }
});

test('Watch player arrows stay with playback, while focused recommendations remain spatial', () => {
  const page = tvPage('/watch/tv/123/s/1/e/1');
  page.playPause.focus();
  assert.equal(page.api.shouldSpatialNavigationHandle({ key: 'ArrowRight', target: page.playPause }), false);
  page.first.focus();
  assert.equal(page.press('ArrowRight').prevented, true);
  assert.equal(page.document.activeElement, page.second);
});
