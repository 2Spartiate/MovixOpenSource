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

test('TV-BS-J2B waits for DNS service readiness only on Android relaunch path', async () => {
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

  // J2B changes App startup gating only.
  assert.equal(gitBlobSha(appBytes), '2ccebcaee11394baa0c2c34db7b8bcb8ea038b30');
  assert.equal(gitBlobSha(webViewBytes), 'c42d8b9e33dd01af93ddadbf9f89ba432255784a');
  assert.equal(gitBlobSha(browserBytes), 'e7a7aae7f7754c49880b166006debff6b25efdbb');
  assert.equal(gitBlobSha(mirrorBytes), '39854aee4c3fda0915629de455059f61486c557e');
  assert.equal(gitBlobSha(injectBytes), '4df61dd53d5bd8d9cb30368905aa20aac261d142');
  assert.equal(gitBlobSha(dnsModuleBytes), '0a4dfcda8717826b6d68eff4ed2295fa5f12fb92');

  // Freeze J2A virtual-DNS + concurrent UDP relay exactly.
  assert.equal(gitBlobSha(dnsVpnBytes), '95201edbeb0cf8fe97f9ab3f3a11ddf4e0b2fff0');

  const app = appBytes.toString('utf8');
  const dnsVpn = dnsVpnBytes.toString('utf8');

  // Bounded readiness polling.
  assert.match(app, /ANDROID_DNS_READY_TIMEOUT_MS = 5000/);
  assert.match(app, /ANDROID_DNS_READY_POLL_MS = 100/);
  assert.match(app, /async function waitForAndroidDnsReady\(\): Promise<boolean>/);
  assert.match(app, /if \(await DnsModule\.isEnabled\(\)\)/);

  // Stored-enabled/native-disabled Android relaunch must await enable + readiness.
  assert.match(
    app,
    /stored === 'true' && DnsModule && Platform\.OS === 'android'[\s\S]*await DnsModule\.enable\('1\.1\.1\.1', '1\.0\.0\.1'\);[\s\S]*await waitForAndroidDnsReady\(\);[\s\S]*setDnsSettled\(true\);/
  );
  assert.doesNotMatch(app, /DnsModule\.enable\('1\.1\.1\.1', '1\.0\.0\.1'\)\.catch\(\(\) => \{\}\)/);

  // First-install prompt remains non-blocking, intentionally unchanged.
  assert.match(app, /stored === null[\s\S]*promptDns\(\);[\s\S]*setDnsSettled\(true\);/);

  // J2A architecture remains intact.
  assert.match(dnsVpn, /private const val VIRTUAL_DNS = "10\.215\.173\.2"/);
  assert.match(dnsVpn, /Executors\.newFixedThreadPool\(DNS_WORKER_COUNT\)/);
  assert.match(dnsVpn, /if \(destinationPort != DNS_PORT\) continue/);
  assert.doesNotMatch(dnsVpn, /return START_STICKY/);

  // TV launcher support retained.
  assert.match(manifest, /android\.software\.leanback/);
  assert.match(manifest, /android\.intent\.category\.LEANBACK_LAUNCHER/);
});
