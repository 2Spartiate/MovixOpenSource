import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenHeader from '../components/ScreenHeader';
import { useAddress } from '../context/AddressContext';
import { useWatchParty } from '../context/WatchPartyContext';
import { createRoom, joinRoom } from '../services/watchparty';
import { CONFIG } from '../config';
import type { RootStackParamList } from '../navigation/types';

type Mode = 'create' | 'join';

// La creation d'une room exige un `media.src` non vide cote serveur (voir
// API/watchpartyAPI/watchparty.js sanitizeMedia) — c'est une vraie contrainte
// du protocole, pas une simplification. Tant que le handoff de lecture natif
// (Phase 2) n'existe pas, on ne peut pas fournir un flux resolu : on pointe
// `src` vers la page du site correspondante (watch ou accueil), ce qui reste
// une URL reelle. La lecture synchronisee elle-meme reste desactivee (Goal 5).
export default function WatchPartyScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'WatchParty'>>();
  const { config } = useAddress();
  const { connect } = useWatchParty();
  const mediaContext = route.params?.mediaContext;

  const [mode, setMode] = useState<Mode>('create');
  const [nickname, setNickname] = useState('');
  const [title, setTitle] = useState(mediaContext?.title ?? '');
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);

  const onCreate = useCallback(async () => {
    if (!nickname.trim()) {
      Alert.alert('Pseudo manquant', 'Choisis un pseudo pour la room.');
      return;
    }
    const siteUrl = config?.primaryUrl ?? CONFIG.SITE_URL;
    const src = mediaContext
      ? mediaContext.mediaType === 'movie'
        ? `${siteUrl}/watch/movie/${mediaContext.id}`
        : `${siteUrl}/watch/tv/${mediaContext.id}/s/1/e/1`
      : siteUrl;
    setLoading(true);
    try {
      const session = await createRoom(CONFIG.API_BASE_URL, {
        nickname: nickname.trim(),
        media: {
          src,
          title: title.trim() || 'Movix',
          poster: mediaContext?.poster ?? null,
          mediaType: mediaContext?.mediaType ?? 'movie',
          mediaId: mediaContext ? String(mediaContext.id) : undefined,
        },
      });
      connect(session);
      navigation.replace('WatchPartyLobby');
    } catch (err: any) {
      Alert.alert('Impossible de creer la room', err?.message ?? 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [nickname, title, mediaContext, config, connect, navigation]);

  const onJoin = useCallback(async () => {
    if (!nickname.trim() || !roomCode.trim()) {
      Alert.alert('Champs manquants', 'Renseigne ton pseudo et le code de la room.');
      return;
    }
    setLoading(true);
    try {
      const session = await joinRoom(CONFIG.API_BASE_URL, { roomCode: roomCode.trim(), nickname: nickname.trim() });
      connect(session);
      navigation.replace('WatchPartyLobby');
    } catch (err: any) {
      Alert.alert('Impossible de rejoindre', err?.message ?? 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [nickname, roomCode, connect, navigation]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader title="Watch Party" />

      <View style={styles.modeRow}>
        <TouchableOpacity style={[styles.modeChip, mode === 'create' && styles.modeChipActive]} onPress={() => setMode('create')}>
          <Text style={[styles.modeChipText, mode === 'create' && styles.modeChipTextActive]}>Creer</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeChip, mode === 'join' && styles.modeChipActive]} onPress={() => setMode('join')}>
          <Text style={[styles.modeChipText, mode === 'join' && styles.modeChipTextActive]}>Rejoindre</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Ton pseudo"
          placeholderTextColor="#666666"
          value={nickname}
          onChangeText={setNickname}
        />

        {mode === 'create' ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Que regardez-vous ?"
              placeholderTextColor="#666666"
              value={title}
              onChangeText={setTitle}
              editable={!mediaContext}
            />
            <TouchableOpacity style={styles.primaryButton} onPress={onCreate} disabled={loading}>
              {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Creer la room</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Code de la room"
              placeholderTextColor="#666666"
              value={roomCode}
              onChangeText={t => setRoomCode(t.toUpperCase())}
              autoCapitalize="characters"
              maxLength={6}
            />
            <TouchableOpacity style={styles.primaryButton} onPress={onJoin} disabled={loading}>
              {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Rejoindre</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>

      <Text style={styles.hint}>
        La lecture synchronisee arrive bientot — pour l'instant, WatchParty permet de discuter et de suivre les
        participants pendant que chacun regarde de son cote.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  modeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#1f1f1f',
    alignItems: 'center',
  },
  modeChipActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  modeChipText: {
    color: '#888888',
    fontSize: 14,
    fontWeight: '700',
  },
  modeChipTextActive: {
    color: '#ffffff',
  },
  form: {
    paddingHorizontal: 16,
    gap: 12,
  },
  input: {
    backgroundColor: '#151515',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f1f1f',
    color: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: '#8b5cf6',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    color: '#666666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 32,
    lineHeight: 18,
  },
});
