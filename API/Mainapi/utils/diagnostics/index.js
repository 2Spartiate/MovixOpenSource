'use strict';

// Importing this bridge is inert. server.js opts in before loading the clients.
let session = null;
const disabled = Object.freeze({ workerEnv: {}, stop: async () => {}, active: false });

function startProbe(cluster, options = {}) {
  if (session) return session;
  const env = options.env || process.env;
  if (!(Number(env.MAINAPI_PROBE_SECONDS) > 0) || !Number.isFinite(Number(env.MAINAPI_PROBE_SECONDS))) return disabled;
  try {
    const { createMasterSession, createWorkerSession } = require('./session');
    if (cluster.isPrimary ?? cluster.isMaster) session = createMasterSession(cluster, options);
    else if (env.MAINAPI_PROBE_RUN_ID && Number(env.MAINAPI_PROBE_ENDS_AT) > Date.now()) {
      session = createWorkerSession({ runId: env.MAINAPI_PROBE_RUN_ID, startsAt: Number(env.MAINAPI_PROBE_STARTS_AT) || 0,
        endsAt: Number(env.MAINAPI_PROBE_ENDS_AT) }, options);
    }
    return session || disabled;
  } catch {
    console.warn('[probe] Sonde indisponible ; démarrage normal de Main API. Vérifier la configuration et les droits du répertoire de rapport.');
    return disabled;
  }
}

function instrumentClient(method, client) {
  if (session?.collector?.active) {
    try { session.addUndo(require('./clients')[method](client, session.collector)); }
    catch { session.collector.warn(`${method}_failed`); }
  }
  return client;
}

module.exports = {
  startProbe,
  instrumentRedis: (client) => instrumentClient('instrumentRedis', client),
  instrumentMysqlPool: (pool) => instrumentClient('instrumentMysqlPool', pool),
  wrapCycleTLS(fn) {
    return session?.collector?.active ? require('./clients').wrapCycleTLS(fn, session.collector) : fn;
  },
  observeTextRequest(kind, url, options, operation) {
    return session?.collector?.active ? require('./clients').observeTextRequest(session.collector, kind, url, options, operation) : operation();
  },
  middleware(req, res, next) {
    if (!session?.collector?.active) return next();
    return require('./http').inboundMiddleware(session.collector)(req, res, next);
  },
  traceTask(name, operation) {
    const collector = session?.collector;
    if (!collector?.active) return operation();
    return collector.withSource(`job ${name}`, () => {
      const span = collector.start({ kind: 'job', operation: name, destination: 'local' });
      let result;
      try { result = operation(); } catch (error) { span.finish({ error }); throw error; }
      if (result && typeof result.then === 'function') Promise.resolve(result).then(() => span.finish(), (error) => span.finish({ error }));
      else span.finish();
      return result;
    });
  },
};
