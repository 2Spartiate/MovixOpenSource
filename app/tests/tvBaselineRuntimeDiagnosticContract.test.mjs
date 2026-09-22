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

test('TV-BS-J3B restores exact J2A networking and adds one BrowserScreen recovery', async () => {
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

  // J2A networking/startup is restored exactly.
  assert.equal(gitBlobSha(appBytes), '5fbe28710abf29ed78a478e1ca6bdf364f82b71a');
  assert.equal(gitBlobSha(dnsModuleBytes), '0a4dfcda8717826b6d68eff4ed2295fa5f12fb92');
  assert.equal(gitBlobSha(dnsVpnBytes), '95201edbeb0cf8fe97f9ab3f3a11ddf4e0b2fff0');

  // Other frozen baseline runtime stays untouched.
  assert.equal(gitBlobSha(webViewBytes), 'c42d8b9e33dd01af93ddadbf9f89ba432255784a');
  assert.equal(gitBlobSha(mirrorBytes), '39854aee4c3fda0915629de455059f61486c557e');
  assert.equal(gitBlobSha(injectBytes), '4df61dd53d5bd8d9cb30368905aa20aac261d142');
  assert.equal(gitBlobSha(resolverBytes), '37e8b3cc355a024a01259f4476cef330febc9fd1');

  // The only product-level change is BrowserScreen's one-shot full recovery.
  assert.equal(gitBlobSha(browserBytes), 'eae4e3a602a4f9ab6429f1d5dd73049566547cd4');
  const browser = browserBytes.toString('utf8');
  assert.match(browser, /const autoRecoveryAttemptedRef = useRef\(false\)/);
  assert.match(browser, /const autoRecoveryInFlightRef = useRef\(false\)/);
  assert.match(browser, /if \(!autoRecoveryAttemptedRef\.current\)/);
  assert.match(browser, /autoRecoveryAttemptedRef\.current = true/);
  assert.match(browser, /await refresh\(\)/);
  assert.match(browser, /setMirrorIndex\(0\)/);
  assert.match(browser, /setWebViewGeneration\(generation => generation \+ 1\)/);
  assert.match(browser, /key=\{\`\$\{activeUrl\}:\$\{webViewGeneration\}\`\}/);

  // A second complete-chain failure must still surface the real fallback.
  assert.match(browser, /setAllMirrorsFailed\(true\)/);

  // No J2B/J3A readiness gating survives.
  const app = appBytes.toString('utf8');
  assert.doesNotMatch(app, /waitForAndroidDnsReady|waitForAndroidDnsForwarderReady|DnsModule\.isReady/);

  // J1/J2A tunnel properties remain.
  const dnsVpn = dnsVpnBytes.toString('utf8');
  assert.match(dnsVpn, /private const val VIRTUAL_DNS = "10\.215\.173\.2"/);
  assert.match(dnsVpn, /private const val DNS_WORKER_COUNT = 8/);
  assert.match(dnsVpn, /Executors\.newFixedThreadPool\(DNS_WORKER_COUNT\)/);
  assert.doesNotMatch(dnsVpn, /\.addRoute\(primaryDns, 32\)|\.addRoute\(secondaryDns, 32\)/);

  assert.match(manifest, /android\.intent\.category\.LEANBACK_LAUNCHER/);
});
