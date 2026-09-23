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

test('runtime consumes eligible D-pad arrows even at a spatial graph edge', () => {
  const runtime = buildTvDpadRuntime('(function () { return null; })', '/* dom discovery */');
  const move = runtime.indexOf('api.moveFocus(direction);');
  const prevent = runtime.indexOf('event.preventDefault();', move);
  assert.ok(move >= 0);
  assert.ok(prevent > move);
  assert.doesNotMatch(runtime, /if \(!moved\) return false/);
});

test('runtime handles four D-pad arrows and centers only the relevant panel after focus selection', () => {
  const runtime = buildTvDpadRuntime('(function () { return null; })', '/* dom discovery */');
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    assert.match(runtime, new RegExp(key));
  }
  assert.match(runtime, /focus\(\{ preventScroll: true \}\)/);
  assert.match(runtime, /centerVerticalTarget/);
  assert.match(runtime, /centerCarouselTarget/);
  assert.match(runtime, /window\.innerHeight \/ 2/);
  assert.match(runtime, /scroller\.scrollTo\(\{ left, top: scroller\.scrollTop, behavior: 'auto' \}\)/);
  assert.match(runtime, /window\.scrollTo\(\{ left: pageX, top: pageY, behavior: 'auto' \}\)/);
  assert.match(runtime, /revealFocusedElement\(next\.element, direction\)/);
  assert.match(runtime, /data-tv-consume-arrows/);
  assert.match(runtime, /data-tv-player-control/);
});

test('bootstrap replacement is idempotent and does not duplicate key handlers', () => {
  const runtime = buildTvDpadRuntime('(function () { return null; })', '/* dom discovery */');
  const removeIndex = runtime.indexOf("document.removeEventListener('keydown', api.keydownHandler, true)");
  const addIndex = runtime.indexOf("document.addEventListener('keydown', handleDpadKeydown, true)");
  assert.ok(removeIndex >= 0);
  assert.ok(addIndex > removeIndex);
  assert.match(runtime, /api\.keydownHandler = handleDpadKeydown/);
  assert.match(runtime, /destroyDpadRuntime/);
});

test('dynamic content is discovered at navigation time instead of cached', () => {
  const runtime = buildTvDpadRuntime('(function () { return null; })', '/* dom discovery */');
  const moveStart = runtime.indexOf('api.moveFocus =');
  const discovery = runtime.indexOf('api.getTVFocusCandidates()', moveStart);
  assert.ok(moveStart >= 0);
  assert.ok(discovery > moveStart);
  // O may use a MutationObserver for guarded focus-loss recovery, but
  // candidate discovery itself must remain lazy and uncached.
  assert.doesNotMatch(runtime, /cachedCandidates|candidateObserver/);
  assert.match(runtime, /new MutationObserver\(scheduleFocusRecovery\)/);
});

test('TV D-pad runtime is injected only behind tvMode', async () => {
  const inject = await text('src/injection/inject.ts');
  assert.match(inject, /const tvDpadRuntime = options\.tvMode/);
  assert.match(inject, /buildTvDpadRuntime/);
  assert.match(inject, /buildTvDomDiscoveryRuntime/);
  assert.match(inject, /findNextFocusTarget\.toString\(\)/);
  assert.match(inject, /\$\{tvDpadRuntime\}/);
});
