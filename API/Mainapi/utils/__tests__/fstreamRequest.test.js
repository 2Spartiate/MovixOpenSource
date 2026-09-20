const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  const filename = path.join(__dirname, '..', 'cacheManager.js');
  const source = fs.readFileSync(filename, 'utf8');
  // Isolate the request coordinator without loading Redis or creating caches.
  const section = source.slice(source.indexOf('const ongoingFStreamRequests'), source.indexOf('const generateFStreamCacheKey'));
  const timers = new Set();
  const context = {
    setTimeout(callback, delay) {
      const timer = { callback, delay };
      timers.add(timer);
      return timer;
    },
    clearTimeout(timer) { timers.delete(timer); },
  };
  vm.runInNewContext(`${section}\nthis.request = getOrCreateFStreamRequest;`, context, { filename });
  return { request: context.request, timers };
}

test('FStream limits caller waits to 8 seconds without starting a duplicate scrape', async () => {
  const { request, timers } = fixture();
  let finish, calls = 0;
  const gate = new Promise(resolve => { finish = resolve; });
  const scrape = async () => { calls++; return gate; };
  const first = request('key', scrape);
  try {
    assert.equal(timers.size, 1, 'the HTTP caller must have a deadline');
    const timer = [...timers][0];
    assert.equal(timer.delay, 8000);
    const rejected = assert.rejects(first, /timeout of 8000ms exceeded/);
    timer.callback();
    await rejected;
    assert.equal(timers.size, 0);

    const second = request('key', scrape);
    finish('ready');
    assert.equal(await second, 'ready');
    assert.equal(calls, 1, 'a timed-out waiter must not forget the active scrape');
    assert.equal(timers.size, 0);
  } finally {
    finish('ready');
    await first.catch(() => {});
  }
});

test('FStream clears its deadline and in-flight entry after completion', async () => {
  const { request, timers } = fixture();
  let calls = 0;
  const scrape = async () => ++calls;
  assert.equal(await request('key', scrape), 1);
  assert.equal(await request('key', scrape), 2);
  assert.equal(timers.size, 0);
});
