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
  const consume = runtime.indexOf('consumeEvent(event);', move);
  assert.ok(move >= 0);
  assert.ok(consume > move);
  assert.match(runtime, /const consumeEvent = \(event\) => \{[\s\S]{0,160}event\.preventDefault\(\)/);
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

test('runtime keeps horizontal movement local and header chrome outside normal D-pad candidates', () => {
  const runtime = buildTvDpadRuntime('(function () { return null; })', '/* dom discovery */');
  assert.match(runtime, /getAdjacentCardInRow/);
  assert.match(runtime, /horizontal && currentRow instanceof HTMLElement/);
  assert.match(runtime, /const activeScope = current\.closest\('\[data-tv-shortcut-scope\]'\)/);
  assert.match(runtime, /return activeScope\.contains\(candidate\.element\)/);
  assert.match(runtime, /return !isHeaderElement\(candidate\.element\)/);
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


test('Search keeps the full D-pad native so Android TV IME and voice action stay navigable', () => {
  const runtime = buildTvDpadRuntime('(function () { return null; })', '/* dom discovery */');
  assert.match(runtime, /A real text input must keep the whole D-pad/);
  assert.match(runtime, /ArrowDown is needed to leave the edit field/);
  assert.match(runtime, /including its microphone\/voice action/);
  assert.match(runtime, /if \(!api\.shouldSpatialNavigationHandle\(event\)\) return false/);
  assert.doesNotMatch(runtime, /data-tv-header-shortcut'\) === 'search'[\s\S]{0,220}consumeEvent\(event\)/);
});

test('header gating detects internal scrolling from hero geometry, not only window.scrollY', () => {
  const runtime = buildTvDpadRuntime('(function () { return null; })', '/* dom discovery */');
  assert.match(runtime, /document\.documentElement\?\.scrollTop/);
  assert.match(runtime, /document\.body\?\.scrollTop/);
  assert.match(runtime, /hero\.getBoundingClientRect\(\)/);
  assert.match(runtime, /rect\.top < 40/);
});

test('TV numeric shortcuts use 1 Search, 2 Account, 3 Explore and stay out of text/player scopes', () => {
  const runtime = buildTvDpadRuntime('(function () { return null; })', '/* dom discovery */');

  assert.match(runtime, /key === '1'[\s\S]{0,140}return 'search'/);
  assert.match(runtime, /code === 'Digit1'/);
  assert.match(runtime, /legacy === 49/);

  assert.match(runtime, /key === '2'[\s\S]{0,140}return 'account'/);
  assert.match(runtime, /code === 'Digit2'/);
  assert.match(runtime, /legacy === 50/);

  assert.match(runtime, /key === '3'[\s\S]{0,140}return 'explore'/);
  assert.match(runtime, /code === 'Digit3'/);
  assert.match(runtime, /legacy === 51/);

  assert.match(runtime, /target\.isContentEditable/);
  assert.match(runtime, /tag === 'input'/);
  assert.match(runtime, /data-tv-player-control/);
  assert.match(runtime, /const activateHeaderShortcut = \(kind\) =>/);
  assert.match(runtime, /rememberCurrentContentFocus/);

  assert.doesNotMatch(runtime, /SEARCH=84|ASSIST=219|VOICE_ASSIST=231|SETTINGS=176|PROFILE_SWITCH=288/);
});

test('header/shortcut focus never overwrites the remembered content anchor', () => {
  const runtime = buildTvDpadRuntime('(function () { return null; })', '/* dom discovery */');
  assert.match(runtime, /if \(isHeaderElement\(target\)\) \{/);
  assert.match(runtime, /data-tv-header-shortcut-active/);
  assert.match(runtime, /data-tv-header-active-scope/);
  assert.match(runtime, /if \(target\.closest\('\[data-tv-shortcut-scope\]'\)\) return/);
  assert.match(runtime, /const key = focusKeyFor\(target\);[\s\S]{0,80}api\.lastFocusKey = key/);
});

test('numeric shortcut scopes are temporary and Back relocks header before restoring content', () => {
  const runtime = buildTvDpadRuntime('(function () { return null; })', '/* dom discovery */');
  assert.match(runtime, /const deactivateHeaderShortcut = \(toggleUi = false, restoreFocus = true\) =>/);
  assert.match(runtime, /clearShortcutMarkers\(\)/);
  assert.match(runtime, /policy\.lock\(\)/);
  assert.match(runtime, /window\.addEventListener\('movix-tv-back', handleTvBack\)/);
  assert.match(runtime, /deactivateHeaderShortcut\(true, true\)/);
});

test('Account shortcut turns the visible profile panel into its own scroll container', () => {
  const runtime = buildTvDpadRuntime('(function () { return null; })', '/* dom discovery */');
  assert.match(runtime, /if \(kind === 'account'\)/);
  assert.match(runtime, /classes\.includes\('absolute'\) && classes\.includes\('top-full'\)/);
  assert.match(runtime, /data-tv-shortcut-scroll-container/);
  assert.match(runtime, /max-height', 'calc\(100vh - 76px\)'/);
  assert.match(runtime, /overflow-y', 'auto'/);
  assert.match(runtime, /overscroll-behavior', 'contain'/);
  assert.match(runtime, /return panel/);
});
