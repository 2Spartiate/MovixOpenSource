'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ALERT_THRESHOLDS, createThresholdGate, describeThresholdAlert } = require('../alerts');
const point = (values = {}) => ({ at: 1, elapsedMs: 5000, cpuPercent: 0, rxBytes: 0, txBytes: 0, ...values });
const bytesForRate = (rate) => rate * 5 * 1048576;

test('rates use the real interval and CPU / reception / emission trigger independently', () => {
  for (const [values, trigger] of [
    [{ cpuPercent: 301 }, 'cpu'],
    [{ rxBytes: bytesForRate(21) }, 'network-rx'],
    [{ txBytes: bytesForRate(21) }, 'network-tx'],
  ]) assert.deepEqual(createThresholdGate().take(point(values)).triggers, [trigger]);
  assert.equal(createThresholdGate().take(point({ rxBytes: bytesForRate(21), elapsedMs: 10000 })), null);
  const both = createThresholdGate().take(point({ cpuPercent: 404, rxBytes: bytesForRate(25) }));
  assert.deepEqual(both.triggers, ['network-rx', 'cpu']);
  assert.equal(both.rxMiBPerSecond, 25);
  assert.match(describeThresholdAlert(both), /CPU 404\.0 %/);
});

test('exact thresholds, combined modest directions and missing counters do not alert', () => {
  const gate = createThresholdGate();
  assert.equal(gate.take(point({ cpuPercent: 300, rxBytes: bytesForRate(20), txBytes: bytesForRate(20) })), null);
  assert.equal(gate.take(point({ cpuPercent: null, rxBytes: null, txBytes: NaN })), null);
  assert.equal(gate.take(point({ cpuPercent: 400, elapsedMs: 0 })), null);
  assert.equal(gate.take(point({ rxBytes: -1 })), null);
  assert.deepEqual(gate.take(point({ cpuPercent: 400, rxBytes: null })).triggers, ['cpu']);
});

test('one reservation covers all thresholds for five minutes, including unsuccessful sends', () => {
  let now = 1000;
  const gate = createThresholdGate({ now: () => now });
  assert.ok(gate.take(point({ cpuPercent: 301 })));
  now += 1000;
  assert.equal(gate.take(point({ rxBytes: bytesForRate(25) })), null);
  assert.equal(gate.take(point()), null);
  now = 1000 + ALERT_THRESHOLDS.cooldownMs - 1;
  assert.equal(gate.take(point({ cpuPercent: 500 })), null);
  now++;
  assert.ok(gate.take(point({ cpuPercent: 500 })));
});
