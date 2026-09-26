import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('Android TV hardware Back is consumed by TV routing before WebView canGoBack', async () => {
  const browser = await text('src/screens/BrowserScreen.tsx');
  const start = browser.indexOf("BackHandler.addEventListener('hardwareBackPress'");
  const end = browser.indexOf('return () => handler.remove()', start);
  const handler = browser.slice(start, end);

  assert.ok(start >= 0);
  assert.ok(handler.indexOf('if (isTV)') >= 0);
  assert.ok(handler.indexOf('if (canGoBack)') > handler.indexOf('if (isTV)'));
  assert.match(handler, /if \(isTvHome\)[\s\S]{0,220}setExitConfirmVisible\(true\)[\s\S]{0,120}return true/);
  assert.match(handler, /new Event\('movix-tv-back', \{ cancelable: true \}\)/);
  assert.match(handler, /if \(!event\.defaultPrevented\) \{[\s\S]{0,180}window\.history\.length > 1[\s\S]{0,160}window\.location\.href = '\/'/);
  assert.match(handler, /injectJavaScript[\s\S]{0,700}return true/);
});

test('TV SPA route state is published on initial load and History API changes', async () => {
  const overrides = await text('src/injection/app-site-overrides.ts');
  const webview = await text('src/components/WebViewBrowser.tsx');
  const browser = await text('src/screens/BrowserScreen.tsx');

  assert.match(overrides, /type: 'MOVIX_TV_ROUTE'[\s\S]{0,120}href: window\.location\.href[\s\S]{0,120}pathname: window\.location\.pathname/);
  assert.match(overrides, /\['pushState', 'replaceState'\][\s\S]{0,520}publishTvRouteState\(\)/);
  assert.match(overrides, /addEventListener\('popstate'[\s\S]{0,180}publishTvRouteState\(\)/);
  assert.match(overrides, /const start = \(\) => \{[\s\S]{0,160}patchHistory\(\)[\s\S]{0,100}publishTvRouteState\(\)/);

  assert.match(webview, /onTvRouteChange\?: \(pathname: string, href: string\) => void/);
  assert.match(webview, /parsed\?\.type === 'MOVIX_TV_ROUTE'[\s\S]{0,260}onTvRouteChange\(parsed\.pathname, parsed\.href\)/);
  assert.match(browser, /const \[tvPathname, setTvPathname\] = useState\(''\)/);
  assert.match(browser, /onTvRouteChange=\{\(pathname, href\) => \{[\s\S]{0,160}setTvPathname\(pathname\)[\s\S]{0,120}setCurrentUrl\(href\)/);
});

test('HLS TV Back closes local state in priority order and leaves route exit to WebView', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');
  const handler = hls.match(/const handleTvBack = \(event: Event\) => \{([\s\S]*?)window\.addEventListener\('movix-tv-back'/)?.[1] || '';

  const order = [
    'if (isLocked)',
    'if (showTvQuickMenu)',
    'if (showSettings)',
    'if (showCastMenu)',
    'if (showSeasonDropdown)',
    'if (showInternalEpisodesMenu)',
    'if (studioOpen)',
  ];
  let previous = -1;
  for (const marker of order) {
    const index = handler.indexOf(marker);
    assert.ok(index > previous, marker);
    previous = index;
  }

  assert.match(handler, /if \(fullscreenActive\)[\s\S]{0,160}void toggleFullscreen\(\)/);
  assert.match(hls, /Otherwise leave the event unconsumed:[\s\S]{0,140}WebView/);
});

test('Live TV Back closes settings, then fullscreen, then the player overlay', async () => {
  const live = await text('../src/components/LiveTVPlayer.tsx');
  const handler = live.match(/const handleTvBack = \(event: Event\) => \{([\s\S]*?)window\.addEventListener\('movix-tv-back'/)?.[1] || '';

  assert.ok(handler.indexOf('if (showSettings)') >= 0);
  assert.ok(handler.indexOf('if (isFullscreen') > handler.indexOf('if (showSettings)'));
  assert.ok(handler.lastIndexOf('onClose();') > handler.indexOf('if (isFullscreen'));
  assert.match(handler, /event\.preventDefault\(\)/);
});

test('France TV Back closes settings, then fullscreen, then exits its route', async () => {
  const france = await text('../src/pages/FranceTV/FranceTVPlayer.tsx');
  const handler = france.match(/const handleTvBack = \(event: Event\) => \{([\s\S]*?)window\.addEventListener\('movix-tv-back'/)?.[1] || '';

  assert.ok(handler.indexOf('if (showSettings)') >= 0);
  assert.ok(handler.indexOf('if (document.fullscreenElement || isFullscreen)') > handler.indexOf('if (showSettings)'));
  assert.ok(handler.lastIndexOf('navigate(-1);') > handler.indexOf('if (document.fullscreenElement || isFullscreen)'));
  assert.match(handler, /event\.preventDefault\(\)/);
});

test('Android TV Home Back opens BlueNight exit confirmation with NON preferred', async () => {
  const browser = await text('src/screens/BrowserScreen.tsx');

  assert.match(browser, /const isTvHome = useMemo\(\(\) => \{/);
  assert.match(browser, /if \(isTvHome\) \{[\s\S]{0,200}setExitChoice\('no'\)[\s\S]{0,120}setExitConfirmVisible\(true\)/);
  assert.match(browser, /visible=\{!isPictureInPictureActive && isTV && exitConfirmVisible\}/);
  assert.match(browser, /Quitter Movix \?/);
  assert.match(browser, /setExitPreferredFocus\(true\)[\s\S]{0,120}setExitConfirmVisible\(true\)/);
  assert.match(browser, /hasTVPreferredFocus=\{isTV && exitPreferredFocus\}/);
  assert.match(browser, /nextFocusRight=\{findNodeHandle\(exitYesButtonRef\.current\) \?\? undefined\}/);
  assert.match(browser, /nextFocusLeft=\{findNodeHandle\(exitNoButtonRef\.current\) \?\? undefined\}/);
  assert.match(browser, /onFocus=\{\(\) => \{[\s\S]{0,120}setExitChoice\('no'\)[\s\S]{0,120}setExitPreferredFocus\(false\)/);
  assert.match(browser, /onFocus=\{\(\) => \{[\s\S]{0,120}setExitChoice\('yes'\)[\s\S]{0,120}setExitPreferredFocus\(false\)/);
  assert.match(browser, />NON<\/Text>/);
  assert.match(browser, />OUI<\/Text>/);
  assert.match(browser, /onPress=\{\(\) => BackHandler\.exitApp\(\)\}/);
});

test('Back while the TV exit confirmation is visible cancels instead of exiting', async () => {
  const browser = await text('src/screens/BrowserScreen.tsx');

  assert.match(browser, /if \(exitConfirmVisible\) \{[\s\S]{0,180}setExitConfirmVisible\(false\)[\s\S]{0,180}setExitChoice\('no'\)[\s\S]{0,180}setExitPreferredFocus\(false\)[\s\S]{0,120}return true/);
  assert.match(browser, /onRequestClose=\{\(\) => \{[\s\S]{0,180}setExitConfirmVisible\(false\)[\s\S]{0,120}setExitChoice\('no'\)[\s\S]{0,180}setExitPreferredFocus\(false\)/);
});
