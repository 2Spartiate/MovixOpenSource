const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const jwt = require('jsonwebtoken');
const policy = require('../../utils/syncPolicy');
const { createAccountDataCache } = require('../../utils/accountDataCache');

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'movix-auth-perf-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const accountPath = path.join(dir, 'user.json');
  await fs.writeFile(accountPath, '{"oauth_provider":"discord","profiles":[]}');
  let sessionExists = true;
  let sqlUnavailable = false;
  let selects = 0;
  let updates = 0;
  let purges = 0;
  let reads = 0;
  const cache = createAccountDataCache({ fs: {
    stat: fs.stat,
    async open(...args) {
      const handle = await fs.open(...args);
      return {
        stat: (...args) => handle.stat(...args), close: () => handle.close(),
        async readFile(...args) { reads++; return handle.readFile(...args); },
      };
    },
  } });
  const pool = { async execute(sql) {
    if (sql.startsWith('SELECT')) {
      selects++;
      if (sqlUnavailable) throw Object.assign(new Error('unavailable'), { code: 'ECONNREFUSED' });
      return [sessionExists ? [{ id: 'session-one' }] : []];
    }
    if (sql.startsWith('UPDATE')) updates++;
    if (sql.startsWith('DELETE')) purges++;
    return [{ affectedRows: 1 }];
  } };
  const secret = 'auth-performance-fixture';
  const token = jwt.sign({ sub: 'user', userType: 'oauth', sessionId: 'session-one' }, secret);
  const filename = path.resolve(__dirname, '../auth.js');
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  const stubs = {
    '../mysqlPool': { getPool: () => pool },
    '../config/redis': { redis: { status: 'ready', eval: async () => [1, 60_000] } },
    '../utils/accountDataCache': { readAccountData: cache.read },
    '../utils/syncPolicy': {
      ...policy, getUserDataFilePath: (_dirs, userType, userId) => policy.getUserDataFilePath({ usersDir: dir }, userType, userId),
    },
  };
  vm.runInNewContext(await fs.readFile(filename, 'utf8'), {
    module, exports: module.exports, __dirname: path.dirname(filename),
    require: request => request in stubs ? stubs[request] : localRequire(request),
    process: { env: { JWT_SECRET: secret } },
    setTimeout: callback => { queueMicrotask(callback); return 0; },
    console: { log() {}, warn() {}, error() {} },
  }, { filename });
  return {
    auth: module.exports, accountPath, req: () => ({ headers: { authorization: `Bearer ${token}` } }),
    revoke: () => { sessionExists = false; }, failSql: () => { sqlUnavailable = true; },
    counts: () => ({ selects, updates, purges, reads }),
  };
}

test('une requête sans token reste refusée sans erreur', async t => {
  const f = await fixture(t);
  assert.equal(await f.auth.getAuthIfValid({ headers: {} }), null);
  assert.equal(await f.auth.getAuthIfValid({}), null);
  assert.equal(await f.auth.getAuthIfValid(null), null);
  assert.equal(f.counts().selects, 0);
});

test('les validations d’une même requête partagent leur résultat', async t => {
  const f = await fixture(t);
  const req = f.req();
  const results = await Promise.all(Array.from({ length: 12 }, () => f.auth.getAuthIfValid(req)));
  assert.ok(results.every(value => value?.userId === 'user'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.counts(), { selects: 1, updates: 1, purges: 0, reads: 1 });
});

test('la clé préparée refuse signatures incorrectes et algorithmes autres que HS256', async t => {
  const f = await fixture(t);
  const payload = { sub: 'user', userType: 'oauth', sessionId: 'session-one' };
  for (const token of [
    jwt.sign(payload, 'wrong-secret'),
    jwt.sign(payload, 'auth-performance-fixture', { algorithm: 'HS384' }),
    jwt.sign(payload, 'auth-performance-fixture', { algorithm: 'HS512' }),
    jwt.sign(payload, '', { algorithm: 'none' }),
  ]) {
    assert.equal(await f.auth.getAuthIfValid({ headers: { authorization: `Bearer ${token}` } }), null);
  }
  assert.equal(f.counts().selects, 0);
});

test('les nouvelles requêtes vérifient toujours la session mais partagent le fichier inchangé', async t => {
  const f = await fixture(t);
  await f.auth.getAuthIfValid(f.req());
  await f.auth.getAuthIfValid(f.req());
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.counts(), { selects: 2, updates: 1, purges: 0, reads: 1 });
  f.revoke();
  assert.equal(await f.auth.getAuthIfValid(f.req()), null);
});

test('la suppression d’un compte est détectée malgré son cache', async t => {
  const f = await fixture(t);
  assert.ok(await f.auth.getAuthIfValid(f.req()));
  await fs.unlink(f.accountPath);
  assert.equal(await f.auth.getAuthIfValid(f.req()), null);
  assert.equal(f.counts().purges, 1);
});

test('la disparition de l’identité après réécriture invalide la session', async t => {
  const f = await fixture(t);
  assert.ok(await f.auth.getAuthIfValid(f.req()));
  await fs.writeFile(f.accountPath, '{}');
  assert.equal(await f.auth.getAuthIfValid(f.req()), null);
  assert.equal(f.counts().reads, 2);
});

test('un changement d’en-tête dans la même requête refait la validation', async t => {
  const f = await fixture(t);
  const req = f.req();
  assert.ok(await f.auth.getAuthIfValid(req));
  req.headers.authorization = 'Bearer invalid';
  assert.equal(await f.auth.getAuthIfValid(req), null);
});

test('le comportement existant en panne SQL conserve la vérification du compte', async t => {
  const f = await fixture(t);
  f.failSql();
  assert.ok(await f.auth.getAuthIfValid(f.req()));
  await fs.unlink(f.accountPath);
  assert.equal(await f.auth.getAuthIfValid(f.req()), null);
});
