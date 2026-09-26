import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function harness(tvMode = true, sourceFixtures = [], options = {}) {
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
    hasAttribute(key) { return Object.hasOwn(this.attributes, key); }
    appendChild(child) { child.parentElement = this; child.isConnected = true; this.children.push(child); return child; }
    remove() { this.parentElement?.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; this.isConnected = false; }
    get nextElementSibling() {
      const siblings = this.parentElement?.children || [];
      return siblings[siblings.indexOf(this) + 1] || null;
    }
    get classList() { return {
      contains: name => this.className.split(' ').includes(name),
      add: name => { this.className += ` ${name}`; },
      remove: name => { this.className = this.className.split(' ').filter(part => part !== name).join(' '); },
    }; }
    getBoundingClientRect() { return { width: 320, height: 180 }; }
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
    click() { this.clicks++; for (const callback of this.listeners.click || []) callback(); }
    contains(target) { return target === this || this.children.some(child => child.contains(target)); }
    focus() { document.activeElement = this; document.emit('focusin', { target: this }); }
    scrollIntoView() { this.scrollRequests = (this.scrollRequests || 0) + 1; }
    closest(selector) {
      if (selector === '[data-hls-player-root]') return this.playerRoot || null;
      if (selector === '.settings-menu') {
        for (let node = this; node; node = node.parentElement) {
          if (node.className.split(' ').includes('settings-menu')) return node;
        }
      }
      if (selector === '.video-container') {
        for (let node = this; node; node = node.parentElement) {
          if (node.className.split(' ').includes('video-container')) return node;
        }
      }
      if (selector === '.overflow-y-auto') {
        for (let node = this; node; node = node.parentElement) {
          if (node.className.split(' ').includes('overflow-y-auto')) return node;
        }
      }
      return null;
    }
    querySelectorAll(selector) {
      const all = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
      if (selector === '*') return all;
      if (selector === '.movix-tv-menu-action') return all.filter(element => element.className.includes('movix-tv-menu-action'));
      if (selector === 'div') return all.filter(element => element.tagName === 'DIV');
      if (selector === 'h3') return all.filter(element => element.tagName === 'H3');
      if (selector === '.top-full') return all.filter(element => element.className.split(' ').includes('top-full'));
      if (selector.startsWith('button, a[href]')) return all.filter(element => element.tagName === 'BUTTON');
      if (selector === 'button, [role="button"]' || selector === 'button') return all.filter(element => element.tagName === 'BUTTON');
      return [];
    }
    querySelector(selector) {
      if (selector === '[data-tv-settings-tab="quality"]') return this.querySelectorAll('*').find(element => element.getAttribute('data-tv-settings-tab') === 'quality') || null;
      if (selector === '[data-tv-player-menu-trigger="settings"]') return this.querySelectorAll('*').find(element => element.getAttribute('data-tv-player-menu-trigger') === 'settings') || null;
      if (selector === '[data-tv-episodes-menu]') return this.querySelectorAll('*').find(element => element.hasAttribute('data-tv-episodes-menu')) || null;
      if (selector === '[data-source-menu]') return this.querySelectorAll('*').find(element => element.getAttribute('data-source-menu') !== null) || null;
      if (selector === 'h3') return this.querySelectorAll('h3')[0] || null;
      if (selector === '.overflow-y-auto') return this.querySelectorAll('*').find(element => element.className.split(' ').includes('overflow-y-auto')) || null;
      if (selector === '.overflow-y-auto button') return this.querySelectorAll('*').find(element => element.tagName === 'BUTTON' && element.closest('.overflow-y-auto')) || null;
      if (selector === 'button') return this.querySelectorAll('button')[0] || null;
      return null;
    }
  }
  class Video extends Element { constructor() { super('video'); this.currentTime = 30; this.duration = 100; this.textTracks = []; } }
  const body = new Element('body');
  const head = new Element('head');
  const root = new Element('div');
  root.setAttribute('data-hls-player-root', '');
  const poster = new Element('button');
  poster.textContent = 'Affiche suivante';
  body.appendChild(poster);
  const video = new Video();
  video.playerRoot = root;
  if (options.legacyRoot) {
    delete root.attributes['data-hls-player-root'];
    root.className = 'video-container';
    video.playerRoot = null;
  }
  root.appendChild(video);
  body.appendChild(root);
  const playPause = new Element('button');
  playPause.setAttribute('data-tv-player-play-pause', '');
  root.appendChild(playPause);
  const settings = new Element('button');
  settings.setAttribute('data-tv-player-menu-trigger', 'settings');
  if (options.legacyRoot) {
    delete settings.attributes['data-tv-player-menu-trigger'];
    settings.setAttribute('aria-label', 'Paramètres');
  }
  root.appendChild(settings);
  settings.addEventListener('click', () => {
    const existing = body.querySelectorAll('*').find(element => element.className === 'settings-menu');
    if (existing) { existing.remove(); return; }
    const panel = new Element('section');
    panel.className = 'settings-menu';
    const header = new Element('div');
    const title = new Element('h3');
    title.textContent = 'Paramètres';
    header.appendChild(title);
    const close = new Element('button');
    close.textContent = 'Fermer';
    close.addEventListener('click', () => panel.remove());
    header.appendChild(close);
    panel.appendChild(header);
    const quality = new Element('button');
    quality.setAttribute('data-tv-settings-tab', 'quality');
    quality.setAttribute('aria-pressed', 'true');
    panel.appendChild(quality);
    const format = new Element('button');
    format.setAttribute('data-tv-settings-tab', 'format');
    format.addEventListener('click', () => {
      quality.setAttribute('aria-pressed', 'false');
      format.setAttribute('aria-pressed', 'true');
    });
    panel.appendChild(format);
    const sourceMenu = new Element('div');
    sourceMenu.setAttribute('data-source-menu', '');
    const qualityAction = new Element('button');
    qualityAction.textContent = 'Qualité auto';
    sourceMenu.appendChild(qualityAction);
    panel.appendChild(sourceMenu);
    if (sourceFixtures.length) {
      const scope = sourceMenu;
      const scan = new Element('button');
      scan.textContent = 'Vérification de la qualité';
      scan.addEventListener('click', () => {
        scan.remove();
        setTimeout(() => {
          const complete = new Element('button');
          complete.textContent = 'Vérification de la qualité';
          scope.appendChild(complete);
        }, 20);
      });
      scope.appendChild(scan);
      for (const provider of ['nexus', 'bravo']) {
        const header = new Element('div');
        const group = new Element('button');
        group.textContent = provider;
        header.appendChild(group);
        scope.appendChild(header);
        const list = new Element('div');
        list.className = 'border-l-2';
        for (const source of sourceFixtures.filter(item => item.provider === provider)) {
          const choice = new Element('button');
          choice.textContent = `${source.label} ${source.quality}p`;
          if (source.audio) choice.setAttribute('data-tv-source-audio', source.audio);
          if (source.subtitles) choice.setAttribute('data-tv-source-subtitles', source.subtitles);
          choice.addEventListener('click', () => window.dispatchEvent(new context.CustomEvent('sourceChange', {
            detail: { type: provider === 'bravo' ? 'bravo' : 'nexus_hls', url: source.label },
          })));
          list.appendChild(choice);
        }
        scope.appendChild(list);
      }
    }
    body.appendChild(panel);
  });

  const episodeClicks = [];
  const episodesTrigger = new Element('button');
  if (options.episodes) {
    episodesTrigger.textContent = 'Épisodes';
    root.appendChild(episodesTrigger);
    episodesTrigger.addEventListener('click', () => {
      const panel = new Element('div');
      panel.className = 'fixed z-[11000] max-h-[80vh] flex-col';
      const header = new Element('div');
      const title = new Element('h3');
      title.textContent = 'Série';
      header.appendChild(title);
      const close = new Element('button');
      close.textContent = 'Fermer';
      close.addEventListener('click', () => panel.remove());
      header.appendChild(close);
      panel.appendChild(header);
      const season = new Element('button');
      season.textContent = 'Saison 1';
      panel.appendChild(season);
      const list = new Element('div');
      list.className = 'overflow-y-auto';
      const loadEpisodes = () => {
        for (let number = 1; number <= 3; number++) {
          const choice = new Element('button');
          choice.textContent = `Épisode ${number}`;
          choice.addEventListener('click', () => { episodeClicks.push(number); panel.remove(); });
          list.appendChild(choice);
        }
      };
      if (options.episodesLoading) setTimeout(loadEpisodes, 20);
      else loadEpisodes();
      panel.appendChild(list);
      body.appendChild(panel);
    });
  }

  const listeners = {};
  document = {
    body, head, documentElement: new Element('html'), activeElement: body, readyState: 'loading',
    fullscreenElement: null, webkitFullscreenElement: null,
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    removeEventListener(name, fn) { listeners[name] = (listeners[name] || []).filter(item => item !== fn); },
    emit(name, event) { for (const fn of listeners[name] || []) fn(event); },
    createElement(tag) { return new Element(tag); },
    getElementById(id) { return [body, head].flatMap(node => [node, ...node.querySelectorAll('*')]).find(node => node.id === id) || null; },
    querySelectorAll(selector) {
      if (selector === 'video') return options.noPlayerVideo ? [] : [video];
      if (selector === 'div') return body.querySelectorAll('div');
      return [];
    },
    querySelector(selector) {
      if (selector === '[data-tv-player-menu-trigger="settings"]') return settings.getAttribute('data-tv-player-menu-trigger') === 'settings' ? settings : null;
      if (selector === '[data-tv-original-language]') return document.documentElement;
      if (selector.startsWith('.settings-menu')) return body.querySelectorAll('*').find(element => element.className === 'settings-menu') || null;
      return null;
    },
  };
  document.documentElement.setAttribute('data-tv-original-language', 'ja');

  const windowListeners = {};
  const storage = new Map();
  const window = {
    MOVIX_TV: tvMode, location: { pathname: options.route || '/watch/tv/123/s/1/e/1', search: '' },
    getComputedStyle(element) { return {
      display: 'block',
      visibility: element.className === 'settings-menu' &&
        document.documentElement.classList.contains('movix-tv-auto-source-selection')
        ? 'hidden' : 'visible',
      opacity: element.opacity || '1',
    }; },
    addEventListener(name, fn) { (windowListeners[name] ||= []).push(fn); },
    removeEventListener(name, fn) { windowListeners[name] = (windowListeners[name] || []).filter(item => item !== fn); },
    dispatchEvent(event) { for (const fn of windowListeners[event.type] || []) fn(event); },
  };
  const context = vm.createContext({
    window, document, HTMLElement: Element, HTMLVideoElement: Video,
    MutationObserver: class { observe() {} disconnect() {} },
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
  return { press, actions, document, playPause, poster, settings, episodesTrigger,
    episodeClicks, video, window, storage };
}

test('Home and detail posters and header shortcuts retain every key even with a stale player video', async () => {
  for (const route of ['/', '/movie/123', '/tv/123']) {
    const app = await harness(true, [], { route });
    app.settings.click(); // Adversarial: a visible .settings-menu elsewhere in the document.
    app.poster.focus();
    assert.equal(app.document.activeElement, app.poster, `${route}: poster keeps actual focus`);
    const time = app.video.currentTime;
    for (const [key, code] of [['ArrowLeft', 'ArrowLeft'], ['ArrowRight', 'ArrowRight'],
                               ['1', 'Digit1'], ['2', 'Digit2'], ['3', 'Digit3'], ['0', 'Digit0']]) {
      assert.equal(app.press(key, code).prevented, undefined, `${route}: ${key} belongs to page`);
    }
    assert.equal(app.video.currentTime, time);
    assert.equal(app.actions().length, 0);
    assert.equal(app.document.activeElement, app.poster);
  }
});

test('leaving Watch releases manual settings focus and all playback keys', async () => {
  const app = await harness();
  app.press('0', 'Digit0');
  await new Promise(resolve => setImmediate(resolve));
  app.press('ArrowDown');
  app.press('Enter');
  await new Promise(resolve => setImmediate(resolve));
  app.window.location.pathname = '/tv/123';
  app.poster.focus();
  assert.equal(app.document.activeElement, app.poster);
  assert.equal(app.press('ArrowRight').prevented, undefined);
  assert.equal(app.press('1', 'Digit1').prevented, undefined);
});

test('Watch loads its video without an automatic hidden source scan', async () => {
  const app = await harness();
  app.document.emit('DOMContentLoaded', {});
  await new Promise(resolve => setTimeout(resolve, 975));
  assert.equal(app.settings.clicks, 0);
  assert.equal(app.document.documentElement.classList.contains('movix-tv-auto-source-selection'), false);
  assert.equal(app.window.__MOVIX_TV_PLAYBACK.getActiveVideo(), app.video);
});

test('legacy remote HLS video-container still opens its real advanced panel', async () => {
  const app = await harness(true, [], { legacyRoot: true });
  assert.equal(app.window.__MOVIX_TV_PLAYBACK.getActiveVideo(), app.video);
  app.press('0', 'Digit0');
  await new Promise(resolve => setImmediate(resolve));
  app.press('ArrowDown');
  app.press('Enter');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.settings.clicks, 1);
  assert.equal(app.document.activeElement.getAttribute('data-tv-settings-tab'), 'quality');
  assert.equal(app.press('ArrowDown').prevented, true);
  assert.equal(app.document.activeElement.textContent, 'Qualité auto');
});

test('an actually focused Watch sources panel remains navigable while a series video loads', async () => {
  const app = await harness(true, [], { noPlayerVideo: true });
  app.settings.click(); // The existing Watch Sources control opens the real panel.
  const panel = app.document.body.querySelectorAll('*').find(item => item.className === 'settings-menu');
  const quality = panel.querySelector('[data-tv-settings-tab="quality"]');
  quality.focus();
  assert.equal(app.window.__MOVIX_TV_PLAYBACK.getActiveVideo(), null);
  assert.equal(app.press('ArrowDown').prevented, true);
  assert.equal(app.document.activeElement.textContent, 'Qualité auto');
  assert.equal(app.press('ArrowUp').prevented, true);
  assert.equal(app.document.activeElement, quality);
});

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

test('Sources avancées opens the real hidden-control settings panel and owns its D-pad', async () => {
  const app = await harness();
  app.settings.opacity = '0'; // The player control bar can be invisible on TV.
  app.press('0', 'Digit0');
  await new Promise(resolve => setImmediate(resolve));
  app.press('ArrowDown');
  app.press('Enter');
  await new Promise(resolve => setImmediate(resolve));

  const panel = app.document.body.querySelectorAll('*').find(item => item.className === 'settings-menu');
  assert.ok(panel, 'the player-owned settings panel was mounted');
  assert.equal(app.settings.clicks, 1);
  assert.equal(app.actions().length, 0);
  assert.equal(app.document.activeElement.getAttribute('data-tv-settings-tab'), 'quality');

  const before = app.video.currentTime;
  assert.equal(app.press('ArrowDown').prevented, true);
  assert.equal(app.document.activeElement.textContent, 'Qualité auto');
  assert.equal(app.press('ArrowUp').prevented, true);
  assert.equal(app.document.activeElement.getAttribute('data-tv-settings-tab'), 'quality');
  assert.equal(app.press('ArrowRight').prevented, true);
  assert.equal(app.document.activeElement.getAttribute('data-tv-settings-tab'), 'format');
  app.press('Enter');
  assert.equal(app.document.activeElement.clicks, 1);
  assert.equal(app.video.currentTime, before);
  app.playPause.focus(); // Remote React effect may still try to reclaim focus.
  assert.equal(app.document.activeElement.getAttribute('data-tv-settings-tab'), 'format');

  const back = { type: 'movix-tv-back', cancelable: true, preventDefault() { this.prevented = true; } };
  app.window.dispatchEvent(back);
  assert.equal(back.prevented, true);
  assert.equal(app.document.body.querySelectorAll('*').includes(panel), false);
});

test('manual Sources avancées reveals an already-open automatic scan without toggling it closed', async () => {
  const app = await harness();
  app.settings.click();
  app.document.documentElement.classList.add('movix-tv-auto-source-selection');
  app.press('0', 'Digit0');
  await new Promise(resolve => setImmediate(resolve));
  app.press('ArrowDown');
  app.press('Enter');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.settings.clicks, 1);
  assert.equal(app.document.documentElement.classList.contains('movix-tv-auto-source-selection'), false);
  assert.equal(app.document.activeElement.getAttribute('data-tv-settings-tab'), 'quality');
});

test('settings D-pad reaches quality scan, Nexus group and its real source button', async () => {
  const app = await harness(true, [
    { provider: 'nexus', label: 'Nexus VOSTFR', quality: 1080 },
    { provider: 'bravo', label: 'Bravo MULTI', quality: 720 },
  ]);
  const selected = [];
  app.window.addEventListener('sourceChange', event => selected.push(event.detail.url));
  app.press('0', 'Digit0');
  await new Promise(resolve => setImmediate(resolve));
  app.press('ArrowDown');
  app.press('Enter');
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(app.document.activeElement.getAttribute('data-tv-settings-tab'), 'quality');
  for (const label of ['Qualité auto', 'Vérification de la qualité', 'nexus', 'Nexus VOSTFR 1080p']) {
    assert.equal(app.press('ArrowDown').prevented, true);
    assert.equal(app.document.activeElement.textContent, label);
  }
  assert.ok(app.document.activeElement.scrollRequests > 0);
  app.press('Enter');
  assert.deepEqual(selected, ['Nexus VOSTFR']);
});

test('Épisodes opens the real list and Up Down Enter stay inside it', async () => {
  const app = await harness(true, [], { episodes: true });
  app.press('0', 'Digit0');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.actions().length, 4);
  app.press('ArrowDown');
  app.press('Enter');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.episodesTrigger.clicks, 1);
  assert.equal(app.actions().length, 0);
  assert.equal(app.document.activeElement.textContent, 'Épisode 1');
  const before = app.video.currentTime;
  app.press('ArrowDown');
  assert.equal(app.document.activeElement.textContent, 'Épisode 2');
  app.press('ArrowUp');
  assert.equal(app.document.activeElement.textContent, 'Épisode 1');
  assert.equal(app.video.currentTime, before);
  app.press('Enter');
  assert.deepEqual(app.episodeClicks, [1]);
});

test('Back closes Épisodes before transport or SPA navigation', async () => {
  const app = await harness(true, [], { episodes: true });
  app.press('0', 'Digit0');
  await new Promise(resolve => setImmediate(resolve));
  app.press('ArrowDown');
  app.press('Enter');
  await new Promise(resolve => setImmediate(resolve));
  const back = { type: 'movix-tv-back', cancelable: true, preventDefault() { this.prevented = true; } };
  app.window.dispatchEvent(back);
  assert.equal(back.prevented, true);
  assert.deepEqual(app.episodeClicks, []);
  assert.equal(app.document.body.querySelectorAll('div').some(item => item.className.includes('z-[11000]')), false);
});

test('Épisodes takes focus on its season control while episode rows are still loading', async () => {
  const app = await harness(true, [], { episodes: true, episodesLoading: true });
  app.press('0', 'Digit0');
  await new Promise(resolve => setImmediate(resolve));
  app.press('ArrowDown');
  app.press('Enter');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.document.activeElement.textContent, 'Saison 1');
  await new Promise(resolve => setTimeout(resolve, 25));
  app.press('ArrowDown');
  assert.equal(app.document.activeElement.textContent, 'Épisode 1');
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

test('0 waits for the real fullscreen exit before focusing the first menu row', async () => {
  const app = await harness();
  app.document.fullscreenElement = app.video;
  app.document.exitFullscreen = async () => { app.document.fullscreenElement = null; };
  app.press('0', 'Digit0');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.document.fullscreenElement, null);
  assert.equal(app.document.activeElement, app.actions()[0]);
});

test('injected resolver actually clicks the quality-ranked compatible Nexus/Bravo source', async () => {
  const app = await harness(true, [
    { provider: 'nexus', label: 'Nexus VOSTFR', quality: 720 },
    { provider: 'bravo', label: 'Bravo MULTI', quality: 1080, audio: 'ja,fr', subtitles: 'fr' },
    { provider: 'bravo', label: 'Bravo MULTI wrong audio', quality: 2160, audio: 'en', subtitles: 'fr' },
    { provider: 'nexus', label: 'Nexus VF', quality: 1080, audio: 'fr' },
  ]);
  const selected = [];
  app.window.addEventListener('sourceChange', event => selected.push(event.detail.url));
  const vostfr = await app.window.__MOVIX_TV_PLAYBACK.selectBestProfileSource('vo-fr');
  assert.equal(vostfr.status, 'selected');
  assert.equal(vostfr.provider, 'bravo');
  assert.equal(vostfr.quality, 1080);
  assert.equal(vostfr.qualityVerified, true);
  assert.deepEqual(selected, ['Bravo MULTI']);
  const vf = await app.window.__MOVIX_TV_PLAYBACK.selectBestProfileSource('vf');
  assert.equal(vf.status, 'selected');
  assert.equal(vf.provider, 'nexus');
  assert.deepEqual(selected, ['Bravo MULTI', 'Nexus VF']);
});

test('VOSTFR fallback is title-local and leaves the saved preference untouched', async () => {
  const app = await harness(true, [
    { provider: 'nexus', label: 'Nexus VF', quality: 1080, audio: 'fr' },
  ]);
  const result = await app.window.__MOVIX_TV_PLAYBACK.selectBestProfileSource('vo-fr', { allowVfFallback: true });
  assert.equal(result.status, 'selected');
  assert.equal(result.profile, 'vf');
  assert.equal(result.requestedProfile, 'vo-fr');
  assert.equal(app.storage.get('movix.tv.playback.profile.v1'), 'vo-fr');
});

test('a legacy boolean resolver is not treated as successful selection', async () => {
  const app = await harness(true, [
    { provider: 'nexus', label: 'Nexus VOSTFR', quality: 720 },
  ]);
  app.window.__MOVIX_TV_PROFILE_RESOLVER = true;
  const selected = [];
  app.window.addEventListener('sourceChange', event => selected.push(event.detail.url));
  const result = await app.window.__MOVIX_TV_PLAYBACK.selectBestProfileSource('vo-fr');
  assert.equal(result.status, 'selected');
  assert.deepEqual(selected, ['Nexus VOSTFR']);
});

test('a versioned frontend must acknowledge the actual source before delegation succeeds', async () => {
  const app = await harness();
  app.window.__MOVIX_TV_PROFILE_RESOLVER = { version: 2 };
  app.window.addEventListener('movix-tv-playback-profile-change', event => {
    app.window.dispatchEvent({
      type: 'movix-tv-playback-profile-result',
      detail: { status: 'selected', requestedProfile: event.detail.profile,
        profile: event.detail.profile, provider: 'nexus', quality: 1080 },
    });
  });
  const result = await app.window.__MOVIX_TV_PLAYBACK.selectBestProfileSource('vo-fr');
  assert.equal(result.status, 'selected');
  assert.equal(result.quality, 1080);
  assert.equal(app.settings.clicks, 0);
});
