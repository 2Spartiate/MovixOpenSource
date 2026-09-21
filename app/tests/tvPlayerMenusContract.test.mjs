import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('settings trigger is remembered and focus is restored after TV close', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');

  assert.match(hls, /const settingsButtonRef = useRef<HTMLButtonElement>\(null\)/);
  assert.match(hls, /ref=\{settingsButtonRef\}[\s\S]{0,260}data-tv-player-menu-trigger="settings"/);
  assert.match(hls, /if \(!settingsWasOpenRef\.current\) return;[\s\S]{0,260}settingsButtonRef\.current\?\.focus\(\)/);
});

test('opening settings focuses the active TV tab while quality/source keeps its source autofocus', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');
  const panel = await text('../src/components/HLSPlayerSettingsPanel.tsx');

  assert.match(hls, /if \(showSettings\)[\s\S]{0,500}data-tv-settings-tab=[\s\S]{0,180}activeTab\?\.focus\(\)/);
  assert.match(hls, /const firstFocusable = sourceMenu\.querySelector<HTMLElement>[\s\S]{0,300}firstFocusable\.focus\(\)/);
  assert.match(panel, /data-tv-settings-tab="quality"/);
  assert.match(panel, /data-tv-settings-tab="subtitles"/);
});

test('settings is a TV-native scope with vertical option navigation', async () => {
  const panel = await text('../src/components/HLSPlayerSettingsPanel.tsx');

  assert.match(panel, /data-player-menu="settings"/);
  assert.match(panel, /data-tv-dpad-scope=\{isMovixTvRuntime\(\) \? 'native' : undefined\}/);
  assert.match(panel, /event\.key !== 'ArrowUp' && event\.key !== 'ArrowDown'/);
  assert.match(panel, /querySelectorAll<HTMLElement>[\s\S]{0,900}next\.focus\(\)/);
});

test('Escape closes only the settings panel; native controls retain their arrows', async () => {
  const panel = await text('../src/components/HLSPlayerSettingsPanel.tsx');

  assert.match(panel, /event\.key === 'Escape'[\s\S]{0,180}setShowSettings\(false\)/);
  assert.match(panel, /target\.matches\('input, textarea, select, \[role="slider"\], \[data-tv-dpad-scope="native"\]'/);
});
