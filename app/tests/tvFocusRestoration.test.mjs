import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('initial TV focus uses explicit priority order', async () => {
  const source = await text('src/injection/tv-dpad-runtime.ts');
  const targetBlock = source.match(
    /const target =([\s\S]*?)elements\[0\];/,
  )?.[1] || '';

  const auto = targetBlock.indexOf("data-tv-autofocus");
  const card = targetBlock.indexOf('contentCard');
  const primary = targetBlock.indexOf("data-tv-primary-focus");

  assert.ok(auto >= 0);
  assert.ok(card > auto);
  assert.ok(primary > card);
});

test('initial TV focus waits briefly for media content instead of stealing focus to search', async () => {
  const source = await text('src/injection/tv-dpad-runtime.ts');
  assert.match(source, /preferContentAfterNavigation = true/);
  assert.match(source, /performance\.now\(\) \+ 5000/);
  assert.match(source, /scheduleFocusRecovery\(\)/);
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

test('mutation recovery is guarded and only scans when focus is lost', async () => {
  const source = await text('src/injection/tv-dpad-runtime.ts');
  assert.match(source, /new MutationObserver\(scheduleFocusRecovery\)/);
  assert.match(source, /api\.focusRecoveryRaf \|\| api\.focusRecoveryTimer/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /api\.focusObserver\.disconnect\(\)/);
});

test('SPA route recovery waits for content cards before falling back to header search', async () => {
  const source = await text('src/injection/tv-dpad-runtime.ts');
  assert.match(source, /preferContentAfterNavigation/);
  assert.match(source, /navigationInProgressUntil/);
  assert.match(source, /const contentCard = elements\.find/);
  assert.match(source, /return focusWithoutJank\(contentCard\)/);
  assert.match(source, /api\.focusRecoveryTimer = setTimeout/);
});

test('focus lifecycle listeners are replaceable and cleanable', async () => {
  const source = await text('src/injection/tv-dpad-runtime.ts');
  assert.match(source, /removeEventListener\('focusin', api\.focusinHandler, true\)/);
  assert.match(source, /addEventListener\('focusin', handleFocusIn, true\)/);
  assert.match(source, /focusRecoveryTimer/);
  assert.match(source, /destroyDpadRuntime/);
});
