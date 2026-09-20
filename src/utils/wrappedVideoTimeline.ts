export const WRAPPED_VIDEO_DURATION = 18;
export const WRAPPED_VIDEO_FPS = 30;
export const WRAPPED_VIDEO_FINAL_MIN_DURATION = 4;
/** Piste montée à son tempo natif : les changements de plan tombent sur le temps. */
export const WRAPPED_VIDEO_BEAT_SECONDS = 60 / 114;

export type WrappedVideoOptions = {
    watchTime: boolean;
    titleCount: boolean;
    favorite: boolean;
    portrait: boolean;
    sound: boolean;
};

export type WrappedVideoScene = 'intro' | 'watchTime' | 'titleCount' | 'favorite' | 'portrait' | 'final';

export type WrappedVideoBeat = { scene: WrappedVideoScene; start: number; end: number };

export const DEFAULT_WRAPPED_VIDEO_OPTIONS: WrappedVideoOptions = {
    watchTime: true,
    titleCount: true,
    favorite: true,
    portrait: true,
    sound: false,
};

export function hasWrappedVideoContent(options: Pick<WrappedVideoOptions, 'watchTime' | 'titleCount' | 'favorite' | 'portrait'>) {
    return options.watchTime || options.titleCount || options.favorite || options.portrait;
}

export function getEffectiveWrappedVideoOptions(options: WrappedVideoOptions, itemCount: number): WrappedVideoOptions {
    return { ...options, favorite: options.favorite && itemCount > 0 };
}

/** Après un changement de profil, conserve toujours un contenu visible dans le film. */
export function normalizeWrappedVideoOptions(options: WrappedVideoOptions, itemCount: number): WrappedVideoOptions {
    const effective = getEffectiveWrappedVideoOptions(options, itemCount);
    if (hasWrappedVideoContent(effective)) return options;
    return { ...options, favorite: false, portrait: true };
}

/**
 * Le générique reste à 18 secondes quelles que soient les cartes retenues.
 * L'introduction ne montre des affiches que lorsque le choix « numéro 1 » est actif.
 */
export function buildWrappedVideoTimeline(options: WrappedVideoOptions): WrappedVideoBeat[] {
    const selected: WrappedVideoScene[] = [];
    if (options.watchTime) selected.push('watchTime');
    else if (options.titleCount) selected.push('titleCount');
    if (options.favorite) selected.push('favorite');
    if (options.portrait) selected.push('portrait');
    if (!selected.length) return [{ scene: 'final', start: 0, end: WRAPPED_VIDEO_DURATION }];

    const introEnd = 6 * WRAPPED_VIDEO_BEAT_SECONDS;
    const finalStart = 26 * WRAPPED_VIDEO_BEAT_SECONDS;
    const weights = selected.map(scene => scene === 'watchTime' || scene === 'titleCount' ? 4 : 3);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = introEnd;
    let consumedWeight = 0;
    const beats: WrappedVideoBeat[] = [{ scene: 'intro', start: 0, end: introEnd }];
    selected.forEach((scene, index) => {
        const start = cursor;
        consumedWeight += weights[index];
        const end = index === selected.length - 1 ? finalStart : (6 + Math.round(10 * consumedWeight / totalWeight) * 2) * WRAPPED_VIDEO_BEAT_SECONDS;
        beats.push({ scene, start, end });
        cursor = end;
    });
    beats.push({ scene: 'final', start: finalStart, end: WRAPPED_VIDEO_DURATION });
    return beats;
}

export function getWrappedVideoBeatAt(time: number, timeline: WrappedVideoBeat[]): WrappedVideoBeat {
    const safeTime = Math.max(0, Math.min(WRAPPED_VIDEO_DURATION, time));
    return timeline.find(beat => safeTime >= beat.start && safeTime < beat.end) || timeline[timeline.length - 1];
}

export function getWrappedVideoProgress(time: number, beat: WrappedVideoBeat) {
    if (beat.end <= beat.start) return 1;
    return Math.max(0, Math.min(1, (time - beat.start) / (beat.end - beat.start)));
}
