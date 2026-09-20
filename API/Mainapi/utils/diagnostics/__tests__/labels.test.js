'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { httpLabel, redisLabel, sqlLabel } = require('../labels');

test('http labels keep logical host, group identifiers and omit credentials', () => {
  const label = httpLabel({
    protocol: 'https:', hostname: '203.0.113.8', path: '/shows/12345678/550e8400-e29b-41d4-a716-446655440000?token=secret&action=search&page=2',
    getHeader(name) { return name === 'host' ? 'catalog.example.test' : undefined; }
  }, 'post');
  assert.equal(label.destination, 'catalog.example.test');
  assert.match(label.operation, /^POST catalog\.example\.test\/shows\/:id\/:id\?action=search$/);
  assert.doesNotMatch(label.example, /secret|token/i);
  assert.match(label.example, /page=2/);
});

test('labels are bounded and survive malformed targets', () => {
  const label = httpLabel('%%%'.repeat(500));
  assert.ok(label.operation.length <= 240);
  assert.ok(label.example.length <= 512);
  const redis = redisLabel({ name: 'GET', args: ['/var/cache/movix/user/12345678901234567890/abcdef0123456789abcdef0123456789'] });
  assert.match(redis.operation, /var:cache:movix:user::id::hash/);
});

test('SQL labels fingerprint statements without comments or literal values', () => {
  const label = sqlLabel("/* private */ SELECT * FROM users WHERE email = 'user@example.test' AND id = 42 -- secret");
  assert.equal(label.destination, 'mysql');
  assert.match(label.example, /^SELECT \* FROM users WHERE email = \? AND id = \?$/);
  assert.doesNotMatch(label.example, /user@example|private|secret/);
});

test('credential-bearing paths are grouped without recording each secret', () => {
  for (const pathname of ['/admin/vip-keys/fixture-premium-key', '/api/webhooks/123/fixture-webhook-token', '/live/fixture-user/fixture-pass/123.ts']) {
    assert.doesNotMatch(JSON.stringify(httpLabel(`https://example.test${pathname}`)), /fixture-/);
  }
});

test('single-digit seasons and episodes share a group while query enums remain distinct', () => {
  const one = httpLabel('https://source.test/api/tv/123/season/1/episode/2?order=1');
  const two = httpLabel('https://source.test/api/tv/456/season/2/episode/19?order=1');
  assert.equal(one.operation, two.operation);
  assert.match(one.operation, /\/season\/:id\/episode\/:id\?order=1$/);
  assert.notEqual(one.operation, httpLabel('https://source.test/api/tv/123/season/1/episode/2?order=2').operation);
});
