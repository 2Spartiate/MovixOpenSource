import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceFunction } from './helpers/sourceFunction.mjs';

test('les logos restent affichés lorsque le cache de session est plein', async () => {
  let logos: Record<string, string | null> = {};
  const fetchLogos = sourceFunction('src/components/HeroSlider.tsx', 'fetchLogos', {
    sessionStorage: { getItem: () => null, setItem() { throw new DOMException('Full', 'QuotaExceededError'); } },
    logoCache: { current: {} }, items: [{ media_type: 'movie', id: 42 }],
    axios: { get: async () => ({ data: { logos: [{ file_path: '/logo.png', iso_639_1: 'fr' }] } }) },
    TMDB_API_KEY: 'test', setLogoUrls: (value: typeof logos) => { logos = value; }, cancelled: false,
  });
  await assert.doesNotReject(fetchLogos());
  assert.equal(logos[42], 'https://image.tmdb.org/t/p/w500/logo.png');
});

test('un cache de logos invalide ne bloque pas leur chargement', async () => {
  const fetchLogos = sourceFunction('src/components/HeroSlider.tsx', 'fetchLogos', {
    sessionStorage: { getItem: (key: string) => key.endsWith('timestamp') ? String(Date.now()) : '{invalid', setItem() {} },
    logoCache: { current: {} }, items: [], setLogoUrls() {}, cancelled: false,
  });
  await assert.doesNotReject(fetchLogos());
});

test('une liste non enregistrée ne change pas le statut affiché et signale le refus', () => {
  const setters: boolean[] = [];
  const errors: string[] = [];
  const useWatchStatus = sourceFunction('src/hooks/useWatchStatus.ts', 'useWatchStatus', {
    useState: () => [false, (value: boolean) => setters.push(value)], useEffect() {},
    useTranslation: () => ({ t: (key: string) => key }), toast: { error: (message: string) => errors.push(message) },
    localStorage: { getItem: () => '[]', setItem() { throw new DOMException('Full', 'QuotaExceededError'); } },
  });
  const status = useWatchStatus({ id: 42, type: 'movie', title: 'Test', poster_path: '' });
  assert.doesNotThrow(status.toggleWatched);
  assert.deepEqual(setters, []);
  assert.equal(errors.length, 1);
});

test('une liste enregistrée conserve les autres entrées et actualise le statut', () => {
  const setters: boolean[] = [];
  let stored = JSON.stringify([{ id: 7, title: 'déjà présent' }]);
  const useWatchStatus = sourceFunction('src/hooks/useWatchStatus.ts', 'useWatchStatus', {
    useState: () => [false, (value: boolean) => setters.push(value)], useEffect() {},
    useTranslation: () => ({ t: (key: string) => key }), toast: { error() { assert.fail('écriture valide'); } },
    localStorage: { getItem: () => stored, setItem(_key: string, value: string) { stored = value; } },
  });
  useWatchStatus({ id: 42, type: 'movie', title: 'Test', poster_path: '' }).toggleWatched();
  assert.deepEqual(JSON.parse(stored).map((item: { id: number }) => item.id), [7, 42]);
  assert.deepEqual(setters, [true]);
});

test('Wrapped renonce à la collecte quand le stockage de confidentialité est fermé', () => {
  const bindings = {
    useCallback: (callback: unknown) => callback,
    localStorage: { getItem() { throw new DOMException('Closed', 'NS_ERROR_ABORT'); } },
  };
  const isEnabled = sourceFunction('src/hooks/useWrappedTracker.ts', 'isDataCollectionEnabled', bindings);
  const getUserInfo = sourceFunction('src/hooks/useWrappedTracker.ts', 'getUserInfo', bindings);
  assert.equal(isEnabled(), false);
  assert.deepEqual(getUserInfo(), { authToken: null, profileId: null, userId: null });
});
