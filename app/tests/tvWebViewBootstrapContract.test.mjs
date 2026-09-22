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

test('TV bootstrap is idempotent and establishes only the remaining TV chrome contract', async () => {
  const { buildTvBootstrap } = await importTypeScript(
    'src/injection/tv-bootstrap.ts',
  );
  const script = buildTvBootstrap();

  assert.match(script, /MOVIX_TV\s*=\s*true/);
  assert.match(script, /classList\.add\('movix-tv'\)/);
  assert.match(script, /__MOVIX_TV_BOOTSTRAP_READY/);
  assert.match(script, /movix-tv-bootstrap-style/);
  assert.match(script, /:focus-visible/);
  assert.match(script, /\.movix-tv \[data-tv-favorite-overlay\]/);
  assert.match(script, /display:\s*none\s*!important/);
  assert.match(script, /DOMContentLoaded/);
  assert.doesNotMatch(script, /data-tv-carousel-arrow|data-tv-header-telegram/);
  assert.doesNotMatch(script, /MutationObserver|ArrowLeft|ArrowRight|ArrowUp|ArrowDown|scrollIntoView/);
});

test('TV bootstrap and D-pad runtime are enabled only behind tvMode', async () => {
  const inject = await text('src/injection/inject.ts');

  assert.match(inject, /tvMode\?: boolean/);
  assert.match(inject, /options\.tvMode \? buildTvBootstrap\(\) : ''/);
  assert.match(inject, /const tvDpadRuntime = options\.tvMode/);
  assert.match(inject, /buildTvDpadRuntime/);
  assert.match(inject, /\$\{tvBootstrap\}/);
  assert.match(inject, /\$\{tvDpadRuntime\}/);
  assert.doesNotMatch(inject, /tvDpadEnabled/);
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

test('embedded address and bottom navigation bars are absent on every device', async () => {
  const browser = await text('src/screens/BrowserScreen.tsx');

  assert.doesNotMatch(browser, /BrowserToolbar|IOSBrowserToolbar|useBrowserUIPrefs/);
  assert.doesNotMatch(browser, /showUrlBar|showNavBar|toolbarHidden|navBarHidden/);
  assert.match(browser, /WebView occupe tout l'écran/);
  assert.match(browser, /!isPictureInPictureActive && !isTV/);
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
