'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compactRefreshError } = require('../refreshError');
const { createSourceRefresh } = require('../sourceRefresh');
const { createLiveTvRefresh } = require('../liveTvCache');

test('le cooldown conserve le contrat Omega mais aucune référence au transport et à son HTML', () => {
  const original = Object.assign(new Error('x'.repeat(5000)), {
    config: { sensitive: true }, request: { socket: {} }, response: { data: 'H'.repeat(2 * 1024 * 1024) },
    cause: new Error('upstream'), code: 'ETIMEDOUT', httpStatus: 200,
    responseData: { message: 'Contenu non disponible', french_stream_id: '42', details: 'timeout', unrelated: { large: 'data' } },
  });
  const compact = compactRefreshError(original);
  assert.equal(compact.message.length, 1024);
  assert.equal(compact.code, 'ETIMEDOUT');
  assert.equal(compact.httpStatus, 200);
  assert.deepEqual(compact.responseData, { message: 'Contenu non disponible', details: 'timeout', french_stream_id: '42' });
  for (const property of ['config', 'request', 'response', 'cause']) assert.equal(compact[property], undefined);
  assert.notEqual(compact.responseData, original.responseData);
});

test('les deux coordinateurs rejettent avec l’original une fois puis sa copie légère pendant la reprise', async () => {
  for (const run of [createSourceRefresh().run, createLiveTvRefresh()]) {
    const original = Object.assign(new Error('unavailable'), { response: { data: 'large' } });
    let calls = 0;
    const work = () => { calls++; throw original; };
    await assert.rejects(run('key', work), error => error === original);
    await assert.rejects(run('key', work), error => error !== original && error.message === 'unavailable' && !error.response);
    assert.equal(calls, 1);
  }
});
