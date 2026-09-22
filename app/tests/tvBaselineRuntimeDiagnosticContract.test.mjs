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

test('TV-BS-J2A makes only UDP DNS forwarding concurrent on top of J1', async () => {
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

  assert.equal(gitBlobSha(appBytes), '5fbe28710abf29ed78a478e1ca6bdf364f82b71a');
  assert.equal(gitBlobSha(webViewBytes), 'c42d8b9e33dd01af93ddadbf9f89ba432255784a');
  assert.equal(gitBlobSha(browserBytes), 'e7a7aae7f7754c49880b166006debff6b25efdbb');
  assert.equal(gitBlobSha(mirrorBytes), '39854aee4c3fda0915629de455059f61486c557e');
  assert.equal(gitBlobSha(injectBytes), '4df61dd53d5bd8d9cb30368905aa20aac261d142');
  assert.equal(gitBlobSha(dnsModuleBytes), '0a4dfcda8717826b6d68eff4ed2295fa5f12fb92');
  assert.equal(gitBlobSha(dnsVpnBytes), '95201edbeb0cf8fe97f9ab3f3a11ddf4e0b2fff0');

  const dnsVpn = dnsVpnBytes.toString('utf8');

  // Preserve J1 virtual DNS architecture exactly.
  assert.match(dnsVpn, /private const val VIRTUAL_DNS = "10\.215\.173\.2"/);
  assert.match(dnsVpn, /\.addDnsServer\(VIRTUAL_DNS\)/);
  assert.match(dnsVpn, /\.addRoute\(VIRTUAL_DNS, 32\)/);
  assert.doesNotMatch(dnsVpn, /\.addRoute\(primaryDns, 32\)|\.addRoute\(secondaryDns, 32\)/);
  assert.match(dnsVpn, /if \(protocol != 17\) continue/);
  assert.match(dnsVpn, /if \(destinationPort != DNS_PORT\) continue/);

  // Unique J2A variable: bounded concurrent UDP DNS workers.
  assert.match(dnsVpn, /private const val DNS_WORKER_COUNT = 8/);
  assert.match(dnsVpn, /Executors\.newFixedThreadPool\(DNS_WORKER_COUNT\)/);
  assert.match(dnsVpn, /executor\.execute \{/);
  assert.match(dnsVpn, /synchronized\(output\)/);
  assert.match(dnsVpn, /dnsExecutor\?\.shutdownNow\(\)/);

  // Still no DNS-over-TCP in J2A.
  assert.doesNotMatch(dnsVpn, /import java\.net\.Socket|ServerSocket|protocol != 6/);

  // Preserve I/J1 service and baseline app behavior.
  assert.doesNotMatch(dnsVpn, /return START_STICKY/);
  assert.equal((dnsVpn.match(/return START_NOT_STICKY/g) || []).length, 2);
  const app = appBytes.toString('utf8');
  assert.doesNotMatch(app, /isAndroidTvRuntime|waitForTvDnsReady|promptDnsForTv/);
  assert.match(app, /promptDns\(\);/);
  assert.match(manifest, /android\.software\.leanback/);
  assert.match(manifest, /android\.intent\.category\.LEANBACK_LAUNCHER/);
});
