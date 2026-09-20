'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const { createSingleFlight } = require('../../utils/singleFlight');
const downloadM3u8 = require('../../utils/downloadM3u8');

const source = fs.readFileSync(path.join(__dirname, '..', 'download.js'), 'utf8');

function fixture({ cachedData, axios, saveResult = true }) {
  const module = { exports: {} };
  vm.compileFunction(source, ['require', 'module', '__dirname', 'console'], { filename: 'download.js' })((request) => {
    const modules = {
      express,
      path,
      fs: { promises: { unlink: async () => {} } },
      axios,
      '../utils/cacheManager': { generateCacheKey: (key) => key, ANIME_SAMA_CACHE_DIR: 'anime', getCacheRefreshInfo: async () => ({}) },
      '../utils/singleFlight': { createSingleFlight },
      '../utils/downloadM3u8': downloadM3u8,
    };
    if (!(request in modules)) throw new Error(`Dépendance non simulée : ${request}`);
    return modules[request];
  }, module, path.join(__dirname, '..'), { log() {}, warn() {}, error() {} });
  const cache = new Map([['films_download_42', cachedData]]);
  const writes = [];
  module.exports.configure({
    DARKINO_MAINTENANCE: false,
    DARKINOS_CACHE_DIR: 'download-cache',
    getFromCacheNoExpiration: async (_dir, key) => cache.get(key) || null,
    saveToCache: async (_dir, key, value) => {
      writes.push(value);
      if (saveResult === true) cache.set(key, value);
      if (saveResult instanceof Error) throw saveResult;
      return saveResult;
    },
  });
  const handler = module.exports.stack.find((layer) => layer.route?.path === '/films/download/:id').route.stack[0].handle;
  const request = async () => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ params: { id: '42' } }, res);
    return res;
  };
  return { request, cache, writes };
}

const stale = (sources, sourcesWithM3u8 = []) => ({
  sources,
  sourcesWithM3u8,
  m3u8Timestamp: Date.now() - (8 * 60 * 60 * 1000) - 1,
});

test('20 hits download périmés partagent un batch, publient une fois et bornent les extractions', async () => {
  let pageCalls = 0;
  let active = 0;
  let maxActive = 0;
  const axios = { get: async (url) => {
    if (url.startsWith('https://page.test/')) {
      pageCalls++; active++; maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setImmediate(resolve));
      active--;
      return { data: 'sources: [{ src: "https://stream.test/video.m3u8"' };
    }
    return { headers: { 'content-type': 'application/vnd.apple.mpegurl' }, data: '#EXTM3U' };
  } };
  const sources = Array.from({ length: 8 }, (_, index) => ({ src: `https://page.test/${index}`, quality: '720p' }));
  const f = fixture({ cachedData: stale(sources), axios });
  const responses = await Promise.all(Array.from({ length: 20 }, f.request));
  assert.ok(responses.every((response) => response.statusCode === 200 && response.body.sources.length === 1));
  assert.equal(pageCalls, 8, 'la salve partage le batch par cacheKey');
  assert.ok(maxActive <= 4, `concurrence observée ${maxActive}`);
  assert.equal(f.writes.length, 1, 'une seule publication du cache commun');
});

test('un cache frais ne lance aucune extraction et un négatif récent espace les retries', async () => {
  let calls = 0;
  const axios = { get: async () => { calls++; return { data: '' }; } };
  const fresh = {
    sources: [{ src: 'https://page.test/a' }],
    sourcesWithM3u8: [{ src: 'https://page.test/a', m3u8: 'https://stream.test/a.m3u8' }],
    m3u8Timestamp: Date.now(),
  };
  const f = fixture({ cachedData: fresh, axios });
  assert.equal((await f.request()).body.sources.length, 1);
  assert.equal(calls, 0);

  f.cache.set('films_download_42', stale([{ src: 'https://page.test/fail' }]));
  assert.deepEqual((await f.request()).body, { sources: [] });
  assert.equal(calls, 1);
  assert.deepEqual((await f.request()).body, { sources: [] });
  assert.equal(calls, 1, 'le TTL négatif de deux heures évite une nouvelle extraction');
});

test('une panne de refresh conserve les liens valides et applique un cooldown local', async () => {
  let calls = 0;
  const axios = { get: async () => { calls++; return { data: 'aucune source' }; } };
  const f = fixture({
    cachedData: stale([{ src: 'https://page.test/fail' }], [{ src: 'https://page.test/fail', m3u8: 'https://stream.test/old.m3u8' }]),
    axios,
  });
  assert.deepEqual((await f.request()).body.sources.map((source) => source.m3u8), ['https://stream.test/old.m3u8']);
  assert.equal(f.writes.length, 0);
  await f.request();
  assert.equal(calls, 1, 'le cooldown évite une reprise immédiate après panne');
});

test('un refus ou une exception de publication conserve le cache et espace le prochain batch', async () => {
  for (const saveResult of [false, new Error('disque indisponible')]) {
    let calls = 0;
    const axios = { get: async (url) => {
      calls++;
      if (url.startsWith('https://page.test/')) return { data: 'sources: [{ src: "https://stream.test/new.m3u8"' };
      return { headers: { 'content-type': 'application/vnd.apple.mpegurl' }, data: '#EXTM3U' };
    } };
    const f = fixture({ cachedData: stale([{ src: 'https://page.test/source' }]), axios, saveResult });
    assert.deepEqual((await f.request()).body, { sources: [] });
    assert.equal(calls, 2);
    await f.request();
    assert.equal(calls, 2, 'le refus de publication ne relance pas immédiatement le batch');
  }
});

test('le délai annule le transport Axios réel et libère son timer', async () => {
  let aborted = false;
  let timeout;
  const axios = { get: (_url, options) => new Promise((_resolve, reject) => {
    timeout = options.timeout;
    options.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true });
  }) };
  await assert.rejects(downloadM3u8.axiosGetWithDeadline(axios, 'https://page.test/slow', { timeoutMs: 10 }));
  assert.equal(timeout, 10);
  assert.equal(aborted, true);
});
