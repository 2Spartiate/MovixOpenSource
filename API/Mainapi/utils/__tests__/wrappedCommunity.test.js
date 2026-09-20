const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { fetchWrappedCommunity } = require('../wrappedCommunity');

function fixture() {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE comments (id INTEGER PRIMARY KEY, content_type TEXT, content_id TEXT, user_id TEXT, user_type TEXT, profile_id TEXT, created_at INTEGER, deleted INTEGER, content TEXT, is_spoiler INTEGER);
             CREATE TABLE comment_replies (id INTEGER PRIMARY KEY, comment_id INTEGER, user_id TEXT, user_type TEXT, profile_id TEXT, created_at INTEGER, deleted INTEGER);
             CREATE TABLE comment_reactions (id INTEGER PRIMARY KEY, target_type TEXT, target_id INTEGER, user_id TEXT, user_type TEXT, profile_id TEXT, created_at INTEGER);`);
    const date = Date.UTC(2026, 5, 10);
    const comments = [
        [1, 'movie', '42', 'a', 'oauth', 'p1', date, 0],
        [2, 'tv', '42', 'a', 'oauth', 'p1', date, 0],
        [3, 'movie', '99', 'a', 'oauth', 'p2', date, 0],
        [4, 'movie', '99', 'b', 'oauth', 'p1', date, 0],
        [5, 'movie', '99', 'a', 'bip39', 'p1', date, 0],
        [6, 'movie', '99', 'a', 'oauth', 'p1', Date.UTC(2025, 11, 31), 0],
        [7, 'movie', '99', 'a', 'oauth', 'p1', Date.UTC(2027, 0, 1), 0],
        [8, 'movie', '99', 'a', 'oauth', 'p1', date, 1],
        [9, 'tv', '84', 'b', 'oauth', 'p2', Date.UTC(2025, 0, 1), 0],
        [10, 'tv', '85', 'b', 'oauth', 'p2', date, 1],
    ];
    comments.forEach(row => db.prepare('INSERT INTO comments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(...row, `citation ${row[0]}`, row[0] === 1 ? 1 : 0));
    const replies = [
        [1, 1, 'a', 'oauth', 'p1', date, 0],
        [2, 1, 'a', 'oauth', 'p2', date, 0],
        [3, 1, 'b', 'oauth', 'p1', date, 0],
        [4, 1, 'a', 'bip39', 'p1', date, 0],
        [5, 1, 'a', 'oauth', 'p1', date, 1],
        [6, 9, 'a', 'oauth', 'p1', date, 0],
        [7, 10, 'a', 'oauth', 'p1', date, 0],
        [8, 1, 'a', 'oauth', 'p1', Date.UTC(2027, 0, 1), 0],
    ];
    replies.forEach(row => db.prepare('INSERT INTO comment_replies VALUES (?, ?, ?, ?, ?, ?, ?)').run(...row));
    const reactions = [
        [1, 'comment', 1, 'b', 'oauth', 'p1', date],
        [2, 'comment', 1, 'a', 'oauth', 'p1', date],
        [3, 'comment', 1, 'c', 'oauth', 'p1', Date.UTC(2027, 0, 1)],
    ];
    reactions.forEach(row => db.prepare('INSERT INTO comment_reactions VALUES (?, ?, ?, ?, ?, ?, ?)').run(...row));
    const calls = [];
    return {
        db, calls,
        pool: { execute: async (options, params) => { calls.push({ options, params }); return [db.prepare(options.sql).all(...params)]; } },
    };
}

const scope = { userId: 'a', userType: 'oauth', profileId: 'p1', year: 2026 };

test('agrège uniquement les publications visibles du compte, du type d’auth et du profil', async () => {
    const f = fixture();
    try {
        const data = await fetchWrappedCommunity(f.pool, scope);
        assert.equal(data.commentsPosted, 2);
        assert.equal(data.repliesPosted, 2);
        assert.equal(data.discussedTitles, 3);
        assert.deepEqual(data.topTitles[0], { type: 'movie', tmdbId: 42, contributions: 2 });
        assert.ok(data.topTitles.some(item => item.type === 'tv' && item.tmdbId === 42));
        assert.ok(data.topTitles.some(item => item.tmdbId === 84));
        assert.equal(data.calendarTimezone, 'UTC');
    } finally { f.db.close(); }
});

test('retient une citation exacte, visible et reçue, en excluant les auto-interactions', async () => {
    const f = fixture();
    try {
        const data = await fetchWrappedCommunity(f.pool, scope);
        assert.deepEqual(data.highlight, {
            id: 1, content: 'citation 1', createdAt: Date.UTC(2026, 5, 10), isSpoiler: true,
            reactions: 1, replies: 2, reason: 'replies', type: 'movie', tmdbId: 42
        });
    } finally { f.db.close(); }
});

test('le départage de citation est stable par date puis identifiant', async () => {
    const f = fixture();
    try {
        const date = Date.UTC(2026, 8, 1);
        f.db.prepare('INSERT INTO comments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(11, 'movie', '43', 'a', 'oauth', 'p1', date, 0, 'plus récent', 0);
        f.db.prepare('INSERT INTO comment_reactions VALUES (?, ?, ?, ?, ?, ?, ?)').run(11, 'comment', 11, 'b', 'oauth', 'p1', date);
        f.db.prepare('INSERT INTO comment_reactions VALUES (?, ?, ?, ?, ?, ?, ?)').run(12, 'comment', 11, 'c', 'oauth', 'p1', date);
        const data = await fetchWrappedCommunity(f.pool, scope);
        assert.equal(data.highlight.id, 11);
    } finally { f.db.close(); }
});

test('l’absence de profil ou un type de compte inconnu ne lance aucune requête globale', async () => {
    const f = fixture();
    try {
        for (const change of [{ profileId: null }, { userType: 'unknown' }, { year: '2026' }, { year: 2026.5 }]) {
            assert.equal(await fetchWrappedCommunity(f.pool, { ...scope, ...change }), null);
        }
        assert.equal(f.calls.length, 0);
    } finally { f.db.close(); }
});

test('les bornes annuelles sont UTC, inclusives à gauche et exclusives à droite', async () => {
    const f = fixture();
    try {
        await fetchWrappedCommunity(f.pool, scope);
        assert.deepEqual(f.calls[0].params.slice(3, 5), [Date.UTC(2026, 0, 1), Date.UTC(2027, 0, 1)]);
        assert.equal(f.calls[0].options.timeout, 4000);
    } finally { f.db.close(); }
});

test('un échec de la citation conserve les agrégats communautaires', async () => {
    const f = fixture();
    try {
        const pool = { execute: async (...args) => {
            if (f.calls.length > 0) throw new Error('citation indisponible');
            return f.pool.execute(...args);
        } };
        const data = await fetchWrappedCommunity(pool, scope);
        assert.equal(data.commentsPosted, 2);
        assert.equal(data.highlight, null);
    } finally { f.db.close(); }
});

test('les identifiants restent des paramètres, y compris quand ils contiennent de la syntaxe SQL', async () => {
    const f = fixture();
    try {
        const profileId = "p1' OR 1=1 --";
        const data = await fetchWrappedCommunity(f.pool, { ...scope, profileId });
        assert.equal(data.commentsPosted, 0);
        assert.ok(!f.calls[0].options.sql.includes(profileId));
        assert.equal(f.calls[0].params[2], profileId);
        assert.equal(f.calls[0].params[7], profileId);
    } finally { f.db.close(); }
});
