import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { WRAPPED_EASE_OUT, WRAPPED_FRAME_ANIMATION } from '@/utils/wrappedMotion';

/** Entrée du contenu après le départ caméra ; ne pas englober une affiche partagée. */
export default function WrappedReveal({ children, className, delay = 0.2, axis = 'y', distance = 26 }: {
    children: ReactNode; className?: string; delay?: number; axis?: 'x' | 'y'; distance?: number;
}) {
    const reduced = useReducedMotion();
    return <motion.div {...WRAPPED_FRAME_ANIMATION} className={className}
        initial={reduced ? false : { opacity: 0, transform: `translate${axis.toUpperCase()}(${distance}px)` }}
        animate={{ opacity: 1, transform: 'none' }}
        transition={{ duration: reduced ? 0 : 0.52, delay: reduced ? 0 : delay, ease: [...WRAPPED_EASE_OUT] }}>
        {children}
    </motion.div>;
}
