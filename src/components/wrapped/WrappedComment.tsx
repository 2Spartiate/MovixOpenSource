import { useLayoutEffect, useRef, useState } from 'react';
import { Heart, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { WrappedCommentHighlight } from '@/types/wrappedStory';
import { wrappedImageUrl } from '@/utils/wrappedPresentation';
import WrappedImage from './WrappedImage';
import WrappedReveal from './WrappedReveal';

export default function WrappedComment({ highlight, onExplore }: { highlight: WrappedCommentHighlight; onExplore?: (active: boolean) => void }) {
    const { t, i18n } = useTranslation();
    const [revealedFor, setRevealedFor] = useState<WrappedCommentHighlight | null>(null);
    const [expandedFor, setExpandedFor] = useState<WrappedCommentHighlight | null>(null);
    const revealed = revealedFor === highlight;
    const expanded = expandedFor === highlight;
    const [canExpand, setCanExpand] = useState(false);
    const quote = useRef<HTMLQuoteElement>(null);
    const hidden = highlight.isSpoiler && !revealed;
    const date = new Date(highlight.createdAt);
    useLayoutEffect(() => {
        const element = quote.current;
        if (!element) return;
        let active = true;
        const measure = () => setCanExpand(expanded || element.scrollHeight > element.clientHeight + 1);
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        measure();
        void document.fonts.ready.then(() => { if (active) measure(); });
        return () => { active = false; observer.disconnect(); };
    }, [highlight.content, hidden, expanded]);
    return <section className="mx-auto w-full max-w-[1000px] space-y-6">
        <h2 className="max-w-2xl font-['Archivo_Black'] text-3xl leading-tight tracking-tight lg:text-5xl">{t(highlight.reason === 'replies' ? 'wrappedMotion.commentDiscussed' : 'wrappedMotion.commentLoved')}</h2>
        <WrappedReveal delay={0.22} distance={36} className="overflow-hidden rounded-xl bg-[#e7f0ff] text-[#101c30]">
            <div className="flex items-center gap-4 border-b border-[#22172d]/15 p-5 sm:px-8"><WrappedImage src={wrappedImageUrl(highlight.poster_path)} alt="" className="aspect-[2/3] w-10 shrink-0" /><div className="min-w-0"><p className="font-semibold">{highlight.title}</p>{Number.isFinite(date.getTime()) && <p className="mt-1 text-xs">{new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)}</p>}</div></div>
            <div className="p-5 sm:p-8" data-wrapped-interactive>
                {hidden ? <button type="button" onClick={() => { setRevealedFor(highlight); onExplore?.(true); }} className="flex min-h-36 w-full items-center justify-center rounded-lg border border-dashed border-[#22172d]/40 px-5 py-8 text-sm font-semibold">{t('wrappedMotion.revealSpoiler')}</button> : <>
                    <blockquote ref={quote} className={`whitespace-pre-wrap break-words text-xl font-semibold leading-relaxed sm:text-2xl ${expanded ? '' : 'line-clamp-5'}`}>{highlight.content}</blockquote>
                    {canExpand && <button type="button" aria-expanded={expanded} onClick={() => { setExpandedFor(value => value === highlight ? null : highlight); onExplore?.(true); }} className="mt-3 min-h-11 text-sm underline underline-offset-4">{t(expanded ? 'wrappedMotion.less' : 'wrappedMotion.readComment')}</button>}
                </>}
                <div className="mt-6 flex flex-wrap gap-5 text-sm font-semibold">
                    {highlight.reactions > 0 && <span className="flex items-center gap-2"><Heart className="h-4 w-4" aria-hidden="true" />{t('wrappedMotion.receivedReactions', { count: highlight.reactions })}</span>}
                    {highlight.replies > 0 && <span className="flex items-center gap-2"><MessageCircle className="h-4 w-4" aria-hidden="true" />{t('wrappedMotion.receivedReplies', { count: highlight.replies })}</span>}
                </div>
            </div>
        </WrappedReveal>
        <p className="text-xs leading-relaxed text-white/65">{t('wrappedMotion.commentMethod')}</p>
    </section>;
}
