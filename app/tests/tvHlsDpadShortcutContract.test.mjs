import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('HLS yields TV Arrow keys when an interactive control owns focus', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');

  assert.match(
    hls,
    /isMovixTvRuntime\(\)[\s\S]{0,160}e\.code\.startsWith\('Arrow'\)[\s\S]{0,160}isPlayerControlInteractionTarget\(keyboardTarget\)[\s\S]{0,80}return;/,
  );
});

test('range inputs keep native arrows before the HLS shortcut switch', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');
  const inputGuard = hls.indexOf('e.target instanceof HTMLInputElement');
  const arrowSwitch = hls.indexOf("case 'ArrowLeft':");

  assert.ok(inputGuard >= 0);
  assert.ok(arrowSwitch > inputGuard);
  assert.match(hls, /<input\s+[\s\S]{0,120}type="range"/);
});

test('desktop and non-arrow HLS shortcuts remain present', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');

  for (const shortcut of [
    "case ' ':",
    "case 'k':",
    "case 'j':",
    "case 'l':",
    "case 'm':",
    "case 'f':",
    "case 'p':",
    "case 'c':",
    "case 'Home':",
    "case 'End':",
  ]) {
    assert.ok(hls.includes(shortcut), `missing historical shortcut ${shortcut}`);
  }

  assert.match(hls, /case 'ArrowLeft':[\s\S]{0,100}skipTime\(-10\)/);
  assert.match(hls, /case 'ArrowRight':[\s\S]{0,100}skipTime\(10\)/);
  assert.match(hls, /case 'ArrowUp':[\s\S]{0,220}video\.volume/);
  assert.match(hls, /case 'ArrowDown':[\s\S]{0,220}video\.volume/);
});
