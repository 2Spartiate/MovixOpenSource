import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WrappedData } from '@/services/wrappedService';
import { formatWrappedDuration, wrappedMediaKey, wrappedTypeLabel } from '@/utils/wrappedPresentation';
import WrappedPoster from './WrappedPoster';
import WrappedReveal from './WrappedReveal';
import { motion, useReducedMotion } from 'framer-motion';
import { WRAPPED_FRAME_ANIMATION } from '@/utils/wrappedMotion';

export default function WrappedPodium({ data, onExplore }: { data: WrappedData; onExplore: (active: boolean) => void }) {
    const { t, i18n } = useTranslation();
    const reduced = useReducedMotion();
    const [formats, setFormats] = useState(false);
    const winners = data.story?.formatWinners || [];
    const entries = formats ? [...winners].sort((a, b) => b.minutes - a.minutes) : data.topContent.slice(0, 5);
    return <section className="mx-auto w-full max-w-[1040px] space-y-5 lg:space-y-7">
        <WrappedReveal delay={0.22}><header className="space-y-4"><h2 className="font-['Archivo_Black'] text-3xl leading-tight tracking-tight lg:text-5xl">{t(formats ? 'wrappedMotion.awardsTitle' : 'wrappedMotion.topTitle', { count: Math.min(5, data.topContent.length) })}</h2>
            {winners.length > 1 && <div className="flex flex-wrap gap-2" role="group" aria-label={t('wrappedMotion.podiumView')} data-wrapped-interactive onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onExplore(false); }}>
                {[false, true].map(value => <button type="button" key={String(value)} aria-pressed={formats === value} onClick={() => { setFormats(value); onExplore(true); }} className={`min-h-11 rounded-full px-5 text-sm font-semibold ${formats === value ? 'bg-[var(--wrapped-accent)] text-[#17121f]' : 'bg-white/10 text-white/80'}`}>{t(value ? 'wrappedMotion.byFormat' : 'wrappedMotion.overall')}</button>)}
            </div>}
        </header></WrappedReveal>
        <ol className={`wrapped-podium ${formats ? 'grid grid-cols-1 gap-5 sm:grid-cols-3' : 'grid grid-cols-2 gap-5 lg:grid-cols-[1.25fr_1fr_1fr] lg:gap-x-9 lg:gap-y-6'}`}>
            {entries.map((item, index) => <motion.li {...WRAPPED_FRAME_ANIMATION} key={wrappedMediaKey(item)} initial={reduced ? false : { opacity: index === 0 ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: reduced || index === 0 ? 0 : 0.16 + index * 0.055 }} className={formats ? 'flex items-center gap-4 sm:flex-col sm:items-start' : index === 0 ? 'col-span-2 flex items-center gap-5 lg:col-span-1 lg:row-span-2 lg:flex-col lg:items-start' : 'flex items-start gap-3 lg:flex-col'}>
                <div data-rank={index} className={`wrapped-podium-poster relative shrink-0 ${formats ? 'w-16 sm:w-full sm:max-w-[170px]' : index === 0 ? 'w-28 lg:w-52' : 'w-12 lg:w-24'}`}>
                    <WrappedPoster item={item} className="w-full" />
                    {!formats && <span className="absolute -left-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--wrapped-accent)] text-xs font-bold text-[#141117]">{index + 1}</span>}
                </div>
                <div className="min-w-0">{formats && <p className="mb-2 text-xs font-semibold text-[var(--wrapped-accent)]">{wrappedTypeLabel(item.type, t)}</p>}<p className={`${index === 0 && !formats ? 'text-2xl lg:text-3xl' : 'text-sm lg:text-base'} line-clamp-3 break-words font-semibold`}>{item.title}</p><p className="mt-2 text-xs text-[var(--wrapped-accent)]">{formatWrappedDuration(item.minutes, i18n.language)}</p></div>
            </motion.li>)}
        </ol>
        <p className="text-xs text-white/65">{t(formats ? 'wrappedMotion.awardsCaption' : 'wrappedCinema.topCaption')}</p>
    </section>;
}
