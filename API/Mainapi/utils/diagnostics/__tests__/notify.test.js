'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter, getEventListeners } = require('node:events');
const { PassThrough } = require('node:stream');
const nativeFs = require('node:fs');
const { notifyReport, defaultTransport, gzipReport } = require('../notify');

async function reportDir(json = '{"ok":true}') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'movix-probe-'));
  await fs.writeFile(path.join(dir, 'report.md'), '# Rapport\n');
  await fs.writeFile(path.join(dir, 'report.json'), json);
  return dir;
}
function testEnv(overrides = {}) {
  return { WIFLIX_PROXY_BLOCK_WEBHOOK_URL: 'https://discord.com/api/webhooks/123456789012345678/token', ...overrides };
}

test('sends a bounded multipart payload with the explicit authorized mention', async (t) => {
  const dir = await reportDir(); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let received;
  const result = await notifyReport({ runDir: dir, env: testEnv(), transport: async (request) => { received = request; return { statusCode: 200 }; } });
  assert.deepEqual(result, { status: 'sent', httpStatus: 200 });
  assert.match(received.payload.content, /<@1516102413835305021>/);
  assert.deepEqual(received.payload.allowed_mentions, { parse: [], users: ['1516102413835305021'] });
  assert.deepEqual(received.files.map((file) => file.name), ['report.md', 'report.json.gz']);
  assert.equal(received.timeoutMs, 8000);
  assert.match(received.url, /\?wait=true$/);
});

test('threshold notification pings with current measurements and intermediate report attachments', async (t) => {
  const dir = await reportDir(); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let received;
  const result = await notifyReport({ runDir: dir, reason: 'threshold', env: testEnv(),
    alert: { triggers: ['cpu', 'network-rx'], cpuPercent: 404.2, rxMiBPerSecond: 25, elapsedMs: 5000 },
    transport: async (request) => { received = request; return { statusCode: 200 }; } });
  assert.equal(result.status, 'sent');
  assert.match(received.payload.content, /<@1516102413835305021>/);
  assert.match(received.payload.content, /CPU 404\.2 %/);
  assert.match(received.payload.content, /réception 25\.00 Mio\/s/);
  assert.match(received.payload.content, /collecte continue/);
  assert.doesNotMatch(received.payload.content, /arrêtée|terminée/);
  assert.deepEqual(received.files.map((file) => file.name), ['report.md', 'report.json.gz']);
});

test('omits an oversized gzip attachment while still delivering markdown', async (t) => {
  const dir = await reportDir(crypto.randomBytes(8 * 1024 * 1024 - 1024)); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let received;
  const result = await notifyReport({ runDir: dir, env: testEnv(), transport: async (request) => { received = request; return { status: 204 }; } });
  assert.equal(result.status, 'sent');
  assert.deepEqual(received.files.map((file) => file.name), ['report.md']);
  assert.match(received.payload.content, /indisponible|dépasse/);
});

test('streams a raw report larger than multipart limits when its gzip fits', async (t) => {
  const dir = await reportDir(Buffer.alloc(9 * 1024 * 1024, 0)); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let received;
  const result = await notifyReport({ runDir: dir, env: testEnv(), transport: async (request) => { received = request; return { statusCode: 200 }; } });
  assert.equal(result.status, 'sent');
  assert.deepEqual(received.files.map((file) => file.name), ['report.md', 'report.json.gz']);
  assert.ok((await fs.stat(path.join(dir, 'report.json.gz'))).size < 1024 * 1024);
});

test('does not invoke transport for disabled, invalid or absent webhook configuration', async (t) => {
  const dir = await reportDir(); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const transport = async () => { throw new Error('must not send'); };
  assert.deepEqual(await notifyReport({ runDir: dir, env: testEnv({ MAINAPI_PROBE_DISCORD_ENABLED: 'false' }), transport }), { status: 'skipped', reason: 'disabled' });
  assert.deepEqual(await notifyReport({ runDir: dir, env: testEnv({ WIFLIX_PROXY_BLOCK_WEBHOOK_URL: 'https://example.test/webhook' }), transport }), { status: 'skipped', reason: 'invalid_webhook' });
  assert.deepEqual(await notifyReport({ runDir: dir, env: testEnv({ MAINAPI_PROBE_DISCORD_USER_ID: 'bad' }), transport }), { status: 'skipped', reason: 'invalid_user_id' });
});

test('transport failures and rate limits do not throw or expose a webhook URL', async (t) => {
  const dir = await reportDir(); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const secret = 'https://discord.com/api/webhooks/123456789012345678/private-token';
  const failed = await notifyReport({ runDir: dir, env: testEnv({ WIFLIX_PROXY_BLOCK_WEBHOOK_URL: secret }), transport: async () => { throw new Error(secret); } });
  assert.deepEqual(failed, { status: 'failed', reason: 'transport_error' });
  assert.doesNotMatch(JSON.stringify(failed), /private-token/);
  assert.deepEqual(await notifyReport({ runDir: dir, env: testEnv(), transport: async () => ({ statusCode: 429 }) }), { status: 'failed', reason: 'rate_limited', httpStatus: 429 });
});

test('default transport has an absolute deadline even before a response starts', async () => {
  let destroyed = false;
  const requestImpl = () => {
    const request = new EventEmitter();
    request.end = () => {};
    request.destroy = (error) => { destroyed = true; request.emit('error', error); };
    return request;
  };
  await assert.rejects(defaultTransport({
    url: 'https://discord.com/api/webhooks/123/token?wait=true', payload: { content: 'x' }, files: [], timeoutMs: 5, requestImpl,
  }), /timeout/);
  assert.equal(destroyed, true);
});

test('l’annulation ferme immédiatement la requête Discord et retire le listener', async () => {
  const controller = new AbortController();
  let destroyed = false;
  const requestImpl = () => {
    const request = new EventEmitter();
    request.end = () => {};
    request.destroy = (error) => { destroyed = true; request.emit('error', error); };
    return request;
  };
  const pending = defaultTransport({ url: 'https://discord.com/api/webhooks/123/token',
    payload: { content: 'x' }, files: [], requestImpl, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /aborted/);
  assert.equal(destroyed, true);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('une notification annulée ne prépare pas de fichier et ne contacte pas Discord', async (t) => {
  const dir = await reportDir(); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const controller = new AbortController(); controller.abort();
  const result = await notifyReport({ runDir: dir, env: testEnv(), signal: controller.signal,
    transport: () => { throw new Error('must not send'); } });
  assert.deepEqual(result, { status: 'skipped', reason: 'aborted' });
  assert.deepEqual((await fs.readdir(dir)).sort(), ['report.json', 'report.md']);
});

test('annuler la compression ferme les flux et supprime le fichier temporaire', async (t) => {
  const dir = await reportDir(); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const controller = new AbortController();
  const json = path.join(dir, 'report.json');
  const original = nativeFs.createReadStream;
  const stalled = new PassThrough();
  let opened;
  const ready = new Promise((resolve) => { opened = resolve; });
  nativeFs.createReadStream = (file, ...args) => {
    if (file !== json) return original(file, ...args);
    opened(); return stalled;
  };
  try {
    const pending = gzipReport(json, path.join(dir, 'report.json.gz'), 1048576, { signal: controller.signal });
    await ready;
    controller.abort();
    await assert.rejects(pending, /abort/i);
    assert.equal(stalled.destroyed, true);
    assert.deepEqual((await fs.readdir(dir)).sort(), ['report.json', 'report.md']);
  } finally {
    nativeFs.createReadStream = original;
    stalled.destroy();
  }
});
