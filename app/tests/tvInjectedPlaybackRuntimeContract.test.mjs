import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('TV WebView injection owns player transport and fullscreen independently of remote HLS code', async () => {
  const runtime = await text('src/injection/tv-playback-runtime.ts');
  const inject = await text('src/injection/inject.ts');

  assert.match(inject, /buildTvPlaybackRuntime/);
  assert.match(inject, /const tvPlaybackRuntime = options\.tvMode \? buildTvPlaybackRuntime\(\) : ''/);
  assert.match(inject, /\$\{tvPlaybackRuntime\}[\s\S]{0,120}\$\{tvDpadRuntime\}/);

  assert.match(runtime, /querySelectorAll\('video'\)/);
  assert.match(runtime, /arrow === 'ArrowLeft'[\s\S]{0,160}seek\(video, -10\)/);
  assert.match(runtime, /arrow === 'ArrowRight'[\s\S]{0,160}seek\(video, 10\)/);
  assert.match(runtime, /arrow === 'ArrowUp'[\s\S]{0,180}enterFullscreen\(video, root\)/);
  assert.match(runtime, /arrow === 'ArrowDown'[\s\S]{0,180}exitFullscreen\(video, root\)/);
  assert.match(runtime, /\^\[1-9\]\$[\s\S]{0,180}consume\(event\)/);
  assert.match(runtime, /window\.addEventListener\('movix-tv-back', handleTvBack\)/);
});

test('TV injected player keeps menus and non-play controls in charge of their own arrows', async () => {
  const runtime = await text('src/injection/tv-playback-runtime.ts');

  assert.match(runtime, /hasPriorityOverlay\(root\) \|\| playerControlOwnsArrows\(root\)/);
  assert.match(runtime, /\[role="dialog"\][\s\S]{0,180}\[data-source-menu\]/);
  assert.match(runtime, /button !== getPlayPauseButton\(root\)/);
});

test('TV injected player restores Play Pause focus when a remote player appears', async () => {
  const runtime = await text('src/injection/tv-playback-runtime.ts');

  assert.match(runtime, /getPlayPauseButton/);
  assert.match(runtime, /MutationObserver/);
  assert.match(runtime, /schedulePlayPauseFocus/);
  assert.match(runtime, /data-tv-player-play-pause/);
});
