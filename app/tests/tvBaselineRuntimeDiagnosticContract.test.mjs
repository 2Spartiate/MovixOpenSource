import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('diagnostic build keeps the original app runtime and only native TV launcher support', async () => {
  const [app, webView, browser, inject, manifest] = await Promise.all([
    text('src/App.tsx'),
    text('src/components/WebViewBrowser.tsx'),
    text('src/screens/BrowserScreen.tsx'),
    text('src/injection/inject.ts'),
    text('android/app/src/main/AndroidManifest.xml'),
  ]);

  assert.doesNotMatch(app, /waitForAndroidDnsActive|activateDnsForStartup/);
  assert.doesNotMatch(webView, /\bisTV\b|isTopLevelFailure|javaScriptCanOpenWindowsAutomatically/);
  assert.doesNotMatch(browser, /isAndroidTvRuntime|tvFailureRetriesRef|movix-tv-back/);
  assert.doesNotMatch(inject, /buildTvBootstrap|buildTvDpadRuntime|MOVIX_TV|popupBlocker/);

  assert.match(manifest, /android\.software\.leanback/);
  assert.match(manifest, /android\.intent\.category\.LEANBACK_LAUNCHER/);
  assert.match(manifest, /android:banner="@drawable\/tv_banner"/);
});

test('original WebView behavior remains present in diagnostic build', async () => {
  const webView = await text('src/components/WebViewBrowser.tsx');

  assert.match(webView, /Linking\.openURL/);
  assert.match(webView, /setSupportMultipleWindows=\{true\}/);
  assert.match(webView, /onHttpError=\{onHttpError\}/);
  assert.match(webView, /injectedJavaScriptBeforeContentLoaded=\{injectedJS\}/);
});
