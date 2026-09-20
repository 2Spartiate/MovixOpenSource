import type { WrappedShareCardData } from '../types/wrapped.ts';
import { drawCanvasImage } from './wrappedCanvasLayout.ts';

export const FILM = { width: 720, height: 1280, ink: '#101318', paper: '#f5f7fa', blue: '#176bff', cyan: '#a9dfff', rule: '#d6dce4', muted: '#657080' };
export const filmClamp = (value: number) => Math.max(0, Math.min(1, value));
export const filmEase = (value: number) => 1 - Math.pow(1 - filmClamp(value), 4);
export const filmMix = (a: number, b: number, progress: number) => a + (b - a) * progress;

type TextOptions = { size?: number; minSize?: number; weight?: number; color?: string; lines?: number; align?: CanvasTextAlign; leading?: number; alpha?: number; balance?: boolean; reveal?: number };

/** Bounded typography for every shot, including long titles and missing posters. */
export function filmText(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, options: TextOptions = {}) {
    const { size = 32, minSize = 22, weight = 400, color = FILM.ink, lines = 1, align = 'left', leading = 1.06, alpha = 1, balance = false, reveal = 1 } = options;
    const normalized = String(value).trim();
    let chosen = size;
    let rows: string[] = [];
    const layout = (fontSize: number) => {
        ctx.font = `${weight} ${fontSize}px Inter, Arial, sans-serif`;
        const output: string[] = [];
        for (const paragraph of normalized.split('\n')) {
            let line = '';
            for (const word of paragraph.split(/\s+/)) {
                if (ctx.measureText([line, word].filter(Boolean).join(' ')).width <= width) { line = [line, word].filter(Boolean).join(' '); continue; }
                if (line) { output.push(line); line = ''; }
                // Réduire d'abord la taille pour garder les mots entiers. Le découpage
                // par caractère est réservé aux identifiants sans espace à la taille minimum.
                if (fontSize > Math.min(size, minSize)) { line = word; continue; }
                for (const glyph of Array.from(word)) {
                    if (line && ctx.measureText(line + glyph).width > width) { output.push(line); line = ''; }
                    line += glyph;
                }
            }
            output.push(line);
        }
        return output;
    };
    const maxLines = balance && normalized.length <= 22 && !normalized.includes('\n') ? 1 : lines;
    const minimum = Math.min(size, minSize);
    while (chosen >= minimum) {
        rows = layout(chosen);
        if ((rows.length <= maxLines && rows.every(row => ctx.measureText(row).width <= width)) || chosen === minimum) break;
        chosen = Math.max(minimum, chosen - 2);
    }
    rows = rows.slice(0, maxLines);
    if (layout(chosen).length > maxLines && rows.length) {
        let last = rows[rows.length - 1];
        while (last && ctx.measureText(last + '…').width > width) last = Array.from(last).slice(0, -1).join('');
        rows[rows.length - 1] = last + '…';
    }
    ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    ctx.font = `${weight} ${chosen}px Inter, Arial, sans-serif`;
    rows.forEach((row, index) => {
        const progress = filmEase((reveal - index * 0.14) / Math.max(0.3, 1 - (rows.length - 1) * 0.14));
        const top = y + index * chosen * leading;
        ctx.save();
        if (progress < 1) {
            const left = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
            ctx.beginPath(); ctx.rect(left - 2, top - 3, width + 4, chosen * leading + 6); ctx.clip();
        }
        ctx.fillText(row, x, top + chosen * 0.82 + (1 - progress) * chosen * 1.1);
        ctx.restore();
    });
    ctx.restore();
    return { height: rows.length * chosen * leading, size: chosen, rows };
}

export function filmLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color = FILM.rule, alpha = 1) {
    ctx.save(); ctx.strokeStyle = color; ctx.globalAlpha *= alpha; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
}

export function filmGlow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha = 0.16) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `rgba(35,139,255,${alpha})`); glow.addColorStop(1, 'rgba(35,139,255,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, FILM.width, FILM.height);
}

export function filmCorners(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color = FILM.blue, alpha = 1) {
    const length = Math.min(30, width * 0.12);
    ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = color; ctx.lineWidth = 2;
    for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + width, y, -1, 1], [x, y + height, 1, -1], [x + width, y + height, -1, -1]]) {
        ctx.beginPath(); ctx.moveTo(cx, cy + dy * length); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * length, cy); ctx.stroke();
    }
    ctx.restore();
}

export function filmPoster(ctx: CanvasRenderingContext2D, item: WrappedShareCardData['items'][number], image: HTMLImageElement | null | undefined, x: number, y: number, width: number, rotation = 0, alpha = 1, shadow = true) {
    const height = width * 1.5;
    ctx.save(); ctx.translate(x + width / 2, y + height / 2); ctx.rotate(rotation * Math.PI / 180); ctx.globalAlpha *= alpha;
    if (shadow) { ctx.shadowColor = 'rgba(8,19,39,0.2)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 16; }
    ctx.fillStyle = image ? '#e3e8ee' : FILM.blue; ctx.fillRect(-width / 2, -height / 2, width, height);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    if (image) drawCanvasImage(ctx, image, -width / 2, -height / 2, width, height);
    else {
        filmText(ctx, 'MOVIX', -width / 2 + 18, -height / 2 + 24, width - 36, { size: Math.max(14, width * 0.06), weight: 800, color: '#ffffff' });
        const words = item.title.trim().split(/\s+/);
        const title = words.length > 4 ? words.slice(0, 4).join(' ') + '…' : item.title;
        filmText(ctx, title, -width / 2 + 18, -height * 0.12, width - 36, { size: Math.max(14, width * 0.1), minSize: Math.max(10, width * 0.045), weight: 600, color: '#ffffff', lines: 4 });
        filmLine(ctx, -width / 2 + 18, height / 2 - 34, width / 2 - 18, height / 2 - 34, '#ffffff', 0.5);
    }
    ctx.restore();
}

export function filmBrand(ctx: CanvasRenderingContext2D, year: number, dark: boolean, alpha = 1) {
    const color = dark ? FILM.paper : FILM.ink;
    filmText(ctx, 'MOVIX', 44, 48, 220, { size: 28, weight: 800, color, alpha });
    filmText(ctx, `WRAPPED ${year}`, 676, 54, 300, { size: 18, weight: 600, color, align: 'right', alpha });
}
