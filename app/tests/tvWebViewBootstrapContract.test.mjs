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

test('TV bootstrap is idempotent and only establishes the TV contract', async () => {
  const { buildTvBootstrap } = await importTypeScript(
    'src/injection/tv-bootstrap.ts',
  );
  const script = buildTvBootstrap();

  assert.match(script, /MOVIX_TV\s*=\s*true/);
  assert.match(script, /classList\.add\('movix-tv'\)/);
  assert.match(script, /__MOVIX_TV_BOOTSTRAP_READY/);
  assert.match(script, /movix-tv-bootstrap-style/);
  assert.match(script, /:focus-visible/);
  assert.match(script, /\.movix-tv \[data-tv-header-telegram\]/);
  assert.match(script, /display:\s*none\s*!important/);
  assert.match(script, /DOMContentLoaded/);

  assert.doesNotMatch(script, /MutationObserver|ArrowLeft|ArrowRight|ArrowUp|ArrowDown|scrollIntoView/);
});

test('injection enables the TV bootstrap only when tvMode is true', async () => {
  const inject = await text('src/injection/inject.ts');

  assert.match(inject, /tvMode\?: boolean/);
  assert.match(inject, /options\.tvMode \? buildTvBootstrap\(\) : ''/);
  assert.match(inject, /\$\{tvBootstrap\}/);
});

test('hardware isolation build keeps TV bootstrap but disables D-pad injection', async () => {
  const [inject, webView] = await Promise.all([
    text('src/injection/inject.ts'),
    text('src/components/WebViewBrowser.tsx'),
  ]);

  assert.match(inject, /tvDpadEnabled\?: boolean/);
  assert.match(inject, /options\.tvMode && options\.tvDpadEnabled !== false/);
  assert.match(webView, /const TV_DPAD_ENABLED = false;/);
  assert.match(
    webView,
    /tvDpadEnabled: isTV \? TV_DPAD_ENABLED : false/,
  );
  assert.match(
    webView,
    /isTV && TV_DPAD_ENABLED \? 'dpad' : 'no-dpad'/,
  );
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


test('embedded URL bar stays hidden on TV, phones and tablets', async () => {
  const browserScreen = await text('src/screens/BrowserScreen.tsx');

  assert.match(
    browserScreen,
    /const effectiveShowUrlBar = false;/,
  );
  assert.match(
    browserScreen,
    /const toolbarHidden = !effectiveShowUrlBar && !uiPrefs\.showNavBar/,
  );
  assert.match(browserScreen, /showUrlBar=\{effectiveShowUrlBar\}/);
  assert.match(browserScreen, /showNavBar=\{uiPrefs\.showNavBar\}/);
  assert.doesNotMatch(browserScreen, /isTV \? false : uiPrefs\.showUrlBar/);
});


test('app blocks popup windows on every runtime before and after page scripts', async () => {
  const [inject, webView] = await Promise.all([
    text('src/injection/inject.ts'),
    text('src/components/WebViewBrowser.tsx'),
  ]);

  assert.match(inject, /Object\.defineProperty\(window, 'open'/);
  assert.match(inject, /const blockedOpen = \(\) => null/);
  assert.match(inject, /writable:\s*false/);
  assert.match(inject, /configurable:\s*false/);

  assert.match(webView, /const onOpenWindow = useCallback\(\(_event: WebViewOpenWindowEvent\) => \{/);
  assert.match(webView, /setSupportMultipleWindows=\{true\}/);
  assert.match(webView, /javaScriptCanOpenWindowsAutomatically=\{false\}/);
  assert.doesNotMatch(webView, /Linking\.openURL/);
});
