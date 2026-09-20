import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';

/** Rotation, déplacement et soulèvement communs aux affiches et aux cartes du Wrapped. */
export default function WrappedTilt({ children, className = '', surfaceClassName = '' }: { children: ReactNode; className?: string; surfaceClassName?: string }) {
    const reduce = useReducedMotion();
    const surface = useRef<HTMLDivElement>(null);
    const x = useMotionValue(0), y = useMotionValue(0), lift = useMotionValue(0);
    const springX = useSpring(x, { stiffness: 100, damping: 20 });
    const springY = useSpring(y, { stiffness: 100, damping: 20 });
    const depth = useSpring(lift, { stiffness: 100, damping: 20 });
    const rotateX = useTransform(springY, [-1, 1], [14, -14]);
    const rotateY = useTransform(springX, [-1, 1], [-18, 18]);
    const moveX = useTransform(springX, [-1, 1], [-24, 24]);
    const moveY = useTransform(springY, [-1, 1], [-18, 18]);
    const transform = useMotionTemplate`perspective(900px) translate3d(${moveX}px, ${moveY}px, ${depth}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    const reset = useCallback(() => { x.set(0); y.set(0); lift.set(0); }, [x, y, lift]);

    useEffect(() => {
        if (reduce) reset();
        window.addEventListener('blur', reset);
        return () => window.removeEventListener('blur', reset);
    }, [reduce, reset]);

    return <div ref={surface} className={`relative isolate ${className}`} data-wrapped-tilt
        onPointerMove={event => {
            if (reduce || event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
            const box = surface.current?.getBoundingClientRect();
            if (!box?.width || !box.height) return;
            // La zone de suivi reste fixe ; les coordonnées sont bornées même si une carte en sort.
            x.set(Math.max(-1, Math.min(1, (event.clientX - box.left) / box.width * 2 - 1)));
            y.set(Math.max(-1, Math.min(1, (event.clientY - box.top) / box.height * 2 - 1)));
            lift.set(20);
        }} onPointerLeave={reset} onPointerCancel={reset}>
        <motion.div className={`[transform-style:preserve-3d] ${surfaceClassName}`} style={{ transform: reduce ? undefined : transform }}>{children}</motion.div>
    </div>;
}
