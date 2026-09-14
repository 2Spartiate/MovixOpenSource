import * as Keychain from 'react-native-keychain';
import { CONFIG } from '../config';

// Meme contrat que authRoutes.js cote web (src/pages/LoginBip39.tsx,
// CreateAccount.tsx) : phrase BIP39 generee/verifiee serveur, Turnstile
// obligatoire sur create/login, JWT renvoye dans le corps de la reponse
// (pas de cookie). Le JWT est un identifiant de session -> Keychain, pas
// AsyncStorage.

const KEYCHAIN_SERVICE = 'movix-auth';

export interface AuthUserProfile {
  username: string;
  avatar?: string;
}

export interface AuthSession {
  token: string;
  userType: string;
  userId: string;
  userProfile: AuthUserProfile;
}

interface AuthApiResponse {
  success: boolean;
  error?: string;
  token?: string;
  account?: { userType: string; userId: string };
  userProfile?: AuthUserProfile;
}

async function postJson<T>(apiBase: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || data?.success === false) {
    throw new Error(data?.error ?? `Requete ${path} a repondu ${response.status}`);
  }
  return data as T;
}

export async function generateBip39(apiBase: string): Promise<string> {
  const response = await fetch(`${apiBase}/api/auth/bip39/generate`);
  const data = await response.json();
  if (!response.ok || !data?.success) {
    throw new Error(data?.error ?? 'Impossible de generer la phrase secrete');
  }
  return data.mnemonic as string;
}

export async function createAccount(
  apiBase: string,
  params: { mnemonic: string; username: string; avatar: string; turnstileToken: string },
): Promise<AuthSession> {
  const data = await postJson<AuthApiResponse>(apiBase, '/api/auth/bip39/create', params);
  return toSession(data);
}

export async function login(
  apiBase: string,
  params: { mnemonic: string; turnstileToken: string },
): Promise<AuthSession> {
  const data = await postJson<AuthApiResponse>(apiBase, '/api/auth/bip39/login', params);
  return toSession(data);
}

function toSession(data: AuthApiResponse): AuthSession {
  if (!data.token || !data.account || !data.userProfile) {
    throw new Error('Reponse de connexion incomplete');
  }
  return {
    token: data.token,
    userType: data.account.userType,
    userId: data.account.userId,
    userProfile: data.userProfile,
  };
}

export async function saveSession(session: AuthSession): Promise<void> {
  await Keychain.setGenericPassword('movix', JSON.stringify(session), { service: KEYCHAIN_SERVICE });
}

export async function loadSession(): Promise<AuthSession | null> {
  const result = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
  if (!result) return null;
  try {
    return JSON.parse(result.password) as AuthSession;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
}

// Host du backend Mainapi (CONFIG.API_BASE_URL), distinct du site
// (AddressContext ne resout que le miroir anti-blocage du site lui-meme).
export function useAuthApiBase(): string {
  return CONFIG.API_BASE_URL;
}
