/** Device-local parental preferences. This is a UI guard, not DRM or server authorization. */
export const PARENTAL_STORAGE_PREFIX = 'movix_parental_';
export const PARENTAL_PIN_KEY = `${PARENTAL_STORAGE_PREFIX}pin_v1`;
export const PARENTAL_PREFS_KEY = `${PARENTAL_STORAGE_PREFIX}preferences_v1`;
export const PARENTAL_CHANGED_EVENT = 'movix-parental-changed';

export interface ParentalPreferences {
  enabled: boolean;
  maximumAge: number;
  lockHorror: boolean;
  animeHome: boolean;
}

export const DEFAULT_PARENTAL_PREFERENCES: ParentalPreferences = {
  enabled: false,
  maximumAge: 12,
  lockHorror: false,
  animeHome: false,
};
export const MIN_PARENTAL_AGE = 0;
export const MAX_PARENTAL_AGE = 21;

type PinVerifier = { version: 1; salt: string; hash: string; iterations: number };
const PIN_ITERATIONS = 310_000;
const unlockedMedia = new Set<string>();

const hex = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const fromHex = (value: string): Uint8Array => new Uint8Array(value.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []);

export function getParentalPreferences(storage: Storage = localStorage): ParentalPreferences {
  try {
    const raw = JSON.parse(storage.getItem(PARENTAL_PREFS_KEY) || 'null');
    return {
      enabled: raw?.enabled === true && hasParentalPin(storage),
      maximumAge: Number.isInteger(raw?.maximumAge)
        ? Math.min(MAX_PARENTAL_AGE, Math.max(MIN_PARENTAL_AGE, raw.maximumAge)) : DEFAULT_PARENTAL_PREFERENCES.maximumAge,
      lockHorror: raw?.lockHorror === true,
      animeHome: raw?.animeHome === true,
    };
  } catch {
    return { ...DEFAULT_PARENTAL_PREFERENCES };
  }
}

export function hasParentalPin(storage: Storage = localStorage): boolean {
  try {
    const value = JSON.parse(storage.getItem(PARENTAL_PIN_KEY) || 'null');
    return value?.version === 1 && /^[a-f0-9]{32}$/.test(value.salt)
      && /^[a-f0-9]{64}$/.test(value.hash) && value.iterations === PIN_ITERATIONS;
  } catch {
    return false;
  }
}

export function setParentalPreferences(next: ParentalPreferences, storage: Storage = localStorage): void {
  if (!hasParentalPin(storage)) throw new Error('PIN required');
  const preferences: ParentalPreferences = {
    enabled: next.enabled === true,
    maximumAge: Math.min(MAX_PARENTAL_AGE, Math.max(MIN_PARENTAL_AGE, Math.round(next.maximumAge))),
    lockHorror: next.lockHorror === true,
    animeHome: next.animeHome === true,
  };
  storage.setItem(PARENTAL_PREFS_KEY, JSON.stringify(preferences));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PARENTAL_CHANGED_EVENT));
}

export function isValidParentalPin(pin: string): boolean { return /^\d{6,8}$/.test(pin); }

async function derivePin(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, key, 256)));
}

export async function createParentalPin(pin: string, confirmation: string, storage: Storage = localStorage): Promise<boolean> {
  if (hasParentalPin(storage)) return false;
  if (!isValidParentalPin(pin) || pin !== confirmation) return false;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const verifier: PinVerifier = { version: 1, salt: hex(salt), hash: await derivePin(pin, salt, PIN_ITERATIONS), iterations: PIN_ITERATIONS };
  storage.setItem(PARENTAL_PIN_KEY, JSON.stringify(verifier));
  return true;
}

export async function verifyParentalPin(pin: string, storage: Storage = localStorage): Promise<boolean> {
  if (!isValidParentalPin(pin)) return false;
  try {
    const verifier = JSON.parse(storage.getItem(PARENTAL_PIN_KEY) || 'null') as PinVerifier | null;
    if (!verifier || !hasParentalPin(storage)) return false;
    const hash = await derivePin(pin, fromHex(verifier.salt), verifier.iterations);
    // Compare the full digest, without early exit on the first different byte.
    let difference = 0;
    for (let index = 0; index < hash.length; index++) difference |= hash.charCodeAt(index) ^ verifier.hash.charCodeAt(index);
    return difference === 0;
  } catch {
    return false;
  }
}

export async function changeParentalPin(current: string, next: string, confirmation: string, storage: Storage = localStorage): Promise<boolean> {
  if (!isValidParentalPin(next) || next !== confirmation || !(await verifyParentalPin(current, storage))) return false;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const verifier: PinVerifier = { version: 1, salt: hex(salt), hash: await derivePin(next, salt, PIN_ITERATIONS), iterations: PIN_ITERATIONS };
  storage.setItem(PARENTAL_PIN_KEY, JSON.stringify(verifier));
  unlockedMedia.clear();
  return true;
}

export function isMediaUnlocked(mediaKey: string): boolean { return unlockedMedia.has(mediaKey); }
export function unlockMedia(mediaKey: string): void { unlockedMedia.add(mediaKey); }
export function shouldOpenAnimeHome(preferences: ParentalPreferences): boolean {
  return preferences.enabled && preferences.animeHome;
}
