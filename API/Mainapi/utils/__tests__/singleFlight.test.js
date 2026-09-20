'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSingleFlight } = require('../singleFlight');

test('partage une salve, isole les clés et oublie les traitements terminés', async () => {
  const run = createSingleFlight();
  let calls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const work = () => { calls++; return gate; };
  const requests = Array.from({ length: 20 }, () => run('same', work));
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.ok(requests.every(promise => promise === requests[0]));
  assert.equal(await run('other', () => 42), 42);
  release('done');
  assert.deepEqual(await Promise.all(requests), Array(20).fill('done'));
  assert.equal(await run('same', () => 'new'), 'new');
});

test('un échec partagé est nettoyé et permet une reprise', async () => {
  const run = createSingleFlight();
  const error = new Error('upstream unavailable');
  let calls = 0;
  const requests = Array.from({ length: 20 }, () => run('same', () => { calls++; throw error; }));
  const results = await Promise.allSettled(requests);
  assert.equal(calls, 1);
  assert.ok(results.every(result => result.status === 'rejected' && result.reason === error));
  assert.equal(await run('same', () => 'retry'), 'retry');
});
