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
  shouldSpatialNavigationHandleSnapshot,
  buildTvDpadRuntime,
} = await importTypeScript('src/injection/tv-dpad-runtime.ts');

test('text editing controls retain native arrow behavior', () => {
  assert.equal(shouldSpatialNavigationHandleSnapshot({ tagName: 'input', inputType: 'text' }), false);
  assert.equal(shouldSpatialNavigationHandleSnapshot({ tagName: 'textarea' }), false);
  assert.equal(shouldSpatialNavigationHandleSnapshot({ tagName: 'select' }), false);
  assert.equal(shouldSpatialNavigationHandleSnapshot({ tagName: 'input', inputType: 'range' }), false);
  assert.equal(shouldSpatialNavigationHandleSnapshot({ tagName: 'div', contentEditable: true }), false);
});

test('button-like controls can participate in spatial navigation', () => {
  assert.equal(shouldSpatialNavigationHandleSnapshot({ tagName: 'button' }), true);
  assert.equal(shouldSpatialNavigationHandleSnapshot({ tagName: 'input', inputType: 'button' }), true);
});

test('explicit arrow consumers and sliders are protected', () => {
  assert.equal(shouldSpatialNavigationHandleSnapshot({ tagName: 'button', consumesArrows: true }), false);
  assert.equal(shouldSpatialNavigationHandleSnapshot({ tagName: 'div', role: 'slider' }), false);
});

test('runtime only prevents default after a successful move', () => {
  const runtime = buildTvDpadRuntime('(function () { return null; })', '/* dom discovery */');
  const noTarget = runtime.indexOf('if (!moved) return false;');
  const prevent = runtime.indexOf('event.preventDefault();');
  assert.ok(noTarget >= 0);
  assert.ok(prevent > noTarget);
});

test('runtime handles four D-pad arrows and scrolls only after focus selection', () => {
  const runtime = buildTvDpadRuntime('(function () { return null; })', '/* dom discovery */');
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    assert.match(runtime, new RegExp(key));
  }
  assert.match(runtime, /focus\(\{ preventScroll: true \}\)/);
  assert.match(runtime, /scrollIntoView/);
  assert.match(runtime, /block: 'nearest'/);
  assert.match(runtime, /inline: 'nearest'/);
  assert.match(runtime, /data-tv-consume-arrows/);
  assert.match(runtime, /data-tv-player-control/);
});

test('TV D-pad runtime is injected only behind tvMode', async () => {
  const inject = await text('src/injection/inject.ts');
  assert.match(inject, /const tvDpadRuntime = options\.tvMode/);
  assert.match(inject, /buildTvDpadRuntime/);
  assert.match(inject, /buildTvDomDiscoveryRuntime/);
  assert.match(inject, /findNextFocusTarget\.toString\(\)/);
  assert.match(inject, /\$\{tvDpadRuntime\}/);
});
