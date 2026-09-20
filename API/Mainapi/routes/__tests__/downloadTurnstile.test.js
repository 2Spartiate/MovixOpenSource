const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Route et vérificateur BIP39 réels, sans réseau, base de données ni secrets locaux.
function fixture({ admin = false, configured = true, unavailable = false } = {}) {
  const checks = [];
  const resolutions = [];
  const usedTokens = new Set();
  const env = { TURNSTILE_SECRET_KEY: configured ? 'test-secret' : '' };

  function load(relative, dependencies) {
    const filename = path.resolve(__dirname, '../..', relative);
    const localRequire = createRequire(filename);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
      module, exports: module.exports, __dirname: path.dirname(filename),
      process: { env }, console: { log() {}, warn() {}, error() {} },
      require: name => name in dependencies ? dependencies[name] : localRequire(name),
    }, { filename });
    return module.exports;
  }

  const turnstile = load('utils/turnstile.js', {
    '../middleware/auth': { isAdminRequest: async () => admin },
    axios: { async post(url, body) {
      assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
      checks.push(body);
      if (unavailable) throw new Error('Simulated timeout');
      const success = body.response === 'valid-token' && !usedTokens.has(body.response);
      usedTokens.add(body.response);
      return { data: { success } };
    } },
  });

  const router = load('routes/darkiworld.js', {
    '../utils/turnstile': turnstile,
    '../utils/cacheManager': {},
    '../mysqlPool': {},
    '../utils/darkiworldSqlite': { async decodeLink(id) {
      resolutions.push(id);
      return { payload: { success: true, embed_url: 'https://download.example/file' } };
    } },
    '../utils/hydrackerLive': {},
    '../utils/hydrackerBlackout': { isHydrackerBlackout: () => true },
    '../config/redis': {},
    axios: {},
  });

  async function request({ method = 'post', token, query = {}, headers = {} } = {}) {
    const route = router.stack.find(layer => layer.route?.path === '/decode/:id').route;
    const handler = route.stack.find(layer => layer.method === method).handle;
    const req = {
      params: { id: '123' }, query, headers, ip: '192.0.2.1',
      body: method === 'post' ? { turnstileToken: token } : undefined,
    };
    const res = {
      statusCode: 200, headers: {},
      set(name, value) { this.headers[name] = value; return this; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await handler(req, res);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
    return res;
  }

  return { request, checks, resolutions };
}

for (const method of ['get', 'post']) {
  test(`${method.toUpperCase()} refuse un décodage sans jeton avant toute résolution`, async () => {
    const f = fixture();
    const res = await f.request({ method });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(f.checks.length, 0);
    assert.equal(f.resolutions.length, 0);
  });
}

for (const token of ['invalid-token', 'movix-admin-turnstile-bypass']) {
  test(`refuse le jeton ${token} d'un visiteur`, async () => {
    const f = fixture();
    const res = await f.request({ token });
    assert.equal(res.statusCode, 403);
    assert.equal(f.resolutions.length, 0);
  });
}

test('POST vérifie avec la clé BIP39 et refuse la réutilisation du jeton', async () => {
  const f = fixture();
  const first = await f.request({ token: 'valid-token' });
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.embed_url, 'https://download.example/file');
  assert.equal(f.checks[0].secret, 'test-secret');
  assert.equal(f.checks[0].remoteip, '192.0.2.1');
  const second = await f.request({ token: 'valid-token' });
  assert.equal(second.statusCode, 403);
  assert.deepEqual(f.resolutions, ['123']);
});

test('GET exige aussi la validation avant de restituer un lien', async () => {
  const f = fixture();
  const res = await f.request({ method: 'get', headers: { 'x-turnstile-token': 'valid-token' } });
  assert.equal(res.statusCode, 200);
  assert.equal(f.checks.length, 1);
  assert.deepEqual(f.resolutions, ['123']);
});

test('un jeton dans la query et le mode debug ne contournent pas la vérification', async () => {
  const f = fixture();
  const res = await f.request({ method: 'get', query: { turnstileToken: 'valid-token', debug: 'true' } });
  assert.equal(res.statusCode, 400);
  assert.equal(f.resolutions.length, 0);
});

test('une panne de Turnstile empêche la résolution', async () => {
  const f = fixture({ unavailable: true });
  const res = await f.request({ token: 'valid-token' });
  assert.equal(res.statusCode, 403);
  assert.equal(f.resolutions.length, 0);
});

test('conserve la dispense admin décidée par le serveur', async () => {
  const f = fixture({ admin: true });
  const res = await f.request();
  assert.equal(res.statusCode, 200);
  assert.equal(f.checks.length, 0);
  assert.deepEqual(f.resolutions, ['123']);
});

test('conserve le fonctionnement BIP39 lorsque Turnstile est désactivé', async () => {
  const f = fixture({ configured: false });
  const res = await f.request();
  assert.equal(res.statusCode, 200);
  assert.equal(f.checks.length, 0);
  assert.deepEqual(f.resolutions, ['123']);
});
