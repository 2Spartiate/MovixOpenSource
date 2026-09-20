'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../server.js'), 'utf8');
const start = source.indexOf('let isWorkerShuttingDown = false;');
const end = source.indexOf("process.on('SIGTERM', shutdownWorker);", start);
assert.ok(start > 0 && end > start);
const flush = () => new Promise((resolve) => setImmediate(resolve));
const forever = () => new Promise(() => {});

function fixture({ httpPending = false, stuck = false, throws = false } = {}) {
  const timers = new Map(), calls = [], exits = [];
  let clock = 0, counter = 0, closeHttp;
  const context = vm.createContext({
    console: { log() {}, warn() {} }, process: { pid: 123, exit: (code) => exits.push(code) },
    setShuttingDown: () => calls.push('flag'),
    setTimeout: (fn, ms) => { const id = ++counter; timers.set(id, { fn, at: clock + ms }); return id; },
    clearTimeout: (id) => timers.delete(id),
    resourceProbe: { stop: () => { calls.push('probe'); return stuck ? forever() : Promise.resolve(); } },
    redis: { quit: () => { calls.push('redis'); if (throws) throw new Error('offline'); return stuck ? forever() : Promise.resolve(); },
      disconnect: () => calls.push('redis-disconnect') },
    shutdownCycleTLS: () => { calls.push('cycle'); return stuck ? forever() : Promise.resolve(); },
    getPool: () => ({ end: () => { calls.push('mysql'); return stuck ? forever() : Promise.resolve(); } }),
    activeServer: { close: (done) => { closeHttp = done; if (!httpPending) done(); },
      closeIdleConnections: () => calls.push('idle-close'), closeAllConnections: () => calls.push('force-close') },
  });
  vm.runInContext(source.slice(start, end) + '\nglobalThis.shutdown = shutdownWorker;', context);
  async function advance(ms) {
    const target = clock + ms;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      clock = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
    }
    clock = target; await flush();
  }
  return { shutdown: () => context.shutdown(), closeHttp: () => closeHttp(), calls, exits, timers, advance };
}

test('la sonde s’arrête pendant le drainage HTTP et tous les timers sont nettoyés si l’arrêt réussit', async () => {
  const f = fixture({ httpPending: true });
  const stopped = f.shutdown();
  await flush();
  assert.ok(f.calls.includes('probe'));
  assert.ok(!f.calls.includes('redis'));
  f.closeHttp(); await stopped;
  assert.deepEqual(f.exits, [0]);
  assert.equal(f.timers.size, 0);
  await f.shutdown();
  assert.equal(f.calls.filter((call) => call === 'probe').length, 1);
});

test('une sonde ou des clients bloqués ne bloquent pas les autres nettoyages ni la sortie', async () => {
  const f = fixture({ stuck: true });
  const stopped = f.shutdown(); await flush();
  for (const call of ['probe', 'redis', 'mysql', 'cycle']) assert.ok(f.calls.includes(call));
  assert.deepEqual(f.exits, []);
  await f.advance(3000); await stopped;
  assert.deepEqual(f.exits, [0]);
  assert.ok(f.calls.includes('redis-disconnect'));
  assert.equal(f.timers.size, 0);
});

test('les requêtes pendantes gardent 15 secondes de drainage puis le nettoyage dispose de trois secondes', async () => {
  const f = fixture({ httpPending: true, stuck: true });
  const stopped = f.shutdown(); await flush();
  await f.advance(14999);
  assert.ok(!f.calls.includes('force-close'));
  await f.advance(1);
  assert.ok(f.calls.includes('force-close'));
  await f.advance(3000); await stopped;
  assert.deepEqual(f.exits, [0]);
  assert.equal(f.timers.size, 0);
});

test('une fermeture Redis qui lève une exception ne saute pas CycleTLS et MySQL', async () => {
  const f = fixture({ throws: true });
  await f.shutdown();
  assert.ok(f.calls.includes('cycle'));
  assert.ok(f.calls.includes('mysql'));
  assert.deepEqual(f.exits, [0]);
  assert.equal(f.timers.size, 0);
});
