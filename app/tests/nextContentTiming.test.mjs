import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function getTiming() {
  const src = await readFile(new URL('../../src/utils/nextContentPrefs.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports });
  return exports;
}

test('new default uses fixed seconds, not historical 95 percent', async () => {
  const p = await getTiming();
  assert.equal(p.DEFAULT_NEXT_CONTENT_PREFS.trigger, 'segment');
  assert.equal(p.DEFAULT_NEXT_CONTENT_PREFS.thresholdMode, 'timeBeforeEnd');
  assert.equal(p.DEFAULT_NEXT_CONTENT_PREFS.timeBeforeEnd, 60);
  assert.equal(p.defaultUpNextWindowSeconds(63 * 60), 60);
  assert.equal(p.defaultUpNextWindowSeconds(25 * 60), 30);
});

test('63-minute episode stays unobstructed at 3:10 and until 1 minute remains', async () => {
  const p = await getTiming();
  const prefs = p.DEFAULT_NEXT_CONTENT_PREFS;
  const duration = 63 * 60;
  assert.equal(p.resolveUpNextTrigger(prefs, duration - 190, duration, null, false, false), null);
  assert.equal(p.resolveUpNextTrigger(prefs, duration - 61, duration, null, false, false), null);
  assert.equal(p.resolveUpNextTrigger(prefs, duration - 60, duration, null, false, false), 'fallback');
});

test('premature outro at 3:10 is bounded to 60s even with a segment', async () => {
  const p = await getTiming();
  const prefs = p.DEFAULT_NEXT_CONTENT_PREFS;
  const d = 63 * 60;
  assert.equal(p.resolveUpNextTrigger(prefs, d - 190, d, d - 190, false, false), null);
  assert.equal(p.resolveUpNextTrigger(prefs, d - 60, d, d - 190, false, false), 'credits');
});

test('credible later credits start remains authoritative; short episodes cap at 30s', async () => {
  const p = await getTiming();
  const prefs = p.DEFAULT_NEXT_CONTENT_PREFS;
  const d = 25 * 60;
  assert.equal(p.resolveUpNextTrigger(prefs, d - 31, d, d - 45, false, false), null);
  assert.equal(p.resolveUpNextTrigger(prefs, d - 30, d, d - 45, false, false), 'credits');
  assert.equal(p.resolveUpNextTrigger(prefs, d - 20, d, d - 18, false, false), null);
  assert.equal(p.resolveUpNextTrigger(prefs, d - 18, d, d - 18, false, false), 'credits');
});

test('user-specified threshold 95% and long custom lead times remain respected', async () => {
  const p = await getTiming();
  const d = 63 * 60;
  const manualPercent = { ...p.DEFAULT_NEXT_CONTENT_PREFS, trigger: 'threshold', thresholdMode: 'percentage', percentage: 95 };
  assert.equal(p.resolveUpNextTrigger(manualPercent, d - 189, d, null, false, true), 'configured-threshold');
  const manualSeconds = { ...p.DEFAULT_NEXT_CONTENT_PREFS, trigger: 'threshold', thresholdMode: 'timeBeforeEnd', timeBeforeEnd: 120 };
  assert.equal(p.resolveUpNextTrigger(manualSeconds, d - 120, d, null, false, true), 'configured-threshold');
  const savedFallback = { ...manualPercent, trigger: 'segment' };
  assert.equal(p.resolveUpNextTrigger(savedFallback, d - 189, d, null, false, true), 'fallback');
});

test('pending external credits lookup does not race with fallback', async () => {
  const p = await getTiming();
  const d = 63 * 60;
  assert.equal(p.resolveUpNextTrigger(p.DEFAULT_NEXT_CONTENT_PREFS, d - 40, d, null, true, false), null);
});

test('strongest credits match takes priority over earlier outro', async () => {
  const p = await getTiming();
  assert.equal(p.bestCreditsStart([
    { type: 'outro', start: 3400, agreement: 1 },
    { type: 'credits', start: 3720, agreement: 0.8, sourceCount: 3 },
    { type: 'credits', start: 3500, agreement: 0.3, sourceCount: 1 },
  ]), 3720);
  assert.equal(p.bestCreditsStart([{ type: 'outro', start: 3620 }]), 3620);
  assert.equal(p.bestCreditsStart([{ type: 'intro', start: 20 }]), null);
});
