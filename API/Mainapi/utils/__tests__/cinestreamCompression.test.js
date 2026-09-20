'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const zlib = require('node:zlib');
const { once } = require('node:events');
const initCycleTLS = require('cycletls');

function requestWith(client, proxies = []) {
  const filename = path.resolve(__dirname, '../proxyManager.js');
  const source = fs.readFileSync(filename, 'utf8');
  const start = source.indexOf('async function makeCinestreamRequest(');
  const end = source.indexOf('// 1jour1film', start);
  const constants = source.slice(source.indexOf('const CHROME_JA3'), source.indexOf('function pickProxyscrapeCandidates'));
  assert.ok(start > 0 && end > start);
  const context = vm.createContext({ getCycleTLS: async () => client,
    pickProxyscrapeCandidates: () => ({ proxies, useSocks: false }) });
  vm.runInContext(constants + source.slice(start, end) + '\nglobalThis.request = makeCinestreamRequest;', context, { filename });
  return context.request;
}

test('le client CineStream transmet la compression pendant la rotation des proxies', async () => {
  const requests = [];
  const request = requestWith(async (_url, options) => {
    requests.push(options);
    return requests.length === 1 ? { status: 503, body: 'unavailable' } : { status: 200, body: 'OK' };
  }, [{ host: 'first.test', port: 80 }, { host: 'next.test', port: 80 }]);
  assert.equal((await request('https://cinestream.test/')).data, 'OK');
  assert.equal(requests.length, 2);
  assert.ok(requests.every(options => options.headers['Accept-Encoding'] === 'gzip, deflate, br'));
});

test('CycleTLS installé restitue exactement le HTML gzip et Brotli du vrai helper', { timeout: 15000 }, async t => {
  const body = '<html><p>Épisodes et cinéma français</p></html>'.repeat(1000);
  const exchanges = [];
  const server = http.createServer((req, res) => {
    const accept = req.headers['accept-encoding'] || '';
    const encoding = accept.includes('br') ? 'br' : accept.includes('gzip') ? 'gzip' : 'identity';
    const bytes = encoding === 'br' ? zlib.brotliCompressSync(body)
      : encoding === 'gzip' ? zlib.gzipSync(body) : Buffer.from(body);
    exchanges.push({ encoding, bytes: bytes.length });
    res.setHeader('content-type', 'text/html; charset=utf-8');
    if (encoding !== 'identity') res.setHeader('content-encoding', encoding);
    res.end(bytes);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const reservation = http.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const cycle = await initCycleTLS({ port, timeout: 5000 });
  t.after(() => cycle.exit());
  const request = requestWith(cycle);
  const url = `http://127.0.0.1:${server.address().port}/`;
  for (const headers of [{ 'Accept-Encoding': 'identity' }, {}, { 'Accept-Encoding': 'gzip' }]) {
    const response = await request(url, { headers, timeout: 3 });
    assert.equal(response.status, 200);
    assert.equal(response.data, body);
  }
  assert.deepEqual(exchanges.map(row => row.encoding), ['identity', 'br', 'gzip']);
  assert.ok(exchanges[1].bytes < exchanges[0].bytes / 2);
  assert.ok(exchanges[2].bytes < exchanges[0].bytes / 2);
  t.diagnostic(`Fixture HTML : ${exchanges[0].bytes} octets sans compression, ${exchanges[1].bytes} avec Brotli, ${exchanges[2].bytes} avec gzip ; contenu identique`);
});
