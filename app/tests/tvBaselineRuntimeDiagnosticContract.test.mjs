import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('TV diagnostic preserves original startup and site behavior', async () => {
  const [app, webView, browser, inject, diagnostic, manifest] = await Promise.all([
    text('src/App.tsx'),
    text('src/components/WebViewBrowser.tsx'),
    text('src/screens/BrowserScreen.tsx'),
    text('src/injection/inject.ts'),
    text('src/injection/tv-render-diagnostic.ts'),
    text('android/app/src/main/AndroidManifest.xml'),
  ]);

  // Original VPN lifecycle restored: no TV-only stop/restart logic.
  assert.doesNotMatch(app, /restartTvDnsFromCleanState|waitForTvDnsState|promptDnsForTv/);
  assert.match(app, /DnsModule\.enable\('1\.1\.1\.1', '1\.0\.0\.1'\)\.catch\(\(\) => \{\}\)/);
  assert.match(app, /promptDns\(\)/);

  // Original BrowserScreen/injection behavior remains untouched.
  assert.doesNotMatch(browser, /isAndroidTvRuntime|tvFailureRetriesRef|movix-tv-back/);
  assert.doesNotMatch(inject, /buildTvBootstrap|buildTvDpadRuntime|popupBlocker/);

  // TV probe observes only: no MOVIX_TV marker, no CSS, no DOM mutation.
  assert.match(webView, /buildTvRenderDiagnostic/);
  assert.match(webView, /isAndroidTvRuntime/);
  assert.doesNotMatch(webView, /window\.MOVIX_TV\s*=\s*true/);
  assert.doesNotMatch(diagnostic, /classList\.add|appendChild|removeChild|MutationObserver/);
  assert.match(diagnostic, /MOVIX_TV_DIAG:/);
  assert.match(diagnostic, /serviceWorkerControlled/);
  assert.match(diagnostic, /rootChildren/);
  assert.match(diagnostic, /lastError/);
  assert.match(diagnostic, /userAgent/);

  assert.match(manifest, /android\.software\.leanback/);
  assert.match(manifest, /android\.intent\.category\.LEANBACK_LAUNCHER/);
  assert.match(manifest, /android:banner="@drawable\/tv_banner"/);
});

test('original WebView networking and popup behavior remain intact', async () => {
  const webView = await text('src/components/WebViewBrowser.tsx');

  assert.match(webView, /Linking\.openURL/);
  assert.match(webView, /setSupportMultipleWindows=\{true\}/);
  assert.match(webView, /onHttpError=\{onHttpError\}/);
  assert.match(webView, /injectedJavaScriptBeforeContentLoaded=\{injectedJS\}/);
});
