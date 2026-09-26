import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('HLS yields TV Arrow keys when an interactive control owns focus', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');
  const start = hls.indexOf('const handleKeyPress = (e: KeyboardEvent) => {');
  const end = hls.indexOf("document.addEventListener('keydown', handleKeyPress)", start);
  const handler = hls.slice(start, end);

  assert.match(handler, /const tvRuntime = isMovixTvRuntime\(\)/);
  assert.match(handler, /const tvArrowCode = e\.code\.startsWith\('Arrow'\)[\s\S]{0,120}key\.startsWith\('Arrow'\)/);
  assert.match(handler, /if \(tvMenuOpen \|\| isSourceMenuTarget\(keyboardTarget\)\) return/);
  assert.match(handler, /isPlayerControlInteractionTarget\(keyboardTarget\)[\s\S]{0,180}if \(focusedControl && !playIsFocused\) return/);
});

test('range inputs keep native arrows before the HLS shortcut switch', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');
  const handlerStart = hls.indexOf('const handleKeyPress = (e: KeyboardEvent) => {');
  const handlerEnd = hls.indexOf("document.addEventListener('keydown', handleKeyPress)", handlerStart);
  const handler = hls.slice(handlerStart, handlerEnd);
  const inputGuard = handler.indexOf('e.target instanceof HTMLInputElement');
  const arrowSwitch = handler.indexOf("case 'ArrowLeft':");

  assert.ok(handlerStart >= 0);
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
