import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { motion, usePresence } from 'framer-motion';
import WrappedImage from './WrappedImage';
import { wrappedScenePose, wrappedTransitionDuration, WRAPPED_APERTURE_REST, WRAPPED_CAMERA_REST, WRAPPED_EASE_MORPH, WRAPPED_FRAME_ANIMATION, type WrappedTransition } from '@/utils/wrappedMotion';

/** Deux scènes coexistent pendant le glissement, chacune avec son propre défilement. */
export default function WrappedSceneViewport({ children, scene, direction, reducedMotion, tone, backdrop, onViewport, onMeasure, transitionKind = 'fade' }: {
    children: ReactNode;
    scene: string;
    direction: number;
    transitionKind?: WrappedTransition;
    reducedMotion: boolean;
    tone: { background: string; accent: string };
    backdrop: string | null;
    onViewport: (element: HTMLDivElement) => void;
    onMeasure: (element: HTMLDivElement, contentHeight: number) => void;
}) {
    const [present, safeToRemove] = usePresence();
    const viewportRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const removeRef = useRef(safeToRemove);
    removeRef.current = safeToRemove;

    useEffect(() => {
        if (present) return;
        // Une sortie immobile se termine immédiatement pour Framer. Garder son
        // image derrière le masque entrant évite une ouverture sur une page vide.
        const timer = setTimeout(() => removeRef.current?.(), reducedMotion ? 160 : 840);
        return () => clearTimeout(timer);
    }, [present, reducedMotion]);

    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        const content = contentRef.current;
        if (!viewport || !content) return;
        viewport.inert = !present;
        if (!present) return;
        onViewport(viewport);
        // Mesurer le contenu en flux, pas les ombres ni les transformations 3D.
        const measure = () => onMeasure(viewport, content.offsetHeight);
        const observer = new ResizeObserver(measure);
        observer.observe(viewport);
        observer.observe(content);
        viewport.addEventListener('scroll', measure, { passive: true });
        measure();
        return () => { observer.disconnect(); viewport.removeEventListener('scroll', measure); };
    }, [present, onViewport, onMeasure]);

    return <motion.div {...WRAPPED_FRAME_ANIMATION} ref={viewportRef} data-wrapped-scene={scene} data-lenis-prevent aria-hidden={!present || undefined}
        custom={{ direction, transitionKind, reducedMotion }} initial="enter" animate="center" exit="exit"
        variants={{
            enter: () => wrappedScenePose(transitionKind, direction, 'enter', reducedMotion),
            center: { opacity: 1, transform: reducedMotion ? 'none' : WRAPPED_CAMERA_REST, clipPath: WRAPPED_APERTURE_REST },
            exit: (navigation: { direction: number; transitionKind: WrappedTransition; reducedMotion: boolean }) => ({
                ...wrappedScenePose(navigation.transitionKind, navigation.direction, 'exit', navigation.reducedMotion),
                transition: { duration: wrappedTransitionDuration(navigation.transitionKind, navigation.reducedMotion), ease: [...WRAPPED_EASE_MORPH], ...(navigation.transitionKind === 'gallery' && !navigation.reducedMotion ? { opacity: { duration: 0.24 } } : {}) },
            }),
        }}
        transition={{ duration: wrappedTransitionDuration(transitionKind, reducedMotion), ease: [...WRAPPED_EASE_MORPH], ...(transitionKind === 'gallery' && !reducedMotion ? { opacity: { duration: 0.24, delay: 0.12 } } : {}) }}
        className={`absolute inset-0 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain ${present ? '' : 'pointer-events-none'}`}
        style={{ '--wrapped-accent': tone.accent, '--wrapped-background': tone.background, backgroundColor: tone.background, zIndex: present ? 1 : 0 } as CSSProperties}>
        {backdrop && <div className="pointer-events-none absolute inset-0 opacity-[0.12] lg:left-1/3 lg:opacity-20" aria-hidden="true"><WrappedImage src={backdrop} alt="" backdrop className="h-full w-full" /><div className="absolute inset-0 bg-gradient-to-r from-[var(--wrapped-background)] via-transparent to-transparent" /></div>}
        <div ref={contentRef} className="wrapped-scene-content relative flex min-h-full flex-col justify-center px-5 py-3 sm:px-7 lg:px-12">{children}</div>
    </motion.div>;
}
