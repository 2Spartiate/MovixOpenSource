import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('initial TV focus uses explicit priority order', async () => {
  const source = await text('src/injection/tv-dpad-runtime.ts');
  const auto = source.indexOf("hasAttribute('data-tv-autofocus')");
  const primary = source.indexOf("hasAttribute('data-tv-primary-focus')");
  const card = source.indexOf("hasAttribute('data-tv-card')");
  assert.ok(auto >= 0);
  assert.ok(primary > auto);
  assert.ok(card > primary);
  assert.match(source, /elements\[0\]/);
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
  assert.match(source, /if \(!pageFocusIsEmpty\(\) \|\| api\.focusRecoveryRaf\) return/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /api\.focusObserver\.disconnect\(\)/);
});

test('focus lifecycle listeners are replaceable and cleanable', async () => {
  const source = await text('src/injection/tv-dpad-runtime.ts');
  assert.match(source, /removeEventListener\('focusin', api\.focusinHandler, true\)/);
  assert.match(source, /addEventListener\('focusin', handleFocusIn, true\)/);
  assert.match(source, /destroyDpadRuntime/);
});
