import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('common runtime injects shared remote-DOM policy before site scripts', async () => {
  const inject = await text('src/injection/inject.ts');

  assert.match(inject, /buildAppSiteOverrides/);
  assert.match(inject, /const blockedOpen = \(\) => null/);
  assert.match(inject, /Object\.defineProperty\(window, 'open'/);
  assert.match(inject, /\$\{popupBlocker\}[\s\S]*\$\{appSiteOverrides\}[\s\S]*\$\{castShim\}/);
});

test('shared DOM policy removes Telegram UI and advances the playback gate', async () => {
  const overrides = await text('src/injection/app-site-overrides.ts');

  assert.match(overrides, /t\.me\/movix_site/);
  assert.match(overrides, /rejoignez notre communaute/);
  assert.match(overrides, /data-ad-view-button/);
  assert.match(overrides, /une pub et c est parti/);
  assert.match(overrides, /merci pour ton aide/);
  assert.match(overrides, /queueMicrotask\(\(\) => viewAdButton\.click\(\)\)/);
  assert.match(overrides, /queueMicrotask\(\(\) => playButton\.click\(\)\)/);

  assert.doesNotMatch(overrides, /removeFooter|Carousel|data-tv-|MOVIX_TV|movix-tv/);
});

test('native WebView rejects popup and new-window requests on every device', async () => {
  const webView = await text('src/components/WebViewBrowser.tsx');

  assert.match(webView, /const onOpenWindow = useCallback\(\(_event: WebViewOpenWindowEvent\)/);
  assert.match(webView, /setSupportMultipleWindows=\{true\}/);
  assert.match(webView, /javaScriptCanOpenWindowsAutomatically=\{false\}/);
  assert.doesNotMatch(webView, /Linking\.openURL|isSameOrigin/);
});
