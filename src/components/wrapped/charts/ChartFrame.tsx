import { useEffect, useState, type ReactNode } from 'react';

export default function ChartFrame({ children, onExplore, className = '', label }: {
    children: ReactNode;
    onExplore?: (active: boolean) => void;
    className?: string;
    label: string;
}) {
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [held, setHeld] = useState(false);
    useEffect(() => {
        onExplore?.(hovered || focused || held);
        return () => onExplore?.(false);
    }, [hovered, focused, held, onExplore]);

    return (
        <div data-wrapped-interactive className={`min-w-0 ${className}`} role="group" aria-label={label}
            onPointerEnter={event => event.pointerType === 'mouse' && setHovered(true)}
            onPointerLeave={() => { setHovered(false); setHeld(false); }}
            onPointerDownCapture={() => setHeld(true)} onPointerUpCapture={() => setHeld(false)}
            onPointerCancel={() => setHeld(false)} onFocusCapture={() => setFocused(true)}
            onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
            {children}
        </div>
    );
}
