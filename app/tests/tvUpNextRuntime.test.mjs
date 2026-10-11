import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function buildScript() {
  const tsSource = await readFile(new URL('../src/injection/tv-upnext-runtime.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(tsSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports });
  return exports.buildTvUpNextRuntime();
}

function simulate(script, { remaining = 190, duration = 3780, storedPrefs = null } = {}) {
  let tick = () => {};
  let keydown = () => {};
  let focusCount = 0;
  class Element {
    constructor(classes = []) {
      this.classList = { contains: value => classes.includes(value) };
      this.attrs = {};
      this.styleValues = {};
      this.style = {
        getPropertyValue: name => this.styleValues[name] || '',
        setProperty: (name, value) => { this.styleValues[name] = value; },
        removeProperty: name => { delete this.styleValues[name]; },
      };
    }
    getAttribute(key) { return this.attrs[key] || null; }
    setAttribute(key, value) { this.attrs[key] = value; }
    removeAttribute(key) { delete this.attrs[key]; }
    querySelectorAll(name) { return name === 'button' ? this.buttons : []; }
  }
  const video = { duration, currentTime: duration - remaining };
  const root = { querySelector: selector => selector === 'video' ? video : null,
    querySelectorAll: selector => selector === '[data-player-controls]' ? [panel] : [] };
  const veil = new Element(['inset-y-0', 'right-0', 'bg-gradient-to-l']);
  veil.setAttribute('aria-hidden', 'true');
  const panel = new Element(['inset-y-0', 'right-0', 'w-[38%]']);
  panel.parentElement = { children: [veil, panel] };
  panel.buttons = [
    { focus() { focusCount += 1; document.activeElement = this; } },
    { focus() { focusCount += 1; document.activeElement = this; } },
  ];
  panel.contains = target => panel.buttons.includes(target);
  const document = {
    readyState: 'complete',
    activeElement: null,
    querySelector: selector => selector === '[data-hls-player-root]' ? root : null,
  };
  const window = {
    MOVIX_TV: true,
    localStorage: { getItem: key => key === 'playerNextContent' && storedPrefs
      ? JSON.stringify(storedPrefs) : null },
    setInterval(fn) { tick = fn; },
    addEventListener(name, fn) { if (name === 'keydown') keydown = fn; },
  };
  vm.runInNewContext(script, { window, document, HTMLElement: Element, Number, Array, JSON });
  return {
    panel, veil, video, document, run: () => tick(),
    press(key) { let blocked = false; keydown({ key, preventDefault() { blocked = true; }, stopPropagation() {}, stopImmediatePropagation() {} }); return blocked; },
    get focusCount() { return focusCount; },
  };
}

test('TV runtime is only constructed when enabled in the WebView builder', async () => {
  const injection = await readFile(new URL('../src/injection/inject.ts', import.meta.url), 'utf8');
  assert.match(injection, /options\.tvMode \? buildTvUpNextRuntime\(\) : ''/);
  assert.match(injection, /\$\{tvUpNextRuntime\}/);
});

test('old remotely served 95% panel is hidden at 3m10 and shown at 60s', async () => {
  const script = await buildScript();
  const state = simulate(script);
  assert.equal(state.panel.style.getPropertyValue('display'), 'none');
  assert.equal(state.veil.style.getPropertyValue('display'), 'none');
  assert.equal(state.focusCount, 0);
  state.video.currentTime = 3780 - 61;
  state.run();
  assert.equal(state.panel.style.getPropertyValue('display'), 'none');
  state.video.currentTime = 3780 - 60;
  state.run();
  assert.equal(state.panel.style.getPropertyValue('display'), '');
  assert.equal(state.veil.style.getPropertyValue('display'), '');
  assert.equal(state.focusCount, 1);
  state.run();
  assert.equal(state.focusCount, 1, 'should not steal focus repeatedly');
  assert.equal(state.panel.style.getPropertyValue('width'), 'min(28%, 360px)');
});

test('short-format 25min series uses 30-second protection window', async () => {
  const script = await buildScript();
  const state = simulate(script, { duration: 1500, remaining: 45 });
  assert.equal(state.panel.style.getPropertyValue('display'), 'none');
  state.video.currentTime = 1500 - 30;
  state.run();
  assert.equal(state.panel.style.getPropertyValue('display'), '');
});

test('explicit user-configured early threshold is preserved in TV APK', async () => {
  const script = await buildScript();
  const state = simulate(script, { storedPrefs: { trigger: 'threshold', thresholdMode: 'percentage', percentage: 95 } });
  assert.equal(state.panel.style.getPropertyValue('display'), '');
  assert.equal(state.focusCount, 1);
});

test('D-pad navigates between primary and Later, never reaching video shortcuts', async () => {
  const script = await buildScript();
  const state = simulate(script, { remaining: 50 });
  assert.equal(state.document.activeElement, state.panel.buttons[1]);
  assert.equal(state.press('ArrowUp'), true);
  assert.equal(state.document.activeElement, state.panel.buttons[0]);
  assert.equal(state.press('ArrowDown'), true);
  assert.equal(state.document.activeElement, state.panel.buttons[1]);
});
