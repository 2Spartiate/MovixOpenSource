import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  BackHandler,
  Platform,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  AppState,
  PlatformColor,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WebViewNavigation } from 'react-native-webview';

import WebViewBrowser, { type WebViewBrowserRef } from '../components/WebViewBrowser';
import { NativeGlassSurface } from '../components/ios/NativeGlassSurface';
import MiniPill from '../components/MiniPill';
import MirrorErrorScreen from '../components/MirrorErrorScreen';
import { setLocalPlaybackAwake } from '../services/playbackAwake';
import { setPictureInPicturePlaybackActive } from '../services/pictureInPicture';
import { useAddress } from '../context/AddressContext';
import SettingsScreen from './SettingsScreen';

export default function BrowserScreen() {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebViewBrowserRef>(null);
  const { config, isLoading, refresh } = useAddress();

  const urlChain = useMemo(() => {
    if (!config) return [];
    return [config.primaryUrl, ...config.mirrors];
  }, [config]);

  const [mirrorIndex, setMirrorIndex] = useState(0);
  const [allMirrorsFailed, setAllMirrorsFailed] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [isPictureInPictureActive, setIsPictureInPictureActive] = useState(false);
  const [webViewGeneration, setWebViewGeneration] = useState(0);
  const autoRecoveryAttemptedRef = useRef(false);
  const autoRecoveryInFlightRef = useRef(false);

  const activeUrl = urlChain[mirrorIndex] ?? '';

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (settingsVisible) {
        setSettingsVisible(false);
        return true;
      }
      if (canGoBack) {
        webViewRef.current?.goBack();
        return true;
      }
      return false;
    });

    return () => handler.remove();
  }, [canGoBack, settingsVisible]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        webViewRef.current?.refreshCastShimStatus();
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => () => {
    setPictureInPicturePlaybackActive(false);
    setLocalPlaybackAwake(false);
  }, []);

  const onPictureInPictureModeChange = useCallback((active: boolean) => {
    if (active) {
      setSettingsVisible(false);
    }
    setIsPictureInPictureActive(active);
  }, []);

  const onNavigationStateChange = useCallback((state: WebViewNavigation) => {
    setCanGoBack(state.canGoBack);
  }, []);

  const onWebViewError = useCallback(
    async (description: string) => {
      console.warn('[BrowserScreen] WebView error', description, 'on', activeUrl);

      if (autoRecoveryInFlightRef.current) {
        return;
      }

      if (mirrorIndex + 1 < urlChain.length) {
        setMirrorIndex(i => i + 1);
        return;
      }

      if (!autoRecoveryAttemptedRef.current) {
        autoRecoveryAttemptedRef.current = true;
        autoRecoveryInFlightRef.current = true;
        try {
          await refresh();
          setAllMirrorsFailed(false);
          setMirrorIndex(0);
          setWebViewGeneration(generation => generation + 1);
        } finally {
          autoRecoveryInFlightRef.current = false;
        }
        return;
      }

      setAllMirrorsFailed(true);
    },
    [activeUrl, mirrorIndex, refresh, urlChain.length],
  );

  const closeSettings = useCallback(() => {
    setSettingsVisible(false);
  }, []);

  const onRetry = useCallback(async () => {
    setAllMirrorsFailed(false);
    setMirrorIndex(0);
    await refresh();
  }, [refresh]);

  if (isLoading || !config) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  if (allMirrorsFailed) {
    return (
      <MirrorErrorScreen telegramUrl={config.telegramUrl} onRetry={onRetry} />
    );
  }

  return (
    <View style={[styles.container, {
      paddingTop: isPictureInPictureActive ? 0 : insets.top,
    }]}>
      <View style={styles.webViewContainer}>
        <WebViewBrowser
          key={`${activeUrl}:${webViewGeneration}`}
          ref={webViewRef}
          url={activeUrl}
          onNavigationStateChange={onNavigationStateChange}
          onError={onWebViewError}
          onPictureInPictureModeChange={onPictureInPictureModeChange}
        />
      </View>

      {/* Chrome navigateur supprimé : le WebView occupe tout l'écran.
          Le bouton flottant conserve l'accès aux paramètres sans barre basse. */}

      <Modal
        visible={!isPictureInPictureActive && settingsVisible}
        animationType="slide"
        onRequestClose={closeSettings}>
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          {Platform.OS === 'ios' ? (
            <NativeGlassSurface interactive style={styles.modalHeaderIOS}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Fermer les paramètres"
                onPress={closeSettings}
                style={styles.closeButton}>
                <Text style={styles.closeText}>Fermer</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Paramètres</Text>
              <View style={styles.closeButton} />
            </NativeGlassSurface>
          ) : (
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={closeSettings} style={styles.closeButton}>
                <Text style={styles.closeText}>Fermer</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Paramètres</Text>
              <View style={styles.closeButton} />
            </View>
          )}
          <SettingsScreen />
        </View>
      </Modal>

      {!isPictureInPictureActive && (
        <MiniPill onPress={() => setSettingsVisible(true)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  webViewContainer: {
    flex: 1,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#111111',
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f1f',
  },
  modalHeaderIOS: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    minHeight: 56,
  },
  modalTitle: {
    color: Platform.OS === 'ios' ? PlatformColor('labelColor') : '#ffffff',
    fontSize: 17,
    fontWeight: '600',
  },
  closeButton: {
    width: 60,
    minHeight: 44,
    justifyContent: 'center',
  },
  closeText: {
    color: Platform.OS === 'ios' ? PlatformColor('systemPurpleColor') : '#8b5cf6',
    fontSize: 15,
    fontWeight: '500',
  },
});
