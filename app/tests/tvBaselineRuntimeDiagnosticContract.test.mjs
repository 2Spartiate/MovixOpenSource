import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('proven J3C DNS lifecycle survives restoration of TV product behavior', async () => {
  const [app, browser, webView, inject, dnsVpn, manifest] = await Promise.all([
    text('src/App.tsx'),
    text('src/screens/BrowserScreen.tsx'),
    text('src/components/WebViewBrowser.tsx'),
    text('src/injection/inject.ts'),
    text('android/app/src/main/java/com/movix/app/dns/DnsVpnService.kt'),
    text('android/app/src/main/AndroidManifest.xml'),
  ]);

  // First install still waits for the user's VPN decision before mounting the
  // address provider. This is the DNS race fix proven by J3C.
  assert.match(app, /function promptDns\(\): Promise<void>/);
  assert.match(app, /return new Promise\(resolve => \{/);
  assert.match(app, /stored === null[\s\S]*await promptDns\(\);[\s\S]*setDnsSettled\(true\);/);
  assert.match(app, /\{ cancelable: false \}/);
  assert.match(app, /text: 'Non merci'[\s\S]*await AsyncStorage\.setItem\('dns_enabled', 'false'\);[\s\S]*resolve\(\);/);
  assert.match(app, /text: 'Activer'[\s\S]*await DnsModule\.enable\('1\.1\.1\.1', '1\.0\.0\.1'\)[\s\S]*finally \{\s*resolve\(\);/);

  // Subsequent launches keep the proven fire-and-forget DNS restart.
  assert.match(app, /stored === 'true' && DnsModule && Platform\.OS === 'android'[\s\S]*DnsModule\.enable\('1\.1\.1\.1', '1\.0\.0\.1'\)\.catch\(\(\) => \{\}\);[\s\S]*setDnsSettled\(true\);/);
  assert.doesNotMatch(app, /waitForAndroidDnsReady|waitForAndroidDnsForwarderReady|DnsModule\.isReady/);

  // J3B one-shot resolver recovery remains intact.
  assert.match(browser, /autoRecoveryAttemptedRef/);
  assert.match(browser, /await refresh\(\)/);
  assert.match(browser, /setWebViewGeneration\(generation => generation \+ 1\)/);

  // TV behavior is now restored on top of, not instead of, the proven DNS path.
  assert.match(browser, /const isTV = useMemo\(\(\) => isAndroidTvRuntime\(\), \[\]\)/);
  assert.match(browser, /isTV=\{isTV\}/);
  assert.match(webView, /isTV: boolean/);
  assert.match(webView, /tvMode: isTV/);
  assert.match(inject, /buildTvBootstrap/);
  assert.match(inject, /buildTvDpadRuntime/);

  // Native DNS architecture proven during J2A/J3 stays unchanged.
  assert.match(dnsVpn, /private const val VIRTUAL_DNS = "10\.215\.173\.2"/);
  assert.match(dnsVpn, /private const val DNS_WORKER_COUNT = 8/);
  assert.doesNotMatch(dnsVpn, /\.addRoute\(primaryDns, 32\)|\.addRoute\(secondaryDns, 32\)/);
  assert.match(manifest, /android\.intent\.category\.LEANBACK_LAUNCHER/);
});
