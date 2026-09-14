import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Crown, Send, Users } from 'lucide-react-native';
import { useWatchParty } from '../context/WatchPartyContext';
import type { RootStackParamList } from '../navigation/types';

export default function WatchPartyLobbyScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { session, room, participants, messages, sendMessage, disconnect } = useWatchParty();
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList>(null);

  const onLeave = useCallback(() => {
    disconnect();
    navigation.goBack();
  }, [disconnect, navigation]);

  const onShare = useCallback(() => {
    if (!session) return;
    Share.share({ message: `Rejoins ma Watch Party Movix avec le code ${session.roomCode} !` });
  }, [session]);

  const onSend = useCallback(() => {
    if (!draft.trim()) return;
    sendMessage(draft.trim());
    setDraft('');
  }, [draft, sendMessage]);

  if (!session) {
    Alert.alert('Session terminee', 'Tu as quitte la Watch Party.');
    navigation.goBack();
    return null;
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onLeave}>
          <Text style={styles.leave}>Quitter</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onShare} style={styles.codeButton}>
          <Text style={styles.codeLabel}>Code</Text>
          <Text style={styles.codeValue}>{session.roomCode}</Text>
        </TouchableOpacity>
        <View style={styles.participantsBadge}>
          <Users size={14} color="#888888" />
          <Text style={styles.participantsCount}>{participants.length}</Text>
        </View>
      </View>

      {room?.media?.title && <Text style={styles.mediaTitle}>{room.media.title}</Text>}

      <FlatList
        horizontal
        data={participants}
        keyExtractor={p => p.id}
        style={styles.participantList}
        contentContainerStyle={styles.participantListContent}
        renderItem={({ item }) => (
          <View style={styles.participantChip}>
            {item.isHost && <Crown size={12} color="#f59e0b" style={{ marginRight: 4 }} />}
            <Text style={styles.participantName}>{item.nickname}</Text>
          </View>
        )}
      />

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={m => m.id}
        contentContainerStyle={styles.chatContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) =>
          item.type === 'system' ? (
            <Text style={styles.systemMessage}>{item.text}</Text>
          ) : (
            <View style={styles.chatMessage}>
              <Text style={styles.chatSender}>{item.senderNickname}</Text>
              <Text style={styles.chatText}>{item.text}</Text>
            </View>
          )
        }
      />

      <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
        <TextInput
          style={styles.composerInput}
          placeholder="Message..."
          placeholderTextColor="#666666"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={onSend}
          returnKeyType="send"
        />
        <TouchableOpacity style={styles.sendButton} onPress={onSend}>
          <Send size={18} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  leave: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
  codeButton: {
    alignItems: 'center',
  },
  codeLabel: {
    color: '#666666',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  codeValue: {
    color: '#8b5cf6',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
  participantsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  participantsCount: {
    color: '#888888',
    fontSize: 13,
    fontWeight: '600',
  },
  mediaTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  participantList: {
    maxHeight: 40,
    marginBottom: 8,
  },
  participantListContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  participantChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151515',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#1f1f1f',
  },
  participantName: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  chatContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexGrow: 1,
  },
  systemMessage: {
    color: '#666666',
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  chatMessage: {
    backgroundColor: '#151515',
    borderRadius: 10,
    padding: 10,
    alignSelf: 'flex-start',
    maxWidth: '80%',
  },
  chatSender: {
    color: '#8b5cf6',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  chatText: {
    color: '#ffffff',
    fontSize: 14,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#1f1f1f',
  },
  composerInput: {
    flex: 1,
    backgroundColor: '#151515',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1f1f1f',
    color: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
