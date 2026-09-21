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

test('HLS quality helpers can select 2160p and step down 2160 -> 1080 -> 720', async () => {
  const { selectLevelForPreference, selectLowerLevelIndex } =
    await importTypeScript('../src/utils/hlsQuality.ts');

  const options = [
    { index: 3, height: 2160, width: 3840, bitrate: 16000000, label: '2160p' },
    { index: 2, height: 1080, width: 1920, bitrate: 8000000, label: '1080p' },
    { index: 1, height: 720, width: 1280, bitrate: 4000000, label: '720p' },
  ];

  assert.equal(selectLevelForPreference(options, 'auto', Number.POSITIVE_INFINITY), 3);
  assert.equal(selectLowerLevelIndex(options, 3), 2);
  assert.equal(selectLowerLevelIndex(options, 2), 1);
});

test('TV HLS defaults to uncapped Auto while non-TV retains the 1080 cap', async () => {
  const player = await text('../src/components/HLSPlayer.tsx');

  assert.match(
    player,
    /function getDefaultHlsQualityPreference\(\): HlsQualityPreference \{\s*return isMovixTvRuntime\(\) \? 'auto' : 1080;\s*\}/,
  );
  assert.match(
    player,
    /function getHlsAutoMaxHeight\(\): number \{\s*return isMovixTvRuntime\(\) \? Number\.POSITIVE_INFINITY : 1080;\s*\}/,
  );
  assert.match(
    player,
    /selectLevelForPreference\(qualitiesRef\.current, preference, getHlsAutoMaxHeight\(\)\)/,
  );
  assert.match(
    player,
    /selectLevelForPreference\(nextOptions, requested, getHlsAutoMaxHeight\(\)\)/,
  );
  assert.match(
    player,
    /const lowerLevel = selectLowerLevelIndex\(qualitiesRef\.current, failedLevel\);/,
  );
  assert.match(player, /failedHeight > 720/);
  assert.match(player, /lowerHeight >= 720/);
});
