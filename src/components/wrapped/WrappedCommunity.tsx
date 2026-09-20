import { useTranslation } from 'react-i18next';
import type { WrappedData } from '@/services/wrappedService';
import { wrappedImageUrl, wrappedTypeLabel } from '@/utils/wrappedPresentation';
import WrappedImage from './WrappedImage';
import WrappedComment from './WrappedComment';

export default function WrappedCommunity({ community, compact = false, onExplore }: { community: NonNullable<WrappedData['community']>; compact?: boolean; onExplore?: (active: boolean) => void }) {
    const { t, i18n } = useTranslation();
    const total = community.commentsPosted + community.repliesPosted;
    const number = (value: number) => new Intl.NumberFormat(i18n.language).format(value);
    const heroNumber = new Intl.NumberFormat(i18n.language, { notation: total >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(total);
    const counters = [
        { label: 'comments', value: community.commentsPosted },
        { label: 'replies', value: community.repliesPosted },
        { label: 'discussedTitles', value: community.discussedTitles },
    ].filter(counter => counter.value > 0);

    if (total <= 0) return null;
    if (!compact && community.highlight) return <WrappedComment highlight={community.highlight} onExplore={onExplore} />;

    return <section className={`mx-auto w-full max-w-[1040px] ${compact ? 'space-y-6' : 'space-y-4 lg:space-y-7'}`}>
        <header className={compact ? '' : 'max-w-3xl space-y-3'}>
            {!compact && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--wrapped-accent)]">{t('wrappedCinema.communityKicker')}</p>}
            <h2 className={compact ? 'text-xl font-bold' : "font-['Archivo_Black'] text-3xl leading-tight tracking-tight lg:text-5xl"}>{t(compact ? 'wrappedCinema.communityDetailsTitle' : 'wrappedCinema.communityStoryTitle')}</h2>
        </header>

        <div className={compact ? 'space-y-6' : 'grid items-center gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16'}>
            <div className="space-y-4 lg:space-y-6">
                {!compact && <div className="flex items-baseline gap-4 lg:block">
                    <p className="font-['Archivo_Black'] text-6xl leading-none tracking-tight text-[var(--wrapped-accent)] lg:text-8xl" aria-label={number(total)}>{heroNumber}</p>
                    <p className="text-lg text-white/75 lg:mt-3 lg:text-2xl">{t('wrappedCinema.spokenContributions', { count: total })}</p>
                </div>}
                <dl className={`grid grid-cols-3 gap-4 border-t border-white/15 pt-5 ${compact ? '' : 'lg:grid-cols-1 lg:gap-4'}`}>
                    {counters.map(counter => <div key={counter.label} className={compact ? 'flex flex-col justify-between' : 'flex flex-col justify-between lg:flex-row lg:items-baseline lg:gap-5'}>
                        <dt className="text-xs leading-relaxed text-white/65 lg:text-sm">{t(`wrappedCinema.${counter.label}`)}</dt>
                        <dd className="mt-2 text-2xl font-semibold tabular-nums lg:mt-0">{number(counter.value)}</dd>
                    </div>)}
                </dl>
            </div>

            {community.topTitles.length > 0 && <div className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/65">{t('wrappedCinema.conversationTitle')}</h3>
                <ol className="space-y-3">
                    {community.topTitles.map((item, i) => <li key={`${item.type}:${item.tmdbId}`} className={`flex items-center gap-4 ${i > 0 ? 'border-t border-white/10 pt-3' : ''}`}>
                        <div className={`flex shrink-0 items-center justify-center ${compact ? 'w-14' : 'w-14 lg:w-24'}`}>
                            <WrappedImage src={wrappedImageUrl(item.poster_path)} alt="" className={`aspect-[2/3] ${i === 0 && !compact ? 'w-14 lg:w-24' : 'w-10 lg:w-12'}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] tracking-wider text-white/60">{String(i + 1).padStart(2, '0')} · {wrappedTypeLabel(item.type, t)}</p>
                            <p className={`mt-1 line-clamp-2 font-semibold ${i === 0 && !compact ? 'text-xl lg:text-2xl' : 'text-sm'}`}>{item.title}</p>
                            <p className="mt-1.5 flex justify-between gap-3 text-xs text-[var(--wrapped-accent)]"><span>{t('wrappedCinema.contributions', { count: item.contributions })}</span><span>{Math.round(item.contributions / Math.max(1, total) * 100)} %</span></p>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" role="img" aria-label={t('wrappedCinema.contributionShare', { percent: Math.round(item.contributions / Math.max(1, total) * 100) })}>
                                <div className="h-full rounded-full bg-[var(--wrapped-accent)]" style={{ width: `${Math.min(100, item.contributions / Math.max(1, total) * 100)}%` }} />
                            </div>
                        </div>
                    </li>)}
                </ol>
            </div>}
        </div>
        <p className="max-w-2xl text-xs leading-relaxed text-white/60">{t(compact ? 'wrappedCinema.communityHint' : 'wrappedCinema.communityStoryHint')}</p>
    </section>;
}
