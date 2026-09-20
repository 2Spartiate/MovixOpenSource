import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareNativeHlsStartup } from '../src/utils/nativeHlsStartup.ts';

function videoFixture({ duration = Infinity, ranges = [[100, 145]], refusesSeek = false } = {}) {
  const video = new EventTarget();
  let position = 104;
  const seeks = [];
  video.duration = duration;
  video.seekable = {
    length: ranges.length,
    start: index => ranges[index][0],
    end: index => ranges[index][1],
  };
  Object.defineProperty(video, 'currentTime', {
    get: () => position,
    set(value) {
      if (refusesSeek) throw new DOMException('Range no longer available', 'InvalidStateError');
      seeks.push(value);
      position = value;
    },
  });
  return { video, seeks };
}

test('FCTV native HLS waits for playable ranges and selects the live position before play', () => {
  const { video, seeks } = videoFixture();
  const starts = [];
  prepareNativeHlsStartup(video, true, () => starts.push(video.currentTime));

  video.dispatchEvent(new Event('loadedmetadata'));
  assert.deepEqual(starts, []);
  video.dispatchEvent(new Event('canplay'));
  assert.deepEqual(seeks, [136]);
  assert.deepEqual(starts, [136]);

  video.dispatchEvent(new Event('canplay'));
  assert.deepEqual(starts, [136], 'buffer recoveries must not seek or restart again');
});

test('native startup uses the latest range and stays inside short live windows', () => {
  for (const [ranges, expected] of [
    [[[0, 20], [100, 145]], 136],
    [[[142, 145]], 142],
  ]) {
    const { video, seeks } = videoFixture({ ranges });
    prepareNativeHlsStartup(video, true, () => {});
    video.dispatchEvent(new Event('canplay'));
    assert.deepEqual(seeks, [expected]);
  }
});

test('native playback already near the live edge is not moved backward', () => {
  const { video, seeks } = videoFixture();
  video.currentTime = 142;
  seeks.length = 0;
  prepareNativeHlsStartup(video, true, () => {});
  video.dispatchEvent(new Event('canplay'));
  assert.deepEqual(seeks, []);
  assert.equal(video.currentTime, 142);
});

test('finite media and unavailable ranges still play without forcing a seek', () => {
  for (const options of [
    { duration: 145 }, { duration: NaN }, { ranges: [] },
    { ranges: [[100, Infinity]] }, { ranges: [[145, 100]] }, { refusesSeek: true },
  ]) {
    const { video, seeks } = videoFixture(options);
    let starts = 0;
    prepareNativeHlsStartup(video, true, () => starts++);
    video.dispatchEvent(new Event('canplay'));
    assert.equal(starts, 1);
    assert.deepEqual(seeks, []);
  }
});

test('other native HLS sources keep their metadata startup and starting position', () => {
  const { video, seeks } = videoFixture();
  let starts = 0;
  prepareNativeHlsStartup(video, false, () => starts++);
  video.dispatchEvent(new Event('loadedmetadata'));
  video.dispatchEvent(new Event('canplay'));
  assert.equal(starts, 1);
  assert.deepEqual(seeks, []);
});

test('closing or replacing a native source cancels its pending startup', () => {
  const { video, seeks } = videoFixture();
  let starts = 0;
  const cleanup = prepareNativeHlsStartup(video, true, () => starts++);
  cleanup();
  video.dispatchEvent(new Event('loadedmetadata'));
  video.dispatchEvent(new Event('canplay'));
  assert.equal(starts, 0);
  assert.deepEqual(seeks, []);
});
