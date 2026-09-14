import React, { useCallback } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CONFIG } from '../config';

interface TurnstileWebViewProps {
  visible: boolean;
  onToken: (token: string) => void;
  onCancel: () => void;
}

// Cloudflare Turnstile n'a pas de SDK React Native officiel — on charge le
// widget officiel dans une WebView dediee (visible seulement si un challenge
// interactif est necessaire ; le mode invisible se resout generalement seul
// en quelques secondes) et on recupere le token via postMessage. Aucun appel
// backend modifie : le token est simplement transmis avec la requete
// login/creation, comme le fait le site.
const TURNSTILE_HTML = (siteKey: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
  <style>
    body { margin:0; display:flex; align-items:center; justify-content:center; height:100vh; background:#0a0a0a; }
  </style>
</head>
<body>
  <div class="cf-turnstile"
       data-sitekey="${siteKey}"
       data-callback="onTurnstileSuccess"
       data-error-callback="onTurnstileError"></div>
  <script>
    function onTurnstileSuccess(token) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'token', token }));
    }
    function onTurnstileError(code) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', code }));
    }
  </script>
</body>
</html>
`;

export default function TurnstileWebView({ visible, onToken, onCancel }: TurnstileWebViewProps) {
  const insets = useSafeAreaInsets();

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'token' && typeof data.token === 'string') {
          onToken(data.token);
        }
      } catch {
        // ignore malformed messages
      }
    },
    [onToken],
  );

  if (!CONFIG.TURNSTILE_SITE_KEY) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { marginTop: insets.top + 40 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Verification de securite</Text>
            <TouchableOpacity onPress={onCancel}>
              <Text style={styles.cancel}>Annuler</Text>
            </TouchableOpacity>
          </View>
          <WebView
            source={{ html: TURNSTILE_HTML(CONFIG.TURNSTILE_SITE_KEY) }}
            onMessage={onMessage}
            style={styles.webview}
            startInLoadingState
            renderLoading={() => <ActivityIndicator style={StyleSheet.absoluteFill} color="#8b5cf6" />}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
  },
  card: {
    width: '90%',
    maxWidth: 400,
    height: 220,
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f1f1f',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f1f',
  },
  title: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancel: {
    color: '#8b5cf6',
    fontSize: 13,
    fontWeight: '600',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
});
