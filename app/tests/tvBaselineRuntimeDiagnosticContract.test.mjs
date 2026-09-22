import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('diagnostic build differs from original runtime only by TV marker injection', async () => {
  const [app, webView, browser, inject, manifest] = await Promise.all([
    text('src/App.tsx'),
    text('src/components/WebViewBrowser.tsx'),
    text('src/screens/BrowserScreen.tsx'),
    text('src/injection/inject.ts'),
    text('android/app/src/main/AndroidManifest.xml'),
  ]);

  assert.doesNotMatch(app, /waitForAndroidDnsActive|activateDnsForStartup/);
  assert.doesNotMatch(browser, /isAndroidTvRuntime|tvFailureRetriesRef|movix-tv-back/);
  assert.doesNotMatch(inject, /buildTvBootstrap|buildTvDpadRuntime|popupBlocker/);

  assert.match(webView, /isAndroidTvRuntime/);
  assert.match(webView, /window\.MOVIX_TV = true;/);
  assert.doesNotMatch(webView, /movix-tv-bootstrap-style|MutationObserver|buildTvDpadRuntime/);

  assert.match(manifest, /android\.software\.leanback/);
  assert.match(manifest, /android\.intent\.category\.LEANBACK_LAUNCHER/);
  assert.match(manifest, /android:banner="@drawable\/tv_banner"/);
});

test('original WebView behavior remains otherwise intact', async () => {
  const webView = await text('src/components/WebViewBrowser.tsx');

  assert.match(webView, /Linking\.openURL/);
  assert.match(webView, /setSupportMultipleWindows=\{true\}/);
  assert.match(webView, /onHttpError=\{onHttpError\}/);
  assert.match(webView, /injectedJavaScriptBeforeContentLoaded=\{injectedJS\}/);
});
