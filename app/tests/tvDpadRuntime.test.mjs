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
  findNextCardRowTarget,
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


const rowRect = (left, top, width = 900, height = 180) => ({
  left, top, right: left + width, bottom: top + height, width, height,
  centerX: left + width / 2, centerY: top + height / 2,
});
const cardRect = (left, top, width = 120, height = 170) => ({
  left, top, right: left + width, bottom: top + height, width, height,
  centerX: left + width / 2, centerY: top + height / 2,
});

test('vertical poster navigation chooses the nearest row before horizontal alignment', () => {
  const currentRow = {};
  const rowAbove = {};
  const farRowAbove = {};
  const current = cardRect(700, 500);

  const picked = findNextCardRowTarget(
    current,
    currentRow,
    rowRect(0, 480),
    [
      { value: 'near-row-left', rect: cardRect(80, 280), rowKey: rowAbove, rowRect: rowRect(0, 260) },
      { value: 'far-row-aligned', rect: cardRect(700, 80), rowKey: farRowAbove, rowRect: rowRect(0, 60) },
    ],
    'up',
  );

  assert.equal(picked?.value, 'near-row-left');
});

test('within the chosen row the horizontally closest poster wins', () => {
  const currentRow = {};
  const rowAbove = {};
  const picked = findNextCardRowTarget(
    cardRect(500, 500),
    currentRow,
    rowRect(0, 480),
    [
      { value: 'left', rect: cardRect(80, 280), rowKey: rowAbove, rowRect: rowRect(0, 260) },
      { value: 'closest', rect: cardRect(540, 280), rowKey: rowAbove, rowRect: rowRect(0, 260) },
    ],
    'up',
  );
  assert.equal(picked?.value, 'closest');
});

test('runtime keeps horizontal movement inside the row and excludes header chrome by default', () => {
  const runtime = buildTvDpadRuntime('(function () { return null; })', '/* dom discovery */');
  assert.match(runtime, /getAdjacentCardInRow/);
  assert.match(runtime, /horizontal && currentRow instanceof HTMLElement/);
  assert.match(runtime, /api\.headerNavigationEnabled === true[\s\S]{0,100}!isHeaderElement\(candidate\.element\)/);
  assert.match(runtime, /Header chrome is not part of ordinary D-pad navigation/);
  assert.match(runtime, /pageIsAtRealTop/);
  assert.match(runtime, /window\.scrollTo\(\{ top: 0/);
  assert.match(runtime, /findNextCardRowTarget/);
});


test('empty page focus enters the explicit primary hero CTA before cards/header', () => {
  const runtime = buildTvDpadRuntime('(function () { return null; })', '/* dom discovery */');
  assert.match(runtime, /const primary = elements\.find\(element => element\.hasAttribute\('data-tv-primary-focus'\)\)/);
  assert.match(runtime, /data-tv-autofocus[\s\S]{0,180}primary[\s\S]{0,180}contentCard/);
  assert.match(runtime, /if \(pageFocusIsEmpty\(\)\) \{\s*return api\.ensureInitialFocus\(\)/);
});

test('Embla fallback clicks the live hidden arrow only when focused card reaches the viewport edge', () => {
  const runtime = buildTvDpadRuntime('(function () { return null; })', '/* dom discovery */');
  assert.match(runtime, /button\[data-tv-carousel-arrow\]/);
  assert.match(runtime, /requestAnimationFrame\(\(\) => requestAnimationFrame\(nudgeIfNeeded\)\)/);
  assert.match(runtime, /direction === 'right' \? arrows\[arrows\.length - 1\] : arrows\[0\]/);
  assert.match(runtime, /arrow\.click\(\)/);
});


test('accidental Home header focus exits to hero while explicit Search Down restores content', () => {
  const runtime = buildTvDpadRuntime('(function () { return null; })', '/* dom discovery */');
  assert.match(runtime, /api\.headerNavigationEnabled !== true/);
  assert.match(runtime, /eventTarget\.closest\('header'\)/);
  assert.match(runtime, /const heroPlay = getHeroPlay\(\)/);
  assert.match(runtime, /data-tv-header-shortcut'\) === 'search'/);
  assert.match(runtime, /api\.restoreContentFocus\(\)/);
});

test('header gating detects internal scrolling from hero geometry, not only window.scrollY', () => {
  const runtime = buildTvDpadRuntime('(function () { return null; })', '/* dom discovery */');
  assert.match(runtime, /document\.documentElement\?\.scrollTop/);
  assert.match(runtime, /document\.body\?\.scrollTop/);
  assert.match(runtime, /hero\.getBoundingClientRect\(\)/);
  assert.match(runtime, /rect\.top < 40/);
});

test('TV remote shortcuts map search, explore and account without entering header through arrows', () => {
  const runtime = buildTvDpadRuntime('(function () { return null; })', '/* dom discovery */');

  assert.match(runtime, /SEARCH=84, ASSIST=219, VOICE_ASSIST=231/);
  assert.match(runtime, /code === 84 \|\| code === 219 \|\| code === 231/);
  assert.match(runtime, /return 'search'/);

  assert.match(runtime, /MENU=82, SETTINGS=176/);
  assert.match(runtime, /code === 82 \|\| code === 176/);
  assert.match(runtime, /return 'explore'/);

  assert.match(runtime, /PROFILE_SWITCH=288/);
  assert.match(runtime, /code === 288/);
  assert.match(runtime, /return 'account'/);

  assert.match(runtime, /const activateHeaderShortcut = \(kind\) =>/);
  assert.match(runtime, /data-tv-header-shortcut="/);
  assert.match(runtime, /api\.headerNavigationEnabled = true/);
  assert.match(runtime, /rememberCurrentContentFocus/);
});

test('header focus never overwrites the remembered content anchor', () => {
  const runtime = buildTvDpadRuntime('(function () { return null; })', '/* dom discovery */');
  assert.match(runtime, /if \(isHeaderElement\(target\)\) \{/);
  assert.match(runtime, /api\.restoreContentFocus/);
  assert.match(runtime, /const key = focusKeyFor\(target\);[\s\S]{0,80}api\.lastFocusKey = key/);
});
