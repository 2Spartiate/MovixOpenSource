import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

async function importTypeScript(relativePath) {
  const source = await text(relativePath);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

test('player controls focus detection only owns descendants of data-player-controls', async () => {
  const { isPlayerControlsFocusTarget } = await importTypeScript(
    '../src/utils/playerControlInteraction.ts',
  );

  const control = {
    closest: selector => selector === '[data-player-controls]' ? { dataset: {} } : null,
  };
  const outside = { closest: () => null };

  assert.equal(isPlayerControlsFocusTarget(control), true);
  assert.equal(isPlayerControlsFocusTarget(outside), false);
  assert.equal(isPlayerControlsFocusTarget(null), false);
});

test('HLS focus entering controls cancels auto-hide and leaving rearms it', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');

  assert.match(hls, /const handlePlayerControlsFocusCapture[\s\S]{0,420}setShowControls\(true\)[\s\S]{0,260}clearTimeout\(controlsTimeoutRef\.current\)/);
  assert.match(hls, /const handlePlayerControlsBlurCapture[\s\S]{0,900}setTimeout\([\s\S]{0,320}playerControlsContainFocus\(\)/);
  assert.match(hls, /onFocusCapture=\{handlePlayerControlsFocusCapture\}/);
  assert.match(hls, /onBlurCapture=\{handlePlayerControlsBlurCapture\}/);
});

test('HLS auto-hide callbacks refuse to hide a focused control', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');

  const guardedTimeouts = hls.match(/setTimeout\(\(\) => \{[\s\S]{0,420}?playerControlsContainFocus\(\)[\s\S]{0,320}?setShowControls\(false\)/g) || [];
  assert.ok(guardedTimeouts.length >= 4, `expected guarded auto-hide timers, got ${guardedTimeouts.length}`);
  assert.match(hls, /onMouseLeave=\{\(\) => \{[\s\S]{0,180}!playerControlsContainFocus\(\)/);
});

test('HLS clears the controls timeout on unmount', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');
  assert.match(
    hls,
    /useEffect\(\(\) => \(\) => \{[\s\S]{0,260}clearTimeout\(controlsTimeoutRef\.current\)[\s\S]{0,160}controlsTimeoutRef\.current = undefined/,
  );
});
