import { useTranslation } from 'react-i18next';
import type { WrappedData } from '@/services/wrappedService';
import { formatWrappedDuration, wrappedDate, wrappedGenre, wrappedMediaKey, wrappedMonth, wrappedTraits, wrappedTypeLabel } from '@/utils/wrappedPresentation';
import WrappedCommunity from './WrappedCommunity';
import { hasWrappedCommunity, hasWrappedRace, wrappedEras } from '@/utils/wrappedStory';
import WrappedEras from './WrappedEras';
import WrappedRace from './WrappedRace';
import WrappedComment from './WrappedComment';

export default function WrappedDetails({ data }: { data: WrappedData }) {
    const { t, i18n } = useTranslation();
    const duration = (value: number) => formatWrappedDuration(value, i18n.language);
    const number = (value: number) => new Intl.NumberFormat(i18n.language).format(value);
    const stats = [
        [t('wrapped.shareWatchTimeLabel'), duration(data.stats.totalMinutes)],
        [t('wrapped.uniqueTitlesLabel'), number(data.stats.uniqueTitles)],
        [t('wrapped.sessionsLabel'), number(data.stats.totalSessions)],
        [t('wrapped.avgSessionLabel'), duration(data.stats.avgSessionMinutes || 0)],
        [t('wrapped.activeDaysLabel'), number(data.stats.totalActiveDays || 0)],
        [t('wrapped.bestStreak'), t('wrapped.shareStreakValue', { days: data.stats.longestStreak || 0 })],
    ];
    if (data.stats.percentile != null) stats.push([t('wrapped.percentileLabel'), t('wrapped.percentileValue', { percent: Math.max(1, 100 - data.stats.percentile) })]);
    if (data.peakHour != null) stats.push([t('wrappedStory.peakHour'), `${data.peakHour} h`]);
    if (data.watchAgeYear) stats.push([t('wrappedStory.medianYear'), String(data.watchAgeYear)]);

    return (
        <article className="space-y-9 pb-6">
            <header><h1 className="text-3xl font-black tracking-tight">{t('wrapped.yourStatistics')}</h1><p className="mt-3 text-sm leading-relaxed text-white/75">{t('wrappedStory.detailsCaption', { year: data.year })}</p></header>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-6">{stats.map(([label, value]) => <div key={label}><dt className="text-xs text-white/70">{label}</dt><dd className="mt-1 break-words text-xl font-bold">{value}</dd></div>)}</dl>
            {hasWrappedCommunity(data) && data.community && <WrappedCommunity community={data.community} compact />}
            {data.community?.highlight && hasWrappedCommunity(data) && <WrappedComment highlight={data.community.highlight} />}
            {wrappedTraits(data, t).length > 0 && <section><h2 className="mb-4 text-xl font-bold">{t('wrappedMotion.portraitDetails')}</h2><dl className="space-y-4">{wrappedTraits(data, t).map(trait => <div key={trait.label}><dt className="font-semibold">{trait.label}</dt><dd className="mt-1 text-sm text-white/70">{trait.evidence}</dd></div>)}</dl></section>}
            {wrappedEras(data).length >= 2 && <WrappedEras data={data} />}
            {hasWrappedRace(data) && <WrappedRace data={data} onExplore={() => {}} />}
            <section><h2 className="mb-4 text-xl font-bold">{t('wrapped.byType')}</h2><ul className="space-y-3">{data.byType.map(type => <li key={type.type} className="flex justify-between gap-4 text-sm"><span>{wrappedTypeLabel(type.type, t)}</span><span className="text-white/75">{duration(type.minutes)} · {number(type.percent)} %</span></li>)}</ul></section>
            {data.monthlyGraph?.length ? <section><h2 className="mb-4 text-xl font-bold">{t('wrappedStory.timelineTitle')}</h2><dl className="grid grid-cols-2 gap-4">{[...data.monthlyGraph].sort((a, b) => a.month - b.month).map(month => <div key={month.month}><dt className="text-xs capitalize text-white/70">{wrappedMonth(month.month, i18n.language)}</dt><dd className="mt-1 font-semibold">{duration(month.minutes)}</dd></div>)}</dl></section> : null}
            {data.topGenres?.length ? <section><h2 className="mb-4 text-xl font-bold">{t('wrapped.topGenres')}</h2><ul className="space-y-3">{data.topGenres.map(genre => <li key={genre.name} className="flex justify-between gap-4 text-sm"><span>{wrappedGenre(genre.name, t)}</span><span>{number(genre.percent)} %</span></li>)}</ul></section> : null}
            <section><h2 className="mb-4 text-xl font-bold">{t('wrapped.topContent')}</h2><ol className="space-y-4">{data.topContent.map((item, index) => <li key={wrappedMediaKey(item)} className="flex gap-3 text-sm"><span className="text-[#d8c4ff]">{index + 1}.</span><div><p className="font-semibold">{item.title}</p><p className="mt-1 text-white/70">{duration(item.minutes)} · {wrappedTypeLabel(item.type, t)}</p></div></li>)}</ol></section>
            {data.weekday?.length ? <section><h2 className="mb-4 text-xl font-bold">{t('wrappedStory.weekday')}</h2><dl className="space-y-3">{[...data.weekday].sort((a, b) => ((a.dow + 5) % 7) - ((b.dow + 5) % 7)).map(day => <div key={day.dow} className="flex justify-between gap-4 text-sm"><dt className="capitalize">{new Intl.DateTimeFormat(i18n.language, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, day.dow)))}</dt><dd>{duration(day.minutes)}</dd></div>)}</dl></section> : null}
            {data.listeningClock?.length ? <details><summary className="flex min-h-11 cursor-pointer items-center text-xl font-bold">{t('wrappedStory.hourly')}</summary><dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">{[...data.listeningClock].sort((a, b) => a.hour - b.hour).map(hour => <div key={hour.hour}><dt className="text-xs text-white/70">{hour.hour} h</dt><dd className="mt-1 text-sm font-semibold">{duration(hour.minutes)}</dd></div>)}</dl></details> : null}
            {(data.firstWatch || data.lastWatch) && <section className="space-y-4"><h2 className="text-xl font-bold">{t('wrappedStory.bookends')}</h2>{[data.firstWatch, data.lastWatch].map((item, index) => item && <div key={index}><p className="text-xs text-white/70">{t(index === 0 ? 'wrapped.firstWatchLabel' : 'wrapped.lastWatchLabel')} · {wrappedDate(item.date, i18n.language)}</p><p className="mt-1 font-semibold">{item.title}</p></div>)}</section>}
            {data.recordDay && <section><h2 className="mb-2 text-xl font-bold">{t('wrappedStory.recordDay')}</h2><p>{wrappedDate(data.recordDay.date, i18n.language)} · {duration(data.recordDay.minutes)}</p></section>}
            {data.rewatch && <section><h2 className="mb-2 text-xl font-bold">{t('wrappedStory.returnTitle')}</h2><p>{data.rewatch.title}</p><p className="mt-1 text-sm text-white/70">{t('wrappedStory.returnDays', { count: data.rewatch.count })}</p></section>}
            {data.topPages.length > 0 && <section><h2 className="mb-4 text-xl font-bold">{t('wrappedStory.browsing')}</h2><ul className="space-y-3">{data.topPages.map(page => <li key={page.page} className="flex justify-between gap-4 text-sm"><span>{t(`wrapped.pageNames.${page.page}`, { defaultValue: page.page })}</span><span>{duration(page.minutes)}</span></li>)}</ul></section>}
        </article>
    );
}
