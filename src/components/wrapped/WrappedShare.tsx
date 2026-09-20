import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowLeft, ChevronDown, Copy, Download, Film, Loader2, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { WrappedShareCardData, WrappedShareFormat } from '@/types/wrapped';
import { generateWrappedShareCard } from '@/utils/wrappedShareCards';
import WrappedTilt from './WrappedTilt';
import WrappedPoster from './WrappedPoster';
import type { WrappedTopContent } from '@/services/wrappedService';
import { motion, useReducedMotion } from 'framer-motion';
import { WRAPPED_EASE_MORPH, WRAPPED_FRAME_ANIMATION } from '@/utils/wrappedMotion';

const WrappedVideo = lazy(() => import('./WrappedVideo'));

function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function WrappedShare({ data, favorite, preparedStory, onDetails }: { data: WrappedShareCardData; favorite?: WrappedTopContent; preparedStory?: Blob; onDetails: () => void }) {
    const { t } = useTranslation();
    const reduced = useReducedMotion();
    const [format, setFormat] = useState<WrappedShareFormat>('story');
    const [film, setFilm] = useState(false);
    const [retry, setRetry] = useState(0);
    const [preview, setPreview] = useState<{ format: WrappedShareFormat; url: string; blob: Blob } | null>(null);
    const [failed, setFailed] = useState(false);
    const cache = useMemo(() => ({ data, blobs: new Map<WrappedShareFormat, Promise<Blob>>() }), [data]);
    const ready = preview?.format === format ? preview : null;
    const filename = `movix-wrapped-${data.year}-${format}.png`;
    const text = [t('wrapped.shareTitle', { year: data.year }), data.watchTime, data.items[0]?.title, data.persona, `https://${data.domain}/wrapped/${data.year}`].filter(Boolean).join('\n');

    useEffect(() => {
        if (preparedStory) cache.blobs.set('story', Promise.resolve(preparedStory));
    }, [cache, preparedStory]);

    useEffect(() => {
        let cancelled = false;
        let url: string | null = null;
        setPreview(null);
        setFailed(false);
        let promise = cache.blobs.get(format);
        if (!promise) {
            promise = generateWrappedShareCard(cache.data, format);
            cache.blobs.set(format, promise);
        }
        promise.then(blob => {
            if (cancelled) return;
            url = URL.createObjectURL(blob);
            setPreview({ format, url, blob });
        }).catch(() => {
            cache.blobs.delete(format);
            if (!cancelled) setFailed(true);
        });
        return () => {
            cancelled = true;
            if (url) URL.revokeObjectURL(url);
        };
    }, [cache, data, format, retry]);

    const share = async () => {
        if (!ready) return;
        const file = new File([ready.blob], filename, { type: 'image/png' });
        try {
            if (navigator.canShare?.({ files: [file] }) && navigator.share) {
                await navigator.share({ title: t('wrapped.shareTitle', { year: data.year }), text, files: [file] });
            } else {
                download(ready.blob, filename);
                toast.success(t('wrapped.imageShareFallback'));
            }
        } catch (error) {
            if (!(error instanceof DOMException && error.name === 'AbortError')) toast.error(t('wrapped.shareError'));
        }
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(t('wrapped.textCopied'));
        } catch { toast.error(t('wrapped.shareError')); }
    };

    if (film) return <section className="mx-auto w-full max-w-[1050px] space-y-4" data-wrapped-interactive>
        <button type="button" onClick={() => setFilm(false)} className="inline-flex min-h-11 items-center gap-2 text-sm underline underline-offset-4"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t('wrappedMotion.backImages')}</button>
        <Suspense fallback={<p role="status">{t('common.loading')}</p>}><WrappedVideo data={data} /></Suspense>
    </section>;

    const posterPosition = format === 'story' ? { left: '6.667%', top: '14.375%', width: '51.111%', height: '43.125%' }
        : format === 'poster' ? { left: '30%', top: '16.296%', width: '40%', height: '40%' }
            : { left: '6.667%', top: '15.313%', width: '12.222%', height: '10.313%' };
    const left = parseFloat(posterPosition.left), top = parseFloat(posterPosition.top);
    const right = left + parseFloat(posterPosition.width), bottom = top + parseFloat(posterPosition.height);
    // La photo peinte dans le PNG s'efface sous l'affiche volante, aussi au retour.
    const posterCutout = `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${left}% ${top}%, ${left}% ${bottom}%, ${right}% ${bottom}%, ${right}% ${top}%, ${left}% ${top}%)`;

    return (
        <section className="mx-auto grid w-full max-w-[1160px] items-center gap-3 md:grid-cols-[0.95fr_1.05fr] md:gap-x-12 md:gap-y-5" aria-labelledby="wrapped-share-title">
            <header className="space-y-2 md:col-start-1 md:row-start-1 lg:space-y-4">
                <p className="hidden text-xs font-semibold uppercase tracking-[0.14em] text-[var(--wrapped-accent)] lg:block">{t('wrappedCinema.closingKicker')}</p>
                <h2 id="wrapped-share-title" className="wrapped-heading font-['Archivo_Black'] text-3xl leading-[1.06] tracking-[-0.035em]">{t('wrappedFinish.closingTitle')}</h2>
                <p className="hidden max-w-md text-sm leading-relaxed text-white/60 lg:block">{t('wrappedFinish.shareCaption')}</p>
            </header>
            <div className="flex items-center justify-center py-1 md:col-start-2 md:row-span-3 md:row-start-1" aria-busy={!ready && !failed}>
                <div data-wrapped-card className="group" style={{ '--wrapped-poster-cutout': posterCutout } as CSSProperties}>
                <div className={`wrapped-share-preview relative max-w-full ${format === 'poster' ? 'aspect-[2/3]' : 'aspect-[9/16]'}`} data-format={format}>
                <WrappedTilt surfaceClassName="absolute inset-0" className="h-full w-full">
                {ready ? <motion.img {...WRAPPED_FRAME_ANIMATION} data-wrapped-card-preview key={ready.url} src={ready.url} alt={t('wrappedStory.previewAlt', { year: data.year })} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 0.16, ease: [...WRAPPED_EASE_MORPH] }} className="h-full w-full rounded-lg object-contain shadow-[0_20px_44px_rgba(0,0,0,0.4)] group-data-[wrapped-flight=true]:[clip-path:var(--wrapped-poster-cutout)]" /> : failed ? (
                    <div className="space-y-3 p-5" role="alert">
                        <p>{t('wrapped.shareError')}</p>
                        <button type="button" onClick={() => setRetry(value => value + 1)} className="min-h-11 underline underline-offset-4">{t('wrappedStory.retry')}</button>
                    </div>
                ) : <p className="flex h-full items-center justify-center gap-2 p-5 text-sm text-white/80" role="status"><Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" />{t('wrapped.generatingImage')}</p>}
                {favorite && format !== 'ticket' && <WrappedPoster key={format} item={favorite} className="pointer-events-none absolute" style={posterPosition} settle={Boolean(ready) || failed} />}
                </WrappedTilt>
                </div>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2 md:col-start-1 md:row-start-2">
                <button type="button" onClick={share} disabled={!ready} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--wrapped-accent)] px-3 text-sm font-bold text-[#17121f] hover:bg-white disabled:opacity-40"><Share2 className="h-4 w-4 shrink-0" aria-hidden="true" />{t('wrappedStory.share')}</button>
                <button type="button" onClick={() => ready && download(ready.blob, filename)} disabled={!ready} className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/20 px-3 text-sm font-semibold hover:bg-white/10 disabled:opacity-40"><Download className="h-4 w-4 shrink-0" aria-hidden="true" />{t('wrappedStory.download')}</button>
            </div>
            <details className="group/options md:col-start-1 md:row-start-3" data-wrapped-interactive>
                <summary className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded text-sm text-white/80 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white md:justify-start">{t('wrappedFinish.shareOptions')}<ChevronDown className="h-4 w-4 group-open/options:rotate-180" aria-hidden="true" /></summary>
                <div className="space-y-3 pt-3">
                    <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={t('wrapped.shareFormatsTitle')}>
                        {(['story', 'top-five', 'poster', 'ticket'] as const).map(value => <button key={value} type="button" aria-pressed={format === value} onClick={() => setFormat(value)} className={`min-h-12 rounded-lg px-1 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${format === value ? 'bg-[var(--wrapped-accent)] text-[#17121f]' : 'bg-white/10 text-white/80 hover:bg-white/15'}`}>
                            {t(`wrappedStory.formats.${value}`)}<span className="mt-1 block text-[10px] font-normal">{value === 'poster' ? '2:3' : '9:16'}</span>
                        </button>)}
                    </div>
                    <button type="button" onClick={() => setFilm(true)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-white/25 text-sm font-semibold hover:bg-white/10"><Film className="h-4 w-4" aria-hidden="true" />{t('wrappedMotion.film')}</button>
                    <div className="flex flex-wrap gap-x-5"><button type="button" onClick={copy} className="flex min-h-11 items-center gap-2 text-sm text-white/80 underline underline-offset-4"><Copy className="h-4 w-4" aria-hidden="true" />{t('wrapped.copyText')}</button>
                    <button type="button" onClick={onDetails} className="min-h-11 text-sm text-white underline underline-offset-4">{t('wrappedStory.seeDetails')}</button></div>
                </div>
            </details>
        </section>
    );
}
