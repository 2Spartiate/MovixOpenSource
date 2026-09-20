const STORY_MEDIA_TYPES = new Set(['movie', 'tv', 'anime']);

const number = (value) => Math.max(0, Number(value) || 0);
const keyFor = (row) => `${row.content_type || row.type}:${row.content_id ?? row.tmdbId}`;

function includedMonths(year, now = new Date()) {
    const currentYear = now.getUTCFullYear();
    return Array.from({ length: year === currentYear ? now.getUTCMonth() + 1 : 12 }, (_, index) => index + 1);
}

function buildRace(annualRows, monthlyRows, year, now) {
    const items = [...annualRows]
        .sort((a, b) => number(b.seconds) - number(a.seconds) || String(a.content_type).localeCompare(String(b.content_type)) || String(a.content_id).localeCompare(String(b.content_id)))
        .slice(0, 5)
        .map((row) => ({ ...row, duration: number(row.seconds) / 60 }));
    if (items.length === 0) return null;

    const minutesByMonth = new Map();
    for (const row of monthlyRows) {
        const month = Number(row.month);
        if (!minutesByMonth.has(month)) minutesByMonth.set(month, new Map());
        minutesByMonth.get(month).set(keyFor(row), number(row.seconds) / 60);
    }
    return {
        items,
        months: includedMonths(year, now).map((month) => {
            const values = minutesByMonth.get(month) || new Map();
            return { month, minutes: items.map((item) => values.get(keyFor(item)) || 0) };
        })
    };
}

function buildFormatWinners(rows) {
    return ['movie', 'tv', 'anime'].flatMap((type) => {
        const winner = rows
            .filter((row) => row.content_type === type)
            .sort((a, b) => number(b.seconds) - number(a.seconds) || String(a.content_id).localeCompare(String(b.content_id)))[0];
        return winner ? [{ ...winner, duration: number(winner.seconds) / 60 }] : [];
    });
}

function monthChoice(rows) {
    const media = rows.filter((row) => STORY_MEDIA_TYPES.has(row.content_type));
    const total = media.reduce((sum, row) => sum + number(row.seconds), 0);
    if (!total) return null;
    const withGenres = media.filter((row) => Array.isArray(row.genres) && row.genres.length > 0);
    const covered = withGenres.reduce((sum, row) => sum + number(row.seconds), 0);
    const coverage = (covered / total) * 100;
    const genres = new Map();
    for (const row of withGenres) for (const genre of row.genres) genres.set(genre, (genres.get(genre) || 0) + number(row.seconds));
    const genre = [...genres.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (genre && coverage >= 70 && genre[1] / total >= 0.4) {
        const title = withGenres.filter((row) => row.genres.includes(genre[0]))
            .sort((a, b) => number(b.seconds) - number(a.seconds) || String(a.content_id).localeCompare(String(b.content_id)))[0];
        return { kind: 'genre', label: genre[0], share: (genre[1] / total) * 100, coverage, seconds: total, labelSeconds: genre[1], title };
    }
    const format = [...new Map([...STORY_MEDIA_TYPES].map((type) => [type, media.filter((row) => row.content_type === type).reduce((sum, row) => sum + number(row.seconds), 0)]))]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (format && format[1] / total >= 0.6) {
        const title = media.filter((row) => row.content_type === format[0])
            .sort((a, b) => number(b.seconds) - number(a.seconds) || String(a.content_id).localeCompare(String(b.content_id)))[0];
        return { kind: 'format', label: format[0], share: (format[1] / total) * 100, coverage: 100, seconds: total, labelSeconds: format[1], title };
    }
    return null;
}

function buildEras(monthlyRows, year, now) {
    const rowsByMonth = new Map();
    for (const row of monthlyRows) {
        const month = Number(row.month);
        if (!rowsByMonth.has(month)) rowsByMonth.set(month, []);
        rowsByMonth.get(month).push(row);
    }
    const runs = [];
    for (const month of includedMonths(year, now)) {
        const choice = monthChoice(rowsByMonth.get(month) || []);
        const prior = runs[runs.length - 1];
        if (choice && prior && prior.toMonth === month - 1 && prior.kind === choice.kind && prior.label === choice.label) {
            prior.toMonth = month;
            prior.seconds += choice.seconds;
            prior.labelSeconds += choice.labelSeconds;
            prior.coveredSeconds += choice.coverage / 100 * choice.seconds;
            if (number(choice.title.seconds) > number(prior.title.seconds)) prior.title = choice.title;
        } else if (choice) {
            runs.push({ ...choice, fromMonth: month, toMonth: month, coveredSeconds: choice.coverage / 100 * choice.seconds });
        }
    }
    const usedLabels = new Set();
    return runs.sort((a, b) => b.seconds - a.seconds || a.fromMonth - b.fromMonth).flatMap((run) => {
        const identity = `${run.kind}:${run.label}`;
        if (usedLabels.has(identity) || usedLabels.size >= 3) return [];
        usedLabels.add(identity);
        return [{
            fromMonth: run.fromMonth,
            toMonth: run.toMonth,
            kind: run.kind,
            label: run.label,
            share: Math.round((run.labelSeconds / run.seconds) * 100),
            coverage: Math.round((run.coveredSeconds / run.seconds) * 100),
            title: { ...run.title, duration: number(run.title.seconds) / 60 }
        }];
    });
}

module.exports = { buildRace, buildFormatWinners, buildEras, includedMonths };
