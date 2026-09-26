import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('TV remote owns transport, fullscreen and numeric keys without removing desktop shortcuts', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');
  const start = hls.indexOf('const handleKeyPress = (e: KeyboardEvent) => {');
  const end = hls.indexOf("document.addEventListener('keydown', handleKeyPress)", start);
  const handler = hls.slice(start, end);

  assert.match(handler, /const tvArrowCode = e\.code\.startsWith\('Arrow'\)[\s\S]{0,120}key\.startsWith\('Arrow'\)/);
  assert.match(handler, /tvArrowCode === 'ArrowLeft'[\s\S]{0,100}skipTime\(-10\)/);
  assert.match(handler, /tvArrowCode === 'ArrowRight'[\s\S]{0,100}skipTime\(10\)/);
  assert.match(handler, /tvArrowCode === 'ArrowUp'[\s\S]{0,420}!fullscreenActive\) void toggleFullscreen\(\)/);
  assert.match(handler, /tvArrowCode === 'ArrowDown'[\s\S]{0,420}fullscreenActive\) void toggleFullscreen\(\)/);
  assert.match(handler, /\^\[1-9\]\$[\s\S]{0,220}e\.preventDefault\(\)[\s\S]{0,80}return/);

  // Historical desktop volume and percentage shortcuts remain after the TV-only branch.
  assert.match(handler, /case '1': case '2': case '3':[\s\S]{0,260}video\.duration \* percent/);
  assert.match(handler, /case 'ArrowUp':[\s\S]{0,260}video\.volume/);
  assert.match(handler, /case 'ArrowDown':[\s\S]{0,260}video\.volume/);
});

test('Play Pause is the default TV focus and is restored on real fullscreen transitions', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');

  assert.match(hls, /ref=\{playPauseButtonRef\}[\s\S]{0,180}data-tv-player-play-pause/);
  assert.match(hls, /const focusTvPlayPause = useCallback[\s\S]{0,260}playPauseButtonRef\.current\?\.focus/);
  assert.match(hls, /const syncFullscreenState = \(\) => \{[\s\S]{0,700}isMovixTvRuntime\(\)[\s\S]{0,260}playPauseButtonRef\.current\?\.focus/);
  assert.match(hls, /document\.addEventListener\('fullscreenchange', syncFullscreenState\)/);
});

test('TV episodes reuse the existing episode callbacks, season menu and previous/next navigation', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');

  assert.match(hls, /onShowEpisodesMenu\?: \(\) => void/);
  assert.match(hls, /onPreviousEpisode\?: \(\) => void/);
  assert.match(hls, /const openTvEpisodes = useCallback[\s\S]{0,700}setShowInternalEpisodesMenu\(true\)/);
  assert.match(hls, /setSelectedSeasonNumber\(seasonNumber \?\? 1\)/);
  assert.match(hls, /const triggerNextEpisode = useCallback[\s\S]{0,420}onNextEpisode\(nextEpisode\.seasonNumber, nextEpisode\.episodeNumber\)/);
  assert.match(hls, /if \(onPreviousEpisode\) \{[\s\S]{0,120}onPreviousEpisode\(\)/);
});
