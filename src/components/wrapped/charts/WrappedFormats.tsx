import { useId, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { WrappedData } from '@/services/wrappedService';
import { formatSectors, ringSector } from '@/utils/wrappedCharts';
import { formatWrappedDuration, wrappedTypeLabel } from '@/utils/wrappedPresentation';
import ChartFrame from './ChartFrame';

const PALETTE = [
    { face: '#deff91', light: '#f4ffd8', edge: '#70863e' },
    { face: '#b9a4f4', light: '#e4d9ff', edge: '#645184' },
    { face: '#ff997b', light: '#ffd6b8', edge: '#91523d' },
    { face: '#8ddbdd', light: '#d6fbf8', edge: '#416f77' },
];

export default function WrappedFormats({ data, onExplore, wide = false }: { data: WrappedData; onExplore?: (active: boolean) => void; wide?: boolean }) {
    const { t, i18n } = useTranslation();
    const reduce = useReducedMotion();
    const id = useId().replace(/:/g, '');
    const sectors = formatSectors(data.byType);
    const [selected, setSelected] = useState(0);
    const current = sectors[selected] || sectors[0];
    if (!current) return null;

    if (sectors.length === 1) return <div className="flex min-h-[200px] flex-col justify-center gap-4 py-8">
        <p className="font-['Archivo_Black'] text-4xl text-[var(--wrapped-accent)] lg:text-6xl">{wrappedTypeLabel(current.type, t)}</p>
        <p className="text-base text-white/75">{t('wrappedMotion.singleFormat')}</p>
    </div>;

    return (
        <ChartFrame onExplore={onExplore} label={t('wrappedCinema.formatsTitle')} className={wide ? 'lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-14' : ''}>
            <output id={`${id}-value`} className="sr-only" aria-live="polite">{wrappedTypeLabel(current.type, t)} : {current.percent} % · {formatWrappedDuration(current.minutes, i18n.language)}</output>
            <svg viewBox="0 0 460 420" fontFamily="Inter, Arial, sans-serif" className={`mx-auto block w-full ${wide ? 'max-w-[min(360px,42dvh)] lg:max-w-[min(440px,50dvh)]' : 'max-w-[460px]'}`} role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-value`}>
                <title id={`${id}-title`}>{t('wrappedCinema.formatsTitle')}</title>
                <defs>{sectors.map((item, i) => <linearGradient key={item.type} id={`${id}-${i}`} x1="0" y1="0" x2="0.8" y2="1">
                    <stop offset="0%" stopColor={PALETTE[i % 4].light} /><stop offset="100%" stopColor={PALETTE[i % 4].face} />
                </linearGradient>)}</defs>
                <ellipse cx="230" cy="306" rx="137" ry="25" fill="#000" opacity="0.22" />
                {/* Toutes les tranches sont peintes avant les faces : aucune ne recouvre un secteur voisin. */}
                <g data-wrapped-format-edges aria-hidden="true">
                    {[19, 10].map(depth => sectors.map((item, i) => <motion.path key={`${depth}-${item.type}`}
                        d={ringSector(230, 174, 104, 155, item.start, item.end)} fill={PALETTE[i % 4].edge}
                        initial={false} animate={{ transform: `translateY(${depth + (!reduce && selected === i ? -6 : 0)}px)` }}
                        transition={{ duration: reduce ? 0 : 0.24, ease: [0.23, 1, 0.32, 1] }} />))}
                </g>
                <g data-wrapped-format-faces>
                {sectors.map((item, i) => {
                    const path = ringSector(230, 174, 104, 155, item.start, item.end);
                    return <motion.g key={item.type} onPointerEnter={event => event.pointerType === 'mouse' && setSelected(i)}
                        initial={false} animate={{ transform: `translateY(${!reduce && selected === i ? -6 : 0}px)` }} transition={{ duration: reduce ? 0 : 0.24, ease: [0.23, 1, 0.32, 1] }}>
                        <path d={path} fill={`url(#${id}-${i})`} stroke={PALETTE[i % 4].light} strokeWidth="0.65" />
                    </motion.g>;
                })}
                </g>
                <text x="230" y="174" textAnchor="middle" fill="#f4efe6" fontSize="55" fontWeight="800">{current.percent}<tspan fontSize="25"> %</tspan></text>
                <text x="230" y="208" textAnchor="middle" fill="#beb5ce" fontSize="20">{wrappedTypeLabel(current.type, t)}</text>
                <text x="230" y="390" textAnchor="middle" fill="#e7dfef" fontSize="26" fontWeight="600">{formatWrappedDuration(current.minutes, i18n.language)}</text>
            </svg>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('wrappedCinema.selectFormat')}>
                {sectors.map((item, i) => <button type="button" key={item.type} onClick={() => setSelected(i)} onFocus={() => setSelected(i)} aria-pressed={selected === i} aria-describedby={`${id}-value`}
                    className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${selected === i ? 'bg-white/10 text-white' : 'text-[#b8aec8] hover:bg-white/5'}`}>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PALETTE[i % 4].face }} aria-hidden="true" />
                    <span className="min-w-0 flex-1">{wrappedTypeLabel(item.type, t)}</span><span className="tabular-nums">{item.percent}%</span>
                </button>)}
            </div>
        </ChartFrame>
    );
}
