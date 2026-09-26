import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const root = new URL('../', import.meta.url);

async function loadPolicy() {
  const source = await readFile(new URL('../src/utils/tvPlaybackPolicy.ts', root), 'utf8');
  const { outputText, diagnostics } = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  assert.equal((diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const candidate = (overrides = {}) => ({
  provider: 'bravo',
  sourceType: 'bravo',
  url: 'https://example.invalid/stream.m3u8',
  label: 'Bravo MULTI',
  index: 0,
  maxHeight: 1080,
  audioLanguages: [],
  subtitleLanguages: [],
  burnedFrenchSubtitles: false,
  likelyMulti: false,
  ...overrides,
});

test('VOSTFR accepts Nexus only when it is explicitly identified as burned-in FR subtitles', async () => {
  const { chooseTvPlaybackCandidate } = await loadPolicy();
  const nexus = candidate({
    provider: 'nexus',
    sourceType: 'nexus_hls',
    label: 'Nexus VOSTFR',
    maxHeight: 720,
    burnedFrenchSubtitles: true,
  });
  assert.equal(chooseTvPlaybackCandidate([nexus], 'vo-fr', 'ja').candidate?.url, nexus.url);
});

test('VOSTFR chooses the best quality only among sources with real original audio plus FR subtitles', async () => {
  const { chooseTvPlaybackCandidate } = await loadPolicy();
  const nexus = candidate({
    provider: 'nexus',
    sourceType: 'nexus_hls',
    url: 'https://example.invalid/nexus.m3u8',
    label: 'Nexus VOSTFR',
    maxHeight: 720,
    burnedFrenchSubtitles: true,
  });
  const bravo = candidate({
    url: 'https://example.invalid/bravo.m3u8',
    maxHeight: 1080,
    audioLanguages: ['jpn'],
    subtitleLanguages: ['fra'],
    likelyMulti: true,
  });
  assert.equal(chooseTvPlaybackCandidate([nexus, bravo], 'vo-fr', 'ja').candidate?.url, bravo.url);
});

test('VF rejects Nexus VOSTFR and MULTI labels without a proven French audio rendition', async () => {
  const { chooseTvPlaybackCandidate } = await loadPolicy();
  const nexus = candidate({
    provider: 'nexus',
    sourceType: 'nexus_hls',
    url: 'https://example.invalid/nexus-4k.m3u8',
    maxHeight: 2160,
    burnedFrenchSubtitles: true,
  });
  const fakeMulti = candidate({
    url: 'https://example.invalid/multi-4k.m3u8',
    maxHeight: 2160,
    likelyMulti: true,
    audioLanguages: ['eng'],
  });
  const french = candidate({
    url: 'https://example.invalid/french-720.m3u8',
    maxHeight: 720,
    audioLanguages: ['fra'],
  });
  assert.equal(chooseTvPlaybackCandidate([nexus, fakeMulti, french], 'vf', 'en').candidate?.url, french.url);
});

test('original_language gates compatibility before resolution', async () => {
  const { chooseTvPlaybackCandidate } = await loadPolicy();
  const wrong4k = candidate({
    url: 'https://example.invalid/wrong-4k.m3u8',
    maxHeight: 2160,
    audioLanguages: ['eng'],
    subtitleLanguages: ['fr'],
  });
  const original720 = candidate({
    url: 'https://example.invalid/original-720.m3u8',
    maxHeight: 720,
    audioLanguages: ['jpn'],
    subtitleLanguages: ['fr'],
  });
  assert.equal(chooseTvPlaybackCandidate([wrong4k, original720], 'vo-fr', 'ja').candidate?.url, original720.url);
});

test('French-original content can use its natural French original audio without fabricated subtitle requirements', async () => {
  const { chooseTvPlaybackCandidate } = await loadPolicy();
  const frenchOriginal = candidate({
    url: 'https://example.invalid/fr-original.m3u8',
    audioLanguages: ['fra'],
    subtitleLanguages: [],
  });
  assert.equal(chooseTvPlaybackCandidate([frenchOriginal], 'vo-fr', 'fr').candidate?.url, frenchOriginal.url);
});

test('no compatible candidate returns null and leaves fallback decisions to the caller', async () => {
  const { chooseTvPlaybackCandidate } = await loadPolicy();
  const incompatible = candidate({
    likelyMulti: true,
    audioLanguages: [],
    subtitleLanguages: [],
  });
  const result = chooseTvPlaybackCandidate([incompatible], 'vf', 'en');
  assert.equal(result.candidate, null);
  assert.equal(result.reason, 'no-compatible-source');
});

test('automatic source-change origins never create a manual override', async () => {
  const { isAutomaticTvSourceChangeOrigin } = await loadPolicy();
  for (const origin of ['tv-profile-auto', 'auto-fallback', 'dns-auto-fallback']) {
    assert.equal(isAutomaticTvSourceChangeOrigin(origin), true, origin);
  }
  for (const origin of ['', 'manual', 'source-menu']) {
    assert.equal(isAutomaticTvSourceChangeOrigin(origin), false, origin);
  }
});
