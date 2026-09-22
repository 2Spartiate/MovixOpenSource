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

test('TV-BS-H restores exact known-good startup ordering with all other runtime anchors frozen', async () => {
  const [
    appBytes,
    webViewBytes,
    browserBytes,
    mirrorBytes,
    injectBytes,
    dnsModuleBytes,
    dnsVpnBytes,
    manifest,
  ] = await Promise.all([
    bytes('src/App.tsx'),
    bytes('src/components/WebViewBrowser.tsx'),
    bytes('src/screens/BrowserScreen.tsx'),
    bytes('src/components/MirrorErrorScreen.tsx'),
    bytes('src/injection/inject.ts'),
    bytes('android/app/src/main/java/com/movix/app/dns/DnsModule.kt'),
    bytes('android/app/src/main/java/com/movix/app/dns/DnsVpnService.kt'),
    text('android/app/src/main/AndroidManifest.xml'),
  ]);

  // Exact known-good runtime anchors from c543106 / original baseline.
  assert.equal(gitBlobSha(appBytes), '5fbe28710abf29ed78a478e1ca6bdf364f82b71a');
  assert.equal(gitBlobSha(webViewBytes), 'c42d8b9e33dd01af93ddadbf9f89ba432255784a');
  assert.equal(gitBlobSha(browserBytes), 'e7a7aae7f7754c49880b166006debff6b25efdbb');
  assert.equal(gitBlobSha(mirrorBytes), '39854aee4c3fda0915629de455059f61486c557e');
  assert.equal(gitBlobSha(injectBytes), '4df61dd53d5bd8d9cb30368905aa20aac261d142');

  // Native DNS/VPN implementation remains byte-for-byte unchanged.
  assert.equal(gitBlobSha(dnsModuleBytes), '0a4dfcda8717826b6d68eff4ed2295fa5f12fb92');
  assert.equal(gitBlobSha(dnsVpnBytes), '70f6c6539a0ae0033bfd4aa10e2fa439385fb747');

  const app = appBytes.toString('utf8');
  const webView = webViewBytes.toString('utf8');
  const browser = browserBytes.toString('utf8');
  const inject = injectBytes.toString('utf8');

  // Unique runtime variable versus TV-BS-G:
  // remove the TV-only "DNS ready before WebView" sequencing.
  assert.doesNotMatch(app, /isAndroidTvRuntime/);
  assert.doesNotMatch(app, /waitForTvDnsReady/);
  assert.doesNotMatch(app, /promptDnsForTv/);
  assert.doesNotMatch(app, /TV_DNS_READY_|TV_DNS_POST_READY_GRACE_MS/);
  assert.doesNotMatch(app, /restartTvDnsFromCleanState|waitForTvDnsState/);

  // Baseline behavior: first-run DNS prompt does not block app/WebView startup.
  assert.match(app, /promptDns\(\);/);
  assert.match(app, /setDnsSettled\(true\);/);
  assert.match(app, /setReady\(true\);/);

  // Keep TV-BS-G's other runtime anchors unchanged.
  assert.doesNotMatch(webView, /MOVIX_TV/);
  assert.doesNotMatch(webView, /isAndroidTvRuntime|buildTvRenderDiagnostic/);
  assert.doesNotMatch(browser, /isAndroidTvRuntime|tvFailureRetriesRef|movix-tv-back/);
  assert.doesNotMatch(inject, /buildTvBootstrap|buildTvDpadRuntime|popupBlocker/);

  // Retain only native Google TV launcher compatibility.
  assert.match(manifest, /android\.software\.leanback/);
  assert.match(manifest, /android\.intent\.category\.LEANBACK_LAUNCHER/);
  assert.match(manifest, /android:banner="@drawable\/tv_banner"/);
});
