import type { WrappedShareCardData, WrappedShareFormat } from '@/types/wrapped';
import { ensureShareFonts, loadCanvasImage } from '@/utils/wrappedCanvas';
import { drawCanvasImage, drawFittedText, drawRoundedRectPath } from '@/utils/wrappedCanvasLayout';

const PAPER = '#f4efe6';
const INK = '#17121f';
const LILAC = '#d8c4ff';

function poster(ctx: CanvasRenderingContext2D, image: HTMLImageElement | null, x: number, y: number, w: number, h: number, fallback: string) {
    ctx.save();
    drawRoundedRectPath(ctx, x, y, w, h, 16);
    ctx.fillStyle = '#282131';
    ctx.fill();
    ctx.clip();
    if (image) drawCanvasImage(ctx, image, x, y, w, h);
    else {
        ctx.fillStyle = PAPER;
        drawFittedText(ctx, fallback, x + 24, y + h / 2, w - 48, 38, 3);
    }
    ctx.restore();
}

function brand(ctx: CanvasRenderingContext2D, data: WrappedShareCardData, x = 72, y = 104, color = PAPER) {
    ctx.fillStyle = color;
    drawFittedText(ctx, 'MOVIX', x, y, 300, 46, 1, true);
    ctx.textAlign = 'right';
    drawFittedText(ctx, `WRAPPED ${data.year}`, 1008, y, 530, 38, 1);
    ctx.textAlign = 'left';
}

function stats(ctx: CanvasRenderingContext2D, data: WrappedShareCardData, y: number, color = PAPER, secondary = LILAC) {
    ctx.fillStyle = secondary;
    drawFittedText(ctx, data.labels.watchTime, 72, y, 560, 38, 1);
    drawFittedText(ctx, data.labels.titles, 684, y, 324, 38, 1);
    ctx.fillStyle = color;
    drawFittedText(ctx, data.watchTime, 72, y + 90, 560, 68, 1, true);
    drawFittedText(ctx, data.titleCount, 684, y + 90, 324, 68, 1, true);
}

function footer(ctx: CanvasRenderingContext2D, data: WrappedShareCardData, height: number, color = PAPER) {
    ctx.fillStyle = color;
    drawFittedText(ctx, data.domain, 72, height - 72, 936, 38, 1);
}

function traits(ctx: CanvasRenderingContext2D, data: WrappedShareCardData, y: number, color = LILAC) {
    if (!data.traits?.length) return;
    ctx.fillStyle = color;
    drawFittedText(ctx, data.traits.map(trait => trait.label).join(' · '), 72, y, 936, 26, 1, false, 400);
}

function signature(ctx: CanvasRenderingContext2D, values: number[], x: number, y: number, width: number, height: number, futureFrom: number | null) {
    ctx.save();
    const max = Math.max(1, ...values);
    const step = width / 12;
    values.forEach((value, i) => {
        if (futureFrom && i + 1 >= futureFrom && value === 0) {
            ctx.globalAlpha = 0.35;
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = 2;
            drawRoundedRectPath(ctx, x + i * step, y + height - 12, step * 0.64, 12, 3);
            ctx.stroke();
            return;
        }
        const barHeight = Math.max(2, value / max * height);
        ctx.globalAlpha = value > 0 ? 0.85 : 0.2;
        drawRoundedRectPath(ctx, x + i * step, y + height - barHeight, step * 0.64, barHeight, 3);
        ctx.fill();
    });
    ctx.restore();
}

export async function generateWrappedShareCard(data: WrappedShareCardData, format: WrappedShareFormat): Promise<Blob> {
    await ensureShareFonts();
    const width = 1080, height = format === 'poster' ? 1620 : 1920;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    const count = format === 'ticket' ? 0 : format === 'top-five' ? 5 : format === 'story' ? 3 : 1;
    const [images, backdrop] = await Promise.all([
        Promise.all(data.items.slice(0, count).map(item => item.posterUrl ? loadCanvasImage(item.posterUrl) : null)),
        format === 'story' && data.backdropUrl ? loadCanvasImage(data.backdropUrl) : Promise.resolve(null),
    ]);
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, width, height);

    if (format === 'ticket') {
        ctx.fillStyle = PAPER;
        drawRoundedRectPath(ctx, 36, 36, 1008, 1848, 20);
        ctx.fill();
        brand(ctx, data, 72, 128, INK);
        ctx.fillStyle = INK;
        drawFittedText(ctx, data.labels.ticket, 72, 278, 936, 66, 2, true);
        drawFittedText(ctx, String(data.year), 72, 500, 936, 160, 1, true);
        ctx.strokeStyle = '#b3a7bc';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);
        ctx.beginPath(); ctx.moveTo(72, 568); ctx.lineTo(1008, 568); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#55465f';
        drawFittedText(ctx, data.labels.favorite, 72, 658, 936, 38, 1);
        ctx.fillStyle = INK;
        drawFittedText(ctx, data.items[0]?.title || '—', 72, 764, 936, 72, 3, true);
        stats(ctx, data, 1160, INK, '#55465f');
        ctx.fillStyle = '#55465f';
        drawFittedText(ctx, data.labels.persona, 72, 1420, 936, 38, 1);
        ctx.fillStyle = INK;
        drawFittedText(ctx, data.persona, 72, 1512, 936, 62, 2, true);
        traits(ctx, data, 1700, '#55465f');
        footer(ctx, data, height, INK);
    } else if (format === 'top-five') {
        brand(ctx, data);
        ctx.fillStyle = LILAC;
        drawFittedText(ctx, data.labels.topFive, 72, 222, 936, 70, 1, true);
        data.items.slice(0, 5).forEach((item, index) => {
            const y = 294 + index * 244;
            poster(ctx, images[index], 72, y, 132, 198, String(index + 1));
            ctx.fillStyle = LILAC;
            drawFittedText(ctx, String(index + 1).padStart(2, '0'), 242, y + 50, 90, 38, 1);
            ctx.fillStyle = PAPER;
            drawFittedText(ctx, item.title, 346, y + 50, 662, 50, 2);
            ctx.fillStyle = LILAC;
            drawFittedText(ctx, item.duration, 346, y + 174, 662, 38, 1);
        });
        stats(ctx, data, 1614);
        traits(ctx, data, 1794);
        footer(ctx, data, height);
    } else if (format === 'story') {
        // La carte réunit le casting de l'année ; l'aperçu utilise ce même PNG.
        ctx.fillStyle = '#171713';
        ctx.fillRect(0, 0, width, height);
        if (backdrop) {
            ctx.save();
            ctx.globalAlpha = 0.28;
            drawCanvasImage(ctx, backdrop, 0, 0, width, 1340, 'cover');
            ctx.restore();
            const veil = ctx.createLinearGradient(0, 0, 0, 1400);
            veil.addColorStop(0, 'rgba(23,23,19,0.32)');
            veil.addColorStop(1, '#171713');
            ctx.fillStyle = veil;
            ctx.fillRect(0, 0, width, 1400);
        }
        brand(ctx, data);
        const gold = '#f4cc83';
        ctx.fillStyle = gold;
        drawFittedText(ctx, data.labels.heading, 72, 196, 936, 56, 1, true);
        if (data.items.length) poster(ctx, images[0], 72, 276, 552, 828, data.items[0].title);
        data.items.slice(1, 3).forEach((item, index) => {
            const y = 276 + index * 496;
            poster(ctx, images[index + 1], 710, y, 240, 360, item.title);
            ctx.fillStyle = gold;
            drawFittedText(ctx, `0${index + 2}`, 656, y + 34, 45, 28, 1, true);
            ctx.fillStyle = PAPER;
            drawFittedText(ctx, item.title, 710, y + 410, 298, 34, 2, true);
        });
        if (data.items.length) {
            ctx.fillStyle = gold;
            drawFittedText(ctx, data.labels.favorite, 72, 1160, 552, 32, 1);
            ctx.fillStyle = PAPER;
            drawFittedText(ctx, data.items[0].title, 72, 1232, 552, 62, 2, true);
            stats(ctx, data, 1370, PAPER, gold);
            ctx.fillStyle = PAPER;
            drawFittedText(ctx, data.persona, 72, 1570, 936, 56, 1, true);
        } else {
            ctx.fillStyle = gold;
            drawFittedText(ctx, data.labels.persona, 72, 440, 936, 38, 1);
            ctx.fillStyle = PAPER;
            drawFittedText(ctx, data.persona, 72, 580, 936, 128, 4, true);
            stats(ctx, data, 1190, PAPER, gold);
        }
        ctx.fillStyle = gold;
        if (data.signature.some(value => value > 0)) {
            signature(ctx, data.signature, 72, 1660, 936, 76, data.signatureFutureFrom);
        }
        drawFittedText(ctx, data.period || data.signatureCaption, 72, 1780, 936, 30, 1, false, 400);
        footer(ctx, data, height);
    } else {
        const compact = format === 'poster';
        brand(ctx, data);
        ctx.fillStyle = LILAC;
        drawFittedText(ctx, data.labels.favorite, 72, 206, 936, 38, 1);
        if (images[0]) {
            const w = compact ? 432 : 504, h = w * 1.5;
            poster(ctx, images[0], (width - w) / 2, 264, w, h, data.labels.imageUnavailable);
            ctx.fillStyle = PAPER;
            drawFittedText(ctx, data.items[0]?.title || data.labels.heading, 72, compact ? 1000 : 1120, 936, 74, 2, true);
        } else {
            // Une composition typographique reste partageable même sans affiche disponible.
            ctx.fillStyle = LILAC;
            drawFittedText(ctx, data.labels.heading, 72, 370, 936, 60, 2, true);
            ctx.fillStyle = PAPER;
            drawFittedText(ctx, data.items[0]?.title || data.persona, 72, compact ? 590 : 680, 936, 100, compact ? 4 : 5, true);
        }
        stats(ctx, data, compact ? 1224 : 1390);
        ctx.fillStyle = LILAC;
        drawFittedText(ctx, data.persona, 72, compact ? 1444 : 1640, 936, 50, compact ? 1 : 2);
        traits(ctx, data, compact ? 1494 : 1780);
        footer(ctx, data, height);
    }

    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas export failed')), 'image/png'));
}
