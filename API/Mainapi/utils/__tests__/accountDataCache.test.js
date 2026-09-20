const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createAccountDataCache } = require('../accountDataCache');

async function fixture(t, options = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'movix-account-cache-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let reads = 0;
  const cache = createAccountDataCache({
    ...options,
    fs: {
      stat: fs.stat,
      async open(...args) {
        const handle = await fs.open(...args);
        return {
          stat: (...args) => handle.stat(...args),
          close: () => handle.close(),
          async readFile(...args) { reads++; return handle.readFile(...args); },
        };
      },
    },
  });
  return { cache, dir, reads: () => reads, file: name => path.join(dir, `${name}.json`) };
}

test('un compte inchangé ne se relit pas, y compris pendant une rafale', async t => {
  const f = await fixture(t);
  const filename = f.file('user');
  const data = { oauth_provider: 'discord', profiles: [{ id: 'profile-one' }] };
  await fs.writeFile(filename, JSON.stringify(data));
  const first = await Promise.all(Array.from({ length: 20 }, () => f.cache.read(filename)));
  assert.ok(first.every(result => JSON.stringify(result) === JSON.stringify(data)));
  assert.deepEqual(await f.cache.read(filename), data);
  assert.equal(f.reads(), 1);
});

test('une réécriture atomique de même taille et date invalide le compte', async t => {
  const f = await fixture(t);
  const filename = f.file('user');
  await fs.writeFile(filename, '{"profiles":[1]}');
  const before = await fs.stat(filename);
  assert.deepEqual(await f.cache.read(filename), { profiles: [1] });
  const replacement = f.file('replacement');
  await fs.writeFile(replacement, '{"profiles":[]} ');
  await fs.utimes(replacement, before.atime, before.mtime);
  await fs.rename(replacement, filename);
  assert.deepEqual(await f.cache.read(filename), { profiles: [] });
  assert.equal(f.reads(), 2);
});

test('une suppression puis recréation ne réutilise jamais le compte supprimé', async t => {
  const f = await fixture(t);
  const filename = f.file('user');
  await fs.writeFile(filename, '{"oauth_provider":"discord"}');
  await f.cache.read(filename);
  await fs.unlink(filename);
  await assert.rejects(f.cache.read(filename), { code: 'ENOENT' });
  await fs.writeFile(filename, '{}');
  assert.deepEqual(await f.cache.read(filename), {});
  assert.equal(f.reads(), 2);
});

test('les entrées trop grandes ne restent pas en mémoire', async t => {
  const f = await fixture(t, { maxBytes: 128, maxEntryBytes: 64 });
  const filename = f.file('large');
  await fs.writeFile(filename, JSON.stringify({ history: 'x'.repeat(100) }));
  await f.cache.read(filename);
  await f.cache.read(filename);
  assert.equal(f.reads(), 2);
});

test('la limite totale en octets évince les données les moins utilisées', async t => {
  const f = await fixture(t, { maxBytes: 100, maxEntryBytes: 100 });
  for (const name of ['one', 'two']) await fs.writeFile(f.file(name), JSON.stringify({ value: 'x'.repeat(48) }));
  await f.cache.read(f.file('one'));
  await f.cache.read(f.file('two'));
  await f.cache.read(f.file('one'));
  assert.equal(f.reads(), 3);
});

test('la limite du nombre de comptes est respectée', async t => {
  const f = await fixture(t, { maxEntries: 2 });
  for (const name of ['one', 'two', 'three']) await fs.writeFile(f.file(name), '{}');
  await f.cache.read(f.file('one'));
  await f.cache.read(f.file('two'));
  await f.cache.read(f.file('three'));
  await f.cache.read(f.file('two'));
  await f.cache.read(f.file('one'));
  assert.equal(f.reads(), 4);
});

test('un JSON devenu invalide ne conserve pas la précédente identité', async t => {
  const f = await fixture(t);
  const filename = f.file('user');
  await fs.writeFile(filename, '{"profiles":[]}');
  await f.cache.read(filename);
  await fs.writeFile(filename, 'invalid');
  await assert.rejects(f.cache.read(filename), SyntaxError);
  await fs.writeFile(filename, '{"profiles":[2]}');
  assert.deepEqual(await f.cache.read(filename), { profiles: [2] });
});
