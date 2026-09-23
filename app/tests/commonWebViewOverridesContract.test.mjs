import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('common runtime keeps the clean shared remote-DOM policy before site scripts', async () => {
  const inject = await text('src/injection/inject.ts');

  assert.match(inject, /buildAppSiteOverrides/);
  assert.match(inject, /const blockedOpen = \(\) => null/);
  assert.match(inject, /Object\.defineProperty\(window, 'open'/);
  assert.match(inject, /\$\{popupBlocker\}[\s\S]*\$\{tvBootstrap\}[\s\S]*\$\{appSiteOverrides\}[\s\S]*\$\{castShim\}/);
});

test('clean shared policy still owns branding, Telegram cleanup and playback-gate advance', async () => {
  const overrides = await text('src/injection/app-site-overrides.ts');

  assert.match(overrides, /const replaceHeaderLogo = \(\) =>/);
  assert.match(overrides, /movix-logo\.png/);
  assert.match(overrides, /replaceChildren\(image\)/);
  assert.match(overrides, /const removeTelegramUi = \(\) =>/);
  assert.match(overrides, /t\.me\/movix_site/);
  assert.match(overrides, /rejoignez notre communaute/);
  assert.match(overrides, /const advancePlaybackGate = \(\) =>/);
  assert.match(overrides, /data-ad-view-button/);
  assert.match(overrides, /une pub et c est parti/);
  assert.match(overrides, /merci pour ton aide/);
  assert.match(overrides, /queueMicrotask\(\(\) => viewAdButton\.click\(\)\)/);
  assert.match(overrides, /queueMicrotask\(\(\) => playButton\.click\(\)\)/);
});

test('additional product cleanup is explicitly TV-gated instead of changing handheld source behavior', async () => {
  const overrides = await text('src/injection/app-site-overrides.ts');

  for (const name of [
    'markPosterCards',
    'installCardActivation',
    'removeFavoriteControls',
    'removeCarouselArrows',
    'makeMovixBrandInert',
    'removeFooter',
    'disableTvSmoothScroll',
    'installTvHeroAutoplay',
    'markTvRouteTransition',
    'patchHistory',
  ]) {
    assert.match(
      overrides,
      new RegExp(`const ${name} = \\(.*?\\) => \\{\\s*if \\(window\\.MOVIX_TV !== true\\) return;`),
      name,
    );
  }
});

test('source header keeps the final clean-baseline PNG branding', async () => {
  const header = await text('../src/components/Header.tsx');

  assert.match(header, /src="\/movix-logo\.png"/);
  assert.match(header, /aria-label="Movix"/);
  assert.match(header, /data-tv-header-logo/);
  assert.doesNotMatch(header, /<span className="text-red-600 tracking-wider">MOVIX<\/span>/);
});

test('native WebView rejects popup and new-window requests on every device', async () => {
  const webView = await text('src/components/WebViewBrowser.tsx');

  assert.match(webView, /const onOpenWindow = useCallback\(\(_event: WebViewOpenWindowEvent\)/);
  assert.match(webView, /setSupportMultipleWindows=\{true\}/);
  assert.match(webView, /javaScriptCanOpenWindowsAutomatically=\{false\}/);
  assert.doesNotMatch(webView, /Linking\.openURL|isSameOrigin/);
});
