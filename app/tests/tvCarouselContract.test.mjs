import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('main Embla carousel exposes TV cards while retaining handheld arrow/favorite source controls', async () => {
  const source = await text('../src/components/EmblaCarousel.tsx');
  assert.match(source, /data-tv-focus-group="carousel-row"/);
  assert.match(source, /to=\{detailPath\}[\s\S]{0,140}data-tv-focus[\s\S]{0,100}data-tv-card/);
  assert.match(source, /data-tv-favorite-overlay/);
  assert.match(source, /const handleTVCardFocus = useCallback/);
  assert.match(source, /emblaApi\.scrollTo\(index/);
  assert.match(source, /data-tv-carousel-arrow/);
  assert.match(source, /<ChevronLeft/);
});

test('legacy ContentRow keeps TV cards and preserves source arrow buttons for handheld', async () => {
  const source = await text('../src/components/ContentRow.tsx');
  assert.match(source, /data-tv-focus-group="carousel-row"/);
  assert.match(source, /data-tv-card/);
  assert.match(source, /data-tv-carousel-arrow/);
  assert.match(source, /ChevronLeft|ChevronRight/);
});

for (const [name, path] of [
  ['genres', '../src/components/EmblaCarouselGenres.tsx'],
  ['platforms', '../src/components/EmblaCarouselPlatforms.tsx'],
]) {
  test(`${name} carousel follows focused TV cards while keeping handheld arrows in source`, async () => {
    const source = await text(path);
    assert.match(source, /data-tv-carousel-row/);
    assert.match(source, /data-tv-focus/);
    assert.match(source, /data-tv-card/);
    assert.match(source, /const handleTVFocus = useCallback/);
    assert.match(source, /emblaApi\.scrollTo\(index/);
    assert.match(source, /data-tv-carousel-arrow/);
    assert.match(source, /ChevronLeft/);
  });
}

test('search cards keep handheld favorite controls while exposing the card to TV', async () => {
  const source = await text('../src/components/SearchCard.tsx');
  assert.match(source, /data-tv-card/);
  assert.match(source, /data-tv-favorite-overlay/);
  assert.match(source, /watchlistCache/);
  assert.match(source, /addToWatchlist/);
});

test('TV bootstrap hides scrollbars and redundant TV chrome with MOVIX red focus', async () => {
  const source = await text('src/injection/tv-bootstrap.ts');
  assert.match(source, /scrollbar-width: none !important/);
  assert.match(source, /::-webkit-scrollbar/);
  assert.match(source, /outline: 3px solid #dc2626 !important/);
  assert.match(source, /\[data-tv-card\]:focus-visible/);
  assert.match(source, /outline-offset: -3px !important/);
  assert.match(source, /data-tv-carousel-arrow/);
  assert.match(source, /data-tv-favorite-overlay/);
  assert.match(source, /data-tv-header-telegram/);
  assert.match(source, /display: none !important/);
  assert.match(source, /--hero-duration: 10000ms !important/);
});

test('spatial runtime centers vertical focus and confines horizontal centering to the active carousel', async () => {
  const source = await text('src/injection/tv-dpad-runtime.ts');
  assert.match(source, /centerVerticalTarget/);
  assert.match(source, /centerCarouselTarget/);
  assert.match(source, /horizontalMove = direction === 'left' \|\| direction === 'right'/);
  assert.match(source, /closest\('\[data-tv-carousel-row\]'\)/);
  assert.match(source, /window\.innerHeight \/ 2/);
  assert.match(source, /window\.scrollTo\(\{ left: pageX, top: pageY, behavior: 'auto' \}\)/);
});

test('TV hero keeps handheld timing intact but advances animated slides every ten seconds', async () => {
  const source = await text('../src/components/HeroSlider.tsx');
  assert.match(source, /const AUTO_SLIDE_MS = 6000/);
  assert.match(source, /const TV_AUTO_SLIDE_MS = 10000/);
  assert.match(source, /\(window as any\)\.MOVIX_TV === true/);
  assert.match(source, /autoSlideMs = isTvRuntime \? TV_AUTO_SLIDE_MS : AUTO_SLIDE_MS/);
  assert.match(source, /scrollNext\(isTvRuntime \? false : !effectivePrefs\.transitions\)/);
  assert.match(source, /data-tv-hero-slider=\{isTvRuntime \? '' : undefined\}/);
  assert.match(source, /data-tv-hero-dot=\{isTvRuntime \? '' : undefined\}/);
});

test('live WebView TV override owns the ten-second hero cycle only under MOVIX_TV', async () => {
  const source = await text('src/injection/app-site-overrides.ts');
  assert.match(source, /const installTvHeroAutoplay = \(\) =>/);
  assert.match(source, /window\.MOVIX_TV !== true/);
  assert.match(source, /window\.__MOVIX_TV_HERO_AUTOPLAY/);
  assert.match(source, /lucide-pause/);
  assert.match(source, /button\[aria-current="true"\]/);
  assert.match(source, /schedule\(10000\)/);
});


test('TV disables Embla content-visibility skipping so offscreen cards keep focus geometry', async () => {
  const source = await text('src/injection/tv-bootstrap.ts');
  assert.match(source, /\.movix-tv \.embla-slide/);
  assert.match(source, /content-visibility: visible !important/);
});

test('TV Embla carousels center the focused slide without changing handheld align:start', async () => {
  for (const path of [
    '../src/components/EmblaCarousel.tsx',
    '../src/components/EmblaCarouselGenres.tsx',
    '../src/components/EmblaCarouselPlatforms.tsx',
  ]) {
    const source = await text(path);
    assert.match(source, /isTvRuntime = typeof window !== 'undefined'/);
    assert.match(source, /align: isTvRuntime \? 'center' : 'start'/);
    assert.match(source, /emblaApi\.scrollTo\(index/);
  }
});


test('hero source declares Play as the only TV entry while info and dots stay handheld-clickable', async () => {
  const source = await text('../src/components/HeroSlider.tsx');
  assert.match(source, /data-tv-primary-focus=\{isTvRuntime \? 'hero-play' : undefined\}/);
  assert.match(source, /data-tv-autofocus=\{isTvRuntime \? '' : undefined\}/);
  assert.match(source, /data-tv-ignore-focus=\{isTvRuntime \? '' : undefined\}/);
  assert.match(source, /tabIndex=\{isTvRuntime \? -1 : undefined\}/);
});


test('streaming platform carousel exposes explicit slides and maps TV focus into valid Embla snaps', async () => {
  const source = await text('../src/components/EmblaCarouselPlatforms.tsx');
  assert.match(source, /slides: '\.platform-slide'/);
  assert.match(source, /className="platform-slide flex-none"/);
  assert.match(source, /const snaps = emblaApi\.scrollSnapList\(\)/);
  assert.match(source, /const target = Math\.round\(\(index \/ maxCardIndex\) \* maxSnapIndex\)/);
  assert.match(source, /emblaApi\.scrollTo\(Math\.min\(maxSnapIndex, Math\.max\(0, target\)\), false\)/);
  assert.match(source, /requestAnimationFrame\(scrollFocusedPlatform\)/);
});


test('TV Home removes team suggestion and promotes recent shows below Tendances without changing phone order', async () => {
  const source = await text('../src/pages/Home.tsx');
  assert.match(source, /const isTvRuntime = typeof window !== 'undefined'/);
  assert.match(source, /recentShowsCategory/);
  assert.match(source, /category\.id === 'recent-tv'/);
  assert.match(source, /isTvRuntime && recentShowsCategory/);
  assert.match(source, /!isTvRuntime && \(/);
  assert.match(source, /bottomCategories\.map/);
});
