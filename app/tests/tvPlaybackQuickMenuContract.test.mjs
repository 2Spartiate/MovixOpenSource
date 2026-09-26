import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('TV quick menu is compact, profile-first and exposes explicit VF/VOSTFR modes', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');

  assert.match(hls, /data-tv-playback-quick-menu/);
  assert.match(hls, /Recherche de la meilleure source…/);
  assert.match(hls, /Aucune source automatique compatible/);
  assert.match(hls, /Auto : \{tvPlaybackProviderLabel\}/);
  assert.match(hls, /\? 'VOSTFR' : 'VF'/);
  assert.match(hls, /VO \+ sous-titres FR/);
  assert.match(hls, /audio français/);
  assert.match(hls, /ref=\{tvQuickMenuFirstActionRef\}[\s\S]{0,220}onClick=\{toggleTvPlaybackProfile\}/);
});

test('TV quick menu reuses existing episodes and advanced settings flows', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');

  assert.match(hls, /const openTvEpisodes = useCallback[\s\S]{0,650}onShowEpisodesMenu\(\)/);
  assert.match(hls, /const openTvEpisodes = useCallback[\s\S]{0,650}setShowInternalEpisodesMenu\(true\)/);
  assert.match(hls, /onClick=\{openTvEpisodes\}/);
  assert.match(hls, /Sources avancées/);
  assert.match(hls, /onClick=\{\(\) => openTvAdvancedSettings\('quality'\)\}/);
  assert.match(hls, /openTvAdvancedSettings\('audio'\)/);
  assert.match(hls, /openTvAdvancedSettings\('subtitles'\)/);
});

test('0 toggles the menu and closing restores Play Pause focus', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');

  assert.match(hls, /key === '0'[\s\S]{0,520}if \(showTvQuickMenu\)[\s\S]{0,220}closeTvQuickMenu\(\)/);
  assert.match(hls, /const closeTvQuickMenu = useCallback[\s\S]{0,220}focusTvPlayPause\(\)/);
  assert.match(hls, /if \(tvMenuOpen \|\| isSourceMenuTarget\(keyboardTarget\)\) return/);
});
