import assert from 'node:assert/strict';
import test from 'node:test';
import {
  changeParentalPin, createParentalPin, getParentalPreferences, hasParentalPin,
  isMediaUnlocked, PARENTAL_PIN_KEY, PARENTAL_PREFS_KEY, setParentalPreferences,
  shouldOpenAnimeHome, unlockMedia, verifyParentalPin,
} from '../src/utils/parentalControls.ts';
import { getAllLocalStorageEntries, getNonSyncableLocalStorageEntries, getStorageKeySyncState, getSyncableLocalStorageEntries, shouldPreserveStorageKeyOnProfileLoad } from '../src/utils/syncStorage.ts';
import { replaceProfileStorage } from '../src/utils/profileStorage.ts';
import { decideMediaAccess, getParentalLockReason, isHorrorMedia } from '../src/utils/parentalPolicy.ts';
import { getPreferredRegionalAge, parseCertificationAge } from '../src/utils/certificationUtils.ts';

class MemoryStorage {
  #data = new Map();
  get length() { return this.#data.size; }
  key(index) { return [...this.#data.keys()][index] ?? null; }
  getItem(key) { return this.#data.get(key) ?? null; }
  setItem(key, value) { this.#data.set(key, String(value)); }
  removeItem(key) { this.#data.delete(key); }
  clear() { this.#data.clear(); }
}

test('first PIN requires confirmation, salts the verifier and rejects wrong or short PINs', async () => {
  const storage = new MemoryStorage();
  assert.equal(hasParentalPin(storage), false);
  assert.equal(await createParentalPin('123456', '123457', storage), false);
  assert.equal(await createParentalPin('1234', '1234', storage), false);
  assert.equal(storage.length, 0);
  assert.equal(await createParentalPin('123456', '123456', storage), true);
  assert.equal(hasParentalPin(storage), true);
  assert.equal(storage.getItem(PARENTAL_PIN_KEY).includes('123456'), false);
  assert.equal(await createParentalPin('888888', '888888', storage), false);
  assert.equal(await verifyParentalPin('888888', storage), false);
  assert.equal(await verifyParentalPin('123456', storage), true);
});

test('PIN change requires current PIN and matching new entries without corrupting the old verifier', async () => {
  const storage = new MemoryStorage();
  await createParentalPin('654321', '654321', storage);
  const before = storage.getItem(PARENTAL_PIN_KEY);
  assert.equal(await changeParentalPin('000000', '123456', '123456', storage), false);
  assert.equal(await changeParentalPin('654321', '123456', '123457', storage), false);
  assert.equal(storage.getItem(PARENTAL_PIN_KEY), before);
  assert.equal(await changeParentalPin('654321', '123456', '123456', storage), true);
  assert.equal(await verifyParentalPin('654321', storage), false);
  assert.equal(await verifyParentalPin('123456', storage), true);
});

test('local preferences default off, enforce age bounds and apply Anime Home only when enabled', async () => {
  const storage = new MemoryStorage();
  assert.deepEqual(getParentalPreferences(storage), { enabled: false, maximumAge: 12, lockHorror: false, animeHome: false });
  assert.throws(() => setParentalPreferences({ enabled: true, maximumAge: 12, lockHorror: false, animeHome: false }, storage));
  await createParentalPin('135790', '135790', storage);
  setParentalPreferences({ enabled: false, maximumAge: 99, lockHorror: true, animeHome: true }, storage);
  assert.equal(getParentalPreferences(storage).maximumAge, 21);
  assert.equal(shouldOpenAnimeHome(getParentalPreferences(storage)), false);
  setParentalPreferences({ enabled: true, maximumAge: -3, lockHorror: true, animeHome: true }, storage);
  assert.equal(getParentalPreferences(storage).maximumAge, 0);
  assert.equal(shouldOpenAnimeHome(getParentalPreferences(storage)), true);
  storage.removeItem(PARENTAL_PIN_KEY);
  assert.equal(getParentalPreferences(storage).enabled, false);
});

test('PIN and preferences never sync, export or disappear during profile replacement', async () => {
  const storage = new MemoryStorage();
  await createParentalPin('112233', '112233', storage);
  setParentalPreferences({ enabled: true, maximumAge: 12, lockHorror: true, animeHome: false }, storage);
  storage.setItem('settings_example', 'old');
  const verifier = storage.getItem(PARENTAL_PIN_KEY);
  assert.equal(getStorageKeySyncState(PARENTAL_PIN_KEY), 'blocked');
  assert.equal(getStorageKeySyncState(PARENTAL_PREFS_KEY), 'blocked');
  assert.equal(shouldPreserveStorageKeyOnProfileLoad(PARENTAL_PIN_KEY), true);
  assert.equal(PARENTAL_PIN_KEY in getSyncableLocalStorageEntries(storage), false);
  assert.equal(PARENTAL_PIN_KEY in getAllLocalStorageEntries(storage), false);
  assert.equal(getNonSyncableLocalStorageEntries(storage).some(entry => entry.key === PARENTAL_PIN_KEY), false);
  replaceProfileStorage({ settings_example: 'new', [PARENTAL_PIN_KEY]: 'attacker' }, storage);
  assert.equal(storage.getItem(PARENTAL_PIN_KEY), verifier);
  assert.equal(storage.getItem('settings_example'), 'new');
  assert.equal(await verifyParentalPin('112233', storage), true);
});

test('FR precedes US; an unrecognised rating falls through and unknown remains unknown', () => {
  assert.equal(parseCertificationAge('TP'), 0);
  assert.equal(parseCertificationAge('PG-13'), 13);
  assert.equal(parseCertificationAge('mystery certificate'), null);
  const ratings = [
    { iso_3166_1: 'US', rating: 'TV-MA' },
    { iso_3166_1: 'FR', rating: '12' },
  ];
  assert.equal(getPreferredRegionalAge(ratings, entry => [entry.rating]), 12);
  ratings[1].rating = 'unknown';
  assert.equal(getPreferredRegionalAge(ratings, entry => [entry.rating]), 17);
  assert.equal(getPreferredRegionalAge([{ iso_3166_1: 'FR', rating: '' }], entry => [entry.rating]), null);
});

test('threshold is strict, horror independent, TV fantasy alone is not horror, unknown requires PIN', () => {
  const prefs = { enabled: true, maximumAge: 12, lockHorror: false, animeHome: false };
  const media = { mediaType: 'movie', id: 1, age: 12, genres: [{ id: 18, name: 'Drama' }], keywords: [] };
  assert.equal(getParentalLockReason(prefs, media), null);
  assert.equal(getParentalLockReason(prefs, { ...media, age: 13 }), 'age');
  assert.equal(getParentalLockReason(prefs, { ...media, age: null }), 'unknown');
  const horror = { ...media, genres: [{ id: 27, name: 'Horror' }] };
  assert.equal(isHorrorMedia(horror), true);
  assert.equal(getParentalLockReason({ ...prefs, lockHorror: true }, horror), 'horror');
  const fantasy = { ...media, mediaType: 'tv', genres: [{ id: 10765, name: 'Science Fiction & Fantasy' }] };
  assert.equal(isHorrorMedia(fantasy), false);
  assert.equal(getParentalLockReason({ ...prefs, lockHorror: true }, fantasy), null);
  assert.equal(isHorrorMedia({ ...fantasy, keywords: [{ id: 2, name: 'psychological horror' }] }), true);
  assert.equal(getParentalLockReason({ ...prefs, lockHorror: true }, { ...fantasy, keywords: null }), 'unknown');
  assert.deepEqual(decideMediaAccess(prefs, { ...media, age: 16 }, 12), { kind: 'profile' });
  assert.deepEqual(decideMediaAccess(prefs, { ...media, age: 16 }, 18), { kind: 'parental', reason: 'age' });
  assert.deepEqual(decideMediaAccess({ ...prefs, enabled: false }, { ...media, age: 16 }, 18), { kind: 'allowed' });
});

test('a successful media PIN unlock is scoped to that title in the current JS session', () => {
  const movie = 'movie:999901';
  const another = 'movie:999902';
  const series = 'tv:999901';
  assert.equal(isMediaUnlocked(movie), false);
  unlockMedia(movie);
  assert.equal(isMediaUnlocked(movie), true);
  assert.equal(isMediaUnlocked(another), false);
  assert.equal(isMediaUnlocked(series), false);
});
