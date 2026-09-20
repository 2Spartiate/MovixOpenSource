const inspector = require('node:inspector');
const { fileURLToPath } = require('node:url');

const MAX_FUNCTIONS = 1024;

function post(session, method, params, timeoutMs, timers) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback) => (value) => {
      if (settled) return;
      settled = true;
      if (timeout) timers.clearTimeout(timeout);
      callback(value);
    };
    const timeout = timers.setTimeout(finish(() => reject(new Error(`Inspector ${method} timed out`))), timeoutMs);
    if (timeout && typeof timeout.unref === 'function') timeout.unref();
    try {
      session.post(method, params, (error, result) => error ? finish(reject)(error) : finish(resolve)(result || {}));
    } catch (error) { finish(reject)(error); }
  });
}

function cleanFile(url, rootDir) {
  if (!url) return null;
  let value = String(url).split(/[?#]/, 1)[0];
  if (value.startsWith('file:')) {
    try { value = fileURLToPath(value); } catch {
      try { value = decodeURIComponent(new URL(value).pathname); } catch { return null; }
    }
  }
  if (rootDir) {
    const normalValue = value.replace(/\\/g, '/');
    const normalRoot = String(rootDir).replace(/\\/g, '/').replace(/\/$/, '');
    if (normalValue.startsWith(`${normalRoot}/`)) value = normalValue.slice(normalRoot.length + 1);
  }
  return value || null;
}

function createCpuSampler(options = {}) {
  const slot = options.slot ?? 0;
  const profileMs = options.profileMs ?? 5000;
  const intervalMs = options.intervalMs ?? 60000;
  const samplingIntervalUs = options.samplingIntervalUs ?? 10000;
  const inspectorTimeoutMs = options.inspectorTimeoutMs ?? 1000;
  const now = options.now ?? Date.now;
  const timers = options.timers ?? globalThis;
  const sessionFactory = options.sessionFactory ?? (() => new inspector.Session());
  const rootDir = options.rootDir;
  const functions = new Map();
  const overflow = { samples: 0, estimatedCpuMs: 0 };
  let truncatedFunctions = 0;
  let errors = 0;
  let windows = 0;
  let sampledDurationMs = 0;
  let active = false;
  let scheduleTimer = null;
  let current = null;

  function timerUnref(timer) { if (timer && typeof timer.unref === 'function') timer.unref(); return timer; }
  function addFrame(frame, samples, duration) {
    const name = frame.functionName || '(anonymous)';
    const file = cleanFile(frame.url, rootDir);
    const line = Number.isFinite(frame.lineNumber) && frame.lineNumber >= 0 ? frame.lineNumber + 1 : null;
    const key = `${name}\u0000${file || ''}\u0000${line || ''}`;
    const existing = functions.get(key);
    if (existing) { existing.samples += samples; existing.estimatedCpuMs += duration; return; }
    if (functions.size >= MAX_FUNCTIONS) {
      truncatedFunctions += 1;
      overflow.samples += samples;
      overflow.estimatedCpuMs += duration;
      return;
    }
    functions.set(key, { name, file, line, samples, estimatedCpuMs: duration });
  }
  function aggregate(profile) {
    const nodes = new Map((profile.nodes || []).map((node) => [node.id, node.callFrame || {}]));
    const samples = profile.samples || [];
    const deltas = profile.timeDeltas || [];
    for (let index = 0; index < samples.length; index += 1) {
      const duration = Math.max(0, Number(deltas[index]) || 0) / 1000;
      sampledDurationMs += duration;
      addFrame(nodes.get(samples[index]) || { functionName: '(unknown)' }, 1, duration);
    }
  }
  function snapshot() {
    const rows = [...functions.values()].map((entry) => ({ ...entry, estimatedCpuMs: Math.round(entry.estimatedCpuMs * 1000) / 1000 }));
    if (overflow.samples) rows.push({ name: '(overflow)', file: null, line: null, samples: overflow.samples, estimatedCpuMs: Math.round(overflow.estimatedCpuMs * 1000) / 1000 });
    rows.sort((a, b) => b.estimatedCpuMs - a.estimatedCpuMs || b.samples - a.samples || a.name.localeCompare(b.name));
    return { windows, sampledDurationMs: Math.round(sampledDurationMs * 1000) / 1000, functions: rows, errors, active, truncatedFunctions };
  }
  function schedule(delay) {
    if (!active) return;
    scheduleTimer = timerUnref(timers.setTimeout(() => {
      scheduleTimer = null;
      runWindow();
      schedule(intervalMs);
    }, Math.max(0, delay)));
  }
  async function runWindow() {
    if (!active || current) return;
    let session;
    let endTimer;
    let started = false;
    let stopping = false;
    let finishPromise = null;
    let resolveDone;
    const done = new Promise((resolve) => { resolveDone = resolve; });
    const window = {
      done,
      finish() {
        if (finishPromise) return finishPromise;
        stopping = true;
        if (endTimer) timers.clearTimeout(endTimer);
        finishPromise = (async () => {
          if (started) try {
            const response = await post(session, 'Profiler.stop', undefined, inspectorTimeoutMs, timers);
            aggregate(response.profile || {});
            windows += 1;
          } catch { errors += 1; }
          try { if (session) session.disconnect(); } catch { /* ignored */ }
          if (current === window) current = null;
          resolveDone();
        })();
        return finishPromise;
      },
    };
    current = window;
    try {
      session = sessionFactory();
      session.connect();
      await post(session, 'Profiler.enable', undefined, inspectorTimeoutMs, timers);
      if (stopping || !active) { await window.finish(); return; }
      await post(session, 'Profiler.setSamplingInterval', { interval: samplingIntervalUs }, inspectorTimeoutMs, timers);
      if (stopping || !active) { await window.finish(); return; }
      await post(session, 'Profiler.start', undefined, inspectorTimeoutMs, timers);
      started = true;
      if (stopping || !active) { await window.finish(); return; }
      endTimer = timerUnref(timers.setTimeout(() => { window.finish(); }, profileMs));
    } catch {
      errors += 1;
      await window.finish();
    }
  }
  function start() {
    if (active) return;
    active = true;
    const stagger = ((Number(slot) || 0) * profileMs) % intervalMs;
    schedule(stagger);
  }
  async function stop() {
    active = false;
    if (scheduleTimer) { timers.clearTimeout(scheduleTimer); scheduleTimer = null; }
    if (current) {
      const running = current;
      await running.finish();
      await running.done;
    }
    return snapshot();
  }
  return { start, snapshot, stop };
}

module.exports = { createCpuSampler };
