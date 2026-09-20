import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { ErrorTypes } from 'hls.js';

const file = new URL('../src/components/LiveTVPlayer.tsx', import.meta.url);
const source = ts.createSourceFile(file.pathname, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const callbacks = new Map();
let resetEffect;
const visit = node => {
  if (ts.isCallExpression(node)) {
    if (node.expression.getText(source) === 'hls.on') {
      callbacks.set(node.arguments[0].getText(source), node.arguments[1].getText(source));
    }
    if (node.expression.getText(source) === 'useEffect'
        && node.arguments[0].getText(source).includes('levelParsingRetryRef.current = 0')
        && !node.arguments[0].getText(source).includes('new Hls')) {
      resetEffect = node.getText(source);
    }
  }
  ts.forEachChild(node, visit);
};
visit(source);

const noop = () => {};
function evaluate(code, bindings) {
  const js = ts.transpile(`const run = ${code};`, { target: ts.ScriptTarget.ES2022 });
  return new Function(...Object.keys(bindings), `${js}\nreturn run;`)(...Object.values(bindings));
}

function fixture() {
  const actions = [];
  const count = { current: 0 };
  const sourceStream = { url: 'https://media.test/master.m3u8' };
  let previousDeps;
  const bindings = {
    Hls: { ErrorTypes },
    hlsRef: { current: null }, levelParsingRetryRef: count,
    hls404RetryRef: { current: 0 }, hls458RetryRef: { current: 0 },
    bufferAppendRetryRef: { current: 0 }, hlsRecoveryInFlightRef: { current: false },
    ProxyLoader: {}, video: { play: () => Promise.resolve() },
    console: { log: noop, warn: noop, error: noop },
    resetPauseState: noop, setIsLoading: noop, setError: noop, t: key => key,
    scheduleHlsLiveResync: () => actions.push('resync'),
    scheduleHlsReinit: () => actions.push('reinit'),
    tryNextOrWaitForVavoo: () => { actions.push('fallback'); return false; },
  };
  return {
    actions, count,
    install(stream = sourceStream) {
      if (resetEffect) evaluate(`() => { ${resetEffect}; }`, {
        ...bindings, channelId: 'streamed_fixture', playbackStream: stream,
        useEffect: (callback, deps) => {
          if (!previousDeps || deps.some((value, index) => !Object.is(value, previousDeps[index]))) callback();
          previousDeps = deps;
        },
      })();
      const hls = { levels: [{}], audioTracks: [], destroy: () => actions.push('destroy') };
      bindings.hlsRef.current = hls;
      const emit = (event, data) => evaluate(callbacks.get(`Hls.Events.${event}`), { ...bindings, hls })(null, data);
      emit('MANIFEST_PARSED');
      return {
        fail: () => emit('ERROR', {
          type: ErrorTypes.NETWORK_ERROR, details: 'levelParsingError', fatal: true,
          error: new Error('Missing Target Duration'),
        }),
        loaded: () => emit('LEVEL_LOADED', { details: { live: true } }),
      };
    },
  };
}

test('une playlist invalide ne réarme pas ses retries après rechargement du master', () => {
  const f = fixture();
  let player = f.install();
  player.fail();
  player.fail();
  player.fail();
  assert.deepEqual(f.actions, ['resync', 'resync', 'reinit']);
  player = f.install();
  player.fail();
  assert.deepEqual(f.actions, ['resync', 'resync', 'reinit', 'destroy', 'fallback']);
});

test('une playlist vidéo valide rend un nouveau budget de récupération', () => {
  const f = fixture();
  const player = f.install();
  player.fail();
  player.fail();
  player.loaded();
  player.fail();
  assert.equal(f.count.current, 1);
  assert.deepEqual(f.actions, ['resync', 'resync', 'resync']);
});

test('un changement de source rend un nouveau budget après un abandon', () => {
  const f = fixture();
  const player = f.install();
  for (let index = 0; index < 4; index++) player.fail();
  const next = f.install({ url: 'https://media.test/another.m3u8' });
  next.fail();
  assert.equal(f.count.current, 1);
  assert.equal(f.actions.at(-1), 'resync');
});
