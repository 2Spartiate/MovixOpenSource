import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import type {
  WebViewErrorEvent,
  WebViewMessageEvent,
  WebViewOpenWindowEvent,
} from 'react-native-webview/lib/WebViewTypes';
import {
  isNetworkJournalEnabled,
  subscribeNetworkJournal,
} from '../services/networkJournal';
import {
  clearBridgeCapabilities,
  handleBridgeMessage,
  refreshCastShimStatus,
  startCastShimEventForwarding,
  startPictureInPictureEventForwarding,
} from '../services/bridge';
import { setLocalPlaybackAwake } from '../services/playbackAwake';
import {
  getPreparedNativePlaybackSourceProtocolVersion,
  setPictureInPicturePlaybackActive,
} from '../services/pictureInPicture';
import { buildInjectedJavaScript } from '../injection/inject';
import type { PictureInPictureShimMode } from '../injection/picture-in-picture-shim';
import { CONFIG } from '../config';

export interface WebViewBrowserRef {
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  loadUrl: (url: string) => void;
  injectJavaScript: (script: string) => void;
  refreshCastShimStatus: () => void;
}

interface WebViewBrowserProps {
  url: string;
  isTV: boolean;
  onNavigationStateChange?: (state: WebViewNavigation) => void;
  onLoadSuccess?: () => void;
  onError?: (error: string) => void;
  onPictureInPictureModeChange?: (active: boolean) => void;
}

function getPictureInPictureShimMode(): PictureInPictureShimMode {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 26) {
    return 'android';
  }
  if (Platform.OS === 'ios') {
    try {
      if (getPreparedNativePlaybackSourceProtocolVersion() === 1) {
        return 'ios-native-v1';
      }
    } catch {
      // A missing/older native module must leave WebKit behavior untouched.
    }
  }
  return 'disabled';
}

const BASE_INJECTION_OPTIONS = {
  pictureInPictureMode: getPictureInPictureShimMode(),
  mediaProxyRoutingEnabled:
    Platform.OS === 'android' || Platform.OS === 'ios',
  mediaProxyCapabilityEnabled: Platform.OS === 'ios',
  // WebKit bloque `http://127.0.0.1` comme contenu mixte depuis une page https,
  // là où Chromium exempte la boucle locale. Router les segments HLS par le
  // proxy local ne peut donc qu'échouer sur iOS : chaque requête payait deux
  // allers-retours de pont avant de retomber sur GM_FETCH. Le handoff natif
  // (`GM_openMediaProxy`) reste actif, lui ne passe pas par le moteur web.
  mediaProxyXhrRoutingEnabled: Platform.OS === 'android',
  // Le pendant iOS du routage par la boucle locale : WebKit la refuse depuis
  // une page https, mais route un schéma personnalisé vers le natif. Le
  // handler est enregistré sur la configuration WKWebView (patch
  // react-native-webview) et relaie vers le proxy local.
  mediaProxyScheme: Platform.OS === 'ios' ? 'movix-media' : null,
} as const;

// Construit une fois par combinaison journal/TV, pas à chaque rendu : le
// script injecté est volumineux. Ne jamais réutiliser un script téléphone sur
// TV (ou inversement), car le bootstrap TV fait partie du document initial.
const INJECTED_JS_BY_RUNTIME_STATE = new Map<string, string>();

function injectedJavaScriptFor(
  journalConsoleEnabled: boolean,
  isTV: boolean,
): string {
  const cacheKey = `${journalConsoleEnabled ? 'journal' : 'quiet'}:${isTV ? 'tv' : 'handheld'}`;
  const cached = INJECTED_JS_BY_RUNTIME_STATE.get(cacheKey);
  if (cached !== undefined) return cached;
  const built = buildInjectedJavaScript({
    ...BASE_INJECTION_OPTIONS,
    journalConsoleEnabled,
    tvMode: isTV,
  });
  INJECTED_JS_BY_RUNTIME_STATE.set(cacheKey, built);
  return built;
}

function isUsableHttpUrl(value: unknown): value is string {
  return (
    typeof value === 'string'
    && value.length > 0
    && !/[\u0000-\u0020\\]/.test(value)
    && /^https?:\/\/[^/?#]+(?:[/?#]|$)/i.test(value)
  );
}

function isSameDocumentUrl(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    a.hash = '';
    b.hash = '';
    return a.href === b.href;
  } catch {
    return left === right;
  }
}

function isTopLevelFailure(
  nativeEvent: { url?: unknown; isTopFrame?: unknown },
  currentTopLevelUrl: string,
): boolean {
  if (typeof nativeEvent.isTopFrame === 'boolean') {
    return nativeEvent.isTopFrame;
  }

  const eventUrl = nativeEvent.url;
  // Some main-frame Android errors do not expose isTopFrame. In that case an
  // exact document URL is our safe fallback. Subresource 403/404 errors must
  // never evict a healthy Movix mirror.
  if (isUsableHttpUrl(eventUrl)) {
    return isSameDocumentUrl(eventUrl, currentTopLevelUrl);
  }

  // Unknown/no URL: keep the historical conservative behavior.
  return true;
}

const WebViewBrowser = forwardRef<WebViewBrowserRef, WebViewBrowserProps>(
  ({ url, isTV, onNavigationStateChange, onLoadSuccess, onError, onPictureInPictureModeChange }, ref) => {
    const webViewRef = useRef<WebView>(null);
    const topLevelUrlRef = useRef(url);
    const navigationGenerationRef = useRef(0);

    React.useEffect(() => {
      topLevelUrlRef.current = url;
    }, [url]);

    React.useEffect(() => {
      const stopCastStatusForwarding = startCastShimEventForwarding(webViewRef);
      const stopPictureInPictureForwarding = startPictureInPictureEventForwarding(
        webViewRef,
        event => {
          if (event.kind === 'state') onPictureInPictureModeChange?.(event.active);
          if (event.kind === 'error') onPictureInPictureModeChange?.(false);
        },
      );
      return () => {
        clearBridgeCapabilities(webViewRef);
        stopCastStatusForwarding();
        stopPictureInPictureForwarding();
        setPictureInPicturePlaybackActive(false);
        setLocalPlaybackAwake(false);
      };
    }, [onPictureInPictureModeChange]);

    useImperativeHandle(ref, () => ({
      goBack: () => {
        clearBridgeCapabilities(webViewRef);
        webViewRef.current?.goBack();
      },
      goForward: () => {
        clearBridgeCapabilities(webViewRef);
        webViewRef.current?.goForward();
      },
      reload: () => {
        clearBridgeCapabilities(webViewRef);
        webViewRef.current?.reload();
      },
      loadUrl: (newUrl: string) => {
        clearBridgeCapabilities(webViewRef);
        webViewRef.current?.injectJavaScript(
          `window.location.href = ${JSON.stringify(newUrl)}; true;`,
        );
      },
      injectJavaScript: (script: string) => {
        webViewRef.current?.injectJavaScript(script);
      },
      refreshCastShimStatus: () => {
        void refreshCastShimStatus(webViewRef);
      },
    }));

    const onMessage = useCallback((event: WebViewMessageEvent) => {
      const isTopFrame = typeof event.nativeEvent.isTopFrame === 'boolean'
        ? event.nativeEvent.isTopFrame
        : undefined;
      const reportedSourceUrl =
        typeof event.nativeEvent.url === 'string' ? event.nativeEvent.url : '';
      const hasUsableReportedOrigin = isUsableHttpUrl(reportedSourceUrl);
      const sourceUrl = hasUsableReportedOrigin
        ? reportedSourceUrl
        : isTopFrame
          ? topLevelUrlRef.current
          : '';
      handleBridgeMessage(event.nativeEvent.data, webViewRef, {
        sourceUrl,
        topLevelUrl: topLevelUrlRef.current,
        trustedOrigins: [url],
        isTopFrame: isTopFrame,
        navigationGeneration: navigationGenerationRef.current,
      });
    }, [url]);

    // Reject every new-window request. This catches target="_blank" links and
    // popup attempts from iframes even if a site script bypasses the injected
    // window.open shim. Same-tab navigation continues through the normal
    // WebView navigation path.
    const onOpenWindow = useCallback((_event: WebViewOpenWindowEvent) => {
      // Intentionally ignored.
    }, []);

    const onHttpError = useCallback(
      (event: any) => {
        if (!isTopLevelFailure(event.nativeEvent, topLevelUrlRef.current)) {
          return;
        }
        onError?.(
          `HTTP ${event.nativeEvent.statusCode}: ${event.nativeEvent.url}`,
        );
      },
      [onError],
    );

    const onWebViewError = useCallback(
      (event: WebViewErrorEvent) => {
        if (!isTopLevelFailure(event.nativeEvent, topLevelUrlRef.current)) {
          return;
        }
        onError?.(event.nativeEvent.description);
      },
      [onError],
    );

    // Le renvoi de la console est armé dans le script injecté : il faut donc le
    // reconstruire quand la capture change. La bascule ne prend effet qu'au
    // chargement suivant de la page, `injectedJavaScriptBeforeContentLoaded`
    // n'étant relu qu'à la navigation.
    const [journalConsole, setJournalConsole] = useState(
      isNetworkJournalEnabled,
    );
    useEffect(() => subscribeNetworkJournal(setJournalConsole), []);
    const injectedJS = useMemo(
      () => injectedJavaScriptFor(journalConsole, isTV),
      [journalConsole, isTV],
    );

    // Sur iOS, laisser WKWebView annoncer la version réelle de WebKit et de
    // l'appareil : un User-Agent Safari figé peut perturber Turnstile.
    const userAgent = Platform.OS === 'ios' ? undefined : CONFIG.USER_AGENT;

    return (
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={{ flex: 1, backgroundColor: '#0a0a0a' }}
        // Injection du bridge + userscript avant le chargement
        injectedJavaScriptBeforeContentLoaded={injectedJS}
        // Garder les iframes Turnstile sans bridge ni userscript Movix.
        injectedJavaScriptBeforeContentLoadedForMainFrameOnly={true}
        // Bridge messages
        onMessage={onMessage}
        onShouldStartLoadWithRequest={(request) => {
          if (request.isTopFrame !== false) {
            if (isUsableHttpUrl(request.url)) {
              topLevelUrlRef.current = request.url;
            }
            navigationGenerationRef.current += 1;
            clearBridgeCapabilities(webViewRef);
          }
          return true;
        }}
        // Navigation
        onNavigationStateChange={onNavigationStateChange}
        onLoad={() => onLoadSuccess?.()}
        // Keep multiple-window support enabled so target="_blank" is surfaced
        // through onOpenWindow instead of replacing the current WebView.
        setSupportMultipleWindows={true}
        javaScriptCanOpenWindowsAutomatically={false}
        onOpenWindow={onOpenWindow}
        // Errors
        onError={onWebViewError}
        onHttpError={onHttpError}
        // Config
        userAgent={userAgent}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        allowsPictureInPictureMediaPlayback={Platform.OS === 'ios'}
        allowsFullscreenVideo={true}
        allowsBackForwardNavigationGestures={true}
        // Sécurité
        // Turnstile utilise aussi des documents internes about:srcdoc.
        // about:blank est déjà autorisé par react-native-webview.
        originWhitelist={['https://*', 'http://*', 'about:srcdoc']}
        // « compatibility » laisse passer le contenu passif (images) mais
        // bloque toujours le contenu actif : un `fetch("http://…")` depuis la
        // page échouait donc en quelques millisecondes (« Network request
        // failed »), et le proxy de l'app ne pouvait pas récupérer les flux
        // servis par une IP nue, qui n'existent qu'en http. « always » est
        // nécessaire pour que ce proxy fonctionne.
        mixedContentMode="always"
        // Cache
        cacheEnabled={true}
        // Désactive le zoom pour un rendu app-like
        scalesPageToFit={true}
        // Android
        overScrollMode="never"
        thirdPartyCookiesEnabled={true}
        // iOS
        sharedCookiesEnabled={true}
        contentMode="mobile"
      />
    );
  },
);

WebViewBrowser.displayName = 'WebViewBrowser';
export default WebViewBrowser;
