import type { WrappedScene } from '../types/wrapped';

export const WRAPPED_EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const WRAPPED_EASE_MORPH = [0.76, 0, 0.24, 1] as const;

/**
 * Framer Motion 11 annule son animation native avant de peindre les styles finaux :
 * transform, opacity et clipPath reprennent alors leur valeur initiale une image.
 * onUpdate maintient ces animations sur sa boucle de rendu JS (API publique),
 * où valeur et style sont mis à jour dans la même frame. Ne pas retirer ce callback
 * sans revérifier la fin des transitions dans un navigateur.
 */
export const WRAPPED_FRAME_ANIMATION = { onUpdate: () => undefined };
const camera = (x = 0, y = 0, scale = 1, rotate = 0) => `translateX(${x}%) translateY(${y}%) scale(${scale}) rotate(${rotate}deg)`;
// Framer 11 interpole « scale(...) → none » vers scale(0), pas vers scale(1).
export const WRAPPED_CAMERA_REST = camera();
export const WRAPPED_APERTURE_REST = 'inset(0% 0% 0% 0% round 0%)';

export type WrappedTransition = 'shutter' | 'ribbon' | 'fan' | 'gallery' | 'orbit' | 'poster' | 'podium' | 'track' | 'reel' | 'quote' | 'stamp' | 'print' | 'fade';

const transitions: Record<WrappedScene, WrappedTransition> = {
    intro: 'shutter', time: 'shutter', timeline: 'ribbon', genres: 'fan', quiz: 'gallery', favorite: 'poster',
    'top-five': 'podium', rhythm: 'orbit', community: 'quote', persona: 'stamp', closing: 'print', race: 'track', eras: 'reel', awards: 'podium',
};

export function wrappedTransition(from: string, to: string, direction = 1): WrappedTransition {
    if (from === 'details' || to === 'details') return 'fade';
    // Retour arrière : rembobiner la transition qui vient d'être franchie.
    const destination = direction < 0 ? from : to;
    return transitions[destination as WrappedScene] || 'fade';
}

export function wrappedTransitionDuration(kind: WrappedTransition, reduced = false): number {
    if (reduced) return 0.16;
    return kind === 'fade' ? 0.24 : kind === 'poster' || kind === 'podium' || kind === 'print' ? 0.84 : 0.76;
}

export function wrappedScenePose(kind: WrappedTransition, direction: number, phase: 'enter' | 'exit', reduced: boolean) {
    if (reduced) return { opacity: 0, transform: 'none' };
    const entering = phase === 'enter';
    const sign = direction * (entering ? 1 : -1);
    switch (kind) {
        // Les parents restent immobiles : la projection effectue le trajet des affiches.
        case 'poster': case 'podium': case 'track': case 'stamp': return { opacity: 1, transform: camera() };
        case 'print': return { opacity: 1, transform: camera(), clipPath: entering
            ? (direction > 0 ? 'inset(0% 0% 100% 0% round 0%)' : 'inset(100% 0% 0% 0% round 0%)') : WRAPPED_APERTURE_REST };
        // Le cadre photographique devient la scène entière, sans aplat intercalé.
        case 'shutter': return entering
            ? { opacity: 1, transform: camera(0, 0, 1.16), clipPath: 'inset(36% 28% 36% 28% round 0%)' }
            : { opacity: 1, transform: camera(0, 0, 0.92), clipPath: WRAPPED_APERTURE_REST };
        case 'ribbon': return { opacity: 1, transform: camera(sign * (entering ? 100 : 24)), clipPath: WRAPPED_APERTURE_REST };
        case 'fan': return entering
            ? { opacity: 1, transform: camera(0, 12, 0.94), clipPath: 'inset(100% 0% 0% 0% round 0%)' }
            : { opacity: 1, transform: camera(0, -12, 0.94), clipPath: WRAPPED_APERTURE_REST };
        // Le quiz est composé par ses trois affiches, pas par un masque de page.
        case 'gallery': return { opacity: 0, transform: camera(), clipPath: WRAPPED_APERTURE_REST };
        case 'orbit': return entering
            ? { opacity: 1, transform: camera(0, 0, 0.86, sign * -8), clipPath: 'inset(50% 36% 50% 64% round 50%)' }
            : { opacity: 1, transform: camera(0, 0, 1.06) };
        case 'reel': return { opacity: 1, transform: camera(sign * 100), clipPath: WRAPPED_APERTURE_REST };
        case 'quote': return entering
            ? { opacity: 1, transform: camera(0, sign * 18), clipPath: 'inset(100% 0% 0% 0% round 0%)' }
            : { opacity: 1, transform: camera(0, 0, 0.96), clipPath: WRAPPED_APERTURE_REST };
        default: return { opacity: 0, transform: camera() };
    }
}
