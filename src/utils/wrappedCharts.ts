import type { WrappedData } from '@/services/wrappedService';

export interface ChartPoint { x: number; y: number }

export function chartAxis(maximum: number) {
    const safe = Number.isFinite(maximum) ? Math.max(0, maximum) : 0;
    const steps = [1, 2, 5, 10, 15, 30, 60, 120, 180, 240, 360, 720, 1440, 2880, 5760];
    const step = steps.find(value => value >= safe / 4) || Math.ceil(safe / 4 / 1440) * 1440;
    const max = Math.max(step, Math.ceil(safe / step) * step);
    return { max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step) };
}

export function wrappedMonths(data: Pick<WrappedData, 'year' | 'monthlyGraph' | 'isDemo'>, now = new Date()) {
    return Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const value = data.monthlyGraph?.find(item => item.month === month)?.minutes || 0;
        const minutes = Number.isFinite(value) ? Math.max(0, value) : 0;
        const current = !data.isDemo && data.year === now.getFullYear() && month === now.getMonth() + 1;
        const future = !data.isDemo && minutes === 0 && (data.year > now.getFullYear() || (data.year === now.getFullYear() && month > now.getMonth() + 1));
        return { month, minutes, current, future };
    });
}

export function wrappedChartKey(key: string, current: number, minimum: number, maximum: number): number | null {
    if (key === 'Home') return minimum;
    if (key === 'End') return maximum;
    if (key === 'ArrowRight' || key === 'ArrowUp') return Math.min(maximum, current + 1);
    if (key === 'ArrowLeft' || key === 'ArrowDown') return Math.max(minimum, current - 1);
    return null;
}

/** Courbe monotone par intervalle : les contrôles restent entre les deux valeurs. */
export function chartCurve(points: ChartPoint[]): string {
    if (!points.length) return '';
    return points.reduce((path, point, i) => {
        if (!i) return `M ${point.x} ${point.y}`;
        const previous = points[i - 1];
        const middle = (previous.x + point.x) / 2;
        return `${path} C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
    }, '');
}

export function polarPoint(cx: number, cy: number, radius: number, degrees: number): ChartPoint {
    const angle = (degrees - 90) * Math.PI / 180;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

export function ringSector(cx: number, cy: number, inner: number, outer: number, start: number, end: number): string {
    if (outer <= inner || end <= start) return '';
    const span = Math.min(end - start, 359.999);
    const a = polarPoint(cx, cy, outer, start), b = polarPoint(cx, cy, outer, start + span);
    const c = polarPoint(cx, cy, inner, start + span), d = polarPoint(cx, cy, inner, start);
    const large = span > 180 ? 1 : 0;
    return `M ${a.x} ${a.y} A ${outer} ${outer} 0 ${large} 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${inner} ${inner} 0 ${large} 0 ${d.x} ${d.y} Z`;
}

export function formatSectors(items: WrappedData['byType']) {
    const valid = items.filter(item => Number.isFinite(item.minutes) && item.minutes > 0);
    const total = valid.reduce((sum, item) => sum + item.minutes, 0);
    let angle = 0;
    return valid.map(item => {
        const start = angle;
        angle += item.minutes / total * 360;
        const gap = Math.min(2.5, (angle - start) * 0.15);
        return { ...item, start: start + gap / 2, end: angle - gap / 2, middle: (start + angle) / 2 };
    });
}

export function wrappedHours(hours: WrappedData['listeningClock']) {
    return Array.from({ length: 24 }, (_, hour) => {
        const value = hours?.find(item => item.hour === hour)?.minutes || 0;
        return { hour, minutes: Number.isFinite(value) ? Math.max(0, value) : 0 };
    });
}
