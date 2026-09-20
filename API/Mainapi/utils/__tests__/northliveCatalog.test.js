const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  createNorthliveCatalog,
  publishNorthliveCatalog,
  scrapeNorthlivePages,
} = require('../northliveCatalog');

function fixture({ isOwner, initial = [] } = {}) {
  let cache = initial;
  let scrapeCalls = 0;
  let candidate = [{ id: 'northlive_a' }];
  let publishOk = true;
  const catalog = createNorthliveCatalog({
    isOwner,
    readFresh: async () => cache,
    readStale: async () => cache,
    publish: async (channels) => {
      if (publishOk) cache = channels;
      return publishOk;
    },
    scrape: async () => {
      scrapeCalls++;
      return candidate;
    },
    logger: { warn() {} },
  });
  return {
    catalog,
    calls: () => scrapeCalls,
    setCandidate: value => { candidate = value; },
    setPublishOk: value => { publishOk = value; },
    cache: () => cache,
  };
}

test('un lecteur ne scrape jamais, même sans cache', async () => {
  const app = fixture({ isOwner: false });
  assert.deepEqual(await app.catalog.getChannels(), []);
  assert.deepEqual(await app.catalog.getChannels({ force: true }), []);
  assert.equal(app.calls(), 0);
});

test('le propriétaire déduplique les refresh concurrents et publie le catalogue complet', async () => {
  const app = fixture({ isOwner: true });
  const [first, second] = await Promise.all([
    app.catalog.refresh(), app.catalog.refresh(),
  ]);
  assert.equal(app.calls(), 1);
  assert.deepEqual(first, [{ id: 'northlive_a' }]);
  assert.deepEqual(second, first);
  assert.deepEqual(app.cache(), first);
});

test('une réponse partielle ou une publication en échec conserve le catalogue précédent', async () => {
  const previous = [{ id: 'northlive_previous' }];
  const app = fixture({ isOwner: true, initial: previous });
  app.setCandidate([]);
  assert.deepEqual(await app.catalog.refresh(), previous);
  app.setCandidate([{ id: 'northlive_new' }]);
  app.setPublishOk(false);
  assert.deepEqual(await app.catalog.refresh(), previous);
  assert.deepEqual(app.cache(), previous);
});

test('un lecteur voit une publication suivante sans devenir propriétaire', async () => {
  const shared = { value: [{ id: 'northlive_old' }] };
  let now = 0;
  const reader = createNorthliveCatalog({
    isOwner: false,
    now: () => now,
    readFresh: async () => shared.value,
    readStale: async () => shared.value,
    publish: async () => { throw new Error('reader must not publish'); },
    scrape: async () => { throw new Error('reader must not scrape'); },
    logger: { warn() {} },
  });
  assert.deepEqual(await reader.getChannels(), shared.value);
  shared.value = [{ id: 'northlive_new' }];
  now = 1000;
  assert.deepEqual(await reader.getChannels(), shared.value);
});

test('un catalogue chaud ne relit pas le JSON pour chaque requête', async () => {
  let reads = 0, now = 0;
  const channels = [{ id: 'northlive_cached' }];
  const reader = createNorthliveCatalog({
    isOwner: false, now: () => now,
    readFresh: async () => { reads++; return channels; },
    readStale: async () => [],
  });
  assert.deepEqual(await reader.getChannels(), channels);
  await Promise.all(Array.from({ length: 20 }, () => reader.getChannels()));
  assert.equal(reads, 1);
  now = 1000;
  await Promise.all(Array.from({ length: 20 }, () => reader.getChannels()));
  assert.equal(reads, 2, 'la vérification suivante est aussi partagée entre requêtes');
});

test('un cache Northlive vide ne provoque pas une rafale de lectures disque', async () => {
  let reads = 0;
  const reader = createNorthliveCatalog({
    isOwner: false,
    readFresh: async () => { reads++; return []; },
    readStale: async () => { reads++; return []; },
  });
  const results = await Promise.all(Array.from({ length: 20 }, () => reader.getChannels()));
  assert.ok(results.every(result => result.length === 0));
  assert.equal(reads, 2);
});

test('une lecture ancienne ne remplace pas le catalogue que le propriétaire vient de publier', async () => {
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const previous = [{ id: 'northlive_previous' }];
  const fresh = [{ id: 'northlive_fresh' }];
  const catalog = createNorthliveCatalog({
    isOwner: true,
    readFresh: async () => { await gate; return previous; },
    readStale: async () => previous,
    scrape: async () => fresh,
    publish: async () => true,
  });
  const reading = catalog.getChannels();
  assert.deepEqual(await catalog.refresh(), fresh);
  finish();
  assert.deepEqual(await reading, fresh);
  assert.deepEqual(await catalog.getChannels(), fresh);
});

test('la publication atomique garde le fichier complet précédent si elle échoue avant remplacement', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'movix-northlive-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'catalog.json');
  await fs.writeFile(file, JSON.stringify([{ id: 'northlive_old' }]), 'utf8');

  const failed = await publishNorthliveCatalog(file, [{ id: 'northlive_new' }], async (target, data) => {
    await fs.writeFile(`${target}.unfinished`, data, 'utf8');
    throw new Error('simulated crash before rename');
  });
  assert.equal(failed, false);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), [{ id: 'northlive_old' }]);

  assert.equal(await publishNorthliveCatalog(file, [{ id: 'northlive_new' }]), true);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), [{ id: 'northlive_new' }]);
});

function northliveResponse(total, perPage, data) {
  return { data: { data, pagination: { total, per_page: perPage } } };
}

test('le scraper rejette une dernière page vide et une pagination au-delà de sa borne', async () => {
  const channel = slug => ({ slug, country: 'France', name: slug });
  const mapChannel = item => item?.slug ? { id: item.slug, slug: item.slug } : null;
  let calls = 0;
  const lastPageEmpty = await scrapeNorthlivePages({
    fetchPage: async page => {
      calls++;
      return northliveResponse(2, 1, page === 1 ? [channel('first')] : []);
    },
    mapChannel,
  });
  assert.equal(lastPageEmpty, null);
  assert.equal(calls, 2);

  calls = 0;
  const overCap = await scrapeNorthlivePages({
    fetchPage: async page => {
      calls++;
      return northliveResponse(41, 1, [channel(`channel-${page}`)]);
    },
    mapChannel,
  });
  assert.equal(overCap, null);
  assert.equal(calls, 1);
});
