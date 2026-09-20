import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceFunction } from './helpers/sourceFunction.mjs';
import { enterPlayerFullscreen, exitPlayerFullscreen, getFullscreenElement } from '../src/utils/playerFullscreenPersistence.ts';

test('Live TV ne rejette pas quand le navigateur ne fournit aucune API plein écran', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const oldDocument = globalThis.document;
  Object.assign(globalThis, { document: { fullscreenElement: null, getElementById: () => null } });
  try {
    const toggle = sourceFunction('src/components/LiveTVPlayer.tsx', 'toggleFullscreen', {
      videoRef: { current: null }, containerRef: { current: {} },
      document: globalThis.document, enterPlayerFullscreen, exitPlayerFullscreen, getFullscreenElement,
    });
    await assert.doesNotReject(toggle());
  } finally { Object.assign(globalThis, { document: oldDocument }); }
});

test('Live TV absorbe le refus du plein écran natif avant les métadonnées', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const oldDocument = globalThis.document;
  Object.assign(globalThis, { document: { fullscreenElement: null, getElementById: () => null } });
  try {
    const toggle = sourceFunction('src/components/LiveTVPlayer.tsx', 'toggleFullscreen', {
      videoRef: { current: { webkitEnterFullscreen() { throw new DOMException('Not ready', 'InvalidStateError'); } } },
      containerRef: { current: {} }, document: globalThis.document,
      enterPlayerFullscreen, exitPlayerFullscreen, getFullscreenElement,
    });
    await assert.doesNotReject(toggle());
  } finally { Object.assign(globalThis, { document: oldDocument }); }
});

test('le bouton lecture accepte les WebView dont play() ne renvoie pas de promesse', async () => {
  let playing = false;
  const video = { paused: true, play() {} };
  const toggle = sourceFunction('src/components/HLSPlayer.tsx', 'togglePlay', {
    videoRef: { current: video }, postCastPlaybackSuppressedRef: { current: false },
    setIsPlaying: (value: boolean) => { playing = value; },
  });
  await assert.doesNotReject(toggle());
  assert.equal(playing, true);
});

test('un échec média encore actif continue de proposer le repli', async () => {
  const video = { error: { code: 4, message: 'unsupported' } };
  let fallbacks = 0;
  const handler = sourceFunction('src/components/HLSPlayer.tsx', 'handleError', {
    src: 'https://example.test/video.m3u8', disableCrossOrigin: false,
    activeKisskhSourceRef: { current: null }, videoRef: { current: video }, disposed: false,
    fetch: async () => ({ status: 200 }), requestHlsFallback: () => { fallbacks++; },
    isDnsLikeError: () => false, console: { log() {}, warn() {} },
  }, 'Video error detected');
  await handler({ target: video });
  assert.equal(fallbacks, 1);
});

for (const duration of [NaN, Infinity, 100]) {
  test(`les raccourcis de recherche restent finis avec duration=${duration}`, () => {
    let position = 10;
    const video = {
      duration, paused: true,
      get currentTime() { return position; },
      set currentTime(value: number) { assert.ok(Number.isFinite(value)); position = value; },
    };
    const handleKeyPress = sourceFunction('src/components/HLSPlayer.tsx', 'handleKeyPress', {
      video, HTMLInputElement: class {}, HTMLTextAreaElement: class {}, HTMLElement: class {},
      document: { activeElement: null }, isSourceMenuTarget: () => false, isLocked: false,
    }, 'Image suivante');
    for (const key of ['.', ',', '5', 'End']) {
      assert.doesNotThrow(() => handleKeyPress({ key, code: key, target: null, preventDefault() {} }));
    }
    assert.equal(position, Number.isFinite(duration) ? 100 : 10);
  });
}

test('Live TV garde le plein écran standard fonctionnel', async () => {
  const oldDocument = globalThis.document;
  const container = { async requestFullscreen() { document.fullscreenElement = container; } };
  const document = {
    fullscreenElement: null as typeof container | null, getElementById: () => null,
    async exitFullscreen() { this.fullscreenElement = null; },
  };
  Object.assign(globalThis, { document });
  try {
    const toggle = sourceFunction('src/components/LiveTVPlayer.tsx', 'toggleFullscreen', {
      videoRef: { current: null }, containerRef: { current: container },
      getFullscreenElement, enterPlayerFullscreen, exitPlayerFullscreen,
    });
    await toggle();
    assert.equal(document.fullscreenElement, container);
    await toggle();
    assert.equal(document.fullscreenElement, null);
  } finally { Object.assign(globalThis, { document: oldDocument }); }
});

test('une erreur média effacée pendant la sonde HEAD ne provoque ni crash ni repli périmé', async () => {
  const mediaError = { code: 4, message: 'unsupported' };
  const video = { error: mediaError as typeof mediaError | null };
  let fallbacks = 0;
  const handler = sourceFunction('src/components/HLSPlayer.tsx', 'handleError', {
    src: 'https://example.test/video.m3u8', disableCrossOrigin: false,
    activeKisskhSourceRef: { current: null },
    videoRef: { current: video }, disposed: false,
    fetch: async () => { video.error = null; return { status: 200 }; },
    requestHlsFallback: () => { fallbacks++; },
    isDnsLikeError: () => false,
    console: { log() {}, warn() {} },
  }, 'Video error detected');
  await assert.doesNotReject(handler({ target: video }));
  assert.equal(fallbacks, 0);
});
