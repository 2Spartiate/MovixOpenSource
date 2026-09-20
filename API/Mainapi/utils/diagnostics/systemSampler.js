const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const MAX_PROCESSES = 4096;
const PROCESS_CONCURRENCY = 16;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function warning(warnings, value) {
  if (!warnings.includes(value)) warnings.push(value);
}

function parseProcStat(text) {
  const close = text.lastIndexOf(')');
  const open = text.indexOf('(');
  if (open < 0 || close < open) return null;
  const pid = number(text.slice(0, open).trim());
  const fields = text.slice(close + 1).trim().split(/\s+/);
  // Fields after the command start with state (field 3).
  if (pid === null || fields.length < 22) return null;
  const ppid = number(fields[1]);
  const utime = number(fields[11]);
  const stime = number(fields[12]);
  const rssPages = number(fields[21]);
  if (ppid === null || utime === null || stime === null || rssPages === null) return null;
  return { pid, ppid, name: text.slice(open + 1, close), ticks: utime + stime, rssPages };
}

function parseNetwork(text) {
  const interfaces = [];
  let rxBytes = 0;
  let txBytes = 0;
  for (const line of String(text).split(/\r?\n/).slice(2)) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const name = line.slice(0, colon).trim();
    const fields = line.slice(colon + 1).trim().split(/\s+/);
    const rx = number(fields[0]);
    const tx = number(fields[8]);
    if (!name || rx === null || tx === null) continue;
    interfaces.push({ name, rxBytes: rx, txBytes: tx });
    if (name !== 'lo') {
      rxBytes += rx;
      txBytes += tx;
    }
  }
  return interfaces.length ? { rxBytes, txBytes, interfaces } : null;
}

function parseKeyValue(text) {
  return Object.fromEntries(String(text).split(/\r?\n/).map((line) => {
    const [key, value] = line.trim().split(/\s+/, 2);
    return [key, value];
  }).filter(([key, value]) => key && value));
}

function readText(readFile, file) {
  return readFile(file, 'utf8');
}

function defaultGetconf(name) {
  return new Promise((resolve) => {
    const child = execFile('getconf', [name], { timeout: 150, windowsHide: true }, (error, stdout) => {
      const value = error ? null : number(String(stdout).trim());
      resolve(value);
    });
    child.once('error', () => resolve(null));
  });
}

function createSystemSampler(options = {}) {
  const rootPid = options.rootPid ?? process.pid;
  const platform = options.platform ?? process.platform;
  const procRoot = options.procRoot ?? '/proc';
  const cgroupRoot = options.cgroupRoot ?? '/sys/fs/cgroup';
  const readFile = options.readFile ?? fs.readFile;
  const readdir = options.readdir ?? fs.readdir;
  const now = options.now ?? Date.now;
  const getconf = options.getconf ?? defaultGetconf;
  let inFlight = null;
  let constants = null;

  async function getConstants() {
    if (!constants) {
      constants = Promise.all([
        options.clockTicks ?? getconf('CLK_TCK'),
        options.pageSize ?? getconf('PAGESIZE'),
      ]).then(([clockTicks, pageSize]) => ({
        clockTicks: number(clockTicks) || 100,
        pageSize: number(pageSize) || 4096,
      })).catch(() => ({ clockTicks: 100, pageSize: 4096 }));
    }
    return constants;
  }

  async function sampleCgroup(warnings) {
    let memberships;
    try { memberships = await readText(readFile, path.join(procRoot, 'self/cgroup')); } catch { return null; }
    const lines = String(memberships).split(/\r?\n/).filter(Boolean);
    const v2 = lines.find((line) => line.includes('::'));
    if (v2) {
      const relative = v2.split(':').slice(2).join(':') || '/';
      const base = path.join(cgroupRoot, relative.replace(/^[/\\]+/, ''));
      try {
        const [cpuStat, cpuMax, memoryCurrent, memoryMax] = await Promise.all([
          readText(readFile, path.join(base, 'cpu.stat')),
          readText(readFile, path.join(base, 'cpu.max')),
          readText(readFile, path.join(base, 'memory.current')),
          readText(readFile, path.join(base, 'memory.max')),
        ]);
        const cpu = parseKeyValue(cpuStat);
        const [quota, period] = String(cpuMax).trim().split(/\s+/);
        return {
          cpuUsageUs: number(cpu.usage_usec),
          cpuQuotaCores: quota === 'max' ? null : ((number(quota) && number(period)) ? number(quota) / number(period) : null),
          memoryBytes: number(String(memoryCurrent).trim()),
          memoryLimitBytes: String(memoryMax).trim() === 'max' ? null : number(String(memoryMax).trim()),
          version: 2,
        };
      } catch {
        warning(warnings, 'cgroup-unavailable');
        return null;
      }
    }
    const controller = (name) => lines.find((line) => line.split(':')[1].split(',').includes(name));
    const cpuLine = controller('cpuacct') || controller('cpu');
    const memoryLine = controller('memory');
    if (!cpuLine && !memoryLine) return null;
    const cpuPath = cpuLine ? cpuLine.split(':').slice(2).join(':') : '/';
    const memoryPath = memoryLine ? memoryLine.split(':').slice(2).join(':') : '/';
    try {
      const cpuBases = ['cpu,cpuacct', 'cpuacct', 'cpu'].map((controllerName) => path.join(cgroupRoot, controllerName, cpuPath.replace(/^[/\\]+/, '')));
      const memoryBase = path.join(cgroupRoot, 'memory', memoryPath.replace(/^[/\\]+/, ''));
      const readFirst = async (files) => {
        let lastError;
        for (const file of files) try { return await readText(readFile, file); } catch (error) { lastError = error; }
        throw lastError;
      };
      const [usageNs, quota, period, memoryBytes, memoryLimit] = await Promise.all([
        readFirst(cpuBases.map((base) => path.join(base, 'cpuacct.usage'))),
        readFirst(cpuBases.map((base) => path.join(base, 'cpu.cfs_quota_us'))),
        readFirst(cpuBases.map((base) => path.join(base, 'cpu.cfs_period_us'))),
        readText(readFile, path.join(memoryBase, 'memory.usage_in_bytes')),
        readText(readFile, path.join(memoryBase, 'memory.limit_in_bytes')),
      ]);
      const quotaValue = number(String(quota).trim());
      const periodValue = number(String(period).trim());
      const usageValue = number(String(usageNs).trim());
      return {
        cpuUsageUs: usageValue === null ? null : usageValue / 1000,
        cpuQuotaCores: quotaValue && quotaValue > 0 && periodValue ? quotaValue / periodValue : null,
        memoryBytes: number(String(memoryBytes).trim()),
        memoryLimitBytes: number(String(memoryLimit).trim()),
        version: 1,
      };
    } catch {
      warning(warnings, 'cgroup-unavailable');
      return null;
    }
  }

  async function sampleProcesses(warnings) {
    let entries;
    try { entries = await readdir(procRoot, { withFileTypes: true }); } catch { return null; }
    const availablePids = entries.map((entry) => entry.name ?? entry).filter((name) => /^\d+$/.test(String(name)));
    if (availablePids.length > MAX_PROCESSES) warning(warnings, 'processes-truncated');
    const pids = availablePids.slice(0, MAX_PROCESSES);
    const stats = new Map();
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(PROCESS_CONCURRENCY, pids.length) }, async () => {
      while (cursor < pids.length) {
        const pid = pids[cursor++];
        try {
          const parsed = parseProcStat(await readText(readFile, path.join(procRoot, String(pid), 'stat')));
          if (parsed) stats.set(parsed.pid, parsed);
        } catch { /* Process can exit during enumeration. */ }
      }
    }));
    if (!stats.has(rootPid)) {
      warning(warnings, 'processes-unavailable');
      return null;
    }
    const descendants = new Set([rootPid]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const stat of stats.values()) if (!descendants.has(stat.pid) && descendants.has(stat.ppid)) {
        descendants.add(stat.pid);
        changed = true;
      }
    }
    const { clockTicks, pageSize } = await getConstants();
    return [...descendants].map((pid) => stats.get(pid)).filter(Boolean).sort((a, b) => a.pid - b.pid).map((stat) => ({
      pid: stat.pid,
      ppid: stat.ppid,
      name: stat.name,
      cpuUsageUs: (stat.ticks * 1e6) / clockTicks,
      rssBytes: stat.rssPages * pageSize,
    }));
  }

  async function collect() {
    const warnings = [];
    const result = { at: now(), network: null, cgroup: null, processes: null, warnings };
    if (platform !== 'linux') return result;
    try { result.network = parseNetwork(await readText(readFile, path.join(procRoot, 'net/dev'))); } catch { warning(warnings, 'network-unavailable'); }
    result.cgroup = await sampleCgroup(warnings);
    result.processes = await sampleProcesses(warnings);
    return result;
  }

  return {
    sample() {
      if (!inFlight) inFlight = collect().catch(() => ({ at: now(), network: null, cgroup: null, processes: null, warnings: ['sampler-unavailable'] })).finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}

module.exports = { createSystemSampler, parseProcStat, parseNetwork };
