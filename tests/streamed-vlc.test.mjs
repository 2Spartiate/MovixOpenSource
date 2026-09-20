import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { iframeUrl, inputUrl, rewritePlaylist, startRelay } from '../scripts/streamed-vlc.mjs';

test('accepte le lien brut ou collé au format Markdown et refuse les autres origines', () => {
  const url = 'https://streamed.pk/watch/match/golf/1';
  assert.equal(inputUrl(` [${url}](${url}) `), url);
  assert.equal(inputUrl(url), url);
  for (const invalid of ['http://embed.st/embed/a/b/1', 'https://embed.st.evil.example/embed/a/b/1', 'https://user:pass@embed.st/embed/a/b/1', 'https://embed.st:8443/embed/a/b/1']) {
    assert.throws(() => inputUrl(invalid));
  }
});

test('suit les iframes golf actuelles sans exécuter le JavaScript de la page', () => {
  const embed = 'https://embed.st/embed/ingest/ntottenhamhotspur/1';
  const html = `<iframe id="stream-player" data-source="${Buffer.from(embed).toString('base64')}"></iframe>`;
  assert.equal(iframeUrl(html, 'https://rockystream.st/source/streamed1.php'), embed);
  assert.equal(iframeUrl('<iframe id="player" src="https://rockystream.st/source/streamed1.php?a=1&amp;b=2">', 'https://embed.st/'), 'https://rockystream.st/source/streamed1.php?a=1&b=2');
  assert.equal(iframeUrl('<iframe src="http://127.0.0.1/">', 'https://embed.st/'), null);
});

test('suit aussi l’iframe Golf créée par une affectation src = atob', () => {
  const html = readFileSync(new URL('./fixtures/streamed-golf-script.html', import.meta.url), 'utf8');
  assert.equal(iframeUrl(html, 'https://rockystream.st/source/streamed1.php?hd=44&id=1485&no=1'),
    'https://embed.st/embed/ingest/nrealmadrid/1');
  const embed = 'https://embed.st/embed/ingest/nrealmadrid/1';
  assert.equal(iframeUrl(`<script>f . src = atob ( '${Buffer.from(embed).toString('base64')}' );</script>`, 'https://rockystream.st/'), embed);
  for (const target of ['https://embed.st.evil.test/embed/ingest/match/1', 'https://127.0.0.1/private', 'javascript:alert(1)']) {
    assert.equal(iframeUrl(`<script>f.src=atob("${Buffer.from(target).toString('base64')}");</script>`, 'https://rockystream.st/'), null);
  }
});

test('réécrit variantes, audio, clés et segments en conservant leurs URLs complètes', () => {
  const targets = [];
  const rewritten = rewritePlaylist('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="../audio.m3u8"\n#EXT-X-KEY:METHOD=AES-128,URI="/key?id=1"\nvideo.m3u8\nhttps://cdn.example/segment.ts?token=abc\n', 'https://cdn.example/live/index.m3u8', (url) => {
    targets.push(url); return `http://127.0.0.1/${targets.length}`;
  });
  assert.deepEqual(targets, ['https://cdn.example/audio.m3u8', 'https://cdn.example/key?id=1', 'https://cdn.example/live/video.m3u8', 'https://cdn.example/segment.ts?token=abc']);
  assert.match(rewritten, /URI="http:\/\/127\.0\.0\.1\/2"/);
  assert.ok(!rewritten.includes('https://cdn.example'));
});

test('relaie une playlist et son segment avec le Referer, sans accepter de cible arbitraire', async () => {
  const seen = [];
  const ts = Buffer.alloc(188 * 3); ts[0] = ts[188] = ts[376] = 0x47;
  const relay = await startRelay({ m3u8: 'https://cdn.example/live.m3u8', referer: 'https://embed.st/', segmentBody: (body) => body }, async (url, referer) => {
    seen.push({ url, referer });
    return url.endsWith('.m3u8') ? Buffer.from('#EXTM3U\n#EXTINF:4,\n/segment.ts\n') : ts;
  });
  try {
    const response = await fetch(relay.url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /mpegurl/);
    const segmentUrl = (await response.text()).trim().split('\n').at(-1);
    assert.ok(segmentUrl.endsWith('.ts'));
    const segment = await fetch(segmentUrl);
    assert.deepEqual(Buffer.from(await segment.arrayBuffer()), ts);
    assert.deepEqual(seen, [
      { url: 'https://cdn.example/live.m3u8', referer: 'https://embed.st/' },
      { url: 'https://cdn.example/segment.ts', referer: 'https://embed.st/' },
    ]);
    assert.equal((await fetch(`${relay.url}?url=https://evil.example/`)).status, 404);
    assert.equal((await fetch(relay.url, { method: 'POST' })).status, 404);
    assert.equal((await fetch(new URL('/api/hls?url=http://127.0.0.1/', relay.url))).status, 404);
    assert.equal(seen.length, 2);
  } finally { await relay.close(); }
});
