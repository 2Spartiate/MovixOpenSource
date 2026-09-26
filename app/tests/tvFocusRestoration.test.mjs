import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('automatic TV startup focus is Hero Play only', async () => {
  const source = await text('src/injection/tv-dpad-runtime.ts');

  assert.match(source, /api\.ensureInitialFocus = \(allowContentFallback = false\) =>/);
  assert.match(source, /const heroPlay = getHeroPlay\(\)/);
  assert.match(source, /focusWithoutJank\(heroPlay, false\)/);
  assert.match(source, /if \(!allowContentFallback\) return false/);
  assert.doesNotMatch(source, /preferContentAfterNavigation/);
});

test('Hero autofocus waits briefly for async mount without auto-scrolling to a card', async () => {
  const source = await text('src/injection/tv-dpad-runtime.ts');

  assert.match(source, /heroAutofocusReadyAt = performance\.now\(\) \+ 300/);
  assert.match(source, /remainingHeroWait/);
  assert.match(source, /api\.ensureInitialFocus\(false\)/);
  assert.match(source, /remain visually at the top/);
  assert.doesNotMatch(source, /return focusWithoutJank\(contentCard\)/);
});

test('initial focus never replaces an already meaningful active element', async () => {
  const source = await text('src/injection/tv-dpad-runtime.ts');
  assert.match(source, /active === document\.body \|\| active === document\.documentElement/);
  assert.match(source, /if \(!pageFocusIsEmpty\(\)\) return false/);
  assert.match(source, /role="dialog"\]\[aria-modal="true"/);
  assert.match(source, /data-tv-manage-autofocus/);
});

test('focus memory uses stable identifiers and hrefs for SPA restoration', async () => {
  const source = await text('src/injection/tv-dpad-runtime.ts');
  assert.match(source, /data-tv-focus-id/);
  assert.match(source, /data-tv-primary-focus/);
  assert.match(source, /HTMLAnchorElement/);
  assert.match(source, /api\.lastFocusKey/);
  assert.match(source, /api\.restoreLastFocus/);
});

test('mutation recovery is guarded and also syncs async Search suggestions', async () => {
  const source = await text('src/injection/tv-dpad-runtime.ts');
  assert.match(source, /new MutationObserver\(\(\) => \{/);
  assert.match(source, /syncSearchSuggestionScope\(\)/);
  assert.match(source, /scheduleFocusRecovery\(\)/);
  assert.match(source, /api\.focusRecoveryRaf \|\| api\.focusRecoveryTimer/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /api\.focusObserver\.disconnect\(\)/);
});

test('explicit D-pad navigation may fall back to content on routes with no Hero', async () => {
  const source = await text('src/injection/tv-dpad-runtime.ts');
  assert.match(source, /return api\.ensureInitialFocus\(true\)/);
  assert.match(source, /const contentCard = elements\.find/);
  assert.match(source, /A real D-pad press is explicit user navigation/);
  assert.match(source, /primary \|\|\s*contentCard \|\|\s*elements\[0\]/);
});

test('focus lifecycle listeners are replaceable and cleanable', async () => {
  const source = await text('src/injection/tv-dpad-runtime.ts');
  assert.match(source, /removeEventListener\('focusin', api\.focusinHandler, true\)/);
  assert.match(source, /addEventListener\('focusin', handleFocusIn, true\)/);
  assert.match(source, /focusRecoveryTimer/);
  assert.match(source, /destroyDpadRuntime/);
});
