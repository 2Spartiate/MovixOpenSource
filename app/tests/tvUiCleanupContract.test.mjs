import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('native app layers TV cleanup onto the clean shared WebView policy', async () => {
  const [inject, overrides] = await Promise.all([
    text('src/injection/inject.ts'),
    text('src/injection/app-site-overrides.ts'),
  ]);

  assert.match(inject, /buildAppSiteOverrides/);
  assert.match(inject, /\$\{appSiteOverrides\}/);

  assert.match(overrides, /makeMovixBrandInert/);
  assert.match(overrides, /data-movix-brand-inert/);
  assert.match(overrides, /document\.querySelectorAll\('footer'\)/);
  assert.match(overrides, /removeCarouselArrows/);
  assert.match(overrides, /lucide-chevron-left/);
  assert.match(overrides, /markPosterCards/);
  assert.match(overrides, /data-tv-carousel-row/);
  assert.match(overrides, /DETAIL_PATH/);
  assert.match(overrides, /looksLikePosterCardLink/);
  assert.match(overrides, /data-tv-card-link/);
  assert.match(overrides, /data-tv-focus-id/);
  assert.match(overrides, /'media:' \+ path/);
  assert.match(overrides, /removeFavoriteControls/);
  assert.match(overrides, /lucide-star/);
  assert.match(overrides, /new MutationObserver\(scheduleApply\)/);
});

test('TV-only product cleanup functions are inert on handheld WebViews', async () => {
  const overrides = await text('src/injection/app-site-overrides.ts');

  for (const name of [
    'markPosterCards',
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

test('TV route changes prefer media content and disable browser-like smooth scrolling', async () => {
  const overrides = await text('src/injection/app-site-overrides.ts');

  assert.match(overrides, /patchHistory/);
  assert.match(overrides, /history\[methodName\]/);
  assert.match(overrides, /preferContentAfterNavigation = true/);
  assert.match(overrides, /navigationInProgressUntil = performance\.now\(\) \+ 5000/);
  assert.doesNotMatch(overrides, /markTvRouteTransition[\s\S]{0,700}window\.scrollTo/);
  assert.match(overrides, /lenis\.destroy/);
  assert.match(overrides, /delete window\.lenis/);
  assert.match(overrides, /scrollBehavior = 'auto'/);
});

test('clean common playback gate remains active without importing roadmap ad-state rewrites', async () => {
  const overrides = await text('src/injection/app-site-overrides.ts');

  assert.match(overrides, /const advancePlaybackGate = \(\) =>/);
  assert.match(overrides, /data-ad-view-button/);
  assert.match(overrides, /queueMicrotask\(\(\) => viewAdButton\.click\(\)\)/);
  assert.match(overrides, /queueMicrotask\(\(\) => playButton\.click\(\)\)/);
  assert.doesNotMatch(overrides, /completeAfterAdClick/);
});

test('phone source chrome is retained while TV behavior is runtime-conditioned', async () => {
  const [home, app, smooth, carousel, searchCard, browser] = await Promise.all([
    text('../src/pages/Home.tsx'),
    text('../src/App.tsx'),
    text('../src/components/SmoothScroll.tsx'),
    text('../src/components/EmblaCarousel.tsx'),
    text('../src/components/SearchCard.tsx'),
    text('src/screens/BrowserScreen.tsx'),
  ]);

  assert.match(home, /TelegramPromotion/);
  assert.match(app, /import Footer|<Footer\s*\/?>/);
  assert.match(smooth, /MOVIX_TV === true/);
  assert.match(carousel, /data-tv-favorite-overlay/);
  assert.match(searchCard, /data-tv-favorite-overlay/);
  assert.match(browser, /!isPictureInPictureActive && !isTV && !toolbarHidden/);
});


test('injected cleanup never detaches children from the remote React tree', async () => {
  const overrides = await text('src/injection/app-site-overrides.ts');

  assert.match(overrides, /const hideManagedNode = \(element\) =>/);
  assert.match(overrides, /style\.setProperty\('display', 'none', 'important'\)/);
  assert.doesNotMatch(overrides, /\.(?:remove|replaceChildren)\(/);
});


test('TV posters keep the real React Router links focusable and never use proxy activation', async () => {
  const overrides = await text('src/injection/app-site-overrides.ts');

  assert.match(overrides, /link\.setAttribute\('data-tv-focus', ''\)/);
  assert.match(overrides, /link\.setAttribute\('data-tv-card', ''\)/);
  assert.match(overrides, /link\.setAttribute\('tabindex', '0'\)/);
  assert.match(overrides, /link\.removeAttribute\('data-tv-ignore-focus'\)/);
  assert.doesNotMatch(overrides, /data-tv-card-proxy/);
  assert.doesNotMatch(overrides, /__MOVIX_APP_CARD_ACTIVATION_READY/);
});


test('TV hero exposes only Play and makes async dots user-inert without breaking autoplay', async () => {
  const overrides = await text('src/injection/app-site-overrides.ts');
  assert.match(overrides, /const getTvHeroRoot = \(\) =>/);
  assert.match(overrides, /button\[aria-current="true"\]/);
  assert.match(overrides, /const getTvHeroDots = \(root\) =>/);
  assert.match(overrides, /data-tv-primary-focus', 'hero-play'/);
  assert.match(overrides, /data-tv-hero-user-inert/);
  assert.match(overrides, /pointer-events', 'none', 'important'/);
  assert.match(overrides, /event\.isTrusted !== true/);
  assert.match(overrides, /const getDots = \(\) => getTvHeroDots\(root\)/);
});

test('TV header is pointer-locked by default while explicit shortcut scopes can be restored', async () => {
  const overrides = await text('src/injection/app-site-overrides.ts');
  assert.match(overrides, /const markTvHeaderShortcutTargets = \(\) =>/);
  assert.match(overrides, /data-tv-header-shortcut', 'search'/);
  assert.match(overrides, /data-tv-header-shortcut', 'explore'/);
  assert.match(overrides, /data-tv-header-shortcut', 'account'/);
  assert.match(overrides, /const lockTvHeaderPointerNavigation = \(\) =>/);
  assert.match(overrides, /header\.style\.setProperty\('pointer-events', 'none', 'important'\)/);
  assert.match(overrides, /element\.style\.setProperty\('pointer-events', 'none', 'important'\)/);
  assert.match(overrides, /data-tv-header-active-scope/);
  assert.match(overrides, /const restoreTvHeaderInteractive = \(element\) =>/);
  assert.doesNotMatch(overrides, /syncTvHeaderFocusGate|__MOVIX_TV_HEADER_GATE_READY/);
});


test('TV cleanup preserves hidden carousel arrows as callable left/right Embla controls', async () => {
  const overrides = await text('src/injection/app-site-overrides.ts');
  assert.match(overrides, /data-tv-carousel-arrow-direction', 'left'/);
  assert.match(overrides, /data-tv-carousel-arrow-direction', 'right'/);
  assert.match(overrides, /button\.setAttribute\('data-tv-carousel-arrow', ''\)/);
  assert.match(overrides, /hideManagedNode\(button\)/);
});

test('async TV DOM observer re-applies policy on hero state and React href restoration', async () => {
  const overrides = await text('src/injection/app-site-overrides.ts');
  assert.match(overrides, /attributes: true/);
  assert.match(overrides, /attributeFilter: \['aria-current', 'href'\]/);
  assert.match(overrides, /new MutationObserver\(scheduleApply\)/);
});

test('TV Home promotes the recent-series row before its lazy title exists without detaching React nodes', async () => {
  const overrides = await text('src/injection/app-site-overrides.ts');
  assert.match(overrides, /const ensureTvHomeLayout = \(\) =>/);
  assert.match(overrides, /hasLegacyFeaturedSlot/);
  assert.match(overrides, /homeSections\[4\] : homeSections\[2\]/);
  assert.match(overrides, /data-tv-home-recent-shows/);
  assert.match(overrides, /flex-direction', 'column'/);
  assert.match(overrides, /recent\.style\.setProperty\('order'/);
  assert.match(overrides, /notre suggestion/);
  const withoutSafeHeadStyleInstall = overrides.replace(
    "document.head.appendChild(style);",
    '',
  );
  assert.doesNotMatch(withoutSafeHeadStyleInstall, /insertBefore|appendChild/);
});

test('TV header exposes subtle left-aligned neon 1 2 3 shortcut rings without touching handheld markup', async () => {
  const overrides = await text('src/injection/app-site-overrides.ts');

  assert.match(overrides, /const installTvShortcutBadgeStyle = \(\) =>/);
  assert.match(overrides, /movix-tv-shortcut-badges/);
  assert.match(overrides, /data-tv-shortcut-badge/);
  assert.match(overrides, /margin-left:18px/);
  assert.match(overrides, /left:-24px/);
  assert.match(overrides, /top:50%/);
  assert.match(overrides, /width:15px/);
  assert.match(overrides, /height:15px/);
  assert.match(overrides, /background:transparent/);
  assert.match(overrides, /border:1px solid rgba\(248,113,113,\.88\)/);
  assert.match(overrides, /box-shadow:0 0 5px rgba\(239,68,68,\.52\)/);
  assert.match(overrides, /color:rgba\(248,113,113,\.96\)/);
  assert.match(overrides, /opacity:\.82/);
  assert.match(overrides, /markTvShortcutBadge\(search, '1'\)/);
  assert.match(overrides, /markTvShortcutBadge\(account, '2'\)/);
  assert.match(overrides, /markTvShortcutBadge\(explore, '3'\)/);
  assert.match(overrides, /form\.parentElement instanceof HTMLElement/);
  assert.match(overrides, /if \(window\.MOVIX_TV !== true\) return/);
});

test('TV hero focus policy applies to category routes as well as Home', async () => {
  const overrides = await text('src/injection/app-site-overrides.ts');
  const start = overrides.indexOf('const markTvHeroFocusPolicy = () =>');
  const end = overrides.indexOf('const installTvShortcutBadgeStyle = () =>', start);
  const policy = overrides.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(policy, /const root = getTvHeroRoot\(\)/);
  assert.match(policy, /data-tv-hero-user-inert/);
  assert.match(policy, /pointer-events', 'none', 'important'/);
  assert.doesNotMatch(policy, /window\.location\.pathname/);
});
