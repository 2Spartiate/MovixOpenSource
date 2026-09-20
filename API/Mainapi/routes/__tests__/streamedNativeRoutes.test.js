const assert = require('node:assert/strict');
const test = require('node:test');
const { once } = require('node:events');
const express = require('express');
process.env.MEDIA_SIGNING_SECRET = 'streamed-route-test-secret';
const { registerStreamedNativeRoutes } = require('../../utils/streamedNativeRoutes');
const signatures = require('../../utils/mediaSigning');
const { encodeSignedToken } = signatures;

const key = 'a'.repeat(24);
const embedUrl = 'https://embed.st/embed/admin/match/1';
async function fixture(t, signatureTTL = signatures.SIGNATURE_TTL, nativeOverrides = {}, routeOverrides = {}) {
  const app = express();
  const router = express.Router();
  const calls = { catalog: 0, resolve: 0, decode: 0, media: 0 };
  const logs = [];
  registerStreamedNativeRoutes(router, {
    proxyBase: 'https://proxies.test',
    logger: { warn: (...args) => logs.push(args) },
    signatures: { ...signatures, SIGNATURE_TTL: signatureTTL },
    source: { getStreams: async () => { calls.catalog++; return [{ _streamedKey: key, url: embedUrl }]; } },
    verifyAccessKey: async value => ({ vip: value === 'valid' }),
    native: {
      resolve: async () => { calls.resolve++; return { url: 'https://lb1.strmd.st/live.m3u8', referer: 'https://embed.st/' }; },
      decode: async () => { calls.decode++; return { url: 'https://lb1.strmd.st/user.m3u8', referer: 'https://embed.st/' }; },
      pull: async url => {
        calls.media++;
        return { url, body: url.endsWith('.ts') ? Buffer.from([0x47, 1, 2]) : Buffer.from('#EXTM3U\n#EXTINF:6,\nseg.ts\n') };
      },
      ...nativeOverrides,
    },
    ...routeOverrides,
  });
  app.use('/api/livetv', router);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { calls, logs, request: (path, options) => fetch(`${origin}${path}`, { redirect: 'manual', ...options }) };
}

function assertProxyUrl(value) {
  const url = new URL(value);
  assert.equal(url.origin, 'https://proxies.test');
  assert.equal(url.pathname, '/streamed-proxy');
  const query = url.searchParams;
  assert.equal(query.get('sig'), signatures.computeSignature('/streamed-proxy', query.get('url'), Number(query.get('exp'))));
  assert.equal(query.get('referer'), 'https://embed.st/');
  return query;
}

function legacyUrl(overrides = {}) {
  const target = { url: 'https://lb1.strmd.st/old.m3u8', referer: 'https://embed.st/', expiresAt: Date.now() + 60000, ...overrides };
  return '/api/livetv/streamed/media.m3u8?token=' + encodeSignedToken('/livetv/streamed/media', JSON.stringify(target));
}

test('le relais natif exige le VIP avant toute résolution et signe les ressources sans prolonger leur accès', async t => {
  const f = await fixture(t);
  const path = `/api/livetv/streamed/native/streamed_match/${key}`;
  assert.equal((await f.request(path)).status, 403);
  assert.equal((await f.request(path, { headers: { 'x-access-key': 'invalid' } })).status, 403);
  assert.equal(f.calls.catalog, 0); assert.equal(f.calls.resolve, 0);
  const response = await f.request(path, { headers: { 'x-access-key': 'valid' } });
  assert.equal(response.status, 200);
  const { url } = await response.json();
  const query = assertProxyUrl(url);
  assert.equal(query.get('url'), 'https://lb1.strmd.st/live.m3u8');
  assert.ok(Number(query.get('exp')) <= Date.now() / 1000 + 7200);
  assert.equal(f.calls.resolve, 1);
  assert.equal((await f.request('/api/livetv/streamed/media.m3u8?token=fake')).status, 403);
  assert.equal((await f.request(legacyUrl({ expiresAt: Date.now() - 1000 }))).status, 403);
  assert.equal(f.calls.media, 0);
});

test('le décodage extension ne délivre aucun proxy et refuse un lecteur substitué', async t => {
  const f = await fixture(t);
  const path = `/api/livetv/streamed/decode/streamed_match/${key}`;
  const request = body => f.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await request({ embedUrl: 'https://embed.st/embed/admin/another/1' })).status, 400);
  assert.equal(f.calls.decode, 0);
  const response = await request({ embedUrl, goat: 'test', body: 'test' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.url, 'https://lb1.strmd.st/user.m3u8');
  assert.equal(body.proxyUrl, undefined);
  assert.equal(f.calls.resolve, 0); assert.equal(f.calls.media, 0);
});

test('les anciens liens natifs renouvellent leur extraction puis redirigent sans télécharger de média', async t => {
  const f = await fixture(t);
  const expiresAt = Date.now() + 30000;
  const response = await f.request(legacyUrl({ embedUrl, expiresAt }));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const query = assertProxyUrl(response.headers.get('location'));
  assert.equal(query.get('url'), 'https://lb1.strmd.st/live.m3u8');
  assert.ok(Number(query.get('exp')) * 1000 <= expiresAt);
  assert.equal(f.calls.resolve, 1);
  assert.equal(f.calls.media, 0);
});

test('la limite isole les spectateurs derrière Cloudflare et bloque avant le décodeur', async t => {
  const f = await fixture(t);
  const request = ip => f.request(`/api/livetv/streamed/decode/streamed_match/${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ embedUrl: 'https://embed.st/embed/admin/other/1' }),
  });
  for (let n = 0; n < 30; n++) assert.equal((await request('198.51.100.1')).status, 400);
  assert.equal((await request('198.51.100.1')).status, 429);
  assert.equal((await request('198.51.100.2')).status, 400);
  assert.equal(f.calls.decode, 0);
});

test('une durée de signature courte borne aussi le lien natif VIP', async t => {
  const f = await fixture(t, 60);
  const response = await f.request(`/api/livetv/streamed/native/streamed_match/${key}`, { headers: { 'x-access-key': 'valid' } });
  const { url } = await response.json();
  const query = assertProxyUrl(url);
  assert.ok(Number(query.get('exp')) > Date.now() / 1000 && Number(query.get('exp')) <= Date.now() / 1000 + 60);
});

test('les anciens liens de segment sont transférés à proxiesembed sans extraction', async t => {
  const segmentUrl = 'https://p16-common-sign.tiktokcdn-eu.com/segment.png?signature=fixture';
  const f = await fixture(t);
  const response = await f.request(legacyUrl({ url: segmentUrl }));
  assert.equal(response.status, 307);
  assert.equal(assertProxyUrl(response.headers.get('location')).get('url'), segmentUrl);
  assert.equal(f.calls.resolve, 0);
  assert.equal(f.calls.media, 0);
  assert.equal(f.logs.length, 0);
});

test('un échec média journalise la phase et le code sans exposer les jetons ni la commande curl', async t => {
  const f = await fixture(t, 60, {
    resolve: async () => { throw Object.assign(new Error('curl https://lb1.strmd.st/private-token?signature=secret'), { code: 'ENOENT' }); },
  });
  const media = await f.request(legacyUrl({ embedUrl }));
  assert.equal(media.status, 502);
  assert.equal(await media.text(), 'Flux Streamed indisponible');
  assert.equal(f.logs.length, 1);
  assert.equal(f.logs[0][1].stage, 'resolve');
  assert.equal(f.logs[0][1].host, 'embed.st');
  assert.equal(f.logs[0][1].code, 'ENOENT');
  assert.doesNotMatch(JSON.stringify(f.logs), /private-token|signature|secret|https:\/\//);
});

test('un relais non configuré refuse avant toute extraction', async t => {
  for (const overrides of [{ proxyBase: '' }, { signatures: { ...signatures, signingConfigured: () => false } }]) {
    const f = await fixture(t, 60, {}, overrides);
    const response = await f.request(`/api/livetv/streamed/native/streamed_match/${key}`, { headers: { 'x-access-key': 'valid' } });
    assert.equal(response.status, 503);
    assert.equal(f.calls.resolve, 0);
  }
});
