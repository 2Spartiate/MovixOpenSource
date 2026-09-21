import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('Live TV controls stay visible while an interactive control owns focus', async () => {
  const live = await text('../src/components/LiveTVPlayer.tsx');
  assert.match(live, /const playerControlHasFocus[\s\S]{0,360}isPlayerControlInteractionTarget/);
  assert.match(live, /if \(isPlaying && !showSettings && !userPausedRef\.current && !playerControlHasFocus\(\)\)/);
  assert.match(live, /onFocusCapture=\{isEmbedStream \? undefined : handleControlsFocusCapture\}/);
  assert.match(live, /onBlurCapture=\{isEmbedStream \? undefined : handleControlsBlurCapture\}/);
});

test('Live TV Arrow volume shortcut yields to focused TV controls', async () => {
  const live = await text('../src/components/LiveTVPlayer.tsx');
  assert.match(live, /isMovixTvRuntime\(\)[\s\S]{0,150}e\.code\.startsWith\('Arrow'\)[\s\S]{0,160}isPlayerControlInteractionTarget\(keyboardTarget\)/);
  assert.match(live, /case 'ArrowUp':[\s\S]{0,260}videoRef\.current\.volume/);
  assert.match(live, /case 'ArrowDown':[\s\S]{0,260}videoRef\.current\.volume/);
});

test('Live TV volume slider opens by focus as well as hover', async () => {
  const live = await text('../src/components/LiveTVPlayer.tsx');
  assert.match(live, /group-hover\/volume:w-\[112px\] group-focus-within\/volume:w-\[112px\]/);
  assert.match(live, /<input[\s\S]{0,120}type="range"/);
});

test('Live TV source settings autofocus, navigate vertically and restore trigger focus', async () => {
  const live = await text('../src/components/LiveTVPlayer.tsx');
  assert.match(live, /ref=\{settingsButtonRef\}[\s\S]{0,520}data-tv-player-menu-trigger="live-sources"/);
  assert.match(live, /data-live-tv-settings-panel/);
  assert.match(live, /firstServer\?\.focus\(\)/);
  assert.match(live, /settingsButtonRef\.current\?\.focus\(\)/);
  assert.match(live, /event\.key !== 'ArrowUp' && event\.key !== 'ArrowDown'/);
  assert.match(live, /event\.key === 'Escape'[\s\S]{0,160}setShowSettings\(false\)/);
});

test('Live TV exposes remote targets for LIVE, Cast, AirPlay and fullscreen', async () => {
  const live = await text('../src/components/LiveTVPlayer.tsx');
  assert.match(live, /aria-label=\{t\('liveTV\.backToLive'\)\}/);
  assert.match(live, /aria-label=\{t\('liveTV\.castToChromecast'\)\}/);
  assert.match(live, /aria-label=\{t\('liveTV\.castViaAirplay'\)\}/);
  assert.match(live, /aria-label=\{isFullscreen \? t\('watchParty\.exitFullscreen'\) : t\('watchParty\.fullscreen'\)\}/);
});
