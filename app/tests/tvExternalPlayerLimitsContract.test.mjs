import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('external iframes become one TV focus target without exposing their DOM', async () => {
  const video = await text('../src/components/VideoPlayer.tsx');
  const live = await text('../src/components/LiveTVPlayer.tsx');

  assert.match(video, /tabIndex=\{isMovixTvRuntime\(\) \? 0 : undefined\}/);
  assert.match(video, /data-tv-focus=\{isMovixTvRuntime\(\) \? '' : undefined\}/);
  assert.match(live, /tabIndex=\{isMovixTvRuntime\(\) \? 0 : undefined\}/);
  assert.match(live, /data-tv-focus=\{isMovixTvRuntime\(\) \? '' : undefined\}/);
});

test('TV Frembed path does not inspect a cross-origin iframe document', async () => {
  const video = await text('../src/components/VideoPlayer.tsx');

  const tvGuard = video.indexOf('if (isMovixTvRuntime()) return;');
  const legacyDomAccess = video.indexOf('iframeWindow.document.head.innerHTML');
  assert.ok(tvGuard >= 0);
  assert.ok(legacyDomAccess > tvGuard);
});

test('Android injection remains main-frame only', async () => {
  const webview = await text('src/components/WebViewBrowser.tsx');
  assert.match(webview, /injectedJavaScriptBeforeContentLoadedForMainFrameOnly=\{true\}/);
});
