import { motion, useReducedMotion } from 'framer-motion';
import type { WrappedTopContent } from '@/services/wrappedService';
import { wrappedMediaKey } from '@/utils/wrappedPresentation';
import WrappedPoster from './WrappedPoster';
import WrappedTilt from './WrappedTilt';
import { WRAPPED_EASE_OUT, WRAPPED_FRAME_ANIMATION } from '@/utils/wrappedMotion';

export default function WrappedPosterGallery({ items, focused = false }: { items: WrappedTopContent[]; focused?: boolean }) {
    const reduce = useReducedMotion();
    const ordered = focused ? items.slice(0, 1) : [items[1], items[0], items[2]].filter(Boolean);

    return (
        <div className="wrapped-gallery relative w-full" data-focused={focused}><WrappedTilt className="h-full w-full" surfaceClassName="absolute inset-0">
            {focused && <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center text-[clamp(220px,40vw,480px)] font-black leading-none tracking-[-0.04em] text-[#d6ffc0]/[0.055]">01</span>}
                {ordered.map((item, index) => {
                    const offset = index - (ordered.length - 1) / 2;
                    const pose = focused
                        ? 'translate(-50%, -50%)'
                        : `translate(-50%, -50%) translateX(${offset * 80}%) translateY(${Math.abs(offset) * 18}%) rotate(${offset * 9}deg)`;
                    return <motion.div {...WRAPPED_FRAME_ANIMATION} key={wrappedMediaKey(item)}
                        className="wrapped-gallery-poster absolute left-1/2 top-1/2 [backface-visibility:hidden]"
                        initial={reduce || focused ? false : { opacity: 0, transform: `translate(-50%, -50%) translateX(${offset * 125}%) translateY(35%) rotate(${offset * 18}deg)` }}
                        animate={{ opacity: 1, transform: reduce ? (focused ? 'translate(-50%, -50%)' : pose) : pose }}
                        transition={{ duration: 0.82, ease: [...WRAPPED_EASE_OUT], delay: reduce ? 0 : Math.abs(offset) * 0.04 }}
                        style={{ zIndex: 10 - Math.round(Math.abs(offset) * 2) }}>
                        <WrappedPoster item={item} className="w-full shadow-[0_24px_38px_rgba(0,0,0,0.45)]" />
                    </motion.div>;
                })}
        </WrappedTilt></div>
    );
}
