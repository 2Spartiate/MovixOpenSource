import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

function hlsTags(source) {
  return source.match(/<HLSPlayer[\s\S]*?\/>/g) || [];
}

test('all movie HLS players receive TMDB original_language', async () => {
  const source = await text('../src/pages/Watch/WatchMovie.tsx');
  const tags = hlsTags(source);

  assert.match(source, /setOriginalLanguage\(tmdbResponse\.data\.original_language \|\| ''\)/);
  assert.equal(tags.length, 16);
  for (const [index, tag] of tags.entries()) {
    assert.ok(tag.includes('originalLanguage={originalLanguage}'), `movie HLSPlayer #${index + 1}`);
  }
});

test('all TV HLS players receive TMDB original_language', async () => {
  const source = await text('../src/pages/Watch/WatchTv.tsx');
  const tags = hlsTags(source);

  assert.match(source, /setOriginalLanguage\(show\.original_language \|\| ''\)/);
  assert.equal(tags.length, 5);
  for (const [index, tag] of tags.entries()) {
    assert.ok(tag.includes('originalLanguage={originalLanguage}'), `TV HLSPlayer #${index + 1}`);
  }
});

test('V12 playback UX stays gated to the Movix TV runtime', async () => {
  const hls = await text('../src/components/HLSPlayer.tsx');

  assert.match(hls, /if \(!isMovixTvRuntime\(\) \|\| !controls \|\| onlyQualityMenu \|\| isWatchPartyGuest\) return/);
  assert.match(hls, /if \(!isMovixTvRuntime\(\) \|\| !controls \|\| onlyQualityMenu\) return/);
  assert.match(hls, /\{isMovixTvRuntime\(\) && !isCasting && showTvQuickMenu && \(/);
  assert.match(hls, /const tvRuntime = isMovixTvRuntime\(\)/);
});
