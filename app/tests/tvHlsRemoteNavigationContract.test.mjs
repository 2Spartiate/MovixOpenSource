import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('HLS exposes its main control clusters to TV spatial navigation', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');

  assert.match(hls, /data-player-controls=""\s*data-tv-focus-group="hls-center-controls"/);
  assert.match(hls, /data-player-controls=""\s*data-tv-focus-group="hls-controls"/);
  assert.match(hls, /data-tv-player-menu-trigger="settings"/);
  assert.match(hls, /google-cast-launcher[\s\S]{0,520}tabIndex=\{0\}[\s\S]{0,120}data-tv-focus/);
});

test('TV progress is a native D-pad slider while desktop markup stays pointer-compatible', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');

  assert.match(hls, /const handleProgressDpadKeyDown[\s\S]{0,1200}case 'ArrowLeft':[\s\S]{0,500}case 'ArrowRight':[\s\S]{0,650}e\.stopPropagation\(\)/);
  assert.match(hls, /role=\{isMovixTvRuntime\(\)[\s\S]{0,120}'slider'/);
  assert.match(hls, /data-tv-dpad-scope=\{isMovixTvRuntime\(\)[\s\S]{0,140}'native'/);
  assert.match(hls, /onClick=\{!isDragging && !isWatchPartyGuest \? handleProgressClick : undefined\}/);
});

test('volume slider opens for focus as well as hover', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');
  assert.match(hls, /group-hover\/volume:w-\[112px\] group-focus-within\/volume:w-\[112px\]/);
  assert.match(hls, /<input[\s\S]{0,120}type="range"/);
});

test('primary HLS buttons expose accessible labels for remote focus', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');
  for (const marker of [
    "aria-label={isPlaying ? t('watch.pause') : t('watch.play')}",
    "aria-label={t('watch.volume')}",
    "aria-label={t('watch.settingsTitle')}",
    "aria-label={isFullscreen ? t('watch.exitFullscreen') : t('watch.fullscreen')}",
  ]) assert.ok(hls.includes(marker), marker);
});
