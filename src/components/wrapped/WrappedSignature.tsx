import { useTranslation } from 'react-i18next';
import type { WrappedData } from '@/services/wrappedService';
import { wrappedMonths } from '@/utils/wrappedCharts';
import { wrappedSignaturePeriod } from '@/utils/wrappedPresentation';

export default function WrappedSignature({ data }: { data: WrappedData }) {
    const { t, i18n } = useTranslation();
    const months = wrappedMonths(data);
    const max = Math.max(1, ...months.map(month => month.minutes));
    if (!data.monthlyGraph?.some(month => month.minutes > 0)) return null;
    return <figure className="mt-6">
        <svg viewBox="0 0 400 84" className="w-full" role="img" aria-label={t('wrappedCinema.signatureDescription')}>
            {months.map((month, i) => <rect key={month.month} x={i * 34} y={76 - (month.future ? 9 : Math.max(2, month.minutes / max * 72))}
                width="22" height={month.future ? 9 : Math.max(2, month.minutes / max * 72)} rx="2" fill={month.future ? 'none' : 'currentColor'} stroke={month.future ? 'currentColor' : 'none'} opacity={month.future ? 0.35 : 0.78} />)}
        </svg>
        <figcaption className="mt-2 text-xs leading-relaxed opacity-75">{t('wrappedCinema.signatureDescription')}<span className="mt-1 block">{wrappedSignaturePeriod(data.year, i18n.language, t, data.isDemo ? new Date(data.year + 1, 0, 1) : undefined)}</span></figcaption>
    </figure>;
}
