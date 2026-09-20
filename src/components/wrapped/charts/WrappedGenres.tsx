import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight } from 'lucide-react';
import type { WrappedData } from '@/services/wrappedService';
import { formatWrappedDuration, wrappedGenre, wrappedImageUrl, wrappedMediaKey } from '@/utils/wrappedPresentation';
import ChartFrame from './ChartFrame';
import WrappedImage from '../WrappedImage';
import { WRAPPED_FRAME_ANIMATION } from '@/utils/wrappedMotion';

const COLORS = ['#ffb196', '#ff927e', '#d39bd5', '#aa9cf0', '#879adc'];

export default function WrappedGenres({ data, onExplore }: { data: WrappedData; onExplore?: (active: boolean) => void }) {
    const { t, i18n } = useTranslation();
    const reduce = useReducedMotion();
    const [selected, setSelected] = useState(0);
    const genres = data.topGenres?.slice(0, 5) || [];
    const maximum = Math.max(10, Math.ceil(Math.max(...genres.map(item => item.percent), 0) / 10) * 10);
    const selectedName = wrappedGenre(genres[selected]?.name || '', t);
    const related = data.topContent.filter(item => item.genres?.some(name => wrappedGenre(name, t).toLowerCase() === selectedName.toLowerCase()));
    return (
        <ChartFrame label={t('wrappedCinema.genreChart')} onExplore={onExplore} className="grid items-center gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
            <div>
            <div className="mb-3 flex justify-between px-1 text-xs text-[#b7a9c2]" aria-hidden="true"><span>0 %</span><span>{maximum / 2} %</span><span>{maximum} %</span></div>
            <div className="space-y-2 lg:space-y-3">
                {genres.map((genre, i) => <button key={genre.name} type="button" aria-pressed={selected === i} onClick={() => setSelected(i)} onFocus={() => setSelected(i)}
                    className="block min-h-12 w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ffb196]">
                    <span className="mb-1.5 flex items-baseline justify-between gap-3 lg:mb-2"><span className={`inline-flex items-center gap-1.5 text-sm ${selected === i ? 'font-bold text-white' : 'font-medium text-[#c4b4ca]'}`}><ArrowUpRight className={`h-3.5 w-3.5 shrink-0 text-[#ffb196] ${selected === i ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true" />{wrappedGenre(genre.name, t)}</span><span className="text-lg font-semibold tabular-nums lg:text-xl" style={{ color: COLORS[i] }}>{genre.percent}<span className="ml-1 text-xs">%</span></span></span>
                    <span className="relative block h-5 rounded-sm bg-white/[0.035] lg:h-6">
                        <motion.span {...WRAPPED_FRAME_ANIMATION} className="absolute inset-y-0 left-0 block origin-left rounded-sm" style={{ width: `${genre.percent / maximum * 100}%`, backgroundColor: COLORS[i], boxShadow: `0 5px 0 ${COLORS[i]}45, inset 0 1px 0 #ffffff60` }}
                            initial={reduce ? false : { transform: 'scaleX(0.05)', opacity: 0 }} animate={{ transform: 'scaleX(1)', opacity: selected === i ? 1 : 0.65 }} transition={{ duration: 0.65, delay: reduce ? 0 : i * 0.07, ease: [0.16, 1, 0.3, 1] }} />
                    </span>
                </button>)}
            </div>
            <div className="mt-4 flex min-h-10 items-center justify-between gap-4 border-t border-white/10 pt-3 text-xs text-[#b7a9c2]">
                <p className="leading-relaxed">{t('wrappedCinema.overlappingGenres')}</p>
            </div>
            </div>
            <div className="grid grid-cols-[0.9fr_1.1fr] items-center gap-4 lg:block lg:space-y-7" aria-live="polite">
                <div className="space-y-2">
                    <h3 className="text-base font-bold leading-tight text-[#ffd1be] lg:text-4xl">{selectedName}</h3>
                    <p className="text-sm text-white/75 lg:text-xl">{formatWrappedDuration(genres[selected]?.minutes || 0, i18n.language)}</p>
                    <p className="text-xs leading-relaxed text-white/60">{t('wrappedCinema.genreTimeContext', { genre: selectedName })}</p>
                </div>
                <div className="space-y-3"><p className="text-xs font-semibold leading-relaxed text-[#ffd1be]">{t('wrappedCinema.genreTopExamples', { genre: selectedName })}</p>
                {related.length > 0 ? <div className="flex min-h-[78px] items-center gap-2 lg:min-h-[135px] lg:gap-3">
                    {related.slice(0, 5).map(item => <WrappedImage key={wrappedMediaKey(item)} src={wrappedImageUrl(item.poster_path)} alt={item.title} className="aspect-[2/3] min-w-0 max-w-[52px] flex-1 lg:max-w-[90px]" />)}
                </div> : <p className="text-xs leading-relaxed text-white/60">{t('wrappedCinema.noTopGenreMatch')}</p>}
                </div>
            </div>
        </ChartFrame>
    );
}
