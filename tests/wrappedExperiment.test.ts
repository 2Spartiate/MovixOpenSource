import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import i18next from 'i18next';
import { defaultWrappedYear, getWrappedExperiment, isWrappedTestRoute } from '../src/utils/wrappedExperiment.ts';
import { createWrappedTestData } from '../src/data/wrappedTestData.ts';
import { buildWrappedShareData, getWrappedScenes, wrappedPersona, wrappedTypeLabel } from '../src/utils/wrappedPresentation.ts';
import { wrappedMonths } from '../src/utils/wrappedCharts.ts';

const translations = i18next.createInstance();
await translations.init({
    lng: 'fr', fallbackLng: false, interpolation: { escapeValue: false },
    resources: Object.fromEntries(['fr', 'en'].map(language => [language, {
        translation: JSON.parse(readFileSync(new URL(`../src/i18n/locales/${language}.json`, import.meta.url), 'utf8')),
    }])),
});

test('seules les routes Wrapped explicitement en test peuvent ignorer la sélection du profil', () => {
    for (const pathname of ['/wrapped', '/wrapped/', '/wrapped/2026', '/wrapped/2026/']) {
        assert.equal(isWrappedTestRoute(pathname, '?test=true&version=A'), true);
        assert.equal(isWrappedTestRoute(pathname, '?test=true&version=B'), true);
        assert.equal(isWrappedTestRoute(pathname, '?version=A'), false);
        assert.equal(isWrappedTestRoute(pathname, '?test=false'), false);
    }
    for (const pathname of ['/', '/movies', '/wrapped-other', '/wrapped/2026/details', '/profile-selection']) {
        assert.equal(isWrappedTestRoute(pathname, '?test=true'), false);
    }
});
const now = new Date(2026, 8, 5);

test('la campagne de janvier reste sur l’année terminée, sans modifier les routes explicites', () => {
    assert.equal(defaultWrappedYear(new Date(2026, 11, 31)), 2026);
    assert.equal(defaultWrappedYear(new Date(2027, 0, 1)), 2026);
    assert.equal(defaultWrappedYear(new Date(2027, 0, 31)), 2026);
    assert.equal(defaultWrappedYear(new Date(2027, 1, 1)), 2027);
    assert.equal(defaultWrappedYear(new Date(2024, 0, 1)), 2024);
});

test('B reste la version par défaut et seul test=true active les fixtures', () => {
    for (const search of ['', '?test=false', '?test=1', '?test=True', '?test', '?version=unknown']) {
        assert.deepEqual(getWrappedExperiment(search), { test: false, version: 'B' });
    }
    assert.deepEqual(getWrappedExperiment('?test=true'), { test: true, version: 'B' });
    assert.deepEqual(getWrappedExperiment('?test=true&version=A'), { test: true, version: 'A' });
    assert.deepEqual(getWrappedExperiment('?version=b&test=true'), { test: true, version: 'B' });
    assert.deepEqual(getWrappedExperiment('?version=a'), { test: false, version: 'A' });
    assert.deepEqual(getWrappedExperiment('?test=false&version=A'), { test: false, version: 'A' });
});

test('la comparaison utilise des données déterministes et chaque lecteur peut isoler ses mutations', () => {
    const a = createWrappedTestData(2026, 'fr', translations.t);
    const b = createWrappedTestData(2026, 'fr', translations.t);
    assert.deepEqual(a, b);
    a.slides.splice(1, 0, { type: 'top3-focus', title: 'Ajout historique', text: '' });
    a.topContent[0].genres!.push('Mutation');
    assert.notDeepEqual(a.slides, b.slides);
    assert.ok(!b.topContent[0].genres!.includes('Mutation'));
    assert.equal(b.slides.at(-1)?.type, 'closing');
    assert.equal(getWrappedScenes(b).length, 10);
    assert.ok(getWrappedScenes(b).includes('community'));
});

test('les fixtures simulent douze mois complets avec des totaux cohérents et des médias variés', () => {
    for (const year of [2024, 2025, 2026]) {
        const data = createWrappedTestData(year, 'fr', translations.t);
        for (const series of [data.monthlyGraph!, data.byType, data.listeningClock!, data.weekday!]) {
            assert.equal(series.reduce((sum, item) => sum + item.minutes, 0), data.stats.totalMinutes);
        }
        assert.equal(data.byType.reduce((sum, item) => sum + item.count, 0), data.stats.uniqueTitles);
        assert.equal(data.stats.totalHours, Math.round(data.stats.totalMinutes / 60));
        assert.equal(data.peakMonth.minutes, Math.max(...data.monthlyGraph!.map(month => month.minutes)));
        assert.ok(data.topContent.reduce((sum, item) => sum + item.minutes, 0) < data.byType[0].minutes);
        assert.ok(data.firstWatch!.date.startsWith(String(year)));
        assert.ok(data.lastWatch!.date.startsWith(String(year)));
        assert.equal(data.monthlyGraph!.filter(month => month.minutes > 0).length, 12);
        assert.ok(wrappedMonths(data, now).every(month => !month.current && !month.future));
        assert.ok(data.topContent.every(item => item.poster_path?.startsWith('/') && item.backdrop_path?.startsWith('/') && item.genres?.length && item.vote_average));
        assert.deepEqual(new Set(data.topContent.map(item => item.type)), new Set(['movie', 'tv', 'anime']));
        const card = buildWrappedShareData(data, 'fr', translations.t, 'example.test');
        assert.equal(card.signatureFutureFrom, null);
        assert.ok(card.signatureCaption.includes('année complète'));
    }
});

test('les textes de test suivent la langue et gardent les mêmes statistiques', () => {
    const fr = createWrappedTestData(2026, 'fr', translations.getFixedT('fr'));
    const en = createWrappedTestData(2026, 'en', translations.getFixedT('en'));
    assert.deepEqual(fr.stats, en.stats);
    assert.deepEqual(fr.monthlyGraph, en.monthlyGraph);
    assert.notEqual(fr.slides[0].title, en.slides[0].title);
    assert.notEqual(fr.persona.title, en.persona.title);
    assert.equal(wrappedPersona(fr, translations.getFixedT('fr')), fr.persona.title);
    assert.equal(wrappedPersona(en, translations.getFixedT('en')), en.persona.title);
    assert.equal(fr.peakMonth.name, 'décembre');
    assert.equal(en.peakMonth.name, 'December');
    assert.equal(wrappedTypeLabel('anime', translations.getFixedT('fr')), 'Anime');
    assert.equal(wrappedTypeLabel('anime', translations.getFixedT('en')), 'Anime');
    assert.ok(!JSON.stringify(en).includes('wrappedStory.'));
});
