import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('remote Home dynamically marks provider links and seasonal image rails for TV', async () => {
  const src = await source('src/injection/app-site-overrides.ts');
  assert.match(src, /const markDynamicHomeRails = \(\) =>/);
  assert.match(src, /provider:/);
  assert.match(src, /\.home-section a\[href\]/);
  assert.match(src, /data-tv-carousel-row/);
  assert.match(src, /data-tv-focus-id/);
  assert.match(src, /markDynamicHomeRails\(\)/);
});

test('vertical TV navigation can advance through lazy, non-focusable seasonal sections', async () => {
  const src = await source('src/injection/tv-dpad-runtime.ts');
  assert.match(src, /const scrollPastUnmappedContent = \(direction\) =>/);
  assert.match(src, /const moved = api\.moveFocus\(direction\)/);
  assert.match(src, /if \(!moved\) scrollPastUnmappedContent\(direction\)/);
  assert.match(src, /scrollHeight - target\.clientHeight/);
  assert.match(src, /requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) =>/);
  assert.match(src, /\[role="dialog"\]\[aria-modal="true"\]/);
  assert.match(src, /\[data-hls-player-root\]/);
  assert.match(src, /if \(direction !== 'up' && direction !== 'down'\) return false/);
});

test('platform Embla navigation skips artificial hidden overflow wrappers', async () => {
  const src = await source('src/injection/tv-dpad-runtime.ts');
  assert.match(src, /row\.querySelectorAll\('\[data-tv-card\]'\)/);
  assert.match(src, /\/\^\(auto\|scroll\|overlay\)\$\//);
  assert.match(src, /requestAnimationFrame\(\(\) => requestAnimationFrame\(nudgeIfNeeded\)\)/);
  assert.doesNotMatch(src, /nudgeIfNeeded\(attempt \+ 1\)/);
});

test('TV detail primary Play takes full width, and only the adjacent Download is hidden', async () => {
  const src = await source('src/injection/app-site-overrides.ts');
  assert.match(src, /const simplifyTvDetailActions = \(\) =>/);
  assert.match(src, /window\.MOVIX_TV !== true/);
  assert.match(src, /svg\.lucide-download/);
  assert.match(src, /svg\.lucide-play/);
  assert.match(src, /hideManagedNode\(download\)/);
  assert.match(src, /data-tv-detail-primary-play/);
  assert.match(src, /'#16a34a'/);
  assert.match(src, /'flex', '1 1 100%'/);
  assert.match(src, /simplifyTvDetailActions\(\)/);
});
