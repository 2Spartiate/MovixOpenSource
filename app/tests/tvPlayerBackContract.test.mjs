import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('Android TV hardware Back dispatches player priority before WebView history', async () => {
  const browser = await text('src/screens/BrowserScreen.tsx');

  assert.match(browser, /if \(canGoBack\)[\s\S]{0,220}if \(isTV\)/);
  assert.match(browser, /new Event\('movix-tv-back', \{ cancelable: true \}\)/);
  assert.match(browser, /if \(!event\.defaultPrevented\) window\.history\.back\(\)/);
  assert.match(browser, /else \{\s*webViewRef\.current\?\.goBack\(\)/);
});

test('HLS TV Back closes local state in priority order and leaves route exit to WebView', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');
  const handler = hls.match(/const handleTvBack = \(event: Event\) => \{([\s\S]*?)window\.addEventListener\('movix-tv-back'/)?.[1] || '';

  for (const marker of [
    'if (isLocked)',
    'if (showSettings)',
    'if (showCastMenu)',
    'if (showInternalEpisodesMenu)',
    'if (studioOpen)',
    'if (skipPromptVisible)',
    'if (nextEpisodePromptVisible)',
    'if (showNextMovie)',
    'if (fullscreenActive)',
  ]) assert.ok(handler.includes(marker), marker);

  assert.match(handler, /if \(fullscreenActive\)[\s\S]{0,150}void toggleFullscreen\(\)/);
  assert.match(hls, /Otherwise leave the event unconsumed:[\s\S]{0,120}WebView/);
});

test('Live TV Back closes settings, then fullscreen, then the player overlay', async () => {
  const live = await text('../src/components/LiveTVPlayer.tsx');
  const handler = live.match(/const handleTvBack = \(event: Event\) => \{([\s\S]*?)window\.addEventListener\('movix-tv-back'/)?.[1] || '';

  assert.ok(handler.indexOf('if (showSettings)') >= 0);
  assert.ok(handler.indexOf('if (isFullscreen') > handler.indexOf('if (showSettings)'));
  assert.ok(handler.lastIndexOf('onClose();') > handler.indexOf('if (isFullscreen'));
  assert.match(handler, /event\.preventDefault\(\)/);
});

test('France TV Back closes settings, then fullscreen, then exits its route', async () => {
  const france = await text('../src/pages/FranceTV/FranceTVPlayer.tsx');
  const handler = france.match(/const handleTvBack = \(event: Event\) => \{([\s\S]*?)window\.addEventListener\('movix-tv-back'/)?.[1] || '';

  assert.ok(handler.indexOf('if (showSettings)') >= 0);
  assert.ok(handler.indexOf('if (document.fullscreenElement || isFullscreen)') > handler.indexOf('if (showSettings)'));
  assert.ok(handler.lastIndexOf('navigate(-1);') > handler.indexOf('if (document.fullscreenElement || isFullscreen)'));
  assert.match(handler, /event\.preventDefault\(\)/);
});
