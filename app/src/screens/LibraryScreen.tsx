import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Placeholder : la bibliotheque (continue-watching/favoris/watchlist via
// /api/oauth/*) depend d'une connexion native (BIP39/OAuth) qui n'existe pas
// encore dans l'app (Phase 3 du plan) — l'auth se fait aujourd'hui uniquement
// dans le site charge en WebView.
export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>Bibliotheque</Text>
      <Text style={styles.subtitle}>
        Connexion requise. Bientot disponible directement dans l'app.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
  },
});
