import type { HlsConfig, LoaderCallbacks, LoaderConfiguration, LoaderContext } from 'hls.js';

export function createFctvPlaylistLoader(BaseLoader: HlsConfig['loader']): HlsConfig['loader'] {
    return class extends BaseLoader {
        load(context: LoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>): void {
            super.load(context, config, {
                ...callbacks,
                onSuccess(response, stats, loadedContext, networkDetails) {
                    const playlist = response.data;
                    if (typeof playlist === 'string' && playlist.trimStart().startsWith('#EXTM3U')
                        && !/^#EXT-X-ENDLIST\s*$/m.test(playlist)) {
                        // FCTV impose TIME-OFFSET=4 depuis le début de sa fenêtre.
                        // Ce départ trop ancien déclenche un saut de rattrapage
                        // quelques secondes après. Laisser HLS choisir le live edge.
                        const livePlaylist = playlist.replace(/^#EXT-X-START:[^\r\n]*(?:\r?\n|$)/gm, '');
                        if (livePlaylist !== playlist) {
                            response = { ...response, data: livePlaylist };
                        }
                    }
                    callbacks.onSuccess(response, stats, loadedContext, networkDetails);
                },
            });
        }
    };
}
