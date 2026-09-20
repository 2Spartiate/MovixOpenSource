import scoreUrl from '../assets/wrapped/wrapped-score.mp3?url';

let scorePromise: Promise<AudioBuffer> | null = null;

/** One immutable, pre-mixed score for both preview and export; no live oscillator approximation. */
export function prepareWrappedScore(): Promise<AudioBuffer> {
    if (!scorePromise) {
        scorePromise = (async () => {
            const controller = new AbortController();
            let timer: ReturnType<typeof setTimeout>;
            try {
                return await Promise.race([
                    (async () => {
                        const response = await fetch(scoreUrl, { signal: controller.signal });
                        if (!response.ok) throw new Error('Score unavailable');
                        const decoder = new OfflineAudioContext(2, 1, 48000);
                        return decoder.decodeAudioData(await response.arrayBuffer());
                    })(),
                    new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Score timeout')); }, 8000); }),
                ]);
            } finally { clearTimeout(timer!); }
        })().catch(error => { scorePromise = null; throw error; });
    }
    return scorePromise;
}

export function startWrappedScore(context: AudioContext, destination: MediaStreamAudioDestinationNode, buffer: AudioBuffer, monitor = false, from = 0) {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
    if (monitor) source.connect(context.destination);
    source.start(context.currentTime + 0.015, Math.max(0, Math.min(from, buffer.duration)));
    return () => {
        try { source.stop(); } catch { /* already ended */ }
        source.disconnect();
    };
}
