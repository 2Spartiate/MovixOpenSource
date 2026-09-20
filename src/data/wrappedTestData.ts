import type { TFunction } from 'i18next';
import type { WrappedData, WrappedSlide, WrappedTopContent } from '@/services/wrappedService';

/** Répartit des minutes entières en conservant exactement le total. */
function distribute(total: number, weights: number[]): number[] {
    const sum = weights.reduce((a, b) => a + b, 0);
    let remaining = total;
    return weights.map((weight, index) => {
        const value = index === weights.length - 1 ? remaining : Math.floor(total * weight / sum);
        remaining -= value;
        return value;
    });
}

/** Données entièrement fictives, identiques pour A et B, recréées à chaque appel. */
export function createWrappedTestData(year: number, locale: string, t: TFunction): WrappedData {
    const monthlyGraph = [1295, 1128, 1624, 1876, 1512, 2077, 2318, 1789, 1486, 1935, 2542, 2828].map((minutes, index) => ({
        month: index + 1,
        minutes,
    }));
    const totalMinutes = monthlyGraph.reduce((sum, month) => sum + month.minutes, 0);
    const peak = monthlyGraph.reduce((best, month) => month.minutes > best.minutes ? month : best);
    const uniqueTitles = 96;
    const totalSessions = Math.round(totalMinutes / 72);
    const topGenres = [
        ['scifi', 45], ['drama', 42], ['adventure', 30], ['comedy', 23], ['animation', 19],
    ].map(([key, percent]) => ({
        name: t(`wrappedStory.genres.${key}`),
        minutes: Math.round(totalMinutes * Number(percent) / 100),
        percent: Number(percent),
    }));
    const topContent: WrappedTopContent[] = [
        { rank: 1, title: 'The Bear', type: 'tv', tmdbId: 136315, year: 2022, poster_path: '/iaJfffjCqXATU5msr4PAgOWLMl4.jpg', backdrop_path: '/aJtG4txtmiRHwAAqENQHZvBs6kY.jpg', vote_average: 8.1, genres: [topGenres[1].name, topGenres[3].name], minutes: 2280, hours: 38 },
        { rank: 2, title: 'Frieren', type: 'anime', tmdbId: 209867, year: 2023, poster_path: '/j8K7vgF3Kp5T6EwJvez9B4it6CB.jpg', backdrop_path: '/rBOnrVlck7BIlGeWVlzYiZeg4l2.jpg', vote_average: 8.8, genres: [topGenres[4].name, topGenres[1].name, t('wrappedStory.genres.actionAdventure'), t('wrappedStory.genres.scifiFantasy')], minutes: 1232, hours: 21 },
        { rank: 3, title: locale.startsWith('fr') ? 'Dune : Deuxième partie' : 'Dune: Part Two', type: 'movie', tmdbId: 693134, year: 2024, poster_path: '/iRNbRAIGQQr5diGnjpwJFm0dgt4.jpg', backdrop_path: '/eZ239CUp1d6OryZEBPnO2n87gMG.jpg', vote_average: 8.1, genres: [topGenres[0].name, topGenres[2].name], minutes: 824, hours: 14 },
        { rank: 4, title: 'Inception', type: 'movie', tmdbId: 27205, year: 2010, poster_path: '/aej3LRUga5rhgkmRP6XMFw3ejbl.jpg', backdrop_path: '/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg', vote_average: 8.4, genres: [t('wrappedStory.genres.action'), topGenres[0].name, topGenres[2].name], minutes: 612, hours: 10 },
        { rank: 5, title: 'Whiplash', type: 'movie', tmdbId: 244786, year: 2014, poster_path: '/3XriEpTdnplQRzyphAC0cu3emns.jpg', backdrop_path: '/fRGxZuo7jJUWQsVg9PREb98Aclp.jpg', vote_average: 8.4, genres: [topGenres[1].name, t('wrappedStory.genres.music'), t('wrappedStory.genres.thriller')], minutes: 543, hours: 9 },
    ];
    const typeMinutes = distribute(totalMinutes, [47, 34, 19]);
    const typeCounts = distribute(uniqueTitles, [47, 34, 19]);
    const hourMinutes = distribute(totalMinutes, [2, 1, 0, 0, 0, 0, 1, 2, 4, 3, 2, 3, 6, 4, 3, 4, 6, 9, 13, 18, 24, 25, 16, 8]);
    const weekdayMinutes = distribute(totalMinutes, [20, 10, 9, 11, 12, 17, 21]);
    const lastDate = `${year}-12-30T20:42:00Z`;
    const recordMinutes = 420;
    const duration = `${Math.floor(totalMinutes / 60)} ${t('wrapped.hoursShort')} ${totalMinutes % 60} ${t('wrapped.minutesShort')}`;
    const persona = {
        id: 'omnivore', title: t('wrappedStory.personas.omnivore'), emoji: '🎬',
        subtitle: t('wrappedStory.personaLabel'), description: t('wrappedStory.introCaption'), color: '#a855f7',
    };
    const slides: WrappedSlide[] = [
        { type: 'intro', title: t('wrapped.yourYear'), subtitle: String(year), text: t('wrapped.spentOnMovix'), highlight: duration },
        { type: 'timeline', title: t('wrappedStory.timelineTitle'), subtitle: t('wrapped.mostActiveMonth'), text: t('wrappedStory.timelineCaption', { duration: `${Math.floor(peak.minutes / 60)} ${t('wrapped.hoursShort')} ${peak.minutes % 60} ${t('wrapped.minutesShort')}` }) },
        { type: 'top-genres', title: t('wrapped.topGenres'), subtitle: t('wrappedStory.genresCaption'), text: '' },
        { type: 'quiz', title: t('wrapped.quizTitle'), subtitle: t('wrapped.quizSubtitle'), text: '' },
        { type: 'top1', title: topContent[0].title, subtitle: t('wrappedStory.favoriteLabel'), text: t('wrapped.shareTopContentLine', { title: topContent[0].title }) },
        { type: 'top5', title: t('wrappedStory.topFiveTitle'), subtitle: t('wrapped.topContents'), text: '' },
        { type: 'rewatch', title: t('wrappedStory.returnTitle'), subtitle: topContent[2].title, text: t('wrappedStory.returnDays', { count: 5 }), highlight: '5' },
        { type: 'record-day', title: t('wrappedStory.recordDay'), text: t('wrappedStory.recordCaption', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(lastDate)), duration: `7 ${t('wrapped.hoursShort')}` }), highlight: `7 ${t('wrapped.hoursShort')}` },
        { type: 'listening-clock', title: t('wrappedStory.rhythmTitle'), subtitle: t('wrappedStory.peakHour'), text: '21:00' },
        { type: 'streak', title: t('wrapped.bestStreak'), subtitle: t('wrappedStory.consecutiveDays'), text: t('wrapped.shareStreakValue', { days: 9 }) },
        { type: 'watch-age', title: t('wrappedStory.medianYear'), text: '2016', highlight: '2016' },
        { type: 'pages-time', title: t('wrappedStory.browsing'), text: t('wrapped.yearSummary') },
        { type: 'fun-fact', title: t('wrapped.uniqueTitlesLabel'), text: t('wrapped.shareTitlesLine', { count: uniqueTitles }), highlight: '🍿' },
        { type: 'persona', title: persona.title, subtitle: persona.subtitle, text: persona.description, highlight: persona.emoji },
        { type: 'detailed-stats', title: t('wrapped.yourStatistics'), subtitle: t('wrapped.inDetail'), text: t('wrapped.yearSummary') },
        { type: 'closing', title: t('wrappedStory.closingTitle'), subtitle: t('wrapped.shareImageSubtitle'), text: t('wrapped.shareSummaryLine', { watchTime: duration }), highlight: '🎬' },
    ];

    return {
        year, isDemo: true, persona, slides, topContent, topGenres, monthlyGraph,
        story: {
            race: {
                items: topContent.map(item => ({ ...item })),
                months: monthlyGraph.map(({ month }) => ({ month, minutes: topContent.map((item, index) => distribute(item.minutes, [
                    [0, 0, 0, 0, 0, 1, 2, 2, 4, 5, 7, 9],
                    [0, 2, 4, 6, 7, 5, 4, 2, 0, 0, 0, 0],
                    [8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 0, 0],
                    [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
                    [0, 0, 1, 1, 1, 1, 1, 2, 2, 3, 3, 3],
                ][index])[month - 1]) })),
            },
            eras: [
                { fromMonth: 1, toMonth: 4, kind: 'genre', label: topGenres[0].name, share: 52, coverage: 100, title: topContent[2] },
                { fromMonth: 5, toMonth: 8, kind: 'genre', label: t('wrappedStory.genres.animation'), share: 44, coverage: 96, title: topContent[1] },
                { fromMonth: 9, toMonth: 12, kind: 'genre', label: topGenres[1].name, share: 64, coverage: 91, title: topContent[0] },
            ],
            formatWinners: [topContent[2], topContent[0], topContent[1]].map(item => ({ ...item, rank: 1 })),
        },
        stats: {
            totalMinutes, totalHours: Math.round(totalMinutes / 60), totalDays: Number((totalMinutes / 1440).toFixed(1)),
            uniqueTitles, totalSessions, avgSessionMinutes: Math.round(totalMinutes / totalSessions),
            totalActiveDays: 174, longestStreak: 9, percentile: 88,
        },
        byType: (['movie', 'tv', 'anime'] as const).map((type, index) => ({ type, minutes: typeMinutes[index], count: typeCounts[index], percent: [47, 34, 19][index] })),
        peakMonth: { ...peak, name: new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, peak.month - 1, 1))) },
        listeningClock: hourMinutes.map((minutes, hour) => ({ hour, minutes })),
        weekday: weekdayMinutes.map((minutes, index) => ({ dow: index + 1, minutes })),
        peakHour: 21,
        firstWatch: { title: topContent[2].title, type: topContent[2].type, tmdbId: topContent[2].tmdbId, date: `${year}-01-03T21:17:00Z` },
        lastWatch: { title: topContent[3].title, type: topContent[3].type, tmdbId: topContent[3].tmdbId, date: lastDate },
        recordDay: { date: lastDate.slice(0, 10), minutes: recordMinutes },
        rewatch: { title: topContent[2].title, type: 'movie', count: 5 },
        watchAgeYear: 2016,
        topPages: [{ page: 'home', minutes: 180 }, { page: 'movies', minutes: 126 }, { page: 'movie-details', minutes: 84 }],
        community: {
            commentsPosted: 48, repliesPosted: 27, discussedTitles: 18, calendarTimezone: 'UTC',
            highlight: { id: 1701, content: t('wrappedMotion.demoComment'), createdAt: Date.UTC(year, 5, 18), isSpoiler: false, reactions: 62, replies: 19, reason: 'reactions', type: 'tv', tmdbId: topContent[0].tmdbId!, title: topContent[0].title, poster_path: topContent[0].poster_path! },
            topTitles: topContent.slice(0, 3).map((item, index) => ({ type: item.type as 'tv' | 'anime' | 'movie', tmdbId: item.tmdbId!, title: item.title, poster_path: item.poster_path!, contributions: [21, 14, 9][index] })),
        },
    };
}
