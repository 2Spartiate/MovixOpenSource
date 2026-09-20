import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const key = 'settings_movie_release_warnings';
const environment = (stored) => {
  const store = new Map(stored === undefined ? [] : [[key, stored]]);
  const window = new EventTarget();
  window.localStorage = {
    getItem: name => store.get(name) ?? null,
    setItem: (name, value) => store.set(name, value),
    clear: () => store.clear(),
  };
  return { window, store };
};
const load = (window) => {
  const path = 'src/utils/movieReleasePreferences.ts';
  assert.ok(existsSync(path), 'Préférence de sortie des films à implémenter');
  const js = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function('window', 'module', 'exports', js)(window, mod, mod.exports);
  return mod.exports;
};

test('les avertissements des films sont désactivés par défaut', () => {
  assert.equal(load(environment().window).getMovieReleaseWarningsEnabled(), false);
});

test('seule une activation explicite enregistrée réactive les avertissements', () => {
  for (const value of ['', 'false', '1', 'yes', 'TRUE']) {
    assert.equal(load(environment(value).window).getMovieReleaseWarningsEnabled(), false);
  }
  assert.equal(load(environment('true').window).getMovieReleaseWarningsEnabled(), true);
});

test('activation et désactivation persistent après une nouvelle lecture du réglage', () => {
  const { window, store } = environment();
  const prefs = load(window);
  prefs.setMovieReleaseWarningsEnabled(true);
  assert.equal(store.get(key), 'true');
  assert.equal(load(window).getMovieReleaseWarningsEnabled(), true);
  prefs.setMovieReleaseWarningsEnabled(false);
  assert.equal(load(window).getMovieReleaseWarningsEnabled(), false);
});

test('la fiche et les paramètres sont informés immédiatement et peuvent se désabonner', () => {
  const { window } = environment();
  const prefs = load(window);
  const observed = [];
  const unsubscribe = prefs.subscribeToMovieReleaseWarnings(() => observed.push(prefs.getMovieReleaseWarningsEnabled()));
  prefs.setMovieReleaseWarningsEnabled(true);
  prefs.setMovieReleaseWarningsEnabled(false);
  assert.deepEqual(observed, [true, false]);
  unsubscribe();
  prefs.setMovieReleaseWarningsEnabled(true);
  assert.deepEqual(observed, [true, false]);
});

test('un autre onglet ou le changement de profil actualise le réglage sans conserver l’ancien choix', () => {
  const { window, store } = environment('true');
  const prefs = load(window);
  const observed = [];
  prefs.subscribeToMovieReleaseWarnings(() => observed.push(prefs.getMovieReleaseWarningsEnabled()));
  window.dispatchEvent(Object.assign(new Event('storage'), { key: 'unrelated' }));
  assert.deepEqual(observed, []);
  store.set(key, 'false');
  window.dispatchEvent(Object.assign(new Event('storage'), { key }));
  store.set(key, 'true');
  window.dispatchEvent(new Event('sync_storage_updated'));
  store.clear();
  window.dispatchEvent(Object.assign(new Event('storage'), { key: null }));
  assert.deepEqual(observed, [false, true, false]);
});

test('un stockage indisponible ou un rendu serveur garde le défaut désactivé', () => {
  const { window } = environment();
  window.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const prefs = load(window);
  assert.doesNotThrow(() => prefs.setMovieReleaseWarningsEnabled(true));
  assert.equal(prefs.getMovieReleaseWarningsEnabled(), false);
  assert.equal(load(undefined).getMovieReleaseWarningsEnabled(), false);
});
