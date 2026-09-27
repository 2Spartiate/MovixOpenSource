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
    getBoundingClientRect() { return this.rect || { left: 0, top: 0, right: 320, bottom: 180, width: 320, height: 180 }; }
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
    click() { this.clicks++; for (const callback of this.listeners.click || []) callback(); }
    contains(target) { return target === this || this.children.some(child => child.contains(target)); }
    matches(selector) { return selector.split(',').some(part => {
      const value = part.trim();
      return value.toUpperCase() === this.tagName ||
        (value === '[role="slider"]' && this.getAttribute('role') === 'slider') ||
        (value === '[role="button"]' && this.getAttribute('role') === 'button');
    }); }
    focus() { document.activeElement = this; document.emit('focusin', { target: this }); }
    scrollIntoView() { this.scrollRequests = (this.scrollRequests || 0) + 1; }
    closest(selector) {
      if (selector === '[data-tv-playback-quick-menu]') {
        for (let node = this; node; node = node.parentElement) {
          if (node.hasAttribute('data-tv-playback-quick-menu')) return node;
        }
      }
      if (selector.includes('button') && this.matches(selector)) return this;
      if (selector === '[data-tv-card], [data-tv-carousel-row]') {
        for (let node = this; node; node = node.parentElement) {
          if (node.hasAttribute('data-tv-card') || node.hasAttribute('data-tv-carousel-row')) return node;
        }
      }
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
      if (selector === '.movix-tv-menu-action') return this.querySelectorAll('.movix-tv-menu-action')[0] || null;
      if (selector === '[data-tv-player-play-pause]') return this.querySelectorAll('*').find(element => element.hasAttribute('data-tv-player-play-pause')) || null;
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
  if (options.posterInsidePlayerRoot) {
    poster.setAttribute('data-tv-card', '');
    root.appendChild(poster);
  }
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
  const secondaryClicks = [];
  settings.addEventListener('click', () => {
    const existing = body.querySelectorAll('*').find(element => element.className === 'settings-menu');
    if (existing) { existing.remove(); return; }
    const mountPanel = () => {
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
            if (options.secondarySourceActions) {
              choice.rect = { left: 20, right: 250, top: 200, bottom: 240, width: 230, height: 40 };
            }
            if (source.audio) choice.setAttribute('data-tv-source-audio', source.audio);
            if (source.subtitles) choice.setAttribute('data-tv-source-subtitles', source.subtitles);
            choice.addEventListener('click', () => window.dispatchEvent(new context.CustomEvent('sourceChange', {
              detail: { type: provider === 'bravo' ? 'bravo' : 'nexus_hls', url: source.label },
            })));
            list.appendChild(choice);
            if (options.secondarySourceActions) {
              for (const [label, left] of [['Épingler', 260], ['Copier', 300]]) {
                const action = new Element('button');
                action.textContent = label;
                action.rect = { left, right: left + 30, top: 204, bottom: 236, width: 30, height: 32 };
                action.addEventListener('click', () => secondaryClicks.push(label));
                list.appendChild(action);
              }
            }
          }
          scope.appendChild(list);
        }
      }
      body.appendChild(panel);
      if (options.settingsFocusOnMount) quality.focus();
    };
    if (options.settingsDelayMs) setTimeout(mountPanel, options.settingsDelayMs);
    else mountPanel();
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
      if (selector === 'button, [role="button"]') return body.querySelectorAll('button');
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
    const event = {
      key, code, keyCode,
      preventDefault() { this.prevented = true; },
      stopPropagation() { this.stopped = true; },
      stopImmediatePropagation() { this.stopped = true; this.immediate = true; },
    };
    for (const fn of windowListeners.keydown || []) {
      fn(event);
      if (event.immediate) break;
    }
    if (!event.stopped) document.emit('keydown', event);
    return event;
  }
  const actions = () => document.getElementById('movix-tv-injected-playback-menu')?.querySelectorAll('.movix-tv-menu-action') || [];
  return { press, actions, document, playPause, poster, settings, episodesTrigger,
    episodeClicks, secondaryClicks, video, window, storage };
}

const nextTurn = () => new Promise(resolve => setImmediate(resolve));

test('TV injection leaves Home and detail posters, arrows and 1/2/3 to the page', async () => {
  for (const route of ['/', '/movie/123', '/tv/123']) {
    const app = await harness(true, [], { route });
    app.poster.focus();
    app.document.emit('DOMContentLoaded', {});
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(app.document.activeElement, app.poster);
    for (const [key, code] of [['ArrowLeft', 'ArrowLeft'], ['ArrowRight', 'ArrowRight'],
                               ['1', 'Digit1'], ['2', 'Digit2'], ['3', 'Digit3'], ['0', 'Digit0']]) {
      assert.equal(app.press(key, code).prevented, undefined, route + ': ' + key);
    }
    assert.equal(app.actions().length, 0);
  }
});

test('non-TV injection does not intercept playback keys', async () => {
  const app = await harness(false);
  for (const key of ['0', '1', 'ArrowDown', 'ArrowRight']) {
    assert.equal(app.press(key).prevented, undefined);
  }
  assert.equal(app.actions().length, 0);
});

test('V13 Watch video retains its initial source without a hidden scan', async () => {
  const app = await harness();
  app.document.emit('DOMContentLoaded', {});
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(app.settings.clicks, 0);
  assert.equal(app.window.__MOVIX_TV_PLAYBACK.getActiveVideo(), app.video);
});

test('0 exits fullscreen first and opens the one-action movie menu', async () => {
  const app = await harness();
  const root = app.video.parentElement;
  app.document.fullscreenElement = root;
  app.document.exitFullscreen = async () => { app.document.fullscreenElement = null; };
  assert.equal(app.press('0', 'Digit0').prevented, true);
  await nextTurn();
  assert.equal(app.document.fullscreenElement, null);
  assert.equal(app.actions().length, 1);
  assert.match(app.actions()[0].textContent, /Qualité et langues/);
  assert.equal(app.document.activeElement, app.actions()[0]);
  const before = app.video.currentTime;
  for (const key of ['ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft']) {
    assert.equal(app.press(key).prevented, true);
  }
  assert.equal(app.video.currentTime, before);
  assert.equal(app.press('0', 'Digit0').prevented, true);
  assert.equal(app.actions().length, 0);
});

test('series menu navigates two real actions and selects an episode with D-pad and OK', async () => {
  const app = await harness(true, [], { episodes: true });
  app.press('0', 'Digit0');
  await nextTurn();
  const rows = app.actions();
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /Épisodes/);
  assert.match(rows[1].textContent, /Qualité et langues/);
  assert.equal(app.document.activeElement, rows[0]);
  assert.equal(app.press('ArrowDown').prevented, true);
  assert.equal(app.document.activeElement, rows[1]);
  assert.equal(app.press('ArrowUp').prevented, true);
  assert.equal(app.document.activeElement, rows[0]);
  app.press('Enter');
  await nextTurn();
  assert.equal(app.episodesTrigger.clicks, 1);
  assert.equal(app.actions().length, 0);
  assert.equal(app.document.activeElement.textContent, 'Épisode 1');
  assert.equal(app.press('ArrowDown').prevented, true);
  assert.equal(app.document.activeElement.textContent, 'Épisode 2');
  app.press('Enter');
  assert.deepEqual(app.episodeClicks, [2]);
});

test('Qualité et langues opens the real settings panel and navigates its source controls', async () => {
  const app = await harness(true, [
    { provider: 'nexus', label: 'Nexus VOSTFR', quality: 1080 },
    { provider: 'bravo', label: 'Bravo MULTI', quality: 720 },
  ]);
  const selected = [];
  app.window.addEventListener('sourceChange', event => selected.push(event.detail.url));
  app.settings.opacity = '0'; // Hidden player toolbar remains clickable from the quick menu.
  app.press('0', 'Digit0');
  await nextTurn();
  app.press('Enter');
  await nextTurn();
  assert.equal(app.settings.clicks, 1);
  assert.equal(app.actions().length, 0);
  assert.equal(app.document.activeElement.getAttribute('data-tv-settings-tab'), 'quality');
  assert.equal(app.window.__MOVIX_TV_PLAYBACK.focusPlayPause(), false);
  for (const label of ['Qualité auto', 'Vérification de la qualité', 'nexus', 'Nexus VOSTFR 1080p']) {
    assert.equal(app.press('ArrowDown').prevented, true);
    assert.equal(app.document.activeElement.textContent, label);
  }
  app.press('Enter');
  assert.deepEqual(selected, ['Nexus VOSTFR']);
  const back = { type: 'movix-tv-back', cancelable: true, preventDefault() { this.prevented = true; } };
  app.window.dispatchEvent(back);
  assert.equal(back.prevented, true);
  assert.equal(app.document.body.querySelector('.settings-menu'), null);
});

test('quick menu disappears before a delayed real settings panel mounts', async () => {
  const app = await harness(true, [], { settingsDelayMs: 80 });
  app.press('0', 'Digit0');
  await nextTurn();
  app.press('Enter');
  assert.equal(app.actions().length, 0);
  const time = app.video.currentTime;
  assert.equal(app.press('ArrowRight').prevented, true);
  assert.equal(app.video.currentTime, time);
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(app.document.activeElement.getAttribute('data-tv-settings-tab'), 'quality');
  assert.equal(app.press('ArrowDown').prevented, true);
  assert.equal(app.document.activeElement.textContent, 'Qualité auto');
});
