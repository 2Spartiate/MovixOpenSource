import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { sourceEffect, sourceFunction } from './helpers/sourceFunction.mjs';
import { getLocalPlaybackInitPolicy } from '../src/utils/castLocalPlaybackRecovery.ts';

const silentConsole = { log() {}, warn() {}, error() {} };
const noop = () => {};

function videoFixture() {
  const video = new EventTarget();
  Object.assign(video, {
    disableRemotePlayback: false,
    webkitWirelessVideoPlaybackDisabled: false,
    webkitCurrentPlaybackTargetIsWireless: false,
    textTracks: [],
    paused: true,
    setAttribute: noop,
  });
  return video;
}

function initializeAirPlay(video, onStateChange = noop, webkit = true) {
  return sourceFunction('src/utils/castUtils.ts', 'initializeAirPlay', {
    isAirPlaySupported: () => webkit,
    isRemotePlaybackSupported: () => !webkit,
    console: silentConsole,
  })(video, onStateChange);
}

function playerFixture() {
  const video = videoFixture();
  const hlsRef = { current: null };
  const timers = new Map();
  let nextTimer = 0;
  let fallbacks = 0;
  class Hls extends EventEmitter {
    static Events = new Proxy({}, { get: (_, name) => name });
    static isSupported = () => true;
    levels = [{ height: 1080 }];
    currentLevel = 0;
    loadSource() {}
    attachMedia(media) {
      // Hls.js impose ce drapeau avant d'ouvrir ManagedMediaSource sur iPhone.
      media.disableRemotePlayback = true;
      media.dispatchEvent(new Event('loadstart'));
    }
    startLoad() {}
    destroy() { this.removeAllListeners(); }
  }
  const cleanup = sourceEffect('src/components/HLSPlayer.tsx', 'const clearSourceTimeout', {
    isCasting: false, Hls, hlsRef, videoRef: { current: video },
    postCastPlaybackSuppressedRef: { current: false }, getLocalPlaybackInitPolicy,
    bufferingTimeoutRef: { current: null }, sourceTimeoutRef: { current: null },
    setTimeout: (callback, delay) => {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    setIsLoading: noop, setIsBuffering: noop, setBuffered: noop,
    requestHlsFallback: () => { fallbacks++; },
    src: 'https://media.test/master.m3u8', normalizeUqloadEmbedUrl: url => url,
    kisskhSources: [], isMP4Source: () => false, contentTypeMp4Urls: new Set(),
    createHlsConfig: () => ({}), purstreamSources: [], console: silentConsole, window: {},
    qualitiesRef: { current: [] }, qualityPreferenceRef: { current: 'auto' },
    buildHlsQualityOptions: levels => levels, setQualities: noop,
    selectLevelForPreference: () => 0, formatDetectedStreamQuality: () => '1080p',
    rememberSourceQuality: noop, playbackSpeed: 1, lastKnownTimeRef: { current: 0 },
    autoPlay: false, setAudioTracks: noop, hlsAudioPreferences: new Map(),
    contentQualityKey: 'test', selectAudioTrackIndex: () => -1,
    applySelectedTextTrackMode: noop, currentSubtitleRef: { current: -1 },
    failed429Segments: new Set(),
  })();
  const hls = hlsRef.current;
  return {
    video, hls, cleanup,
    manifest: () => hls.emit(Hls.Events.MANIFEST_PARSED, null, { levels: hls.levels }),
    fragment: () => hls.emit(Hls.Events.FRAG_LOADED, null, { frag: { sn: 0, type: 'video' } }),
    expireLoading: () => {
      for (const [id, timer] of timers) {
        if (timer.delay === 45000) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
    fallbackCount: () => fallbacks,
  };
}

test('Safari : monter le lecteur avec Hls.js déjà chargé préserve ManagedMediaSource', () => {
  const fixture = playerFixture();
  const states = [];
  // Au remontage Hls.js est en cache : l'effet HLS précède l'effet AirPlay.
  const cleanupAirPlay = initializeAirPlay(fixture.video, state => states.push(state));
  try {
    assert.equal(fixture.video.disableRemotePlayback, true);
    fixture.video.webkitCurrentPlaybackTargetIsWireless = true;
    fixture.video.dispatchEvent(new Event('webkitcurrentplaybacktargetiswirelesschanged'));
    assert.equal(states.at(-1).isConnected, true);
    cleanupAirPlay();
    fixture.video.dispatchEvent(new Event('webkitcurrentplaybacktargetiswirelesschanged'));
    assert.equal(states.length, 2, 'le nettoyage retire les écouteurs AirPlay');
  } finally {
    cleanupAirPlay();
    fixture.cleanup();
  }
});

test('la découverte AirPlay conserve les drapeaux du moteur de lecture', () => {
  for (const disabled of [true, false]) {
    const video = videoFixture();
    video.disableRemotePlayback = disabled;
    video.webkitWirelessVideoPlaybackDisabled = disabled;
    const cleanup = initializeAirPlay(video);
    assert.equal(video.disableRemotePlayback, disabled);
    assert.equal(video.webkitWirelessVideoPlaybackDisabled, disabled);
    cleanup();
  }
});

test('la découverte Remote Playback ne réactive pas la sortie distante du média', async () => {
  const video = videoFixture();
  video.disableRemotePlayback = true;
  video.remote = Object.assign(new EventTarget(), {
    state: 'disconnected', watchAvailability: () => Promise.resolve(1),
    cancelWatchAvailability: noop,
  });
  const cleanup = initializeAirPlay(video, noop, false);
  await Promise.resolve();
  assert.equal(video.disableRemotePlayback, true);
  cleanup();
});

test('une demande explicite AirPlay réactive la sortie avant le sélecteur système', async () => {
  const video = videoFixture();
  video.disableRemotePlayback = true;
  video.webkitWirelessVideoPlaybackDisabled = true;
  let pickerCalls = 0;
  let pickerFlags;
  video.webkitShowPlaybackTargetPicker = () => {
    pickerFlags = [video.disableRemotePlayback, video.webkitWirelessVideoPlaybackDisabled];
    pickerCalls++;
  };
  const request = sourceFunction('src/utils/castUtils.ts', 'requestAirPlay', { console: silentConsole });
  const pending = request(video);
  const synchronousPickerCalls = pickerCalls;
  await pending;
  assert.equal(synchronousPickerCalls, 1, 'le sélecteur reste dans le geste utilisateur, avant tout await');
  assert.deepEqual(pickerFlags, [false, false]);
});

for (const progress of ['manifest', 'fragment']) {
  test(`un ${progress} reçu sans média lisible conserve le délai de secours`, () => {
    const fixture = playerFixture();
    try {
      fixture[progress]();
      fixture.expireLoading();
      assert.equal(fixture.fallbackCount(), 1);
    } finally { fixture.cleanup(); }
  });
}

for (const readyEvent of ['canplay', 'playing']) {
  test(`${readyEvent} annule le secours, même sans autoplay`, () => {
    const fixture = playerFixture();
    try {
      fixture.manifest();
      fixture.video.dispatchEvent(new Event(readyEvent));
      fixture.expireLoading();
      assert.equal(fixture.fallbackCount(), 0);
    } finally { fixture.cleanup(); }
  });
}

test('démonter le lecteur annule le secours de la source précédente', () => {
  const fixture = playerFixture();
  fixture.cleanup();
  fixture.expireLoading();
  assert.equal(fixture.fallbackCount(), 0);
});
