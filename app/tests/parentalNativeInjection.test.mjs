import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');
const source = await text('src/injection/parental-controls-runtime.ts');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const runtime = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const generated = await text('src/injection/parental-runtime-source.ts');
const browserRuntime = JSON.parse(generated.match(/^export const PARENTAL_RUNTIME_SOURCE = (.+);$/m)?.[1] || 'null');
const prefs = (extra = {}) => ({ enabled: true, maximumAge: 12, lockHorror: false, animeHome: false, ...extra });

test('both handheld and TV receive the shared runtime at document start and after load', async () => {
  const inject = await text('src/injection/inject.ts');
  const builder = await text('src/injection/parental-injection.ts');
  const webView = await text('src/components/WebViewBrowser.tsx');
  assert.match(inject, /const parentalControlsRuntime = buildParentalControlsRuntime\(\)/);
  assert.match(inject, /\$\{appSiteOverrides\}[\s\S]*\$\{parentalControlsRuntime\}[\s\S]*\$\{castShim\}/);
  assert.match(webView, /injectedJavaScriptBeforeContentLoaded=\{injectedJS\}/);
  assert.match(webView, /injectedJavaScript=\{PARENTAL_RUNTIME_AFTER_LOAD\}/);
  assert.match(webView, /onLoadEnd=\{onPageLoadEnd\}/);
  assert.match(webView, /tvMode: isTV/);
  assert.doesNotMatch(inject, /options\.tvMode \? buildParentalControlsRuntime/);
  assert.match(builder, /return PARENTAL_RUNTIME_SOURCE/);
  assert.doesNotMatch(builder, /toString\(\)/);
  assert.match(browserRuntime, /function installParentalControlsRuntime\(/);
  assert.match(browserRuntime, /installParentalControlsRuntime\(\);/);
  assert.doesNotThrow(() => new Function(browserRuntime));
});

test('FR then US classifications, unknown ratings and independent Horror rule', () => {
  assert.equal(runtime.parentalPreferredAge('movie', { results: [
    { iso_3166_1: 'US', release_dates: [{ type: 3, certification: 'R' }] },
    { iso_3166_1: 'FR', release_dates: [{ type: 3, certification: '16' }] },
  ] }), 16);
  assert.equal(runtime.parentalPreferredAge('tv', { results: [
    { iso_3166_1: 'FR', rating: '?' }, { iso_3166_1: 'US', rating: 'TV-14' },
  ] }), 14);
  assert.equal(runtime.parentalCertificationAge('unrated'), null);
  assert.equal(runtime.parentalLockReason(prefs(), 'movie', { age: null, genres: [], keywords: [] }), 'unknown');
  assert.equal(runtime.parentalLockReason(prefs(), 'movie', { age: 13, genres: [], keywords: [] }), 'age');
  assert.equal(runtime.parentalLockReason(prefs(), 'movie', { age: 12, genres: [], keywords: [] }), null);
  assert.equal(runtime.parentalLockReason(prefs({ lockHorror: true }), 'movie', { age: 10, genres: [{ id: 27, name: 'Horror' }], keywords: [] }), 'horror');
  assert.equal(runtime.parentalLockReason(prefs({ lockHorror: true }), 'tv', { age: 10, genres: [{ id: 10765, name: 'Science Fiction & Fantasy' }], keywords: [] }), null);
  assert.equal(runtime.parentalLockReason(prefs({ lockHorror: true }), 'tv', { age: 10, genres: [], keywords: [{ id: 1, name: 'psychological horror' }] }), 'horror');
  assert.equal(runtime.parentalLockReason(prefs({ lockHorror: true }), 'tv', { age: 10, genres: null, keywords: null }), 'unknown');
  assert.equal(runtime.parentalLockReason(prefs({ enabled: false, lockHorror: true }), 'movie', { age: null, genres: null, keywords: null }), null);
});

test('explicit Home remains reachable and watch routes cover films, shows and anime', () => {
  assert.equal(runtime.parentalHomeTarget('/', prefs({ animeHome: true })), '/anime');
  assert.equal(runtime.parentalHomeTarget('/movie/123', prefs({ animeHome: true })), null);
  assert.equal(runtime.parentalHomeTarget('/', prefs({ enabled: false, animeHome: true })), null);
  assert.deepEqual(runtime.parentalMediaRoute('/watch/movie/123'), { type: 'movie', id: '123', watch: true });
  assert.deepEqual(runtime.parentalMediaRoute('/watch/tv/456/s/1/e/1'), { type: 'tv', id: '456', watch: true });
  assert.deepEqual(runtime.parentalMediaRoute('/watch/anime/789/season/1/episode/2'), { type: 'tv', id: '789', watch: true });
});

function bootAt(pathname, settings) {
  const location = new URL(`https://fixture.invalid${pathname}`);
  const calls = [];
  const history = {
    state: null,
    replaceState(_state, _title, url) { calls.push(['replace', String(url)]); location.pathname = new URL(String(url), location.href).pathname; },
    pushState(_state, _title, url) { calls.push(['push', String(url)]); location.pathname = new URL(String(url), location.href).pathname; },
  };
  const localStorage = { getItem(key) { return settings[key] ?? null; } };
  const window = { location, history, fetch: () => Promise.resolve(null), addEventListener() {} };
  const document = { documentElement: {}, readyState: 'loading', addEventListener() {} };
  const context = {
    window, history, document, localStorage, URL, XMLHttpRequest: class { open() {} addEventListener() {} },
    HTMLMediaElement: class { play() { return Promise.resolve(); } },
    requestAnimationFrame() {}, setTimeout, Promise,
  };
  vm.runInNewContext(browserRuntime, context);
  return { location, calls, window };
}

test('a direct watch URL is diverted before site startup when controls are enabled', () => {
  const settings = {
    movix_parental_pin_v1: JSON.stringify({ version: 1, salt: 'a'.repeat(32), hash: 'b'.repeat(64), iterations: 310000 }),
    movix_parental_preferences_v1: JSON.stringify(prefs()),
  };
  const direct = bootAt('/watch/movie/123', settings);
  assert.equal(direct.location.pathname, '/movie/123');
  assert.deepEqual(direct.calls, [['replace', '/movie/123']]);
  const anime = bootAt('/watch/anime/789/season/1/episode/2', settings);
  assert.equal(anime.location.pathname, '/tv/789');
  const inactive = bootAt('/watch/movie/123', { ...settings, movix_parental_preferences_v1: JSON.stringify(prefs({ enabled: false })) });
  assert.equal(inactive.location.pathname, '/watch/movie/123');
});

test('local PIN storage uses PBKDF2 and the injected overlay owns focus and interaction', () => {
  assert.match(source, /movix_parental_pin_v1/);
  assert.match(source, /PBKDF2/);
  assert.match(source, /310000/);
  assert.match(source, /new Uint8Array\(16\)/);
  assert.match(source, /node\.setAttribute\('inert', ''\)/);
  assert.match(source, /node\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(source, /data-tv-parental-pin-input/);
  assert.match(source, /data-parental-pin-keypad/);
  assert.match(source, /route\.type.*route\.id/);
  assert.match(source, /data-movix-parental-nav/);
  assert.match(source, /content\.insertBefore\(section, source \|\| privacy\?\.nextSibling \|\| null\)/);
});

test('injected sidebar and mobile entries match the shorter live navigation labels', async () => {
  const fr = JSON.parse(await text('../src/i18n/locales/fr.json'));
  const en = JSON.parse(await text('../src/i18n/locales/en.json'));
  for (const locale of [fr, en]) {
    assert.notEqual(locale.settings.sections.sourcePriority, locale.settings.sourcePriority.title);
    assert.ok(source.includes(`priorityNav: '${locale.settings.sections.sourcePriority}'`));
  }
  assert.match(source, /const lists = \[[\s\S]*data-settings-sidebar-scroll[\s\S]*lg\\\\:hidden\.fixed/);
});

test('late phone injection mounts a discoverable section without the source-priority anchor', () => {
  const location = new URL('https://fixture.invalid/settings');
  const callbacks = [];
  const listeners = new Map();
  const nodes = [];
  const makeNode = tagName => ({
    tagName: tagName.toUpperCase(), children: [], attributes: {}, innerHTML: '',
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener() {},
    appendChild(node) { this.children.push(node); nodes.push(node); node.parentElement = this; },
    insertBefore(node, before) {
      const index = before ? this.children.indexOf(before) : -1;
      this.children.splice(index < 0 ? this.children.length : index, 0, node);
      nodes.push(node); node.parentElement = this;
    },
    get firstChild() { return this.children[0] || null; },
    querySelector(selector) { return selector === 'span' ? { textContent: '' } : null; },
  });
  const main = makeNode('main');
  const document = {
    documentElement: null, body: null, readyState: 'loading',
    addEventListener(name, callback) { listeners.set(name, [...(listeners.get(name) || []), callback]); },
    getElementById(id) { return nodes.find(node => node.id === id) || null; },
    querySelector(selector) {
      if (selector === 'main') return main;
      if (selector === '[data-movix-parental-section]') return nodes.find(node => 'data-movix-parental-section' in node.attributes) || null;
      if (selector === '[data-movix-parental-entry]') return nodes.find(node => 'data-movix-parental-entry' in node.attributes) || null;
      return null;
    },
    querySelectorAll() { return []; },
    createElement: makeNode,
  };
  const history = { state: null, pushState() {}, replaceState() {} };
  const window = { location, history, fetch() {}, addEventListener() {} };
  const context = {
    window, document, history, URL, localStorage: { getItem() { return null; } },
    XMLHttpRequest: class { open() {} }, HTMLMediaElement: class { play() {} },
    MutationObserver: class { observe(element) { assert.equal(element, document.documentElement); } },
    requestAnimationFrame(callback) { callbacks.push(callback); },
  };
  // The Android document-start evaluation may run before <html> exists.
  vm.runInNewContext(browserRuntime, context);
  assert.equal(nodes.length, 0);
  document.documentElement = makeNode('html');
  document.body = makeNode('body');
  for (const callback of listeners.get('DOMContentLoaded') || []) callback();
  while (callbacks.length) callbacks.shift()();
  assert.equal(document.getElementById('parental')?.attributes['data-movix-parental-section'], '');
  assert.equal(main.children[0]?.attributes['data-movix-parental-entry'], '');
  const push = history.pushState;
  vm.runInNewContext(browserRuntime, context);
  while (callbacks.length) callbacks.shift()();
  assert.equal(history.pushState, push, 're-injection refreshes rather than wrapping history twice');
  assert.equal(main.children.filter(node => node.id === 'parental').length, 1);
  assert.equal(main.children.filter(node => 'data-movix-parental-entry' in node.attributes).length, 1);
});
