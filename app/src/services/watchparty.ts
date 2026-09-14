// Mirror de API/watchpartyAPI/watchparty.js. Pas d'auth requise (juste un
// pseudo) — c'est le contrat du site, pas une simplification mobile.

export interface WatchPartyMedia {
  src: string;
  title: string;
  poster?: string | null;
  mediaType: 'movie' | 'tv';
  mediaId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

export interface WatchPartySession {
  roomId: string;
  roomCode: string;
  token: string;
  nickname: string;
  isHost: boolean;
}

interface CreateResponse {
  success: boolean;
  message?: string;
  roomId: string;
  roomCode: string;
  hostToken: string;
  nickname: string;
}

interface JoinResponse {
  success: boolean;
  message?: string;
  roomId: string;
  roomCode: string;
  token: string;
  nickname: string;
}

export async function createRoom(
  apiBase: string,
  params: { nickname: string; media: WatchPartyMedia; maxParticipants?: number; isPublic?: boolean },
): Promise<WatchPartySession> {
  const response = await fetch(`${apiBase}/api/watchparty/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data: CreateResponse = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message ?? `Creation de room a repondu ${response.status}`);
  }
  return { roomId: data.roomId, roomCode: data.roomCode, token: data.hostToken, nickname: data.nickname, isHost: true };
}

export async function joinRoom(
  apiBase: string,
  params: { roomCode: string; nickname: string },
): Promise<WatchPartySession> {
  const response = await fetch(`${apiBase}/api/watchparty/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data: JoinResponse = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message ?? `Connexion a la room a repondu ${response.status}`);
  }
  return { roomId: data.roomId, roomCode: data.roomCode, token: data.token, nickname: data.nickname, isHost: false };
}
