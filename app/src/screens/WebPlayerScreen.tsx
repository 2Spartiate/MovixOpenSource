import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import WebViewBrowser, { type WebViewBrowserRef } from '../components/WebViewBrowser';
import type { RootStackParamList } from '../navigation/types';

// Ecran de secours (Phase 1 du plan) : reutilise WebViewBrowser tel quel pour
// jouer un titre, en attendant le handoff natif de la Phase 2 (WebView cachee
// + PreparedNativePlaybackSource -> PlayerScreen). Chrome minimal, juste un
// bouton retour — pas de barre d'adresse/back-forward, contrairement a
// l'ancien BrowserScreen.
export default function WebPlayerScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'WebPlayer'>>();
  const webViewRef = useRef<WebViewBrowserRef>(null);
  const [isPictureInPictureActive, setIsPictureInPictureActive] = useState(false);

  const onError = useCallback(() => {
    // Pas de bascule miroir ici : c'est une lecture ponctuelle, pas la
    // navigation complete du site. L'utilisateur peut revenir en arriere.
  }, []);

  const showChrome = !isPictureInPictureActive;

  return (
    <View style={styles.container}>
      {/* En portrait, un header plein pour le titre. En paysage, la video
          doit occuper tout l'ecran — un bouton retour flottant minimal
          suffit et respecte les insets (encoche/coins arrondis). */}
      {showChrome && !isLandscape && (
        <View style={[styles.header, { paddingTop: insets.top + 8, paddingLeft: insets.left + 12, paddingRight: insets.right + 12 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Retour</Text>
          </TouchableOpacity>
          <Text numberOfLines={1} style={styles.title}>
            {route.params.title}
          </Text>
          <View style={styles.backButton} />
        </View>
      )}
      <View style={styles.webViewContainer}>
        <WebViewBrowser
          ref={webViewRef}
          url={route.params.url}
          onError={onError}
          onPictureInPictureModeChange={setIsPictureInPictureActive}
        />
      </View>
      {showChrome && isLandscape && (
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.floatingBack, { top: insets.top + 8, left: insets.left + 8 }]}>
          <ChevronLeft color="#ffffff" size={22} />
        </TouchableOpacity>
      )}
    </View>
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
    paddingBottom: 10,
    backgroundColor: '#0a0a0a',
  },
  backButton: {
    minWidth: 60,
  },
  backButtonText: {
    color: '#8b5cf6',
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  webViewContainer: {
    flex: 1,
  },
  floatingBack: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
