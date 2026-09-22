import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  telegramUrl: string;
  onRetry: () => void;
}

export default function MirrorErrorScreen({ telegramUrl, onRetry }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}>
      <View style={styles.content}>
        <Text style={styles.title}>Movix injoignable</Text>
        <Text style={styles.body}>
          Tous les domaines Movix semblent bloqués ou hors ligne. Rejoins le
          canal Telegram pour récupérer le nouveau lien officiel.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => Linking.openURL(telegramUrl)}>
          <Text style={styles.primaryText}>Ouvrir Telegram</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={onRetry}>
          <Text style={styles.secondaryText}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    color: '#a1a1aa',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },
  primaryButton: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    minWidth: 200,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    minWidth: 200,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  secondaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
});
