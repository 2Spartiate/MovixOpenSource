import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import i18next from 'i18next';
import type { WrappedData } from '../src/services/wrappedService.ts';
import { buildWrappedShareData, formatWrappedDuration, formatWrappedDurationParts, getWrappedScenes, wrappedDate, wrappedGenre, wrappedGesture, wrappedImageUrl, wrappedMediaKey, wrappedMonth, wrappedPeriod, wrappedSignaturePeriod } from '../src/utils/wrappedPresentation.ts';

const fixture = (): WrappedData => ({
    year: 2026,
    persona: { id: 'cinephile', title: 'Le Cinéphile', description: '', subtitle: '', emoji: '🎬', color: '#000' },
    slides: [{ type: 'intro', title: 'Ancien texte', text: 'Ne pas modifier le payload' }],
    stats: { totalMinutes: 125, totalHours: 2, totalDays: 0, uniqueTitles: 3, totalSessions: 8, totalActiveDays: 4 },
    topContent: [
        { type: 'movie', tmdbId: 42, rank: 1, title: 'Un film', minutes: 80, hours: 1, poster_path: '/movie.jpg' },
        { type: 'tv', tmdbId: 42, rank: 2, title: 'Une série', minutes: 35, hours: 1, poster_path: '/series.jpg' },
        { type: 'live-tv', rank: 3, title: 'Une chaîne', minutes: 10, hours: 0 },
    ],
    byType: [], topPages: [], peakMonth: { month: 8, name: 'Août', minutes: 125 },
    monthlyGraph: [{ month: 8, minutes: 125 }], topGenres: [{ name: 'Comédie', minutes: 125, percent: 100 }],
});

test('le récit est borné, le quiz précède la révélation et le payload est préservé', () => {
    const data = fixture();
    const before = structuredClone(data);
    const scenes = getWrappedScenes(data);
    assert.ok(scenes.length <= 10);
    assert.ok(!scenes.includes('timeline'), 'un seul mois ne remplit pas une scène');
    assert.ok(!scenes.includes('genres'), 'un genre unique ne remplit pas une comparaison');
    assert.equal(new Set(scenes).size, scenes.length);
    assert.ok(scenes.indexOf('quiz') < scenes.indexOf('favorite'));
    assert.equal(scenes.at(-1), 'closing');
    assert.deepEqual(data, before);
});

test('les scènes sans données et le quiz avec moins de trois titres sont omis', () => {
    const data = fixture();
    data.topContent = [];
    data.topGenres = [];
    data.monthlyGraph = [{ month: 1, minutes: 0 }];
    data.stats.totalActiveDays = 0;
    assert.deepEqual(getWrappedScenes(data), ['intro', 'time', 'persona', 'closing']);
    data.topContent = fixture().topContent.slice(0, 1);
    assert.ok(getWrappedScenes(data).includes('favorite'));
    assert.ok(!getWrappedScenes(data).includes('quiz'));
    assert.ok(!getWrappedScenes(data).includes('top-five'));
});

test('les identifiants de films et de séries ne se confondent pas', () => {
    const [film, series] = fixture().topContent;
    assert.notEqual(wrappedMediaKey(film), wrappedMediaKey(series));
    assert.notEqual(wrappedMediaKey({ type: 'live-tv', title: 'A' }), wrappedMediaKey({ type: 'live-tv', title: 'B' }));
});

test('les contributions ajoutent une seule scène et restent facultatives pour les anciens payloads', () => {
    const data = fixture();
    data.community = { commentsPosted: 4, repliesPosted: 2, discussedTitles: 3, calendarTimezone: 'UTC', topTitles: [] };
    assert.ok(getWrappedScenes(data).length <= 10);
    assert.equal(getWrappedScenes(data).filter(scene => scene === 'community').length, 1);
    data.community.commentsPosted = 0;
    data.community.repliesPosted = 0;
    assert.ok(!getWrappedScenes(data).includes('community'));
    data.community = null;
    assert.ok(!getWrappedScenes(data).includes('community'));
});

test('les URLs de posters sont normalisées sans doubler le préfixe', () => {
    assert.equal(wrappedImageUrl('/a.jpg'), 'https://image.tmdb.org/t/p/w500/a.jpg');
    assert.equal(wrappedImageUrl('/a.jpg', 'w1280'), 'https://image.tmdb.org/t/p/w1280/a.jpg');
    assert.equal(wrappedImageUrl('https://image.tmdb.org/t/p/w500/a.jpg'), 'https://image.tmdb.org/t/p/w500/a.jpg');
    for (const path of [null, '', '//example.com/a', 'javascript:alert(1)', 'https://example.com/a']) assert.equal(wrappedImageUrl(path), null);
});

test('les petites durées restent exactes et les valeurs invalides restent affichables', () => {
    assert.equal(formatWrappedDuration(59, 'fr'), '59 min');
    assert.equal(formatWrappedDuration(60, 'fr'), '1 h');
    assert.equal(formatWrappedDuration(125, 'en'), '2 h 5 min');
    assert.deepEqual(formatWrappedDurationParts(125, 'en'), ['2 h', '5 min']);
    assert.deepEqual(formatWrappedDurationParts(59, 'fr'), ['59 min']);
    for (const value of [-1, NaN, Infinity]) assert.equal(formatWrappedDuration(value, 'fr'), '0 min');
    assert.equal(wrappedMonth(8, 'en'), 'August');
    assert.equal(wrappedMonth(13, 'fr'), '—');
});

test('le maintien et le défilement vertical ne naviguent pas', () => {
    assert.equal(wrappedGesture(0, 0, 500, 0.8), 0);
    assert.equal(wrappedGesture(10, 120, 100, 0.8), 0);
    assert.equal(wrappedGesture(-70, 10, 450, 0.8), 1);
    assert.equal(wrappedGesture(70, 10, 450, 0.1), -1);
    assert.equal(wrappedGesture(1, 1, 100, 0.8), 1);
    assert.equal(wrappedGesture(1, 1, 100, 0.1), -1);
});

test('les images et les textes exportés correspondent au récap et à la langue', async () => {
    const translations = Object.fromEntries(['fr', 'en'].map(lang => [lang, { translation: JSON.parse(readFileSync(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url), 'utf8')) }]));
    const instance = i18next.createInstance();
    await instance.init({ lng: 'en', fallbackLng: 'fr', resources: translations });
    const card = buildWrappedShareData(fixture(), 'en', instance.t, 'example.test');
    assert.equal(card.items[0].posterUrl, 'https://image.tmdb.org/t/p/w500/movie.jpg');
    assert.equal(card.items[1].posterUrl, 'https://image.tmdb.org/t/p/w500/series.jpg');
    assert.equal(card.items[2].posterUrl, null);
    assert.equal(card.persona, 'The cinephile');
    assert.equal(card.labels.favorite, 'Most watched');
    assert.equal(card.watchTime, '2 h 5 min');
    assert.equal(wrappedGenre('Comédie', instance.t), 'Comedy');
    assert.equal(wrappedGenre('Science-Fiction & Fantastique', instance.t), 'Sci-fi & fantasy');
    assert.equal(wrappedSignaturePeriod(2026, 'en', instance.t, new Date(2026, 8, 5)), 'Jan – Sep (in progress) · Oct – Dec coming up');
    assert.equal(wrappedSignaturePeriod(2025, 'en', instance.t, new Date(2026, 8, 5)), 'Jan – Dec · full year');
    assert.ok(wrappedSignaturePeriod(2026, 'en', instance.t, new Date(2026, 11, 5)).includes('December in progress'));
    const keys = (obj: Record<string, unknown>, prefix = ''): string[] => Object.entries(obj).flatMap(([key, value]) => typeof value === 'object' && value !== null ? keys(value as Record<string, unknown>, `${prefix}${key}.`) : [`${prefix}${key}`]);
    assert.deepEqual(keys(translations.fr.translation.wrappedStory).sort(), keys(translations.en.translation.wrappedStory).sort());
    assert.deepEqual(keys(translations.fr.translation.wrappedCinema).sort(), keys(translations.en.translation.wrappedCinema).sort());
    assert.deepEqual(keys(translations.fr.translation.wrappedFinish).sort(), keys(translations.en.translation.wrappedFinish).sort());
    const data = fixture();
    const partial = wrappedPeriod(data, 'en', instance.t, new Date(2026, 8, 19));
    assert.match(partial, /in progress/);
    assert.match(wrappedPeriod(data, 'en', instance.t, new Date(2027, 0, 1)), /January to December/);
    assert.match(wrappedPeriod({ ...data, isDemo: true }, 'en', instance.t, new Date(2026, 8, 19)), /January to December/);
    assert.equal(wrappedDate('2026-09-19', 'fr'), '19 septembre');
});
