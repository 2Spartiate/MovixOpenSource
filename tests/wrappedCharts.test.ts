import assert from 'node:assert/strict';
import test from 'node:test';
import { chartAxis, chartCurve, formatSectors, polarPoint, ringSector, wrappedChartKey, wrappedHours, wrappedMonths } from '../src/utils/wrappedCharts.ts';

test('l’échelle contient le maximum et garde une origine nulle', () => {
    for (const value of [0, 1, 12, 486, 8000, 200000, NaN]) {
        const axis = chartAxis(value);
        assert.equal(axis.ticks[0], 0);
        assert.equal(axis.ticks[axis.ticks.length - 1], axis.max);
        assert.ok(axis.max >= (Number.isFinite(value) ? value : 0));
        assert.ok(axis.ticks.every(Number.isFinite));
    }
});

test('le mois partiel et les mois à venir ne sont pas confondus avec des mois vides terminés', () => {
    const months = wrappedMonths({ year: 2026, monthlyGraph: [{ month: 8, minutes: 486 }, { month: 9, minutes: 12 }] }, new Date(2026, 8, 5));
    assert.equal(months[0].future, false);
    assert.equal(months[8].current, true);
    assert.equal(months[8].minutes, 12);
    assert.equal(months[9].future, true);
    assert.ok(wrappedMonths({ year: 2025 }, new Date(2026, 8, 5)).every(month => !month.future && !month.current));
});

test('la courbe garde les extrémités de chaque intervalle dans leur plage', () => {
    const points = [{ x: 0, y: 10 }, { x: 20, y: 100 }, { x: 40, y: 5 }];
    assert.equal(chartCurve(points), 'M 0 10 C 10 10, 10 100, 20 100 C 30 100, 30 5, 40 5');
    assert.equal(chartCurve([]), '');
});

test('les secteurs s’appuient sur la durée et ignorent les valeurs invalides', () => {
    const sectors = formatSectors([
        { type: 'movie', minutes: 75, percent: 75, count: 2 },
        { type: 'tv', minutes: 25, percent: 25, count: 1 },
        { type: 'anime', minutes: 0, percent: 0, count: 0 },
    ]);
    assert.equal(sectors.length, 2);
    assert.equal(sectors[0].middle, 135);
    assert.equal(sectors[1].middle, 315);
    assert.deepEqual(formatSectors([]), []);
});

test('les secteurs nuls et le cercle complet restent des chemins SVG valides', () => {
    assert.equal(ringSector(0, 0, 20, 20, 0, 90), '');
    assert.equal(ringSector(0, 0, 10, 20, 90, 0), '');
    assert.ok(!ringSector(0, 0, 10, 20, 0, 360).includes('NaN'));
    assert.ok(Math.abs(polarPoint(100, 100, 50, 0).y - 50) < 0.001);
});

test('l’horloge contient 24 heures sans inventer d’activité', () => {
    const hours = wrappedHours([{ hour: 18, minutes: 287 }, { hour: 3, minutes: NaN }]);
    assert.equal(hours.length, 24);
    assert.equal(hours[18].minutes, 287);
    assert.equal(hours[3].minutes, 0);
    assert.equal(hours[0].minutes, 0);
});

test('les graphiques restent explorables au clavier sans dépasser leurs bornes', () => {
    assert.equal(wrappedChartKey('ArrowLeft', 1, 1, 12), 1);
    assert.equal(wrappedChartKey('ArrowRight', 12, 1, 12), 12);
    assert.equal(wrappedChartKey('ArrowUp', 18, 0, 23), 19);
    assert.equal(wrappedChartKey('ArrowDown', 18, 0, 23), 17);
    assert.equal(wrappedChartKey('Home', 18, 0, 23), 0);
    assert.equal(wrappedChartKey('End', 4, 1, 12), 12);
    assert.equal(wrappedChartKey('Escape', 4, 1, 12), null);
});
