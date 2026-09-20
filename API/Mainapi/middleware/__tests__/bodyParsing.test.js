'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { gzipSync } = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  createGlobalBodyParsers, createSyncBodyParsers, createAuthBodyParsers,
  rejectOversizedSync, getParsedBodyBytes,
} = require('../bodyParsing');
const { jsonParseErrorHandler } = require('../security');

function request(data, path = '/api/sync', extraHeaders = {}) {
  let reads = 0;
  const req = new Readable({ read() { reads++; this.push(data); this.push(null); } });
  Object.assign(req, { method: 'POST', path, url: path, originalUrl: path,
    headers: { 'content-type': 'application/json', 'content-length': String(data.length), ...extraHeaders } });
  req.reads = () => reads;
  return req;
}
function invoke(middleware, req) {
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body, next: false }); return this; },
    };
    try {
      Promise.resolve(middleware(req, res, error => error ? reject(error) : resolve({ next: true }))).catch(reject);
    } catch (error) { reject(error); }
  });
}
async function parseSync(req) {
  for (const parser of createSyncBodyParsers()) await invoke(parser, req);
}

test('les parseurs globaux laissent les corps sync/auth intacts pour les contrôles des routes', async () => {
  for (const path of ['/api/sync', '/API/Sync/', '/api/auth/bip39/create', '/api/auth/links/google', '/api/auth/username']) {
    const req = request(Buffer.from('{"test":true}'), path);
    const global = createGlobalBodyParsers();
    assert.equal((await invoke(global.json, req)).next, true);
    assert.equal((await invoke(global.urlencoded, req)).next, true);
    assert.equal(req.reads(), 0);
    assert.equal(req.body, undefined);
    req.destroy();
  }
});

test('une requête sync trop grande est refusée avant lecture de son corps', async () => {
  const req = request(Buffer.from('{}'), '/api/sync', { 'content-length': String(7 * 1024 * 1024) });
  assert.equal((await invoke(rejectOversizedSync, req)).status, 413);
  assert.equal(req.reads(), 0);
  req.destroy();
});

test('les écritures de compte protégées rejettent un JWT absent avant tout parsing', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../../routes/authRoutes.js'), 'utf8');
  const begin = source.indexOf('async function authorizeAuthWrite(');
  const end = source.indexOf('// Récupération de la liste', begin);
  assert.ok(begin > 0 && end > begin);
  const context = vm.createContext({ getAuthIfValid: async req => req.auth || null });
  vm.runInContext(source.slice(begin, end) + '\nglobalThis.guard = authorizeAuthWrite;', context);
  for (const auth of [null, { userType: 'guest' }, { userType: 'oauth' }]) {
    const req = request(Buffer.from('{"username":"Alice"}'), '/api/auth/username');
    req.auth = auth;
    const guarded = await invoke(context.guard, req);
    if (auth?.userType === 'oauth') {
      assert.equal(guarded.next, true);
      for (const parser of createAuthBodyParsers()) await invoke(parser, req);
      assert.equal(req.body.username, 'Alice');
    } else {
      assert.equal(guarded.status, 401);
      assert.equal(req.reads(), 0);
      req.destroy();
    }
  }
});

test('la sync admise est parsée une fois et conserve sa taille réelle pour le quota', async () => {
  const raw = Buffer.from('{ "ops": [], "profileId": "one" }');
  const req = request(raw);
  await parseSync(req);
  assert.deepEqual(req.body, { ops: [], profileId: 'one' });
  assert.equal(getParsedBodyBytes(req), raw.length);
  assert.equal(req.reads(), 1);
});

test('les corps sans Content-Length et les corps compressés restent plafonnés après décompression', async () => {
  const raw = Buffer.from(JSON.stringify({ data: 'a'.repeat(5 * 1024 * 1024) }));
  const chunked = request(raw, '/api/sync', { 'transfer-encoding': 'chunked' });
  delete chunked.headers['content-length'];
  await assert.rejects(parseSync(chunked), error => error.type === 'entity.too.large');
  const compressed = request(gzipSync(raw), '/api/sync', { 'content-encoding': 'gzip' });
  assert.equal((await invoke(rejectOversizedSync, compressed)).next, true);
  await assert.rejects(parseSync(compressed), error => error.type === 'entity.too.large');
});

test('les autres routes et le JSON déjà parsé du webhook conservent leur fonctionnement', async () => {
  const req = request(Buffer.from('{"value":1}'), '/api/comments');
  await invoke(createGlobalBodyParsers().json, req);
  assert.equal(req.body.value, 1);
  const webhook = request(Buffer.from('not json'), '/api/vip/cryptogate/webhook');
  webhook._body = true;
  webhook.body = { signed: true };
  await invoke(createGlobalBodyParsers().json, webhook);
  assert.deepEqual(webhook.body, { signed: true });
  assert.equal(webhook.reads(), 0);
  webhook.destroy();
});

test('les formulaires auth restent acceptés et les erreurs JSON gardent une réponse 400', async () => {
  const req = request(Buffer.from('username=Alice'), '/api/auth/username', { 'content-type': 'application/x-www-form-urlencoded' });
  for (const parser of createAuthBodyParsers()) await invoke(parser, req);
  assert.equal(req.body.username, 'Alice');
  const malformed = request(Buffer.from('{broken'));
  let parseError;
  try { await parseSync(malformed); } catch (error) { parseError = error; }
  assert.equal(parseError.type, 'entity.parse.failed');
  const result = await invoke((req, res, next) => jsonParseErrorHandler(parseError, req, res, next), malformed);
  assert.equal(result.status, 400);
});
