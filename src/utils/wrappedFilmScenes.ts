/**
 * THESIS: a personal title sequence connected by camera moves and real posters.
 * OWN-WORLD: porcelain, ink and electric blue; flat photographs, large clean type and precise frames.
 * STORY: opening, scale of the year, leading title, portrait, complete keepsake.
 * FIRST VIEWPORT: visible wordmark and headline above a floating contact sheet.
 * FORM: five connected shots in one canvas; excluded facts never enter the film.
 */
import type { WrappedShareCardData } from '../types/wrapped.ts';
import { getWrappedVideoBeatAt, WRAPPED_VIDEO_BEAT_SECONDS as BEAT, type WrappedVideoBeat, type WrappedVideoOptions, type WrappedVideoScene } from './wrappedVideoTimeline.ts';
import { FILM, filmBrand, filmClamp, filmCorners, filmEase, filmGlow, filmLine, filmMix, filmPoster, filmText } from './wrappedFilmDrawing.ts';

export const WRAPPED_VIDEO_SIZE = { width: FILM.width, height: FILM.height };
export type WrappedVideoTexts = { intro: string; time: string; titles: string; favorite: string; portrait: string; final: string; missingPoster: string };
export type WrappedVideoImages = Map<string, HTMLImageElement | null>;
const W = FILM.width, H = FILM.height;
const imageFor = (images: WrappedVideoImages, item: WrappedShareCardData['items'][number]) => item.posterUrl ? images.get(item.posterUrl) : null;

function background(ctx: CanvasRenderingContext2D, dark = false) {
    ctx.fillStyle = dark ? FILM.ink : FILM.paper; ctx.fillRect(0, 0, W, H);
}

function intro(ctx: CanvasRenderingContext2D, data: WrappedShareCardData, options: WrappedVideoOptions, texts: WrappedVideoTexts, images: WrappedVideoImages, time: number, omitFeatured = false) {
    background(ctx); filmGlow(ctx, 560, 920, 630, 0.21);
    const settle = filmEase(time / 0.85), drift = filmClamp(time / 3);
    filmLine(ctx, 44, 160, 676, 160);
    filmText(ctx, texts.intro, 44, 208 - 12 * settle, 632, { size: 90, lines: 2, balance: true });
    filmText(ctx, String(data.year), 37, 1000, 650, { size: 188, color: FILM.blue });
    if (options.favorite && data.items.length) {
        const items = data.items.slice(0, 3);
        const poses = items.length === 1 ? [{ x: 198, y: 520, w: 324, r: -2 }] : [{ x: 211, y: 510, w: 278, r: -3 }, { x: 441, y: 593, w: 226, r: 8 }, { x: 13, y: 632, w: 218, r: -9 }];
        [2, 1, 0].filter(index => index < items.length).forEach(index => {
            if (index === 0 && omitFeatured) return;
            const pose = poses[index];
            const entrance = filmEase((time + 0.12 - index * 0.055) / 0.85);
            filmPoster(ctx, items[index], imageFor(images, items[index]), pose.x + (1 - entrance) * (index === 1 ? 130 : -90), pose.y + (1 - entrance) * 140 - drift * (index === 0 ? 24 : -8), pose.w, pose.r * filmMix(1.6, 1, settle));
        });
    } else {
        filmText(ctx, 'MOVIX', 44, 588, 632, { size: 142, weight: 800 });
        filmCorners(ctx, 44, 531, 632, 305, FILM.blue, 0.7);
    }
}

function statistics(ctx: CanvasRenderingContext2D, data: WrappedShareCardData, options: WrappedVideoOptions, texts: WrappedVideoTexts, time: number) {
    background(ctx); filmGlow(ctx, 690, 850, 650, 0.17);
    const reveal = filmEase(time / 0.68);
    filmText(ctx, options.watchTime ? texts.time : texts.titles, 44, 234, 632, { size: 27, weight: 600, color: FILM.muted });
    const parts = options.watchTime && data.watchTimeParts.length ? data.watchTimeParts : [options.watchTime ? data.watchTime : data.titleCount];
    ctx.save(); ctx.beginPath(); ctx.rect(38, 318, 650, 335); ctx.clip();
    filmText(ctx, parts[0], 38, 350, 650, { size: 154, weight: 600, color: FILM.blue, reveal: time / (BEAT * 2) });
    if (parts[1]) filmText(ctx, parts[1], 48, 540, 570, { size: 66, reveal: (time - BEAT) / BEAT });
    ctx.restore();
    const chart = data.signature.map(value => Number.isFinite(value) && value >= 0 ? value : 0);
    if (options.watchTime && chart.some(value => value > 0)) {
        const maximum = Math.max(1, ...chart), barWidth = 632 / Math.max(12, chart.length);
        chart.slice(0, 12).forEach((value, index) => {
            const rise = filmEase((time - BEAT - index * 0.065) / (BEAT * 1.5));
            const height = value / maximum * 148 * rise;
            if (data.signatureFutureFrom && index + 1 >= data.signatureFutureFrom && value === 0) {
                ctx.strokeStyle = '#aebed4'; ctx.lineWidth = 1;
                ctx.strokeRect(44 + index * barWidth, 856, barWidth * 0.65, 10);
                return;
            }
            ctx.fillStyle = index === chart.indexOf(maximum) ? FILM.blue : '#c8d9f3';
            ctx.fillRect(44 + index * barWidth, 866 - height, barWidth * 0.65, Math.max(2, height));
        });
        filmLine(ctx, 44, 884, 676, 884);
        filmText(ctx, data.signatureCaption, 44, 900, 632, { size: 18, color: FILM.muted, lines: 2 });
    } else filmLine(ctx, 44, 824, filmMix(44, 676, reveal), 824, FILM.blue);
    if (options.watchTime && options.titleCount) {
        const arrival = filmClamp((time - BEAT * 4) / (BEAT * 1.5));
        filmText(ctx, data.titleCount, 44, 960, 260, { size: 104, weight: 600, reveal: arrival });
        filmText(ctx, texts.titles, 333, 996, 343, { size: 30, lines: 2, reveal: arrival });
    }
}

function favorite(ctx: CanvasRenderingContext2D, data: WrappedShareCardData, options: WrappedVideoOptions, texts: WrappedVideoTexts, images: WrappedVideoImages, time: number, omitFeatured = false) {
    background(ctx, true);
    const item = data.items[0]; if (!item) return;
    const reveal = filmEase(time / 0.8);
    filmGlow(ctx, 620, 660, 620, 0.22);
    filmText(ctx, '01', 26, 155, 668, { size: 344, color: '#24334a' });
    const width = filmMix(326, 384, reveal) + filmClamp(time / (BEAT * 6)) * 18, x = (W - width) / 2;
    const y = filmMix(256, 224, reveal) - Math.sin(filmClamp(time / 4) * Math.PI) * 5;
    if (!omitFeatured) {
        filmPoster(ctx, item, imageFor(images, item), x, y, width, filmMix(-4, 0, reveal), 1, false);
        filmCorners(ctx, x - 10, y - 10, width + 20, width * 1.5 + 20, FILM.cyan, 0.85);
    }
    filmText(ctx, texts.favorite, 44, 872, 632, { size: 23, weight: 600, color: FILM.cyan });
    filmText(ctx, item.title, 44, 917, 632, { size: 66, weight: 600, color: FILM.paper, lines: 3, balance: true, reveal: (time - BEAT / 2) / (BEAT * 1.5) });
    if (options.watchTime) filmText(ctx, item.duration, 44, 1151, 632, { size: 30, color: '#b6c2d2' });
}

function portrait(ctx: CanvasRenderingContext2D, data: WrappedShareCardData, options: WrappedVideoOptions, texts: WrappedVideoTexts, images: WrappedVideoImages, time: number, omitFeatured = false) {
    background(ctx); filmGlow(ctx, 120, 960, 710, 0.22);
    filmText(ctx, texts.portrait, 44, 226, 632, { size: 25, weight: 600, color: FILM.muted });
    filmLine(ctx, 44, 288, 676, 288);
    if (options.favorite && data.items[0] && !omitFeatured) filmPoster(ctx, data.items[0], imageFor(images, data.items[0]), 514, 148, 142, 6, 1, false);
    // Une identité typographique plein cadre, dont les deux traits prolongent les lignes.
    ctx.save(); ctx.beginPath(); ctx.rect(40, 356, 640, 420); ctx.clip();
    filmText(ctx, data.persona, 44, 414, 632, { size: 120, weight: 600, color: FILM.blue, lines: 3, reveal: time / (BEAT * 2) });
    ctx.restore();
    (data.traits || []).slice(0, 2).forEach((trait, index) => {
        const arrival = filmEase((time - BEAT * (index ? 3 : 1)) / BEAT), y = 830 + index * 143;
        filmLine(ctx, 44, y, filmMix(44, 676, arrival), y, '#a5bad7');
        filmText(ctx, `0${index + 1}`, 44, y + 28, 76, { size: 44, color: FILM.blue, alpha: arrival });
        filmText(ctx, trait.label, 152, y + 30 + (1 - arrival) * 20, 524, { size: 34, lines: 2, alpha: arrival });
    });
}

function finale(ctx: CanvasRenderingContext2D, data: WrappedShareCardData, options: WrappedVideoOptions, texts: WrappedVideoTexts, images: WrappedVideoImages, time: number, omitFeatured = false) {
    background(ctx);
    const reveal = filmEase(time / 0.45), item = options.favorite ? data.items[0] : undefined;
    filmText(ctx, String(data.year), 40, 126, 640, { size: 130, color: FILM.blue });
    filmText(ctx, texts.intro.replace(/\n/g, ' '), 44, 272, 632, { size: 25, color: FILM.muted });
    filmLine(ctx, 44, 323, 676, 323);
    if (item) {
        if (!omitFeatured) filmPoster(ctx, item, imageFor(images, item), 44, 359 + (1 - reveal) * 32, 218, 0, 1, false);
        filmText(ctx, texts.favorite, 298, 364, 378, { size: 19, weight: 600, color: FILM.muted });
        filmText(ctx, item.title, 298, 411, 378, { size: 55, weight: 600, lines: 3 });
        if (options.watchTime) filmText(ctx, item.duration, 298, 636, 378, { size: 27, color: FILM.blue });
    } else if (options.portrait) {
        filmText(ctx, texts.portrait, 44, 378, 632, { size: 22, color: FILM.muted });
        filmText(ctx, data.persona, 44, 429, 632, { size: 83, weight: 600, lines: 3, balance: true });
    } else if (options.watchTime || options.titleCount) {
        const value = options.watchTime ? (data.watchTimeParts.length ? data.watchTimeParts.join('\n') : data.watchTime) : data.titleCount;
        const title = filmText(ctx, value, 44, 414, 632, { size: 110, weight: 600, color: FILM.blue, lines: 2 });
        filmText(ctx, options.watchTime ? texts.time : texts.titles, 44, Math.max(622, 442 + title.height), 632, { size: 28, color: FILM.muted });
    }
    filmLine(ctx, 44, 736, 676, 736);
    const mainIsStat = !item && !options.portrait;
    const stats = [options.watchTime && !mainIsStat && { label: texts.time, value: data.watchTime }, options.titleCount && (!mainIsStat || options.watchTime) && { label: texts.titles, value: data.titleCount }].filter(Boolean) as { label: string; value: string }[];
    stats.forEach((stat, index) => {
        const width = stats.length === 2 ? 300 : 632, x = 44 + index * 332;
        filmText(ctx, stat.label, x, 770, width, { size: 19, color: FILM.muted });
        filmText(ctx, stat.value, x, 812, width, { size: 56, weight: 600 });
    });
    if (options.portrait) {
        filmLine(ctx, 44, 914, 676, 914);
        if (item) {
            filmText(ctx, texts.portrait, 44, 944, 632, { size: 18, color: FILM.muted });
            filmText(ctx, data.persona, 44, 982, 632, { size: 42, weight: 600, lines: 2, balance: true });
        }
        const traits = (data.traits || []).slice(0, 2).map(trait => trait.label).join(' · ');
        if (traits) filmText(ctx, traits, 44, item ? 1094 : 974, 632, { size: 23, lines: 2 });
    }
    filmLine(ctx, 44, 1184, 676, 1184);
    filmText(ctx, data.domain, 44, 1211, 500, { size: 21, weight: 600 });
}

function drawScene(ctx: CanvasRenderingContext2D, scene: WrappedVideoScene, data: WrappedShareCardData, options: WrappedVideoOptions, texts: WrappedVideoTexts, images: WrappedVideoImages, time: number, omitFeatured = false) {
    if (scene === 'intro') intro(ctx, data, options, texts, images, time, omitFeatured);
    else if (scene === 'watchTime' || scene === 'titleCount') statistics(ctx, data, options, texts, time);
    else if (scene === 'favorite') favorite(ctx, data, options, texts, images, time, omitFeatured);
    else if (scene === 'portrait') portrait(ctx, data, options, texts, images, time, omitFeatured);
    else finale(ctx, data, options, texts, images, time, omitFeatured);
}

function featuredPose(scene: WrappedVideoScene, time: number, count: number) {
    if (scene === 'favorite') {
        const p = filmEase(time / 0.8), w = filmMix(326, 384, p) + filmClamp(time / (BEAT * 6)) * 18;
        return { x: (W - w) / 2, y: filmMix(256, 224, p) - Math.sin(filmClamp(time / 4) * Math.PI) * 5, w, r: filmMix(-4, 0, p) };
    }
    if (scene === 'portrait') return { x: 514, y: 148, w: 142, r: 6 };
    if (scene === 'final') return { x: 44, y: 359 + (1 - filmEase(time / 0.45)) * 32, w: 218, r: 0 };
    if (scene === 'intro') return count === 1 ? { x: 198, y: 520 - filmClamp(time / 3) * 24, w: 324, r: -2 } : { x: 211, y: 510 - filmClamp(time / 3) * 24, w: 278, r: -3 };
    return null;
}

/** The outgoing and incoming shots overlap; the camera never exposes an empty frame. */
export function drawWrappedVideoFrame(ctx: CanvasRenderingContext2D, data: WrappedShareCardData, options: WrappedVideoOptions, texts: WrappedVideoTexts, images: WrappedVideoImages, time: number, timeline: WrappedVideoBeat[]) {
    const safe = Number.isFinite(time) ? Math.max(0, Math.min(18, time)) : 0;
    const beat = getWrappedVideoBeatAt(safe, timeline);
    const boundary = timeline.slice(1).find(next => safe >= next.start - 0.38 && safe < next.start + 0.38);
    background(ctx);
    let dark = beat.scene === 'favorite', brandAlpha = 1;
    if (boundary) {
        const index = timeline.indexOf(boundary), previous = timeline[index - 1];
        const raw = filmClamp((safe - boundary.start + 0.38) / 0.76), p = raw * raw * (3 - 2 * raw);
        const nextTime = Math.max(0, safe - boundary.start);
        const before = featuredPose(previous.scene, safe - previous.start, data.items.length);
        const after = featuredPose(boundary.scene, nextTime, data.items.length);
        if (options.favorite && data.items[0] && before && after) {
            // Une seule affiche est peinte pendant tout le raccord. Elle change de rôle,
            // du titre vedette au portrait puis à la carte, sans double exposition.
            ctx.save(); ctx.translate(0, -p * H);
            drawScene(ctx, previous.scene, data, options, texts, images, safe - previous.start, true); ctx.restore();
            ctx.save(); ctx.translate(0, (1 - p) * H);
            drawScene(ctx, boundary.scene, data, options, texts, images, nextTime, true); ctx.restore();
            filmPoster(ctx, data.items[0], imageFor(images, data.items[0]), filmMix(before.x, after.x, p), filmMix(before.y, after.y, p), filmMix(before.w, after.w, p), filmMix(before.r, after.r, p), 1, false);
        } else if (boundary.scene === 'favorite') {
            drawScene(ctx, previous.scene, data, options, texts, images, safe - previous.start);
            const width = (W + 4) * p, height = (H + 4) * p, centerY = filmMix(350, H / 2, p);
            ctx.save(); ctx.beginPath(); ctx.rect((W - width) / 2, centerY - height / 2, width, height); ctx.clip();
            drawScene(ctx, boundary.scene, data, options, texts, images, nextTime); ctx.restore();
            filmCorners(ctx, (W - width) / 2, centerY - height / 2, width, height, FILM.blue, Math.sin(raw * Math.PI));
        } else {
            const horizontal = boundary.scene === 'watchTime' || boundary.scene === 'titleCount';
            ctx.save(); ctx.translate(horizontal ? -p * W : 0, horizontal ? 0 : -p * H);
            drawScene(ctx, previous.scene, data, options, texts, images, safe - previous.start); ctx.restore();
            ctx.save(); ctx.translate(horizontal ? (1 - p) * W : 0, horizontal ? 0 : (1 - p) * H);
            drawScene(ctx, boundary.scene, data, options, texts, images, nextTime); ctx.restore();
        }
        dark = raw < 0.5 ? previous.scene === 'favorite' : boundary.scene === 'favorite';
        brandAlpha = 0;
    } else {
        drawScene(ctx, beat.scene, data, options, texts, images, safe - beat.start);
        const distance = Math.min(...timeline.slice(1).map(next => Math.abs(safe - next.start)));
        brandAlpha = filmClamp((distance - 0.38) / 0.12);
    }
    filmBrand(ctx, data.year, dark, brandAlpha);
}
