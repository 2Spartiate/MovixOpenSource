import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceEffect, sourceFunction } from './helpers/sourceFunction.mjs';

for (const page of ['WatchMovie', 'WatchTv', 'WatchAnime']) {
  test(`${page} libère le défilement même si le document perd son body`, () => {
    const body = { style: { overflow: '', height: '' } };
    const document = { body: body as typeof body | null, documentElement: { style: { overflow: '', height: '' } } };
    const effect = sourceEffect(`src/pages/Watch/${page}.tsx`, "'100vh'", { document });
    const cleanup = effect();
    document.body = null;
    assert.doesNotThrow(cleanup);
    assert.equal(body.style.overflow, '');
  });
}

test('un portail attend un hôte disponible sans planter lorsque body disparaît', () => {
  const oldBody = {};
  const root = { parentElement: oldBody, contains: () => false, dataset: {} };
  const syncPlacement = sourceFunction('src/utils/overlayPortal.ts', 'syncPlacement', {
    root, resolveHost: () => null, document: { body: null },
  });
  assert.doesNotThrow(syncPlacement);
  assert.equal(root.parentElement, oldBody);
});

test('les callbacks Embla programmés sont annulés au démontage', () => {
  const frames = new Map<number, () => void>();
  let updates = 0;
  const effect = sourceEffect('src/components/EmblaCarousel.tsx', 'const updateArrows', {
    emblaApi: { canScrollPrev: () => true, canScrollNext: () => true, on() {}, off() {} },
    checkIfScrollable: () => true, setCanScrollPrev() { updates++; }, setCanScrollNext() { updates++; },
    requestAnimationFrame: (callback: () => void) => { frames.set(1, callback); return 1; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  });
  const cleanup = effect();
  const updatesBefore = updates;
  cleanup();
  frames.forEach(callback => callback());
  assert.equal(updates, updatesBefore);
});
