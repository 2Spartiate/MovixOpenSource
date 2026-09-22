import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const bytes = path => readFile(new URL(path, root));
const text = async path => (await bytes(path)).toString('utf8');

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8');
  return createHash('sha1').update(header).update(buffer).digest('hex');
}

test('TV-BS-G is exactly TEST D runtime minus MOVIX_TV marker', async () => {
  const [
    appBytes,
    webViewBytes,
    browserBytes,
    mirrorBytes,
    injectBytes,
    manifest,
  ] = await Promise.all([
    bytes('src/App.tsx'),
    bytes('src/components/WebViewBrowser.tsx'),
    bytes('src/screens/BrowserScreen.tsx'),
    bytes('src/components/MirrorErrorScreen.tsx'),
    bytes('src/injection/inject.ts'),
    text('android/app/src/main/AndroidManifest.xml'),
  ]);

  // Exact historical blobs: App.tsx from TEST D (ade4b2cc), all other
  // app runtime files from the hardware-PASS baseline-runtime build c543106.
  assert.equal(gitBlobSha(appBytes), 'ca2ef5ccbbbe8b9282d935e59235ceee000ce2b1');
  assert.equal(gitBlobSha(webViewBytes), 'c42d8b9e33dd01af93ddadbf9f89ba432255784a');
  assert.equal(gitBlobSha(browserBytes), 'e7a7aae7f7754c49880b166006debff6b25efdbb');
  assert.equal(gitBlobSha(mirrorBytes), '39854aee4c3fda0915629de455059f61486c557e');
  assert.equal(gitBlobSha(injectBytes), '4df61dd53d5bd8d9cb30368905aa20aac261d142');

  const app = appBytes.toString('utf8');
  const webView = webViewBytes.toString('utf8');
  const browser = browserBytes.toString('utf8');
  const inject = injectBytes.toString('utf8');

  // Preserve TEST D's TV-only DNS-ready timing exactly.
  assert.match(app, /async function waitForTvDnsReady\(\): Promise<boolean>/);
  assert.match(app, /await DnsModule\.enable\('1\.1\.1\.1', '1\.0\.0\.1'\)/);
  assert.match(app, /await waitForTvDnsReady\(\)/);
  assert.match(app, /await promptDnsForTv\(\)/);
  assert.doesNotMatch(app, /restartTvDnsFromCleanState|waitForTvDnsState/);

  // Unique A/B variable versus TEST D: MOVIX_TV marker is absent.
  assert.doesNotMatch(webView, /MOVIX_TV/);
  assert.doesNotMatch(webView, /isAndroidTvRuntime|buildTvRenderDiagnostic/);

  // Keep the hardware-PASS baseline app runtime outside App.tsx.
  assert.doesNotMatch(browser, /isAndroidTvRuntime|tvFailureRetriesRef|movix-tv-back/);
  assert.doesNotMatch(inject, /buildTvBootstrap|buildTvDpadRuntime|popupBlocker/);
  assert.match(webView, /Linking\.openURL/);
  assert.match(webView, /setSupportMultipleWindows=\{true\}/);

  // Retain only native Google TV launcher compatibility.
  assert.match(manifest, /android\.software\.leanback/);
  assert.match(manifest, /android\.intent\.category\.LEANBACK_LAUNCHER/);
  assert.match(manifest, /android:banner="@drawable\/tv_banner"/);
});
