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

test('TV-BS-J3A gates relaunch on truthful DNS forwarder readiness', async () => {
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

  assert.equal(gitBlobSha(appBytes), 'c5a981ff24a91cdaac34d9c27096638c8419d32b');
  assert.equal(gitBlobSha(webViewBytes), 'c42d8b9e33dd01af93ddadbf9f89ba432255784a');
  assert.equal(gitBlobSha(browserBytes), 'e7a7aae7f7754c49880b166006debff6b25efdbb');
  assert.equal(gitBlobSha(mirrorBytes), '39854aee4c3fda0915629de455059f61486c557e');
  assert.equal(gitBlobSha(injectBytes), '4df61dd53d5bd8d9cb30368905aa20aac261d142');
  assert.equal(gitBlobSha(dnsModuleBytes), 'd595e7f048266ab19f9b90e6fbf129f948e16e28');
  assert.equal(gitBlobSha(dnsVpnBytes), '8f580bdfd2fd59f48683effc097d0637550fbeef');

  const app = appBytes.toString('utf8');
  const dnsModule = dnsModuleBytes.toString('utf8');
  const dnsVpn = dnsVpnBytes.toString('utf8');

  // Initial state detection may still use isEnabled; readiness polling must not.
  assert.match(app, /nativeEnabled = await DnsModule\.isEnabled\(\)/);
  assert.match(app, /async function waitForAndroidDnsForwarderReady\(\): Promise<boolean>/);
  assert.match(app, /if \(await DnsModule\.isReady\(\)\)/);
  assert.match(app, /await waitForAndroidDnsForwarderReady\(\);/);
  assert.match(app, /ANDROID_DNS_READY_TIMEOUT_MS = 5000/);
  assert.match(app, /ANDROID_DNS_READY_POLL_MS = 100/);

  // Native bridge exposes a distinct signal.
  assert.match(dnsModule, /fun isReady\(promise: Promise\)/);
  assert.match(dnsModule, /promise\.resolve\(DnsVpnService\.isReady\)/);

  // Cross-thread lifecycle flags have explicit visibility.
  assert.match(dnsVpn, /@Volatile\s+private var isRunning = false/);
  assert.match(dnsVpn, /@Volatile\s+var isActive: Boolean = false/);
  assert.match(dnsVpn, /@Volatile\s+var isReady: Boolean = false/);

  // Forwarder readiness ordering: executor assigned -> ready -> blocking read loop.
  const executorAssigned = dnsVpn.indexOf('dnsExecutor = executor');
  const readyTrue = dnsVpn.indexOf('isReady = true', executorAssigned);
  const readLoop = dnsVpn.indexOf('while (isRunning)', readyTrue);
  assert.ok(executorAssigned >= 0 && readyTrue > executorAssigned && readLoop > readyTrue);

  // Readiness is cleared on thread exit and explicit stop.
  assert.match(dnsVpn, /finally \{\s+isReady = false/);
  assert.match(dnsVpn, /private fun stopVpn\(\) \{\s+isRunning = false\s+isReady = false\s+isActive = false/);

  // Preserve J1/J2A networking architecture.
  assert.match(dnsVpn, /private const val VIRTUAL_DNS = "10\.215\.173\.2"/);
  assert.match(dnsVpn, /\.addRoute\(VIRTUAL_DNS, 32\)/);
  assert.doesNotMatch(dnsVpn, /\.addRoute\(primaryDns, 32\)|\.addRoute\(secondaryDns, 32\)/);
  assert.match(dnsVpn, /private const val DNS_WORKER_COUNT = 8/);
  assert.match(dnsVpn, /Executors\.newFixedThreadPool\(DNS_WORKER_COUNT\)/);
  assert.match(dnsVpn, /if \(destinationPort != DNS_PORT\) continue/);
  assert.doesNotMatch(dnsVpn, /return START_STICKY/);

  // First install remains non-blocking.
  assert.match(app, /stored === null[\s\S]*promptDns\(\);[\s\S]*setDnsSettled\(true\);/);
  assert.match(manifest, /android\.intent\.category\.LEANBACK_LAUNCHER/);
});
