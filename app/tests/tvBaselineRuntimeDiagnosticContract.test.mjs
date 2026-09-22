import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('TV diagnostic preserves phone-validated common behavior', async () => {
  const [app, webView, browser, inject, diagnostic, policy, manifest] = await Promise.all([
    text('src/App.tsx'),
    text('src/components/WebViewBrowser.tsx'),
    text('src/screens/BrowserScreen.tsx'),
    text('src/injection/inject.ts'),
    text('src/injection/tv-render-diagnostic.ts'),
    text('src/platform/tvRuntimePolicy.ts'),
    text('android/app/src/main/AndroidManifest.xml'),
  ]);

  // Keep the phone-validated common startup/network changes.
  assert.match(app, /waitForAndroidDnsActive/);
  assert.match(app, /activateDnsForStartup/);
  assert.doesNotMatch(app, /restartTvDnsFromCleanState|waitForTvDnsState/);

  // Keep the popup blocker and common WebView hardening.
  assert.match(inject, /const popupBlocker/);
  assert.match(inject, /Object\.defineProperty\(window, 'open'/);
  assert.match(webView, /javaScriptCanOpenWindowsAutomatically=\{false\}/);
  assert.doesNotMatch(webView, /Linking\.openURL/);

  // Keep common product UI changes such as the hidden embedded URL bar.
  assert.match(browser, /const effectiveShowUrlBar = false;/);

  // Disable ONLY TV-specific behavior while retaining native TV detection.
  assert.match(policy, /TV_PRODUCT_FEATURES_ENABLED = false/);
  assert.match(browser, /isTV && TV_PRODUCT_FEATURES_ENABLED/);
  assert.match(
    webView,
    /isTV && tvFeaturesEnabled/,
  );

  // Diagnostic is observational only: no TV marker, CSS, DOM mutation or SW mutation.
  assert.match(webView, /buildTvRenderDiagnostic/);
  assert.doesNotMatch(diagnostic, /MOVIX_TV\s*=\s*true/);
  assert.doesNotMatch(diagnostic, /classList\.add|appendChild|removeChild|MutationObserver/);
  assert.doesNotMatch(diagnostic, /unregister\(|caches\.delete/);
  assert.match(diagnostic, /MOVIX_TV_DIAG:/);
  assert.match(diagnostic, /serviceWorkerControlled/);
  assert.match(diagnostic, /rootChildren/);
  assert.match(diagnostic, /lastError/);
  assert.match(diagnostic, /userAgent/);

  assert.match(manifest, /android\.software\.leanback/);
  assert.match(manifest, /android\.intent\.category\.LEANBACK_LAUNCHER/);
  assert.match(manifest, /android:banner="@drawable\/tv_banner"/);
});
