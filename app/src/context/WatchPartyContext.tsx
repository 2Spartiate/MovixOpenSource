import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { CONFIG } from '../config';
import type { WatchPartySession } from '../services/watchparty';
import {
  connectWatchPartySocket,
  sendChatMessage,
  type ChatMessage,
  type Participant,
  type RoomInfo,
} from '../services/watchpartySocket';

interface WatchPartyContextValue {
  session: WatchPartySession | null;
  room: RoomInfo | null;
  participants: Participant[];
  messages: ChatMessage[];
  error: string | null;
  connect: (session: WatchPartySession) => void;
  disconnect: () => void;
  sendMessage: (text: string) => void;
}

const WatchPartyContext = createContext<WatchPartyContextValue | null>(null);

export function WatchPartyProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<WatchPartySession | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setSession(null);
    setRoom(null);
    setParticipants([]);
    setMessages([]);
    setError(null);
  }, []);

  const connect = useCallback(
    (next: WatchPartySession) => {
      socketRef.current?.disconnect();
      setSession(next);
      setMessages([]);
      socketRef.current = connectWatchPartySocket(
        CONFIG.API_BASE_URL,
        { roomId: next.roomId, nickname: next.nickname, token: next.token },
        {
          onRoomInfo: setRoom,
          onParticipants: setParticipants,
          onChat: msg => setMessages(prev => [...prev, msg]),
          onError: setError,
          onKicked: () => {
            setError('Tu as ete exclu de la room.');
            disconnect();
          },
          onClosed: disconnect,
        },
      );
    },
    [disconnect],
  );

  const sendMessage = useCallback((text: string) => {
    if (socketRef.current) sendChatMessage(socketRef.current, text);
  }, []);

  return (
    <WatchPartyContext.Provider value={{ session, room, participants, messages, error, connect, disconnect, sendMessage }}>
      {children}
    </WatchPartyContext.Provider>
  );
}

export function useWatchParty(): WatchPartyContextValue {
  const ctx = useContext(WatchPartyContext);
  if (!ctx) {
    throw new Error('useWatchParty must be used inside <WatchPartyProvider>');
  }
  return ctx;
}
