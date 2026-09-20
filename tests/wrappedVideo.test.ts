import assert from 'node:assert/strict';
import test from 'node:test';
import { drawWrappedVideoFrame } from '../src/utils/wrappedVideo.ts';
import { buildWrappedVideoTimeline, DEFAULT_WRAPPED_VIDEO_OPTIONS, getEffectiveWrappedVideoOptions, getWrappedVideoBeatAt, getWrappedVideoProgress, normalizeWrappedVideoOptions, WRAPPED_VIDEO_DURATION, WRAPPED_VIDEO_FINAL_MIN_DURATION, type WrappedVideoOptions } from '../src/utils/wrappedVideoTimeline.ts';

type CanvasTrace = { drawn: string[]; operations: Array<{ name: string; values: number[] }> };

function mockCanvas(): { ctx: CanvasRenderingContext2D; trace: CanvasTrace } {
    const trace: CanvasTrace = { drawn: [], operations: [] };
    const states: Array<{ globalAlpha: number }> = [];
    const record = (name: string) => (...values: number[]) => trace.operations.push({ name, values });
    const context = {
        fillStyle: '', strokeStyle: '', globalAlpha: 1, font: '', lineWidth: 1,
        textAlign: 'left', textBaseline: 'alphabetic', shadowColor: '', shadowBlur: 0, shadowOffsetY: 0,
        fillRect: record('fillRect'), strokeRect: record('strokeRect'), beginPath: record('beginPath'),
        rect: record('rect'), clip: record('clip'), moveTo: record('moveTo'), lineTo: record('lineTo'),
        stroke: record('stroke'), translate: record('translate'), rotate: record('rotate'),
        save() { states.push({ globalAlpha: this.globalAlpha }); trace.operations.push({ name: 'save', values: [] }); },
        restore() { const state = states.pop(); if (state) this.globalAlpha = state.globalAlpha; trace.operations.push({ name: 'restore', values: [] }); },
        fillText(value: string, x: number, y: number) { trace.drawn.push(value); trace.operations.push({ name: 'fillText', values: [x, y] }); },
        measureText(value: string) { return { width: Array.from(value).length * 7 }; },
        createRadialGradient(...values: number[]) {
            trace.operations.push({ name: 'createRadialGradient', values });
            return { addColorStop(offset: number) { trace.operations.push({ name: 'addColorStop', values: [offset] }); } };
        },
    };
    return { ctx: context as unknown as CanvasRenderingContext2D, trace };
}

const data = {
    year: 2026,
    domain: 'movix.test',
    watchTime: 'WATCH_TIME_FACT',
    watchTimeParts: ['WATCH_TIME_FACT'],
    titleCount: 'TITLE_COUNT_FACT',
    persona: 'PERSONA_FACT',
    traits: [
        { label: 'TRAIT_ONE', evidence: 'EVIDENCE_NEVER_DRAWN' },
        { label: 'TRAIT_TWO', evidence: 'SECOND_EVIDENCE_NEVER_DRAWN' },
    ],
    signature: [1, 4, 2, 6, 3, 7, 5, 8, 4, 9, 6, 10],
    signatureCaption: 'SIGNATURE_CAPTION',
    signatureFutureFrom: null,
    items: [{ title: 'FAVORITE_FACT', posterUrl: null, duration: 'FAVORITE_DURATION_FACT' }],
    labels: { heading: '', favorite: '', watchTime: '', titles: '', persona: '', topFive: '', ticket: '', imageUnavailable: '', signature: '' },
};

const texts = {
    intro: 'INTRO_LABEL', time: 'TIME_LABEL', titles: 'TITLE_LABEL', favorite: 'FAVORITE_LABEL',
    portrait: 'PORTRAIT_LABEL', final: 'FINAL_LABEL', missingPoster: 'MISSING_POSTER',
};

const WRAPPED_SCORE_BPM = 114;
const BEAT_SECONDS = 60 / WRAPPED_SCORE_BPM;
const closeToBeat = (time: number) => Math.abs(time / BEAT_SECONDS - Math.round(time / BEAT_SECONDS)) < 1e-8;

function optionCombinations(): WrappedVideoOptions[] {
    return Array.from({ length: 16 }, (_, mask) => ({
        watchTime: Boolean(mask & 1),
        titleCount: Boolean(mask & 2),
        favorite: Boolean(mask & 4),
        portrait: Boolean(mask & 8),
        sound: false,
    }));
}

test('le film garde exactement 18 secondes et cale ses plans sur la bande-son à 114 BPM', () => {
    const timeline = buildWrappedVideoTimeline(DEFAULT_WRAPPED_VIDEO_OPTIONS);
    assert.deepEqual(timeline.map(beat => beat.scene), ['intro', 'watchTime', 'favorite', 'portrait', 'final']);
    assert.deepEqual(timeline.map(beat => beat.start), [0, 6, 14, 20, 26].map(beat => beat * BEAT_SECONDS));
    assert.equal(timeline.at(-1)?.end, WRAPPED_VIDEO_DURATION);
    const final = timeline.at(-1)!;
    assert.equal(final.scene, 'final');
    assert.ok(final.end - final.start >= WRAPPED_VIDEO_FINAL_MIN_DURATION);
    assert.ok(timeline.every((beat, index) => index === 0 || beat.start === timeline[index - 1].end));
});

test('chaque frontière disponible reste un multiple entier du temps musical', () => {
    for (const options of optionCombinations()) {
        const timeline = buildWrappedVideoTimeline(options);
        const boundaries = timeline.length === 1 ? [] : timeline.slice(0, -1).map(beat => beat.end);
        assert.ok(boundaries.every(closeToBeat), { options, boundaries });
    }
});

test('les statistiques cochées sont groupées dans un même plan', () => {
    const both = buildWrappedVideoTimeline({ watchTime: true, titleCount: true, favorite: false, portrait: false, sound: false });
    assert.deepEqual(both.map(beat => beat.scene), ['intro', 'watchTime', 'final']);
    assert.equal(both[1].start, 6 * BEAT_SECONDS);
    assert.equal(both[1].end, 26 * BEAT_SECONDS);

    const titlesOnly = buildWrappedVideoTimeline({ watchTime: false, titleCount: true, favorite: false, portrait: false, sound: false });
    assert.deepEqual(titlesOnly.map(beat => beat.scene), ['intro', 'titleCount', 'final']);
});

test('les options exclues ne produisent aucune scène, y compris les affiches de l’intro', () => {
    const timeline = buildWrappedVideoTimeline({ watchTime: true, titleCount: false, favorite: false, portrait: false, sound: false });
    assert.deepEqual(timeline.map(beat => beat.scene), ['intro', 'watchTime', 'final']);
    assert.equal(timeline.at(-1)?.start, 26 * BEAT_SECONDS);
});

test('un seul choix remplit proprement le calendrier et les bords choisissent la bonne scène', () => {
    const timeline = buildWrappedVideoTimeline({ watchTime: false, titleCount: false, favorite: true, portrait: false, sound: false });
    const introEnd = timeline[0].end;
    assert.deepEqual(timeline.map(beat => beat.scene), ['intro', 'favorite', 'final']);
    assert.equal(getWrappedVideoBeatAt(0, timeline).scene, 'intro');
    assert.equal(getWrappedVideoBeatAt(introEnd - 0.001, timeline).scene, 'intro');
    assert.equal(getWrappedVideoBeatAt(introEnd, timeline).scene, 'favorite');
    assert.equal(getWrappedVideoBeatAt(18, timeline).scene, 'final');
    assert.equal(getWrappedVideoProgress(99, timeline.at(-1)!), 1);
});

test('sans sélection, le calendrier ne crée aucune scène d’information', () => {
    const timeline = buildWrappedVideoTimeline({ watchTime: false, titleCount: false, favorite: false, portrait: false, sound: false });
    assert.deepEqual(timeline, [{ scene: 'final', start: 0, end: 18 }]);
});

test('sans titre disponible, le numéro 1 et ses affiches sont exclus du film', () => {
    const options = getEffectiveWrappedVideoOptions(DEFAULT_WRAPPED_VIDEO_OPTIONS, 0);
    assert.equal(options.favorite, false);
    assert.ok(!buildWrappedVideoTimeline(options).some(beat => beat.scene === 'favorite'));
});

test('la disparition du seul numéro 1 rétablit un portrait lisible', () => {
    const options = normalizeWrappedVideoOptions({ watchTime: false, titleCount: false, favorite: true, portrait: false, sound: false }, 0);
    assert.equal(options.favorite, false);
    assert.equal(options.portrait, true);
});

test('aucun fait décoché ni preuve de trait ne traverse un plan ou un raccord', () => {
    for (const options of optionCombinations()) {
        const timeline = buildWrappedVideoTimeline(options);
        for (let frame = 0; frame <= WRAPPED_VIDEO_DURATION * 30; frame += 1) {
            const { ctx, trace } = mockCanvas();
            drawWrappedVideoFrame(ctx, data, options, texts, new Map(), frame / 30, timeline);
            const output = trace.drawn.join(' ');
            assert.ok(!output.includes('EVIDENCE_NEVER_DRAWN'), { options, frame });
            assert.ok(!output.includes('SECOND_EVIDENCE_NEVER_DRAWN'), { options, frame });
            if (!options.watchTime) {
                assert.ok(!output.includes('WATCH_TIME_FACT'), { options, frame });
                assert.ok(!output.includes('FAVORITE_DURATION_FACT'), { options, frame });
                assert.ok(!output.includes('TIME_LABEL'), { options, frame });
            }
            if (!options.titleCount) {
                assert.ok(!output.includes('TITLE_COUNT_FACT'), { options, frame });
                assert.ok(!output.includes('TITLE_LABEL'), { options, frame });
            }
            if (!options.favorite) {
                assert.ok(!output.includes('FAVORITE_FACT'), { options, frame });
                assert.ok(!output.includes('FAVORITE_LABEL'), { options, frame });
            }
            if (!options.portrait) {
                assert.ok(!output.includes('PERSONA_FACT'), { options, frame });
                assert.ok(!output.includes('TRAIT_ONE'), { options, frame });
                assert.ok(!output.includes('TRAIT_TWO'), { options, frame });
                assert.ok(!output.includes('PORTRAIT_LABEL'), { options, frame });
            }
        }
    }
});

test('les raccords conservent un temps local continu de part et d’autre du bord', () => {
    const timeline = buildWrappedVideoTimeline(DEFAULT_WRAPPED_VIDEO_OPTIONS);
    for (const boundary of timeline.slice(1)) {
        const before = mockCanvas();
        const after = mockCanvas();
        drawWrappedVideoFrame(before.ctx, data, DEFAULT_WRAPPED_VIDEO_OPTIONS, texts, new Map(), boundary.start - 0.0001, timeline);
        drawWrappedVideoFrame(after.ctx, data, DEFAULT_WRAPPED_VIDEO_OPTIONS, texts, new Map(), boundary.start + 0.0001, timeline);
        assert.deepEqual(after.trace.operations.map(operation => operation.name), before.trace.operations.map(operation => operation.name));
        before.trace.operations.forEach((operation, index) => {
            operation.values.forEach((value, valueIndex) => {
                const delta = Math.abs(value - after.trace.operations[index].values[valueIndex]);
                assert.ok(delta < 1, `saut de ${delta} au raccord ${boundary.scene} (${operation.name})`);
            });
        });
    }
});

test('les titres très longs restent bornés sans interrompre le rendu', () => {
    const longData = {
        ...data,
        persona: 'Le cinéphile qui traverse les époques, les genres et les nuits sans jamais perdre le fil de son année',
        items: [{ ...data.items[0], title: 'L’extraordinaire chronique cinématographique des voyageurs de la constellation aux cent vingt-sept étoiles' }],
    };
    for (const options of optionCombinations()) {
        const timeline = buildWrappedVideoTimeline(options);
        for (const beat of timeline) {
            const { ctx } = mockCanvas();
            assert.doesNotThrow(() => drawWrappedVideoFrame(ctx, longData, options, texts, new Map(), (beat.start + beat.end) / 2, timeline));
        }
    }
});
