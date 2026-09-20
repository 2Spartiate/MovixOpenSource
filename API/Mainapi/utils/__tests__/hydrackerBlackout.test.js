// API/Mainapi/utils/__tests__/hydrackerBlackout.test.js
//
// Vérifie l'interrupteur HYDRACKER_BLACKOUT : valeur par défaut, tolérance de
// casse, et surtout qu'aucun appel réseau ne part quand il est actif.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { isHydrackerBlackout, buildBlackoutError } = require('../hydrackerBlackout');
const { _fetchHydrackerLien, _fetchHydrackerTitleLiens } = require('../hydrackerLive');

const ORIGINAL = process.env.HYDRACKER_BLACKOUT;
function withEnv(value, fn) {
  if (value === undefined) delete process.env.HYDRACKER_BLACKOUT;
  else process.env.HYDRACKER_BLACKOUT = value;
  try {
    return fn();
  } finally {
    if (ORIGINAL === undefined) delete process.env.HYDRACKER_BLACKOUT;
    else process.env.HYDRACKER_BLACKOUT = ORIGINAL;
  }
}

// Un axios qui explose si on l'appelle : toute fuite réseau devient un échec.
const explodingAxios = {
  get: () => {
    throw new Error('appel réseau sorti malgré le blackout');
  },
};

test('isHydrackerBlackout: le blackout est actif par défaut', () => {
  withEnv(undefined, () => assert.equal(isHydrackerBlackout(), true));
});

test('isHydrackerBlackout: seule la valeur "false" lève le blackout', () => {
  withEnv('false', () => assert.equal(isHydrackerBlackout(), false));
  withEnv('FALSE', () => assert.equal(isHydrackerBlackout(), false));
  withEnv(' false ', () => assert.equal(isHydrackerBlackout(), false));
  withEnv('true', () => assert.equal(isHydrackerBlackout(), true));
  withEnv('n_importe_quoi', () => assert.equal(isHydrackerBlackout(), true));
  withEnv('', () => assert.equal(isHydrackerBlackout(), true));
});

test('buildBlackoutError: 503 pour retomber sur les gestionnaires de cache existants', () => {
  const err = buildBlackoutError('darkino GET /');
  assert.equal(err.isHydrackerBlackout, true);
  assert.equal(err.response.status, 503);
});

test('fetchHydrackerLien: aucune requête sortante quand le blackout est actif', async () => {
  process.env.HYDRACKER_BLACKOUT = 'true';
  const out = await _fetchHydrackerLien(18780524, { axios: explodingAxios });
  assert.deepEqual(out, { ok: false, code: 'live_hydracker_blackout', status: 0 });
  if (ORIGINAL === undefined) delete process.env.HYDRACKER_BLACKOUT;
  else process.env.HYDRACKER_BLACKOUT = ORIGINAL;
});

test('fetchHydrackerTitleLiens: aucune requête sortante quand le blackout est actif', async () => {
  process.env.HYDRACKER_BLACKOUT = 'true';
  const out = await _fetchHydrackerTitleLiens(100, { axios: explodingAxios });
  assert.deepEqual(out, { ok: false, code: 'live_hydracker_blackout', status: 0 });
  if (ORIGINAL === undefined) delete process.env.HYDRACKER_BLACKOUT;
  else process.env.HYDRACKER_BLACKOUT = ORIGINAL;
});
