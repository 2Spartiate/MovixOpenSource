import assert from 'node:assert/strict';
import test from 'node:test';
import { createFctvPlaylistLoader } from '../src/utils/fctvPlaylistLoader.ts';

class TransportLoader {
  stats = { loaded: 123 };
  aborted = false;
  destroyed = false;
  load(context, config, callbacks) {
    this.context = context;
    this.config = config;
    this.callbacks = callbacks;
  }
  abort() { this.aborted = true; }
  destroy() { this.destroyed = true; }
}

function harness(url) {
  const Loader = createFctvPlaylistLoader(TransportLoader);
  const loader = new Loader({});
  const received = [];
  const context = { type: 'level', url };
  const config = { timeout: 15000 };
  const onError = () => {};
  const onProgress = () => {};
  loader.load(context, config, {
    onSuccess: (...args) => received.push(args), onError, onProgress,
  });
  return { loader, received, context, config, onError, onProgress };
}

for (const [mode, segment] of [
  ['extension', 'https://cdn.example/token-one/segment.json?auth=unchanged'],
  ['VIP', 'https://proxy.example/proxy?url=segment&token=unchanged'],
  ['mobile', 'http://127.0.0.1:12345/p/secret/session/segment'],
]) {
  test(`FCTV ${mode} starts at the live edge without changing media URLs or sequences`, () => {
    const { loader, received, context } = harness('https://cdn.example/live.m3u8');
    const playlist = '#EXTM3U\r\n#EXT-X-VERSION:3\r\n#EXT-X-START:TIME-OFFSET=4\r\n'
      + '#EXT-X-TARGETDURATION:3\r\n#EXT-X-MEDIA-SEQUENCE:2033\r\n#EXTINF:3,\r\n'
      + segment + '\r\n';
    const response = { url: context.url, data: playlist, code: 200 };
    const networkDetails = {};

    loader.callbacks.onSuccess(response, loader.stats, context, networkDetails);

    assert.equal(received[0][0].data, playlist.replace('#EXT-X-START:TIME-OFFSET=4\r\n', ''));
    assert.equal(response.data, playlist, 'the transport response is not mutated');
    assert.equal(received[0][0].url, response.url);
    assert.equal(received[0][0].code, 200);
    assert.equal(received[0][1], loader.stats);
    assert.equal(received[0][2], context);
    assert.equal(received[0][3], networkDetails);
  });
}

test('finite playlists, binary data and responses without a live start directive remain untouched', () => {
  const { loader, received, context } = harness('https://cdn.example/live.m3u8');
  for (const data of [
    '#EXTM3U\n#EXT-X-START:TIME-OFFSET=4\n#EXTINF:3,\nsegment.ts\n#EXT-X-ENDLIST\n',
    '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:2033\n#EXTINF:3,\nsegment.ts\n',
    '<html>upstream error</html>',
    new Uint8Array([1, 2, 3]).buffer,
  ]) {
    const response = { url: context.url, data };
    loader.callbacks.onSuccess(response, loader.stats, context, null);
    assert.equal(received.at(-1)[0], response);
  }
});

test('the chosen proxy or extension transport keeps its configuration, callbacks and cancellation', () => {
  const { loader, context, config, onError, onProgress } = harness('https://proxy.example/playlist');
  assert.equal(loader.context, context);
  assert.equal(loader.config, config);
  assert.equal(loader.callbacks.onError, onError);
  assert.equal(loader.callbacks.onProgress, onProgress);
  loader.abort();
  loader.destroy();
  assert.equal(loader.aborted, true);
  assert.equal(loader.destroyed, true);
});
