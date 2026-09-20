import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const load = () => {
  const path = 'src/utils/movieRelease.ts';
  assert.ok(existsSync(path), 'Calcul des sorties de films à implémenter');
  const js = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(require, mod, mod.exports);
  return mod.exports;
};
const release = (type, date) => ({ type, release_date: `${date}T00:00:00.000Z` });
const region = (country, ...dates) => ({ iso_3166_1: country, release_dates: dates });
const data = (...regions) => ({ results: regions });
const t = (language) => {
  const strings = JSON.parse(readFileSync(`src/i18n/locales/${language}.json`, 'utf8'));
  return (key, values = {}) => {
    const text = key.split('.').reduce((value, part) => value?.[part], strings);
    assert.equal(typeof text, 'string', `Traduction manquante : ${key}`);
    return text.replace(/{{(\w+)}}/g, (_, key) => String(values[key]));
  };
};

test('une sortie cinéma passée ne masque pas une sortie numérique à venir', () => {
  const { parseMovieReleases, needsMovieReleaseWarning } = load();
  const releases = parseMovieReleases(data(region('US', release(3, '2026-08-01'), release(4, '2026-09-09'))), '2026-08-01');
  assert.equal(releases.theatrical.date, '2026-08-01');
  assert.equal(releases.digital.date, '2026-09-09');
  assert.equal(needsMovieReleaseWarning(releases, new Date(2026, 8, 8, 12).getTime()), true);
});

test('le rappel et la mention date indicative disparaissent six heures avant le jour annoncé', () => {
  const { parseMovieReleases, needsMovieReleaseWarning, getMovieReleaseLabel } = load();
  const releases = parseMovieReleases(data(region('US', release(4, '2026-09-08'))), '2026-09-08');
  assert.equal(needsMovieReleaseWarning(releases, new Date(2026, 8, 7, 17, 59, 59, 999).getTime()), true);
  for (const now of [new Date(2026, 8, 7, 18), new Date(2026, 8, 7, 22), new Date(2026, 8, 8, 0), new Date(2026, 8, 8, 12)]) {
    assert.equal(needsMovieReleaseWarning(releases, now.getTime()), false);
    assert.doesNotMatch(getMovieReleaseLabel(releases.digital, 'digital', t('fr'), 'fr-FR', now.getTime()), /date indicative|horaire non confirmé/i);
  }
});

test('une première de festival, un DVD et la télévision ne deviennent pas des sorties numériques', () => {
  const releases = load().parseMovieReleases(data(region('FR',
    release(1, '2026-01-01'), release(2, '2026-05-01'), release(3, '2026-05-07'),
    release(5, '2026-08-01'), release(6, '2026-09-01'),
  )), '2026-01-01');
  assert.equal(releases.digital, null);
  assert.equal(releases.theatrical.date, '2026-05-01');
  assert.equal(releases.homeVideo.date, '2026-08-01');
});

test('Spider-Man affiche sa date DVD/Blu-ray quand aucune date numérique n’est renseignée', () => {
  const { parseMovieReleases, getMovieReleaseLabel } = load();
  const releases = parseMovieReleases(data(
    region('FR', release(3, '2026-07-29')),
    region('US', release(5, '2026-11-17')),
  ), '2026-07-29');
  assert.equal(releases.digital, null);
  const label = getMovieReleaseLabel(releases.homeVideo, 'homeVideo', t('fr'), 'fr-FR', new Date(2026, 8, 8, 12).getTime());
  assert.match(label, /DVD.*Blu-ray.*17.*2026.*États-Unis/);
  assert.doesNotMatch(label, /inconnue|numérique/);
});

test('la sortie TV est affichée si elle précède les sorties numérique et physique', () => {
  const { parseMovieReleases, getMovieReleaseLabel } = load();
  const releases = parseMovieReleases(data(
    region('FR', release(4, '2026-10-01'), release(5, '2026-09-15')),
    region('US', release(6, '2026-09-10')),
  ));
  assert.equal(releases.homeVideo.type, 6);
  assert.equal(releases.homeVideo.date, '2026-09-10');
  assert.match(getMovieReleaseLabel(releases.homeVideo, 'homeVideo', t('fr'), 'fr-FR', new Date(2026, 8, 8).getTime()), /Diffusion TV.*10.*2026/);
});

test('la sortie hors cinéma reste inconnue si seuls le cinéma et les festivals sont renseignés', () => {
  const { parseMovieReleases, getMovieReleaseLabel } = load();
  const releases = parseMovieReleases(data(region('FR', release(1, '2026-06-01'), release(3, '2026-07-29'))));
  assert.equal(releases.homeVideo, null);
  assert.equal(getMovieReleaseLabel(releases.homeVideo, 'homeVideo', t('fr'), 'fr-FR'), 'Date de sortie hors cinéma inconnue');
});

test('la première sortie numérique mondiale est retenue avec son pays', () => {
  const { parseMovieReleases } = load();
  const releases = parseMovieReleases(data(
    region('FR', release(4, '2026-10-01')),
    region('US', release(4, '2026-09-09'), release(4, '2027-01-01')),
  ));
  assert.equal(releases.digital.date, '2026-09-09');
  assert.equal(releases.digital.country, 'US');
});

test('à date égale, la France est affichée en priorité', () => {
  const result = load().parseMovieReleases(data(
    region('US', release(4, '2026-09-09')), region('FR', release(4, '2026-09-09')),
  ));
  assert.equal(result.digital.country, 'FR');
});

test('une sortie physique ancienne permet de lire un film avant une réédition numérique', () => {
  const { parseMovieReleases, needsMovieReleaseWarning } = load();
  const releases = parseMovieReleases(data(region('US', release(5, '2005-01-01'), release(4, '2026-10-01'))), '2004-01-01');
  assert.equal(needsMovieReleaseWarning(releases, Date.parse('2026-09-08')), false);
});

test('sans date numérique, un ancien film reste accessible sans prétendre être disponible en streaming', () => {
  const { parseMovieReleases, needsMovieReleaseWarning, getMovieReleaseLabel } = load();
  const releases = parseMovieReleases(undefined, '2005-01-01');
  assert.equal(releases.digital, null);
  assert.equal(needsMovieReleaseWarning(releases, Date.parse('2026-09-08')), false);
  assert.equal(getMovieReleaseLabel(null, 'digital', t('fr'), 'fr-FR'), 'Date de sortie numérique inconnue');
});

test('une sortie future sans détail numérique garde un avertissement contournable', () => {
  const { parseMovieReleases, needsMovieReleaseWarning } = load();
  assert.equal(needsMovieReleaseWarning(parseMovieReleases({}, '2026-10-01'), Date.parse('2026-09-08')), true);
});

test('les réponses incomplètes et les dates impossibles sont écartées', () => {
  const { parseMovieReleases } = load();
  for (const input of [null, {}, { results: 'invalide' }, data(null, { release_dates: {} }), data(region('US', release(4, '2026-02-30'), { type: '4', release_date: '2026-01-01' }))]) {
    const result = parseMovieReleases(input, 'invalide');
    assert.equal(result.digital, null);
    assert.equal(result.theatrical, null);
    assert.equal(result.referenceDate, null);
  }
});

test('le jour d’une date TMDB reste identique quel que soit son suffixe horaire', () => {
  const { parseMovieReleases, formatMovieReleaseDate } = load();
  const result = parseMovieReleases(data(region('US', { type: 4, release_date: '2026-09-08T23:30:00-07:00' })));
  assert.equal(result.digital.date, '2026-09-08');
  assert.match(formatMovieReleaseDate(result.digital.date, 'en-US'), /Sep.*8.*2026/);
});

test('les libellés différencient cinéma, numérique et date indicative sans promesse de lecteur', () => {
  const { parseMovieReleases, getMovieReleaseLabel } = load();
  const result = parseMovieReleases(data(region('US', release(3, '2026-08-01'), release(4, '2026-09-08'))));
  const now = new Date(2026, 8, 7, 12).getTime();
  const digital = getMovieReleaseLabel(result.digital, 'digital', t('fr'), 'fr-FR', now);
  assert.match(digital, /numérique.*8.*2026.*États-Unis/);
  assert.match(digital, /date indicative/);
  assert.doesNotMatch(digital, /disponible|sorti\b/i);
  assert.match(getMovieReleaseLabel(result.theatrical, 'theatrical', t('fr'), 'fr-FR', now), /cinéma/);
});

test('une date numérique ancienne est présentée comme une date, sans avertissement horaire permanent', () => {
  const { parseMovieReleases, getMovieReleaseLabel } = load();
  const result = parseMovieReleases(data(region('FR', release(4, '2005-01-01'))));
  const text = getMovieReleaseLabel(result.digital, 'digital', t('en'), 'en-US', Date.parse('2026-09-08'));
  assert.match(text, /digital.*2005.*France/i);
  assert.doesNotMatch(text, /unconfirmed|available|released/i);
});
