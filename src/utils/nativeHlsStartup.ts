export function prepareNativeHlsStartup(
    video: HTMLVideoElement,
    preferLiveEdge: boolean,
    onReady: () => void,
): () => void {
    // Le HLS natif ne passe pas par pLoader et peut appliquer EXT-X-START=4.
    // Attendre canplay pour disposer des plages, puis choisir le direct avant
    // la première lecture. Les autres sources conservent leur démarrage habituel.
    const readyEvent = preferLiveEdge ? 'canplay' : 'loadedmetadata';
    const onNativeReady = () => {
        if (preferLiveEdge && video.duration === Infinity) {
            try {
                const ranges = video.seekable;
                if (ranges.length > 0) {
                    const start = ranges.start(ranges.length - 1);
                    const end = ranges.end(ranges.length - 1);
                    if (Number.isFinite(start) && start >= 0 && Number.isFinite(end) && end > start) {
                        // Marge de trois segments FCTV de trois secondes.
                        const position = Math.max(start, end - 9);
                        if (video.currentTime < position || video.currentTime > end) {
                            video.currentTime = position;
                        }
                    }
                }
            } catch {
                // Une plage devenue indisponible laisse le lecteur natif démarrer.
            }
        }
        onReady();
    };
    video.addEventListener(readyEvent, onNativeReady, { once: true });
    return () => video.removeEventListener(readyEvent, onNativeReady);
}
