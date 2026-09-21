import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

async function importTypeScript(relativePath) {
  const source = await text(relativePath);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const {
  TV_FOCUSABLE_SELECTOR,
  isTVFocusableSnapshot,
  buildTvDomDiscoveryRuntime,
} = await importTypeScript('src/injection/tv-focus-dom.ts');

const visible = {
  connected: true,
  display: 'block',
  visibility: 'visible',
  width: 100,
  height: 40,
};

test('visible button is included', () => {
  assert.equal(isTVFocusableSnapshot({ ...visible, tagName: 'button' }), true);
});

test('link with href is included', () => {
  assert.equal(isTVFocusableSnapshot({ ...visible, tagName: 'a', hasHref: true }), true);
});

test('text input is included', () => {
  assert.equal(isTVFocusableSnapshot({ ...visible, tagName: 'input', inputType: 'text' }), true);
});

test('disabled control is excluded', () => {
  assert.equal(isTVFocusableSnapshot({ ...visible, tagName: 'button', disabled: true }), false);
  assert.equal(isTVFocusableSnapshot({ ...visible, tagName: 'button', ariaDisabled: true }), false);
});

test('hidden controls are excluded', () => {
  assert.equal(isTVFocusableSnapshot({ ...visible, tagName: 'button', display: 'none' }), false);
  assert.equal(isTVFocusableSnapshot({ ...visible, tagName: 'button', visibility: 'hidden' }), false);
  assert.equal(isTVFocusableSnapshot({ ...visible, tagName: 'button', width: 0 }), false);
});

test('tabindex -1 is excluded', () => {
  assert.equal(isTVFocusableSnapshot({ ...visible, tagName: 'div', tabIndex: -1 }), false);
});

test('data-tv-ignore-focus policy excludes a candidate', () => {
  assert.equal(isTVFocusableSnapshot({ ...visible, tagName: 'button', ignored: true }), false);
});

test('explicit data-tv-focus can make a non-semantic element focusable', () => {
  assert.equal(isTVFocusableSnapshot({ ...visible, tagName: 'div', explicitTVFocus: true }), true);
});

test('selector covers native controls and explicit stable TV markers', () => {
  for (const fragment of ['button', 'a[href]', 'input', 'select', 'textarea', '[role="button"]', '[tabindex]', '[data-tv-focus]']) {
    assert.match(TV_FOCUSABLE_SELECTOR, new RegExp(fragment.replace(/[\[\]]/g, '\\$&')));
  }
});

test('runtime discovers dynamic DOM lazily on every invocation', () => {
  const runtime = buildTvDomDiscoveryRuntime();
  assert.match(runtime, /getTVFocusableElements\s*=\s*\(\)\s*=>/);
  assert.match(runtime, /document\.querySelectorAll\(selector\)/);
  assert.doesNotMatch(runtime, /const\s+cachedElements|MutationObserver/);
  assert.match(runtime, /data-tv-ignore-focus/);
  assert.match(runtime, /data-tv-focus-group/);
});
