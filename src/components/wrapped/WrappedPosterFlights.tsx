import { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { wrappedTransitionDuration, WRAPPED_EASE_MORPH, WRAPPED_FRAME_ANIMATION, type WrappedTransition } from '@/utils/wrappedMotion';
import WrappedImage from './WrappedImage';

type Box = { x: number; y: number; width: number; height: number };
type Flight = { key: string; src: string | null; title: string; from: Box; to: Box };

/** Une seule image suit le raccord, hors des masques et perspectives des deux scènes. */
export default function WrappedPosterFlights({ from, to, kind, reduced }: {
    from: string; to: string; kind: WrappedTransition; reduced: boolean;
}) {
    const root = useRef<HTMLDivElement>(null);
    const [flights, setFlights] = useState<Flight[]>([]);
    useLayoutEffect(() => {
        const layer = root.current;
        const stage = layer?.parentElement;
        if (!layer || !stage || reduced || !['poster', 'podium', 'track', 'stamp', 'print'].includes(kind)) return;
        const viewports = Array.from(stage.querySelectorAll<HTMLElement>('[data-wrapped-scene]'));
        const outgoing = viewports.find(element => element.dataset.wrappedScene === from && element.getAttribute('aria-hidden') === 'true');
        const incoming = viewports.find(element => element.dataset.wrappedScene === to && element.getAttribute('aria-hidden') !== 'true');
        if (!outgoing || !incoming) return;
        const origin = layer.getBoundingClientRect();
        const box = (element: HTMLElement): Box => {
            const rect = element.getBoundingClientRect();
            return { x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height };
        };
        const targets = Array.from(incoming.querySelectorAll<HTMLElement>('[data-wrapped-poster][data-wrapped-shared="true"]'));
        const hidden: HTMLElement[] = [];
        const cards = new Set<HTMLElement>();
        const next: Flight[] = [];
        for (const source of outgoing.querySelectorAll<HTMLElement>('[data-wrapped-poster][data-wrapped-shared="true"]')) {
            const target = targets.find(element => element.dataset.wrappedPoster === source.dataset.wrappedPoster);
            if (!target) continue;
            const start = box(source), end = box(target);
            if (!start.width || !end.width || start.y + start.height < 0 || start.y > origin.height) continue;
            const image = source.querySelector('img');
            next.push({ key: source.dataset.wrappedPoster!, from: start, to: end, src: image?.currentSrc || image?.src || null, title: image?.alt || source.textContent || '' });
            for (const element of [source, target]) {
                element.dataset.wrappedFlight = 'true'; hidden.push(element);
                const card = element.closest<HTMLElement>('[data-wrapped-card]');
                if (card) { card.dataset.wrappedFlight = 'true'; cards.add(card); }
            }
        }
        setFlights(next);
        return () => {
            hidden.forEach(element => { delete element.dataset.wrappedFlight; });
            cards.forEach(element => { delete element.dataset.wrappedFlight; });
        };
    }, [from, to, kind, reduced]);

    return <div ref={root} aria-hidden="true" className="pointer-events-none absolute inset-0 z-30 overflow-hidden" data-wrapped-flights>
        {flights.map(flight => <motion.div {...WRAPPED_FRAME_ANIMATION} key={flight.key} data-wrapped-flight-poster={flight.key}
            className="absolute left-0 top-0 origin-top-left" style={{ width: flight.from.width, height: flight.from.height }}
            initial={{ x: flight.from.x, y: flight.from.y, scaleX: 1, scaleY: 1 }}
            animate={{ x: flight.to.x, y: flight.to.y, scaleX: flight.to.width / flight.from.width, scaleY: flight.to.height / flight.from.height }}
            transition={{ duration: wrappedTransitionDuration(kind), ease: [...WRAPPED_EASE_MORPH] }}>
            <WrappedImage src={flight.src} alt={flight.title} className="h-full w-full shadow-[0_16px_32px_rgba(0,0,0,0.24)]" />
        </motion.div>)}
    </div>;
}
