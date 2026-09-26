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
  assert.match(runtime, /return \/\^\[1-9\]\$\/\.test\(key\)/);
  assert.match(runtime, /if \(isNumericOneToNine\(event\)\) \{[\s\S]{0,120}consume\(event\)[\s\S]{0,80}return true/);
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


test('0 opens an injected TV quick menu with persistent VF VOSTFR profile', async () => {
  const runtime = await text('src/injection/tv-playback-runtime.ts');

  assert.match(runtime, /PROFILE_KEY = 'movix\.tv\.playback\.profile\.v1'/);
  assert.match(runtime, /key === '0'[\s\S]{0,120}Digit0[\s\S]{0,120}Numpad0/);
  assert.match(runtime, /consume\(event\)[\s\S]{0,120}void toggleQuickMenu\(video, root\)/);
  assert.match(runtime, /Mode : VF/);
  assert.match(runtime, /Mode : VOSTFR/);
  assert.match(runtime, /VO \+ sous-titres FR/);
  assert.match(runtime, /audio français/);
  assert.match(runtime, /localStorage\.setItem\(PROFILE_KEY, profile\)/);
  assert.match(runtime, /movix-tv-playback-profile-change/);
});

test('injected TV quick menu reuses remote episodes and settings controls', async () => {
  const runtime = await text('src/injection/tv-playback-runtime.ts');

  assert.match(runtime, /findActionButton\(root, \['episodes', 'episode'\]/);
  assert.match(runtime, /data-tv-player-menu-trigger="settings"/);
  assert.match(runtime, /Sources avancées/);
  assert.match(runtime, /data-tv-playback-quick-menu/);
  assert.match(runtime, /data-tv-shortcut-scope/);
});

test('Back closes injected quick menu before fullscreen or SPA navigation', async () => {
  const runtime = await text('src/injection/tv-playback-runtime.ts');
  const start = runtime.indexOf('const handleTvBack');
  const end = runtime.indexOf('api.getActiveVideo', start);
  const handler = runtime.slice(start, end);

  assert.ok(handler.indexOf('if (getQuickMenu())') >= 0);
  assert.ok(handler.indexOf('closeQuickMenu()') < handler.indexOf('isFullscreen(video)'));
  assert.match(handler, /event\?\.cancelable[\s\S]{0,80}event\.preventDefault\(\)/);
});


test('quick menu exits fullscreen before mounting and owns modal focus', async () => {
  const runtime = await text('src/injection/tv-playback-runtime.ts');

  assert.match(runtime, /const waitForFullscreenExit = async \(video, root\)/);
  assert.match(runtime, /await exitFullscreen\(video, root\)/);
  assert.match(runtime, /const openQuickMenu = async \(video, root\)/);
  assert.match(runtime, /await waitForFullscreenExit\(video, root\)/);
  assert.match(runtime, /overlay\.setAttribute\('aria-modal', 'true'\)/);
});

test('quick menu blocks player autofocus and transport arrows while open', async () => {
  const runtime = await text('src/injection/tv-playback-runtime.ts');

  assert.match(runtime, /const focusPlayPause = \(\) => \{[\s\S]{0,120}if \(getQuickMenu\(\)\) return false/);
  assert.match(runtime, /api\.focusTimer = setTimeout\(\(\) => \{[\s\S]{0,160}if \(getQuickMenu\(\)\) return/);
  assert.match(runtime, /const hasPriorityOverlay = \(root\) => \{[\s\S]{0,100}if \(getQuickMenu\(\)\) return true/);
  assert.match(runtime, /if \(getQuickMenu\(\)\) return false;[\s\S]{0,100}hasPriorityOverlay\(root\)/);
});
