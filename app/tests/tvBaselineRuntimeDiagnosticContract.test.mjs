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

test('TV-BS-J3C keeps J3B and blocks only first install until VPN choice settles', async () => {
  const [
    appBytes,
    webViewBytes,
    browserBytes,
    mirrorBytes,
    injectBytes,
    resolverBytes,
    dnsModuleBytes,
    dnsVpnBytes,
    manifest,
  ] = await Promise.all([
    bytes('src/App.tsx'),
    bytes('src/components/WebViewBrowser.tsx'),
    bytes('src/screens/BrowserScreen.tsx'),
    bytes('src/components/MirrorErrorScreen.tsx'),
    bytes('src/injection/inject.ts'),
    bytes('src/services/addressResolver.ts'),
    bytes('android/app/src/main/java/com/movix/app/dns/DnsModule.kt'),
    bytes('android/app/src/main/java/com/movix/app/dns/DnsVpnService.kt'),
    text('android/app/src/main/AndroidManifest.xml'),
  ]);

  // J3C changes App.tsx only.
  assert.equal(gitBlobSha(appBytes), '07df8edb713d852fa3a81e60de34a2b4f2c382cd');

  // Keep the proven J3B recovery and J2A networking byte-for-byte.
  assert.equal(gitBlobSha(browserBytes), 'eae4e3a602a4f9ab6429f1d5dd73049566547cd4');
  assert.equal(gitBlobSha(webViewBytes), 'c42d8b9e33dd01af93ddadbf9f89ba432255784a');
  assert.equal(gitBlobSha(mirrorBytes), '39854aee4c3fda0915629de455059f61486c557e');
  assert.equal(gitBlobSha(injectBytes), '4df61dd53d5bd8d9cb30368905aa20aac261d142');
  assert.equal(gitBlobSha(resolverBytes), '37e8b3cc355a024a01259f4476cef330febc9fd1');
  assert.equal(gitBlobSha(dnsModuleBytes), '0a4dfcda8717826b6d68eff4ed2295fa5f12fb92');
  assert.equal(gitBlobSha(dnsVpnBytes), '95201edbeb0cf8fe97f9ab3f3a11ddf4e0b2fff0');

  const app = appBytes.toString('utf8');
  const browser = browserBytes.toString('utf8');

  // First install waits for the user choice / Android permission callback.
  assert.match(app, /function promptDns\(\): Promise<void>/);
  assert.match(app, /return new Promise\(resolve => \{/);
  assert.match(app, /stored === null[\s\S]*await promptDns\(\);[\s\S]*setDnsSettled\(true\);/);
  assert.match(app, /\{ cancelable: false \}/);

  // Both decision paths settle the Promise.
  assert.match(app, /text: 'Non merci'[\s\S]*await AsyncStorage\.setItem\('dns_enabled', 'false'\);[\s\S]*resolve\(\);/);
  assert.match(app, /text: 'Activer'[\s\S]*await DnsModule\.enable\('1\.1\.1\.1', '1\.0\.0\.1'\)[\s\S]*finally \{\s*resolve\(\);/);

  // Stored=true relaunch remains J2A/J3B fire-and-forget: no readiness regression.
  assert.match(app, /stored === 'true' && DnsModule && Platform\.OS === 'android'[\s\S]*DnsModule\.enable\('1\.1\.1\.1', '1\.0\.0\.1'\)\.catch\(\(\) => \{\}\);[\s\S]*setDnsSettled\(true\);/);
  assert.doesNotMatch(app, /waitForAndroidDnsReady|waitForAndroidDnsForwarderReady|DnsModule\.isReady/);

  // J3B automatic one-shot recovery is still present.
  assert.match(browser, /autoRecoveryAttemptedRef/);
  assert.match(browser, /await refresh\(\)/);
  assert.match(browser, /setWebViewGeneration\(generation => generation \+ 1\)/);

  const dnsVpn = dnsVpnBytes.toString('utf8');
  assert.match(dnsVpn, /private const val VIRTUAL_DNS = "10\.215\.173\.2"/);
  assert.match(dnsVpn, /private const val DNS_WORKER_COUNT = 8/);
  assert.doesNotMatch(dnsVpn, /\.addRoute\(primaryDns, 32\)|\.addRoute\(secondaryDns, 32\)/);
  assert.match(manifest, /android\.intent\.category\.LEANBACK_LAUNCHER/);
});
