import { io, type Socket } from 'socket.io-client';
import type { WatchPartyMedia } from './watchparty';

// Mirror des evenements exposes par le namespace /watchparty
// (API/watchpartyAPI/watchparty.js) — uniquement chat/participants/reactions/
// controle ici, pas l'etat de lecture (playback:*), qui attend la Phase 2
// (lecteur natif) pour un vrai controle play/pause/seek/vitesse.

export interface Participant {
  id: string;
  nickname: string;
  isHost: boolean;
  isActive: boolean;
  joinedAt: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderNickname: string;
  text: string;
  timestamp: number;
  type: 'chat' | 'system';
}

export interface RoomInfo {
  id: string;
  code: string;
  hostId: string | null;
  maxParticipants: number;
  isPublic: boolean;
  syncMode: 'classic' | 'pro';
  chatEnabled: boolean;
  controlMode: 'host-only' | 'democratic';
  coHosts: string[];
  media: WatchPartyMedia;
  createdAt: number;
  participants: Participant[];
}

export interface WatchPartySocketHandlers {
  onRoomInfo?: (info: RoomInfo) => void;
  onParticipants?: (participants: Participant[]) => void;
  onChat?: (message: ChatMessage) => void;
  onError?: (message: string) => void;
  onKicked?: () => void;
  onClosed?: () => void;
}

export function connectWatchPartySocket(
  apiBase: string,
  params: { roomId: string; nickname: string; token: string },
  handlers: WatchPartySocketHandlers,
): Socket {
  const socket = io(`${apiBase}/watchparty`, {
    query: params,
    transports: ['websocket'],
    forceNew: true,
  });

  socket.on('room:info', handlers.onRoomInfo ?? (() => {}));
  socket.on('room:participants', handlers.onParticipants ?? (() => {}));
  socket.on('room:chat', handlers.onChat ?? (() => {}));
  socket.on('room:kicked', () => handlers.onKicked?.());
  socket.on('room:closed', () => handlers.onClosed?.());
  socket.on('error', (data: { message?: string }) => handlers.onError?.(data?.message ?? 'Erreur WatchParty'));

  return socket;
}

export function sendChatMessage(socket: Socket, text: string): void {
  socket.emit('chat:message', { text });
}
