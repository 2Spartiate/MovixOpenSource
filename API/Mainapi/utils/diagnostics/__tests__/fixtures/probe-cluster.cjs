'use strict';

const cluster = require('node:cluster');
const { startProbe } = require('../../index');
const { MESSAGE } = require('../../session');

function send(message) { if (process.send) process.send(message); }

if (cluster.isPrimary) {
  let systemTick = 0;
  const sampler = {
    async sample() {
      systemTick += 1;
      return {
        at: Date.now(), warnings: [],
        network: { rxBytes: systemTick * 10, txBytes: systemTick * 5, interfaces: [] },
        cgroup: { cpuUsageUs: systemTick * 1000, cpuQuotaCores: 1, memoryBytes: 100, memoryLimitBytes: 200, version: 2 },
        processes: [],
      };
    },
  };
  const probe = startProbe(cluster, {
    env: process.env, systemSampler: sampler, sampleMs: 60, checkpointMs: 60, finalWaitMs: 800,
    warmupMs: process.env.FIXTURE_ANALYSIS === '1' ? 1000 : undefined,
    notify: async () => ({ status: 'disabled' }),
  });
  let ready = 0;
  let restarted = false;
  let stopping = false;
  const workerEndsAt = [];
  const workerStartsAt = [];
  const fork = (slot) => cluster.fork({ ...probe.workerEnv, MOVIX_WORKER_SLOT: String(slot), MAINAPI_PROBE_DISCORD_ENABLED: 'false' });
  fork(0); fork(1);
  async function finishFixture() {
    send({ type: 'fixture-result', runDir: probe.runDir, endsAt: probe.state.endsAt, reason: probe.state.reason,
      activeWorkers: Object.values(cluster.workers).filter((item) => !item.isDead()).length, workerEndsAt, workerStartsAt });
    for (const item of Object.values(cluster.workers)) item.send({ type: 'fixture-teardown' });
    cluster.disconnect(() => process.exit(0));
  }
  cluster.on('message', (worker, message) => {
    if (message?.type !== 'fixture-ready') return;
    workerEndsAt.push(message.endsAt);
    workerStartsAt.push(message.startsAt);
    ready += 1;
    if (ready === 2 && !restarted) {
      const first = Object.values(cluster.workers).find((candidate) => candidate.process.pid === worker.process.pid) || worker;
      setTimeout(() => first.kill(), 80).unref();
    } else if (restarted && !stopping) {
      stopping = true;
      if (process.env.FIXTURE_PROBE_DEADLINE === '1') {
        setTimeout(async () => {
          while (!probe.state.finishedAt && Date.now() < probe.state.endsAt + 3000) await new Promise((resolve) => setTimeout(resolve, 25));
          await probe.stop('deadline');
          await finishFixture();
        }, Math.max(0, probe.state.endsAt - Date.now() + 300)).unref();
      } else setTimeout(async () => { await probe.stop('fixture'); await finishFixture(); }, 140).unref();
    }
  });
  cluster.on('exit', () => {
    if (!restarted && !stopping) { restarted = true; fork(0); }
  });
} else {
  const probe = startProbe(cluster, { env: process.env });
  const span = probe.collector.start({ kind: 'http', operation: 'fixture', destination: 'local', byteMode: 'network' });
  span.receive(10); span.finish({ status: 200 });
  if (process.env.FIXTURE_ANALYSIS === '1') {
    setTimeout(() => {
      const measured = probe.collector.start({ kind: 'http', operation: 'after-warmup', destination: 'local', byteMode: 'encoded-body' });
      measured.receive(20); measured.finish({ status: 200 });
    }, Math.max(0, Number(process.env.MAINAPI_PROBE_STARTS_AT) - Date.now()) + 100).unref();
  }
  const at = Date.now();
  const duplicate = {
    type: MESSAGE, action: 'snapshot', runId: process.env.MAINAPI_PROBE_RUN_ID, pid: process.pid,
    slot: Number(process.env.MOVIX_WORKER_SLOT) || 0, at, final: false,
    metrics: probe.collector.snapshot(), cpuProfile: probe.cpu?.snapshot?.() || { windows: 0, functions: [], errors: 0, active: true, truncatedFunctions: 0 },
    resources: probe.collector.recording ? [{ at, elapsedMs: 1, cpuUsageUs: 0, cpuPercent: 0, memory: process.memoryUsage(), eventLoopUtilization: 0, eventLoopP99Ms: 0, eventLoopMaxMs: 0, operations: [] }] : [],
  };
  send(duplicate); send(duplicate);
  send({ type: 'fixture-ready', pid: process.pid, slot: Number(process.env.MOVIX_WORKER_SLOT), endsAt: Number(process.env.MAINAPI_PROBE_ENDS_AT), startsAt: Number(process.env.MAINAPI_PROBE_STARTS_AT) });
  process.on('message', async (message) => {
    if (message?.type === 'fixture-teardown') { await probe.stop(); process.exit(0); }
  });
}
