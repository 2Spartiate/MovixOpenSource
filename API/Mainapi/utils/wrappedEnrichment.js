function remaining(deadline, now) {
    return Math.max(0, deadline - now());
}

async function runBudgetedBatches(items, fetchItem, { concurrency = 6, budgetMs = 8000, now = Date.now } = {}) {
    const deadline = now() + Math.max(0, budgetMs);
    const results = [];
    for (let offset = 0; offset < items.length && remaining(deadline, now) > 0; offset += concurrency) {
        const batch = items.slice(offset, offset + concurrency);
        const settled = await Promise.all(batch.map(async (item) => {
            const left = remaining(deadline, now);
            if (left <= 0) return null;
            const controller = new AbortController();
            let timer;
            try {
                const expiry = new Promise((resolve) => {
                    timer = setTimeout(() => {
                        controller.abort();
                        resolve(null);
                    }, left);
                });
                return await Promise.race([
                    Promise.resolve().then(() => fetchItem(item, { signal: controller.signal })).catch(() => null),
                    expiry
                ]);
            } finally {
                clearTimeout(timer);
            }
        }));
        results.push(...settled.filter(Boolean));
    }
    return results;
}

module.exports = { runBudgetedBatches };
