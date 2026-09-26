import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

async function importTypeScript(relativePath) {
  const source = await text(relativePath);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

test('TV bootstrap is idempotent and establishes TV-only visual/navigation chrome', async () => {
  const { buildTvBootstrap } = await importTypeScript('src/injection/tv-bootstrap.ts');
  const script = buildTvBootstrap();

  assert.match(script, /MOVIX_TV\s*=\s*true/);
  assert.match(script, /classList\.add\('movix-tv'\)/);
  assert.match(script, /__MOVIX_TV_BOOTSTRAP_READY/);
  assert.match(script, /scrollbar-width: none !important/);
  assert.match(script, /::-webkit-scrollbar/);
  assert.match(script, /outline: 3px solid #dc2626 !important/);
  assert.match(script, /data-tv-carousel-arrow/);
  assert.match(script, /data-tv-favorite-overlay/);
  assert.match(script, /data-tv-header-telegram/);
  assert.match(script, /--hero-duration: 10000ms !important/);
  assert.match(script, /DOMContentLoaded/);
  assert.doesNotMatch(script, /MutationObserver|ArrowLeft|ArrowRight|ArrowUp|ArrowDown|scrollIntoView/);
});

test('TV bootstrap and spatial D-pad are injected only behind tvMode', async () => {
  const inject = await text('src/injection/inject.ts');

  assert.match(inject, /tvMode\?: boolean/);
  assert.match(inject, /options\.tvMode \? buildTvBootstrap\(\) : ''/);
  assert.match(inject, /const tvDpadRuntime = options\.tvMode/);
  assert.match(inject, /buildTvDpadRuntime/);
  assert.match(inject, /buildTvDomDiscoveryRuntime/);
  assert.match(inject, /\$\{tvBootstrap\}/);
  assert.match(inject, /\$\{tvDpadRuntime\}/);
  assert.doesNotMatch(inject, /tvDpadEnabled/);
});

test('TV marker precedes shared live-site overrides and D-pad runtime follows the bridge', async () => {
  const inject = await text('src/injection/inject.ts');

  const bootstrapIndex = inject.indexOf('${tvBootstrap}');
  const overridesIndex = inject.indexOf('${appSiteOverrides}');
  const bridgeIndex = inject.indexOf('${bridge}');
  const dpadIndex = inject.indexOf('${tvDpadRuntime}');

  assert.ok(bootstrapIndex >= 0);
  assert.ok(overridesIndex > bootstrapIndex);
  assert.ok(bridgeIndex > overridesIndex);
  assert.ok(dpadIndex > bridgeIndex);
});

test('WebView injection cache is partitioned by journal and TV runtime', async () => {
  const webView = await text('src/components/WebViewBrowser.tsx');

  assert.match(webView, /INJECTED_JS_BY_RUNTIME_STATE = new Map<string, string>/);
  assert.match(webView, /isTV \? 'tv' : 'handheld'/);
  assert.match(webView, /tvMode: isTV/);
  assert.match(webView, /injectedJavaScriptFor\(journalConsole, isTV\)/);
  assert.match(webView, /\[journalConsole, isTV\]/);
  assert.match(webView, /injectedJavaScriptBeforeContentLoadedForMainFrameOnly=\{true\}/);
});

test('browser chrome remains available on handheld but is suppressed on TV', async () => {
  const browser = await text('src/screens/BrowserScreen.tsx');

  assert.match(browser, /import BrowserToolbar/);
  assert.match(browser, /import IOSBrowserToolbar/);
  assert.match(browser, /useBrowserUIPrefs/);
  assert.match(browser, /!isPictureInPictureActive && !isTV && !toolbarHidden/);
  assert.match(browser, /showUrlBar=\{uiPrefs\.showUrlBar\}/);
  assert.match(browser, /showNavBar=\{uiPrefs\.showNavBar\}/);
  assert.match(browser, /!isPictureInPictureActive && !isTV && navBarHidden/);
});

test('app blocks popup windows before page scripts and at the native WebView boundary', async () => {
  const [inject, webView] = await Promise.all([
    text('src/injection/inject.ts'),
    text('src/components/WebViewBrowser.tsx'),
  ]);

  assert.match(inject, /Object\.defineProperty\(window, 'open'/);
  assert.match(inject, /const blockedOpen = \(\) => null/);
  assert.match(inject, /writable:\s*false/);
  assert.match(inject, /configurable:\s*false/);
  assert.match(webView, /const onOpenWindow = useCallback\(\(_event: WebViewOpenWindowEvent\)/);
  assert.match(webView, /setSupportMultipleWindows=\{true\}/);
  assert.match(webView, /javaScriptCanOpenWindowsAutomatically=\{false\}/);
  assert.doesNotMatch(webView, /Linking\.openURL|isSameOrigin/);
});

test('Android TV WebView requests native focus before DOM navigation while handheld keeps defaults', async () => {
  const webView = await text('src/components/WebViewBrowser.tsx');

  assert.match(webView, /const requestTvWebViewFocus = useCallback\(\(\) => \{/);
  assert.match(webView, /if \(!isTV\) return/);
  assert.match(webView, /requestFocus\?\.\(\)/);
  assert.match(webView, /setTimeout\(requestTvWebViewFocus, 80\)/);
  assert.match(webView, /setTimeout\(requestTvWebViewFocus, 450\)/);
  assert.match(webView, /focusable=\{isTV \? true : undefined\}/);
  assert.match(webView, /onLoadEnd=\{requestTvWebViewFocus\}/);
});
