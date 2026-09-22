import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('Android startup waits for VPN DNS readiness before mounting the browser', async () => {
  const app = await text('src/App.tsx');

  assert.match(app, /async function waitForAndroidDnsActive\(\): Promise<boolean>/);
  assert.match(app, /await DnsModule\.isEnabled\(\)/);
  assert.match(app, /return waitForAndroidDnsActive\(\)/);
  assert.match(app, /await promptDns\(\);/);
  assert.match(app, /const dnsActivated = await activateDnsForStartup\(\)/);
  assert.doesNotMatch(
    app,
    /DnsModule\.enable\('1\.1\.1\.1', '1\.0\.0\.1'\)\.catch\(\(\) => \{\}\)/,
  );
});

test('WebView mirror failover ignores subresource HTTP failures', async () => {
  const webView = await text('src/components/WebViewBrowser.tsx');

  assert.match(webView, /function isTopLevelFailure/);
  assert.match(webView, /typeof nativeEvent\.isTopFrame === 'boolean'/);
  assert.match(webView, /return isSameDocumentUrl\(eventUrl, currentTopLevelUrl\)/);
  assert.match(
    webView,
    /if \(!isTopLevelFailure\(event\.nativeEvent, topLevelUrlRef\.current\)\) \{\s*return;/,
  );
});

test('TV retries transient document failures before declaring mirrors unavailable', async () => {
  const screen = await text('src/screens/BrowserScreen.tsx');

  assert.match(screen, /tvFailureRetriesRef = useRef\(new Map<string, number>\(\)\)/);
  assert.match(screen, /attempts < 2/);
  assert.match(screen, /nextAttempt === 1 \? 700 : 1500/);
  assert.match(screen, /webViewRef\.current\?\.reload\(\)/);
  assert.match(screen, /onLoadSuccess=\{onWebViewLoadSuccess\}/);
  assert.match(screen, /tvFailureRetriesRef\.current\.delete\(activeUrl\)/);
});

test('mirror error copy does not claim a verified outage', async () => {
  const errorScreen = await text('src/components/MirrorErrorScreen.tsx');

  assert.doesNotMatch(errorScreen, /Tous les domaines Movix semblent bloqués ou hors ligne/);
  assert.match(errorScreen, /DNS\/VPN peut encore être en cours d'initialisation/);
});
