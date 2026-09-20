const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { createSystemSampler } = require('../systemSampler');

function fixture(files) {
  return async (file) => {
    const key = String(file).replace(/\\/g, '/');
    if (!(key in files)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return files[key];
  };
}

test('lit les compteurs Linux sans compter loopback et reconstruit les descendants', async () => {
  const proc = '/proc-test';
  const cg = '/cg-test';
  const stat = (pid, name, ppid, ticks, rss) => `${pid} (${name}) ${['S', ppid, 0, 0, 0, 0, 0, 0, 0, 0, 0, ticks, 0, 0, 0, 0, 0, 0, 0, 0, 0, rss].join(' ')}`;
  const sampler = createSystemSampler({
    rootPid: 10, platform: 'linux', procRoot: proc, cgroupRoot: cg, clockTicks: 100, pageSize: 4096, now: () => 7,
    readdir: async () => ['10', '11', '12', '999'],
    readFile: fixture({
      [`${proc}/net/dev`]: 'Inter-|   Receive                                                |  Transmit\n face |bytes packets errs drop fifo frame compressed multicast|bytes packets errs drop fifo colls carrier compressed\n lo: 9 0 0 0 0 0 0 0 9 0 0 0 0 0 0 0\n eth0: 10 0 0 0 0 0 0 0 20 0 0 0 0 0 0 0',
      [`${proc}/self/cgroup`]: '0::/scope',
      [`${cg}/scope/cpu.stat`]: 'usage_usec 123', [`${cg}/scope/cpu.max`]: '200000 100000',
      [`${cg}/scope/memory.current`]: '300', [`${cg}/scope/memory.max`]: 'max',
      [`${proc}/10/stat`]: stat(10, 'node main', 1, 10, 2), [`${proc}/11/stat`]: stat(11, 'sh', 10, 20, 3),
      [`${proc}/12/stat`]: stat(12, 'cycletls', 11, 30, 4), [`${proc}/999/stat`]: stat(999, 'other', 1, 40, 5),
    }),
  });
  const result = await sampler.sample();
  assert.deepEqual(result.network, { rxBytes: 10, txBytes: 20, interfaces: [{ name: 'lo', rxBytes: 9, txBytes: 9 }, { name: 'eth0', rxBytes: 10, txBytes: 20 }] });
  assert.deepEqual(result.cgroup, { cpuUsageUs: 123, cpuQuotaCores: 2, memoryBytes: 300, memoryLimitBytes: null, version: 2 });
  assert.deepEqual(result.processes.map(({ pid, ppid, name, cpuUsageUs, rssBytes }) => ({ pid, ppid, name, cpuUsageUs, rssBytes })), [
    { pid: 10, ppid: 1, name: 'node main', cpuUsageUs: 100000, rssBytes: 8192 },
    { pid: 11, ppid: 10, name: 'sh', cpuUsageUs: 200000, rssBytes: 12288 },
    { pid: 12, ppid: 11, name: 'cycletls', cpuUsageUs: 300000, rssBytes: 16384 },
  ]);
  assert.equal(result.at, 7);
});

test('retourne des indisponibilités plutôt que des zéros inventés', async () => {
  const sampler = createSystemSampler({ rootPid: 1, platform: 'linux', readFile: async () => { throw new Error('denied'); }, readdir: async () => { throw new Error('denied'); } });
  const result = await sampler.sample();
  assert.equal(result.network, null);
  assert.equal(result.cgroup, null);
  assert.equal(result.processes, null);
  assert.ok(result.warnings.includes('network-unavailable'));
});

test('résout la racine cgroup v2 standard des conteneurs', async () => {
  const proc = '/proc-test'; const cg = '/cg-test';
  const sampler = createSystemSampler({
    rootPid: 1, platform: 'linux', procRoot: proc, cgroupRoot: cg, readdir: async () => [],
    readFile: fixture({
      [`${proc}/net/dev`]: '', [`${proc}/self/cgroup`]: '0::/',
      [`${cg}/cpu.stat`]: 'usage_usec 5', [`${cg}/cpu.max`]: 'max 100000',
      [`${cg}/memory.current`]: '7', [`${cg}/memory.max`]: '9',
    }),
  });
  const result = await sampler.sample();
  assert.deepEqual(result.cgroup, { cpuUsageUs: 5, cpuQuotaCores: null, memoryBytes: 7, memoryLimitBytes: 9, version: 2 });
});

test('ne lance pas deux échantillonnages concurrents et ne sonde pas Windows', async () => {
  let reads = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const sampler = createSystemSampler({ rootPid: 1, platform: 'linux', readdir: async () => [], readFile: async () => { reads += 1; await gate; return ''; } });
  const first = sampler.sample();
  const second = sampler.sample();
  assert.strictEqual(first, second);
  release();
  await first;
  assert.equal(reads, 2);
  const windows = await createSystemSampler({ platform: 'win32' }).sample();
  assert.deepEqual(windows, { at: windows.at, network: null, cgroup: null, processes: null, warnings: [] });
});

test('signale une énumération /proc plafonnée', async () => {
  const proc = '/proc-test';
  const sampler = createSystemSampler({
    rootPid: 1, platform: 'linux', procRoot: proc,
    readdir: async () => Array.from({ length: 4097 }, (_, index) => String(index + 1)),
    readFile: async () => { throw new Error('absent'); },
  });
  const result = await sampler.sample();
  assert.ok(result.warnings.includes('processes-truncated'));
});
