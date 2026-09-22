import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('site chrome cleanup removes Telegram promotion and footer globally', async () => {
  const [home, app] = await Promise.all([
    text('../src/pages/Home.tsx'),
    text('../src/App.tsx'),
  ]);

  assert.doesNotMatch(home, /TelegramPromotion/);
  assert.doesNotMatch(app, /import Footer|<Footer\s*\/?>/);
});

test('TV disables Lenis so D-pad replaces page scrolling', async () => {
  const smooth = await text('../src/components/SmoothScroll.tsx');
  assert.match(smooth, /MOVIX_TV\?: boolean/);
  assert.match(smooth, /MOVIX_TV === true/);
  assert.match(smooth, /userEnabled && !isTvRuntime && !reducedMotion/);
});

test('player ad click goes directly to playback without the thank-you step', async () => {
  const ads = await text('../src/components/AdFreePlayerAds.tsx');
  const completion = ads.match(
    /const completeAfterAdClick = useCallback\(\(\) => \{([\s\S]{0,700}?)\n\s*\}, \[[^\]]+\]\);/,
  )?.[1] || '';

  assert.match(completion, /if \(variant === "player"\)/);
  assert.match(completion, /finalOnAccept\(\)/);
  assert.match(completion, /return;/);
  assert.match(completion, /revealUnlockedState\(\)/);
  assert.match(ads, /openAdLinks\(\);\s*completeAfterAdClick\(\);/);
});
