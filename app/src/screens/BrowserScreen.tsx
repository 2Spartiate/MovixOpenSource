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
import AsyncStorage from '@react-native-async-storage/async-storage';

import WebViewBrowser, { type WebViewBrowserRef } from '../components/WebViewBrowser';
import BrowserToolbar from '../components/BrowserToolbar';
import IOSBrowserToolbar from '../components/ios/IOSBrowserToolbar';
import { NativeGlassSurface } from '../components/ios/NativeGlassSurface';
import MiniPill from '../components/MiniPill';
import MirrorErrorScreen from '../components/MirrorErrorScreen';
import { setLocalPlaybackAwake } from '../services/playbackAwake';
import { setPictureInPicturePlaybackActive } from '../services/pictureInPicture';
import { useBrowserUIPrefs } from '../hooks/useBrowserUIPrefs';
import { useAddress } from '../context/AddressContext';
import { isAndroidTvRuntime } from '../platform/tvRuntime';
import SettingsScreen from './SettingsScreen';

export default function BrowserScreen() {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebViewBrowserRef>(null);
  const { prefs: uiPrefs } = useBrowserUIPrefs();
  const { config, isLoading, refresh } = useAddress();
  // Preserve the clean-baseline TV detection: native Platform.isTV only.
  const isTV = useMemo(() => isAndroidTvRuntime(), []);

  const navBarHidden = !uiPrefs.showNavBar;
  const toolbarHidden = !uiPrefs.showUrlBar && !uiPrefs.showNavBar;

  const urlChain = useMemo(() => {
    if (!config) return [];
    return [config.primaryUrl, ...config.mirrors];
  }, [config]);

  const [mirrorIndex, setMirrorIndex] = useState(0);
  const [allMirrorsFailed, setAllMirrorsFailed] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUrl, setCurrentUrl] = useState('');
  const [dnsEnabled, setDnsEnabled] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [exitConfirmVisible, setExitConfirmVisible] = useState(false);
  const [exitChoice, setExitChoice] = useState<'no' | 'yes'>('no');
  const [isPictureInPictureActive, setIsPictureInPictureActive] = useState(false);
  const [webViewGeneration, setWebViewGeneration] = useState(0);
  const autoRecoveryAttemptedRef = useRef(false);
  const autoRecoveryInFlightRef = useRef(false);

  const activeUrl = urlChain[mirrorIndex] ?? '';

  useEffect(() => {
    AsyncStorage.getItem('dns_enabled').then(val => {
      setDnsEnabled(val === 'true');
    });
  }, []);

  const isTvHome = useMemo(() => {
    if (!isTV) return false;
    const candidate = currentUrl || activeUrl;
    if (!candidate) return false;
    try {
      const pathname = new URL(candidate).pathname.replace(/\/+$/, '');
      return pathname === '';
    } catch {
      return false;
    }
  }, [activeUrl, currentUrl, isTV]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (settingsVisible) {
        setSettingsVisible(false);
        return true;
      }
      if (exitConfirmVisible) {
        setExitConfirmVisible(false);
        setExitChoice('no');
        return true;
      }
      if (isTV && isTvHome) {
        setExitChoice('no');
        setExitConfirmVisible(true);
        return true;
      }
      if (canGoBack) {
        if (isTV) {
          webViewRef.current?.injectJavaScript(`
            (() => {
              const event = new Event('movix-tv-back', { cancelable: true });
              window.dispatchEvent(event);
              if (!event.defaultPrevented) window.history.back();
            })();
            true;
          `);
        } else {
          webViewRef.current?.goBack();
        }
        return true;
      }
      return false;
    });

    return () => handler.remove();
  }, [canGoBack, exitConfirmVisible, isTV, isTvHome, settingsVisible]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        webViewRef.current?.refreshCastShimStatus();
        AsyncStorage.getItem('dns_enabled').then(val => {
          setDnsEnabled(val === 'true');
        });
      }
    });
    return () => subscription.remove();
  }, [activeUrl]);

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
    setCanGoForward(state.canGoForward);
    setLoading(state.loading ?? false);
    if (state.url) setCurrentUrl(state.url);
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
    AsyncStorage.getItem('dns_enabled').then(val => {
      setDnsEnabled(val === 'true');
    });
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
          isTV={isTV}
          onNavigationStateChange={onNavigationStateChange}
          onError={onWebViewError}
          onPictureInPictureModeChange={onPictureInPictureModeChange}
        />
      </View>

      {!isPictureInPictureActive && !isTV && !toolbarHidden && (
        <View style={{ paddingBottom: insets.bottom }}>
          {Platform.OS === 'ios' ? (
            <IOSBrowserToolbar
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              loading={loading}
              currentUrl={currentUrl}
              dnsEnabled={dnsEnabled}
              showUrlBar={uiPrefs.showUrlBar}
              showNavBar={uiPrefs.showNavBar}
              onGoBack={() => webViewRef.current?.goBack()}
              onGoForward={() => webViewRef.current?.goForward()}
              onReload={() => webViewRef.current?.reload()}
              onHome={() => webViewRef.current?.loadUrl(activeUrl)}
              onSettings={() => setSettingsVisible(true)}
            />
          ) : (
            <BrowserToolbar
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              loading={loading}
              currentUrl={currentUrl}
              dnsEnabled={dnsEnabled}
              showUrlBar={uiPrefs.showUrlBar}
              showNavBar={uiPrefs.showNavBar}
              onGoBack={() => webViewRef.current?.goBack()}
              onGoForward={() => webViewRef.current?.goForward()}
              onReload={() => webViewRef.current?.reload()}
              onHome={() => webViewRef.current?.loadUrl(activeUrl)}
              onSettings={() => setSettingsVisible(true)}
            />
          )}
        </View>
      )}

      <Modal
        visible={!isPictureInPictureActive && isTV && exitConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setExitConfirmVisible(false);
          setExitChoice('no');
        }}>
        <View style={styles.exitOverlay}>
          <View style={styles.exitDialog}>
            <Text style={styles.exitTitle}>Quitter l'application ?</Text>
            <Text style={styles.exitMessage}>
              Êtes-vous sûr de vouloir quitter l'application ?
            </Text>
            <View style={styles.exitActions}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Ne pas quitter"
                focusable
                hasTVPreferredFocus={isTV}
                onFocus={() => setExitChoice('no')}
                onPress={() => {
                  setExitConfirmVisible(false);
                  setExitChoice('no');
                }}
                style={[
                  styles.exitButton,
                  exitChoice === 'no' && styles.exitButtonFocused,
                ]}>
                <Text style={[
                  styles.exitButtonText,
                  exitChoice === 'no' && styles.exitButtonTextFocused,
                ]}>Non</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Quitter l'application"
                focusable
                onFocus={() => setExitChoice('yes')}
                onPress={() => BackHandler.exitApp()}
                style={[
                  styles.exitButton,
                  exitChoice === 'yes' && styles.exitButtonFocused,
                ]}>
                <Text style={[
                  styles.exitButtonText,
                  exitChoice === 'yes' && styles.exitButtonTextFocused,
                ]}>Oui</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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

      {!isPictureInPictureActive && !isTV && navBarHidden && (
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
  exitOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    paddingHorizontal: 32,
  },
  exitDialog: {
    width: '100%',
    maxWidth: 460,
    paddingHorizontal: 28,
    paddingVertical: 26,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.58)',
    backgroundColor: '#111111',
  },
  exitTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  exitMessage: {
    marginTop: 10,
    color: '#d1d5db',
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
  },
  exitActions: {
    marginTop: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  exitButton: {
    minWidth: 120,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4b5563',
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitButtonFocused: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(127, 29, 29, 0.42)',
    transform: [{ scale: 1.05 }],
  },
  exitButtonText: {
    color: '#e5e7eb',
    fontSize: 17,
    fontWeight: '600',
  },
  exitButtonTextFocused: {
    color: '#ffffff',
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
