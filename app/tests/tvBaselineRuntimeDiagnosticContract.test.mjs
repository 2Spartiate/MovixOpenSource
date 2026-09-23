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

test('clean integration preserves the hardware-proven J3C DNS/startup baseline', async () => {
  const [
    appBytes,
    mirrorBytes,
    resolverBytes,
    dnsModuleBytes,
    dnsVpnBytes,
    manifest,
  ] = await Promise.all([
    bytes('src/App.tsx'),
    bytes('src/components/MirrorErrorScreen.tsx'),
    bytes('src/services/addressResolver.ts'),
    bytes('android/app/src/main/java/com/movix/app/dns/DnsModule.kt'),
    bytes('android/app/src/main/java/com/movix/app/dns/DnsVpnService.kt'),
    text('android/app/src/main/AndroidManifest.xml'),
  ]);

  // These are the byte-for-byte network/startup surfaces from the validated
  // clean baseline 79b1b4a. TV product work must never rewrite them.
  assert.equal(gitBlobSha(appBytes), '07df8edb713d852fa3a81e60de34a2b4f2c382cd');
  assert.equal(gitBlobSha(mirrorBytes), '39854aee4c3fda0915629de455059f61486c557e');
  assert.equal(gitBlobSha(resolverBytes), '37e8b3cc355a024a01259f4476cef330febc9fd1');
  assert.equal(gitBlobSha(dnsModuleBytes), '0a4dfcda8717826b6d68eff4ed2295fa5f12fb92');
  assert.equal(gitBlobSha(dnsVpnBytes), '95201edbeb0cf8fe97f9ab3f3a11ddf4e0b2fff0');

  const app = appBytes.toString('utf8');
  const dnsVpn = dnsVpnBytes.toString('utf8');

  assert.match(app, /function promptDns\(\): Promise<void>/);
  assert.match(app, /stored === null[\s\S]*await promptDns\(\);[\s\S]*setDnsSettled\(true\);/);
  assert.match(app, /\{ cancelable: false \}/);
  assert.match(app, /text: 'Non merci'[\s\S]*await AsyncStorage\.setItem\('dns_enabled', 'false'\);[\s\S]*resolve\(\);/);
  assert.match(app, /text: 'Activer'[\s\S]*await DnsModule\.enable\('1\.1\.1\.1', '1\.0\.0\.1'\)[\s\S]*finally \{\s*resolve\(\);/);
  assert.match(app, /stored === 'true' && DnsModule && Platform\.OS === 'android'[\s\S]*DnsModule\.enable\('1\.1\.1\.1', '1\.0\.0\.1'\)\.catch\(\(\) => \{\}\);[\s\S]*setDnsSettled\(true\);/);
  assert.doesNotMatch(app, /waitForAndroidDnsReady|waitForAndroidDnsForwarderReady|DnsModule\.isReady/);

  assert.match(dnsVpn, /private const val VIRTUAL_DNS = "10\.215\.173\.2"/);
  assert.match(dnsVpn, /private const val DNS_WORKER_COUNT = 8/);
  assert.doesNotMatch(dnsVpn, /\.addRoute\(primaryDns, 32\)|\.addRoute\(secondaryDns, 32\)/);
  assert.match(manifest, /android\.intent\.category\.LEANBACK_LAUNCHER/);
});

test('product-layer TV integration keeps the clean one-shot WebView recovery', async () => {
  const [browser, webView, inject] = await Promise.all([
    text('src/screens/BrowserScreen.tsx'),
    text('src/components/WebViewBrowser.tsx'),
    text('src/injection/inject.ts'),
  ]);

  assert.match(browser, /autoRecoveryAttemptedRef/);
  assert.match(browser, /await refresh\(\)/);
  assert.match(browser, /setWebViewGeneration\(generation => generation \+ 1\)/);

  // Clean baseline proxy/WebView policy remains intact around the TV flag.
  assert.match(webView, /mediaProxyXhrRoutingEnabled: Platform\.OS === 'android'/);
  assert.match(webView, /mediaProxyScheme: Platform\.OS === 'ios' \? 'movix-media' : null/);
  assert.match(webView, /mixedContentMode="always"/);
  assert.match(webView, /tvMode: isTV/);

  assert.match(inject, /\$\{popupBlocker\}[\s\S]*\$\{tvBootstrap\}[\s\S]*\$\{appSiteOverrides\}/);
  assert.match(inject, /\$\{bridge\}[\s\S]*\$\{tvDpadRuntime\}[\s\S]*USERSCRIPT_SOURCE/);
});
