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

test('TV-BS-I changes only sticky VPN restart semantics from TV-BS-H runtime', async () => {
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

  // Freeze the TV-BS-H / known-good baseline runtime everywhere else.
  assert.equal(gitBlobSha(appBytes), '5fbe28710abf29ed78a478e1ca6bdf364f82b71a');
  assert.equal(gitBlobSha(webViewBytes), 'c42d8b9e33dd01af93ddadbf9f89ba432255784a');
  assert.equal(gitBlobSha(browserBytes), 'e7a7aae7f7754c49880b166006debff6b25efdbb');
  assert.equal(gitBlobSha(mirrorBytes), '39854aee4c3fda0915629de455059f61486c557e');
  assert.equal(gitBlobSha(injectBytes), '4df61dd53d5bd8d9cb30368905aa20aac261d142');
  assert.equal(gitBlobSha(dnsModuleBytes), '0a4dfcda8717826b6d68eff4ed2295fa5f12fb92');

  // Unique TV-BS-I runtime variable: DnsVpnService is the TV-BS-H blob with
  // onStartCommand's normal-start return changed START_STICKY -> START_NOT_STICKY.
  assert.equal(gitBlobSha(dnsVpnBytes), 'd5bc90c71176b138836f766523e06fac57a350fe');
  const dnsVpn = dnsVpnBytes.toString('utf8');
  assert.doesNotMatch(dnsVpn, /return START_STICKY/);
  assert.equal((dnsVpn.match(/return START_NOT_STICKY/g) || []).length, 2);

  // Keep baseline asynchronous DNS/WebView startup ordering.
  const app = appBytes.toString('utf8');
  assert.doesNotMatch(app, /isAndroidTvRuntime|waitForTvDnsReady|promptDnsForTv/);
  assert.match(app, /promptDns\(\);/);

  // Retain native TV launcher compatibility only.
  assert.match(manifest, /android\.software\.leanback/);
  assert.match(manifest, /android\.intent\.category\.LEANBACK_LAUNCHER/);
  assert.match(manifest, /android:banner="@drawable\/tv_banner"/);
});
