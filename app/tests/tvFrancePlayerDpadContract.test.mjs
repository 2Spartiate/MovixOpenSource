import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('France TV yields all D-pad arrows when an interactive control owns focus', async () => {
  const france = await text('../src/pages/FranceTV/FranceTVPlayer.tsx');
  assert.match(
    france,
    /isMovixTvRuntime\(\)[\s\S]{0,150}e\.code\.startsWith\('Arrow'\)[\s\S]{0,170}isPlayerControlInteractionTarget\(keyboardTarget\)[\s\S]{0,80}return;/,
  );
  assert.match(france, /case 'ArrowLeft':[\s\S]{0,100}seekBy\(-10\)/);
  assert.match(france, /case 'ArrowRight':[\s\S]{0,100}seekBy\(10\)/);
});

test('France TV controls do not auto-hide while focus remains in the player chrome', async () => {
  const france = await text('../src/pages/FranceTV/FranceTVPlayer.tsx');
  assert.match(france, /const playerControlHasFocus[\s\S]{0,360}isPlayerControlInteractionTarget/);
  assert.match(france, /if \(isPlaying && !showSettings && !playerControlHasFocus\(\)\) setShowControls\(false\)/);
  assert.match(france, /onFocusCapture=\{handleControlsFocusCapture\}/);
  assert.match(france, /onBlurCapture=\{handleControlsBlurCapture\}/);
});

test('France TV settings is a TV scope with autofocus, vertical navigation and trigger restoration', async () => {
  const france = await text('../src/pages/FranceTV/FranceTVPlayer.tsx');
  assert.match(france, /ref=\{settingsButtonRef\}[\s\S]{0,320}data-tv-player-menu-trigger="francetv-settings"/);
  assert.match(france, /data-francetv-settings-panel/);
  assert.match(france, /first\?\.focus\(\)/);
  assert.match(france, /settingsButtonRef\.current\?\.focus\(\)/);
  assert.match(france, /event\.key !== 'ArrowUp' && event\.key !== 'ArrowDown'/);
  assert.match(france, /event\.key === 'Escape'[\s\S]{0,160}setShowSettings\(false\)/);
});

test('France TV volume is focus discoverable and control clusters are marked', async () => {
  const france = await text('../src/pages/FranceTV/FranceTVPlayer.tsx');
  assert.match(france, /group-hover\/volume:w-\[112px\] group-focus-within\/volume:w-\[112px\]/);
  assert.ok((france.match(/data-tv-focus-group="francetv-controls"/g) || []).length >= 2);
  assert.match(france, /<input[\s\S]{0,120}type="range"/);
});
