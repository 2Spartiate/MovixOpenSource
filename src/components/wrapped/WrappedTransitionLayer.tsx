import { motion } from 'framer-motion';
import { wrappedTransitionDuration, WRAPPED_EASE_MORPH, type WrappedTransition } from '@/utils/wrappedMotion';

/** Repères de caméra très fins. Le raccord reste porté par les vraies scènes. */
export default function WrappedTransitionLayer({ kind, direction, accent, reduced }: {
    kind: WrappedTransition; direction: number; accent: string; reduced: boolean;
}) {
    if (reduced || !['shutter', 'reel'].includes(kind)) return null;
    const horizontal = kind === 'reel';
    return <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-hidden" viewBox="0 0 1000 1000" preserveAspectRatio="none" data-wrapped-transition={kind}>
        {(horizontal ? [0] : [0, 1]).map(index => <motion.line key={index} stroke={accent} strokeWidth="1" vectorEffect="non-scaling-stroke"
            initial={horizontal ? { x1: direction > 0 ? 1000 : 0, x2: direction > 0 ? 1000 : 0, y1: 0, y2: 1000, opacity: 0 } : { x1: index ? 720 : 280, x2: index ? 720 : 280, y1: 360, y2: 640, opacity: 0 }}
            animate={horizontal ? { x1: direction > 0 ? 0 : 1000, x2: direction > 0 ? 0 : 1000, opacity: [0, 0.5, 0] } : { x1: index ? 1000 : 0, x2: index ? 1000 : 0, y1: 0, y2: 1000, opacity: [0, 0.45, 0] }}
            transition={{ duration: wrappedTransitionDuration(kind), ease: [...WRAPPED_EASE_MORPH], times: [0, 0.3, 1] }} />)}
    </svg>;
}
