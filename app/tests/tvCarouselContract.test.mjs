import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('Embla carousel exposes cards as primary TV targets', async () => {
  const source = await text('../src/components/EmblaCarousel.tsx');
  assert.match(source, /data-tv-focus-group="carousel-row"/);
  assert.match(source, /to=\{detailPath\}[\s\S]{0,140}data-tv-focus[\s\S]{0,100}data-tv-card/);
  assert.match(source, /data-tv-ignore-focus[\s\S]{0,100}data-tv-favorite-overlay/);
  assert.match(source, /data-tv-ignore-focus[\s\S]{0,100}data-tv-carousel-arrow/);
});

test('legacy ContentRow keeps arrows outside TV focus and cards inside it', async () => {
  const source = await text('../src/components/ContentRow.tsx');
  assert.match(source, /data-tv-focus-group="carousel-row"/);
  assert.match(source, /data-tv-carousel-arrow/);
  assert.match(source, /data-tv-card/);
});

test('search cards make the card primary and favorites secondary on TV', async () => {
  const source = await text('../src/components/SearchCard.tsx');
  assert.match(source, /data-tv-card/);
  assert.match(source, /data-tv-favorite-overlay/);
});

test('TV-only bootstrap hides redundant carousel arrows and favorite overlays', async () => {
  const source = await text('src/injection/tv-bootstrap.ts');
  assert.match(source, /\.movix-tv \[data-tv-carousel-arrow\]/);
  assert.match(source, /\.movix-tv \[data-tv-favorite-overlay\]/);
  assert.match(source, /display: none !important/);
});


test('Embla follows focused TV cards through its own scroll API', async () => {
  const source = await text('../src/components/EmblaCarousel.tsx');
  assert.match(source, /onFocus=\{\(\) => onTVFocus\?\.\(index\)\}/);
  assert.match(source, /const handleTVCardFocus = useCallback/);
  assert.match(source, /MOVIX_TV/);
  assert.match(source, /emblaApi\.scrollTo\(index/);
  assert.match(source, /onTVFocus=\{handleTVCardFocus\}/);
});

test('spatial runtime centers horizontal carousel targets', async () => {
  const source = await text('src/injection/tv-dpad-runtime.ts');
  assert.match(source, /horizontalMove = direction === 'left' \|\| direction === 'right'/);
  assert.match(source, /closest\('\[data-tv-carousel-row\]'\)/);
  assert.match(source, /inline: horizontalMove && carouselRow \? 'center' : 'nearest'/);
});
