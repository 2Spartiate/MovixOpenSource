import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const moduleFile = new URL('../src/injection/ad-page-protection.ts', import.meta.url);

async function loadBuilder() {
  const source = await readFile(moduleFile, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(transpiled, { exports });
  return exports.buildAdPageProtection;
}

function mountAdPage(script, { origin, bodyText, title = '', historyLength = 4 }) {
  let focused = null;
  let historyDelta = null;
  let redirectedTo = null;
  let observer;
  const listeners = new Map();
  function node(tagName) {
    return {
      tagName, children: [], attributes: {}, style: {},
      textContent: '',
      appendChild(child) { this.children.push(child); return child; },
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(type, cb) { this['on' + type] = cb; },
      focus() { focused = this; },
    };
  }
  const body = node('body');
  body.innerText = bodyText;
  body.replaceChildren = (...newChildren) => { body.children = newChildren; body.innerText = newChildren.map(x => x.textContent).join(' '); };
  const head = node('head');
  const cookieHeadMarker = node('meta');
  head.appendChild(cookieHeadMarker);
  const document = {
    readyState: 'complete',
    body, head, title,
    createElement: node,
    addEventListener(type, listener) { listeners.set('document:' + type, listener); },
  };
  const location = {
    origin,
    get href() { return origin + '/advert'; },
    replace(url) { redirectedTo = url; },
  };
  const win = {
    location,
    history: { length: historyLength, go(n) { historyDelta = n; } },
    addEventListener(type, listener) { listeners.set('window:' + type, listener); },
    requestAnimationFrame(cb) { cb(); },
    setTimeout() { return 1; },
  };
  win.top = win;
  const MutationObserver = class {
    constructor(cb) { this.callback = cb; observer = this; }
    observe() {}
    disconnect() {}
  };
  vm.runInNewContext(script, { window: win, document, MutationObserver, setTimeout: win.setTimeout });
  return {
    document, body, head, marker: cookieHeadMarker,
    get focused() { return focused; },
    get historyDelta() { return historyDelta; },
    get redirectedTo() { return redirectedTo; },
    mutate(text) { body.innerText = text; observer?.callback(); },
    clickTarget(target) {
      listeners.get('window:click')?.({
        target,
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() {},
      });
    },
  };
}

test('remote page containing VPN is replaced and the HTML head is untouched', async () => {
  const build = await loadBuilder();
  const page = mountAdPage(build('https://movix.luxe'), {
    origin: 'https://advertiser.example', bodyText: 'Get our secure VPN now',
  });
  assert.equal(page.body.children.length, 1);
  assert.equal(page.head.children[0], page.marker);
  assert.equal(page.focused.tagName, 'button');
  assert.match(page.body.children[0].children[0].textContent, /Protection antipub/);
  page.clickTarget(page.focused);
  assert.equal(page.historyDelta, -2);
});

test('remote DOM changes to porn or porno trigger protection', async () => {
  const build = await loadBuilder();
  for (const word of ['porn', 'porno', 'VPN']) {
    const page = mountAdPage(build('https://movix.luxe'), {
      origin: 'https://ads.example', bodyText: 'Video unavailable',
    });
    assert.equal(page.body.children.length, 0);
    page.mutate('Try our ' + word + ' offer');
    assert.equal(page.body.children.length, 1, word);
  }
});

test('trusted Movix page and benign remote pages are left alone', async () => {
  const build = await loadBuilder();
  const own = mountAdPage(build('https://movix.luxe'), {
    origin: 'https://movix.luxe', bodyText: 'VPN setup and films porno in a documentary',
  });
  assert.equal(own.body.children.length, 0);
  const remote = mountAdPage(build('https://video.example'), {
    origin: 'https://another.example', bodyText: 'Video unavailable - retry player',
  });
  assert.equal(remote.body.children.length, 0);
});

test('invalid trusted origin fails closed rather than rewriting unrelated pages', async () => {
  const build = await loadBuilder();
  const page = mountAdPage(build(''), {
    origin: 'https://external.example', bodyText: 'VPN now',
  });
  assert.equal(page.body.children.length, 0);
});
