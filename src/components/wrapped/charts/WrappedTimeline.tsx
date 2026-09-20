import { useId, useMemo, useState, type PointerEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { WrappedData } from '@/services/wrappedService';
import { chartAxis, chartCurve, wrappedChartKey, wrappedMonths } from '@/utils/wrappedCharts';
import { formatWrappedDuration, wrappedMonth } from '@/utils/wrappedPresentation';
import ChartFrame from './ChartFrame';

export default function WrappedTimeline({ data, onExplore }: { data: WrappedData; onExplore?: (active: boolean) => void }) {
    const { t, i18n } = useTranslation();
    const reduce = useReducedMotion();
    const id = useId().replace(/:/g, '');
    const months = useMemo(() => wrappedMonths(data), [data]);
    const labels = useMemo(() => months.map(month => ({ full: wrappedMonth(month.month, i18n.language), short: wrappedMonth(month.month, i18n.language, true).replace('.', '') })), [months, i18n.language]);
    const peak = months.reduce((a, b) => a.minutes >= b.minutes ? a : b);
    const [selected, setSelected] = useState(peak.month);
    const item = months[selected - 1];
    const axis = useMemo(() => chartAxis(peak.minutes), [peak.minutes]);
    const tickLabels = useMemo(() => axis.ticks.map(tick => tick === 0 ? '0' : tick >= 60 ? `${new Intl.NumberFormat(i18n.language).format(tick / 60)} h` : `${tick}′`), [axis, i18n.language]);
    const x = (month: number) => 64 + (month - 1) * 46;
    const y = (minutes: number) => 306 - minutes / axis.max * 240;
    const recorded = months.filter(month => !month.future);
    const currentMonth = months.find(month => month.current);
    const points = recorded.filter(month => !month.current).map(month => ({ x: x(month.month), y: y(month.minutes) }));
    const path = chartCurve(points);
    const previous = currentMonth ? recorded.find(month => month.month === currentMonth.month - 1) : null;
    const partialPath = currentMonth ? chartCurve([
        ...(previous ? [{ x: x(previous.month), y: y(previous.minutes) }] : []),
        { x: x(currentMonth.month), y: y(currentMonth.minutes) },
    ]) : '';
    const area = points.length ? `${path} L ${points[points.length - 1].x} 306 L ${points[0].x} 306 Z` : '';
    const futureStart = months.find(month => month.future)?.month;
    const selectAtPointer = (event: PointerEvent<SVGSVGElement>) => {
        const box = event.currentTarget.getBoundingClientRect();
        setSelected(Math.max(1, Math.min(12, Math.round(((event.clientX - box.left) / box.width * 604 - 64) / 46) + 1)));
    };

    return (
        <ChartFrame onExplore={onExplore} label={t('wrappedCinema.monthChart')} className="w-full">
            <div className="mb-2 flex min-h-20 items-end justify-between gap-4 px-1">
                <div aria-live="polite" aria-atomic="true">
                    <p className="text-sm capitalize text-[#b6accc]">{labels[selected - 1].full}</p>
                    <p className="mt-1 text-3xl font-bold tracking-tight text-[#ded4ff] sm:text-4xl">{item.future ? t('wrappedCinema.upcoming') : formatWrappedDuration(item.minutes, i18n.language)}</p>
                </div>
                <span className="pb-1 text-right text-xs text-[#b6accc]">{item.current ? t('wrappedCinema.partialMonth') : selected === peak.month ? t('wrappedCinema.peakMonth') : data.year}</span>
            </div>
            <svg viewBox="0 0 604 348" fontFamily="Inter, Arial, sans-serif" className="block w-full rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ded4ff]" role="slider" tabIndex={0} aria-labelledby={`${id}-title`} aria-describedby={`${id}-hint`}
                aria-valuemin={1} aria-valuemax={12} aria-valuenow={selected} aria-valuetext={`${labels[selected - 1].full} : ${item.future ? t('wrappedCinema.upcoming') : formatWrappedDuration(item.minutes, i18n.language)}`}
                onPointerDown={selectAtPointer} onPointerMove={event => { if (event.pointerType === 'mouse' || event.buttons === 1) selectAtPointer(event); }}
                onKeyDown={event => {
                    const next = wrappedChartKey(event.key, selected, 1, 12);
                    if (next !== null) { event.preventDefault(); setSelected(next); }
                }}>
                <title id={`${id}-title`}>{t('wrappedCinema.monthChart')}</title>
                <defs>
                    <linearGradient id={`${id}-area`} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#b69cff" stopOpacity="0.26" />
                        <stop offset="100%" stopColor="#b69cff" stopOpacity="0.01" />
                    </linearGradient>
                    <linearGradient id={`${id}-line`} x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0%" stopColor="#8271c9" /><stop offset="65%" stopColor="#d5c2ff" /><stop offset="100%" stopColor="#f0eaff" />
                    </linearGradient>
                </defs>
                {axis.ticks.map((tick, index) => <g key={tick}>
                    <line x1="64" x2="570" y1={y(tick)} y2={y(tick)} stroke="#ffffff" strokeOpacity="0.09" strokeDasharray={tick === 0 ? undefined : '3 7'} />
                    <text x="48" y={y(tick) + 6} textAnchor="end" fontSize="20" fill="#a9a0b9">{tickLabels[index]}</text>
                </g>)}
                {futureStart && <g>
                    <rect x={x(futureStart) - 20} y="48" width={590 - x(futureStart)} height="258" fill="#ffffff" fillOpacity="0.025" rx="10" />
                    <text x={(x(futureStart) + 570) / 2} y="182" textAnchor="middle" fontSize="18" fill="#9d94ae">{t('wrappedCinema.upcoming')}</text>
                </g>}
                <path d={area} fill={`url(#${id}-area)`} />
                <path d={path} fill="none" stroke="#514175" strokeWidth="10" strokeLinecap="round" transform="translate(0 5)" />
                <motion.path d={path} fill="none" stroke={`url(#${id}-line)`} strokeWidth="5" strokeLinecap="round"
                    initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }} />
                {partialPath && <path d={partialPath} fill="none" stroke="#c4b2ef" strokeOpacity="0.65" strokeWidth="3" strokeDasharray="6 7" />}
                {!item.future && <g>
                    <line x1={x(selected)} x2={x(selected)} y1={y(item.minutes)} y2="306" stroke="#ded4ff" strokeOpacity="0.45" strokeDasharray="4 6" />
                    <circle cx={x(selected)} cy={y(item.minutes)} r="12" fill="#20182f" stroke="#d5c2ff" strokeOpacity="0.35" strokeWidth="2" />
                    <circle cx={x(selected)} cy={y(item.minutes)} r="5" fill="#f4efe6" />
                </g>}
                {months.map(month => <text key={month.month} x={x(month.month)} y="338" textAnchor="middle" fontSize="18" fill={month.month === selected ? '#f4efe6' : month.future ? '#70677d' : '#aaa0ba'}>{labels[month.month - 1].short}</text>)}
            </svg>
            <p id={`${id}-hint`} className="mt-3 text-xs leading-relaxed text-[#b6accc]">{t('wrappedCinema.chartDirectHint')}{currentMonth && <span className="mt-1 block">{t('wrappedCinema.currentMonthNote', { month: labels[currentMonth.month - 1].full })}</span>}</p>
        </ChartFrame>
    );
}
