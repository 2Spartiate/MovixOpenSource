import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('diagnostic build keeps the original app runtime plus marker-only TV mode', async () => {
  const [app, webView, browser, inject, manifest] = await Promise.all([
    text('src/App.tsx'),
    text('src/components/WebViewBrowser.tsx'),
    text('src/screens/BrowserScreen.tsx'),
    text('src/injection/inject.ts'),
    text('android/app/src/main/AndroidManifest.xml'),
  ]);

  assert.doesNotMatch(browser, /isAndroidTvRuntime|tvFailureRetriesRef|movix-tv-back/);
  assert.doesNotMatch(inject, /buildTvBootstrap|buildTvDpadRuntime|popupBlocker/);

  assert.match(webView, /isAndroidTvRuntime/);
  assert.match(webView, /window\.MOVIX_TV = true;/);
  assert.doesNotMatch(webView, /movix-tv-bootstrap-style|MutationObserver|buildTvDpadRuntime/);

  assert.match(manifest, /android\.software\.leanback/);
  assert.match(manifest, /android\.intent\.category\.LEANBACK_LAUNCHER/);
  assert.match(manifest, /android:banner="@drawable\/tv_banner"/);

  // Only the TV startup path rebuilds the sticky VPN/DNS tunnel.
  assert.match(app, /async function restartTvDnsFromCleanState\(\): Promise<boolean>/);
  assert.match(app, /await DnsModule\.disable\(\)/);
  assert.match(app, /await waitForTvDnsState\(false, TV_DNS_STOP_TIMEOUT_MS\)/);
  assert.match(app, /await DnsModule\.enable\('1\.1\.1\.1', '1\.0\.0\.1'\)/);
  assert.match(app, /await waitForTvDnsState\(true, TV_DNS_READY_TIMEOUT_MS\)/);
  assert.match(app, /const ready = await restartTvDnsFromCleanState\(\)/);
  assert.match(app, /if \(Platform\.OS === 'android' && isAndroidTvRuntime\(\)\)/);
  assert.match(app, /await promptDnsForTv\(\)/);

  // Phone/tablet path remains the original non-blocking implementation.
  assert.match(
    app,
    /Original handheld Android behavior\.\s*DnsModule\.enable\('1\.1\.1\.1', '1\.0\.0\.1'\)\.catch\(\(\) => \{\}\);/,
  );
  assert.match(
    app,
    /Original phone\/tablet behavior: do not block startup on the DNS prompt\.\s*promptDns\(\);/,
  );
});

test('original WebView behavior remains otherwise intact', async () => {
  const webView = await text('src/components/WebViewBrowser.tsx');

  assert.match(webView, /Linking\.openURL/);
  assert.match(webView, /setSupportMultipleWindows=\{true\}/);
  assert.match(webView, /onHttpError=\{onHttpError\}/);
  assert.match(webView, /injectedJavaScriptBeforeContentLoaded=\{injectedJS\}/);
});
