import { useTranslation } from 'react-i18next';
import type { WrappedData } from '@/services/wrappedService';
import { wrappedEras } from '@/utils/wrappedStory';
import { wrappedGenre, wrappedImageUrl, wrappedMonth, wrappedTypeLabel } from '@/utils/wrappedPresentation';
import WrappedImage from './WrappedImage';
import { motion, useReducedMotion } from 'framer-motion';
import { WRAPPED_EASE_OUT, WRAPPED_FRAME_ANIMATION } from '@/utils/wrappedMotion';

const PAPERS = ['bg-[#d7c5ff]', 'bg-[#ffb196]', 'bg-[#c6fbeb]'];

export default function WrappedEras({ data }: { data: WrappedData }) {
    const { t, i18n } = useTranslation();
    const reduced = useReducedMotion();
    const eras = wrappedEras(data);
    if (!eras.length) return null;
    return <section className="mx-auto w-full max-w-[1000px] space-y-6">
        <header className="max-w-2xl space-y-3"><h2 className="font-['Archivo_Black'] text-3xl leading-tight tracking-tight lg:text-5xl">{t('wrappedMotion.erasTitle')}</h2><p className="text-sm leading-relaxed text-white/70">{t('wrappedMotion.erasCaption')}</p></header>
        <ol className="overflow-hidden rounded-xl text-[#201727]">
            {eras.map((era, index) => <motion.li {...WRAPPED_FRAME_ANIMATION} key={`${era.kind}-${era.fromMonth}`} initial={reduced ? false : { transform: 'translateX(14%)', opacity: 0 }} animate={{ transform: 'none', opacity: 1 }} transition={{ duration: 0.52, delay: reduced ? 0 : 0.18 + index * 0.09, ease: [...WRAPPED_EASE_OUT] }} className={`flex items-center gap-4 p-4 sm:gap-6 sm:p-6 ${PAPERS[index % 3]}`}>
                <WrappedImage src={wrappedImageUrl(era.title.poster_path)} alt="" className="aspect-[2/3] w-12 shrink-0 sm:w-16" />
                <div className="min-w-0 flex-1"><p className="text-xs font-semibold capitalize">{wrappedMonth(era.fromMonth, i18n.language)}{era.toMonth !== era.fromMonth ? ` — ${wrappedMonth(era.toMonth, i18n.language)}` : ''}</p>
                    <h3 className="mt-2 font-['Archivo_Black'] text-xl leading-tight sm:text-3xl">{era.kind === 'genre' ? wrappedGenre(era.label, t) : wrappedTypeLabel(era.label, t)}</h3>
                    <p className="mt-2 truncate text-xs sm:text-sm">{era.title.title}</p>
                </div>
                <span className="shrink-0 text-xl font-semibold tabular-nums sm:text-3xl">{Math.round(era.share)}<span className="text-xs"> %</span></span>
            </motion.li>)}
        </ol>
        <p className="text-xs leading-relaxed text-white/65">{t('wrappedMotion.erasMethod')}</p>
    </section>;
}
