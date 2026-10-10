import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const bytes = path => readFile(new URL(path, root));
const text = async path => (await bytes(path)).toString('utf8');

test('upstream DNS improves transport while preserving the custom DNS-only tunnel', async () => {
  const [app, dnsVpn, manifest] = await Promise.all([
    text('src/App.tsx'),
    text('android/app/src/main/java/com/movix/app/dns/DnsVpnService.kt'),
    text('android/app/src/main/AndroidManifest.xml'),
  ]);
  assert.match(app, /stored === null[\s\S]*await promptDns\(\);[\s\S]*setDnsSettled\(true\);/);
  assert.match(app, /DNS_START_WAIT_MS = 6000/);
  assert.match(app, /DNS_PROMPT_WAIT_MS = 30000/);
  assert.match(app, /await waitAtMost\([\s\S]*DnsModule\.enable/);
  assert.match(dnsVpn, /private const val VIRTUAL_DNS = "10\.215\.173\.2"/);
  assert.match(dnsVpn, /private const val WORKER_COUNT = 8/);
  assert.match(dnsVpn, /https:\/\/1\.1\.1\.1\/dns-query/);
  assert.match(dnsVpn, /application\/dns-message/);
  assert.match(dnsVpn, /START_NOT_STICKY/);
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
