import type { TFunction } from 'i18next';
import type { WrappedData, WrappedTopContent } from '@/services/wrappedService';
import type { WrappedScene, WrappedShareCardData } from '@/types/wrapped';
import { selectWrappedScenes, wrappedTraitFacts } from './wrappedStory.ts';

// Les formateurs Intl sont coûteux à créer pendant un survol de graphique.
// Cache borné : aucun stockage de données personnelles ni de libellés utilisateur.
const numberFormatters = new Map<string, Intl.NumberFormat>();
const monthFormatters = new Map<string, Intl.DateTimeFormat>();

function numberFormatter(locale: string) {
    let formatter = numberFormatters.get(locale);
    if (!formatter) {
        formatter = new Intl.NumberFormat(locale);
        if (numberFormatters.size >= 12) numberFormatters.delete(numberFormatters.keys().next().value!);
        numberFormatters.set(locale, formatter);
    }
    return formatter;
}

export function getWrappedScenes(data: WrappedData): WrappedScene[] {
    return selectWrappedScenes(data);
}

export function wrappedMediaKey(item: Pick<WrappedTopContent, 'type' | 'tmdbId' | 'title'>): string {
    return `${item.type}:${item.tmdbId ?? item.title}`;
}

/** Le backend fournit normalement un chemin TMDB ; accepter aussi ses URLs complètes. */
export function wrappedImageUrl(path: string | null | undefined, size: 'w500' | 'w1280' = 'w500'): string | null {
    if (!path?.trim()) return null;
    if (path.startsWith('/') && !path.startsWith('//')) return `https://image.tmdb.org/t/p/${size}${path}`;
    try {
        const url = new URL(path);
        return url.protocol === 'https:' && url.hostname === 'image.tmdb.org' ? url.href : null;
    } catch {
        return null;
    }
}

export function formatWrappedDuration(minutes: number, locale: string): string {
    return formatWrappedDurationParts(minutes, locale).join(' ');
}

export function formatWrappedDurationParts(minutes: number, locale: string): string[] {
    const safe = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
    const hours = Math.floor(safe / 60);
    const remaining = safe % 60;
    const number = numberFormatter(locale);
    return hours ? [`${number.format(hours)} h`, ...(remaining ? [`${number.format(remaining)} min`] : [])] : [`${number.format(safe)} min`];
}

export function wrappedSignaturePeriod(year: number, locale: string, t: TFunction, now = new Date()): string {
    const month = now.getMonth() + 1;
    const values = { start: wrappedMonth(1, locale, true), month: wrappedMonth(month, locale, true), end: wrappedMonth(12, locale, true), next: wrappedMonth(Math.min(12, month + 1), locale, true) };
    return t(year === now.getFullYear() ? (month < 12 ? 'wrappedCinema.signaturePeriodCurrent' : 'wrappedCinema.signaturePeriodDecember') : 'wrappedCinema.signaturePeriodComplete', values);
}

export function wrappedMonth(month: number, locale: string, short = false): string {
    if (!Number.isInteger(month) || month < 1 || month > 12) return '—';
    const key = `${locale}:${short}`;
    let formatter = monthFormatters.get(key);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat(locale, { month: short ? 'short' : 'long', timeZone: 'UTC' });
        if (monthFormatters.size >= 24) monthFormatters.delete(monthFormatters.keys().next().value!);
        monthFormatters.set(key, formatter);
    }
    return formatter.format(new Date(Date.UTC(2024, month - 1, 1)));
}

export function wrappedDate(value: string | undefined, locale: string): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date);
}

export function wrappedPeriod(data: WrappedData, locale: string, t: TFunction, now = new Date()): string {
    if (data.isDemo || data.year < now.getFullYear()) return t('wrappedFinish.fullYear', { year: data.year });
    return t('wrappedFinish.yearToDate', { date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(now) });
}

export function wrappedTypeLabel(type: string, t: TFunction): string {
    if (type === 'anime') return t('wrappedCinema.animeType');
    const keys: Record<string, string> = { movie: 'movieType', tv: 'seriesSingular', anime: 'animeType', 'live-tv': 'liveTVLabel' };
    return t(`wrapped.${keys[type] || 'unknownContent'}`);
}

const GENRES: Record<string, string> = {
    action: 'action', aventure: 'adventure', adventure: 'adventure', animation: 'animation',
    comedie: 'comedy', comedy: 'comedy', crime: 'crime', documentaire: 'documentary', documentary: 'documentary',
    drame: 'drama', drama: 'drama', familial: 'family', family: 'family', fantastique: 'fantasy', fantasy: 'fantasy',
    histoire: 'history', history: 'history', horreur: 'horror', horror: 'horror', musique: 'music', music: 'music',
    mystere: 'mystery', mystery: 'mystery', romance: 'romance', sciencefiction: 'scifi',
    telefilm: 'tvmovie', tvmovie: 'tvmovie', thriller: 'thriller', guerre: 'war', war: 'war', western: 'western',
    actionadventure: 'actionAdventure', scififantasy: 'scifiFantasy', sciencefictionfantastique: 'scifiFantasy', kids: 'kids', news: 'news',
    reality: 'reality', soap: 'soap', talk: 'talk', warpolitics: 'warPolitics',
};

export function wrappedGenre(name: string, t: TFunction): string {
    const key = GENRES[name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '')];
    return key ? t(`wrappedStory.genres.${key}`) : name;
}

export function wrappedPersona(data: WrappedData, t: TFunction): string {
    return t(`wrappedStory.personas.${data.persona.id}`, { defaultValue: t('wrappedStory.personas.default') });
}

export function wrappedTraits(data: WrappedData, t: TFunction): { label: string; evidence: string }[] {
    return wrappedTraitFacts(data).map(trait => ({
        label: trait.id === 'format' ? t(`wrappedMotion.formatTraits.${trait.type}`, { defaultValue: wrappedTypeLabel(trait.type || '', t) }) : t(`wrappedMotion.traits.${trait.id}`),
        evidence: t(`wrappedMotion.evidence.${trait.id}`, { count: trait.count, percent: trait.percent, type: trait.type ? wrappedTypeLabel(trait.type, t) : '' }),
    }));
}

export function buildWrappedShareData(data: WrappedData, locale: string, t: TFunction, domain: string): WrappedShareCardData {
    const now = data.isDemo ? new Date(data.year + 1, 0, 1) : new Date();
    return {
        year: data.year,
        domain,
        backdropUrl: wrappedImageUrl(data.topContent[0]?.backdrop_path, 'w1280'),
        period: wrappedPeriod(data, locale, t, now),
        watchTime: formatWrappedDuration(data.stats.totalMinutes, locale),
        watchTimeParts: formatWrappedDurationParts(data.stats.totalMinutes, locale),
        titleCount: new Intl.NumberFormat(locale).format(data.stats.uniqueTitles),
        persona: wrappedPersona(data, t),
        traits: wrappedTraits(data, t),
        signature: Array.from({ length: 12 }, (_, i) => {
            const value = data.monthlyGraph?.find(month => month.month === i + 1)?.minutes || 0;
            return Number.isFinite(value) ? Math.max(0, value) : 0;
        }),
        signatureCaption: wrappedSignaturePeriod(data.year, locale, t, now),
        signatureFutureFrom: data.year === now.getFullYear() && now.getMonth() < 11 ? now.getMonth() + 2 : null,
        items: data.topContent.slice(0, 5).map(item => ({
            title: item.title,
            posterUrl: wrappedImageUrl(item.poster_path),
            duration: formatWrappedDuration(item.minutes, locale),
        })),
        labels: {
            heading: t('wrappedStory.exportHeading'), favorite: t('wrappedStory.favoriteLabel'),
            watchTime: t('wrapped.shareWatchTimeLabel'), titles: t('wrapped.uniqueTitlesLabel'),
            persona: t('wrappedStory.personaLabel'), topFive: t('wrappedStory.topFiveTitle'),
            ticket: t('wrappedStory.ticketHeading'), imageUnavailable: t('wrappedStory.imageUnavailable'),
            signature: t('wrappedCinema.signatureLabel'),
        },
    };
}

/** Un maintien ne navigue pas ; un mouvement vertical reste un défilement. */
export function wrappedGesture(dx: number, dy: number, elapsedMs: number, position: number): -1 | 0 | 1 {
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) return dx < 0 ? 1 : -1;
    if (Math.abs(dx) <= 8 && Math.abs(dy) <= 8 && elapsedMs < 300) return position < 0.35 ? -1 : 1;
    return 0;
}
