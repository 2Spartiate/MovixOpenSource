const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('cheerio');

const filename = path.join(__dirname, '../frenchstream.js');
const source = fs.readFileSync(filename, 'utf8');

function harness(reply) {
  const requests = [];
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, URL, console,
    require(name) {
      if (name === 'cheerio') return cheerio;
      if (name === 'axios') return { get: async (url, options) => {
        requests.push({ url, options });
        return typeof reply === 'function' ? reply(url) : { data: reply };
      } };
      throw new Error(`Dépendance inattendue : ${name}`);
    },
  }, { filename });
  return { api: module.exports, requests };
}

const movieHtml = `<div class="_player"><ul class="_source_list">
  <li data-link="//video.example/film" class="fullhd">Server 1 (Dropload)</li>
  <li data-link="https://mirror.example/film">Server 2 (Mixdrop)</li>
  <li data-link="//video.example/film">Doublon</li>
  <li data-link="//frenchcloud.cam/film/27419466">Embed</li>
  <li data-link="javascript:void(0)">Invalide</li>
  <li data-link="">Vide</li>
</ul></div>`;

test('les films utilisent directement /film avec l’IMDb sans tt et conservent les zéros', async () => {
  for (const [id, expected] of [['tt27419466', '27419466'], ['27419466', '27419466'], ['tt0137523', '0137523']]) {
    const h = harness(movieHtml);
    const result = await h.api.getFrenchStreamMovie(id);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].url, `https://frenchcloud.cam/film/${expected}`);
    assert.equal(h.requests[0].options.headers.Referer, 'https://frenchcloud.cam/');
    assert.equal(h.requests[0].options.timeout, 15000);
    assert.equal(result.iframe_src, h.requests[0].url);
    assert.deepEqual(JSON.parse(JSON.stringify(result.player_links)), [
      { player: 'Server 1 (Dropload)', link: 'https://video.example/film', is_hd: true },
      { player: 'Server 2 (Mixdrop)', link: 'https://mirror.example/film', is_hd: false },
    ]);
  }
});

const seriesHtml = `<title>All American</title><div class="_root">
  <div class="_stab" data-season="1498">S2</div>
  <div class="_stab" data-season="1497">S1</div>
  <div class="_grp" data-season="1498">
    <div class="_ep" data-label="S2 E1 — Épisode 1" data-link="//video.example/s2e1"><div class="_epn">E1</div></div>
  </div>
  <div class="_grp" data-season="1497">
    <div class="_ep" data-label="S1 E2 — Épisode 2" data-link="//video.example/s1e2"><div class="_ept">Épisode 2</div></div>
    <div class="_ep" data-label="S1 E1 — Épisode 1" data-link="//video.example/s1e1"><div class="_ept">Épisode 1</div></div>
    <div class="_ep" data-label="S1 E1 — Épisode 1" data-link="https://mirror.example/s1e1"><div class="_ept">Épisode 1</div></div>
    <div class="_ep" data-label="S1 E1 — Épisode 1 VOSTFR" data-link="//original.example/s1e1"><div class="_ept">Épisode 1 VOSTFR</div></div>
    <div class="_ep no-link" data-label="S1 E3 — Épisode 3" data-link=""><div class="_ept">Épisode 3</div></div>
  </div>
</div>`;

test('les séries utilisent /serial et gardent les saisons, épisodes et versions attendus par Omega', async () => {
  const h = harness(seriesHtml);
  let metadataCalls = 0;
  h.api.configure({ findTvSeriesOnTMDB: async title => {
    metadataCalls++;
    assert.equal(title, 'All American');
    return { id: 82428, name: title };
  } });
  const result = await h.api.getFrenchStreamSeries('tt7414406');
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, 'https://frenchcloud.cam/serial/7414406');
  assert.equal(metadataCalls, 1);
  const data = JSON.parse(JSON.stringify(h.api.cleanTvCacheData({ type: 'tv', series: result })));
  assert.equal(data.type, 'tv');
  assert.equal(data.series.length, 1);
  const series = data.series[0];
  assert.equal(series.title, 'All American');
  assert.equal(series.episode_count, 3);
  assert.equal(series.audio_type, 'VF / VOSTFR');
  assert.equal(series.tmdb_data.id, 82428);
  assert.deepEqual(series.seasons.map(season => season.number), [1, 2]);
  assert.deepEqual(series.seasons[0].episodes.map(episode => episode.number), ['1', '2']);
  const first = series.seasons[0].episodes[0];
  assert.deepEqual(first.versions.vf.players, [
    { name: 'video.example', link: 'https://video.example/s1e1' },
    { name: 'mirror.example', link: 'https://mirror.example/s1e1' },
  ]);
  assert.equal(first.versions.vostfr.players[0].link, 'https://original.example/s1e1');
  assert.equal(series.seasons[1].episodes[0].versions.vf.players[0].link, 'https://video.example/s2e1');
});

test('les identifiants invalides ne déclenchent aucune requête amont', async () => {
  const h = harness(movieHtml);
  for (const id of ['tt', '../27419466', 'tt27419466?other=1', null]) {
    assert.match((await h.api.getFrenchStreamMovie(id)).error, /Identifiant IMDb invalide/);
    assert.match((await h.api.getFrenchStreamSeries(id)).error, /Identifiant IMDb invalide/);
  }
  assert.equal(h.requests.length, 0);
});

test('les 404 restent distincts des erreurs temporaires et des pages inattendues', async () => {
  const missing = harness(() => { throw Object.assign(new Error('Not found'), { response: { status: 404 } }); });
  assert.equal((await missing.api.getFrenchStreamMovie('tt27419466')).error, 'Movie not found on FrenchCloud');
  assert.match((await missing.api.getFrenchStreamSeries('tt7414406')).error, /404/);
  const failure = harness(() => { throw new Error('timeout'); });
  assert.match((await failure.api.getFrenchStreamMovie('tt27419466')).error, /timeout/);
  assert.match((await failure.api.getFrenchStreamSeries('tt7414406')).error, /timeout/);
  const unexpected = harness('<html><title>Service unavailable</title></html>');
  assert.match((await unexpected.api.getFrenchStreamMovie('tt27419466')).error, /Page FrenchCloud invalide/);
  assert.match((await unexpected.api.getFrenchStreamSeries('tt7414406')).error, /Page FrenchCloud invalide/);
});

test('une série sans lien ne devient pas disponible à cause de ses épisodes vides', async () => {
  const h = harness('<div class="_root"><div class="_grp" data-season="1497"><div class="_ep" data-link="" data-label="S1 E1"></div></div></div>');
  assert.equal((await h.api.getFrenchStreamSeries('7414406')).length, 0);
  assert.equal(h.requests[0].url, 'https://frenchcloud.cam/serial/7414406');
});
