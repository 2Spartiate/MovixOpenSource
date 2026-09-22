import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('main Embla carousel exposes focus-driven cards with no arrow chrome', async () => {
  const source = await text('../src/components/EmblaCarousel.tsx');
  assert.match(source, /data-tv-focus-group="carousel-row"/);
  assert.match(source, /to=\{detailPath\}[\s\S]{0,140}data-tv-focus[\s\S]{0,100}data-tv-card/);
  assert.doesNotMatch(source, /data-tv-favorite-overlay/);
  assert.match(source, /const handleTVCardFocus = useCallback/);
  assert.match(source, /emblaApi\.scrollTo\(index/);
  assert.doesNotMatch(source, /data-tv-carousel-arrow|<ChevronLeft/);
});

test('legacy ContentRow keeps cards in the TV graph and removes arrow buttons', async () => {
  const source = await text('../src/components/ContentRow.tsx');
  assert.match(source, /data-tv-focus-group="carousel-row"/);
  assert.match(source, /data-tv-card/);
  assert.doesNotMatch(source, /data-tv-carousel-arrow|ChevronLeft|ChevronRight/);
});

for (const [name, path] of [
  ['genres', '../src/components/EmblaCarouselGenres.tsx'],
  ['platforms', '../src/components/EmblaCarouselPlatforms.tsx'],
]) {
  test(`${name} carousel follows focused cards without arrow chrome`, async () => {
    const source = await text(path);
    assert.match(source, /data-tv-carousel-row/);
    assert.match(source, /data-tv-focus/);
    assert.match(source, /data-tv-card/);
    assert.match(source, /const handleTVFocus = useCallback/);
    assert.match(source, /emblaApi\.scrollTo\(index/);
    assert.doesNotMatch(source, /data-tv-carousel-arrow|ChevronLeft/);
  });
}

test('search cards expose the card itself and no longer render favorite controls', async () => {
  const source = await text('../src/components/SearchCard.tsx');
  assert.match(source, /data-tv-card/);
  assert.doesNotMatch(source, /data-tv-favorite-overlay|watchlistCache|addToWatchlist/);
});

test('TV bootstrap only hides the remaining favorite overlay chrome', async () => {
  const source = await text('src/injection/tv-bootstrap.ts');
  assert.match(source, /\.movix-tv \[data-tv-favorite-overlay\]/);
  assert.match(source, /display: none !important/);
  assert.doesNotMatch(source, /data-tv-carousel-arrow|data-tv-header-telegram/);
});

test('spatial runtime centers horizontal carousel targets', async () => {
  const source = await text('src/injection/tv-dpad-runtime.ts');
  assert.match(source, /horizontalMove = direction === 'left' \|\| direction === 'right'/);
  assert.match(source, /closest\('\[data-tv-carousel-row\]'\)/);
  assert.match(source, /inline: horizontalMove && carouselRow \? 'center' : 'nearest'/);
});
