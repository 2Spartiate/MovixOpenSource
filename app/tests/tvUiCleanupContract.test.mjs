import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('native app injects live-site cleanup because the WebView loads remote Movix', async () => {
  const [inject, overrides] = await Promise.all([
    text('src/injection/inject.ts'),
    text('src/injection/app-site-overrides.ts'),
  ]);

  assert.match(inject, /buildAppSiteOverrides/);
  assert.match(inject, /\$\{appSiteOverrides\}/);

  assert.match(overrides, /t\.me\/movix_site/);
  assert.match(overrides, /rejoignez notre communaute/);
  assert.match(overrides, /makeMovixBrandInert/);
  assert.match(overrides, /data-movix-brand-inert/);
  assert.match(overrides, /document\.querySelectorAll\('footer'\)/);
  assert.match(overrides, /removeCarouselArrows/);
  assert.match(overrides, /lucide-chevron-left/);
  assert.match(overrides, /markCarouselCards/);
  assert.match(overrides, /data-tv-carousel-row/);
  assert.match(overrides, /data-tv-card/);
  assert.match(overrides, /new MutationObserver\(scheduleApply\)/);
});

test('TV kills remote Lenis so D-pad owns navigation instead of smooth page scrolling', async () => {
  const overrides = await text('src/injection/app-site-overrides.ts');

  assert.match(overrides, /window\.MOVIX_TV !== true/);
  assert.match(overrides, /lenis\.destroy/);
  assert.match(overrides, /delete window\.lenis/);
  assert.match(overrides, /scrollBehavior = 'auto'/);
});

test('post-ad thank-you dialog is automatically advanced to playback in the app', async () => {
  const overrides = await text('src/injection/app-site-overrides.ts');

  assert.match(overrides, /merci pour ton aide/);
  assert.match(overrides, /thanks for your help/);
  assert.match(overrides, /label === 'lecture'/);
  assert.match(overrides, /button\.dataset\.movixAutoContinue/);
  assert.match(overrides, /requestAnimationFrame\(\(\) => button\.click\(\)\)/);
});

test('source frontend also carries the cleanup for any future web deployment', async () => {
  const [home, app, smooth, ads] = await Promise.all([
    text('../src/pages/Home.tsx'),
    text('../src/App.tsx'),
    text('../src/components/SmoothScroll.tsx'),
    text('../src/components/AdFreePlayerAds.tsx'),
  ]);

  assert.doesNotMatch(home, /TelegramPromotion/);
  assert.doesNotMatch(app, /import Footer|<Footer\s*\/?>/);
  assert.match(smooth, /MOVIX_TV === true/);
  assert.match(ads, /const completeAfterAdClick = useCallback/);
});
