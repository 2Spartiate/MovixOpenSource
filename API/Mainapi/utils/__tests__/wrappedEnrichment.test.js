const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runBudgetedBatches } = require('../wrappedEnrichment');

test('arrête les lots au budget, annule les fetches actifs et conserve les résultats déjà arrivés', async () => {
    const started = [];
    const aborted = [];
    const startedAt = Date.now();
    const results = await runBudgetedBatches([1, 2, 3, 4], (item, { signal }) => new Promise((resolve) => {
        started.push(item);
        const delay = setTimeout(() => resolve(item === 1 ? { item } : null), item === 1 ? 5 : 80);
        signal.addEventListener('abort', () => {
            clearTimeout(delay);
            aborted.push(item);
            resolve(null);
        }, { once: true });
    }), { concurrency: 2, budgetMs: 25 });
    assert.deepEqual(results, [{ item: 1 }]);
    assert.deepEqual(started, [1, 2]);
    assert.deepEqual(aborted, [2]);
    assert.ok(Date.now() - startedAt < 70);
});
