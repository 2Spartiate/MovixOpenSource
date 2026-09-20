const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildRace, buildFormatWinners, buildEras } = require('../wrappedStory');

const now = new Date(Date.UTC(2026, 5, 15));
const row = (month, type, id, seconds, genres = []) => ({ month, content_type: type, content_id: String(id), content_title: `${type}-${id}`, seconds, genres });

test('la course garde les clés type/id distinctes et les minutes mensuelles non cumulées', () => {
    const annual = [row(0, 'movie', 7, 180), row(0, 'tv', 7, 120), row(0, 'anime', 9, 60)];
    const race = buildRace(annual, [row(1, 'movie', 7, 60), row(2, 'movie', 7, 120), row(1, 'tv', 7, 120), row(2, 'anime', 9, 60)], 2026, now);
    assert.equal(race.items.length, 3);
    assert.deepEqual(race.months.slice(0, 2), [{ month: 1, minutes: [1, 2, 0] }, { month: 2, minutes: [2, 0, 1] }]);
    assert.equal(race.months.length, 6);
    assert.equal(race.months.flatMap(item => item.minutes).reduce((sum, minutes) => sum + minutes, 0), 6);
});

test('la course départage avec les secondes brutes puis le format et l’identifiant lexicaux', () => {
    const annual = [
        row(0, 'movie', 7, 119),
        row(0, 'tv', 7, 120),
        row(0, 'anime', 8, 120),
        row(0, 'movie', 10, 120),
        row(0, 'movie', 2, 120),
    ];
    const race = buildRace(annual, [], 2025, now);
    assert.deepEqual(race.items.map(item => [item.content_type, item.content_id]), [
        ['anime', '8'], ['movie', '10'], ['movie', '2'], ['tv', '7'], ['movie', '7']
    ]);
    assert.equal(race.items[3].duration, 2);
    assert.ok(race.items[4].duration < 2);
});

test('les années passées ont douze mois et les gagnants de format parcourent tous les titres', () => {
    const annual = [row(0, 'movie', 1, 1000), row(0, 'movie', 2, 900), row(0, 'movie', 3, 800), row(0, 'movie', 4, 700), row(0, 'movie', 5, 600), row(0, 'tv', 99, 500), row(0, 'anime', 4, 420)];
    assert.equal(buildRace(annual, [], 2025, now).months.length, 12);
    assert.deepEqual(buildFormatWinners(annual).map(item => item.content_id), ['1', '99', '4']);
    assert.ok(!buildRace(annual, [], 2025, now).items.some(item => item.content_type === 'tv'));
});

test('les périodes ne fabriquent pas de genre sous une faible couverture et ne franchissent pas un mois vide', () => {
    const rows = [
        row(1, 'movie', 1, 600, ['Drama']), row(1, 'tv', 2, 400, []), // 60 % covered, format movie wins
        row(2, 'movie', 3, 600, ['Drama']), row(2, 'tv', 4, 400, []),
        // month 3 deliberately inactive
        row(4, 'movie', 5, 800, ['Drama']), row(4, 'tv', 6, 200, ['Comedy']),
    ];
    const eras = buildEras(rows, 2026, now);
    assert.equal(eras.length, 2);
    assert.deepEqual(eras.map(item => [item.kind, item.label, item.fromMonth, item.toMonth]), [['format', 'movie', 1, 2], ['genre', 'Drama', 4, 4]]);
    assert.equal(eras[1].coverage, 100);
});

test('un genre doit représenter 40 % du mois réel, pas seulement des titres couverts', () => {
    const rows = [row(1, 'movie', 1, 30, ['Drama']), row(1, 'tv', 2, 20, ['Comedy']), row(1, 'anime', 3, 20, ['Action']), row(1, 'movie', 4, 30, [])];
    const eras = buildEras(rows, 2026, now);
    assert.deepEqual(eras.map(item => [item.kind, item.label, item.share]), [['format', 'movie', 60]]);
});
