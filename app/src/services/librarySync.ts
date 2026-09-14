import AsyncStorage from '@react-native-async-storage/async-storage';
import { LIBRARY_KEYS } from './library';

// Protocole exact de API/Mainapi/routes/sync.js : {op:'set', key, value}
// avec `value` obligatoirement une string (c'est deja le cas, AsyncStorage
// ne stocke que des strings JSON) — un 'set' remplace integralement la
// valeur cote serveur, suffisant pour une synchro bidirectionnelle simple
// (pas besoin de la granularite arrayAdd/arrayRemove pour la v1 mobile).

interface SyncOp {
  op: 'set';
  key: string;
  value: string;
}

export async function pushSync(apiBase: string, token: string, userType: string, profileId: string): Promise<void> {
  const ops: SyncOp[] = [];
  for (const key of LIBRARY_KEYS) {
    const value = await AsyncStorage.getItem(key);
    if (value !== null) {
      ops.push({ op: 'set', key, value });
    }
  }
  if (ops.length === 0) return;

  const response = await fetch(`${apiBase}/api/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ userType, profileId, ops }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? `Sync a repondu ${response.status}`);
  }
}

export async function pullSync(apiBase: string, token: string, profileId: string): Promise<void> {
  const response = await fetch(`${apiBase}/api/profiles/${profileId}/data`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok || data?.success === false) {
    throw new Error(data?.error ?? `Hydratation du profil a repondu ${response.status}`);
  }
  const serverData: Record<string, string> = data.data ?? {};
  for (const key of LIBRARY_KEYS) {
    if (typeof serverData[key] === 'string') {
      await AsyncStorage.setItem(key, serverData[key]);
    }
  }
}
