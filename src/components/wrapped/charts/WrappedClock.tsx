import { useId, useMemo, useState, type PointerEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { WrappedData } from '@/services/wrappedService';
import { polarPoint, ringSector, wrappedChartKey, wrappedHours } from '@/utils/wrappedCharts';
import { formatWrappedDuration } from '@/utils/wrappedPresentation';
import ChartFrame from './ChartFrame';

export default function WrappedClock({ data, onExplore }: { data: WrappedData; onExplore?: (active: boolean) => void }) {
    const { t, i18n } = useTranslation();
    const reduce = useReducedMotion();
    const id = useId().replace(/:/g, '');
    const hours = useMemo(() => wrappedHours(data.listeningClock), [data.listeningClock]);
    const peak = hours.reduce((a, b) => a.minutes >= b.minutes ? a : b);
    const [selected, setSelected] = useState(peak.hour);
    const selectAtPointer = (event: PointerEvent<SVGSVGElement>) => {
        const box = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width * 460 - 230;
        const y = (event.clientY - box.top) / box.height * 460 - 230;
        if (Math.hypot(x, y) > 85) setSelected(Math.floor(((Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360) / 15));
    };
    return (
        <ChartFrame onExplore={onExplore} label={t('wrappedCinema.hourChart')}>
            <output id={`${id}-value`} className="sr-only" aria-live="polite">{selected} h – {(selected + 1) % 24} h : {formatWrappedDuration(hours[selected].minutes, i18n.language)}</output>
            <svg viewBox="0 0 460 460" fontFamily="Inter, Arial, sans-serif" className="mx-auto block w-full max-w-[min(420px,46dvh)] rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c6fbeb]" role="slider" tabIndex={0} aria-labelledby={`${id}-title`} aria-describedby={`${id}-hint`}
                aria-valuemin={0} aria-valuemax={23} aria-valuenow={selected} aria-valuetext={`${selected} h – ${(selected + 1) % 24} h : ${formatWrappedDuration(hours[selected].minutes, i18n.language)}`}
                onPointerDown={selectAtPointer} onPointerMove={event => { if (event.pointerType === 'mouse' || event.buttons === 1) selectAtPointer(event); }}
                onKeyDown={event => {
                    const next = wrappedChartKey(event.key, selected, 0, 23);
                    if (next !== null) { event.preventDefault(); setSelected(next); }
                }}>
                <title id={`${id}-title`}>{t('wrappedCinema.hourChart')}</title>
                {[105, 140, 177].map(radius => <circle key={radius} cx="230" cy="230" r={radius} fill="none" stroke="#9bdddd" strokeOpacity="0.09" strokeDasharray="2 5" />)}
                {hours.map(hour => {
                    const height = hour.minutes / Math.max(1, peak.minutes) * 74;
                    const path = ringSector(230, 230, 105, 105 + height, hour.hour * 15 + 2, (hour.hour + 1) * 15 - 2);
                    return <motion.g key={hour.hour} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : hour.hour * 0.018, duration: 0.35 }}>
                        <path d={path} transform="translate(0 6)" fill={selected === hour.hour ? '#38777d' : '#264149'} />
                        <path d={path} fill={selected === hour.hour ? '#c6fbeb' : hour.hour >= 18 ? '#8ddbdc' : '#57787f'} stroke={selected === hour.hour ? '#effffb' : 'none'} strokeWidth="0.7" />
                    </motion.g>;
                })}
                {[0, 3, 6, 9, 12, 15, 18, 21].map(hour => {
                    const point = polarPoint(230, 230, 204, hour * 15);
                    return <text key={hour} x={point.x} y={point.y + 6} textAnchor="middle" fill="#b4c5cd" fontSize="18">{hour}h</text>;
                })}
                <text x="230" y="222" textAnchor="middle" fill="#e4fff5" fontWeight="800" fontSize="58">{selected}<tspan fontSize="26"> h</tspan></text>
                <text x="230" y="256" textAnchor="middle" fill="#a9c0c6" fontSize="19">{formatWrappedDuration(hours[selected].minutes, i18n.language)}</text>
            </svg>
            <p id={`${id}-hint`} className="text-xs leading-relaxed text-[#adc1c5]">{t('wrappedCinema.hourCaption')}<span className="mt-1 block">{t('wrappedCinema.chartDirectHint')}</span></p>
        </ChartFrame>
    );
}
