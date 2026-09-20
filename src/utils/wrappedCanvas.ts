import inter800Url from '@fontsource/inter/files/inter-latin-800-normal.woff2?url';
import inter400Url from '@fontsource/inter/files/inter-latin-400-normal.woff2?url';
import inter600Url from '@fontsource/inter/files/inter-latin-600-normal.woff2?url';
import inter900Url from '@fontsource/inter/files/inter-latin-900-normal.woff2?url';
import archivoBlackUrl from '@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff2?url';

let fontsPromise: Promise<void> | null = null;

export function ensureShareFonts(): Promise<void> {
    if (typeof FontFace === 'undefined') return Promise.resolve();
    if (!fontsPromise) {
        fontsPromise = new Promise<void>(resolve => {
            const timeout = setTimeout(resolve, 4000);
            const faces = [
                new FontFace('Inter', `url(${inter400Url})`, { weight: '400' }),
                new FontFace('Inter', `url(${inter600Url})`, { weight: '600' }),
                new FontFace('Inter', `url(${inter800Url})`, { weight: '800' }),
                new FontFace('Inter', `url(${inter900Url})`, { weight: '900' }),
                new FontFace('Archivo Black', `url(${archivoBlackUrl})`, { weight: '400' }),
            ];
            Promise.all(faces.map(async face => document.fonts.add(await face.load())))
                .catch(() => { fontsPromise = null; })
                .finally(() => { clearTimeout(timeout); resolve(); });
        });
    }
    return fontsPromise;
}

function decodeImage(src: string, crossOrigin = false): Promise<HTMLImageElement | null> {
    return new Promise(resolve => {
        const image = new Image();
        const finish = (result: HTMLImageElement | null) => {
            clearTimeout(timer);
            image.onload = null;
            image.onerror = null;
            if (!result) image.removeAttribute('src');
            resolve(result);
        };
        const timer = setTimeout(() => finish(null), 4000);
        if (crossOrigin) image.crossOrigin = 'anonymous';
        image.onload = () => finish(image);
        image.onerror = () => finish(null);
        image.src = src;
    });
}

/** Une URL dédiée évite les réponses opaques des posters déjà mis en cache par le SW. */
export async function loadCanvasImage(src: string): Promise<HTMLImageElement | null> {
    const corsSrc = new URL(src, window.location.origin);
    corsSrc.searchParams.set('cors', '1');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    let blobUrl: string | null = null;
    try {
        const response = await fetch(corsSrc.href, { mode: 'cors', signal: controller.signal });
        if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
        blobUrl = URL.createObjectURL(await response.blob());
        return await decodeImage(blobUrl);
    } catch {
        return await decodeImage(corsSrc.href, true);
    } finally {
        clearTimeout(timeout);
        if (blobUrl) URL.revokeObjectURL(blobUrl);
    }
}
