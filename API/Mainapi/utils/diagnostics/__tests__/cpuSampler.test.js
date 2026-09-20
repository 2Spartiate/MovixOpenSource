const assert = require('node:assert/strict');
const test = require('node:test');
const { createCpuSampler } = require('../cpuSampler');

function fakeTimers() {
  const timers = new Map(); let id = 0;
  return {
    setTimeout(fn) { const value = ++id; timers.set(value, fn); return { value, unref() {} }; },
    clearTimeout(timer) { timers.delete(timer.value); },
    runOne() { const [key, fn] = timers.entries().next().value || []; if (key) { timers.delete(key); fn(); } },
    runLast() { const entries = [...timers.entries()]; const [key, fn] = entries[entries.length - 1] || []; if (key) { timers.delete(key); fn(); } },
    size: () => timers.size,
  };
}

test('agrège exclusivement les feuilles et borne les fonctions', async () => {
  const timers = fakeTimers();
  let disconnected = 0;
  const sampler = createCpuSampler({ timers, profileMs: 5, intervalMs: 60, rootDir: '/app', sessionFactory: () => ({
    connect() {}, disconnect() { disconnected += 1; },
    post(method, _params, callback) {
      if (method === 'Profiler.stop') callback(null, { profile: { nodes: [{ id: 1, callFrame: { functionName: 'work', url: 'file:///app/lib/a.js', lineNumber: 4 } }], samples: [1, 1], timeDeltas: [1000, 2000] } });
      else callback(null, {});
    },
  }) });
  sampler.start(); timers.runOne(); await new Promise((resolve) => setImmediate(resolve)); timers.runLast(); await new Promise((resolve) => setImmediate(resolve));
  const report = await sampler.stop();
  assert.equal(report.windows, 1);
  assert.equal(report.sampledDurationMs, 3);
  assert.deepEqual(report.functions, [{ name: 'work', file: 'lib/a.js', line: 5, samples: 2, estimatedCpuMs: 3 }]);
  assert.equal(disconnected, 1);
  assert.equal(timers.size(), 0);
});

test('les défaillances de profiler restent locales et stop est idempotent', async () => {
  const timers = fakeTimers();
  const sampler = createCpuSampler({ timers, sessionFactory: () => ({ connect() { throw new Error('no inspector'); }, disconnect() {}, post() {} }) });
  assert.equal(sampler.snapshot().active, false);
  sampler.start(); timers.runOne(); await new Promise((resolve) => setImmediate(resolve));
  const first = await sampler.stop();
  const second = await sampler.stop();
  assert.equal(first.active, false);
  assert.equal(second.active, false);
  assert.ok(first.errors >= 1);
  assert.equal(timers.size(), 0);
});

test('stop reste borné pendant Profiler.enable et empêche le démarrage tardif', async () => {
  const timers = fakeTimers();
  let enableCallback;
  let starts = 0;
  let disconnected = 0;
  const sampler = createCpuSampler({ timers, sessionFactory: () => ({
    connect() {}, disconnect() { disconnected += 1; },
    post(method, _params, callback) {
      if (method === 'Profiler.enable') { enableCallback = callback; return; }
      if (method === 'Profiler.start') starts += 1;
      callback(null, {});
    },
  }) });
  sampler.start();
  timers.runOne();
  await new Promise((resolve) => setImmediate(resolve));
  const report = await sampler.stop();
  assert.equal(report.active, false);
  assert.equal(disconnected, 1);
  enableCallback(null, {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(starts, 0);
  assert.equal(timers.size(), 0);
});

test('une très courte fenêtre inspector locale se termine sans port de débogage', async () => {
  const sampler = createCpuSampler({ profileMs: 5, intervalMs: 60000, samplingIntervalUs: 1000 });
  sampler.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const report = await sampler.stop();
  assert.equal(report.active, false);
  assert.ok(report.windows <= 1);
  assert.ok(Number.isFinite(report.sampledDurationMs));
});
