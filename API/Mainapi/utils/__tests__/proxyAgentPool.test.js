'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createProxyAgentPool } = require('../proxyAgentPool');

function fixture(maxEntries = 2) {
  let time = 0;
  const agents = [];
  const pool = createProxyAgentPool({ maxEntries, idleTtlMs: 100, now: () => time,
    createAgent(key, keepAlive) {
      const agent = { key, keepAlive, destroyed: 0, destroy() { this.destroyed++; } };
      agents.push(agent);
      return agent;
    },
  });
  return { pool, agents, advance(ms) { time += ms; } };
}

test('vingt demandes successives du même proxy réutilisent un seul agent', () => {
  const f = fixture();
  for (let i = 0; i < 20; i++) f.pool.acquire('proxy').release();
  assert.equal(f.agents.length, 1);
  assert.equal(f.agents[0].keepAlive, true);
  f.advance(100);
  f.pool.sweep();
  assert.equal(f.agents[0].destroyed, 1);
  f.pool.acquire('proxy').release();
  assert.equal(f.agents.length, 2);
});

test('éviction et changement de pool attendent la fin des demandes actives', () => {
  const f = fixture(1);
  const first = f.pool.acquire('first');
  const second = f.pool.acquire('first');
  f.pool.clear();
  assert.equal(first.agent.destroyed, 0);
  first.release();
  first.release();
  assert.equal(first.agent.destroyed, 0);
  second.release();
  assert.equal(first.agent.destroyed, 1);
  assert.notEqual(f.pool.acquire('first').agent, first.agent);
});

test('un cache occupé utilise un agent ponctuel sans couper une requête active', () => {
  const f = fixture(1);
  const active = f.pool.acquire('busy');
  const temporary = f.pool.acquire('new');
  assert.equal(temporary.agent.keepAlive, false);
  temporary.release();
  assert.equal(temporary.agent.destroyed, 1);
  assert.equal(active.agent.destroyed, 0);
  active.release();
  f.pool.acquire('third').release();
  assert.equal(active.agent.destroyed, 1);
});

test('une erreur invalide le proxy uniquement après libération des autres consommateurs', () => {
  const f = fixture();
  const failed = f.pool.acquire('proxy');
  const other = f.pool.acquire('proxy');
  failed.release(true);
  assert.equal(other.agent.destroyed, 0);
  const replacement = f.pool.acquire('proxy');
  assert.notEqual(replacement.agent, other.agent);
  other.release();
  assert.equal(other.agent.destroyed, 1);
  replacement.release();
});
